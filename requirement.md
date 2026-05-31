# SpendSenseAI — Tài liệu Kiến trúc Hệ thống

> **Mục đích tài liệu:** Hướng dẫn cho AI coder implement toàn bộ hệ thống SpendSenseAI từ đầu.  
> **Kiến trúc tổng quan:** Microservices + Event-Driven Architecture

---

## Mục lục

1. [Tech Stack](#1-tech-stack)
2. [Sơ đồ Kiến trúc Hệ thống](#2-sơ-đồ-kiến-trúc-hệ-thống)
3. [Các Service & Trách nhiệm](#3-các-service--trách-nhiệm)
4. [Models & AI Components](#4-models--ai-components)
5. [5 Luồng Dữ liệu Chính](#5-5-luồng-dữ-liệu-chính)
6. [Database Schema (Gợi ý)](#6-database-schema-gợi-ý)
7. [API Contracts](#7-api-contracts)
8. [Thứ tự Build (Roadmap cho Coder)](#8-thứ-tự-build-roadmap-cho-coder)

---

## 1. Tech Stack

| Layer | Công nghệ | Lý do chọn |
|---|---|---|
| **Backend** | Python + FastAPI | Async native, tốt nhất cho AI/ML libs |
| **Frontend** | React + TypeScript | Cross-platform iOS/Android, type safety |
| **Database chính** | PostgreSQL (Supabase) | ACID transactions, phù hợp dữ liệu tài chính |
| **Vector DB** | ChromaDB | Lưu embedding cho Semantic Cache |
| **Message Queue** | RabbitMQ + Celery | Async processing các tác vụ nặng |
| **Cache** | Redis | Session cache, tốc độ cực nhanh |
| **Core LLM** | Gemini 2.5 Flash | Phân tích ngữ cảnh, xu hướng thị trường |
| **Computer Vision** | YOLOv11 | Detect vùng thông tin trên hóa đơn/ảnh |
| **OCR** | VietOCR | Trích xuất chữ từ ảnh hóa đơn |
| **LLM Router** | Semantic Router | Kiểm tra cache, gán nhãn danh mục |
| **Investment Agent** | ReAct Agent + Gemini | Phân tích thị trường, gợi ý đầu tư |

---

## 2. Sơ đồ Kiến trúc Hệ thống

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                   │
│              Mobile App (React Native + TypeScript)                   │
│              Web App    (React + TypeScript)                          │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                                   │
│   - Auth & Authorization (JWT)                                        │
│   - Rate Limiting                                                     │
│   - Request Routing → các service bên dưới                           │
└───┬──────────┬──────────┬──────────────┬──────────────┬──────────────┘
    │          │          │              │              │
    ▼          ▼          ▼              ▼              ▼
┌───────┐ ┌───────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐
│ Data  │ │ Txn & │ │  Goal    │ │ Invest   │ │ Reporting │
│Ingest │ │Wallet │ │ Tracking │ │ Service  │ │ Service   │
│Service│ │Service│ │ Service  │ │          │ │           │
└───┬───┘ └───┬───┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘
    │         │          │            │              │
    ▼         │          │            │              │
┌───────────────────────────────────────────────────────────────────┐
│                    MESSAGE BROKER (RabbitMQ + Celery)              │
│   - Async processing: OCR, LLM calls, Report generation           │
└─────────────┬───────────────────────────────────────────────────┘
              │
    ┌─────────┴──────────┐
    ▼                    ▼
┌─────────┐       ┌─────────────────────────────────┐
│ AI/LLM  │       │        DATA LAYER               │
│ Engine  │       │  PostgreSQL (Supabase)           │
│         │       │  Redis (Session + Short Cache)  │
│ Gemini  │       │  ChromaDB (Vector/Semantic Cache)│
│ 2.5 Flash│      └─────────────────────────────────┘
└────┬────┘
     │
     ▼
┌─────────────────────────────┐
│      EXTERNAL APIs          │
│  - Gemini API               │
│  - Market APIs              │
│    (stocks, gold, crypto,   │
│     banking interest rates) │
└─────────────────────────────┘
```

---

## 3. Các Service & Trách nhiệm

### 3.1 Data Ingestion Service

**Nhiệm vụ:** Cổng vào duy nhất cho mọi dữ liệu tài chính.

**Input nhận vào:**
- Ảnh hóa đơn (JPEG/PNG)
- Ảnh chụp màn hình giao dịch ngân hàng
- Dữ liệu nhập thủ công từ client

**Processing pipeline:**
```
Input
  │
  ├─ Nếu là ảnh ──► YOLOv11 (detect vùng thông tin)
  │                    │
  │                    ▼
  │              VietOCR (extract text)
  │                    │
  │                    ▼
  └─ Nếu là text ──► Semantic Router
                         │
                ┌────────┴────────┐
                │                 │
        Cache hit?           Cache miss
                │                 │
         Lấy từ              Gọi Gemini LLM
         ChromaDB            (phân tích + gán nhãn)
                │                 │
                └────────┬────────┘
                         ▼
                  Chuẩn hóa dữ liệu
                         │
                         ▼
                  Publish → Message Queue
```

**Tech:** FastAPI endpoint, Celery worker, YOLOv11, VietOCR

---

### 3.2 Transaction & Wallet Service

**Nhiệm vụ:** Cập nhật số dư, quản lý thu chi.

**Logic nghiệp vụ cốt lõi:**
```
Số dư hiện tại = Số dư cũ + Thu nhập - Chi tiêu
```

**Thao tác chính:**
- `POST /transactions` — Ghi nhận giao dịch mới
- `GET /wallet/balance` — Trả về số dư + lịch sử
- `GET /wallet/summary?period=weekly` — Tổng hợp theo kỳ

**Kết nối:** PostgreSQL (Supabase) cho mọi write/read giao dịch.

---

### 3.3 Goal Tracking Service

**Nhiệm vụ:** Theo dõi tiến độ mục tiêu tài chính, gửi cảnh báo.

**Logic nghiệp vụ:**
```python
# Kiểm tra mục tiêu
actual_saving_rate = (income - expense) / income
if actual_saving_rate < target_saving_rate:
    trigger_alert(user_id, type="OVERSPEND")

# Gửi cảnh báo sớm
if expense_today > (monthly_budget / days_in_month) * 1.2:
    trigger_alert(user_id, type="DAILY_BUDGET_WARNING")
```

**Alert channels:** Push notification, in-app notification.

---

### 3.4 Investment Service

**Nhiệm vụ:** Tính toán tiền nhàn rỗi, đánh giá rủi ro, sinh gợi ý đầu tư.

**Logic nghiệp vụ:**
```
Tiền nhàn rỗi = Thu nhập - (Chi tiêu cố định + Quỹ khẩn cấp)
```

**Pipeline:**
```
Tiền nhàn rỗi
      │
      ▼
Đánh giá Risk Profile
(từ onboarding questionnaire hoặc hành vi lịch sử)
      │
      ▼
Fetch Market Data APIs
(chứng khoán, vàng, crypto, lãi suất ngân hàng)
      │
      ▼
ReAct Agent + Gemini 2.5 Flash
(phân tích xu hướng ngắn hạn)
      │
      ▼
Sinh gợi ý danh mục đầu tư
(phân bổ % theo risk profile + thị trường)
```

---

### 3.5 AI/LLM Engine

**Nhiệm vụ:** Trung tâm xử lý AI — nhận yêu cầu từ các service khác.

| Tác vụ | Model sử dụng | Ghi chú |
|---|---|---|
| Phân loại giao dịch | Gemini 2.5 Flash | Sau khi OCR extract text |
| Phân tích xu hướng thị trường | Gemini 2.5 Flash | Input: market data từ APIs |
| Semantic cache check | Semantic Router + ChromaDB | Trước khi gọi LLM tốn kém |
| Investment recommendations | ReAct Agent + Gemini | Multi-step reasoning |

**Semantic Cache flow:**
```python
query_embedding = embed(user_query)
cached = chromadb.similarity_search(query_embedding, threshold=0.92)
if cached:
    return cached.result       # Không tốn API call
else:
    result = gemini.generate(user_query)
    chromadb.store(query_embedding, result)
    return result
```

---

### 3.6 Reporting Service

**Nhiệm vụ:** Tạo báo cáo và biểu đồ thống kê.

**Output:**
- Báo cáo chi tiêu hàng ngày / hàng tuần
- Biểu đồ phân loại chi tiêu (pie chart theo category)
- Biểu đồ xu hướng thu chi theo thời gian (line chart)
- Export PDF / chia sẻ

**Chạy async** qua Celery worker để không block UI.

---

### 3.7 Message Broker (RabbitMQ + Celery)

**Nhiệm vụ:** Tách các tác vụ nặng ra khỏi request cycle chính.

**Các task queue:**
| Queue | Tác vụ | Priority |
|---|---|---|
| `ocr_queue` | YOLOv11 + VietOCR processing | High |
| `llm_queue` | Gemini API calls | Medium |
| `investment_queue` | ReAct Agent analysis | Medium |
| `report_queue` | Tạo báo cáo + biểu đồ | Low |
| `cache_cleanup_queue` | Dynamic cache eviction | Low |

---

## 4. Models & AI Components

### 4.1 YOLOv11 — Object Detection

- **Mục đích:** Detect và crop vùng chứa thông tin (số tiền, ngày, tên cửa hàng) trước khi đưa vào OCR.
- **Input:** Ảnh JPEG/PNG (hóa đơn, screenshot)
- **Output:** Bounding boxes của các vùng text cần extract
- **Deploy:** Chạy trong Celery worker, không blocking API

### 4.2 VietOCR — Text Extraction

- **Mục đích:** Trích xuất text từ vùng ảnh đã crop bởi YOLO.
- **Engine:** VietOCR (`vgg_transformer`) — chuyên tối ưu cho tiếng Việt
- **Output:** Raw text string → đưa vào Semantic Router

### 4.3 Gemini 2.5 Flash — Core LLM

- **Mục đích:** 
  1. Phân tích text giao dịch → gán category + metadata
  2. Phân tích market data → tóm tắt xu hướng
- **Gọi qua:** Google Gemini API
- **Luôn kiểm tra Semantic Cache trước** khi gọi API

### 4.4 Semantic Router

- **Mục đích:** 
  1. Check ChromaDB — nếu query tương tự đã có trong cache, trả về luôn
  2. Route request tới đúng handler (phân loại danh mục nào)
- **Threshold:** cosine similarity ≥ 0.92 = cache hit

### 4.5 ReAct Agent (Investment)

- **Mục đích:** Multi-step reasoning để sinh portfolio recommendations
- **Loop:**
  ```
  Thought → Action (gọi market API) → Observation → Thought → ... → Final Answer
  ```
- **Tools có sẵn:** fetch_stock_data, fetch_gold_price, fetch_crypto_price, fetch_bank_rate, calculate_portfolio

---

## 5. 5 Luồng Dữ liệu Chính

### Luồng 1: Thu thập & Chuẩn hóa Dữ liệu

```
User upload ảnh / nhập text
        │
        ▼
API Gateway → Data Ingestion Service
        │
        ├─[ảnh]─► YOLOv11 detect → VietOCR extract text
        │
        └─[text]─► (join tại đây)
                          │
                          ▼
                  Semantic Router
                  kiểm tra ChromaDB
                     │        │
                  Hit │        │ Miss
                     ▼        ▼
                 Lấy cache   Gọi Gemini → lưu cache
                          │
                          ▼
                   Gán nhãn danh mục
                   Chuẩn hóa dữ liệu
                          │
                          ▼
                  Publish tới Message Queue
```

---

### Luồng 2: Quản lý Dòng tiền & Mục tiêu

```
Message Queue nhận dữ liệu từ Luồng 1
        │
        ▼
Transaction & Wallet Service
  Số dư = Số dư cũ + Thu nhập - Chi tiêu
        │
        ▼
Goal Tracking Service
  So sánh: tỷ lệ tiết kiệm thực tế vs mục tiêu
        │
        ├─[OK]─────► Cập nhật tiến độ mục tiêu
        │
        └─[Vượt mức]─► Gửi cảnh báo sớm (push notification)
```

---

### Luồng 3: Cố vấn Đầu tư & Thị trường

```
Nhận dữ liệu từ Luồng 2
        │
        ▼
Tính tiền nhàn rỗi
  = Thu nhập - (Chi tiêu cố định + Quỹ khẩn cấp)
        │
        ▼
Đánh giá Risk Profile
(onboarding survey hoặc hành vi lịch sử)
        │
        ▼
Fetch Market APIs đồng thời:
  ┌──────────────────────────────────┐
  │ Chứng khoán │ Vàng │ Crypto │ Ngân hàng │
  └──────────────────────────────────┘
        │
        ▼
ReAct Agent + Gemini 2.5 Flash
Phân tích xu hướng + sinh gợi ý portfolio
        │
        ▼
Trả về danh mục đầu tư đề xuất
(phân bổ % theo risk + xu hướng thị trường)
```

---

### Luồng 4: Tối ưu hóa Tài nguyên (Background)

```
Luôn chạy ngầm, song song với các luồng khác

Celery Beat Scheduler:
  ├─ Mỗi N phút: Dynamic Cache Eviction
  │    → Xóa vector embedding cũ trong ChromaDB
  │    → Giải phóng RAM
  │
  ├─ Mỗi N giây: Redis TTL management
  │    → Expire session cache cũ
  │
  └─ On demand: Async task processing
       → OCR jobs từ queue
       → LLM calls từ queue
       → Không block UI/API response
```

---

### Luồng 5: Báo cáo

```
Trigger: Scheduled (daily/weekly) hoặc user request
        │
        ▼
Reporting Service (chạy qua Celery, async)
        │
        ├─ Aggregate dữ liệu từ PostgreSQL
        ├─ Tạo biểu đồ (pie, line charts)
        └─ Export báo cáo (in-app / PDF)
        │
        ▼
Push notification → User xem báo cáo
```

---

## 6. Database Schema (Gợi ý)

```sql
-- Users
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Risk profile từ onboarding
CREATE TABLE risk_profiles (
    user_id     UUID REFERENCES users(id),
    level       TEXT CHECK (level IN ('conservative', 'moderate', 'aggressive')),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Wallets
CREATE TABLE wallets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    balance     NUMERIC(15, 2) NOT NULL DEFAULT 0,
    currency    TEXT DEFAULT 'VND',
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    wallet_id       UUID REFERENCES wallets(id),
    type            TEXT CHECK (type IN ('income', 'expense')),
    amount          NUMERIC(15, 2) NOT NULL,
    category        TEXT,           -- gán bởi AI
    description     TEXT,
    source          TEXT CHECK (source IN ('manual', 'ocr', 'screenshot')),
    raw_image_url   TEXT,           -- nếu từ ảnh
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Goals
CREATE TABLE goals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES users(id),
    title               TEXT NOT NULL,
    target_amount       NUMERIC(15, 2),
    target_saving_rate  NUMERIC(5, 2),  -- % thu nhập tiết kiệm mỗi tháng
    deadline            DATE,
    current_amount      NUMERIC(15, 2) DEFAULT 0,
    status              TEXT DEFAULT 'active'
);

-- Investment suggestions (log lịch sử gợi ý)
CREATE TABLE investment_suggestions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    idle_cash       NUMERIC(15, 2),
    portfolio_json  JSONB,          -- gợi ý phân bổ từ Agent
    market_snapshot JSONB,          -- dữ liệu thị trường tại thời điểm đó
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 7. API Contracts

### Data Ingestion

```
POST /api/v1/ingest/image
Content-Type: multipart/form-data
Body: { file: <image> }

Response 202 Accepted:
{ "task_id": "uuid", "status": "processing" }

GET /api/v1/ingest/status/:task_id
Response: { "status": "done", "transaction_id": "uuid" }
```

### Transactions & Wallet

```
POST /api/v1/transactions
Body: { type, amount, category, description, wallet_id }
Response 201: { transaction: {...} }

GET /api/v1/wallet/balance
Response: { balance, currency, last_updated }

GET /api/v1/wallet/summary?period=weekly
Response: { total_income, total_expense, net, by_category: [...] }
```

### Goals

```
POST /api/v1/goals
Body: { title, target_amount, target_saving_rate, deadline }

GET /api/v1/goals
Response: [{ id, title, progress_pct, status, ... }]
```

### Investment

```
GET /api/v1/investment/suggestions
Response:
{
  "idle_cash": 5000000,
  "risk_level": "moderate",
  "portfolio": [
    { "asset": "stocks", "allocation_pct": 40, "reasoning": "..." },
    { "asset": "gold",   "allocation_pct": 30, "reasoning": "..." },
    { "asset": "savings","allocation_pct": 30, "reasoning": "..." }
  ],
  "market_summary": "..."
}
```

---

## 8. Thứ tự Build (Roadmap cho Coder)

```
Phase 1 — Foundation
  ✅ Setup Supabase + PostgreSQL schema
  ✅ Setup FastAPI project structure (monorepo, 1 service/folder)
  ✅ Auth: JWT login/register
  ✅ Basic Transaction & Wallet Service (manual input only)
  ✅ Redis setup

Phase 2 — AI Core
  ✅ Tích hợp VietOCR
  ✅ Tích hợp YOLOv11 (ảnh hóa đơn)
  ✅ Gemini API → phân loại giao dịch
  ✅ ChromaDB + Semantic Router (cache layer)
  ✅ RabbitMQ + Celery workers cho OCR và LLM

Phase 3 — Features
  ✅ Goal Tracking Service + alert logic
  ✅ Reporting Service (charts, PDF)
  ✅ Investment Service: tính idle cash, risk profile
  ✅ Kết nối Market APIs (stocks, gold, crypto, bank)
  ✅ ReAct Agent cho investment recommendations

Phase 4 — Frontend
  ✅ React + TypeScript setup
  ✅ Wallet dashboard, transaction list
  ✅ Upload ảnh hóa đơn → xem kết quả OCR
  ✅ Goals UI + progress bar
  ✅ Investment suggestions UI
  ✅ Reports & charts

Phase 5 — Production
  ✅ Dynamic cache eviction (Celery Beat)
  ✅ Rate limiting tại API Gateway
  ✅ Error handling + retry logic cho Celery tasks
  ✅ Monitoring (logs, alerts)
```