# 🪟 HƯỚNG DẪN CÀI ĐẶT MÔI TRƯỜNG & CHẠY ỨNG DỤNG BẰNG TERMINAL (A - Z)

> **Dự án:** VideoTranslate AI (Dịch Video & Lồng Tiếng AI Đa Ngôn Ngữ)  
> **Repository:** [https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo)  
> **Áp dụng cho:** Máy tính Windows 10, Windows 11 mới hoàn toàn.

---

## ⚡ PHẦN 1: CÀI ĐẶT SIÊU TỐC BẰNG TERMINAL (CHỈ CẦN COPY-PASTE)

Chỉ cần làm đúng **5 bước** dưới đây bằng **PowerShell** là ứng dụng sẽ hoạt động 100%:

### Bước 1: Cài đặt toàn bộ phần mềm nền tảng (Chỉ làm 1 lần trên máy mới)
Mở **PowerShell với quyền Administrator** (Bấm nút `Windows` ➔ gõ `powershell` ➔ chọn *Run as Administrator*), copy toàn bộ khối lệnh dưới và dán vào:

Trước khi kéo code, bạn cần cài đặt 4 công cụ nền tảng trên máy tính và chuẩn bị 2 tài khoản dịch vụ AI trực tuyến:

### 1.1. Cài đặt Git (Quản lý mã nguồn)
* Tải bản cài đặt Git for Windows tại: [https://git-scm.com/download/win](https://git-scm.com/download/win)
* Khi cài đặt, cứ bấm **Next** theo mặc định cho đến khi hoàn tất.

### 1.2. Cài đặt Python 3.10 hoặc 3.11
* Tải Python 3.10.11 hoặc 3.11: [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/)
* ⚠️ **CỰC KỲ QUAN TRỌNG:** Ở màn hình cài đặt đầu tiên, bạn **BẮT BUỘC TÍCH VÀO Ô: `Add python.exe to PATH`** rồi mới bấm **Install Now**.

### 1.3. Cài đặt Node.js & pnpm
* Tải Node.js bản **LTS (v20.x hoặc v22.x)** tại: [https://nodejs.org/](https://nodejs.org/)
* Sau khi cài xong Node.js, mở terminal (PowerShell hoặc Command Prompt) và chạy lệnh cài đặt `pnpm`:
  ```powershell
  npm install -g pnpm
  ```

### 1.4. Cài đặt FFmpeg (Xử lý âm thanh)
Hệ thống AI xử lý tách, ghép, chuẩn hóa âm thanh bắt buộc phải có FFmpeg trong biến môi trường PATH:
* Mở **PowerShell** và chạy lệnh cài đặt nhanh qua Winget:
  ```powershell
  winget install Gyan.FFmpeg
  ```
* *Sau khi cài xong, tắt hết cửa sổ Terminal cũ đi và mở lại để hệ thống nhận diện FFmpeg.*
* Kiểm tra FFmpeg:
  ```powershell
  ffmpeg -version
  ```
  *(Nếu hiện ra thông tin phiên bản là thành công).*

### 1.5. Chuẩn Bị Tài Khoản Google Colab & Ngrok (Dành cho Cloud GPU)
Dành cho máy tính không có card rời NVIDIA hoặc muốn mượn card đồ họa T4 (16GB VRAM) mạnh mẽ trên đám mây để không làm nóng máy và tiết kiệm RAM:
* **Tài khoản Google (Gmail):** Dùng để truy cập [Google Colab](https://colab.research.google.com/) và chạy file sổ tay `notebooks/OmniVoice_Colab_T4.ipynb`.
* **Tài khoản Ngrok (Tạo đường hầm kết nối Cloud GPU về máy local):**
  1. Đăng ký tài khoản miễn phí tại: [https://ngrok.com/](https://ngrok.com/)
  2. Truy cập [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken) để copy mã `Authtoken`.
  3. Mã này sẽ được dán vào Colab để sinh ra đường dẫn API công khai (dạng `https://xxxx.ngrok-free.dev`) kết nối với ứng dụng trên máy bạn.

### 1.6. Chuẩn Bị API Key Google AI Studio (Dành cho Dịch Thuật Video Bằng Gemini)
Dự án sử dụng mô hình Gemini thế hệ mới để dịch phụ đề, chuyển ngữ kịch bản video và tối ưu hóa câu từ tự nhiên:
1. Truy cập cổng Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Đăng nhập bằng tài khoản Google.
3. Bấm **Create API key** (hoặc *Tạo khóa API*) ➔ Chọn một dự án Google Cloud hoặc tạo mới.
4. Sao chép khóa API (dạng chuỗi `AIzaSy...`) và lưu lại.
   * Khóa này dùng để dán trực tiếp vào giao diện tab **Dịch Video** hoặc lưu vào mục **Cài Đặt** của phần mềm.
   * *Google AI Studio cung cấp gói miễn phí lên tới 500 lượt yêu cầu/ngày đối với các model Gemini Flash Lite.*

---

## 2. Kéo Code Từ GitHub Về Máy Mới

### Cách 1: Sử dụng Git Clone (Khuyên Dùng)
1. Mở thư mục mà bạn muốn chứa dự án (ví dụ `D:\AI` hoặc `C:\Projects`).
2. Nhấn giữ phím `Shift` + click chuột phải vào khoảng trống trong thư mục ➔ chọn **Open PowerShell window here** (hoặc *Open in Terminal*).
3. Chạy lệnh clone repository chính thức:
   ```bash
   git clone https://github.com/tranvankha1989/TranslateVideo.git
   ```
4. Di chuyển vào thư mục dự án vừa tải:
   ```bash
   cd TranslateVideo
   ```

### Cách 2: Tải file nén ZIP (Nếu không muốn dùng Git)
1. Truy cập [https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo).
2. Bấm vào nút xanh **Code** ➔ Chọn **Download ZIP**.
3. Giải nén file ZIP vào ổ cứng của bạn (ví dụ `D:\TranslateVideo`).

---

## 3. Cài Đặt Backend (Python)

Mở Terminal tại thư mục gốc của dự án (`TranslateVideo`), thực hiện tuần tự:

### 3.1. Tạo môi trường ảo (Virtualenv)
=======
>>>>>>> e05088e329deef7bc9a7c06af05ad8fd10931c97
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
