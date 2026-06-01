from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.schemas import (
    FinancialReportResponse,
    ReportAiReviewResponse,
    ReportCategoryBreakdownResponse,
    ReportGoalProgressResponse,
    ReportInvestmentAssetResponse,
    ReportInvestmentSummaryResponse,
    ReportTransactionResponse,
)
from src.auth.dependencies import get_current_user
from src.core.market_data import get_market_prices
from src.db.base import get_db
from src.db.models import FinancialGoal, InvestmentAsset, Transaction, User
from src.llm.gemini_client import generate_financial_report_review

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=FinancialReportResponse)
async def get_financial_report(
    range: Literal["today", "7d"] = Query(default="7d"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FinancialReportResponse:
    end_date = date.today()
    start_date = end_date if range == "today" else end_date - timedelta(days=6)

    transactions = await _load_transactions(current_user.id, start_date, end_date, db)
    goals = await _load_goals(current_user.id, db)
    assets = await _load_assets(current_user.id, db)

    income = sum(txn.amount for txn in transactions if txn.type == "income")
    expense = sum(txn.amount for txn in transactions if txn.type == "expense")
    net = income - expense
    saving_rate = (net / income * 100) if income > 0 else 0.0

    category_breakdown = _category_breakdown(transactions, expense)
    largest_expenses = [txn for txn in transactions if txn.type == "expense"]
    largest_transactions = [
        ReportTransactionResponse(
            id=txn.id,
            type=txn.type,
            amount=txn.amount,
            category=txn.category,
            description=txn.description,
            merchant=txn.merchant,
            transaction_date=txn.transaction_date,
        )
        for txn in sorted(largest_expenses, key=lambda item: item.amount, reverse=True)[:5]
    ]
    investment = _investment_summary(assets)
    goal_progress = [_goal_progress(goal) for goal in goals]

    title = "Báo cáo hôm nay" if range == "today" else "Báo cáo 7 ngày qua"
    ai_review = _ai_review(
        {
            "range": range,
            "title": title,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "income": income,
            "expense": expense,
            "net": net,
            "saving_rate": saving_rate,
            "category_breakdown": [item.model_dump() for item in category_breakdown],
            "largest_transactions": [item.model_dump(mode="json") for item in largest_transactions],
            "investment": investment.model_dump(),
            "goals": [item.model_dump() for item in goal_progress],
        }
    )

    return FinancialReportResponse(
        range=range,
        title=title,
        start_date=start_date,
        end_date=end_date,
        income=income,
        expense=expense,
        net=net,
        savings=net,
        saving_rate=round(saving_rate, 1),
        category_breakdown=category_breakdown,
        largest_transactions=largest_transactions,
        investment=investment,
        goals=goal_progress,
        ai_review=ai_review,
    )


async def _load_transactions(user_id: object, start_date: date, end_date: date, db: AsyncSession) -> list[Transaction]:
    result = await db.scalars(select(Transaction).where(Transaction.user_id == user_id))
    return [
        txn
        for txn in result.all()
        if start_date <= _transaction_day(txn) <= end_date
    ]


async def _load_goals(user_id: object, db: AsyncSession) -> list[FinancialGoal]:
    result = await db.scalars(
        select(FinancialGoal)
        .where(FinancialGoal.user_id == user_id)
        .order_by(FinancialGoal.created_at.desc())
    )
    return list(result.all())


async def _load_assets(user_id: object, db: AsyncSession) -> list[InvestmentAsset]:
    result = await db.scalars(select(InvestmentAsset).where(InvestmentAsset.user_id == user_id))
    return list(result.all())


def _transaction_day(transaction: Transaction) -> date:
    if transaction.transaction_date:
        return transaction.transaction_date
    created_at = transaction.created_at
    if isinstance(created_at, datetime):
        return created_at.date()
    return date.today()


def _category_breakdown(transactions: list[Transaction], total_expense: float) -> list[ReportCategoryBreakdownResponse]:
    totals: dict[str, float] = {}
    for txn in transactions:
        if txn.type != "expense":
            continue
        totals[txn.category] = totals.get(txn.category, 0.0) + txn.amount
    return [
        ReportCategoryBreakdownResponse(
            category=category,
            amount=amount,
            percent=round((amount / total_expense * 100) if total_expense > 0 else 0.0, 1),
        )
        for category, amount in sorted(totals.items(), key=lambda item: item[1], reverse=True)
    ]


def _investment_summary(assets: list[InvestmentAsset]) -> ReportInvestmentSummaryResponse:
    if not assets:
        return ReportInvestmentSummaryResponse(
            status="none",
            total_invested=0.0,
            current_value=0.0,
            profit=0.0,
            profit_percent=0.0,
            assessment="Bạn chưa có danh mục đầu tư, chưa thể đánh giá hiệu quả đầu tư.",
            assets=[],
        )

    prices = get_market_prices(list({asset.symbol for asset in assets}))
    evaluated_assets: list[ReportInvestmentAssetResponse] = []
    total_invested = 0.0
    current_value = 0.0

    for asset in assets:
        current_price = prices.get(asset.symbol, asset.purchase_price) or asset.purchase_price
        value = asset.quantity * current_price
        invested = asset.quantity * asset.purchase_price
        profit = value - invested
        profit_percent = (profit / invested * 100) if invested > 0 else 0.0
        total_invested += invested
        current_value += value
        evaluated_assets.append(
            ReportInvestmentAssetResponse(
                symbol=asset.symbol,
                name=asset.name,
                type=asset.type,
                value=value,
                invested=invested,
                profit=profit,
                profit_percent=round(profit_percent, 2),
            )
        )

    profit = current_value - total_invested
    profit_percent = (profit / total_invested * 100) if total_invested > 0 else 0.0
    if profit_percent >= 5:
        status = "successful"
        assessment = "Danh mục đầu tư đang có lãi tốt so với vốn bỏ ra."
    elif profit_percent > 0:
        status = "positive"
        assessment = "Danh mục đầu tư đang có lãi nhẹ, nên tiếp tục theo dõi tỷ trọng và rủi ro."
    elif profit_percent == 0:
        status = "neutral"
        assessment = "Danh mục đầu tư đang gần hòa vốn hoặc chưa có biến động đáng kể."
    else:
        status = "underperforming"
        assessment = "Danh mục đầu tư đang lỗ, nên kiểm tra lại phân bổ và mức chịu rủi ro."

    return ReportInvestmentSummaryResponse(
        status=status,
        total_invested=total_invested,
        current_value=current_value,
        profit=profit,
        profit_percent=round(profit_percent, 2),
        assessment=assessment,
        assets=sorted(evaluated_assets, key=lambda item: abs(item.profit), reverse=True),
    )


def _goal_progress(goal: FinancialGoal) -> ReportGoalProgressResponse:
    progress = (goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0.0
    if progress >= 100:
        status = "achieved"
    elif progress >= 50:
        status = "on-track"
    else:
        status = "at-risk"
    return ReportGoalProgressResponse(
        title=goal.title,
        emoji=goal.emoji,
        target_amount=goal.target_amount,
        current_amount=goal.current_amount,
        progress_percent=round(progress, 1),
        status=status,
    )


def _ai_review(payload: dict) -> ReportAiReviewResponse:
    result = generate_financial_report_review(payload)
    if result.ok and isinstance(result.data, dict):
        return ReportAiReviewResponse(
            summary=str(result.data.get("summary") or ""),
            observations=[str(item) for item in result.data.get("observations", []) if str(item).strip()],
            suggested_actions=[str(item) for item in result.data.get("suggested_actions", []) if str(item).strip()],
            source="gemini",
        )

    return ReportAiReviewResponse(
        summary=_fallback_summary(payload),
        observations=_fallback_observations(payload),
        suggested_actions=_fallback_actions(payload),
        source="fallback",
    )


def _fallback_summary(payload: dict) -> str:
    income = float(payload.get("income") or 0)
    expense = float(payload.get("expense") or 0)
    net = float(payload.get("net") or 0)
    if income == 0 and expense == 0:
        return "Chưa có đủ giao dịch trong kỳ này để đưa ra đánh giá sâu."
    return f"Trong kỳ này bạn có thu nhập {income:,.0f} VND, chi tiêu {expense:,.0f} VND và còn dư {net:,.0f} VND."


def _fallback_observations(payload: dict) -> list[str]:
    observations = []
    categories = payload.get("category_breakdown") or []
    if categories:
        top_category = categories[0]
        observations.append(
            f"Danh mục chi tiêu lớn nhất là {top_category.get('category')} với {float(top_category.get('amount') or 0):,.0f} VND."
        )
    investment = payload.get("investment") or {}
    observations.append(str(investment.get("assessment") or "Chưa có dữ liệu đầu tư để đánh giá."))
    goals = payload.get("goals") or []
    observations.append(
        f"Bạn đang theo dõi {len(goals)} mục tiêu tài chính." if goals else "Bạn chưa thiết lập mục tiêu tài chính."
    )
    return observations


def _fallback_actions(payload: dict) -> list[str]:
    actions = ["Kiểm tra lại các giao dịch lớn nhất để đảm bảo chúng phù hợp với ưu tiên tài chính."]
    if float(payload.get("net") or 0) > 0:
        actions.append("Cân nhắc phân bổ phần dư vào mục tiêu tiết kiệm hoặc danh mục đầu tư phù hợp.")
    else:
        actions.append("Giảm một danh mục chi tiêu linh hoạt trong kỳ tới để cải thiện số dư.")
    if not (payload.get("goals") or []):
        actions.append("Thiết lập ít nhất một mục tiêu tài chính để báo cáo có thể theo dõi tiến độ cụ thể hơn.")
    return actions
