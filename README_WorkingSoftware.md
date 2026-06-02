# Báo Cáo Working Software — SpendSense AI (PA3)

Tài liệu này tóm tắt các tính năng đã được triển khai, các giới hạn kỹ thuật và lỗi đã biết (known defects) của ứng dụng **SpendSense AI** trong giai đoạn báo cáo PA3.

---

## 1. Các Tính Năng Đã Triển Khai (Implemented Features)

SpendSense AI đã triển khai hoàn thiện hai luồng use-case chính tập trung vào các tính năng hỗ trợ trí tuệ nhân tạo (AI-enabled features):

### 1.1 Luồng 1: Tự Động Phân Tích Hóa Đơn & Lưu Trữ Thông Minh (Data Ingestion & Caching)
*   **Computer Vision & OCR**:
    *   Sử dụng mô hình **YOLOv11s** (fine-tuned) phát hiện chính xác các vùng thông tin hóa đơn (merchant, date, total, items, price, quantity).
    *   Tích hợp mô hình nhận diện chữ viết tiếng Việt **VietOCR (VGG-Transformer)** để trích xuất text thô chất lượng cao.
    *   Tự động phát hiện chiết khấu dòng hàng (Line Discounts) từ các token giá trị âm (ví dụ: `-8.400`) để tính tổng tiền thực tế.
*   **Phân Loại & Chuẩn Hóa**:
    *   Sử dụng mô hình ngôn ngữ **Gemma** để phân loại danh mục từng mặt hàng (ăn uống, di chuyển, mua sắm...). Có hệ thống từ điển từ khóa tiếng Việt fallback nếu API chậm/lỗi.
*   **Semantic Caching (Tối Ưu Hóa Token)**:
    *   Mã hóa hóa đơn thành vector 384 chiều qua `sentence-transformers`.
    *   Lưu và truy vấn trong **ChromaDB**. Nếu hóa đơn tương đồng $\ge 90\%$, hệ thống trả về lời khuyên chi tiêu ngay lập tức từ bộ nhớ cache (**0 token LLM tiêu tốn**).
    *   **Feedback Loop**: Hỗ trợ 👍 (CONFIRM - giữ cache) hoặc 👎 (REJECT - xóa cache/unlearn) trực quan.

### 1.2 Luồng 3: Quản Lý Danh Mục Đầu Tư & AI Stress-Test Vĩ Mô (Investment & Shock Simulation)
*   **Hồ Sơ Rủi Ro**: Cho phép người dùng tùy chỉnh khẩu vị rủi ro (Thận trọng, Trung bình, Tăng trưởng), thiết lập tổng vốn đầu tư và mục tiêu tài chính.
*   **Quản Lý Tài Sản Thực Tế & Trải Nghiệm Người Dùng Tối Ưu**:
    *   Kết nối trực tiếp thư viện **vnstock (KBS source)** lấy giá cổ phiếu Việt Nam (FPT, TCB, VNM,...) thời gian thực.
    *   Gọi API công khai của **Binance** lấy giá các đồng tiền mã hóa phổ biến (BTC, ETH,...) quy đổi sang VND.
    *   Truy vấn dữ liệu XML tỷ giá vàng **SJC** chính thức.
    *   Tự động tính toán tổng tài sản thực tế, lợi nhuận tạm tính (P/L) và tỷ lệ phần trăm biến động.
    *   **Trợ Lý AI Quick-Add (AI Copilot)**: Phân tích mô tả giao dịch bằng ngôn ngữ tự nhiên sử dụng **Gemini 2.5 Flash** (ví dụ: *"Tôi mới mua 200 cổ phiếu FPT giá 135k"*) để trích xuất JSON cấu trúc đầy đủ và tự động điền thông tin vào biểu mẫu chỉ với 1 click.
    *   **Smart Price Normalization (Tự động Chuẩn hóa Giá)**: Tự động điều chỉnh sai lệch đơn vị giá mua đầu vào (Vàng chỉ/lượng, Cổ phiếu hàng chục/hàng ngàn, Crypto USD/VND) dựa trên tỷ số so sánh với giá live thị trường, ngăn chặn lỗi hiện sai lệch lợi nhuận khổng lồ.
    *   **Autocomplete & Auto-Prefill (Gợi ý & Điền sẵn)**: Dropdown gợi ý các mã tài sản phổ biến (FPT, GOLD, BTC, SAVING...) khi người dùng nhập thủ công, tự động điền Tên tài sản, phân loại, màu đồ thị và tự động gọi API lấy giá thị trường hiện thời để điền sẵn vào ô giá.
*   **Giả Lập Stress-Test & Đề Xuất Phòng Vệ**:
    *   Chạy công cụ mô phỏng 4 biến cố vĩ mô: *Lạm phát phi mã, Suy thoái thị trường, Khủng hoảng công nghệ, Sụp đổ crypto*.
    *   Tính toán chỉ số đa dạng hóa danh mục (Simpson Diversity Index) và mức độ tổn hại rủi ro tối đa (Vulnerability Score).
    *   Gọi mô hình **Gemini 2.5 Flash** phân tích sâu cấu trúc danh mục và xuất ra các hành động phòng vệ (hedging/rebalance) chi tiết kèm số tiền khuyến nghị.


---

## 2. Giới Hạn (Limitations)
*   **Chất lượng ảnh đầu vào**: Độ chính xác của YOLO và VietOCR phụ thuộc lớn vào góc chụp, ánh sáng và nếp gấp của hóa đơn giấy.
*   **Dữ liệu lịch sử đầu tư**: Hiện tại danh mục đầu tư chỉ ghi nhận số dư và giá mua trung bình thời gian thực; chưa vẽ biểu đồ tăng trưởng lịch sử nhiều năm dựa trên dữ liệu thật (đồ thị tăng trưởng hiện tại sử dụng đường cong giả lập kết thúc ở giá trị thực tế).
*   **Tốc độ mạng ngoại vi**: Việc gọi API tỷ giá Binance hoặc XML SJC có thể bị chậm hoặc chặn (rate limit) tùy thuộc vào kết nối mạng của máy chủ deploy.

---

## 3. Các Lỗi Đã Biết (Known Defects)
*   **Độ Trễ Khởi Động Model (Cold Start)**: Lần đầu tiên gọi API `/receipts/analyze` sau khi khởi động server sẽ mất 5-10 giây do máy chủ phải nạp mô hình YOLO và VietOCR lên RAM. (Đã giảm thiểu bằng cách chạy tiến trình warm-up trước ở lifespan startup).
*   **Hợp Nhất Dòng Hóa Đơn Phức Tạp**: Với các hóa đơn in lệch dòng lớn, thuật toán tái tạo (Reconstructor) đôi khi ghép nhầm đơn giá của mặt hàng này sang mặt hàng kia. Người dùng cần chỉnh sửa thủ công trên giao diện Review trước khi lưu.
*   **Stateless Dev Auth Fallback**: Khi cơ sở dữ liệu PostgreSQL ngoại tuyến, hệ thống tự động sinh JWT giả định để người dùng trải nghiệm nhanh. Tính năng này cần được vô hiệu hóa trước khi đưa sản phẩm lên môi trường Product.
