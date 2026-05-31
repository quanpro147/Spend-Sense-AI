# SpendSense AI — Chiến lược Kiểm thử (Test Strategy)

> Tham chiếu: [SRS.md](SRS.md) (yêu cầu), [SAD.md](SAD.md) (kiến trúc).

---

## 1. Mục tiêu & Phạm vi
Đảm bảo các yêu cầu trong [SRS.md](SRS.md) được kiểm chứng tự động trước khi merge. Phạm vi: backend FastAPI (`src/`) và logic suy diễn frontend. Mục tiêu độ phủ: **≥ 80%** trên `src/`, được ép buộc bởi cấu hình pytest.

## 2. Các tầng kiểm thử

| Tầng | Mục tiêu | Công cụ |
|------|----------|---------|
| **Unit** | Hàm/logic thuần: embedder, parse Gemini, helper OCR, reconstructor, market_data fallback, stress_tester | pytest |
| **Integration** | API endpoint qua TestClient + DB thật (SQLite in-memory): auth, transactions, insights, goals, preferences, receipts | pytest, httpx |
| **E2E (thủ công/định hướng)** | Luồng người dùng quan trọng: đăng nhập → tải hóa đơn → tạo giao dịch → xem dashboard | Trình duyệt / Playwright (tùy chọn) |

## 3. Cấu hình
Khai báo tại [pyproject.toml](../pyproject.toml):

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "--cov=src --cov-report=term-missing --cov-fail-under=80"
```

Chạy:

```bash
uv run pytest                  # toàn bộ + báo cáo độ phủ
uv run pytest tests/test_goals.py -v
```

## 4. Chiến lược cô lập dịch vụ ngoài (Mocking)
Các test chạy **offline**, không phụ thuộc dịch vụ thật. Dùng `conftest.py` để:

- **Database**: SQLite in-memory (async) thay PostgreSQL; override dependency `get_db`; tạo schema từ `Base.metadata` cho mỗi test.
- **Auth**: fixture tạo người dùng + JWT hợp lệ để gọi endpoint cần xác thực.
- **Gemini LLM**: `monkeypatch` `_call_gemini` (đã áp dụng trong `tests/test_investment.py`) — không gọi mạng.
- **Embedder**: kiểm tra cả nhánh model thật (nếu có) lẫn nhánh `_stub_vector` (fallback xác định theo SHA256).
- **Market data**: ép nhánh fallback (`DEFAULT_*`) bằng cách giả lập lỗi nguồn ngoài.
- **YOLO/OCR**: không tải trọng số thật trong unit test; kiểm thử các hàm parse/tách band độc lập với model.

> Nguyên tắc: test double chỉ nằm trong thư mục `tests/`. Fallback trong mã production (vd. `_stub_vector`, giá mặc định) là **suy biến mềm**, không phải mock, và được kiểm thử như hành vi thật.

## 5. Phân bổ test theo module (kế hoạch độ phủ)

| Module | Loại | Trọng tâm |
|--------|------|-----------|
| `src/embedding/embedder.py` | unit | encode chuẩn hóa; nhánh fallback khi model lỗi; lỗi text rỗng |
| `src/llm/gemini_client.py` | unit | `_parse_response`, `_guess_category`, `_extract_item_categories`, fallback khi thiếu key |
| `src/vision/ocr.py` | unit | `_parse_total`, `_merchant_from_lines`, `_fields_and_items_from_lines`, `_normalize_text` |
| `src/vision/reconstructor.py` | unit | ghép field → item; trường hợp thiếu giá/tên |
| `src/core/market_data.py` | unit | fallback giá stock/crypto/gold |
| `src/core/stress_tester.py` | unit | diversification/vulnerability score (mở rộng test hiện có) |
| `src/api/routes/auth.py` | integration | register/login, token sai |
| `src/api/routes/transactions.py` | integration | tạo + liệt kê, cách ly user |
| `src/api/routes/goals.py` | integration | CRUD đầy đủ, 404 khi không sở hữu, suy ra status |
| `src/api/routes/preferences.py` | integration | get tạo mặc định, put cập nhật một phần |
| `src/api/routes/insights.py` | integration | list/get với cache mock |

## 6. Cấu trúc test (AAA)
Theo Arrange–Act–Assert, tên test mô tả hành vi:

```python
def test_create_goal_returns_on_track_status_for_high_progress(client, auth_headers):
    # Arrange
    payload = {"title": "Quỹ", "target_amount": 100, "current_amount": 80}
    # Act
    resp = client.post("/goals", json=payload, headers=auth_headers)
    # Assert
    assert resp.status_code == 201
    assert resp.json()["status"] == "on-track"
```

## 7. Tiêu chí nghiệm thu (Definition of Done)
- `uv run pytest` xanh, độ phủ ≥ 80% (`--cov-fail-under=80`).
- Mọi yêu cầu FR-1…FR-7 có ít nhất một test integration tương ứng.
- Không test nào phụ thuộc mạng/dịch vụ ngoài thật.

## 8. CI (khuyến nghị)
Chạy `uv run pytest` trên mỗi PR; chặn merge nếu cổng độ phủ thất bại. Frontend: `npm run build` (typecheck) như cổng tối thiểu.
