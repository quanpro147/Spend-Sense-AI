# SpendSense AI — FastAPI backend (Application Server node in docs/deployment.md).
#
# Runs uvicorn :8080 with the AI models (YOLOv11, VietOCR, all-MiniLM) in-process.
# Model weights are NOT baked in — they download from Hugging Face on first run
# and are cached on the `model-cache` volume mounted by docker-compose.
#
# Note: sentence-transformers / vietocr / ultralytics pull in PyTorch, so the
# resulting image is large (multiple GB). Build expects a populated uv.lock.

FROM python:3.13-slim

# uv: fast, reproducible installs from uv.lock
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Runtime system libs:
#   libglib2.0-0 — required by opencv-python-headless
#   libgomp1     — OpenMP runtime for torch / onnxruntime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Hugging Face / Torch caches live on a mounted volume so weights persist
# across container restarts instead of re-downloading every boot.
ENV HF_HOME=/app/.cache/huggingface \
    TORCH_HOME=/app/.cache/torch \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

# 1) Install third-party deps first (cached layer — only busts when lockfile changes).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) Copy source and install the project itself.
COPY . .
RUN uv sync --frozen --no-dev

# Put the venv on PATH so `uvicorn` resolves without `uv run`.
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8080

# Production server: no --reload (that is dev-only in main.run()).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
