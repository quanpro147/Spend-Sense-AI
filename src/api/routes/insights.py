from fastapi import APIRouter

from src.api.schemas import HealthResponse

router = APIRouter(tags=["insights"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


# GET /insights and GET /insights/{id} will query ChromaDB directly.
# Placeholder — implement after ChromaDB list/get APIs are confirmed.
