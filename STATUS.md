# Project Status / Handoff

Last updated: 2026-05-31
Audience: Backend / Frontend / Full-stack / DevOps / DB engineer

---

## 1) Executive Summary

SpendSense AI is a monorepo for an AI-assisted personal finance app.

Current stack:

- Backend: FastAPI in `src/`, ASGI entrypoint `main.py`.
- Frontend: React + TypeScript + Vite in `frontend/`.
- Vision/OCR: YOLO/Ultralytics detection + VietOCR (`vgg_transformer`) text extraction.
- LLM: Gemini/Gemma REST calls through `GEMINI_API_KEY`.
- Database: PostgreSQL through SQLAlchemy async engine. Alembic manages schema migrations.

Most important current behavior:

- Visiting the frontend now shows a real login screen first.
- Login supports email/password, account registration, and Google Sign-In.
- Google login uses Google Identity Services in the frontend and server-side ID-token verification in the backend.
- If PostgreSQL is unavailable, auth routes fall back to a stateless development JWT so users can enter the app. This does not persist data.
- Receipt analysis does not require auth or database.
- Saving transactions still requires database if persistence is expected.
- Receipt review now supports item-level categories, per-line discounts, and a price-mode switch:
  - Default: `Tên món / SL / Đơn giá / Thành tiền / Khuyến mãi / Danh mục`.
  - Optional: `Tên món / Thành tiền / Khuyến mãi / Danh mục`, where quantity is saved as `1`.
  - Discount OCR tokens such as `-8.400` are attached to the nearest item row and subtracted from the row total.
- A new **Investment** feature provides real-time portfolio tracking (VN stocks, crypto, gold) and an AI-driven macro stress test with hedging recommendations.
- On startup the backend warms up the YOLO detector and VietOCR so the first receipt request is not penalized by cold model loading.

---

## 2) Implemented Since Last Handoff

### Alembic Migrations

Added (2026-05-25):

- `alembic.ini` at project root.
- `migrations/` directory with Alembic env and script template.
- Initial revision `df013ec94309_initial.py` creates all four tables:
  - `users`
  - `receipts`
  - `receipt_items`
  - `transactions`
- `alembic>=1.14.0` added to `pyproject.toml` dependencies.

Run migrations:

```powershell
uv run alembic upgrade head
```

Resolved (2026-05-31):

- The follow-up migration `dd69ecde196e_add_investment_tables.py` (down-revision `df013ec94309`) now adds the missing `category` column to `receipt_items`.
- The add is idempotent: it inspects existing columns and only adds `category` (`String(80)`, server default `'khac'`, `NOT NULL`) if it is not already present, otherwise it re-asserts the `NOT NULL` constraint.
- The same migration creates the two investment tables (see **Investment Module (PA3)** below).

### VietOCR Real Implementation

Implemented (2026-05-28) in `src/vision/ocr.py`:

- OCR now loads the real `vgg_transformer` VietOCR model (`vietocr>=0.3.7`).
- Predictor is loaded once via `@lru_cache` (singleton).
- Pillow 10 compatibility patch: `PIL.Image.ANTIALIAS = PIL.Image.LANCZOS` applied before loading VietOCR to avoid `AttributeError`.
- Full-image OCR path (`_run_ocr`):
  - Converts image to grayscale.
  - Splits into horizontal text bands via pixel projection (`row_min < 200`).
  - Runs VietOCR on each band.
  - Parses merchant from first line, total from last numeric run ≥ 4 digits.
- Field-level OCR path (`_ocr_detected_fields`):
  - Iterates YOLO detections, skips `store_name` class.
  - Crops each detection box (with 4px padding) and runs VietOCR.
  - Falls back to class-based placeholder text if VietOCR raises.
- Graceful fallback per class when model unavailable:
  - `quantity` → `"1"`
  - `price` → `"0"`
  - `item` → `"Unnamed item"`

### Feedback and Insights Routes

Added to `main.py` registration and `src/api/routes/`:

**Feedback** (`src/api/routes/feedback.py`):

- `POST /feedback/{insight_id}` — authenticated.
- `CONFIRM` (👍): keeps the insight vector in ChromaDB cache.
- `REJECT` (👎): deletes the insight vector from ChromaDB cache.

**Insights** (`src/api/routes/insights.py`):

- `GET /health` — public health check.
- `GET /insights` — paginated list of user insights from ChromaDB. Requires JWT.
- `GET /insights/{insight_id}` — single insight by ID from ChromaDB. Requires JWT.

### Auth And Login UI

Implemented earlier, documented here for completeness:

- New login gate in `frontend/src/App.tsx`.
- New login/register/Google page in `frontend/src/pages/LoginPage.tsx`.
- New auth context/session store in `frontend/src/lib/auth.tsx`.
- API client auth functions in `frontend/src/lib/api.ts`:
  - `loginWithPassword()`
  - `registerWithPassword()`
  - `loginWithGoogle()`
  - `getCurrentUser()`
- JWT and user are stored in localStorage:
  - `spendsense_token`
  - `spendsense_user`
- Logout button added to top bar in `frontend/src/components/layout/Navigation.tsx`.

Backend auth changes:

- `POST /auth/google` added in `src/api/routes/auth.py`.
- Google ID token is verified server-side using `google-auth`.
- `GOOGLE_CLIENT_ID` added to backend settings.
- `VITE_GOOGLE_CLIENT_ID` added to frontend env.
- `google-auth>=2.0.0` added to backend dependencies.
- Stateless dev auth fallback added for DB-offline development:
  - deterministic UUID from email via `user_id_from_email()`.
  - JWT includes `email`.
  - `/auth/me` can return token user if DB is unavailable.

### Receipt Item Categorization

- Each receipt item now has `category`.
- Valid category values:
  - `an-uong`, `di-chuyen`, `mua-sam`, `nha-o`, `suc-khoe`
  - `giai-tri`, `giao-duc`, `dau-tu`, `luong`, `thuong`, `khac`
- Receipt analysis classifies all item names in one Gemma request.
- If Gemma is unavailable/slow, local keyword fallback assigns common categories.
- Frontend review table has a category dropdown per item.
- Suggested transaction category is chosen by dominant item amount/category.

### Receipt Review Price Mode

Implemented in `frontend/src/components/AddTransactionModal.tsx`:

- Default mode: `Tên món / SL / Đơn giá / Thành tiền / Khuyến mãi / Danh mục`.
- `Thành tiền` mode: hides `SL` and `Đơn giá`, saves `quantity = 1`, and still shows `Khuyến mãi`.
- The top-right review control is now the price-mode switch; the transaction-level category selector was removed from the receipt review header.
- Original bill preview was widened for easier manual checking.
- The old "Token chưa gán" panel was removed.

### Receipt Line Discounts

Implemented (2026-05-29):

- `ReceiptItem` and receipt draft responses now include `discount`.
- `src/vision/reconstructor.py` detects negative price tokens (for example `-8.400`) as discounts.
- Discount tokens are matched to the nearest item row on the same line or immediately below it.
- Receipt totals and suggested transaction amounts use net line totals:

```text
net line total = (quantity * unit_price or line amount) - discount
```

- When saving a transaction, the frontend sends the net item amount back through the existing `unit_price`/`quantity` payload so no new DB migration is required for discounts yet.

### Dependency Compatibility Fixes

Implemented (2026-05-29):

- `bcrypt==4.0.1` is pinned in `pyproject.toml`.
- This avoids the `passlib==1.7.4` incompatibility with `bcrypt==5.0.0` that caused registration to crash during password hashing.

### Income Transaction Form

- When transaction type is `Thu nhập`: hides receipt upload/camera and item rows.

### Investment Module (PA3)

Implemented (2026-05-31):

New backend feature for real-time portfolio management and AI stress testing. All endpoints require JWT auth and are registered under the `/investment` prefix in `main.py`.

Endpoints (`src/api/routes/investment.py`):

- `GET /investment/profile` — returns the user's investment profile, auto-initializing a default (`risk_appetite="moderate"`, `capital=0`, `goal="Tự do tài chính"`) if none exists.
- `POST /investment/profile` — create/update profile (`risk_appetite`, `capital`, `goal`).
- `GET /investment/portfolio` — list assets with real-time valuations (`current_price`, `value`, `profit`, `profit_percent`).
- `POST /investment/portfolio` — add an asset (`symbol`, `name`, `type` ∈ stock/gold/saving/crypto, `quantity`, `purchase_price`, `color`).
- `DELETE /investment/portfolio/{asset_id}` — remove an asset (404 if not owned), returns 204.
- `GET /investment/stress-test` — runs market-shock simulation + Gemini advisory.

Market data (`src/core/market_data.py`), all normalized to VND:

- VN stocks via the `vnstock` library (KBS source); fallback to `DEFAULT_STOCK_PRICES`.
- Crypto via the Binance public ticker API; fallback to `DEFAULT_CRYPTO_PRICES_USD`.
- Gold via the SJC RSS feed (`sjc.com.vn/xml/tygia.xml`); fallback to a default gold price.
- Fixed `USD_VND_RATE = 25400`. External calls use httpx with a 5-second timeout and fall back gracefully on failure.

Stress tester (`src/core/stress_tester.py`):

- Four deterministic shock scenarios: high inflation, tech crash, market recession, crypto collapse.
- `diversification_score` (0–100) via Simpson's index of asset-type distribution.
- `vulnerability_score` (0–100) = worst scenario loss percentage.
- AI advisory via Gemini 2.5 Flash (`_call_gemini` in `src/llm/gemini_client.py`): returns `overall_analysis` plus `hedging_strategies`. Falls back to static recommendations if Gemini fails.
- No new environment variable; reuses `GEMINI_API_KEY`.

Frontend (`frontend/src/pages/InvestmentPage.tsx`, client functions in `frontend/src/lib/api.ts`):

- Real backend data, no longer mock. Portfolio CRUD, asset-allocation pie chart, and a stress-test tab with a vulnerability gauge and hedging cards.
- New API client functions: `getInvestmentProfile`, `saveInvestmentProfile`, `getPortfolio`, `addAsset`, `deleteAsset`, `getStressTest`.
- The portfolio growth curve is still mock history ending at the current portfolio value.

### Model Warm-up At Startup

Implemented (2026-05-31) in `main.py`:

- A FastAPI `lifespan` context manager runs `_warm_up_models()` before serving requests.
- `_warm_up_models()` calls `warm_up_detector()` (`src/vision/detector.py`) and `warm_up_ocr()` (`src/vision/ocr.py`), each wrapped in try/except that only logs a warning on failure.
- This loads YOLO weights and the VietOCR `vgg_transformer` predictor up front so the first `/receipts/analyze` request is not slowed by cold loading.

### Receipt Reconstruction Improvements

Implemented (2026-05-31) in `src/vision/reconstructor.py`:

- Field matching now anchors on item boxes (sorted by Y position) and matches quantity/price/discount boxes on the same receipt row using a y-distance score plus an x-position penalty.
- Handles orphan rows (quantity/price without a matching item name) more robustly.

### Initial Test Suite

Added (2026-05-31):

- A `tests/` directory now exists with `tests/test_investment.py` (pytest).
- Three tests: diversification score for a single asset (= 0), diversification for an even 4-type split (= 100), and a full stress-test calculation with a mocked profile/assets and patched Gemini call.
- This is the first automated test in the repo. Other modules (vision, pipeline, auth, cache) remain untested, so the repo-wide `--cov` gate in `pyproject.toml` (80%) is not met yet.

### Database Startup Behavior

- `main.py` does not initialize database tables at startup (only model warm-up runs in `lifespan`).
- DB initialization is lazy via `ensure_database()` called by auth routes.
- If DB is unavailable during auth, stateless dev auth fallback is used.

---

## 3) Project Architecture

### Frontend

Location: `frontend/`

Important files:

- `frontend/src/main.tsx` - React entry point.
- `frontend/src/App.tsx` - Auth gate and route definitions.
- `frontend/src/pages/LoginPage.tsx` - Login/register/Google Sign-In UI.
- `frontend/src/lib/auth.tsx` - Auth context and localStorage session.
- `frontend/src/lib/api.ts` - API client.
- `frontend/src/components/layout/AppLayout.tsx` - Shared app shell.
- `frontend/src/components/layout/Navigation.tsx` - Navigation, add-transaction trigger, logout.
- `frontend/src/components/AddTransactionModal.tsx` - Manual transaction, receipt upload/camera, receipt review UI.
- `frontend/src/data/mockData.ts` - Mock dashboard/analytics/goals/investment/settings data.
- `frontend/src/pages/*.tsx` - Main app pages.
- `frontend/src/index.css` - Global styles and modal sizing.

### Backend

Important files:

- `main.py` - FastAPI app creation, CORS, route registration, and `lifespan` model warm-up.
- `alembic.ini` - Alembic migration configuration.
- `migrations/` - Alembic migration scripts.
- `src/core/config.py` - Pydantic settings from `.env`.
- `src/db/base.py` - Async SQLAlchemy engine/session and lazy DB setup.
- `src/db/models.py` - SQLAlchemy models.
- `src/api/schemas.py` - Pydantic request/response DTOs.
- `src/api/routes/auth.py` - Email/password auth, Google auth, dev fallback auth.
- `src/auth/service.py` - JWT/password helpers.
- `src/auth/dependencies.py` - Bearer auth dependency with DB-offline fallback.
- `src/api/routes/receipts.py` - Public receipt image analysis endpoint.
- `src/api/routes/transactions.py` - Authenticated transaction create/list endpoints.
- `src/api/routes/feedback.py` - Insight feedback (confirm/reject) endpoint.
- `src/api/routes/insights.py` - Health check and ChromaDB-backed insights endpoints.
- `src/api/routes/investment.py` - Investment profile, portfolio CRUD, and stress-test endpoints.
- `src/core/market_data.py` - Real-time market prices (vnstock / Binance / SJC), normalized to VND.
- `src/core/stress_tester.py` - Deterministic market-shock simulation + Gemini hedging advisory.
- `src/pipeline.py` - Receipt analysis pipeline.
- `src/vision/detector.py` - YOLO detector with local/Hugging Face model loading.
- `src/vision/ocr.py` - VietOCR field OCR (`vgg_transformer`, field-level and full-image paths).
- `src/vision/reconstructor.py` - Receipt row reconstruction.
- `src/llm/gemini_client.py` - Gemini/Gemma REST client and fallback category classifier.
- `src/cache/vector_store.py` - ChromaDB semantic cache client.

### Tests

- `tests/test_investment.py` - First automated test (pytest); covers diversification scoring and the stress-test calculation.

### Frontend (investment)

- `frontend/src/pages/InvestmentPage.tsx` - Real-data portfolio management and AI stress-test UI.
- `frontend/src/lib/api.ts` - Investment client functions (`getInvestmentProfile`, `saveInvestmentProfile`, `getPortfolio`, `addAsset`, `deleteAsset`, `getStressTest`).

---

## 4) Feature Status

### 4.1 Authentication

Status: **Implemented for development / needs production hardening**

Implemented endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me`

Google login flow:

1. Frontend loads Google Identity Services script.
2. User signs in with Google.
3. Google returns an ID token credential to frontend.
4. Frontend sends credential to `POST /auth/google`.
5. Backend verifies token using `GOOGLE_CLIENT_ID`.
6. Backend creates or finds app user.
7. Backend returns app JWT and user response.

DB-offline development behavior:

- If PostgreSQL is down, email/password and Google flows return a stateless JWT.
- `/auth/me` reads user info from JWT payload.

Production risk:

- DB-offline fallback must be disabled or guarded before production.
- Password fallback does not verify persisted password when DB is unavailable.

### 4.2 Receipt Analysis

Status: **Implemented / model quality dependent**

Endpoint:

- `POST /receipts/analyze`

Auth:

- Not required.

Database:

- Not required.

Flow:

```text
Image upload
-> YOLO detect fields
-> VietOCR per field crop  (real model, vgg_transformer)
-> reconstruct receipt rows
-> classify item categories (Gemma or keyword fallback)
-> embed/cached insight path
-> return review draft
```

OCR implementation notes:

- VietOCR loaded once via `lru_cache`; first request will be slow while model loads.
- Pillow 10 compatibility patch applied automatically on load.
- `store_name` detections filtered out before frontend response.
- Falls back to class-based placeholder text per field if VietOCR raises.
- Negative price-like OCR values are treated as item discounts during row reconstruction.

Known limitations:

- OCR/detection quality depends on YOLO model and receipt image quality.
- Multi-line item names may need manual correction.
- Original receipt image is not stored.

### 4.3 Receipt Review UI

Status: **Implemented**

Features:

- Upload image / capture from camera.
- Wider original bill preview for manual checking.
- OCR-backed cells can be dragged between cells.
- Double-click cell to edit.
- Add/remove item rows.
- Per-item category dropdown.
- Price mode switch: `SL x đơn giá` / `Thành tiền`.
- Per-item discount column (`Khuyến mãi`).

### 4.4 Transaction Creation

Status: **Partially implemented**

Endpoint:

- `POST /transactions`

Requires:

- JWT auth.
- PostgreSQL if transaction should persist.

Behavior:

- Creates `ReceiptRecord` if receipt item rows exist.
- Creates `ReceiptItemRecord` rows (category field present in ORM; see migration gap in §5).
- Creates `Transaction`.

Known limitations:

- Uses `Float` for money/quantity.
- No dedicated `transaction_items` table.
- Main pages do not yet read saved transactions.

### 4.5 Insights and Feedback

Status: **Implemented (ChromaDB-backed)**

Endpoints:

- `GET /health` — public.
- `GET /insights` — paginated user insights from ChromaDB. Requires JWT.
- `GET /insights/{insight_id}` — single insight. Requires JWT.
- `POST /feedback/{insight_id}` — confirm/reject insight pattern. Requires JWT.

### 4.6 Dashboard / Analytics / Goals / Settings

Status: **Mock-data UI**

Frontend pages render from `frontend/src/data/mockData.ts`.

Not connected yet:

- Dashboard recent transactions.
- Analytics category breakdown.
- Goals, settings persistence.

(Investment is no longer mock — see 4.7.)

### 4.7 Investment And Stress Testing

Status: **Implemented (PA3)**

Endpoints (all require JWT):

- `GET /investment/profile`, `POST /investment/profile`
- `GET /investment/portfolio`, `POST /investment/portfolio`, `DELETE /investment/portfolio/{asset_id}`
- `GET /investment/stress-test`

Behavior:

- Portfolio assets are valued in real time using `src/core/market_data.py` (VN stocks via vnstock, crypto via Binance, gold via SJC RSS), normalized to VND with a fixed `USD_VND_RATE = 25400`.
- `GET /investment/stress-test` runs four deterministic market-shock scenarios, computes `diversification_score` (Simpson's index) and `vulnerability_score` (worst loss), and asks Gemini 2.5 Flash for an `overall_analysis` plus `hedging_strategies`, with a static fallback if Gemini is unavailable.
- Frontend `InvestmentPage.tsx` consumes these endpoints directly.

Known limitations:

- Money uses `Float` (`capital`, `quantity`, `purchase_price`); should become `Numeric`.
- The portfolio growth curve on the frontend is still mock history.
- External market-data sources are subject to network latency and rate limiting; all have hardcoded fallbacks.

---

## 5) Database Status

Database target:

- PostgreSQL via SQLAlchemy async engine.
- Default URL: `postgresql+asyncpg://spendsense:spendsense@localhost:5432/spendsense`

Migration tool: **Alembic** (now present).

Run to apply schema:

```powershell
uv run alembic upgrade head
```

### Implemented Tables

Base schema via revision `df013ec94309`; `category` column and investment tables via revision `dd69ecde196e`.

| Table | Key columns |
|---|---|
| `users` | id (uuid), email, hashed_password, created_at |
| `receipts` | id, user_id, merchant, purchase_date, total_amount, currency, raw_text, created_at |
| `receipt_items` | id, receipt_id, name, quantity, unit_price, total_price, category |
| `transactions` | id, user_id, receipt_id, type, amount, currency, category, description, merchant, transaction_date, created_at, updated_at |
| `investment_profiles` | id, user_id (UNIQUE), risk_appetite, capital, goal, created_at, updated_at |
| `investment_assets` | id, user_id, symbol, name, type, quantity, purchase_price, color, created_at, updated_at |

The `receipt_items.category` column (`String(80)`, server default `'khac'`, `NOT NULL`) is now created by revision `dd69ecde196e` (idempotent add-if-missing). The earlier migration gap is resolved.

### Still Missing

- `categories` table.
- `transaction_items` table.
- `detected_receipt_tokens` table.
- `receipt_review_assignments` table.
- SQL-backed `insights` (currently ChromaDB only).
- SQL-backed `feedback`.
- Budgets / goals / settings tables.
- `Numeric` money type (investment + transaction amounts still use `Float`).

---

## 6) API Contract Summary

### Auth

#### `POST /auth/register`

```json
{ "email": "user@example.com", "password": "minimum-6-characters" }
```

#### `POST /auth/login`

```json
{ "email": "user@example.com", "password": "minimum-6-characters" }
```

#### `POST /auth/google`

```json
{ "credential": "google-id-token" }
```

Auth response:

```json
{
  "access_token": "jwt-token",
  "user": { "id": "uuid", "email": "user@example.com", "created_at": "datetime" }
}
```

#### `GET /auth/me`

```http
Authorization: Bearer <jwt>
```

### Receipt Analysis

#### `POST /receipts/analyze`

- Auth: not required.
- Request: `multipart/form-data`, `file`: JPEG/PNG/WebP.
- Response includes: `insight`, `receipt`, `receipt.items[].category`, `receipt.items[].discount`, `suggested_transaction`, `detected_fields`.

### Transactions

#### `POST /transactions`

```http
Authorization: Bearer <jwt>
```

```json
{
  "type": "expense",
  "amount": 85000,
  "currency": "VND",
  "category": "an-uong",
  "description": "BUN SING, PEPSI",
  "merchant": "",
  "transaction_date": "2026-05-28",
  "receipt_id": null,
  "receipt_items": [
    { "name": "BUN SING", "quantity": 1, "unit_price": 42000, "category": "an-uong" }
  ]
}
```

Note:

- Receipt-review discounts are folded into the saved net `unit_price`/`quantity` payload until the DB schema gains a dedicated discount column.

### Insights

#### `GET /health`

Public. Returns `{ "status": "ok" }`.

#### `GET /insights`

```http
Authorization: Bearer <jwt>
```

Query params: `limit` (1–200, default 50), `offset` (default 0).

Response:

```json
{
  "items": [...],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

#### `GET /insights/{insight_id}`

```http
Authorization: Bearer <jwt>
```

### Feedback

#### `POST /feedback/{insight_id}`

```http
Authorization: Bearer <jwt>
```

```json
{ "action": "CONFIRM", "vector_id": "chroma-vector-id" }
```

or

```json
{ "action": "REJECT", "vector_id": "chroma-vector-id" }
```

### Investment

All investment endpoints require `Authorization: Bearer <jwt>`.

#### `GET /investment/profile`

Returns the user's profile, creating a default if none exists:

```json
{ "id": "uuid", "user_id": "uuid", "risk_appetite": "moderate", "capital": 0, "goal": "Tự do tài chính", "updated_at": "datetime" }
```

#### `POST /investment/profile`

```json
{ "risk_appetite": "moderate", "capital": 100000000, "goal": "Mua nhà" }
```

#### `GET /investment/portfolio`

Returns a list of assets with real-time valuations:

```json
[
  {
    "id": "uuid", "user_id": "uuid", "symbol": "FPT", "name": "FPT Corp", "type": "stock",
    "quantity": 100, "purchase_price": 120000, "current_price": 135000,
    "value": 13500000, "profit": 1500000, "profit_percent": 12.5, "color": "#5BAAEC", "updated_at": "datetime"
  }
]
```

#### `POST /investment/portfolio`

```json
{ "symbol": "FPT", "name": "FPT Corp", "type": "stock", "quantity": 100, "purchase_price": 120000, "color": "#5BAAEC" }
```

`type` ∈ `stock` | `gold` | `saving` | `crypto`.

#### `DELETE /investment/portfolio/{asset_id}`

Returns `204 No Content`. Returns `404` if the asset is not owned by the user.

#### `GET /investment/stress-test`

```json
{
  "portfolio_value": 60000000, "total_capital": 100000000, "idle_cash": 40000000,
  "vulnerability_score": 42.0, "diversification_score": 66.7,
  "worst_scenario": "Suy thoái thị trường", "worst_loss_percent": 42.0,
  "scenarios": [ { "id": "...", "name": "...", "simulated_value": 0, "loss_value": 0, "loss_percent": 0 } ],
  "assets": [ /* InvestmentAssetResponse */ ],
  "overall_analysis": "string (Vietnamese, from Gemini)",
  "hedging_strategies": [ { "asset": "...", "action": "...", "amount": 0, "reasoning": "..." } ]
}
```

---

## 7) Environment Variables

### Backend `.env`

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMMA_MODEL=gemma-4-31b-it
GEMMA_TIMEOUT_SECONDS=3
GOOGLE_CLIENT_ID=

YOLO_MODEL_PATH=
YOLO_MODEL_REPO=khoaaaaa/spendsense-receipt-yolo
YOLO_MODEL_FILENAME=receipt_items_yolov11s.pt
YOLO_MODEL_REVISION=main
YOLO_CONFIDENCE=0.3
HF_TOKEN=

SEMANTIC_CACHE_ENABLED=false
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DB
JWT_SECRET_KEY=change-me
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
```

Notes:

- `GOOGLE_CLIENT_ID` must match the OAuth Web Client ID from Google Cloud.
- `DATABASE_URL` is not needed for `/receipts/analyze`.
- `DATABASE_URL` is needed for persistent auth and transaction save.

### Frontend `.env`

```env
VITE_API_URL=http://localhost:8080
VITE_TIMEOUT_MS=10000
VITE_GOOGLE_CLIENT_ID=
```

---

## 8) Google Login Setup Step By Step

1. Open Google Cloud Console.
2. Create or select a project.
3. Go to **APIs & Services -> OAuth consent screen** and fill in the required fields.
4. Go to **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**.
5. Choose **Web application**. Add Authorized JavaScript origins: `http://localhost:5173`.
6. Copy the generated Client ID (`xxxxx.apps.googleusercontent.com`).
7. Set in backend `.env`: `GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com`
8. Set in frontend `.env`: `VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com`
9. Run `uv sync` and restart both services.

---

## 9) How To Run Locally

### Backend

```powershell
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --host 127.0.0.1 --port 8080 --log-level debug --no-access-log
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

### Clear stale auth session

Clear localStorage keys in the browser console:

```text
spendsense_token
spendsense_user
```

---

## 10) Verification Performed

- `python -m compileall src main.py` passed.
- `npx tsc -b` passed.
- `npm run build` passed.
- Receipt discount reconstruction was smoke-tested with `42.300` plus `-8.400`, producing net line total `33.900`.
- Password hashing smoke test passed with pinned `bcrypt==4.0.1` and `passlib==1.7.4`.
- `uv run pytest tests/test_investment.py` — 3 passed (2026-05-31).
- `python -m compileall main.py src` passed (2026-05-31).

Known test gap:

- Only `tests/test_investment.py` exists; vision, pipeline, auth, receipts, and cache have no tests.
- The `pyproject.toml` `--cov` gate (80%) is not met because coverage is measured repo-wide.
- No frontend test suite.

---

## 11) Known Issues / Risks

### P0

- Auth fallback when DB is down is development-only and must not be production behavior.
- Transaction save still requires PostgreSQL for persistence.
- Money is stored as `Float` (transactions and investment); should become `Numeric`.

### P1

- Dashboard/analytics pages still use mock data.
- No transaction list UI wired to `GET /transactions`.
- Receipt review token assignments are not persisted.
- No dedicated `transaction_items` table.
- No SQL-backed categories table.
- Google OAuth setup must be done manually in Google Cloud.
- Investment portfolio growth curve is mock history (frontend only).
- Investment market data depends on external sources (vnstock / Binance / SJC) with hardcoded fallbacks; live prices can be stale or rate-limited.

### P2

- Frontend has large bundle warning.
- No CI.
- No model download progress UI.
- Chroma semantic cache exists but is disabled by default (`SEMANTIC_CACHE_ENABLED=false`).

---

## 12) Recommended Next Steps

### P0

1. Replace money `Float` fields with `Numeric` in models and migrations (transactions and investment).
2. Decide how to disable DB-offline auth fallback outside local development.

### P1

1. Connect dashboard/recent transactions to `GET /transactions`.
2. Add transaction list and delete/edit flows.
3. Add `transaction_items` table or finalize `receipt_items` as confirmed item storage.
4. Add categories table and category management.
5. Expand tests beyond `tests/test_investment.py` to auth, receipt analyze, and transaction creation.
6. Expose a `/health/model` endpoint (warm-up already runs at startup via `lifespan`).

### P2

1. Add bundle splitting for frontend.
2. Add persistent receipt review metadata if reopening reviews is required.
3. Add deployment docs for backend + frontend + Google OAuth.
