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
)
from src.auth.dependencies import get_current_user
from src.db.base import get_db
from src.db.models import User, InvestmentProfile, InvestmentAsset
from src.core.market_data import get_market_prices
from src.core.stress_tester import run_portfolio_stress_test

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


@router.post("/portfolio", response_model=InvestmentAssetResponse)
async def add_portfolio_asset(
    body: InvestmentAssetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvestmentAssetResponse:
    """Add a new asset holding to the portfolio."""
    # To keep simple, we allow adding duplicate symbols (representing separate purchases)
    # or just creating new entries.
    asset = InvestmentAsset(
        user_id=current_user.id,
        symbol=body.symbol.strip().upper(),
        name=body.name.strip(),
        type=body.type.strip().lower(),
        quantity=body.quantity,
        purchase_price=body.purchase_price,
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
