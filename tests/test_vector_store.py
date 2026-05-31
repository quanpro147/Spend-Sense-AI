"""Unit tests for the ChromaDB semantic cache (collection mocked)."""
import json
import uuid

from src.cache import vector_store as vs
from src.core.tool_result import ToolStatus


def _meta(user_id="u1"):
    return {
        "insight_id": str(uuid.uuid4()),
        "receipt_id": str(uuid.uuid4()),
        "summary": "Chi tiêu ổn",
        "category": "an-uong",
        "tips": json.dumps(["t1"]),
        "vector_id": "vec-1",
        "user_id": user_id,
        "source": "llm",
    }


class _FakeCollection:
    def __init__(self, *, distances=None, metadatas=None):
        self._distances = distances
        self._metadatas = metadatas
        self.deleted = []
        self.upserted = []

    def query(self, query_embeddings, n_results, include):
        return {"distances": [self._distances or []], "metadatas": [self._metadatas or []]}

    def get(self, include=None, limit=None, offset=None, where=None, ids=None):
        return {"metadatas": self._metadatas or []}

    def upsert(self, ids, embeddings, metadatas):
        self.upserted.append(ids)

    def delete(self, ids):
        self.deleted.extend(ids)


def _patch(monkeypatch, collection):
    monkeypatch.setattr(vs, "_collection", lambda: collection)


def test_metadata_to_insight():
    insight = vs._metadata_to_insight(_meta())
    assert insight.category == "an-uong"
    assert insight.tips == ["t1"]


def test_cache_lookup_hit(monkeypatch):
    _patch(monkeypatch, _FakeCollection(distances=[0.05], metadatas=[_meta()]))
    result = vs.cache_lookup([0.1] * 384, str(uuid.uuid4()))
    assert result.status == ToolStatus.SUCCESS
    assert result.data.source.value == "cache"


def test_cache_lookup_miss_low_similarity(monkeypatch):
    _patch(monkeypatch, _FakeCollection(distances=[0.5], metadatas=[_meta()]))
    result = vs.cache_lookup([0.1] * 384, str(uuid.uuid4()))
    assert result.status == ToolStatus.WARNING


def test_cache_lookup_empty(monkeypatch):
    _patch(monkeypatch, _FakeCollection(distances=[], metadatas=[]))
    result = vs.cache_lookup([0.1] * 384, str(uuid.uuid4()))
    assert result.status == ToolStatus.WARNING


def test_cache_lookup_error(monkeypatch):
    def _boom():
        raise RuntimeError("chroma down")

    monkeypatch.setattr(vs, "_collection", _boom)
    result = vs.cache_lookup([0.1] * 384, str(uuid.uuid4()))
    assert result.status == ToolStatus.ERROR


def test_cache_store(monkeypatch):
    from datetime import date  # noqa: F401
    from src.models.expense import Insight, InsightSource

    col = _FakeCollection()
    _patch(monkeypatch, col)
    insight = Insight(receipt_id=uuid.uuid4(), summary="s", category="khac", tips=[], source=InsightSource.LLM)
    result = vs.cache_store([0.1] * 384, insight, user_id="u1")
    assert result.status == ToolStatus.SUCCESS
    assert col.upserted


def test_list_insights(monkeypatch):
    _patch(monkeypatch, _FakeCollection(metadatas=[_meta(), _meta()]))
    result = vs.list_insights(user_id="u1")
    assert result.status == ToolStatus.SUCCESS
    assert len(result.data) == 2


def test_get_insight_found_and_forbidden(monkeypatch):
    _patch(monkeypatch, _FakeCollection(metadatas=[_meta(user_id="u1")]))
    ok = vs.get_insight("vec-1", user_id="u1")
    assert ok.status == ToolStatus.SUCCESS

    forbidden = vs.get_insight("vec-1", user_id="other")
    assert forbidden.status == ToolStatus.ERROR


def test_get_insight_not_found(monkeypatch):
    _patch(monkeypatch, _FakeCollection(metadatas=[]))
    result = vs.get_insight("missing")
    assert result.status == ToolStatus.WARNING


def test_cache_delete(monkeypatch):
    col = _FakeCollection()
    _patch(monkeypatch, col)
    result = vs.cache_delete("vec-1")
    assert result.status == ToolStatus.SUCCESS
    assert "vec-1" in col.deleted
