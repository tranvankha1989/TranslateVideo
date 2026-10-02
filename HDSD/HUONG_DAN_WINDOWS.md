# 🪟 HƯỚNG DẪN CÀI ĐẶT MÔI TRƯỜNG & CHẠY ỨNG DỤNG BẰNG TERMINAL (A - Z)

> **Dự án:** VideoTranslate AI (Dịch Video & Lồng Tiếng AI Đa Ngôn Ngữ)  
> **Repository:** [https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo)  
> **Áp dụng cho:** Máy tính Windows 10, Windows 11 mới hoàn toàn.

---

## ⚡ PHẦN 1: CÀI ĐẶT SIÊU TỐC BẰNG TERMINAL (CHỈ CẦN COPY-PASTE)

Chỉ cần làm đúng **5 bước** dưới đây bằng **PowerShell** là ứng dụng sẽ hoạt động 100%:

### Bước 1: Cài đặt toàn bộ phần mềm nền tảng (Chỉ làm 1 lần trên máy mới)
Mở **PowerShell với quyền Administrator** (Bấm nút `Windows` ➔ gõ `powershell` ➔ chọn *Run as Administrator*), copy toàn bộ khối lệnh dưới và dán vào:

```powershell
# Cài đặt tự động Git, Python 3.11, Node.js LTS và FFmpeg
winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements

# Mở quyền chạy script cho PowerShell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```
> ⚠️ **QUAN TRỌNG:** Sau khi Bước 1 chạy xong, hãy **ĐÓNG CỬA SỔ POWERSHELL NÀY LẠI** và mở một cửa sổ PowerShell mới bình thường để máy nhận diện các công cụ vừa cài.

---

### Bước 2: Tải mã nguồn về máy
Mở cửa sổ PowerShell mới và chạy lệnh sau (chọn ổ đĩa bạn muốn lưu, ví dụ ổ `D:\` hoặc `C:\`):

```powershell
# 1. Đi tới ổ đĩa muốn lưu (ví dụ ổ D):
cd D:\

# 2. Tải code từ GitHub về:
git clone https://github.com/tranvankha1989/TranslateVideo.git

# 3. Đi vào thư mục dự án:
cd TranslateVideo
```

---

### Bước 3: Cài đặt môi trường Backend (Python)
Tại thư mục `TranslateVideo`, dán khối lệnh sau:

```powershell
# 1. Đi vào thư mục backend
cd backend

# 2. Tạo môi trường ảo venv
python -m venv venv

# 3. Kích hoạt môi trường ảo
.\venv\Scripts\activate

# 4. Nâng cấp pip và cài đặt toàn bộ thư viện backend
python -m pip install --upgrade pip
pip install -r requirements.txt

# 5. Tạo file cấu hình .env mặc định
if (-not (Test-Path .env)) { copy .env.example .env }

# 6. Quay trở lại thư mục gốc
cd ..
```

---

### Bước 4: Cài đặt môi trường Frontend (React + Vite)
Tiếp tục dán khối lệnh sau vào PowerShell:

```powershell
# 1. Cài đặt công cụ pnpm toàn cục
npm install -g pnpm

# 2. Đi vào thư mục frontend và cài đặt toàn bộ gói giao diện
cd frontend
pnpm install

# 3. Quay trở lại thư mục gốc dự án
cd ..
```

---

### Bước 5: Khởi chạy ứng dụng
Để mở ứng dụng, bạn có thể chọn 1 trong 2 cách:

* **Cách A (Gõ lệnh Terminal):**
  ```powershell
  cd frontend
  pnpm run start:all
  ```
* **Cách B (Bấm chuột):**
  * Nhấp đúp chuột vào file `start.bat` tại thư mục gốc.

---

## 🌐 ĐỊA CHỈ TRUY CẬP ỨNG DỤNG
* **Giao diện Web:** [http://localhost:5173](http://localhost:5173) *(Tự động mở trên trình duyệt)*
* **Backend API & Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🛠️ PHẦN 2: CẤU HÌNH NÂNG CAO (.ENV) & CÁC TÀI KHOẢN AI

Mở file `backend/.env` bằng **Notepad** hoặc **VS Code** để chỉnh sửa:

### 1. Dùng GPU Cloud Hugging Face ZeroGPU (Khuyên Dùng - Không tốn tài nguyên máy)
```env
USE_REMOTE_GPU=true
REMOTE_GPU_URL=https://your-username-your-space.hf.space
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HF_SPACE_REPO=your-username/your-space-name
```

### 2. Dùng GPU Cloud Google Colab T4 Miễn Phí (Qua Ngrok)
```env
USE_REMOTE_GPU=true
REMOTE_GPU_URL=https://your-domain.ngrok-free.dev
```

### 3. Chạy trực tiếp bằng Card đồ họa rời của máy (NVIDIA GPU)
```env
USE_REMOTE_GPU=false
OMNIVOICE_DEVICE=cuda
OMNIVOICE_DTYPE=float16
DEFAULT_NUM_STEP=32
```

### 4. Cấu hình Khóa Dịch Thuật Google Gemini API
1. Truy cập: [Google AI Studio](https://aistudio.google.com/app/apikey) ➔ Bấm **Create API Key**.
2. Dán API key trực tiếp vào mục **Cài Đặt** trên giao diện Web của ứng dụng.

### 5. Cấu hình Telegram Bot Nhận Phản Hồi & File Log Khách Hàng
Xem hướng dẫn chi tiết 1 phút tại: [HUONG_DAN_CAU_HINH_TELEGRAM.md](HUONG_DAN_CAU_HINH_TELEGRAM.md)
```env
TELEGRAM_BOT_TOKEN=7123456789:AAFlkB_xxxxxx_xxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=1234567890
```

---

## 🔄 PHẦN 3: CẬP NHẬT ỨNG DỤNG KHI CÓ BẢN MỚI (GIT PULL)

Khi có bản cập nhật mới từ GitHub, mở Terminal tại thư mục gốc `TranslateVideo` và chạy:

```powershell
# 1. Kéo mã nguồn mới nhất
git pull origin main

# 2. Cập nhật Backend
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt

# 3. Cập nhật Frontend
cd ..\frontend
pnpm install

# 4. Chạy lại ứng dụng
pnpm run start:all
```
*(Hoặc chỉ cần nhấp đúp file `update.bat` tại thư mục gốc).*

---

## ❓ BẢNG XỬ LÝ LỖI THƯỜNG GẶP (TROUBLESHOOTING)

| Lỗi gặp phải | Nguyên nhân | Cách khắc phục siêu nhanh |
| :--- | :--- | :--- |
| `'pnpm' is not recognized` | Chưa cài đặt pnpm toàn cục | Chạy lệnh: `npm install -g pnpm` |
| `running scripts is disabled` | Chính sách bảo mật PowerShell | Mở PowerShell Admin và chạy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force` |
| `ffmpeg: command not found` | Terminal chưa nhận biến môi trường | Đóng tất cả cửa sổ Terminal và mở lại cửa sổ mới |
| `Port 8000 or 5173 already in use` | Cổng đang bị chiếm dụng bởi phiên cũ | Chạy file: `powershell -ExecutionPolicy Bypass -File scripts\kill_ports.ps1` |
| `CUDA out of memory` | Card rời không đủ VRAM | Mở `.env` chuyển sang `USE_REMOTE_GPU=true` hoặc đổi `OMNIVOICE_DTYPE=float16` |
