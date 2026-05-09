from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    gemini_api_key: str = Field(description="Google Gemini API key")
    gemini_model: str = Field(default="gemini-2.5-flash")

    # Vector store (ChromaDB)
    chroma_host: str = Field(default="localhost")
    chroma_port: int = Field(default=8000)
    chroma_collection: str = Field(default="receipt_insights")

    # Semantic cache threshold
    similarity_threshold: float = Field(default=0.9, ge=0.0, le=1.0)

    # Vision model paths
    yolo_model_path: str = Field(default="models/receipt_detector.pt")
    yolo_confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    # Embedding
    embedding_model: str = Field(default="all-MiniLM-L6-v2")

    # API server
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8080)
    debug: bool = Field(default=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
