from __future__ import annotations

from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, Query

from src.api.schemas import MarketIntelligenceResponse, MarketSymbolResponse
from src.auth.dependencies import get_current_user
from src.db.models import User
from src.services.market_context_service import build_market_context
from src.services.market_data_service import DEFAULT_VN_SYMBOLS, get_vn_index_quote, get_vn_stock_quotes

router = APIRouter(prefix="/market", tags=["market"])
log = structlog.get_logger(__name__)


@router.get("/vn-stocks", response_model=list[MarketSymbolResponse])
async def vn_stocks(
    symbols: str | None = Query(default=None),
    group: str = Query(default="all", pattern="^(all|vn30|bank|securities|real_estate|retail|steel)$"),
    sort: str = Query(
        default="percent_desc",
        pattern="^(symbol_desc|symbol_asc|change_desc|change_asc|percent_desc|percent_asc|price_desc|price_asc)$",
    ),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[MarketSymbolResponse]:
    requested = _parse_symbols(symbols) if symbols else None
    try:
        quotes = await get_vn_stock_quotes(requested, group=group, sort=sort, limit=limit)
    except Exception as exc:
        log.exception("market.vn_stocks.failed", symbols=requested, error=str(exc))
        fallback_symbols = requested or DEFAULT_VN_SYMBOLS
        quotes = [_unavailable_symbol(symbol, "Nguồn dữ liệu thị trường Việt Nam đang lỗi.") for symbol in fallback_symbols]
    return [MarketSymbolResponse.model_validate(item) for item in quotes]


@router.get("/vn-index", response_model=MarketSymbolResponse)
async def vn_index() -> MarketSymbolResponse:
    try:
        quote = await get_vn_index_quote()
    except Exception as exc:
        log.exception("market.vn_index.failed", error=str(exc))
        quote = _unavailable_symbol("VNINDEX", "Nguồn dữ liệu VNINDEX đang lỗi.")
    return MarketSymbolResponse.model_validate(quote)


@router.get("/overview", response_model=MarketIntelligenceResponse)
async def market_overview(
    current_user: User = Depends(get_current_user),
) -> MarketIntelligenceResponse:
    del current_user
    try:
        quote_result = await get_vn_stock_quotes(DEFAULT_VN_SYMBOLS)
    except Exception as exc:
        log.exception("market.overview.quotes_failed", error=str(exc))
        quote_result = [
            _unavailable_symbol(symbol, "Không lấy được dữ liệu thị trường Việt Nam.")
            for symbol in DEFAULT_VN_SYMBOLS
        ]

    symbols = [MarketSymbolResponse.model_validate(item) for item in quote_result]
    market_context = await build_market_context(symbols)
    return MarketIntelligenceResponse(
        updated_at=datetime.utcnow(),
        symbols=symbols,
        market_context=market_context,
    )


def _parse_symbols(value: str | None) -> list[str]:
    if not value:
        return DEFAULT_VN_SYMBOLS
    symbols = [item.strip().upper() for item in value.split(",") if item.strip()]
    return symbols or DEFAULT_VN_SYMBOLS


def _unavailable_symbol(symbol: str, error: str) -> dict:
    return {
        "symbol": symbol,
        "name": symbol,
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
