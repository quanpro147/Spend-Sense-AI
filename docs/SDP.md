# SpendSense AI – Hệ thống Quản lý Tài chính & Đầu tư Cá nhân Thông minh

---

## 1. Giới thiệu

### 1.1 Mục đích
Tài liệu **Kế hoạch Phát triển Phần mềm (SDP)** này định nghĩa:
- Quy trình phát triển và quản lý dự án SpendSense AI
- Kiến trúc kỹ thuật và công nghệ áp dụng
- Phân bổ nguồn lực nhân sự và hạ tầng
- Chiến lược đảm bảo chất lượng và kiểm soát chi phí AI

Mục tiêu: Bàn giao sản phẩm đúng tiến độ, đúng phạm vi, tối ưu chi phí vận hành, đồng thời đáp ứng kỳ vọng người dùng về tính thông minh & minh bạch. 

### 1.2 Phạm vi dự án
SpendSense AI là nền tảng quản lý tài chính cá nhân thông minh với các chức năng cốt lõi:

| Chức năng | Mô tả |
|-----------|-------|
| 📸 Auto Entry | Tự động trích xuất dữ liệu chi tiêu/thu nhập từ ảnh hóa đơn, sao kê PDF |
| 📊 Cash Flow Tracking | Theo dõi dòng tiền, tính toán thu - chi, tỷ lệ tiết kiệm |
| 🎯 Goal Management | Thiết lập và theo dõi mục tiêu tài chính (mua nhà, quỹ khẩn cấp, hưu trí...) |
| 💡 Investment Advisor | Gợi ý danh mục đầu tư cá nhân hóa dựa trên hồ sơ rủi ro |
| 📈 Market Insight | Phân tích xu hướng thị trường và dự báo ngắn hạn |
| ⚡ Resource Optimization | Tối ưu token LLM, RAM, GPU thông qua caching và async processing |
| 📊 Daily/Weekly Reports | Cron-triggered report generation. Metrics → Recharts (frontend). Gemini 2.5 Flash sinh narrative. Export PDF/Email |

### 1.3 Định nghĩa và Thuật ngữ

| Thuật ngữ | Ý nghĩa |
|-----------|---------|
| **OCR** | Optical Character Recognition – Nhận dạng ký tự quang học |
| **LLM** | Large Language Model – Mô hình ngôn ngữ lớn (Gemini, GPT...) |
| **NLP** | Natural Language Processing – Xử lý ngôn ngữ tự nhiên |
| **MPT** | Modern Portfolio Theory – Lý thuyết danh mục đầu tư hiện đại |
| **Semantic Cache** | Bộ nhớ đệm dựa trên embedding vector để tái sử dụng kết quả AI |
| **MAE/RMSE** | Chỉ số đánh giá độ chính xác của mô hình dự báo |
| **API** | Application Programming Interface – Giao diện lập trình ứng dụng |
| **JWT** | JSON Web Token – Chuẩn xác thực người dùng |

### 1.4 Tài liệu tham khảo
- IEEE 1058-1998: Software Project Management Plans
- OWASP AI Security & Privacy Guide
- Gemini 2.5 Flash & VietOCR Documentation
- Facebook Prophet: Time Series Forecasting Library

---

## 2. Tổ chức Dự án

### 2.1 Mô hình phát triển
- **Phương pháp:** Agile Scrum với sprint 2 tuần
- **Quy trình mỗi sprint:** Planning → Development → Testing → Review → Retrospective
- **Công cụ quản lý:** Trello, GitHub Projects

### 2.2 Cơ cấu tổ chức
* Project Manager
* Backend Engineer
* AI/ML Engineer
* Frontend Engineer
* DevOps/QA (Shared)


### 2.3 Vai trò và Trách nhiệm

| Vai trò | Trách nhiệm chính |
|---------|------------------|
| **PM** | Lập roadmap, planning sprint, quản lý rủi ro, giao tiếp stakeholder |
| **Backend Engineer** | Thiết kế API, database schema, authentication, Celery task routing |
| **AI/ML Engineer** | OCR pipeline, vector embedding, LLM prompt engineering, forecasting models |
| **Frontend Engineer** | UI/UX dashboard, interactive charts, goal tracking interface |
| **DevOps/QA** | CI/CD, load testing, AI evaluation metrics, cost monitoring, security audit |

---

## 3. Quy trình Quản lý

### 3.1 Kế hoạch dự án (Phased Delivery)

| Phase | Thời gian | Deliverables chính |
|-------|-----------|-------------------|
| **Phase 1: Core Cash Flow** | Tuần 1–3 | OCR ingestion, Income/Expense tracking, Basic dashboard, Goal setting UI |
| **Phase 2: Intelligence & Investment** | Tuần 4–7 | Risk profiling, Rule-based asset allocation, LLM recommendation engine, Semantic Cache integration, Daily/Weekly Report Engine |
| **Phase 3: Market AI & Optimization** | Tuần 8–10 | Prophet Forecast + Sentiment, Gemini Prompt Caching, Dynamic Cache Eviction, Cost monitoring dashboar, UAT & Security Audit |

### 3.2 Quản lý Rủi ro

| Rủi ro | Mức độ ảnh hưởng | Xác suất | Biện pháp giảm thiểu |
|--------|-----------------|----------|---------------------|
| OCR sai định dạng hóa đơn không chuẩn | 🔴 Cao | 🟡 Trung bình | VietOCR + regex post-processing + UI cho phép người dùng chỉnh sửa |
| Chi phí LLM token vượt ngân sách | 🔴 Cao | 🔴 Cao | Semantic Cache (target hit rate >70%), Prompt compression, fallback rule-based |
| AI hallucination trong khuyến nghị tài chính | ⚫ Nghiêm trọng | 🟡 Trung bình | Guardrails + factual grounding qua Vector DB + disclaimer UI rõ ràng |
| Mô hình dự báo bị drift / kém chính xác | 🟡 Trung bình | 🟡 Trung bình | Retrain hàng tháng, monitor MAE/RMSE, fallback về moving average |
| Vi phạm bảo mật dữ liệu cá nhân | ⚫ Nghiêm trọng | 🟢 Thấp | Masking PII, encryption at rest, tuân thủ GDPR/VN PDPA |

### 3.3 Giám sát và Kiểm soát
- **Sprint metrics:** Velocity, Cache hit rate, LLM cost/request, Bug escape rate
- **Công cụ giám sát:**
  - Quản lý task: Trello
  - CI/CD & Code review: GitHub Actions, Pull Request workflow
  - Monitoring: Prometheus + Grafana (latency, cost), LangSmith (LLM tracing)
  - Alerting: Slack/Email khi chi phí AI vượt ngưỡng

---

## 4. Quy trình Kỹ thuật

### 4.1 Kiến trúc Hệ thống


1. **Input Layer:** Images, PDFs, manual entry, bank CSV
2. **Processing Layer:** YOLOv11 → VietOCR → Data Normalization
3. **Intelligence Layer:** 
   - Vector DB (ChromaDB) + Semantic Cache
   - Financial Engine (Cash flow, Savings rate, MPT allocation)
   - Forecasting (Prophet/LSTM) & Sentiment Analysis
   - LLM Orchestrator (Gemini 2.5 Flash with prompt compression)
4. **Async Queue:** Redis + Celery for heavy tasks (OCR, LLM, forecasting)
5. **API & Presentation:** FastAPI REST + JWT Auth → ReactJS Dashboard

### 4.2 Data Design
| Table | Key Fields |
|-------|------------|
| `Users` | user_id, email, risk_level, created_at |
| `Transactions` | id, user_id, type (income/expense), amount, category, timestamp, source |
| `FinancialGoals` | goal_id, user_id, target_amount, deadline, progress, status |
| `Investments` | id, user_id, asset_type, allocated_amount, recommendation_id |
| `MarketData` | symbol, date, price, volume, sentiment_score, forecast_trend |
| `SemanticCache` | query_embedding (vector), response, hit_count, ttl, created_at |
| `AIReports` | id, user_id, period, metrics_json, narrative, generated_at, status |

### 4.3 Component Design
* **OCR Module:** Image → YOLO crop → VietOCR → JSON normalization → Validation rules
* **Financial Engine:** Calculates `Net Cash Flow`, `Savings Rate`, triggers investment alerts
* **Recommendation Engine:** MPT-based allocation → LLM explains rationale → Cached for 24h
* **API Layer:** Rate limiting, JWT auth, cost tracking headers, async task IDs
* **Report Generator:** Cron trigger → Metrics → Narrative → Export
Celery Beat, Recharts, Gemini, PDFKit

### 4.4 Tools and Technologies
| Layer | Stack |
|-------|-------|
| Backend | Python 3.10+, FastAPI, SQLAlchemy, Pydantic |
| AI/ML | VietOCR, YOLOv11, Gemini 2.5 Flash, Sentence Transformers, Prophet, Scikit-learn |
| DB & Cache | PostgreSQL, ChromaDB, Redis |
| Queue & Async | Celery, RabbitMQ/Redis |
| Frontend | ReactJS, TailwindCSS, Recharts, Axios |
| DevOps | Docker, GitHub Actions, Nginx, Prometheus/Grafana |

---

## 5. Cấu trúc Công việc

1. Requirement & Architecture Sign-off
2. DB Schema & API Skeleton
3. OCR Pipeline & Data Validation
4. Income/Expense & Goal Tracking APIs
5. Vector DB + Semantic Cache Integration
6. Risk Profiling & Investment Recommendation Logic
7. LLM Prompt Engineering & Compression
8. Market Forecasting (Prophet) & Sentiment Module
9. Async Task Orchestration (Celery + Redis)
10. Frontend Dashboard & Goal/Investment UI
11. AI Testing, Cost Monitoring & Optimization
12. Cost Monitoring Dashboard + Alerting System
13. UAT, Security Audit & Deployment

---

## 6. Tiến độ Dự án

| Phase | Tuần | Milestone quan trọng | Tiêu chí hoàn thành |
|-------|------|---------------------|-------------------|
| **Phase 1** | 1–3 | MVP Cash Flow | ✅ OCR accuracy >90%, ✅ Dashboard hiển thị thu-chi, ✅ Goal setting hoạt động |
| **Phase 2** | 4–7 | Investment Advisor | ✅ Semantic Cache hit rate >60%, ✅ Risk profiling chính xác, ✅ LLM recommendation có guardrails |
| **Phase 3** | 8–10 | Market AI & Launch | ✅ Forecast MAE <5%, ✅ Cost monitoring active, ✅ Load test 1000 RPS, ✅ Security audit passed |

---

## 7. Đảm bảo Chất lượng (QA)

### 7.1 Chiến lược Kiểm thử

| Loại test | Công cụ | Tiêu chí chấp nhận |
|-----------|---------|-------------------|
| **Unit Test** | Pytest, unittest | Coverage >80% cho business logic |
| **Integration Test** | Pytest + Mock services | API response time <500ms (p95) |
| **OCR Accuracy** | Custom test dataset | Precision/Recall >90% trên hóa đơn VN |
| **LLM Testing** | LangSmith, custom eval | Hallucination rate <5%, Cache hit rate >70% |
| **Forecast Accuracy** | Backtesting framework | MAE <3%, RMSE <5% trên dữ liệu lịch sử |
| **Load Testing** | Locust, k6 | 1000 RPS với latency <1s, không lỗi 5xx |
| **Security Test** | OWASP ZAP, Bandit | Không lỗ hổng critical/high, PII được mask |

### 7.2 Monitoring & Feedback Loop
- **Real-time dashboard:** Hiển thị LLM token usage, OCR call count, DB query cost
- **User feedback:** Nút 👍/👎 trên mỗi recommendation → điều chỉnh prompt template & cache weight
- **Automated alerting:** Slack notification khi:
  - Chi phí LLM/ngày vượt ngưỡng
  - Forecast drift >10% so với baseline
  - Cache hit rate giảm <50% trong 24h

---

## 8. Quản lý Cấu hình

### 8.1 Version Control
- **Repository:** GitHub (private)
- **Branching strategy:** Git Flow (`main`, `develop`, `feature/*`, `hotfix/*`)
* CI/CD: GitHub Actions → Docker build → Staging → Production
* Environment Variables: `.env` with vault/secrets manager
* Model Versioning: DVC or MLflow for OCR/Forecast checkpoints

### 8.2 CI/CD Pipeline

GitHub Actions workflow (tóm tắt)
on: [push, pull_request]
jobs:
test:
  - Run unit/integration tests
  - Run AI evaluation suite
  - Generate coverage report
build:
  - Build Docker image
  - Scan for vulnerabilities (Trivy)
  - Push to registry
deploy:
  - Deploy to staging (auto)
  - Deploy to production (manual approval)
---

## 9. Conclusion
This SDP provides a structured, AI-aware roadmap for SpendSense AI. By prioritizing semantic caching, async processing, and lightweight forecasting models, the system delivers intelligent financial insights while maintaining strict control over operational costs. The phased approach ensures rapid MVP delivery while leaving room for advanced market AI and continuous optimization.