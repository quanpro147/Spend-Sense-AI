from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.schemas import TransactionCreateRequest, TransactionListResponse, TransactionResponse, TransactionUpdateRequest
from src.auth.dependencies import get_current_user
from src.db.base import get_db
from src.db.models import ReceiptItemRecord, ReceiptRecord, Transaction, User

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TransactionResponse:
    receipt_id = body.receipt_id
    if body.receipt_items:
        receipt = ReceiptRecord(
            user_id=current_user.id,
            merchant=body.merchant,
            purchase_date=body.transaction_date,
            total_amount=body.amount,
            currency=body.currency,
            raw_text="",
        )
        db.add(receipt)
        await db.flush()
        for item in body.receipt_items:
            db.add(
                ReceiptItemRecord(
                    receipt_id=receipt.id,
                    name=item.name,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    total_price=item.quantity * item.unit_price,
                    category=item.category,
                )
            )
        receipt_id = receipt.id

    transaction = Transaction(
        user_id=current_user.id,
        receipt_id=receipt_id,
        type=body.type,
        amount=body.amount,
        currency=body.currency,
        category=body.category,
        description=body.description,
        merchant=body.merchant,
        transaction_date=body.transaction_date,
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    return TransactionResponse.from_transaction(transaction)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: UUID,
    body: TransactionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TransactionResponse:
    transaction = await db.scalar(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(transaction, field, value)

    await db.commit()
    await db.refresh(transaction)
    return TransactionResponse.from_transaction(transaction)


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    include_total: bool = Query(default=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TransactionListResponse:
    result = await db.scalars(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = [TransactionResponse.from_transaction(txn) for txn in result.all()]
    total = len(items)
    if include_total:
        total = await db.scalar(select(func.count()).select_from(Transaction).where(Transaction.user_id == current_user.id)) or 0
    return TransactionListResponse(items=items, total=total, limit=limit, offset=offset)
