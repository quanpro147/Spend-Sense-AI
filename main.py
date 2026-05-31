import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import auth, feedback, goals, insights, preferences, receipts, transactions, investment
from src.core.config import get_settings
from src.core.logging import configure_logging

_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    cfg = get_settings()
    configure_logging(debug=cfg.debug)
    _warm_up_models()
    _log.info("SpendSense AI started.")
    yield


def _warm_up_models() -> None:
    try:
        from src.vision.detector import warm_up_detector

        metadata = warm_up_detector()
        _log.info("YOLO detector warmed up.", extra=metadata)
    except Exception as exc:
        _log.warning("YOLO detector warm-up skipped: %s", exc)

    try:
        from src.vision.ocr import warm_up_ocr

        warm_up_ocr()
        _log.info("VietOCR warmed up.")
    except Exception as exc:
        _log.warning("VietOCR warm-up skipped: %s", exc)

    try:
        from src.embedding.embedder import warm_up_embedder

        metadata = warm_up_embedder()
        _log.info("Embedding model warmed up.", extra=metadata)
    except Exception as exc:
        _log.warning("Embedding model warm-up skipped: %s", exc)


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
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1):\d+$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(receipts.router)
    app.include_router(transactions.router)
    app.include_router(feedback.router)
    app.include_router(insights.router)
    app.include_router(investment.router)
    app.include_router(goals.router)
    app.include_router(preferences.router)

    return app


app = create_app()


def run() -> None:
    import uvicorn

    cfg = get_settings()
    uvicorn.run("main:app", host=cfg.api_host, port=cfg.api_port, reload=True)
