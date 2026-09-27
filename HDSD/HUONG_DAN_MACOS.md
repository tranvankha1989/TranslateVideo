# 🍎 HƯỚNG DẪN CÀI ĐẶT & KÉO CODE TRÊN MÁY TÍNH MACOS (A - Z)

Tài liệu này hướng dẫn chi tiết từng bước để kéo mã nguồn dự án **OmniVoice Studio (TranslateVideo)** từ GitHub về một máy Mac mới (hỗ trợ cả **Apple Silicon M1/M2/M3/M4** lẫn **Mac Intel**) và cài đặt để vận hành mượt mà.

---

## 📋 Mục Lục
1. [Chuẩn bị môi trường phần mềm với Homebrew](#1-chuẩn-bị-môi-trường-phần-mềm-với-homebrew)
2. [Kéo code từ GitHub về máy Mac](#2-kéo-code-từ-github-về-máy-mac)
3. [Cài đặt Backend (Python trên macOS)](#3-cài-đặt-backend-python-trên-macos)
4. [Cài đặt Frontend (React + Vite)](#4-cài-đặt-frontend-react--vite)
5. [Khởi chạy ứng dụng (Double-Click start.command)](#5-khởi-chạy-ứng-dụng-double-click-startcommand)
6. [Cách cập nhật code khi có bản mới (Git Pull)](#6-cách-cập-nhật-code-khi-có-bản-mới-git-pull)
7. [Xử lý các lỗi thường gặp trên macOS](#7-xử-lý-các-lỗi-thường-gặp-trên-macos)

---

## 1. Chuẩn Bị Môi Trường Phần Mềm Với Homebrew

Để cài đặt chuẩn xác nhất trên macOS và không bị xung đột môi trường hệ thống, bạn nên sử dụng **Homebrew** (trình quản lý gói chuẩn của macOS).

### 1.1. Cài đặt Homebrew (Nếu máy chưa có)
Mở ứng dụng **Terminal** (nhấn `Cmd + Space` ➔ gõ `Terminal`) và dán dòng lệnh sau:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
*(Nếu Terminal yêu cầu nhập mật khẩu máy Mac, bạn cứ nhập bình thường – mật khẩu sẽ không hiện ký tự trên màn hình – rồi ấn Enter).*

### 1.2. Cài đặt Git, Python 3.11, Node.js & FFmpeg
Chạy một lệnh duy nhất để cài đặt toàn bộ các công cụ nền tảng:
```bash
brew install git python@3.11 node ffmpeg
```

### 1.3. Cài đặt pnpm
Sau khi cài Node.js xong, cài đặt trình quản lý gói `pnpm`:
```bash
npm install -g pnpm
```

### 1.4. Kiểm tra phiên bản các công cụ
```bash
git --version
python3.11 --version
pnpm --version
ffmpeg -version
```
*(Tất cả hiện ra phiên bản là môi trường máy Mac đã hoàn hảo).*

---

## 2. Kéo Code Từ GitHub Về Máy Mac

### Cách 1: Dùng Git Clone (Khuyên Dùng)
1. Trong Terminal, di chuyển đến thư mục bạn muốn lưu dự án (ví dụ thư mục `Documents` hoặc `Developer`):
   ```bash
   cd ~/Documents
   ```
2. Kéo mã nguồn từ GitHub chính thức:
   ```bash
   git clone https://github.com/tranvankha1989/TranslateVideo.git
   ```
3. Di chuyển vào thư mục dự án vừa tải:
   ```bash
   cd TranslateVideo
   ```

### Cách 2: Tải file nén ZIP
1. Mở trình duyệt Safari hoặc Chrome truy cập: [https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo)
2. Bấm vào nút **Code** ➔ Chọn **Download ZIP**.
3. Giải nén vào thư mục bạn muốn trên máy Mac.

---

## 3. Cài Đặt Backend (Python trên macOS)

Tại thư mục dự án `TranslateVideo`, thực hiện các bước sau:

### 3.1. Tạo môi trường ảo (Virtualenv)
```bash
cd backend
python3.11 -m venv venv
```

### 3.2. Kích hoạt môi trường ảo
```bash
source venv/bin/activate
```
*(Dòng lệnh sẽ xuất hiện tiền tố `(venv)` báo hiệu môi trường ảo đã bật).*

### 3.3. Cài đặt PyTorch tối ưu cho macOS
Chạy lệnh cài đặt PyTorch (tự động hỗ trợ tăng tốc phần cứng GPU Apple Silicon Metal MPS):
```bash
pip install --upgrade pip
pip install torch torchvision torchaudio
```

### 3.4. Cài đặt các thư viện Backend
Trong dự án đã cấu hình riêng file thư viện tương thích tuyệt đối cho macOS:
```bash
pip install -r requirements-mac.txt
```
*(Hoặc `pip install -r requirements.txt` nếu dùng đầy đủ).*

### 3.5. Thiết lập file cấu hình `.env`
1. Tạo file cấu hình từ mẫu có sẵn:
   ```bash
   cp .env.example .env
   ```
2. Mở file `.env` bằng TextEdit hoặc VS Code để cấu hình:
   * **Nếu máy Mac có chip M1/M2/M3/M4 (Apple Silicon) chạy trực tiếp trên máy:**
     ```env
     USE_REMOTE_GPU=false
     OMNIVOICE_DEVICE=mps
     OMNIVOICE_DTYPE=float32
     ```
     *(Lưu ý: Trên macOS MPS, khuyên dùng `float32` để đảm bảo độ chính xác âm thanh).*
   * **Nếu máy Mac yếu (Intel hoặc muốn tốc độ siêu nhanh qua GPU Cloud T4/A100 miễn phí):**
     ```env
     USE_REMOTE_GPU=true
     REMOTE_GPU_URL=https://tên-domain-ngrok-của-bạn.ngrok-free.dev
     ```
     *(Âm thanh sẽ được xử lý trên đám mây siêu tốc chỉ trong 1-2 giây).*

---

## 4. Cài Đặt Frontend (React + Vite)

Mở tab Terminal mới hoặc quay lại thư mục gốc:

```bash
cd ../frontend
pnpm install
```

Kiểm tra biên dịch thử nghiệm:
```bash
pnpm build
```
*(Hiện thông báo `✓ built in ...s` là giao diện đã sẵn sàng 100%).*

---

## 5. Khởi Chạy Ứng Dụng (Double-Click start.command)

Để có trải nghiệm tiện lợi như một phần mềm Mac thực thụ:

### 5.1. Cấp quyền thực thi cho các file script (Chỉ cần làm 1 lần duy nhất)
Tại thư mục gốc `TranslateVideo`, chạy lệnh:
```bash
chmod +x start.command start.sh
```

### 5.2. Khởi chạy hàng ngày:
* **Cách 1: Click đúp vào file `start.command`**
  * Trong Finder, tìm file `start.command` và nhấp đúp vào nó.
  * Cửa sổ Terminal sẽ tự động hiện lên, nạp Backend, bật Frontend và **tự động mở trình duyệt Safari/Chrome tại địa chỉ `http://localhost:5173`**.
  * Khi không dùng nữa, chỉ cần nhấn tổ hợp phím `Ctrl + C` trên Terminal để tắt.

* **Cách 2: Chạy từ Terminal**
  ```bash
  ./start.sh
  ```

---

## 6. Cách Cập Nhật Code Khi Có Bản Mới (Git Pull)

Khi có bản cập nhật trên GitHub:

```bash
# 1. Kéo code mới nhất về máy Mac
git pull origin main

# 2. Cập nhật Backend
cd backend
source venv/bin/activate
pip install -r requirements-mac.txt

# 3. Cập nhật Frontend
cd ../frontend
pnpm install

# 4. Khởi chạy lại ứng dụng
cd ..
./start.sh
```

---

## 7. Xử Lý Các Lỗi Thường Gặp Trên macOS

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| `Cannot be opened because it is from an unidentified developer` | Cơ chế bảo vệ Gatekeeper của macOS khi bấm `start.command` | Click chuột phải vào `start.command` ➔ Chọn **Open** ➔ Bấm **Open** trong hộp thoại xác nhận. |
| `Permission denied` khi chạy `./start.sh` | Chưa cấp quyền thực thi file Bash | Chạy lệnh `chmod +x start.command start.sh`. |
| `ffmpeg: command not found` | Chưa cài FFmpeg trên Mac | Chạy `brew install ffmpeg`. |
| Âm thanh bị giật hoặc rè trên chip M1/M2 khi chạy local | MPS chưa tương thích `float16` trên một số phiên bản PyTorch | Đổi trong file `backend/.env`: `OMNIVOICE_DTYPE=float32` hoặc chuyển sang `USE_REMOTE_GPU=true`. |
| Port 8000 hoặc 5173 đang bị chiếm | Có tiến trình chạy ngầm từ phiên làm việc trước | Mở Terminal chạy: `killall python3; killall node` rồi bật lại ứng dụng. |
