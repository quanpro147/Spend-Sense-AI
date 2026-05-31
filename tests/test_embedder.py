"""Unit tests for the text embedder (real model path + stub fallback)."""
import numpy as np

from src.core.tool_result import ToolStatus
from src.embedding import embedder


class _FakeModel:
    def encode(self, text, normalize_embeddings=False):  # noqa: ANN001
        # Deterministic 384-dim unit-ish vector
        rng = np.linspace(0.0, 1.0, 384, dtype="float32")
        return rng


def test_embed_text_empty_returns_error():
    # Arrange / Act
    result = embedder.embed_text("   ")
    # Assert
    assert result.status == ToolStatus.ERROR
    assert "Empty" in result.summary


def test_embed_text_uses_real_model(monkeypatch):
    # Arrange
    monkeypatch.setattr(embedder, "_load_model", lambda: _FakeModel())
    # Act
    result = embedder.embed_text("cà phê sữa đá 25000")
    # Assert
    assert result.status == ToolStatus.SUCCESS
    assert isinstance(result.data, list)
    assert len(result.data) == 384
    assert all(isinstance(v, float) for v in result.data)


def test_embed_text_falls_back_to_stub_when_model_unavailable(monkeypatch):
    # Arrange
    def _raise():
        raise embedder._ModelUnavailable("offline")

    monkeypatch.setattr(embedder, "_load_model", _raise)
    # Act
    result = embedder.embed_text("phở bò 50000")
    # Assert
    assert result.status == ToolStatus.WARNING
    assert len(result.data) == 384


def test_stub_vector_is_deterministic():
    # Arrange / Act
    a = embedder._stub_vector("hoa don abc")
    b = embedder._stub_vector("hoa don abc")
    c = embedder._stub_vector("different")
    # Assert
    assert a == b
    assert a != c
    assert len(a) == 384
