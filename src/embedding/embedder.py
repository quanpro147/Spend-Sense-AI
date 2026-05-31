"""
Text embedder — sentence-transformers (all-MiniLM-L6-v2 by default).

The real model is loaded lazily and cached. If the model cannot be loaded
(e.g. weights not downloaded / offline), embed_text() degrades gracefully to a
deterministic stub vector so the receipt pipeline never hard-fails.
"""

from __future__ import annotations

from functools import lru_cache

import structlog

from src.core.config import get_settings
from src.core.tool_result import ToolResult

log = structlog.get_logger()

_STUB_DIM = 384  # all-MiniLM-L6-v2 output dimension


def embed_text(text: str) -> ToolResult:
    """
    Convert text to a float vector for semantic cache lookup.

    Args:
        text: canonical receipt text (Receipt.canonical_text)

    Returns:
        ToolResult.data = list[float]  (length = embedding dimension)
    """
    if not text or not text.strip():
        return ToolResult.error(
            summary="Empty text cannot be embedded",
            error_hint="Receipt canonical_text is empty. Check OCR output.",
            next_actions=["Verify receipt has items", "Re-run OCR"],
        )

    try:
        vector = _encode(text)
    except _ModelUnavailable as exc:
        vector = _stub_vector(text)
        return ToolResult.warning(
            summary="Embedding model not loaded — using stub vector",
            data=vector,
            next_actions=["Look up cache with stub vector", "Load real model for production"],
            error_hint=f"sentence-transformers unavailable: {exc}. Set EMBEDDING_MODEL in .env.",
        )
    except Exception as exc:
        return ToolResult.error(
            summary="Embedding failed",
            error_hint=f"{type(exc).__name__}: {exc}",
            next_actions=["Check EMBEDDING_MODEL setting", "Retry after model download"],
        )

    return ToolResult.success(
        summary=f"Embedded {len(text)} chars → {len(vector)}-dim vector",
        data=vector,
        next_actions=["Query semantic cache with vector"],
    )


class _ModelUnavailable(RuntimeError):
    """Raised when the sentence-transformers model cannot be loaded."""


@lru_cache(maxsize=1)
def _load_model():
    """Load and cache the sentence-transformers model (CPU)."""
    try:
        from sentence_transformers import SentenceTransformer
    except Exception as exc:  # ImportError or transitive dependency failure
        raise _ModelUnavailable(f"sentence-transformers not importable: {exc}") from exc

    model_name = get_settings().embedding_model
    try:
        return SentenceTransformer(model_name, device="cpu")
    except Exception as exc:  # download / weight loading failure
        raise _ModelUnavailable(f"could not load '{model_name}': {exc}") from exc


def _encode(text: str) -> list[float]:
    """Encode text with the real model into a normalized float vector.

    Vectors are L2-normalized so cosine similarity equals the dot product,
    matching the semantic-cache similarity_threshold contract.
    """
    model = _load_model()
    vector = model.encode(text, normalize_embeddings=True)
    return [float(value) for value in vector.tolist()]


def warm_up_embedder() -> dict[str, object]:
    """Load embedding weights once so the first cache lookup avoids model init."""
    model = _load_model()
    dimension = int(getattr(model, "get_sentence_embedding_dimension", lambda: _STUB_DIM)())
    return {"embedding_model": get_settings().embedding_model, "dimension": dimension}


def _stub_vector(text: str) -> list[float]:
    """Deterministic stub — same text always produces same vector."""
    import hashlib
    digest = hashlib.sha256(text.encode()).digest()
    base = [b / 255.0 for b in digest]
    # pad / trim to stub dimension
    ratio = _STUB_DIM // len(base) + 1
    return (base * ratio)[:_STUB_DIM]
