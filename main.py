from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import feedback, insights, receipts
from src.core.config import get_settings
from src.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    cfg = get_settings()
    configure_logging(debug=cfg.debug)
    yield


def create_app() -> FastAPI:
    cfg = get_settings()

    app = FastAPI(
        title="SpendSense AI",
        description="AI-powered personal expense management with semantic caching.",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],  # Vite dev server
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(receipts.router)
    app.include_router(feedback.router)
    app.include_router(insights.router)

    return app


app = create_app()
