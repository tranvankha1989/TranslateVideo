# 🚀 HƯỚNG DẪN CHI TIẾT SAU KHI KÉO CODE MỚI VỀ LAPTOP (GIT PULL)

> **Áp dụng cho:** Khi bạn đã kéo code mới (`git pull origin main`) về laptop cá nhân hoặc máy tính khác để tiếp tục sử dụng / phát triển dự án.

---

## ⚡ CÁCH 1: CẬP NHẬT 1 CLICK TỰ ĐỘNG BẰNG FILE `update.bat` (KHUYÊN DÙNG)

Tại thư mục gốc của dự án, bạn chỉ cần **nhấp đúp chuột vào file `update.bat`**.

Hệ thống sẽ tự động thực hiện từ A đến Z:
1. Tải bản cập nhật mới nhất từ GitHub (`git pull origin main`).
2. Tự động kiểm tra và cài đặt bổ sung các thư viện Python Backend mới vào môi trường ảo `venv`.
3. Tự động chuyển vào thư mục `frontend` và chạy `pnpm install` để đồng bộ giao diện người dùng.

Sau khi hoàn tất, bạn chỉ việc bấm **`dev.bat`** (để vừa sửa code vừa test tự reload) hoặc **`start.bat`** (để sử dụng).

---

## 🛠️ CÁCH 2: CẬP NHẬT THỦ CÔNG QUA TERMINAL (POWERSHELL / CMD)

Nếu bạn muốn kiểm tra từng bước bằng dòng lệnh, hãy mở PowerShell tại thư mục dự án:

### Bước 1: Kéo code mới nhất về máy
```powershell
git pull origin main
```

---

### Bước 2: Cập nhật thư viện Frontend (Giao diện React)
> ⚠️ **LƯU Ý QUAN TRỌNG:** Phải di chuyển vào thư mục `frontend` mới được chạy lệnh `pnpm install`. Tuyệt đối không chạy ở thư mục `backend`!

```powershell
cd frontend
pnpm install
cd ..
```

*Nếu máy tính báo lỗi `pnpm : The term 'pnpm' is not recognized...`, hãy cài pnpm trước bằng lệnh:*
```powershell
npm install -g pnpm
```

---

### Bước 3: Cập nhật thư viện Backend (Python FastAPI)
> ⚠️ **LƯU Ý QUAN TRỌNG:** Phải di chuyển vào thư mục `backend` và kích hoạt môi trường ảo `venv` trước khi chạy `pip install`:

```powershell
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

---

### Bước 4: Khởi động ứng dụng

Tùy theo nhu cầu sử dụng, bạn chọn 1 trong 2 cách sau:

* **Chế độ Lập trình & Sửa code (Khuyên dùng khi dev):**
  Bấm đúp file **`dev.bat`** tại thư mục gốc  
  *(Cửa sổ Terminal luôn mở hiển thị log trực tiếp, khi sửa file `.tsx` hay `.py` hệ thống sẽ **Tự Động Reload (Hot-Reload)** trong tích tắc mà không bị sập hay tắt server).*

* **Chế độ Sử dụng Thông thường:**
  Bấm đúp file **`start.bat`** hoặc bấm icon **VideoTranslate AI** ngoài màn hình Desktop.

---

## ❌ BẢNG TRA CỨU CÁC LỖI THƯỜNG GẶP KHI KÉO CODE

| Hiện tượng lỗi | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| `pnom : The term 'pnom' is not recognized` | Gõ sai chính tả `pnom` thay vì `pnpm`. | Gõ đúng chính tả: `pnpm install`. |
| Chạy `pnpm install` báo lỗi không tìm thấy package.json | Đang đứng nhầm ở thư mục `backend`. | Gõ `cd ..\frontend` rồi mới chạy `pnpm install`. |
| `pnpm : The term 'pnpm' is not recognized` | Máy laptop chưa cài công cụ `pnpm`. | Chạy lệnh: `npm install -g pnpm` để cài toàn cục. |
| `pip install` báo lỗi quyền hoặc cài vào Python gốc | Quên kích hoạt môi trường ảo `venv`. | Chạy lệnh: `.\venv\Scripts\activate` trước khi `pip install`. |
| Khi sửa code xong ứng dụng bị tắt ngúm | Chạy bằng icon Desktop hoặc `start.bat` có khay tray. | Hãy chạy bằng file **`dev.bat`** để giữ nguyên terminal và tự động reload. |
