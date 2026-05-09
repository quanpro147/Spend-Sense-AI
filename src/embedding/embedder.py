"""
Text embedder — sentence-transformers stub.

Replace _load_model() / _encode() with real model when ready.
"""

from __future__ import annotations

from src.core.tool_result import ToolResult

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
    except NotImplementedError:
        vector = _stub_vector(text)
        return ToolResult.warning(
            summary="Embedding model not loaded — using stub vector",
            data=vector,
            next_actions=["Look up cache with stub vector", "Load real model for production"],
            error_hint="sentence-transformers not initialised. Set EMBEDDING_MODEL in .env.",
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


def _encode(text: str) -> list[float]:
    """Plug real sentence-transformers encode() here."""
    raise NotImplementedError


def _stub_vector(text: str) -> list[float]:
    """Deterministic stub — same text always produces same vector."""
    import hashlib
    digest = hashlib.sha256(text.encode()).digest()
    base = [b / 255.0 for b in digest]
    # pad / trim to stub dimension
    ratio = _STUB_DIM // len(base) + 1
    return (base * ratio)[:_STUB_DIM]
