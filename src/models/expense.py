from __future__ import annotations

from datetime import date
from enum import Enum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ReceiptItem(BaseModel):
    name: str
    quantity: float = 1.0
    unit_price: float
    total_price: float
    category: str = "khac"


class Receipt(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    merchant: str
    purchase_date: date
    items: list[ReceiptItem]
    total_amount: float
    currency: str = "VND"
    raw_text: str = ""

    @property
    def canonical_text(self) -> str:
        """Deterministic text representation used for embedding."""
        lines = [f"{self.merchant} {self.purchase_date}"]
        for item in self.items:
            lines.append(f"{item.name} {item.category} {item.total_price}")
        lines.append(f"total {self.total_amount} {self.currency}")
        return " | ".join(lines)


class InsightSource(str, Enum):
    CACHE = "cache"
    LLM = "llm"


class Insight(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    receipt_id: UUID
    summary: str
    category: str
    tips: list[str] = Field(default_factory=list)
    source: InsightSource
    similarity_score: float | None = None
    vector_id: str | None = None


class FeedbackAction(str, Enum):
    CONFIRM = "confirm"   # 👍 keep pattern
    REJECT = "reject"     # 👎 delete pattern
