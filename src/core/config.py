from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    gemini_model: str = Field(default="gemini-2.5-flash")
    gemma_model: str = Field(default="gemma-4-31b-it")
    gemma_timeout_seconds: float = Field(default=3.0, gt=0)
    google_client_id: str = Field(default="")
    fireant_api_key: str = Field(default="")

    # Vector store (ChromaDB)
    chroma_host: str = Field(default="localhost")
    chroma_port: int = Field(default=8000)
    chroma_collection: str = Field(default="receipt_insights")

    # Semantic cache threshold
    similarity_threshold: float = Field(default=0.9, ge=0.0, le=1.0)
    semantic_cache_enabled: bool = Field(default=False)

    # Vision model paths
    yolo_model_path: str = Field(default="src/models/yolo/receipt_items_yolov11s.pt")
    yolo_model_repo: str = Field(default="")
    yolo_model_filename: str = Field(default="receipt_items_yolov11s.pt")
    yolo_model_revision: str = Field(default="main")
    yolo_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    hf_token: str = Field(default="")

    # Embedding
    embedding_model: str = Field(default="all-MiniLM-L6-v2")

    # API server
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8080)
    debug: bool = Field(default=False, validation_alias="SPENDSENSE_DEBUG")

    # PostgreSQL
    database_url: str = Field(default="postgresql+asyncpg://spendsense:spendsense@localhost:5432/spendsense")

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            value = value.replace("postgres://", "postgresql+asyncpg://", 1)
        elif value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    # JWT
    jwt_secret_key: str = Field(default="changeme-use-a-real-secret-in-production")
    jwt_algorithm: str = Field(default="HS256")
    jwt_expire_minutes: int = Field(default=1440)  # 24h


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
