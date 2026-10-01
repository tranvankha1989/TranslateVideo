# 📖 HƯỚNG DẪN CÀI ĐẶT ỨNG DỤNG CHI TIẾT CHO MÁY MỚI (TỪ A - Z)
> **Dự án:** OmniVoice TTS Studio & Video Translate AI  
> **Phiên bản:** v3.3.0  
> **Kho lưu trữ GitHub:** [https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo)

---

## 📑 MỤC LỤC
1. [Yêu cầu hệ thống phần cứng](#1-yêu-cầu-hệ-thống-phần-cứng)
2. [Cài đặt các phần mềm nền tảng bắt buộc](#2-cài-đặt-các-phần-mềm-nền-tảng-bắt-buộc)
3. [Kéo mã nguồn từ GitHub về máy mới](#3-kéo-mã-nguồn-từ-github-về-máy-mới)
4. [Cài đặt môi trường Backend (Python)](#4-cài-đặt-môi-trường-backend-python)
5. [Cài đặt môi trường Frontend (React + Vite)](#5-cài-đặt-môi-trường-frontend-react--vite)
6. [Thiết lập file cấu hình môi trường (.env)](#6-thiết-lập-file-cấu-hình-môi-trường-env)
7. [Khởi chạy ứng dụng (1-Click)](#7-khởi-chạy-ứng-dụng-1-click)
8. [Cập nhật mã nguồn khi có bản mới](#8-cập-nhật-mã-nguồn-khi-có-bản-mới)
9. [Bảng xử lý các lỗi thường gặp (Troubleshooting)](#9-bảng-xử-lý-các-lỗi-thường-gặp-troubleshooting)

---

## 1. Yêu Cầu Hệ Thống Phần Cứng

Ứng dụng hỗ trợ linh hoạt 2 chế độ xử lý:

* **Chế độ 1: Dùng GPU Cloud từ xa (Hugging Face ZeroGPU A100 hoặc Google Colab T4) — KHUYÊN DÙNG:**
  * **Máy tính:** Bất kỳ máy tính Windows 10/11 nào (Core i3, Core i5, RAM 8GB trở lên).
  * **Không cần card đồ họa rời NVIDIA**, không nóng máy, không ngốn RAM máy bàn.
  * Tốc độ xử lý âm thanh siêu tốc nhờ GPU đám mây.

* **Chế độ 2: Dùng Card đồ họa rời của máy (Local GPU):**
  * Card màn hình: **NVIDIA GTX 1650, RTX 2050/3050/3060/4060 trở lên** (tối thiểu 4GB VRAM).
  * RAM máy tính: Tối thiểu 16GB.

---

## 2. Cài Đặt Các Phần Mềm Nền Tảng Bắt Buộc

Trước khi tải code, bạn cần cài đặt **4 công cụ** sau lên máy mới:

### 2.1. Cài đặt Git (Quản lý mã nguồn)
1. Tải bản cài đặt Git for Windows: [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. Mở file cài đặt, bấm **Next** liên tục theo mặc định cho đến khi hoàn tất.

### 2.2. Cài đặt Python (Phiên bản 3.10 hoặc 3.11)
1. Tải Python 3.10.11 hoặc 3.11.9: [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/)
2. ⚠️ **CỰC KỲ QUAN TRỌNG:** Ở màn hình cài đặt đầu tiên, bạn **BẮT BUỘC TÍCH CHỌN: `Add python.exe to PATH`** rồi mới bấm **Install Now**.
3. Sau khi cài xong, bấm **Disable path length limit** nếu có thông báo.

### 2.3. Cài đặt Node.js & pnpm
1. Tải bản **Node.js LTS (v20.x hoặc v22.x)**: [https://nodejs.org/](https://nodejs.org/) và cài đặt bình thường.
2. Mở cửa sổ **PowerShell** (nhấn phím Windows, gõ `powershell`) và chạy lệnh:
   ```powershell
   npm install -g pnpm
   ```

### 2.4. Cài đặt FFmpeg (Xử lý âm thanh & Video)
Hệ thống xử lý tách/ghép âm thanh và phụ đề bắt buộc phải có FFmpeg:
1. Mở cửa sổ **PowerShell** và gõ lệnh cài nhanh qua Microsoft Winget:
   ```powershell
   winget install Gyan.FFmpeg
   ```
2. Tắt cửa sổ PowerShell cũ đi và mở lại một cửa sổ mới.
3. Kiểm tra bằng lệnh:
   ```powershell
   ffmpeg -version
   ```
   *(Nếu hiện ra thông tin phiên bản FFmpeg là thành công 100%).*

---

## 3. Kéo Mã Nguồn Từ GitHub Về Máy Mới

1. Mở thư mục bạn muốn chứa ứng dụng (Ví dụ: `D:\AI` hoặc `C:\Projects`).
2. Giữ phím `Shift` + click chuột phải vào khoảng trống trong thư mục ➔ chọn **Open PowerShell window here** (hoặc *Open in Terminal*).
3. Chạy lệnh:
   ```bash
   git clone https://github.com/tranvankha1989/TranslateVideo.git
   ```
4. Đi vào thư mục vừa tải về:
   ```bash
   cd TranslateVideo
   ```

---

## 4. Cài Đặt Môi Trường Backend (Python)

Tại thư mục `TranslateVideo`, chạy tuần tự các lệnh sau trong PowerShell:

```powershell
# 1. Đi vào thư mục backend
cd backend

# 2. Tạo môi trường ảo cách ly (Virtual Environment)
python -m venv venv

# 3. Kích hoạt môi trường ảo
.\venv\Scripts\activate
```
> 💡 *Khi kích hoạt thành công, đầu dòng lệnh sẽ xuất hiện chữ `(venv)`.*  
> *Nếu gặp thông báo lỗi script execution policy, chạy lệnh:* `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

```powershell
# 4. Cài đặt PyTorch:
# -> Nếu máy CÓ card rời NVIDIA (GTX 1650, RTX 20xx, 30xx, 40xx...):
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# -> Nếu máy KHÔNG có card rời (chạy CPU hoặc dùng GPU Cloud HuggingFace/Colab):
pip install torch torchvision torchaudio

# 5. Cài đặt toàn bộ các thư viện backend còn lại
pip install -r requirements.txt
```

---

## 5. Cài Đặt Môi Trường Frontend (React + Vite)

Quay ra thư mục `frontend` và cài đặt các gói giao diện:

```powershell
# Đi vào thư mục frontend
cd ..\frontend

# Cài đặt toàn bộ package
pnpm install

# Kiểm tra bản build
pnpm build
```
*(Khi thấy thông báo `✓ built in ...s` là giao diện đã sẵn sàng).*

---

## 6. Thiết Lập File Cấu Hình Môi Trường (.env)

Tại thư mục `backend`, tạo file cấu hình `.env`:
```powershell
cd ..\backend
copy .env.example .env
```

Mở file `backend/.env` bằng **Notepad** hoặc **VS Code** và chỉnh sửa theo nhu cầu:

### Lựa chọn A: Dùng Hugging Face ZeroGPU (Được tích hợp Auto-Wakeup tự động — Khuyên dùng)
```env
# Bật tính năng Remote GPU
USE_REMOTE_GPU=true

# URL Worker Space Hugging Face của bạn:
REMOTE_GPU_URL=https://tranvankha2807-translate.hf.space

# Access Token Hugging Face để tự động đánh thức khi mở app:
HF_TOKEN=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
HF_SPACE_REPO=tranvankha2807/Translate
```
> ⚡ *Khi cấu hình như trên, mỗi khi mở app trên máy tính, hệ thống sẽ tự động gửi lệnh API đánh thức ZeroGPU trên Hugging Face nếu nó đang ngủ, bạn không cần vào trình duyệt thao tác.*

### Lựa chọn B: Dùng Google Colab GPU T4 Miễn Phí
```env
USE_REMOTE_GPU=true
REMOTE_GPU_URL=https://tên-domain-ngrok-của-bạn.ngrok-free.dev
COLAB_NOTEBOOK_URL=https://colab.research.google.com/github/tranvankha1989/VoxCPM-TTS/blob/main/notebooks/OmniVoice_Colab_T4.ipynb
```

### Lựa chọn C: Chạy trực tiếp trên Card rời của máy (Local GPU)
```env
USE_REMOTE_GPU=false
OMNIVOICE_DEVICE=cuda
OMNIVOICE_DTYPE=float16
DEFAULT_NUM_STEP=32
```

---

## 7. Khởi Chạy Ứng Dụng (1-Click)

Tại thư mục gốc dự án (`TranslateVideo`):

1. **Khởi chạy cực nhanh:**
   * Nhấp đúp chuột vào file:
     ```text
     start.bat
     ```
2. **Quy trình hệ thống tự động thực hiện:**
   * Tự động tạo biểu tượng **Shortcut OmniVoice TTS** ngoài màn hình Desktop (nếu chưa có).
   * Kiểm tra và gửi lệnh đánh thức Hugging Face Space / Google Colab nếu có bật Remote GPU.
   * Khởi chạy đồng thời Backend API (`http://localhost:8000`) và Frontend UI (`http://localhost:5173`).
   * **Tự động mở trình duyệt web** ngay khi hệ thống sẵn sàng.
   * Khi bạn bấm nút thu nhỏ Terminal (`_`), ứng dụng sẽ **tự động ẩn xuống Khay đồng hồ (System Tray)** để màn hình làm việc luôn gọn gàng.

---

## 8. Cập Nhật Mã Nguồn Khi Có Bản Mới

Khi có bản cập nhật mới trên GitHub, bạn chỉ cần:

### Cách 1: Chạy file cập nhật tự động
* Nhấp đúp vào file:
  ```text
  update.bat
  ```

### Cách 2: Chạy qua dòng lệnh Git
```powershell
git pull origin main
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt
cd ..\frontend
pnpm install
..\start.bat
```

---

## 9. Bảng Xử Lý Các Lỗi Thường Gặp (Troubleshooting)

| Lỗi gặp phải | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| `'pnpm' is not recognized` | Chưa cài đặt pnpm toàn cục | Mở PowerShell và chạy lệnh: `npm install -g pnpm`. |
| `cannot be loaded because running scripts is disabled` | Chính sách bảo mật PowerShell trên Windows | Mở PowerShell với quyền Admin và chạy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`. |
| `ffmpeg: command not found` | FFmpeg chưa được nạp vào PATH | Chạy `winget install Gyan.FFmpeg`, sau đó đóng tất cả cửa sổ Terminal và mở lại. |
| `Port 8000 or 5173 already in use` | Phiên làm việc cũ còn tiến trình treo | Mở Task Manager tắt các tiến trình `python.exe` / `node.exe` hoặc chạy file `scripts/kill_ports.ps1`. |
| `CUDA out of memory` | VRAM card rời không đủ bộ nhớ | Trong file `backend/.env`, chỉnh `OMNIVOICE_DTYPE=float16`, giảm `DEFAULT_NUM_STEP=16` hoặc chuyển sang dùng Hugging Face ZeroGPU (`USE_REMOTE_GPU=true`). |
| `Khong the ket noi toi Remote GPU` | Space Hugging Face đang ngủ sâu hoặc sai URL | Kiểm tra lại `HF_TOKEN` trong `.env` hoặc đợi 30s để script tự động đánh thức server. |
