# SpendSense AI — Tài liệu Đặc tả Yêu cầu Phần mềm (SRS)

> Software Requirements Specification — phiên bản 1.0
> Tham chiếu: [SAD.md](SAD.md) (kiến trúc), [SDP.md](SDP.md) (kế hoạch phát triển), [deployment.md](deployment.md) (triển khai), [testing.md](testing.md) (kiểm thử).

---

## 1. Giới thiệu

### 1.1 Mục đích
Tài liệu này đặc tả đầy đủ các **yêu cầu chức năng** và **phi chức năng** của hệ thống SpendSense AI, làm cơ sở thống nhất giữa các vai trò Business Analyst, Backend, AI Engineer, Frontend và Tester. Mọi yêu cầu được mô tả ở mức kiểm chứng được (verifiable) để dùng làm tiêu chí nghiệm thu.

### 1.2 Phạm vi
SpendSense AI là nền tảng quản lý tài chính & đầu tư cá nhân thông minh. Người dùng chụp ảnh hóa đơn; hệ thống trích xuất dữ liệu bằng CV + OCR, lưu mẫu vào vector DB (semantic cache), và sinh insight tài chính bằng LLM (Gemini 2.5 Flash). Hệ thống bao gồm module quản lý giao dịch, mục tiêu tài chính, tùy chọn AI, và module đầu tư (theo dõi danh mục thời gian thực + stress test vĩ mô).

### 1.3 Định nghĩa & Thuật ngữ
| Thuật ngữ | Ý nghĩa |
|-----------|---------|
| **OCR** | Optical Character Recognition (VietOCR) |
| **YOLO** | You Only Look Once — mô hình phát hiện vùng/field hóa đơn (YOLOv11) |
| **LLM** | Large Language Model (Gemini 2.5 Flash) |
| **Embedding** | Vector ngữ nghĩa (sentence-transformers `all-MiniLM-L6-v2`, 384 chiều) |
| **Semantic Cache** | Bộ nhớ đệm theo cosine similarity ≥ ngưỡng để tái dùng insight |
| **ToolResult** | Hợp đồng kết quả thống nhất (success/warning/error) giữa các bước pipeline |
| **JWT** | JSON Web Token — xác thực người dùng |

### 1.4 Tổng quan tác nhân (Actors)
- **Người dùng cuối**: đăng ký/đăng nhập, tải hóa đơn, quản lý giao dịch/mục tiêu/đầu tư, xem insight.
- **Hệ thống AI** (nội bộ): detector YOLO, OCR, embedder, semantic cache, Gemini client.
- **Dịch vụ ngoài**: Google OAuth, Gemini API, nguồn giá thị trường (vnstock/Binance/SJC).

---

## 2. Mô tả tổng thể

### 2.1 Kiến trúc (tóm tắt)
Frontend React 19 (SPA) ↔ Backend FastAPI ↔ PostgreSQL (dữ liệu giao dịch) + ChromaDB (semantic cache). Pipeline xử lý hóa đơn: **detect (YOLO) → OCR (VietOCR) → reconstruct → embed → cache lookup → LLM (nếu cache miss)**. Chi tiết tại [SAD.md](SAD.md).

### 2.2 Ràng buộc thiết kế
- **Cache-first**: luôn kiểm tra vector DB (cosine ≥ `similarity_threshold`, mặc định 0.9) trước khi gọi LLM.
- **Suy biến mềm (graceful degradation)**: thiếu model/API key thì trả `ToolResult.warning` + fallback, không sập pipeline.
- Python 3.13, FastAPI, SQLAlchemy async, Alembic migrations, quản lý bằng `uv`.

---

## 3. Yêu cầu chức năng (Functional Requirements)

### FR-1 Xác thực & Tài khoản
- **FR-1.1** Đăng ký bằng email + mật khẩu (≥ 6 ký tự); mật khẩu băm bằng bcrypt.
- **FR-1.2** Đăng nhập trả về JWT (HS256, hạn 24h).
- **FR-1.3** Đăng nhập bằng Google OAuth (`/auth/google`).
- **FR-1.4** `/auth/me` trả thông tin người dùng hiện tại từ token.
- **FR-1.5** Mọi endpoint dữ liệu cá nhân yêu cầu `get_current_user` và **giới hạn theo `user_id`** (cách ly dữ liệu).

### FR-2 Pipeline phân tích hóa đơn
- **FR-2.1** `POST /receipts/analyze` nhận ảnh (multipart) và trả về: insight, receipt draft, suggested transaction, detected fields.
- **FR-2.2** Detector YOLO phát hiện các field (`item`, `price`, `quantity`, `store_name`); khi thiếu model → trả lỗi có hướng dẫn cấu hình.
- **FR-2.3** OCR (VietOCR) đọc text theo band/field; reconstructor ghép thành `ReceiptItem`.
- **FR-2.4** Embedder sinh vector 384 chiều (chuẩn hóa L2) từ canonical text.
- **FR-2.5** Semantic cache: nếu có insight tương tự (cosine ≥ ngưỡng) thì trả từ cache (`source=cache`), ngược lại gọi Gemini (`source=llm`) rồi lưu lại.
- **FR-2.6** Phân loại item về 11 danh mục chuẩn; khi Gemini không khả dụng → fallback heuristic nội bộ.

### FR-3 Giao dịch
- **FR-3.1** `POST /transactions` tạo giao dịch (expense/income), tùy chọn kèm receipt items.
- **FR-3.2** `GET /transactions` liệt kê giao dịch của người dùng, phân trang (`limit`, `offset`).

### FR-4 Insight
- **FR-4.1** `GET /insights` liệt kê insight của người dùng (phân trang).
- **FR-4.2** `GET /insights/{id}` lấy chi tiết một insight; 404 nếu không tồn tại/không sở hữu.

### FR-5 Mục tiêu tài chính (Goals)
- **FR-5.1** `GET /goals` liệt kê mục tiêu của người dùng.
- **FR-5.2** `POST /goals` tạo mục tiêu (title, target_amount > 0, current_amount, monthly_target, deadline, emoji, ai_note).
- **FR-5.3** `PATCH /goals/{id}` cập nhật một phần mục tiêu (chỉ chủ sở hữu).
- **FR-5.4** `DELETE /goals/{id}` xóa mục tiêu (chỉ chủ sở hữu) → 204.
- **FR-5.5** Trạng thái mục tiêu suy ra từ tiến độ: `achieved` (≥100%), `on-track` (≥50%), `at-risk` (<50%); kèm `progress_percent`.

### FR-6 Tùy chọn AI (Preferences)
- **FR-6.1** `GET /preferences` trả tùy chọn của người dùng, tạo mặc định nếu chưa có.
- **FR-6.2** `PUT /preferences` cập nhật một phần 4 cờ: `weekly_report`, `rebalance_suggestions`, `anomaly_alerts`, `goal_reminders`.

### FR-7 Đầu tư (Investment — PA3)
- **FR-7.1** `GET/POST /investment/profile` quản lý hồ sơ rủi ro, vốn, mục tiêu.
- **FR-7.2** `GET /investment/portfolio` trả danh mục kèm định giá thời gian thực (current_price, value, profit%).
- **FR-7.3** `POST /investment/portfolio` thêm tài sản (stock/gold/saving/crypto); `DELETE /investment/portfolio/{id}` xóa.
- **FR-7.4** `GET /investment/stress-test` chạy kịch bản sốc vĩ mô + sinh khuyến nghị phòng hộ bằng Gemini; có fallback tĩnh khi LLM lỗi.

### FR-8 Dashboard & Phân tích (Frontend)
- **FR-8.1** Dashboard hiển thị KPI (chi tiêu, tiết kiệm, tỷ lệ tiết kiệm), xu hướng thu chi, mục tiêu, insight — **suy ra từ `GET /transactions`, `/goals`, `/insights`**.
- **FR-8.2** Analytics suy ra phân bổ theo danh mục, chi tiêu tuần, xu hướng 7 tháng từ giao dịch thực.
- **FR-8.3** Goals/Settings thao tác trực tiếp trên backend (CRUD goals, toggle preferences).

---

## 4. Yêu cầu phi chức năng (Non-Functional Requirements)

### NFR-1 Hiệu năng
- Cache hit không gọi LLM; mục tiêu p95 thời gian trả lời endpoint không-AI < 500ms.
- Model (YOLO/VietOCR/embedder) được warm-up lúc khởi động để tránh init ở request đầu.

### NFR-2 Chi phí AI
- Semantic cache giảm số lần gọi Gemini; ngưỡng tương tự cấu hình qua `similarity_threshold`.

### NFR-3 Bảo mật
- Secrets qua biến môi trường (`.env`): `GEMINI_API_KEY`, `DATABASE_URL`, `JWT_SECRET_KEY`.
- Cách ly dữ liệu theo `user_id` ở mọi truy vấn; mật khẩu bcrypt; JWT ký HS256.
- CORS giới hạn theo origin hợp lệ.

### NFR-4 Độ tin cậy
- Mọi bước pipeline trả `ToolResult` rõ ràng; lỗi không bị nuốt im lặng.
- Nguồn giá thị trường có fallback khi API ngoài lỗi/giới hạn tần suất.

### NFR-5 Khả năng bảo trì & Kiểm thử
- Tổ chức theo feature/domain; file < 800 dòng.
- Độ phủ kiểm thử ≥ **80%** (`--cov-fail-under=80`); chi tiết tại [testing.md](testing.md).

### NFR-6 Khả chuyển
- Hỗ trợ PostgreSQL (production) và SQLite (test); migration bằng Alembic.

---

## 5. Giao diện ngoài (External Interfaces)

| Giao diện | Mô tả |
|-----------|-------|
| Google OAuth | Xác thực đăng nhập (`google-auth`) |
| Gemini API | Sinh insight & phân loại item (`gemini-2.5-flash`) |
| vnstock / Binance / SJC | Giá cổ phiếu VN / crypto / vàng (đầu vào module đầu tư) |
| ChromaDB | Lưu/đối sánh vector cho semantic cache |

---

## 6. Truy vết yêu cầu (Traceability tóm tắt)

| Nhóm | Endpoint/Module chính | Tài liệu |
|------|----------------------|----------|
| FR-1 | `src/api/routes/auth.py`, `src/auth/` | SAD §Auth |
| FR-2 | `src/pipeline.py`, `src/vision/`, `src/embedding/`, `src/cache/`, `src/llm/` | SAD §Pipeline |
| FR-3 | `src/api/routes/transactions.py` | — |
| FR-4 | `src/api/routes/insights.py` | — |
| FR-5 | `src/api/routes/goals.py` | — |
| FR-6 | `src/api/routes/preferences.py` | — |
| FR-7 | `src/api/routes/investment.py`, `src/core/market_data.py`, `src/core/stress_tester.py` | investment_module |
| FR-8 | `frontend/src/pages/*`, `frontend/src/lib/derive.ts` | — |

---

## 7. Giả định & Phụ thuộc
- Trọng số YOLO và `GEMINI_API_KEY` được cấu hình ở môi trường chạy thật (xem [deployment.md](deployment.md)); thiếu chúng hệ thống vẫn chạy ở chế độ suy biến.
- `SEMANTIC_CACHE_ENABLED=true` để bật cache; mặc định tắt cho môi trường dev/test.
