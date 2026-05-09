from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.models.expense import FeedbackAction, Insight


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    action: FeedbackAction
    vector_id: str = Field(description="vector_id returned in the analyze response")


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


class UserResponse(BaseModel):
    id: UUID
    email: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class InsightListResponse(BaseModel):
    items: list[InsightResponse]
    total: int
    limit: int
    offset: int
