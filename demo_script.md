# Kịch Bản Thuyết Trình Demo Video — SpendSense AI (PA3)

Kịch bản này được thiết kế tối ưu cho thời lượng **từ 2 đến 3 phút**, tập trung làm nổi bật các tính năng AI cốt lõi và giao diện người dùng.

---

## 🎬 Tổng Quan Kịch Bản Quay
*   **Người thực hiện**: Kiên.
*   **Thời lượng mục tiêu**: 2 phút 30 giây.
*   **Chuẩn bị trước**:
    *   Chạy sẵn backend (`uv run uvicorn main:app --reload --port 8080`).
    *   Chạy sẵn frontend (`npm run dev` trên Vite `:5173`).
    *   Chuẩn bị sẵn 1 file ảnh hóa đơn mua sắm thực tế rõ nét (ví dụ: hóa đơn Co.opmart hoặc Circle K) để test quét.

---

## 📝 Script Thuyết Trình Từng Bước

### Phần 1: Giới thiệu & Đăng nhập (0:00 - 0:30)
*   **Hành động trên màn hình**:
    1.  Hiển thị trang đăng nhập (`http://localhost:5173`). Giao diện kính mờ (glassmorphism) hiện đại.
    2.  Nhập tài khoản test (hoặc bấm Google Sign-in) và click Đăng nhập.
    3.  Chuyển vào trang Dashboard hiển thị số dư, biểu đồ chi tiêu.
*   **Lời thoại thuyết trình**:
    > *"Xin chào thầy và các bạn, mình là Kiên, đại diện nhóm SpendSense AI trình bày demo phần mềm Working Software cho giai đoạn PA3. Ứng dụng của tụi mình là giải pháp quản lý tài chính cá nhân thông minh tích hợp trí tuệ nhân tạo. Bây giờ mình sẽ đăng nhập vào hệ thống."*

### Phần 2: Quét Hóa Đơn & Semantic Caching (0:30 - 1:30)
*   **Hành động trên màn hình**:
    1.  Bấm vào nút **"Thêm giao dịch"** ở góc phải navigation.
    2.  Chọn tab **"Quét hóa đơn"**, kéo thả ảnh hóa đơn chuẩn bị sẵn vào vùng upload.
    3.  Màn hình hiển thị vòng quay loading 1-2 giây, sau đó xuất hiện bảng Review hóa đơn:
        *   Tên cửa hàng, ngày mua, tổng tiền được tự động trích xuất đúng.
        *   Từng dòng hàng được liệt kê kèm cột Số lượng, Giá, Khuyến mãi, và Phân loại danh mục (ví dụ: Cocacola tự động phân vào "Ăn uống").
    4.  Chỉ vào dòng trạng thái **Insight** ở đầu bảng (ví dụ: *"Insight generated from LLM"*).
    5.  Bấm vào nút 👍 hoặc 👎 ở góc để minh họa Feedback Loop (unlearning/xóa cache khỏi ChromaDB).
*   **Lời thoại thuyết trình**:
    > *"Tính năng AI đầu tiên là tự động phân tích hóa đơn. Khi mình tải một hóa đơn mua sắm lên, hệ thống sẽ sử dụng mô hình YOLOv11s để xác định vùng thông tin và VietOCR để đọc text tiếng Việt có dấu. Dữ liệu sau đó được chuẩn hóa thành JSON.*
    > *Đặc biệt, hệ thống sử dụng **Semantic Caching** qua ChromaDB. Nếu hóa đơn tải lên trùng khớp trên 90% với lịch sử, hệ thống sẽ lấy trực tiếp lời khuyên chi tiêu từ cache giúp tiết kiệm 100% token LLM. Người dùng có thể nhấn Like hoặc Dislike để tối ưu hóa bộ nhớ cache này."*

### Phần 3: Quản Lý Danh Mục Đầu Tư & Dữ Liệu Thời Gian Thực (1:30 - 2:00)
*   **Hành động trên màn hình**:
    1.  Bấm chuyển sang trang **"Đầu tư"** trên thanh điều hướng.
    2.  Bấm vào biểu tượng răng cưa cài đặt ở góc trên, cập nhật: Khẩu vị rủi ro: *"Tăng trưởng (aggressive)"*, Vốn đầu tư: *"150,000,000 VND"*, Mục tiêu: *"Tự do tài chính trước 35 tuổi"*. Bấm Lưu.
    3.  Bấm **"Thêm tài sản"**, nhập mã `"FPT"`, chọn loại `"Cổ phiếu"`, số lượng `"500"`, giá mua `"70000"`. Bấm Thêm.
    4.  Mã FPT ngay lập tức xuất hiện trong bảng, giá thị trường tự động nhảy lên giá hiện tại (được fetch qua `vnstock` từ nguồn KBS), cột Lời/Lỗ (P/L) và biểu đồ tròn phân bổ được cập nhật động tương ứng.
*   **Lời thoại thuyết trình**:
    > *"Tiếp theo là module Quản lý đầu tư tích hợp dữ liệu thời gian thực. Tại đây, mình có thể thiết lập khẩu vị rủi ro, số vốn hiện có và mục tiêu tài chính của bản thân.*
    > *Người dùng dễ dàng nhập danh mục tài sản sở hữu như cổ phiếu, vàng, hay crypto. Backend của SpendSense AI sẽ tự động gọi API của `vnstock` để cập nhật giá cổ phiếu thực tế từ sàn chứng khoán, kết nối API Binance lấy giá crypto và tỷ giá vàng SJC để tính toán lời lỗ tức thời cho danh mục."*

### Phần 4: AI Macro Stress-Test & Đề Xuất Phòng Vệ (2:00 - 2:30)
*   **Hành động trên màn hình**:
    1.  Bấm vào tab **"AI Stress-Test"** ở góc trên bên phải.
    2.  Bảng phân tích rủi ro hiện ra:
        *   Chỉ số tổn hại rủi ro: Ví dụ *24.5% (Mức Trung bình)*.
        *   Kịch bản tệ nhất: *Sụp đổ thị trường Crypto*.
        *   Đồ thị cột Recharts so sánh giá trị tài sản biến động dưới 4 kịch bản vĩ mô.
        *   Xem phần **"Nhận định rủi ro từ AI"** và **"Chiến lược phòng vệ đề xuất"** hiển thị chi tiết số tiền rebalance và lý do.
*   **Lời thoại thuyết trình**:
    > *"Cuối cùng là tính năng đột phá: **AI Macro Stress-Test**. Hệ thống sẽ chạy thuật toán giả lập các cuộc khủng hoảng như lạm phát phi mã, suy thoái thị trường hay sụp đổ công nghệ trên danh mục tài sản thực tế của mình.*
    > *Từ dữ liệu giả lập này, Gemini 2.5 Flash sẽ phân tích điểm yếu và đưa ra các hành động phòng vệ cụ thể — ví dụ khuyên mình trích bao nhiêu tiền nhàn rỗi để mua thêm tài sản an toàn hoặc giảm tỷ trọng crypto để bảo vệ vốn. Điều này mang lại giá trị cố vấn tài chính thực tế vượt trội so với việc chỉ trò chuyện thông thường với LLM."*
    > *Cảm ơn thầy và các bạn đã theo dõi phần demo của nhóm 7."*

---

## 💡 Mẹo nhỏ khi quay video:
1.  **Chất lượng âm thanh**: Dùng tai nghe có mic để lọc ồn tốt.
2.  **Độ phân giải màn hình**: Nên chỉnh độ phân giải màn hình về $1920 \times 1080$ và zoom trình duyệt khoảng $110\%$ để chữ hiển thị to rõ nét trên video.
3.  **Tốc độ click**: Tránh click quá nhanh, hãy click và dừng khoảng 1-2 giây cho người xem kịp quan sát sự thay đổi trên giao diện.
