# 📖 HƯỚNG DẪN CÀI ĐẶT ỨNG DỤNG CHO MÁY MỚI (COPY-PASTE BẰNG TERMINAL)

> **Dự án:** VideoTranslate AI (Dịch Video & Lồng Tiếng AI Đa Ngôn Ngữ)  
> **Repository:** [https://github.com/tranvankha1989/TranslateVideo](https://github.com/tranvankha1989/TranslateVideo)  
> **Mục tiêu:** Giúp bạn cài đặt trên bất kỳ máy tính Windows mới nào chỉ trong vài phút bằng lệnh PowerShell.

---

## ⚡ 5 BƯỚC CÀI ĐẶT SIÊU NHANH TRÊN MÁY MỚI

### 1️⃣ Bước 1: Cài đặt phần mềm nền tảng (1 lần duy nhất)
Mở **PowerShell (Run as Administrator)** và dán lệnh sau:

```powershell
# Cài tự động Git, Python 3.11, Node.js, FFmpeg
winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements

# Mở quyền chạy script trong PowerShell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

> ⚠️ **Đóng cửa sổ PowerShell này lại** và mở một cửa sổ PowerShell mới bình thường để tiếp tục.

---

### 2️⃣ Bước 2: Tải mã nguồn về máy
Mở PowerShell tại vị trí bạn muốn lưu (Ví dụ ổ `D:\` hoặc `C:\`):

```powershell
cd D:\
git clone https://github.com/tranvankha1989/TranslateVideo.git
cd TranslateVideo
```

---

### 3️⃣ Bước 3: Cài đặt Backend (Python)
Tại thư mục `TranslateVideo`, dán khối lệnh:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
if (-not (Test-Path .env)) { copy .env.example .env }
cd ..
```

---

### 4️⃣ Bước 4: Cài đặt Frontend (React + Vite)
Tiếp tục dán khối lệnh:

```powershell
npm install -g pnpm
cd frontend
pnpm install
cd ..
```

---

### 5️⃣ Bước 5: Khởi chạy ứng dụng

* **Chạy bằng Terminal:**
  ```powershell
  cd frontend
  pnpm run start:all
  ```
* **Hoặc nhấp đúp chuột vào:** `start.bat` tại thư mục gốc.

---

## 🌐 Địa chỉ truy cập
* **Web UI:** [http://localhost:5173](http://localhost:5173)
* **API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
