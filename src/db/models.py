from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")
    receipts: Mapped[list["ReceiptRecord"]] = relationship(back_populates="user")
    investment_profile: Mapped["InvestmentProfile | None"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    investment_assets: Mapped[list["InvestmentAsset"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    goals: Mapped[list["FinancialGoal"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    preferences: Mapped["UserPreferences | None"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class ReceiptRecord(Base):
    __tablename__ = "receipts"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    merchant: Mapped[str] = mapped_column(String(255), default="")
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="VND")
    raw_text: Mapped[str] = mapped_column(String(4000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="receipts")
    items: Mapped[list["ReceiptItemRecord"]] = relationship(back_populates="receipt", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="receipt")


class ReceiptItemRecord(Base):
    __tablename__ = "receipt_items"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    receipt_id: Mapped[UUID] = mapped_column(ForeignKey("receipts.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    total_price: Mapped[float] = mapped_column(Float, default=0.0)
    category: Mapped[str] = mapped_column(String(80), default="khac")

    receipt: Mapped[ReceiptRecord] = relationship(back_populates="items")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    receipt_id: Mapped[UUID | None] = mapped_column(ForeignKey("receipts.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(16), default="expense")
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="VND")
    category: Mapped[str] = mapped_column(String(80), default="khac")
    description: Mapped[str] = mapped_column(String(500), default="")
    merchant: Mapped[str] = mapped_column(String(255), default="")
    transaction_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="transactions")
    receipt: Mapped[ReceiptRecord | None] = relationship(back_populates="transactions")


class InvestmentProfile(Base):
    __tablename__ = "investment_profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    risk_appetite: Mapped[str] = mapped_column(String(50), default="moderate")
    capital: Mapped[float] = mapped_column(Float, default=0.0)
    goal: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="investment_profile")


class InvestmentAsset(Base):
    __tablename__ = "investment_assets"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # stock, gold, saving, crypto
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    purchase_price: Mapped[float] = mapped_column(Float, default=0.0)
    color: Mapped[str] = mapped_column(String(20), default="#5BAAEC")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="investment_assets")


class FinancialGoal(Base):
    __tablename__ = "financial_goals"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    emoji: Mapped[str] = mapped_column(String(16), default="🎯")
    target_amount: Mapped[float] = mapped_column(Float, default=0.0)
    current_amount: Mapped[float] = mapped_column(Float, default=0.0)
    monthly_target: Mapped[float] = mapped_column(Float, default=0.0)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    ai_note: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="goals")


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    weekly_report: Mapped[bool] = mapped_column(Boolean, default=True)
    rebalance_suggestions: Mapped[bool] = mapped_column(Boolean, default=False)
    anomaly_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    goal_reminders: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="preferences")

