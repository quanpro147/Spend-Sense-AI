"""
Standardized observation contract for every tool in the harness.

Every tool MUST return a ToolResult so the orchestrator can:
  - branch on status without inspecting payload shape
  - surface next_actions to guide the next step
  - extract artifacts (file paths / IDs) for downstream tools
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ToolStatus(str, Enum):
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


class ToolResult(BaseModel):
    status: ToolStatus
    summary: str = Field(description="One-line human-readable result")
    data: Any | None = Field(default=None, description="Tool output payload")
    next_actions: list[str] = Field(
        default_factory=list,
        description="Actionable follow-up steps for the orchestrator",
    )
    artifacts: dict[str, str] = Field(
        default_factory=dict,
        description="Named references: file paths, IDs, keys",
    )
    error_hint: str | None = Field(
        default=None,
        description="Root-cause hint when status=error; includes safe retry info",
    )

    @classmethod
    def success(
        cls,
        summary: str,
        data: Any = None,
        next_actions: list[str] | None = None,
        artifacts: dict[str, str] | None = None,
    ) -> "ToolResult":
        return cls(
            status=ToolStatus.SUCCESS,
            summary=summary,
            data=data,
            next_actions=next_actions or [],
            artifacts=artifacts or {},
        )

    @classmethod
    def warning(
        cls,
        summary: str,
        data: Any = None,
        next_actions: list[str] | None = None,
        error_hint: str | None = None,
    ) -> "ToolResult":
        return cls(
            status=ToolStatus.WARNING,
            summary=summary,
            data=data,
            next_actions=next_actions or [],
            error_hint=error_hint,
        )

    @classmethod
    def error(
        cls,
        summary: str,
        error_hint: str,
        next_actions: list[str] | None = None,
    ) -> "ToolResult":
        return cls(
            status=ToolStatus.ERROR,
            summary=summary,
            error_hint=error_hint,
            next_actions=next_actions or ["Inspect error_hint", "Retry with corrected input", "Abort pipeline if unrecoverable"],
        )

    @property
    def ok(self) -> bool:
        return self.status == ToolStatus.SUCCESS

    @property
    def failed(self) -> bool:
        return self.status == ToolStatus.ERROR
