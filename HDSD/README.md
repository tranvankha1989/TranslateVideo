# 📚 CẨM NANG HƯỚNG DẪN CÀI ĐẶT & KÉO CODE (WINDOWS & MACOS)

Chào mừng bạn đến với tài liệu hướng dẫn toàn diện từ A - Z để **kéo mã nguồn (clone/pull)** và **thiết lập môi trường chạy ứng dụng VideoTranslate AI** sang một máy tính mới.

* Kho lưu trữ GitHub chính thức: **[https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo)**
* Hỗ trợ đầy đủ: **Windows 10 / 11** và **macOS (Apple Silicon M1-M4 & Mac Intel)**.

---

## 🧭 Mục Lục Điều Hướng Nhanh

* 🌟 **[HƯỚNG DẪN CÀI ĐẶT CHI TIẾT CHO MÁY MỚI (TỪ A - Z)](HUONG_DAN_CAI_DAT_MAY_MOI.md)** *(Khuyên đọc)*
* 📱 **[HƯỚNG DẪN CẤU HÌNH TELEGRAM BOT NHẬN PHẢN HỒI & LOGS (1 PHÚT)](HUONG_DAN_CAU_HINH_TELEGRAM.md)**

1. [Phần 1: Hướng Dẫn Dành Cho Windows (A - Z)](#-phần-1-hướng-dẫn-dành-cho-windows-a---z)
   * 1.1. [Cài đặt phần mềm bắt buộc](#11-cài-đặt-các-phần-mềm-bắt-buộc-trên-windows)
   * 1.2. [Kéo code từ GitHub về máy](#12-kéo-code-từ-github-về-máy-windows)
   * 1.3. [Cài đặt Backend Python](#13-cài-đặt-backend-python)
   * 1.4. [Cài đặt Frontend React](#14-cài-đặt-frontend-react--vite)
   * 1.5. [Khởi chạy 1-Click với start.bat](#15-khởi-chạy-ứng-dụng-1-click)
2. [Phần 2: Hướng Dẫn Dành Cho macOS (A - Z)](#-phần-2-hướng-dẫn-dành-cho-macos-a---z)
   * 2.1. [Cài đặt môi trường qua Homebrew](#21-cài-đặt-môi-trường-qua-homebrew)
   * 2.2. [Kéo code về máy Mac](#22-kéo-code-từ-github-về-máy-mac)
   * 2.3. [Cài đặt Backend Python trên Mac](#23-cài-đặt-backend-python-trên-macos)
   * 2.4. [Cài đặt Frontend React trên Mac](#24-cài-đặt-frontend-react)
   * 2.5. [Khởi chạy Double-Click start.command](#25-khởi-chạy-ứng-dụng-trên-mac)
3. [Phần 3: Cách Cập Nhật Code Khi Có Bản Mới (Git Pull)](#-phần-3-cách-cập-nhật-code-khi-có-bản-mới-git-pull)
4. [Phần 4: Bảng Khắc Phục Mọi Lỗi Thường Gặp (Troubleshooting)](#-phần-4-bảng-khắc-phục-mọi-lỗi-thường-gặp)

---

# 🪟 PHẦN 1: HƯỚNG DẪN DÀNH CHO WINDOWS (A - Z)

### 1.1. Cài Đặt Các Phần Mềm Bắt Buộc Trên Windows

Trước tiên, hãy tải và cài đặt 4 công cụ nền tảng sau:

1. **Git for Windows:**
   * Tải tại: [https://git-scm.com/download/win](https://git-scm.com/download/win) (Bấm Next cài đặt mặc định).
2. **Python 3.10 hoặc 3.11:**
   * Tải tại: [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/) (Khuyên dùng bản 3.10.11 hoặc 3.11.9).
   * ⚠️ **CỰC KỲ QUAN TRỌNG:** Ở màn hình cài đặt đầu tiên, **BẮT BUỘC TÍCH CHỌN: `Add python.exe to PATH`** rồi mới bấm **Install Now**.
3. **Node.js LTS & pnpm:**
   * Tải bản LTS tại: [https://nodejs.org/](https://nodejs.org/)
   * Cài xong Node.js, mở PowerShell và gõ lệnh cài đặt `pnpm`:
     ```powershell
     npm install -g pnpm
     ```
4. **FFmpeg (Bắt buộc để bóc tách và xuất âm thanh):**
   * Mở PowerShell và chạy lệnh cài tự động:
     ```powershell
     winget install Gyan.FFmpeg
     ```
   * *Tắt và mở lại Terminal để nhận diện FFmpeg. Kiểm tra bằng lệnh: `ffmpeg -version`.*

---

### 1.2. Kéo Code Từ GitHub Về Máy Windows

1. Mở thư mục bạn muốn chứa dự án (ví dụ ổ `D:\` hoặc `C:\Projects`).
2. Nhấn giữ phím `Shift` + click chuột phải vào khoảng trống ➔ chọn **Open PowerShell window here** (hoặc *Open in Terminal*).
3. Chạy lệnh clone:
   ```bash
   git clone https://github.com/tranvankha1989/TranslateVideo.git
   ```
4. Di chuyển vào thư mục code vừa tải:
   ```bash
   cd TranslateVideo
   ```

*(Nếu không dùng Git, bạn có thể vào [https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo) ➔ Bấm **Code** ➔ Chọn **Download ZIP** rồi giải nén).*

---

### 1.3. Cài Đặt Backend (Python)

Tại thư mục `TranslateVideo`, thực hiện các bước sau trong PowerShell:

```powershell
# 1. Đi vào thư mục backend
cd backend

# 2. Tạo môi trường ảo cách ly (Virtual Environment)
python -m venv venv

# 3. Kích hoạt môi trường ảo
.\venv\Scripts\activate
```
*(Đầu dòng lệnh sẽ hiện chữ `(venv)` là thành công. Nếu báo lỗi script execution policy, chạy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`).*

```powershell
# 4. Cài đặt PyTorch:
# -> Nếu máy CÓ card rời NVIDIA (GTX 1650, RTX 20xx, 30xx, 40xx...):
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# -> Nếu máy KHÔNG CÓ card rời (chạy CPU hoặc dùng GPU Colab):
pip install torch torchvision torchaudio

# 5. Cài đặt toàn bộ thư viện backend
pip install -r requirements.txt

# 6. Tạo file cấu hình môi trường .env
copy .env.example .env
```

> **Cấu hình file `backend/.env`:**
> * Mở file `.env` bằng Notepad hoặc VS Code.
> * Nếu chạy card rời của máy: để `USE_REMOTE_GPU=false`, `OMNIVOICE_DEVICE=cuda`, `OMNIVOICE_DTYPE=float16`.
> * Nếu máy yếu muốn dùng GPU Colab T4 miễn phí: để `USE_REMOTE_GPU=true`, `REMOTE_GPU_URL=https://domain-ngrok-của-bạn.ngrok-free.dev`.

---

### 1.4. Cài Đặt Frontend (React + Vite)

Mở tab PowerShell mới hoặc quay ra thư mục frontend:

```powershell
cd ..\frontend
pnpm install
```

Kiểm tra build thử nghiệm:
```powershell
pnpm build
```
*(Nếu hiện `✓ built in ...s` là toàn bộ giao diện đã sẵn sàng 100%).*

---

### 1.5. Khởi Chạy Ứng Dụng (1-Click)

Tại thư mục gốc dự án (`TranslateVideo`):

* 👉 **Chỉ cần nhấp đúp vào file:**
  ```text
  start.bat
  ```
* Ứng dụng sẽ tự động:
  * Tạo sẵn biểu tượng **Shortcut ngoài Desktop**.
  * Bật song song Backend API (`port 8000`) và Frontend (`port 5173`).
  * Tự động bật trình duyệt ngay khi mô hình AI nạp xong.
  * Tự thu gọn xuống khay đồng hồ (System Tray) khi bạn ấn nút thu nhỏ Terminal.

---

# 🍎 PHẦN 2: HƯỚNG DẪN DÀNH CHO MACOS (A - Z)

Hỗ trợ mượt mà cả **Apple Silicon (M1, M2, M3, M4)** lẫn **Mac Intel**.

### 2.1. Cài Đặt Môi Trường Qua Homebrew

1. Mở ứng dụng **Terminal** trên Mac (`Cmd + Space` ➔ gõ `Terminal`).
2. Cài Homebrew (nếu máy chưa có):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. Cài toàn bộ công cụ nền tảng chỉ bằng 1 dòng lệnh:
   ```bash
   brew install git python@3.11 node ffmpeg
   npm install -g pnpm
   ```

---

### 2.2. Kéo Code Từ GitHub Về Máy Mac

```bash
cd ~/Documents
git clone https://github.com/tranvankha1989/TranslateVideo.git
cd TranslateVideo
```

---

### 2.3. Cài Đặt Backend (Python trên macOS)

```bash
cd backend

# 1. Tạo môi trường ảo với Python 3.11
python3.11 -m venv venv

# 2. Kích hoạt môi trường ảo
source venv/bin/activate

# 3. Cài đặt PyTorch hỗ trợ Apple Metal MPS
pip install --upgrade pip
pip install torch torchvision torchaudio

# 4. Cài đặt các thư viện backend tương thích macOS
pip install -r requirements-mac.txt

# 5. Tạo file cấu hình .env
cp .env.example .env
```

> **Cấu hình file `backend/.env` trên Mac:**
> * Với chip Apple M1/M2/M3/M4 chạy local: `USE_REMOTE_GPU=false`, `OMNIVOICE_DEVICE=mps`, `OMNIVOICE_DTYPE=float32`.
> * Hoặc uỷ quyền sang GPU Cloud: `USE_REMOTE_GPU=true`.

---

### 2.4. Cài Đặt Frontend (React)

```bash
cd ../frontend
pnpm install
pnpm build
```

---

### 2.5. Khởi Chạy Ứng Dụng Trên Mac

1. **Cấp quyền thực thi file script (làm 1 lần duy nhất):**
   ```bash
   cd ~/Documents/TranslateVideo
   chmod +x start.command start.sh
   ```
2. **Khởi chạy:**
   * 👉 Trong Finder, chỉ cần **nhấp đúp vào file `start.command`**.
   * Hệ thống tự khởi động và tự động mở trình duyệt Safari/Chrome tại `http://localhost:5173`.
   * Khi muốn tắt ứng dụng, chỉ cần nhấn `Ctrl + C` trên Terminal.

---

# 🔄 PHẦN 3: CÁCH CẬP NHẬT CODE KHI CÓ BẢN MỚI (GIT PULL)

Mỗi khi repository GitHub có cập nhật tính năng hoặc sửa lỗi, bạn chỉ cần mở Terminal tại thư mục dự án và chạy:

```bash
# 1. Kéo code mới nhất về
git pull origin main

# 2. Cập nhật thư viện Backend
cd backend
# Windows: .\venv\Scripts\activate  |  macOS: source venv/bin/activate
pip install -r requirements.txt

# 3. Cập nhật gói Frontend
cd ../frontend
pnpm install

# 4. Khởi chạy lại app (Windows: start.bat | macOS: ./start.sh)
```

---

# 🛠️ PHẦN 4: BẢNG KHẮC PHỤC MỌI LỖI THƯỜNG GẶP

| Hiện Tượng / Lỗi | Hệ Điều Hành | Nguyên Nhân | Cách Xử Lý Triệt Để |
| :--- | :--- | :--- | :--- |
| `'pnpm' is not recognized` | Windows / Mac | Chưa cài đặt pnpm toàn cục | Chạy lệnh `npm install -g pnpm`. |
| `cannot be loaded because running scripts is disabled` | Windows | Chính sách bảo mật PowerShell | Mở PowerShell Admin chạy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`. |
| `ffmpeg: command not found` | Windows / Mac | Chưa cài đặt FFmpeg | Windows: `winget install Gyan.FFmpeg`.<br>macOS: `brew install ffmpeg`. |
| `Unidentified developer` khi mở `start.command` | macOS | Cơ chế bảo vệ Gatekeeper của Apple | Chuột phải vào `start.command` ➔ Chọn **Open** ➔ Bấm **Open** xác nhận. |
| `Permission denied` | macOS | Chưa cấp quyền chạy file `.sh` | Chạy lệnh `chmod +x start.command start.sh`. |
| `Port 8000 or 5173 already in use` | Windows / Mac | Tiến trình phiên trước còn chạy ngầm | Windows: Mở Task Manager tắt python/node.<br>macOS: Chạy `killall python3; killall node`. |
| `CUDA out of memory` | Windows | GPU không đủ VRAM | Trong `.env`: chỉnh `DEFAULT_NUM_STEP=16`, `OMNIVOICE_DTYPE=float16` hoặc bật `USE_REMOTE_GPU=true`. |
