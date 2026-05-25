from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.models.expense import FeedbackAction, Insight
from src.db.models import Transaction


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
