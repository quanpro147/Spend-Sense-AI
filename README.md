# SpendSense AI

AI-powered personal expense management. Photograph a receipt → get itemized data + financial insights, with minimal LLM cost via semantic caching.

---

## Architecture Flow

```
Receipt Image
     │
     ▼
[YOLOv11]               ── detect & crop receipt region
     │
     ▼
[VietOCR]               ── extract items, prices, date, merchant
     │
     ▼
[Sentence-Transformers] ── embed receipt text → float vector
     │
     ▼
[ChromaDB]              ── cosine similarity search (threshold 0.9)
     │
     ├── HIT  → return cached insight  (0 LLM tokens spent)
     │
     └── MISS → [Gemini 2.5 Flash] → generate + cache insight
                         │
                  [Feedback Loop]
                   👍 confirm pattern
                   👎 delete pattern (unlearn)
```

---

## Directory Structure

```
Spend-Sense-AI/                    # monorepo root
│
├── main.py                        # FastAPI app entry point (uvicorn target)
├── pyproject.toml                 # Python deps + uv config
├── .env                           # secrets — never commit
├── .env.example                   # .env template for onboarding
│
├── src/                           # Python backend package
│   │
│   ├── core/                      # shared infrastructure
│   │   ├── config.py              #   pydantic-settings (loads .env)
│   │   ├── tool_result.py         #   ToolResult observation contract
│   │   └── logging.py             #   structlog structured logger
│   │
│   ├── models/                    # Pydantic domain models
│   │   └── expense.py             #   ReceiptItem, Receipt, Insight, FeedbackAction
│   │
│   ├── vision/                    # CV pipeline  [stub — plug real model later]
│   │   ├── detector.py            #   YOLOv11 receipt region detection
│   │   └── ocr.py                 #   VietOCR text + price extraction
│   │
│   ├── embedding/                 # vector embedding  [stub]
│   │   └── embedder.py            #   sentence-transformers wrapper
│   │
│   ├── cache/                     # semantic cache  [fully implemented]
│   │   └── vector_store.py        #   ChromaDB: upsert / lookup / delete
│   │
│   ├── llm/                       # LLM integration  [stub]
│   │   └── gemini_client.py       #   Gemini 2.5 Flash: prompt + parse
│   │
│   ├── pipeline.py                # orchestrator: chains tools, handles errors
│   │
│   └── api/                       # HTTP layer
│       ├── schemas.py             #   request / response Pydantic schemas
│       └── routes/
│           ├── receipts.py        #   POST /receipts/analyze
│           ├── insights.py        #   GET  /insights, GET /insights/{id}
│           └── feedback.py        #   POST /feedback/{insight_id}
│
├── tests/
│   ├── conftest.py
│   ├── test_tool_result.py
│   ├── test_vector_store.py
│   ├── test_pipeline.py
│   └── test_api/
│       ├── test_receipts.py
│       ├── test_insights.py
│       └── test_feedback.py
│
└── frontend/                      # React + TypeScript SPA
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── .env.example               #   VITE_API_URL=http://localhost:8080
    │
    └── src/
        ├── main.tsx
        ├── App.tsx
        │
        ├── pages/
        │   ├── DashboardPage.tsx
        │   ├── AnalyticsPage.tsx
        │   ├── GoalsPage.tsx
        │   ├── InvestmentPage.tsx
        │   └── SettingsPage.tsx
        │
        ├── components/
        │   ├── layout/
        │   │   ├── AppLayout.tsx
        │   │   └── Navigation.tsx
        │   ├── AddTransactionModal.tsx
        │   └── ui/                #   shadcn/ui primitives
        │
        ├── lib/
        │   └── utils.ts
        └── data/
            └── mockData.ts        #   replace with real API calls later
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/receipts/analyze` | Upload receipt image → insight |
| `GET` | `/insights` | List cached insights (paginated) |
| `GET` | `/insights/{id}` | Single insight detail |
| `POST` | `/feedback/{insight_id}` | 👍/👎 reinforce or unlearn a pattern |
| `GET` | `/health` | Liveness check |

---

## Request Flow

```
POST /receipts/analyze
  1. detect_receipt(image_bytes)    → cropped region
  2. extract_text(region)           → raw OCR text + items[]
  3. embed(canonical_text)          → float[] vector
  4. cache_lookup(vector)           →
       HIT  → InsightResult (source="cache")
       MISS → generate_insight() → store → InsightResult (source="llm")
  5. return InsightResponse
```

Each step returns `ToolResult(status, summary, data, next_actions, error_hint)`.
The orchestrator stops on `status=error` and surfaces `error_hint` to the API layer.

---

## How to Run

```bash
# 1. Vector DB — start FIRST, keep running in its own terminal
uv run chroma run --host localhost --port 8000 --path ./chroma_data
#   or via Docker:
#   docker run -p 8000:8000 -v "$PWD/chroma_data:/chroma/chroma" chromadb/chroma

# 2. Backend
uv sync
cp .env.example .env        # fill in GEMINI_API_KEY
uv run uvicorn main:app --reload --port 8080

# 3. Frontend
cd frontend
npm install
cp .env.example .env         # set VITE_API_URL / VITE_GOOGLE_CLIENT_ID
npm run dev                  # Vite on :5173

# Tests
uv run pytest
```

ChromaDB host/port/collection are configured via `CHROMA_HOST`, `CHROMA_PORT`,
`CHROMA_COLLECTION` in `.env` (defaults: `localhost:8000`, `receipt_insights`).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Object Detection | YOLOv11 (Ultralytics) |
| OCR | VietOCR (vgg_transformer) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| Vector DB | ChromaDB (dev) → Milvus (prod) |
| LLM | Gemini 2.5 Flash |
| Backend | Python 3.13, FastAPI, uvicorn |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Radix UI |
| Package Manager | uv (backend), npm (frontend) |
