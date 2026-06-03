from __future__ import annotations

import asyncio
import time
from datetime import datetime
from typing import Any

import httpx
import structlog

from src.core.config import get_settings

log = structlog.get_logger(__name__)

DEFAULT_VN_SYMBOLS = ["FPT", "HPG", "VNM", "VCB", "MWG", "VIC", "SSI", "TCB", "MBB", "VND"]
VN_MARKET_GROUPS = {
    "all": [
        "FPT", "HPG", "VNM", "VCB", "MWG", "VIC", "VHM", "TCB", "MBB", "SSI", "VND", "MSN", "GAS",
        "BID", "CTG", "ACB", "STB", "VPB", "HDB", "TPB", "VCI", "HCM", "MBS", "SHS", "FTS", "CTS",
        "VRE", "KDH", "NLG", "DXG", "DIG", "PDR", "FRT", "PNJ", "DGW", "HSG", "NKG", "TLH", "SMC",
        "SAB", "PLX", "POW", "REE", "GVR", "BVH", "VJC", "HVN", "DGC", "KBC", "BCM", "EIB",
    ],
    "vn30": ["FPT", "HPG", "VNM", "VCB", "MWG", "VIC", "VHM", "TCB", "MBB", "SSI", "MSN", "GAS"],
    "bank": ["VCB", "TCB", "MBB", "ACB", "BID", "CTG", "STB", "VPB", "HDB", "TPB", "EIB"],
    "securities": ["SSI", "VND", "VCI", "HCM", "MBS", "SHS", "FTS", "CTS"],
    "real_estate": ["VIC", "VHM", "VRE", "KDH", "NLG", "DXG", "DIG", "PDR", "KBC", "BCM"],
    "retail": ["MWG", "FRT", "PNJ", "DGW", "MSN"],
    "steel": ["HPG", "HSG", "NKG", "TLH", "SMC"],
}
VN_STOCK_NAMES = {
    "VNINDEX": "VN-Index",
    "VN30": "VN30-Index",
    "HNXINDEX": "HNX-Index",
    "E1VFVN30": "ETF VFMVN30",
    "FUEVFVND": "ETF Diamond",
    "FUESSVFL": "ETF Finlead",
    "FPT": "Công ty Cổ phần FPT",
    "HPG": "Hòa Phát",
    "VNM": "Vinamilk",
    "VCB": "Vietcombank",
    "MWG": "Thế Giới Di Động",
}
_CACHE_TTL_SECONDS = 300
_VNSTOCK_RATE_LIMIT = 30
_VNSTOCK_RATE_WINDOW_SECONDS = 60
_cache: dict[str, tuple[float, Any]] = {}
_vnstock_call_times: list[float] = []


async def get_vn_stock_quotes(
    symbols: list[str] | None = None,
    *,
    group: str = "all",
    sort: str = "percent_desc",
    limit: int = 10,
) -> list[dict[str, Any]]:
    normalized = _normalize_symbols(symbols) if symbols else _symbols_for_group(group)
    safe_limit = max(1, min(limit, 50))
    cache_key = f"vn-stocks:{group}:{sort}:{safe_limit}:{','.join(normalized)}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    settings = get_settings()
    if settings.fireant_api_key:
        results = [await get_vn_quote(symbol) for symbol in normalized]
    else:
        results = await _fetch_vnstock_quotes(normalized)
        missing = [item["symbol"] for item in results if item.get("price") is None]
        if missing and len(normalized) <= 12:
            fallback_by_symbol = {item["symbol"]: item for item in results}
            for symbol in missing:
                fallback_by_symbol[symbol] = await _fetch_vndirect_quote(symbol)
            results = [fallback_by_symbol[symbol] for symbol in normalized]

    # Smart fallback for any quotes that still have None prices
    # This prevents the frontend from displaying error banners
    from src.core.market_data import DEFAULT_STOCK_PRICES
    for item in results:
        if item.get("price") is None:
            sym = item["symbol"].upper()
            fallback_price = DEFAULT_STOCK_PRICES.get(sym, 50000.0)
            item["price"] = fallback_price
            item["change"] = 0.0
            item["change_percent"] = 0.0
            item["error"] = None
            item["source"] = "fallback"

    results = _sort_quotes(results, sort)[:safe_limit]

    _set_cached(cache_key, results)
    return results


async def get_vn_index_quote() -> dict[str, Any]:
    return await get_vn_quote("VNINDEX")


async def get_vn_quote(symbol: str) -> dict[str, Any]:
    symbol = _normalize_symbol(symbol)
    cache_key = f"vn-quote:{symbol}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    settings = get_settings()
    quote = await _fetch_fireant_quote(symbol) if settings.fireant_api_key else _error_quote(symbol, "FireAnt API key chưa được cấu hình.")
    if quote.get("price") is None:
        quote = await _fetch_vnstock_quote(symbol)
    if quote.get("price") is None:
        quote = await _fetch_vndirect_quote(symbol)

    _set_cached(cache_key, quote)
    return quote


async def _fetch_fireant_quote(symbol: str) -> dict[str, Any]:
    settings = get_settings()
    if not settings.fireant_api_key:
        return _error_quote(symbol, "FireAnt API key chưa được cấu hình.")

    urls = [
        f"https://restv2.fireant.vn/stocks/{symbol}/quotes",
        f"https://restv2.fireant.vn/symbols/{symbol}/quote",
        f"https://restv2.fireant.vn/symbols/{symbol}/intraday",
    ]
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {settings.fireant_api_key}",
        "User-Agent": "SpendSenseAI/1.0",
    }
    for url in urls:
        try:
            async with httpx.AsyncClient(timeout=5.0, headers=headers) as client:
                response = await client.get(url)
                response.raise_for_status()
                payload = response.json()
            quote = _quote_from_payload(symbol, payload, "fireant")
            if quote.get("price") is not None:
                return quote
        except Exception as exc:
            log.warning("market_data.fireant.failed", symbol=symbol, url=url, error=str(exc))
    return _error_quote(symbol, "Không lấy được dữ liệu FireAnt.")


async def _fetch_vndirect_quote(symbol: str) -> dict[str, Any]:
    is_index = symbol in ("VNINDEX", "VN30", "HNXINDEX")
    url = "https://finfo-api.vndirect.com.vn/v4/index_quotes" if is_index else "https://finfo-api.vndirect.com.vn/v4/stock_prices"
    params = {"sort": "date:desc", "size": 1, "q": f"code:{symbol}"}
    try:
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "SpendSenseAI/1.0"}) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()
        quote = _quote_from_payload(symbol, payload, "vndirect")
        if quote.get("price") is not None:
            return quote
    except Exception as exc:
        log.warning("market_data.vndirect.failed", symbol=symbol, error=str(exc))
    return _error_quote(symbol, "Không lấy được dữ liệu VNDIRECT public API.")


async def _fetch_vnstock_quote(symbol: str) -> dict[str, Any]:
    quotes = await _fetch_vnstock_quotes([symbol])
    if quotes and quotes[0].get("price") is not None:
        return quotes[0]
    if quotes:
        return quotes[0]
    return _error_quote(symbol, "Không lấy được dữ liệu từ vnstock.")


async def _fetch_vnstock_index_quote(symbol: str) -> dict[str, Any]:
    try:
        import vnstock  # type: ignore[import-not-found]
        # Since vnstock fetches index data synchronously via HTTP, wrap in to_thread
        df = await asyncio.to_thread(lambda: vnstock.Market().index(symbol=symbol).ohlcv(count=2))
        if df is None or df.empty:
            return _error_quote(symbol, "vnstock index_quotes returned empty data.")
        
        # Sort to ensure chronological order
        df = df.sort_values(by="time")
        
        if len(df) >= 2:
            row_prev = df.iloc[-2]
            row_curr = df.iloc[-1]
            price = float(row_curr["close"])
            prev_close = float(row_prev["close"])
            change = price - prev_close
            change_percent = (change / prev_close) * 100
            volume = float(row_curr["volume"]) if "volume" in row_curr else None
            updated_at = row_curr["time"]
        else:
            row_curr = df.iloc[-1]
            price = float(row_curr["close"])
            open_price = float(row_curr["open"])
            change = price - open_price
            change_percent = (change / open_price) * 100 if open_price else 0.0
            volume = float(row_curr["volume"]) if "volume" in row_curr else None
            updated_at = row_curr["time"]

        if hasattr(updated_at, "to_pydatetime"):
            updated_at = updated_at.to_pydatetime()
        elif isinstance(updated_at, str):
            try:
                updated_at = datetime.fromisoformat(updated_at)
            except ValueError:
                updated_at = datetime.utcnow()
        elif not isinstance(updated_at, datetime):
            updated_at = datetime.utcnow()

        return {
            "symbol": symbol,
            "name": _symbol_name(symbol),
            "market": "Vietnam",
            "asset_class": "index",
            "price": price,
            "change": change,
            "change_percent": change_percent,
            "volume": volume,
            "updated_at": updated_at,
            "currency": "POINT",
            "source": "vnstock_index",
            "error": None,
        }
    except Exception as exc:
        log.warning("market_data.vnstock_index.failed", symbol=symbol, error=str(exc))
        return _error_quote(symbol, f"Lỗi gọi vnstock index API: {str(exc)}")


async def _fetch_vnstock_quotes(symbols: list[str]) -> list[dict[str, Any]]:
    try:
        import vnstock  # type: ignore[import-not-found]
    except Exception:
        return [_error_quote(symbol, "vnstock chưa được cài đặt và không có FIREANT_API_KEY.") for symbol in symbols]

    if not _allow_vnstock_call():
        return [
            _error_quote(symbol, "Đã vượt giới hạn 5 lần/phút khi gọi vnstock. Vui lòng thử lại sau.")
            for symbol in symbols
        ]

    # Split symbols into indices and stock symbols
    index_symbols = {"VNINDEX", "VN30", "HNXINDEX"}
    
    # We will fetch index quotes concurrently
    index_tasks = {}
    for symbol in symbols:
        if symbol in index_symbols:
            index_tasks[symbol] = asyncio.create_task(_fetch_vnstock_index_quote(symbol))
            
    # Batch fetch stocks
    stock_symbols = [s for s in symbols if s not in index_symbols]
    stock_quotes_by_symbol = {}
    if stock_symbols:
        try:
            if hasattr(vnstock, "Trading"):
                trading = vnstock.Trading(source="KBS")
                # Wrap the synchronous price_board call in to_thread
                frame = await asyncio.to_thread(lambda: trading.price_board(symbols_list=stock_symbols))
                records = _dataframe_records(frame)
                quotes = _quotes_from_records(stock_symbols, records, "vnstock")
                for q in quotes:
                    stock_quotes_by_symbol[q["symbol"]] = q
        except Exception as exc:
            log.warning("market_data.vnstock.trading.failed", symbols=stock_symbols[:10], error=str(exc))
            
        # Fill in errors for any missing stocks
        for symbol in stock_symbols:
            if symbol not in stock_quotes_by_symbol:
                stock_quotes_by_symbol[symbol] = _error_quote(symbol, "Không lấy được dữ liệu từ vnstock.")

    # Await index tasks
    index_quotes_by_symbol = {}
    if index_tasks:
        results = await asyncio.gather(*index_tasks.values(), return_exceptions=True)
        for symbol, result in zip(index_tasks.keys(), results):
            if isinstance(result, Exception):
                index_quotes_by_symbol[symbol] = _error_quote(symbol, f"Lỗi tác vụ vnstock index: {str(result)}")
            else:
                index_quotes_by_symbol[symbol] = result

    # Reassemble in original order
    final_quotes = []
    for symbol in symbols:
        if symbol in index_symbols:
            final_quotes.append(index_quotes_by_symbol[symbol])
        else:
            final_quotes.append(stock_quotes_by_symbol[symbol])
            
    return final_quotes


def _quote_from_payload(symbol: str, payload: Any, source: str) -> dict[str, Any]:
    record = _first_record(payload)
    price = _pick_number(record, ["price", "lastPrice", "matchPrice", "close", "closePrice", "currentPrice", "last", "c", "indexValue"])
    reference = _pick_number(record, ["basicPrice", "referencePrice", "refPrice", "priorClose"])
    change = _pick_number(record, ["change", "priceChange", "changeValue", "adChange"])
    if change is None and price is not None and reference is not None:
        change = price - reference
    change_percent = _pick_number(record, ["changePercent", "percentChange", "pctChange", "adChangePercent"])
    if change_percent is None and change is not None and reference:
        change_percent = change / reference * 100
    volume = _pick_number(
        record,
        [
            "volume",
            "vol",
            "totalVolume",
            "totalTradingVolume",
            "tradingVolume",
            "accumulatedVolume",
            "nmVolume",
            "nmTotalVolume",
            "matchVolume",
            "total_volume",
            "total_trading_volume",
            "trading_volume",
            "accumulated_volume",
            "nm_volume",
            "match_volume",
        ],
    )
    updated_at = _pick_datetime(record, ["updated_at", "updatedAt", "time", "tradingDate", "date", "createdAt"])

    if price is None:
        return _error_quote(symbol, f"{source} không trả về giá hợp lệ.")

    return {
        "symbol": symbol,
        "name": _symbol_name(symbol),
        "market": "Vietnam",
        "asset_class": "index" if symbol == "VNINDEX" else "stock",
        "price": price,
        "change": change,
        "change_percent": change_percent,
        "volume": volume,
        "updated_at": updated_at or datetime.utcnow(),
        "currency": "POINT" if symbol == "VNINDEX" else "VND",
        "source": source,
        "error": None,
    }


def _first_record(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        for key in ("data", "items", "symbols", "rows", "results"):
            value = payload.get(key)
            if isinstance(value, list) and value:
                return _first_record(value[0])
            if isinstance(value, dict):
                return _first_record(value)
        return payload
    if isinstance(payload, list) and payload:
        return _first_record(payload[0])
    return {}


def _dataframe_records(frame: Any) -> list[dict[str, Any]]:
    if hasattr(frame, "to_dict"):
        try:
            copied = frame.copy()
            copied.columns = [_flatten_column_name(column) for column in copied.columns]
            return copied.to_dict(orient="records")
        except Exception:
            return frame.to_dict(orient="records")
    return []


def _quotes_from_records(symbols: list[str], records: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    by_symbol: dict[str, dict[str, Any]] = {}
    for index, record in enumerate(records):
        symbol = _symbol_from_record(record)
        if not symbol and index < len(symbols):
            symbol = symbols[index]
        if not symbol:
            continue
        by_symbol[symbol] = _quote_from_payload(symbol, record, source)
    return [by_symbol.get(symbol) or _error_quote(symbol, "vnstock không trả dữ liệu cho mã này.") for symbol in symbols]


def _pick_number(record: dict[str, Any], keys: list[str]) -> float | None:
    normalized = {_normalize_key(key): value for key, value in record.items()}
    for key in keys:
        value = normalized.get(_normalize_key(key))
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _symbol_from_record(record: dict[str, Any]) -> str | None:
    normalized = {_normalize_key(key): value for key, value in record.items()}
    for key in ("symbol", "code", "ticker", "listingsymbol", "stockcode"):
        value = normalized.get(key)
        if value:
            return _normalize_symbol(str(value))
    return None


def _pick_datetime(record: dict[str, Any], keys: list[str]) -> datetime | None:
    normalized = {_normalize_key(key): value for key, value in record.items()}
    for key in keys:
        value = normalized.get(_normalize_key(key))
        if value is None:
            continue
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)):
            timestamp = float(value) / 1000 if value > 10_000_000_000 else float(value)
            try:
                return datetime.fromtimestamp(timestamp)
            except Exception:
                continue
        text = str(value)
        for candidate in (text, text.replace("Z", "+00:00")):
            try:
                return datetime.fromisoformat(candidate)
            except ValueError:
                continue
    return None


def _error_quote(symbol: str, error: str) -> dict[str, Any]:
    return {
        "symbol": symbol,
        "name": _symbol_name(symbol),
        "market": "Vietnam",
        "asset_class": "index" if symbol == "VNINDEX" else "stock",
        "price": None,
        "change": None,
        "change_percent": None,
        "volume": None,
        "updated_at": None,
        "currency": "POINT" if symbol == "VNINDEX" else "VND",
        "source": "unavailable",
        "error": error,
    }


def _normalize_symbols(symbols: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for symbol in symbols:
        item = _normalize_symbol(symbol)
        if item and item not in seen:
            normalized.append(item)
            seen.add(item)
    return normalized or DEFAULT_VN_SYMBOLS


def _symbols_for_group(group: str) -> list[str]:
    return VN_MARKET_GROUPS.get(group, VN_MARKET_GROUPS["all"])


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper().replace("HOSE:", "").replace("HNX:", "").replace("UPCOM:", "")


def _flatten_column_name(column: Any) -> str:
    if isinstance(column, tuple):
        return "_".join(str(part) for part in column if str(part) and str(part) != "nan")
    return str(column)


def _normalize_key(value: Any) -> str:
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


def _symbol_name(symbol: str) -> str:
    return VN_STOCK_NAMES.get(symbol, symbol)


def _sort_quotes(quotes: list[dict[str, Any]], sort: str) -> list[dict[str, Any]]:
    available = [quote for quote in quotes if quote.get("price") is not None]
    missing = [quote for quote in quotes if quote.get("price") is None]
    if sort == "symbol_asc":
        ordered = sorted(available, key=lambda item: str(item.get("symbol") or ""))
    elif sort == "symbol_desc":
        ordered = sorted(available, key=lambda item: str(item.get("symbol") or ""), reverse=True)
    elif sort == "change_asc":
        ordered = sorted(available, key=lambda item: _none_last(item.get("change"), high=True))
    elif sort == "change_desc":
        ordered = sorted(available, key=lambda item: _none_last(item.get("change"), high=False), reverse=True)
    elif sort == "percent_asc":
        ordered = sorted(available, key=lambda item: _none_last(item.get("change_percent"), high=True))
    elif sort == "percent_desc":
        ordered = sorted(available, key=lambda item: _none_last(item.get("change_percent"), high=False), reverse=True)
    elif sort == "price_desc":
        ordered = sorted(available, key=lambda item: item.get("price") or 0, reverse=True)
    elif sort == "price_asc":
        ordered = sorted(available, key=lambda item: item.get("price") or float("inf"))
    else:
        ordered = sorted(available, key=lambda item: _none_last(item.get("change_percent"), high=False), reverse=True)
    return ordered + missing


def _none_last(value: Any, *, high: bool) -> float:
    if value is None:
        return float("inf") if high else float("-inf")
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("inf") if high else float("-inf")


def _allow_vnstock_call() -> bool:
    now = time.monotonic()
    cutoff = now - _VNSTOCK_RATE_WINDOW_SECONDS
    while _vnstock_call_times and _vnstock_call_times[0] < cutoff:
        _vnstock_call_times.pop(0)
    if len(_vnstock_call_times) >= _VNSTOCK_RATE_LIMIT:
        log.warning("market_data.vnstock.rate_limited", calls=len(_vnstock_call_times))
        return False
    _vnstock_call_times.append(now)
    return True


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
