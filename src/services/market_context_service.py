from __future__ import annotations

import html
import asyncio
import csv
import io
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
import structlog

log = structlog.get_logger(__name__)

_CACHE_TTL_SECONDS = 180
_cache: dict[str, tuple[float, Any]] = {}

_COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "BNB": "binancecoin",
    "SOL": "solana",
    "XRP": "ripple",
    "USDT": "tether",
}

_STOOQ_SYMBOLS = {
    "S&P 500": "^spx",
    "NASDAQ": "^ndq",
    "DOW JONES": "^dji",
    "GOLD": "xauusd",
    "USD INDEX": "dx.f",
}

_VIETSTOCK_FEEDS = {
    "co_phieu": "https://vietstock.vn/830/chung-khoan/co-phieu.rss",
    "vi_mo": "https://vietstock.vn/761/kinh-te/vi-mo.rss",
    "the_gioi": "https://vietstock.vn/773/the-gioi/chung-khoan-the-gioi.rss",
    "crypto": "https://vietstock.vn/4309/the-gioi/tien-ky-thuat-so.rss",
}


async def build_market_context(vietnam_symbols: list[Any]) -> dict[str, Any]:
    cached = _get_cached("market-context")
    if cached is not None:
        context = dict(cached)
        context["vietnam_market"] = _build_vietnam_market(vietnam_symbols)
        context["source_quality"] = _source_quality(context)
        return context

    crypto_market, global_market, news = await asyncio.gather(
        _fetch_crypto_market(),
        _fetch_global_market(),
        _fetch_vietstock_news(),
    )
    context = {
        "as_of": datetime.utcnow().isoformat(),
        "vietnam_market": _build_vietnam_market(vietnam_symbols),
        "crypto_market": crypto_market,
        "global_market": global_market,
        "news": news,
    }
    context["source_quality"] = _source_quality(context)
    _set_cached("market-context", {
        "as_of": context["as_of"],
        "crypto_market": crypto_market,
        "global_market": global_market,
        "news": news,
    })
    return context


def _build_vietnam_market(symbols: list[Any]) -> dict[str, Any]:
    rows = [_symbol_to_dict(symbol) for symbol in symbols]
    available = [row for row in rows if row.get("price") is not None]
    gainers = [row for row in available if _as_float(row.get("change_percent")) and _as_float(row.get("change_percent")) > 0]
    losers = [row for row in available if _as_float(row.get("change_percent")) and _as_float(row.get("change_percent")) < 0]
    unchanged = len(available) - len(gainers) - len(losers)
    avg_change = (
        sum(_as_float(row.get("change_percent")) or 0 for row in available) / len(available)
        if available else None
    )
    return {
        "source": "vnstock/fireant/vndirect",
        "symbols": rows,
        "breadth": {
            "available": len(available),
            "missing": len(rows) - len(available),
            "advancing": len(gainers),
            "declining": len(losers),
            "unchanged": unchanged,
            "average_change_percent": _round(avg_change),
        },
        "top_gainers": _top_by_percent(gainers, reverse=True),
        "top_losers": _top_by_percent(losers, reverse=False),
    }


async def _fetch_crypto_market() -> dict[str, Any]:
    cached = _get_cached("crypto-market")
    if cached is not None:
        return cached

    params = {
        "ids": ",".join(_COINGECKO_IDS.values()),
        "vs_currencies": "usd",
        "include_market_cap": "true",
        "include_24hr_vol": "true",
        "include_24hr_change": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "SpendSenseAI/1.0"}) as client:
            response = await client.get("https://api.coingecko.com/api/v3/simple/price", params=params)
            response.raise_for_status()
            payload = response.json()
        majors = []
        for symbol, coin_id in _COINGECKO_IDS.items():
            item = payload.get(coin_id) or {}
            price = _as_float(item.get("usd"))
            if price is None:
                continue
            majors.append({
                "symbol": symbol,
                "name": coin_id.replace("-", " ").title(),
                "price_usd": price,
                "change_percent_24h": _round(_as_float(item.get("usd_24h_change"))),
                "market_cap_usd": _as_float(item.get("usd_market_cap")),
                "volume_24h_usd": _as_float(item.get("usd_24h_vol")),
                "source": "coingecko",
            })
        result = {
            "source": "coingecko",
            "majors": majors,
            "top_gainers": sorted(majors, key=lambda item: item.get("change_percent_24h") or -999, reverse=True)[:3],
            "top_losers": sorted(majors, key=lambda item: item.get("change_percent_24h") or 999)[:3],
            "error": None,
        }
    except Exception as exc:
        log.warning("market_context.crypto.failed", error=str(exc))
        result = {"source": "coingecko", "majors": [], "top_gainers": [], "top_losers": [], "error": str(exc)}
    _set_cached("crypto-market", result)
    return result


async def _fetch_global_market() -> dict[str, Any]:
    cached = _get_cached("global-market")
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "SpendSenseAI/1.0"}) as client:
            rows = await asyncio.gather(
                *[_fetch_one_stooq_quote(client, label, symbol) for label, symbol in _STOOQ_SYMBOLS.items()],
                return_exceptions=True,
            )
        indices = [row for row in rows if isinstance(row, dict) and row.get("price") is not None]
        errors = [str(row) for row in rows if isinstance(row, Exception)]
        result = {
            "source": "stooq_public_csv",
            "indices": indices,
            "change_basis": "change and change_percent are estimated versus the current session open from Stooq CSV.",
            "error": "; ".join(errors) if errors else None,
        }
    except Exception as exc:
        log.warning("market_context.global.failed", error=str(exc))
        result = {"source": "stooq_public_csv", "indices": [], "error": str(exc)}
    _set_cached("global-market", result)
    return result


async def _fetch_one_stooq_quote(client: httpx.AsyncClient, label: str, symbol: str) -> dict[str, Any]:
    response = await client.get(
        "https://stooq.com/q/l/",
        params={"s": symbol, "f": "sd2t2ohlcv", "h": "", "e": "csv"},
    )
    response.raise_for_status()
    reader = csv.DictReader(io.StringIO(response.text))
    row = next(reader, None) or {}
    price = _as_float(row.get("Close"))
    open_price = _as_float(row.get("Open"))
    change = price - open_price if price is not None and open_price is not None else None
    change_percent = change / open_price * 100 if change is not None and open_price else None
    return {
        "symbol": label,
        "price": price,
        "change": _round(change),
        "change_percent": _round(change_percent),
        "currency": "USD" if label == "GOLD" else "POINT",
        "as_of": _stooq_datetime(row),
        "source": "stooq_public_csv",
    }


async def _fetch_vietstock_news() -> dict[str, Any]:
    cached = _get_cached("vietstock-news")
    if cached is not None:
        return cached

    items: list[dict[str, Any]] = []
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "SpendSenseAI/1.0"}) as client:
        results = await asyncio.gather(
            *[_fetch_one_vietstock_feed(client, category, url) for category, url in _VIETSTOCK_FEEDS.items()],
            return_exceptions=True,
        )
    for result in results:
        if isinstance(result, Exception):
            errors.append(str(result))
            continue
        feed_items, error = result
        items.extend(feed_items)
        if error:
            errors.append(error)
    deduped = _dedupe_news(items)[:10]
    result = {"source": "vietstock_rss", "items": deduped, "error": "; ".join(errors) if errors else None}
    _set_cached("vietstock-news", result)
    return result


async def _fetch_one_vietstock_feed(
    client: httpx.AsyncClient,
    category: str,
    url: str,
) -> tuple[list[dict[str, Any]], str | None]:
    try:
        response = await client.get(url)
        response.raise_for_status()
        return _parse_rss_items(response.text, category)[:3], None
    except Exception as exc:
        log.warning("market_context.vietstock.failed", url=url, error=str(exc))
        return [], f"{category}: {exc}"


def _parse_rss_items(xml_text: str, category: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    items: list[dict[str, Any]] = []
    for item in root.findall(".//item"):
        title = _clean_text(item.findtext("title"))
        link = _clean_text(item.findtext("link"))
        description = _clean_text(item.findtext("description"))
        published_at = _parse_rss_date(item.findtext("pubDate"))
        if not title or not link:
            continue
        items.append({
            "category": category,
            "title": title,
            "summary": description[:240],
            "url": link,
            "published_at": published_at.isoformat() if published_at else None,
            "source": "vietstock",
        })
    return items


def _dedupe_news(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in sorted(items, key=lambda row: row.get("published_at") or "", reverse=True):
        key = item.get("url") or item.get("title") or ""
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _symbol_to_dict(symbol: Any) -> dict[str, Any]:
    if hasattr(symbol, "model_dump"):
        return symbol.model_dump(mode="json")
    if isinstance(symbol, dict):
        return symbol
    return {}


def _top_by_percent(rows: list[dict[str, Any]], *, reverse: bool) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: _as_float(row.get("change_percent")) or 0, reverse=reverse)[:5]


def _source_quality(context: dict[str, Any]) -> dict[str, Any]:
    missing: list[str] = []
    if context.get("crypto_market", {}).get("error"):
        missing.append("crypto_market")
    if context.get("global_market", {}).get("error"):
        missing.append("global_market")
    if context.get("news", {}).get("error"):
        missing.append("vietstock_news")
    vietnam = context.get("vietnam_market", {})
    if vietnam.get("breadth", {}).get("missing"):
        missing.append("vietnam_quotes_partial")
    return {
        "missing_or_partial": missing,
        "policy": "Only summarize fields present in this context. If a source is missing, say so instead of inventing market data.",
    }


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    text = html.unescape(text)
    return " ".join(text.split())


def _parse_rss_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value)
    except Exception:
        return None


def _stooq_datetime(row: dict[str, Any]) -> str | None:
    date_part = str(row.get("Date") or "")
    time_part = str(row.get("Time") or "")
    if not date_part or date_part == "N/D":
        return None
    if not time_part or time_part == "N/D":
        return date_part
    return f"{date_part}T{time_part}"


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: float | None) -> float | None:
    return round(value, 2) if value is not None else None


def _get_cached(key: str) -> Any | None:
    entry = _cache.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if expires_at <= time.monotonic():
        _cache.pop(key, None)
        return None
    return value


def _set_cached(key: str, value: Any) -> None:
    _cache[key] = (time.monotonic() + _CACHE_TTL_SECONDS, value)
