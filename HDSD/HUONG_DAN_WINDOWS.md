# 🪟 HƯỚNG DẪN CÀI ĐẶT & KÉO CODE TRÊN MÁY TÍNH WINDOWS (A - Z)

Tài liệu này hướng dẫn chi tiết từng bước để kéo mã nguồn dự án **VideoTranslate AI** từ GitHub về một máy tính Windows mới và thiết lập để chạy ứng dụng từ đầu.

---

## 📋 Mục Lục
1. [Chuẩn bị môi trường phần mềm & tài khoản AI](#1-chuẩn-bị-môi-trường-phần-mềm--tài-khoản-ai-bắt-buộc)
2. [Kéo code từ GitHub về máy mới](#2-kéo-code-từ-github-về-máy-mới)
3. [Cài đặt Backend (Python)](#3-cài-đặt-backend-python)
4. [Cài đặt Frontend (React + Vite)](#4-cài-đặt-frontend-react--vite)
5. [Khởi chạy ứng dụng (1-Click)](#5-khởi-chạy-ứng-dụng-1-click)
6. [Cách cập nhật code khi có bản mới (Git Pull)](#6-cách-cập-nhật-code-khi-có-bản-mới-git-pull)
7. [Xử lý các lỗi thường gặp (Troubleshooting)](#7-xử-lý-các-lỗi-thường-gặp-troubleshooting)

---

## 1. Chuẩn Bị Môi Trường Phần Mềm & Tài Khoản AI Bắt Buộc

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
   * *Google AI Studio cung cấp gói miễn phí lên tới 1.500 lượt yêu cầu/ngày đối với các model Gemini Flash.*

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
```powershell
cd backend
python -m venv venv
```

### 3.2. Kích hoạt môi trường ảo
```powershell
.\venv\Scripts\activate
```
*(Khi kích hoạt thành công, đầu dòng lệnh sẽ xuất hiện chữ `(venv)`).*

> 💡 **Mẹo:** Nếu gặp lỗi `cannot be loaded because running scripts is disabled on this system`, hãy mở PowerShell với quyền Admin và chạy:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

### 3.3. Cài đặt PyTorch
* **Trường hợp A: Máy có card đồ họa rời NVIDIA (GTX 1650, RTX 20xx, 30xx, 40xx...)**
  Chạy lệnh cài PyTorch có hỗ trợ CUDA 12.1:
  ```powershell
  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
  ```
* **Trường hợp B: Máy KHÔNG có card rời NVIDIA (Chạy CPU hoặc dùng GPU Cloud Colab/HuggingFace)**
  Chạy lệnh cài PyTorch bản tiêu chuẩn (CPU):
  ```powershell
  pip install torch torchvision torchaudio
  ```

### 3.4. Cài đặt toàn bộ thư viện Backend
```powershell
pip install -r requirements.txt
```

### 3.5. Thiết lập file cấu hình `.env`
1. Tại thư mục `backend`, sao chép file `.env.example` thành file `.env`:
   ```powershell
   copy .env.example .env
   ```
2. Mở file `.env` bằng Notepad hoặc VS Code để cấu hình:
   * **Nếu chạy trên card rời máy tính của bạn (Local GPU):**
     ```env
     USE_REMOTE_GPU=false
     OMNIVOICE_DEVICE=cuda
     OMNIVOICE_DTYPE=float16
     ```
   * **Nếu máy yếu, muốn chạy nhờ GPU Google Colab / Ngrok miễn phí:**
     ```env
     USE_REMOTE_GPU=true
     REMOTE_GPU_URL=https://tên-domain-ngrok-của-bạn.ngrok-free.dev
     ```
     *(Xem thêm hướng dẫn lấy domain Ngrok nếu dùng Cloud GPU)*.

---

## 4. Cài Đặt Frontend (React + Vite)

Mở một tab Terminal mới hoặc quay trở lại thư mục gốc dự án:

```powershell
cd ..\frontend
pnpm install
```
*(Quá trình cài đặt gói frontend chỉ mất khoảng 30 giây đến 1 phút).*

Kiểm tra bản build frontend xem có lỗi không:
```powershell
pnpm build
```
*(Nếu hiện `built in ...s` là toàn bộ giao diện đã sẵn sàng 100%).*

---

## 5. Khởi Chạy Ứng Dụng (1-Click)

Tại thư mục gốc dự án (`TranslateVideo`):

1. **Cách 1: Khởi chạy 1 chạm với `start.bat` (Khuyên dùng)**
   * Nhấp đúp chuột vào file:
     ```text
     start.bat
     ```
   * Hệ thống sẽ tự động:
     * Tạo sẵn biểu tượng **Shortcut OmniVoice TTS** ngoài màn hình Desktop.
     * Khởi động Backend API (`http://localhost:8000`).
     * Khởi động Frontend Web (`http://localhost:5173`).
     * Tự động bật trình duyệt ngay khi hệ thống nạp xong.
     * Khi thu nhỏ Terminal (`_`), ứng dụng sẽ tự động ẩn gọn gàng vào khay đồng hồ hệ thống (System Tray).

2. **Cách 2: Khởi chạy thủ công (Dành cho nhà phát triển muốn xem log riêng)**
   * **Terminal 1 (Backend):**
     ```powershell
     cd backend
     .\venv\Scripts\activate
     uvicorn main:app --host 0.0.0.0 --port 8000 --reload
     ```
   * **Terminal 2 (Frontend):**
     ```powershell
     cd frontend
     pnpm dev
     ```
   * Mở trình duyệt tại: `http://localhost:5173`.

---

## 6. Cách Cập Nhật Code Khi Có Bản Mới (Git Pull)

Mỗi khi dự án có tính năng mới hoặc bản sửa lỗi, bạn chỉ cần mở Terminal tại thư mục gốc và chạy:

```powershell
# 1. Kéo mã nguồn mới nhất về
git pull origin main

# 2. Cập nhật thư viện Backend (nếu có bổ sung thư viện mới)
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt

# 3. Cập nhật gói Frontend
cd ..\frontend
pnpm install

# 4. Khởi chạy lại ứng dụng
..\start.bat
```

---

## 7. Xử Lý Các Lỗi Thường Gặp (Troubleshooting)

| Lỗi | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| `'pnpm' is not recognized` | Chưa cài pnpm toàn cục | Chạy lệnh `npm install -g pnpm`. |
| `running scripts is disabled` | Chính sách bảo mật của PowerShell | Mở PowerShell Admin và chạy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`. |
| `ffmpeg: command not found` | FFmpeg chưa thêm vào biến môi trường PATH | Chạy `winget install Gyan.FFmpeg`, sau đó khởi động lại máy hoặc tắt mở lại Terminal. |
| `Port 8000 or 5173 already in use` | Phiên làm việc trước chưa tắt hẳn | Mở Task Manager tắt các tiến trình `python.exe` và `node.exe` đang chạy ngầm rồi mở lại `start.bat`. |
| `CUDA out of memory` | Card rời bị tràn bộ nhớ VRAM | Đổi trong file `.env`: `OMNIVOICE_DTYPE=float16`, giảm `DEFAULT_NUM_STEP=16` hoặc chuyển sang dùng Colab GPU (`USE_REMOTE_GPU=true`). |
| `Gặp lỗi lạ khác / Cần hỗ trợ` | Lỗi phát sinh trong quá trình chạy | Vào trang **Cài Đặt ➔ Tab "Nhật Ký & Báo Lỗi" ➔ Bấm nút "Tải File Log Báo Lỗi (.log)"** để gửi file `app.log` cho kỹ thuật viên chẩn đoán và sửa lỗi ngay. |

