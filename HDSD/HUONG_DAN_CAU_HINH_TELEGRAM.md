# 📱 HƯỚNG DẪN CẤU HÌNH TELEGRAM BOT NHẬN PHẢN HỒI & LOGS (1 PHÚT)

> **Tính năng:** Nhận tin nhắn phản hồi, góp ý và tự động nhận file nhật ký lỗi (`app.log`) từ khách hàng trực tiếp về ứng dụng Telegram trên điện thoại / máy tính của bạn.

---

## ⚡ 3 BƯỚC THỰC HIỆN SIÊU NHANH

### 1️⃣ Bước 1: Tạo Telegram Bot & Lấy Token (30 giây)

1. Mở ứng dụng **Telegram** trên điện thoại hoặc máy tính.
2. Tìm kiếm người dùng: **`@BotFather`** (có dấu tích xanh chính chủ của Telegram).
3. Bấm **Start** hoặc gõ lệnh:
   ```text
   /newbot
   ```
4. **Nhập tên cho Bot:** (Ví dụ: `VideoTranslate Support Bot`).
5. **Nhập username cho Bot:** (Phải kết thúc bằng chữ `bot`, ví dụ: `my_translate_feedback_bot`).
6. BotFather sẽ gửi lại một tin nhắn chúc mừng kèm chuỗi **Token API** dạng:
   ```text
   7123456789:AAFlkB_xxxxxx_xxxxxxxxxxxxxxxxx
   ```
   👉 *Đây chính là `TELEGRAM_BOT_TOKEN` của bạn. Hãy sao chép chuỗi này.*

---

### 2️⃣ Bước 2: Lấy Chat ID của bạn (20 giây)

1. Trên thanh tìm kiếm Telegram, tìm bot: **`@userinfobot`**.
2. Bấm **Start**, bot sẽ gửi lại thông tin cá nhân của bạn, dòng đầu tiên là:
   ```text
   Id: 1234567890
   ```
   👉 *Dãy số này chính là `TELEGRAM_CHAT_ID` của bạn.*

> ⚠️ **LƯU Ý CỰC KỲ QUAN TRỌNG:**
> Mở lại con Bot bạn vừa tạo ở **Bước 1** và bấm **Start** (hoặc nhắn cho nó 1 tin nhắn bất kỳ như `Hi` hay `/start`). Bước này để cấp quyền cho Bot được phép gửi tin nhắn và file log cho bạn.

---

### 3️⃣ Bước 3: Điền vào file cấu hình `.env` của Backend (10 giây)

Mở file **`backend/.env`** (hoặc tạo từ `.env.example`) bằng **Notepad** hoặc **VS Code** và dán 2 giá trị bạn vừa lấy vào:

```env
# Cấu hình Telegram Bot nhận Phản Hồi & File Log từ khách hàng
TELEGRAM_BOT_TOKEN=7123456789:AAFlkB_xxxxxx_xxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=1234567890
```

---

## 🚀 KIỂM TRA TÍNH NĂNG TRÊN ỨNG DỤNG

1. Khởi động ứng dụng VideoTranslate AI (`pnpm run start:all` hoặc nhấp đúp file `start.bat`).
2. Vào trang **Cài Đặt & GPU** ➔ Bấm nút **"Góp ý & Báo lỗi"** ở góc trên (hoặc trong tab **Nhật Ký & Báo Lỗi**).
3. Nhập một tin nhắn thử nghiệm (ví dụ: *Test hệ thống Telegram bot*) và bấm **"Gửi Phản Hồi Ngay"**.
4. 📱 Điện thoại của bạn sẽ **rung chuông báo tin nhắn ngay lập tức kèm theo file `app.log`**!
