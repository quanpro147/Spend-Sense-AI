from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.models.expense import FeedbackAction, Insight
from src.db.models import FinancialGoal, Transaction


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    action: FeedbackAction
    vector_id: str = Field(description="vector_id returned in the analyze response")


class ReceiptItemInput(BaseModel):
    name: str
    quantity: float = 1.0
    unit_price: float = 0.0
    category: str = "khac"


class TransactionCreateRequest(BaseModel):
    type: str = Field(default="expense", pattern="^(expense|income)$")
    amount: float = Field(gt=0)
    currency: str = "VND"
    category: str = "khac"
    description: str = ""
    merchant: str = ""
    transaction_date: date | None = None
    receipt_id: UUID | None = None
    receipt_items: list[ReceiptItemInput] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class InsightResponse(BaseModel):
    insight_id: UUID
    receipt_id: UUID
    summary: str
    category: str
    tips: list[str]
    source: str  # "cache" | "llm"
    similarity_score: float | None = None

    @classmethod
    def from_insight(cls, insight: Insight) -> "InsightResponse":
        return cls(
            insight_id=insight.id,
            receipt_id=insight.receipt_id,
            summary=insight.summary,
            category=insight.category,
            tips=insight.tips,
            source=insight.source.value,
            similarity_score=insight.similarity_score,
        )


class AnalyzeResponse(BaseModel):
    insight: InsightResponse
    vector_id: str | None = None
    receipt: "ReceiptDraftResponse | None" = None
    suggested_transaction: "SuggestedTransactionResponse | None" = None
    detected_fields: list["DetectedFieldResponse"] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str = "ok"


class ErrorResponse(BaseModel):
    error: str
    hint: str | None = None
    step: str | None = None


# ---------------------------------------------------------------------------
# Auth schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=10)


class UserResponse(BaseModel):
    id: UUID
    email: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


class DetectedFieldResponse(BaseModel):
    id: str
    class_name: str
    text: str
    confidence: float
    x: float
    y: float
    width: float
    height: float


class ReceiptDraftItemResponse(BaseModel):
    id: str
    name: str
    quantity: float
    unit_price: float
    discount: float = 0.0
    total_price: float
    category: str = "khac"
    source_token_ids: dict[str, str | None] = Field(default_factory=dict)


class ReceiptDraftResponse(BaseModel):
    receipt_id: UUID
    merchant: str
    purchase_date: date | None = None
    total_amount: float
    currency: str = "VND"
    raw_text: str = ""
    items: list[ReceiptDraftItemResponse] = Field(default_factory=list)


class SuggestedTransactionResponse(BaseModel):
    type: str = "expense"
    amount: float
    currency: str = "VND"
    category: str = "khac"
    description: str = ""
    merchant: str = ""
    transaction_date: date | None = None
    receipt_id: UUID | None = None


class TransactionResponse(BaseModel):
    id: UUID
    user_id: UUID
    receipt_id: UUID | None = None
    type: str
    amount: float
    currency: str
    category: str
    description: str
    merchant: str
    transaction_date: date | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_transaction(cls, transaction: Transaction) -> "TransactionResponse":
        return cls.model_validate(transaction)


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class InsightListResponse(BaseModel):
    items: list[InsightResponse]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Investment schemas
# ---------------------------------------------------------------------------

class InvestmentProfileRequest(BaseModel):
    risk_appetite: str
    capital: float
    goal: str = ""


class InvestmentProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    risk_appetite: str
    capital: float
    goal: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InvestmentAssetRequest(BaseModel):
    symbol: str
    name: str
    type: str  # stock, gold, saving, crypto
    quantity: float
    purchase_price: float
    color: str = "#5BAAEC"


class InvestmentAssetResponse(BaseModel):
    id: UUID
    user_id: UUID
    symbol: str
    name: str
    type: str
    quantity: float
    purchase_price: float
    current_price: float | None = None
    value: float | None = None
    profit: float | None = None
    profit_percent: float | None = None
    color: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HedgingStrategyResponse(BaseModel):
    asset: str
    action: str
    amount: float
    reasoning: str


class ScenarioResultResponse(BaseModel):
    id: str
    name: str
    simulated_value: float
    loss_value: float
    loss_percent: float


class StressTestResponse(BaseModel):
    portfolio_value: float
    total_capital: float
    idle_cash: float
    vulnerability_score: float
    diversification_score: float
    worst_scenario: str
    worst_loss_percent: float
    scenarios: list[ScenarioResultResponse]
    assets: list[InvestmentAssetResponse]
    overall_analysis: str
    hedging_strategies: list[HedgingStrategyResponse]


# ---------------------------------------------------------------------------
# Financial goals schemas
# ---------------------------------------------------------------------------

class GoalCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    emoji: str = "🎯"
    target_amount: float = Field(gt=0)
    current_amount: float = Field(default=0.0, ge=0)
    monthly_target: float = Field(default=0.0, ge=0)
    deadline: date | None = None
    ai_note: str = ""


class GoalUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    emoji: str | None = None
    target_amount: float | None = Field(default=None, gt=0)
    current_amount: float | None = Field(default=None, ge=0)
    monthly_target: float | None = Field(default=None, ge=0)
    deadline: date | None = None
    ai_note: str | None = None


class GoalResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    emoji: str
    target_amount: float
    current_amount: float
    monthly_target: float
    deadline: date | None = None
    ai_note: str
    status: str  # on-track | at-risk | achieved
    progress_percent: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_goal(cls, goal: "FinancialGoal") -> "GoalResponse":
        progress = (goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0.0
        if progress >= 100:
            status = "achieved"
        elif progress >= 50:
            status = "on-track"
        else:
            status = "at-risk"
        return cls(
            id=goal.id,
            user_id=goal.user_id,
            title=goal.title,
            emoji=goal.emoji,
            target_amount=goal.target_amount,
            current_amount=goal.current_amount,
            monthly_target=goal.monthly_target,
            deadline=goal.deadline,
            ai_note=goal.ai_note,
            status=status,
            progress_percent=round(progress, 1),
            created_at=goal.created_at,
            updated_at=goal.updated_at,
        )


class GoalListResponse(BaseModel):
    items: list[GoalResponse]
    total: int


# ---------------------------------------------------------------------------
# User preferences schemas
# ---------------------------------------------------------------------------

class PreferencesUpdateRequest(BaseModel):
    weekly_report: bool | None = None
    rebalance_suggestions: bool | None = None
    anomaly_alerts: bool | None = None
    goal_reminders: bool | None = None


class PreferencesResponse(BaseModel):
    user_id: UUID
    weekly_report: bool
    rebalance_suggestions: bool
    anomaly_alerts: bool
    goal_reminders: bool
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

