"""
Gemini 2.5 Flash client — stub.

Replace _call_gemini() with real google-generativeai call when ready.
Keep prompts concise — never verbose system prompts.
"""

from __future__ import annotations

import uuid

from src.core.tool_result import ToolResult
from src.models.expense import Insight, InsightSource, Receipt


_PROMPT_TEMPLATE = """Analyze this receipt and respond in JSON only.

Receipt:
{receipt_text}

Respond with exactly this JSON structure:
{{
  "summary": "<one sentence describing the spending>",
  "category": "<single category: Food, Transport, Shopping, Health, Entertainment, Other>",
  "tips": ["<tip 1>", "<tip 2>"]
}}"""


def generate_insight(receipt: Receipt) -> ToolResult:
    """
    Call Gemini to generate a financial insight for a receipt.

    Args:
        receipt: parsed Receipt model

    Returns:
        ToolResult.data = Insight
    """
    prompt = _PROMPT_TEMPLATE.format(receipt_text=receipt.canonical_text)

    try:
        raw_json = _call_gemini(prompt)
    except NotImplementedError:
        insight = _stub_insight(receipt)
        return ToolResult.warning(
            summary="Gemini not configured — returning stub insight",
            data=insight,
            next_actions=["Store stub insight in cache", "Set GEMINI_API_KEY to enable real generation"],
            error_hint="GEMINI_API_KEY not set or google-generativeai not initialised.",
        )
    except Exception as exc:
        return ToolResult.error(
            summary="Gemini API call failed",
            error_hint=f"{type(exc).__name__}: {exc}. Check GEMINI_API_KEY and quota.",
            next_actions=["Retry after backoff", "Check API quota in Google Cloud console"],
        )

    try:
        parsed = _parse_response(raw_json)
    except Exception as exc:
        return ToolResult.error(
            summary="Failed to parse Gemini response",
            error_hint=f"JSON parse error: {exc}. Raw response: {raw_json[:200]}",
            next_actions=["Retry with same prompt", "Check prompt template format"],
        )

    insight = Insight(
        receipt_id=receipt.id,
        summary=parsed["summary"],
        category=parsed["category"],
        tips=parsed.get("tips", []),
        source=InsightSource.LLM,
    )
    return ToolResult.success(
        summary=f"Insight generated: {insight.category}",
        data=insight,
        next_actions=["Store insight vector in cache"],
        artifacts={"insight_id": str(insight.id)},
    )


def _call_gemini(prompt: str) -> str:
    """Plug real google.generativeai.GenerativeModel call here."""
    raise NotImplementedError


def _parse_response(raw_json: str) -> dict:
    import json
    # strip markdown code fences if present
    text = raw_json.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def _stub_insight(receipt: Receipt) -> Insight:
    return Insight(
        id=uuid.uuid4(),
        receipt_id=receipt.id,
        summary=f"Spent {receipt.total_amount:,.0f} {receipt.currency} at {receipt.merchant}.",
        category="Other",
        tips=["Track your spending regularly.", "Compare prices before purchasing."],
        source=InsightSource.LLM,
    )
