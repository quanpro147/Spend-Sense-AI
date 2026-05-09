"""
ChromaDB semantic cache.

Stores receipt insight vectors and retrieves them by cosine similarity.
A hit (score >= threshold) means we can skip the LLM call entirely.
"""

from __future__ import annotations

import json
import uuid

import chromadb
from chromadb.config import Settings as ChromaSettings

from src.core.config import get_settings
from src.core.tool_result import ToolResult
from src.models.expense import Insight, InsightSource


def _chroma_client() -> chromadb.HttpClient:
    cfg = get_settings()
    return chromadb.HttpClient(
        host=cfg.chroma_host,
        port=cfg.chroma_port,
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def _collection() -> chromadb.Collection:
    client = _chroma_client()
    cfg = get_settings()
    return client.get_or_create_collection(
        name=cfg.chroma_collection,
        metadata={"hnsw:space": "cosine"},
    )


# ---------------------------------------------------------------------------
# Public tool functions — each returns ToolResult
# ---------------------------------------------------------------------------

def cache_lookup(vector: list[float], receipt_id: str) -> ToolResult:
    """
    Search for a cached insight similar to `vector`.

    Returns:
        status=success + data=Insight  if similarity >= threshold
        status=warning                 if no close match (cache miss)
        status=error                   if ChromaDB is unreachable
    """
    cfg = get_settings()
    try:
        col = _collection()
        results = col.query(
            query_embeddings=[vector],
            n_results=1,
            include=["metadatas", "distances"],
        )
    except Exception as exc:
        return ToolResult.error(
            summary="ChromaDB query failed",
            error_hint=f"{type(exc).__name__}: {exc}. Check CHROMA_HOST/CHROMA_PORT.",
            next_actions=["Verify ChromaDB is running", "Check network connectivity", "Fall back to LLM call"],
        )

    distances: list[float] = results["distances"][0]
    metadatas: list[dict] = results["metadatas"][0]

    if not distances:
        return ToolResult.warning(
            summary="Cache miss — collection is empty",
            next_actions=["Call LLM to generate insight", "Store result after generation"],
        )

    # ChromaDB cosine distance: 0 = identical, 1 = orthogonal
    similarity = 1.0 - distances[0]

    if similarity < cfg.similarity_threshold:
        return ToolResult.warning(
            summary=f"Cache miss — best similarity {similarity:.3f} < {cfg.similarity_threshold}",
            data={"best_similarity": similarity},
            next_actions=["Call LLM to generate insight", "Store result after generation"],
        )

    meta = metadatas[0]
    insight = Insight(
        id=uuid.UUID(meta["insight_id"]),
        receipt_id=uuid.UUID(receipt_id),
        summary=meta["summary"],
        category=meta["category"],
        tips=json.loads(meta.get("tips", "[]")),
        source=InsightSource.CACHE,
        similarity_score=similarity,
        vector_id=meta.get("vector_id"),
    )
    return ToolResult.success(
        summary=f"Cache hit — similarity {similarity:.3f}",
        data=insight,
        next_actions=["Return cached insight to caller"],
        artifacts={"insight_id": str(insight.id)},
    )


def cache_store(vector: list[float], insight: Insight) -> ToolResult:
    """
    Persist a new insight vector in ChromaDB.

    Returns:
        status=success  on upsert
        status=error    if ChromaDB write fails
    """
    vector_id = str(uuid.uuid4())
    try:
        col = _collection()
        col.upsert(
            ids=[vector_id],
            embeddings=[vector],
            metadatas=[{
                "insight_id": str(insight.id),
                "receipt_id": str(insight.receipt_id),
                "summary": insight.summary,
                "category": insight.category,
                "tips": json.dumps(insight.tips),
                "vector_id": vector_id,
            }],
        )
    except Exception as exc:
        return ToolResult.error(
            summary="Failed to store insight in ChromaDB",
            error_hint=f"{type(exc).__name__}: {exc}. Check ChromaDB write permissions.",
            next_actions=["Retry store", "Return insight to user anyway (soft failure)"],
        )

    return ToolResult.success(
        summary="Insight cached successfully",
        data={"vector_id": vector_id},
        artifacts={"vector_id": vector_id},
    )


def cache_delete(vector_id: str) -> ToolResult:
    """
    Remove a vector from the cache (unlearn on 👎 feedback).

    Returns:
        status=success  on deletion
        status=error    if deletion fails
    """
    try:
        col = _collection()
        col.delete(ids=[vector_id])
    except Exception as exc:
        return ToolResult.error(
            summary="Failed to delete vector from ChromaDB",
            error_hint=f"{type(exc).__name__}: {exc}",
            next_actions=["Retry delete", "Mark vector as rejected in metadata instead"],
        )

    return ToolResult.success(
        summary=f"Vector {vector_id} deleted (pattern unlearned)",
        artifacts={"deleted_vector_id": vector_id},
    )
