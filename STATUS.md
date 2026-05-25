# Project Status / Handoff

Last updated: 2026-05-22  
Audience: Backend / Frontend / Full-stack / DevOps / DB engineer

---

## 1) Executive Summary

SpendSense AI is a monorepo for an AI-assisted personal finance app.

Current stack:

- Backend: FastAPI in `src/`, ASGI entrypoint `main.py`.
- Frontend: React + TypeScript + Vite in `frontend/`.
- Vision/OCR: YOLO/Ultralytics detection + VietOCR text extraction.
- LLM: Gemini/Gemma REST calls through `GEMINI_API_KEY`.
- Database: PostgreSQL through SQLAlchemy async engine. No SQLite fallback is used.

Most important current behavior:

- Visiting the frontend now shows a real login screen first.
- Login supports email/password, account registration, and Google Sign-In.
- Google login uses Google Identity Services in the frontend and server-side ID-token verification in the backend.
- If PostgreSQL is unavailable, auth routes fall back to a stateless development JWT so users can enter the app. This does not persist data.
- Receipt analysis does not require auth or database.
- Saving transactions still requires database if persistence is expected.
- Receipt review now supports item-level categories and a price-mode switch:
  - Default: `Tên món / SL / Đơn giá / Thành tiền / Danh mục`.
  - Optional: `Tên món / Thành tiền / Danh mục`, where quantity is saved as `1`.

---

## 2) Implemented Since Last Handoff

### Auth And Login UI

Implemented:

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

Important caveat:

- Stateless fallback is only for development when PostgreSQL is down. It lets the user enter the UI, but saved transactions are not durable unless PostgreSQL is available.

### Receipt Item Categorization

Implemented:

- Each receipt item now has `category`.
- Backend schema/model paths updated:
  - `src/models/expense.py`
  - `src/api/schemas.py`
  - `src/db/models.py`
  - `src/api/routes/transactions.py`
- Receipt analysis classifies all item names in one Gemma request using `GEMINI_API_KEY`.
- Valid category values:
  - `an-uong`
  - `di-chuyen`
  - `mua-sam`
  - `nha-o`
  - `suc-khoe`
  - `giai-tri`
  - `giao-duc`
  - `dau-tu`
  - `luong`
  - `thuong`
  - `khac`
- Frontend review table has a category dropdown per item.
- Suggested transaction category is chosen by dominant item amount/category.

Gemma/Gemini implementation:

- `src/llm/gemini_client.py` now uses Gemini REST API via `httpx`.
- Removed runtime use of deprecated `google.generativeai`.
- Removed `google-generativeai` dependency from `pyproject.toml` and root package metadata in `uv.lock`.
- `GEMMA_MODEL` added.
- `GEMMA_TIMEOUT_SECONDS` added.
- Item categorization uses a short timeout and no long retry loop.
- If Gemma is unavailable, slow, or returns API errors, local keyword fallback assigns common categories.
  - Example: `BUN`, `MI`, `COM`, `PEPSI`, `TRA` -> `an-uong`.

### Receipt Review Price Mode

Implemented in `frontend/src/components/AddTransactionModal.tsx`:

- Default mode keeps the original table:
  - `Tên món`
  - `SL`
  - `Đơn giá`
  - `Thành tiền`
  - `Danh mục`
- Added mode switch:
  - `SL x đơn giá`
  - `Thành tiền`
- In `Thành tiền` mode:
  - hides `SL`
  - hides `Đơn giá`
  - shows editable `Thành tiền`
  - saves `quantity = 1`
  - saves `unit_price = thành tiền`
- In `SL x đơn giá` mode:
  - saves actual quantity and unit price.

Backend receipt reconstruction change:

- `src/vision/reconstructor.py` treats detected `price` as line amount for receipt drafts because many Vietnamese receipts show line totals rather than unit prices.
- It sets `quantity = 1` and `unit_price = total_price = detected price` for reconstructed rows.
- Frontend still lets users switch back to `SL x đơn giá` and edit quantities manually.

### Income Transaction Form

Implemented:

- When transaction type is `Thu nhập`:
  - hide `Tên món hàng`.
  - hide receipt upload/camera entry.
  - do not create fake receipt item rows.
- When transaction type is `Chi tiêu`, behavior remains unchanged.

### Database Startup Behavior

Changed:

- `main.py` no longer initializes database tables during FastAPI startup.
- This prevents app startup from logging DB connection errors when only `/receipts/analyze` is needed.
- Database initialization is now attempted lazily by auth routes through `ensure_database()`.
- If DB is unavailable during auth, stateless dev auth fallback is used.

Still true:

- Transaction persistence and durable auth require PostgreSQL.
- No SQLite fallback is used.

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

Frontend behavior:

- If no valid local token exists, `LoginPage` is shown.
- If token exists, frontend calls `/auth/me`.
- Receipt analysis calls `POST /receipts/analyze` without auth.
- Saving a transaction calls `POST /transactions` with JWT.
- Main dashboard/analytics screens still use mock data.

### Backend

Important files:

- `main.py` - FastAPI app creation, CORS, route registration.
- `src/core/config.py` - Pydantic settings from `.env`.
- `src/db/base.py` - Async SQLAlchemy engine/session and lazy DB setup.
- `src/db/models.py` - SQLAlchemy models.
- `src/api/schemas.py` - Pydantic request/response DTOs.
- `src/api/routes/auth.py` - Email/password auth, Google auth, dev fallback auth.
- `src/auth/service.py` - JWT/password helpers.
- `src/auth/dependencies.py` - Bearer auth dependency with DB-offline fallback.
- `src/api/routes/receipts.py` - Public receipt image analysis endpoint.
- `src/api/routes/transactions.py` - Authenticated transaction create/list endpoints.
- `src/pipeline.py` - Receipt analysis pipeline.
- `src/vision/detector.py` - YOLO detector with local/Hugging Face model loading.
- `src/vision/ocr.py` - VietOCR field OCR.
- `src/vision/reconstructor.py` - Receipt row reconstruction.
- `src/llm/gemini_client.py` - Gemini/Gemma REST client and fallback category classifier.
- `src/cache/vector_store.py` - ChromaDB semantic cache client.

---

## 4) Feature Status

### 4.1 Authentication

Status: **Implemented for development / needs production hardening**

Implemented endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me`

Frontend implemented:

- Email/password login.
- Email/password registration.
- Google Sign-In button.
- Logout.
- Session restore.

Google login flow:

1. Frontend loads Google Identity Services script.
2. User signs in with Google.
3. Google returns an ID token credential to frontend.
4. Frontend sends credential to `POST /auth/google`.
5. Backend verifies token using `GOOGLE_CLIENT_ID`.
6. Backend creates or finds app user.
7. Backend returns app JWT and user response.

DB-offline development behavior:

- If PostgreSQL is down:
  - email/password login/register returns stateless JWT if basic validation passes.
  - Google login still verifies Google token, then returns stateless JWT.
  - `/auth/me` can read user info from JWT payload.

Production risk:

- DB-offline fallback should be disabled or guarded before production.
- Password login fallback does not verify a persisted password because DB is unavailable. It is intended only for local development.

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
-> VietOCR per field crop
-> reconstruct receipt rows
-> classify item categories
-> embed/cached insight path
-> return review draft
```

Current behavior:

- `store_name` detections are filtered out before frontend response.
- Detected item rows are editable in the UI.
- Item categories are returned per row.
- If Gemma classification fails, keyword fallback is used.

Known limitations:

- OCR/detection quality depends heavily on the YOLO model and receipt image.
- Multi-line item names may need manual correction.
- Token assignments are not persisted.
- Original receipt image is not stored.

### 4.3 Receipt Review UI

Status: **Implemented**

Features:

- Upload image.
- Capture image from camera.
- Original bill preview.
- Detected token list.
- Drag token into cells.
- Double-click cell to edit.
- Add/remove item rows.
- Per-item category dropdown.
- Price mode switch:
  - `SL x đơn giá`
  - `Thành tiền`

Default columns:

```text
Tên món | SL | Đơn giá | Thành tiền | Danh mục
```

Line-amount mode columns:

```text
Tên món | Thành tiền | Danh mục
```

### 4.4 Transaction Creation

Status: **Partially implemented**

Endpoint:

- `POST /transactions`

Requires:

- JWT auth.
- PostgreSQL if transaction should persist.

Behavior:

- Creates `ReceiptRecord` if receipt item rows exist.
- Creates `ReceiptItemRecord` rows.
- Creates `Transaction`.
- Supports item category in receipt item input.

Known limitations:

- Uses `Float` for money/quantity.
- No dedicated `transaction_items` table.
- Main pages do not yet read saved transactions.

### 4.5 Dashboard / Analytics / Goals / Investment / Settings

Status: **Mock-data UI**

Frontend pages render from:

- `frontend/src/data/mockData.ts`

Not connected yet:

- Dashboard recent transactions.
- Analytics category breakdown.
- Goals persistence.
- Investment persistence.
- Settings persistence.

---

## 5) Database Status

Database target:

- PostgreSQL via SQLAlchemy async engine.
- Default code-level URL:
  - `postgresql+asyncpg://spendsense:spendsense@localhost:5432/spendsense`

Implemented SQLAlchemy tables:

- `users`
- `receipts`
- `receipt_items`
- `transactions`

Current `receipt_items` fields include:

- `id`
- `receipt_id`
- `name`
- `quantity`
- `unit_price`
- `total_price`
- `category`

Missing:

- Alembic migrations.
- `categories`.
- `transaction_items`.
- `detected_receipt_tokens`.
- `receipt_review_assignments`.
- SQL-backed `insights`.
- SQL-backed `feedback`.
- Budgets/goals/investment/settings tables.

Important:

- `main.py` does not create tables at startup anymore.
- `ensure_database()` is lazy and currently called by auth routes.
- No SQLite fallback is used.

---

## 6) API Contract Summary

### Auth

#### `POST /auth/register`

```json
{
  "email": "user@example.com",
  "password": "minimum-6-characters"
}
```

#### `POST /auth/login`

```json
{
  "email": "user@example.com",
  "password": "minimum-6-characters"
}
```

#### `POST /auth/google`

```json
{
  "credential": "google-id-token"
}
```

Auth response:

```json
{
  "access_token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "datetime"
  }
}
```

#### `GET /auth/me`

Requires:

```http
Authorization: Bearer <jwt>
```

### Receipt Analysis

#### `POST /receipts/analyze`

Auth:

- Not required.

Request:

- `multipart/form-data`
- `file`: JPEG/PNG/WebP

Response includes:

- `insight`
- `receipt`
- `receipt.items[].category`
- `suggested_transaction`
- `detected_fields`

### Transactions

#### `POST /transactions`

Requires:

```http
Authorization: Bearer <jwt>
```

Request shape:

```json
{
  "type": "expense",
  "amount": 85000,
  "currency": "VND",
  "category": "an-uong",
  "description": "BUN SING, PEPSI",
  "merchant": "",
  "transaction_date": "2026-05-22",
  "receipt_id": null,
  "receipt_items": [
    {
      "name": "BUN SING",
      "quantity": 1,
      "unit_price": 42000,
      "category": "an-uong"
    }
  ]
}
```

---

## 7) Environment Variables

### Backend `.env`

Important variables:

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
- `GEMMA_MODEL` may need adjustment if the selected model is not available for the key/project.
- `DATABASE_URL` is not needed for `/receipts/analyze`.
- `DATABASE_URL` is needed for persistent auth and transaction save.

### Frontend `.env`

```env
VITE_API_URL=http://localhost:8080
VITE_TIMEOUT_MS=10000
VITE_GOOGLE_CLIENT_ID=
```

Notes:

- `VITE_GOOGLE_CLIENT_ID` must equal backend `GOOGLE_CLIENT_ID`.
- After changing frontend `.env`, restart Vite.

---

## 8) Google Login Setup Step By Step

1. Open Google Cloud Console.
2. Create or select a project.
3. Go to **APIs & Services -> OAuth consent screen**.
4. Choose External or Internal.
5. Fill app name, support email, developer contact email.
6. Save.
7. Go to **APIs & Services -> Credentials**.
8. Click **Create credentials -> OAuth client ID**.
9. Choose **Web application**.
10. Add Authorized JavaScript origins:

```text
http://localhost:5173
```

If Vite runs on another port, add that origin too.

11. Copy the generated Client ID, for example:

```text
xxxxx.apps.googleusercontent.com
```

12. Backend `.env`:

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

13. Frontend `.env`:

```env
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

14. Install/sync backend dependencies:

```powershell
uv sync
```

15. Restart backend and frontend.

---

## 9) How To Run Locally

### Backend

```powershell
cd D:\HOC_KI_6\CNPM-AI\Spend-Sense-AI
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port 8080 --log-level debug --no-access-log
```

### Frontend

```powershell
cd D:\HOC_KI_6\CNPM-AI\Spend-Sense-AI\frontend
npm install
npm run dev
```

### Clear stale auth session

If auth state is stuck, clear localStorage keys:

```text
spendsense_token
spendsense_user
```

---

## 10) Verification Performed

Recent checks:

- `python -m compileall src main.py` passed.
- `npx tsc -b` passed.
- Targeted ESLint passed for changed frontend auth/layout/API files.
- `npm run build` passed after login UI changes.

Known test gap:

- No automated backend or frontend test suite is present.
- `pyproject.toml` has pytest config but no `tests/` directory.

---

## 11) Known Issues / Risks

### P0

- No Alembic migrations.
- Auth fallback when DB is down is development-only and must not be production behavior.
- Transaction save still requires PostgreSQL for persistence.
- Money is stored as `Float`; should become `Numeric`.

### P1

- Dashboard/analytics pages still use mock data.
- No transaction list UI wired to `GET /transactions`.
- Receipt review token assignments are not persisted.
- No dedicated `transaction_items` table.
- No SQL-backed categories table.
- Google OAuth setup must be done manually in Google Cloud.

### P2

- Frontend has large bundle warning.
- No CI.
- No model download progress UI.
- Chroma semantic cache exists but is disabled by default.

---

## 12) Recommended Next Steps

### P0

1. Add Alembic migrations for current models.
2. Decide how to disable DB-offline auth fallback outside local development.
3. Replace money `Float` fields with `Numeric`.
4. Ensure PostgreSQL local/dev setup docs are clear.

### P1

1. Connect dashboard/recent transactions to `GET /transactions`.
2. Add transaction list and delete/edit flows.
3. Add `transaction_items` table or finalize `receipt_items` as confirmed item storage.
4. Add categories table and category management.
5. Add tests for auth, receipt analyze, and transaction creation.

### P2

1. Add bundle splitting.
2. Add persistent receipt review metadata if reopening reviews is required.
3. Add deployment docs for backend + frontend + Google OAuth.
