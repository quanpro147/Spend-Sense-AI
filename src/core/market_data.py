import httpx
import structlog
from typing import Any

log = structlog.get_logger()

# Standard fallbacks for stock prices (VND)
DEFAULT_STOCK_PRICES = {
    "FPT": 135000.0,
    "VNM": 68000.0,
    "TCB": 35000.0,
    "HPG": 28000.0,
    "VCB": 92000.0,
    "ACB": 25000.0,
    "SSI": 35000.0,
    "VND": 20000.0,
    "MWG": 60000.0,
    "VIC": 45000.0,
}

# Standard fallbacks for crypto prices (USD)
DEFAULT_CRYPTO_PRICES_USD = {
    "BTC": 67000.0,
    "ETH": 3500.0,
    "BNB": 580.0,
    "SOL": 160.0,
    "USDT": 1.0,
}

# Exchange rate USD/VND
USD_VND_RATE = 25400.0
DEFAULT_GOLD_PRICE_VND = 85000000.0  # 1 tael (lượng) of SJC gold


def get_market_price_details(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """
    Best-effort market prices with source metadata.

    This keeps AI/UI from treating static fallback prices as live data.
    """
    results: dict[str, dict[str, Any]] = {}
    stock_symbols: list[str] = []

    for raw_sym in symbols:
        sym = raw_sym.strip().upper()
        if not sym:
            continue
        if sym in ("VNINDEX", "VN30", "HNXINDEX"):
            results[raw_sym] = {"price": None, "source": "display_only"}
        elif sym in ("GOLD", "SJC"):
            price, source = fetch_gold_price_vnd_with_source()
            results[raw_sym] = {"price": price, "source": source}
        elif sym in DEFAULT_CRYPTO_PRICES_USD or sym.endswith("USDT"):
            clean_crypto = sym.replace("USDT", "") if sym.endswith("USDT") else sym
            price_usd, source = fetch_crypto_price_usd_with_source(clean_crypto)
            results[raw_sym] = {"price": price_usd * USD_VND_RATE if price_usd else None, "source": source}
        else:
            stock_symbols.append(raw_sym)

    if stock_symbols:
        results.update(fetch_stock_price_details(stock_symbols))

    return results


def fetch_stock_prices(symbols: list[str]) -> dict[str, float]:
    """Fetch stock prices in VND from vnstock (KBS source)."""
    if not symbols:
        return {}
    
    prices = {}
    try:
        import vnstock
        # Clean symbols
        clean_symbols = [s.strip().upper() for s in symbols if s.strip()]
        if not clean_symbols:
            return {}
            
        trading = vnstock.Trading(source='kbs')
        df = trading.price_board(symbols_list=clean_symbols)
        
        # Parse the dataframe to dict
        if df is not None and not df.empty:
            # check if dataframe has symbol and close_price columns
            records = df.to_dict(orient='records')
            for row in records:
                sym = str(row.get("symbol", "")).upper()
                price = row.get("close_price") or row.get("reference_price") or row.get("open_price")
                if price is not None:
                    # Convert to float and store
                    prices[sym] = float(price)
                    
        # Fill in any missing symbols from fallback
        for s in clean_symbols:
            if s not in prices:
                prices[s] = DEFAULT_STOCK_PRICES.get(s, 50000.0)
                
    except Exception as exc:
        log.warning("market_data.fetch_stocks.failed", error=str(exc))
        # Fallback to local catalog
        for s in symbols:
            prices[s.upper()] = DEFAULT_STOCK_PRICES.get(s.upper(), 50000.0)
            
    return prices


def fetch_stock_price_details(symbols: list[str]) -> dict[str, dict[str, Any]]:
    if not symbols:
        return {}
    prices: dict[str, dict[str, Any]] = {}
    try:
        import vnstock

        clean_symbols = [s.strip().upper() for s in symbols if s.strip()]
        if not clean_symbols:
            return {}

        trading = vnstock.Trading(source='kbs')
        df = trading.price_board(symbols_list=clean_symbols)

        if df is not None and not df.empty:
            records = df.to_dict(orient='records')
            for row in records:
                sym = str(row.get("symbol", "")).upper()
                price = row.get("close_price") or row.get("reference_price") or row.get("open_price")
                if price is not None:
                    prices[sym] = {"price": float(price), "source": "vnstock"}

        for s in clean_symbols:
            if s not in prices:
                fallback = DEFAULT_STOCK_PRICES.get(s)
                prices[s] = {"price": fallback, "source": "fallback" if fallback is not None else "unavailable"}

    except Exception as exc:
        log.warning("market_data.fetch_stock_details.failed", error=str(exc))
        for s in symbols:
            sym = s.upper()
            fallback = DEFAULT_STOCK_PRICES.get(sym)
            prices[sym] = {"price": fallback, "source": "fallback" if fallback is not None else "unavailable"}

    return prices


def fetch_crypto_price_usd(symbol: str) -> float:
    """Fetch cryptocurrency price in USD from Binance public API."""
    symbol = symbol.strip().upper()
    try:
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}USDT"
        headers = {"User-Agent": "SpendSense/1.0"}
        response = httpx.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return float(data.get("price", 0.0))
    except Exception as exc:
        log.warning("market_data.fetch_crypto.failed", symbol=symbol, error=str(exc))
    return DEFAULT_CRYPTO_PRICES_USD.get(symbol, 0.0)


def fetch_crypto_price_usd_with_source(symbol: str) -> tuple[float, str]:
    symbol = symbol.strip().upper()
    try:
        url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}USDT"
        headers = {"User-Agent": "SpendSense/1.0"}
        response = httpx.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return float(data.get("price", 0.0)), "binance"
    except Exception as exc:
        log.warning("market_data.fetch_crypto_detail.failed", symbol=symbol, error=str(exc))
    return DEFAULT_CRYPTO_PRICES_USD.get(symbol, 0.0), "fallback"


def fetch_gold_price_vnd() -> float:
    """Fetch SJC gold price in VND. Falls back to static reference rate."""
    try:
        # SJC gold price RSS feed
        url = "https://sjc.com.vn/xml/tygia.xml"
        headers = {"User-Agent": "SpendSense/1.0"}
        response = httpx.get(url, headers=headers, timeout=5)
        if response.status_code == 200 and "<buy>" in response.text:
            # Simple XML parsing of <buy> inside <item> for SJC gold
            # Example: <item><title>SJC</title><buy>85.00</buy></item>
            # SJC XML often has buy value in millions or raw format.
            # Let's extract SJC gold price (in millions per lượng)
            import re
            text = response.text
            # Find the buy value for SJC
            match = re.search(r'<item[^>]*>.*?SJC.*?<buy>([\d\.,]+)</buy>', text, re.DOTALL | re.IGNORECASE)
            if match:
                buy_val = float(match.group(1).replace(",", ""))
                if buy_val < 1000:  # If in millions (e.g. 85.00)
                    return buy_val * 1000000
                return buy_val
    except Exception as exc:
        log.warning("market_data.fetch_gold.failed", error=str(exc))
    return DEFAULT_GOLD_PRICE_VND


def fetch_gold_price_vnd_with_source() -> tuple[float, str]:
    try:
        url = "https://sjc.com.vn/xml/tygia.xml"
        headers = {"User-Agent": "SpendSense/1.0"}
        response = httpx.get(url, headers=headers, timeout=5)
        if response.status_code == 200 and "<buy>" in response.text:
            import re
            text = response.text
            match = re.search(r'<item[^>]*>.*?SJC.*?<buy>([\d\.,]+)</buy>', text, re.DOTALL | re.IGNORECASE)
            if match:
                buy_val = float(match.group(1).replace(",", ""))
                if buy_val < 1000:
                    return buy_val * 1000000, "sjc"
                return buy_val, "sjc"
    except Exception as exc:
        log.warning("market_data.fetch_gold_detail.failed", error=str(exc))
    return DEFAULT_GOLD_PRICE_VND, "fallback"


def get_market_prices(symbols: list[str]) -> dict[str, float]:
    """
    Get current market prices in VND for a list of mixed asset symbols.
    Supports stocks, 'GOLD' (SJC gold), and cryptos ('BTC', 'ETH', etc.).
    """
    results = {}
    stock_symbols = []
    
    # Classify symbols
    for raw_sym in symbols:
        sym = raw_sym.strip().upper()
        if not sym:
            continue
            
        if sym in ("GOLD", "SJC"):
            results[raw_sym] = fetch_gold_price_vnd()
        elif sym in DEFAULT_CRYPTO_PRICES_USD or sym.endswith("USDT"):
            clean_crypto = sym.replace("USDT", "") if sym.endswith("USDT") else sym
            price_usd = fetch_crypto_price_usd(clean_crypto)
            # Convert to VND
            results[raw_sym] = price_usd * USD_VND_RATE
        else:
            stock_symbols.append(raw_sym)
            
    # Fetch all stocks in one batch
    if stock_symbols:
        stock_prices = fetch_stock_prices(stock_symbols)
        results.update(stock_prices)
        
    return results
