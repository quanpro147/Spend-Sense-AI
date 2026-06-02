from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.schemas import (
    InvestmentProfileRequest,
    InvestmentProfileResponse,
    InvestmentAssetRequest,
    InvestmentAssetResponse,
    StressTestResponse,
    ParseAssetRequest,
    ParseAssetResponse,
)
from src.auth.dependencies import get_current_user
from src.db.base import get_db
from src.db.models import User, InvestmentProfile, InvestmentAsset
from src.core.market_data import get_market_prices
from src.core.stress_tester import run_portfolio_stress_test
from src.llm.gemini_client import _call_gemini

router = APIRouter(prefix="/investment", tags=["investment"])


@router.get("/profile", response_model=InvestmentProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvestmentProfileResponse:
    """Retrieve or initialize the user's investment profile."""
    # Find existing profile
    stmt = select(InvestmentProfile).where(InvestmentProfile.user_id == current_user.id)
    result = await db.execute(stmt)
    profile = result.scalar_one_or_none()
    
    if not profile:
        # Initialize default profile
        profile = InvestmentProfile(
            user_id=current_user.id,
            risk_appetite="moderate",
            capital=0.0,
            goal="Tự do tài chính",
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
        
    return profile


@router.post("/profile", response_model=InvestmentProfileResponse)
async def update_profile(
    body: InvestmentProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvestmentProfileResponse:
    """Update or create the user's investment profile."""
    stmt = select(InvestmentProfile).where(InvestmentProfile.user_id == current_user.id)
    result = await db.execute(stmt)
    profile = result.scalar_one_or_none()
    
    if not profile:
        profile = InvestmentProfile(user_id=current_user.id)
        db.add(profile)
        
    profile.risk_appetite = body.risk_appetite
    profile.capital = body.capital
    profile.goal = body.goal
    
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/portfolio", response_model=list[InvestmentAssetResponse])
async def get_portfolio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[InvestmentAssetResponse]:
    """Retrieve the user's portfolio with real-time valuations."""
    stmt = select(InvestmentAsset).where(InvestmentAsset.user_id == current_user.id)
    result = await db.execute(stmt)
    assets = result.scalars().all()
    
    if not assets:
        return []
        
    # Extract unique symbols to fetch current prices
    symbols = list({a.symbol for a in assets})
    market_prices = get_market_prices(symbols)
    
    response_items = []
    for asset in assets:
        current_price = market_prices.get(asset.symbol, asset.purchase_price)
        if current_price == 0.0:
            current_price = asset.purchase_price
            
        val = asset.quantity * current_price
        invested = asset.quantity * asset.purchase_price
        profit = val - invested
        profit_pct = (profit / invested * 100) if invested > 0 else 0.0
        
        response_items.append(
            InvestmentAssetResponse(
                id=asset.id,
                user_id=asset.user_id,
                symbol=asset.symbol,
                name=asset.name,
                type=asset.type,
                quantity=asset.quantity,
                purchase_price=asset.purchase_price,
                current_price=current_price,
                value=val,
                profit=profit,
                profit_percent=profit_pct,
                color=asset.color,
                updated_at=asset.updated_at,
            )
        )
        
    return response_items


def normalize_purchase_price(symbol: str, asset_type: str, price: float) -> float:
    """
    Smart normalization to fix unit errors in user purchase prices.
    E.g., if FPT market price is ~135k VND and they entered 135 (thousands) or 135.0 (VND board),
    we automatically scale it up to 135000.
    E.g., SJC gold price is ~85M VND and they entered 10000 (meaning 10 million) or 82 (meaning 82 million),
    we scale it up to 10000000 or 82000000.
    """
    symbol = symbol.strip().upper()
    asset_type = asset_type.strip().lower()
    
    # 1. Fetch current price as a reference point
    market_prices = get_market_prices([symbol])
    current_price = market_prices.get(symbol, 0.0)
    
    if current_price <= 0.0:
        # Fallback if market data is offline or symbol is not recognized
        if asset_type == "gold":
            current_price = 85000000.0  # 85 million VND
        elif asset_type == "crypto" and symbol == "BTC":
            current_price = 1700000000.0  # 1.7 billion VND
        elif asset_type == "crypto" and symbol == "ETH":
            current_price = 90000000.0  # 90 million VND
        else:
            return price  # Cannot normalize without reference
            
    # 2. Normalize based on ratios relative to current price
    ratio = current_price / price if price > 0 else 0.0
    
    if asset_type == "gold":
        # SJC Gold is usually 80M-90M.
        # If user entered 10000 (representing 10M), ratio is ~8.5
        # If user entered 82 (representing 82M), ratio is ~1,000,000
        # If ratio is close to 10,000,000 (e.g. they typed 8.2 representing 8.2M per chỉ)
        if 5000000.0 <= ratio <= 20000000.0:
            return price * 10000000.0
        # If ratio is close to 1,000,000 (e.g. they typed 82 or 85)
        elif 500000.0 <= ratio <= 2000000.0:
            return price * 1000000.0
        # If ratio is close to 100,000 (e.g. they typed 850 representing 8.5M per chỉ, or 820 representing 8.2M)
        elif 50000.0 <= ratio <= 200000.0:
            return price * 100000.0
        # If ratio is close to 1,000 (e.g. they typed 85000 representing 85M, or 10000 representing 10M)
        elif 500.0 <= ratio <= 15000.0:
            return price * 1000.0
        # If ratio is close to 10 (e.g. they typed 8200000 representing price per chỉ in VND, but unit is lượng)
        elif 5.0 <= ratio <= 15.0:
            return price * 10.0
            
    elif asset_type == "stock":
        # VN Stocks are usually 10k to 150k.
        # If user entered 135 (thousands) instead of 135000, ratio is ~1000
        if 500.0 <= ratio <= 1500.0:
            return price * 1000.0
            
    elif asset_type == "crypto":
        # Cryptos like BTC are ~1.7 Billion VND, ETH is ~90 Million.
        # If user entered in USD (e.g. BTC is 67000, ratio is ~25400)
        # Convert USD to VND
        if 15000.0 <= ratio <= 35000.0:
            return price * 25400.0  # convert using USD/VND rate
        # If they entered BTC in millions (e.g. 1700 representing 1.7B, ratio is ~1,000,000)
        elif 500000.0 <= ratio <= 2000000.0:
            return price * 1000000.0
        # If they entered in thousands (e.g. 1700000 representing 1.7B, ratio is ~1000)
        elif 500.0 <= ratio <= 15000.0:
            return price * 1000.0
            
    return price


@router.post("/portfolio", response_model=InvestmentAssetResponse)
async def add_portfolio_asset(
    body: InvestmentAssetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvestmentAssetResponse:
    """Add a new asset holding to the portfolio."""
    # To keep simple, we allow adding duplicate symbols (representing separate purchases)
    # or just creating new entries.
    
    # Auto-normalize purchase price unit to prevent scaling confusion (e.g., entering 135 instead of 135000)
    normalized_price = normalize_purchase_price(body.symbol, body.type, body.purchase_price)
    
    asset = InvestmentAsset(
        user_id=current_user.id,
        symbol=body.symbol.strip().upper(),
        name=body.name.strip(),
        type=body.type.strip().lower(),
        quantity=body.quantity,
        purchase_price=normalized_price,
        color=body.color,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    
    # Return with evaluation properties
    market_prices = get_market_prices([asset.symbol])
    current_price = market_prices.get(asset.symbol, asset.purchase_price)
    val = asset.quantity * current_price
    invested = asset.quantity * asset.purchase_price
    profit = val - invested
    profit_pct = (profit / invested * 100) if invested > 0 else 0.0
    
    return InvestmentAssetResponse(
        id=asset.id,
        user_id=asset.user_id,
        symbol=asset.symbol,
        name=asset.name,
        type=asset.type,
        quantity=asset.quantity,
        purchase_price=asset.purchase_price,
        current_price=current_price,
        value=val,
        profit=profit,
        profit_percent=profit_pct,
        color=asset.color,
        updated_at=asset.updated_at,
    )


@router.delete("/portfolio/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio_asset(
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an asset holding from the portfolio."""
    stmt = select(InvestmentAsset).where(
        InvestmentAsset.id == asset_id,
        InvestmentAsset.user_id == current_user.id
    )
    result = await db.execute(stmt)
    asset = result.scalar_one_or_none()
    
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tài sản đầu tư không tồn tại hoặc không thuộc sở hữu của bạn."
        )
        
    await db.delete(asset)
    await db.commit()
    return None


@router.get("/stress-test", response_model=StressTestResponse)
async def get_stress_test(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StressTestResponse:
    """Run simulated market shock scenarios and generate Gemini recommendations."""
    # 1. Fetch profile
    profile_stmt = select(InvestmentProfile).where(InvestmentProfile.user_id == current_user.id)
    profile_res = await db.execute(profile_stmt)
    profile = profile_res.scalar_one_or_none()
    
    if not profile:
        profile = InvestmentProfile(
            user_id=current_user.id,
            risk_appetite="moderate",
            capital=0.0,
            goal="Tự do tài chính",
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
        
    # 2. Fetch assets
    assets_stmt = select(InvestmentAsset).where(InvestmentAsset.user_id == current_user.id)
    assets_res = await db.execute(assets_stmt)
    assets = assets_res.scalars().all()
    
    # 3. Retrieve real-time market prices
    symbols = list({a.symbol for a in assets})
    market_prices = get_market_prices(symbols)
    
    # Convert ORM instances to dict payloads
    profile_dict = {
        "capital": profile.capital,
        "risk_appetite": profile.risk_appetite,
        "goal": profile.goal
    }
    
    assets_dicts = [
        {
            "id": asset.id,
            "user_id": asset.user_id,
            "symbol": asset.symbol,
            "name": asset.name,
            "type": asset.type,
            "quantity": asset.quantity,
            "purchase_price": asset.purchase_price,
            "color": asset.color,
            "updated_at": asset.updated_at
        }
        for asset in assets
    ]
    
    # 4. Perform stress test
    results = run_portfolio_stress_test(profile_dict, assets_dicts, market_prices)
    return results


_PARSE_ASSET_PROMPT_TEMPLATE = """Bạn là một trợ lý ảo phân tích tài sản đầu tư cá nhân.
Hãy phân tích đoạn văn mô tả mua/sở hữu tài sản dưới đây và trích xuất thành cấu trúc JSON có các trường:
- symbol: Mã tài sản viết hoa (ví dụ: FPT, BTC, SJC, VNM, v.v.). Nếu là gửi tiết kiệm ngân hàng có thể dùng mã như SAVING_VCB, SAVING_BIDV hoặc SAVING.
- name: Tên hiển thị đầy đủ của tài sản bằng tiếng Việt (ví dụ: Cổ phiếu FPT, Vàng SJC, Bitcoin, Gửi tiết kiệm Vietcombank, v.v.).
- type: Loại tài sản, bắt buộc phải là một trong 4 giá trị sau: "stock" (cho cổ phiếu Việt Nam), "gold" (cho vàng), "saving" (cho gửi tiết kiệm), "crypto" (cho tiền mã hóa).
- quantity: Số lượng tài sản sở hữu (số thực). Ví dụ: "2 lượng vàng" -> 2.0, "100 cổ phiếu" -> 100.0, "0.05 BTC" -> 0.05.
- purchase_price: Giá mua trung bình trên MỘT đơn vị tài sản (tính bằng đồng VND). 
  LƯU Ý QUAN TRỌNG VỀ ĐƠN VỊ TIỀN TỆ:
  - Nếu người dùng nhập giá mua bằng từ khóa như "130k", "130 ngàn" -> giá trị là 130000.
  - Nếu người dùng mua vàng: "giá 82 triệu một lượng" hoặc "82tr/lượng" -> giá trị là 82000000. 
  - Nếu người dùng mua crypto (ví dụ BTC giá 65k USD hoặc 1.6 tỷ VND): nếu họ nhập USD hoặc số lượng lớn, hãy quy đổi sang VND (ví dụ 65000 USD * 25400 = 1651000000 VND).
  - Nếu là gửi tiết kiệm: "gửi 50 triệu" -> số lượng là 1.0 và giá mua (số tiền gửi) là 50000000.
- color: Gợi ý mã màu sắc HEX (ví dụ: #5BAAEC, #22C55E, #F59E0B, #FB923C, #A78BFA, #EC4899) phù hợp với loại tài sản đó để vẽ biểu đồ tròn.

Đoạn mô tả của người dùng:
"{text}"

Chỉ trả về JSON duy nhất theo cấu trúc sau:
{{
  "symbol": "<symbol>",
  "name": "<name>",
  "type": "<type>",
  "quantity": <quantity>,
  "purchase_price": <purchase_price>,
  "color": "<color>"
}}
Không thêm bất kỳ văn bản giải thích nào khác ngoài JSON.
"""


def _parse_asset_response_schema() -> dict[str, Any]:
    return {
        "type": "OBJECT",
        "properties": {
            "symbol": {"type": "STRING"},
            "name": {"type": "STRING"},
            "type": {"type": "STRING", "enum": ["stock", "gold", "saving", "crypto"]},
            "quantity": {"type": "NUMBER"},
            "purchase_price": {"type": "NUMBER"},
            "color": {"type": "STRING"}
        },
        "required": ["symbol", "name", "type", "quantity", "purchase_price", "color"]
    }


@router.post("/parse-asset", response_model=ParseAssetResponse)
async def parse_asset(
    body: ParseAssetRequest,
    current_user: User = Depends(get_current_user),
) -> ParseAssetResponse:
    """Parse a natural language text description of an asset holding using Gemini."""
    prompt = _PARSE_ASSET_PROMPT_TEMPLATE.format(text=body.text)
    try:
        import json
        raw_json = _call_gemini(prompt, response_schema=_parse_asset_response_schema(), timeout=10)
        parsed = json.loads(raw_json.strip())
        
        symbol = str(parsed.get("symbol", "")).strip().upper()
        name = str(parsed.get("name", "")).strip()
        asset_type = str(parsed.get("type", "stock")).strip().lower()
        quantity = float(parsed.get("quantity") or 1.0)
        purchase_price = float(parsed.get("purchase_price") or 0.0)
        color = str(parsed.get("color", "#5BAAEC")).strip()
        
        # Apply normalization to the parsed price as well to fix unit mismatches
        purchase_price = normalize_purchase_price(symbol, asset_type, purchase_price)
        
        return ParseAssetResponse(
            symbol=symbol,
            name=name,
            type=asset_type,
            quantity=quantity,
            purchase_price=purchase_price,
            color=color,
        )
    except Exception as exc:
        # Fallback empty structure in case of LLM failure
        return ParseAssetResponse(
            symbol="",
            name="",
            type="stock",
            quantity=1.0,
            purchase_price=0.0,
            color="#5BAAEC"
        )


@router.get("/market-price")
async def get_single_market_price(
    symbol: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retrieve the real-time market price of a single asset (stock, crypto, or gold)."""
    del current_user
    symbol = symbol.strip().upper()
    prices = get_market_prices([symbol])
    return {"symbol": symbol, "price": prices.get(symbol, 0.0)}


