# HƯỚNG DẪN HỆ THỐNG BẢN QUYỀN & CHỐNG BẺ KHÓA (OFFLINE-FIRST ARCHITECTURE)

> **Tài liệu bàn giao & Hướng dẫn kiểm thử toàn diện**  
> *Ngày cập nhật:* 16/10/2026  
> *Nhánh Git:* `feat/license`

---

## 1. Tổng Quan Kiến Trúc Đã Triển Khai

Hệ thống bản quyền mới được thiết kế theo chuẩn thương mại **Offline-First**, hoạt động độc lập không cần internet và giải quyết triệt để các rủi ro:

1. **HWID Bất Biến:** Định danh duy nhất theo vi mạch phần cứng vật lý (`CPU ID + Motherboard Serial + Disk 0 Serial`). Format: `TTS-XXXX-XXXX-XXXX-XXXX`. Không bị đổi kể cả khi format ổ C hoặc cài lại Windows.
2. **Ký Số Bất Đối Xứng Ed25519:** Khóa bí mật (`Private Key`) chỉ lưu trên máy Developer. Client chỉ giữ `Public Key`. Không thể làm giả key nếu không có Private Key.
3. **Chống Lùi Ngày Hệ Thống (3 Lớp):**
   - Monotonic Tick Counter (`GetTickCount64`): Theo dõi uptime phần cứng tịnh tiến.
   - Heartbeat Thread (chu kỳ 120s): Ghi dấu mốc `last_run` liên tục.
   - Quét chéo file nhật ký hệ điều hành Windows: `C:\Windows\System32\winevt\Logs\System.evtx`.
4. **Phân Tán Dấu Vết Trial (Anti-Reinstall - Chuẩn AppData An Toàn 100% với Antivirus):** Mã hóa AES-256-GCM với khóa dẫn xuất từ HWID, ghi song song vào các thư mục hệ thống chuẩn (hoàn toàn không can thiệp Registry hay NTFS ADS):
   - Local AppData: `%LOCALAPPDATA%\OmniVoice\Data\lic_cache.dat`
   - Roaming AppData: `%APPDATA%\OmniVoice\Config\app_state.dat`
   - ProgramData / Shared: `%ProgramData%\OmniVoice\shared_lic.dat` (hoặc `~/.omnivoice/shared_lic.dat`)
5. **Rào Cản Tính Năng Nghiệp Vụ (Feature Gating):**
   - **TTS:** Tối đa 2.000 ký tự / lần xuất ở chế độ Trial.
   - **Dịch & Lồng tiếng Video:** Xử lý tối đa 2 phút đầu + Chèn Audio Watermark mỗi 45s.
   - **Auto Caption:** Xem preview đầy đủ, nhưng xuất `.SRT` / `.VTT` chỉ lấy 2 phút đầu.
   - **Voice Clone:** Tối đa 1 profile voice ở chế độ Trial.
6. **Code Hardening & Interleaving:** Kiểm tra chữ ký fingerprint của Public Key trong `model_handler.py` trước khi nạp model AI vào VRAM; hỗ trợ Cython build `.pyd`.

---

## 2. Danh Sách Các File Đã Xây Dựng & Chỉnh Sửa

| Tên File | Vai trò |
| :--- | :--- |
| `backend/app/core/licensing/hwid.py` | Lấy HWID bất biến (PowerShell CIM + WMI + Registry hardware fallback). |
| `backend/app/core/licensing/verifier.py` | Client Ed25519 Verifier (nhúng Public Key byte-array, kiểm tra chữ ký & hạn dùng). |
| `tools/keygen_cli.py` | CLI Admin sinh cặp khóa Ed25519, tạo mã bản quyền theo HWID (`--issue`). |
| `backend/app/core/security/clock_monitor.py` | Module chống lùi giờ: `GetTickCount64()`, Heartbeat 120s, FS logs check. |
| `backend/app/core/security/persistence.py` | Quản lý 3 vị trí dấu vết AES-256-GCM kèm cơ chế đồng thuận và tự phục hồi. |
| `backend/app/services/license_service.py` | Điều phối tổng thể bản quyền, kiểm tra Trial, cung cấp helpers Feature Gate. |
| `backend/app/services/tts_service.py` | Chặn TTS > 2.000 ký tự khi ở chế độ Trial. |
| `backend/app/services/voice_service.py` | Chặn tạo > 1 giọng custom khi ở chế độ Trial. |
| `backend/audio_processor.py` | Hàm tạo Audio Watermark (chime tần số kép tại 45s, 90s, ...). |
| `backend/app/services/video_translation/pipeline_runner.py` | Giới hạn 2 phút đầu video và chèn watermark audio khi Trial. |
| `frontend/src/pages/AutoCaption.tsx` | Giới hạn file xuất `.srt` / `.vtt` tối đa 2 phút đầu khi Trial. |
| `frontend/src/components/GlobalLicenseGuard.tsx` | Nâng cấp UI hiển thị HWID kèm nút copy, hỗ trợ nhập key Ed25519 dài. |
| `backend/setup_cython.py` | File cấu hình biên dịch các module an ninh sang Native C `.pyd`. |
| `.gitignore` | Bổ sung bỏ qua `tools/*.pem`, `tools/*.key`, `*.pyd` để bảo mật tuyệt đối. |

---

## 3. Cách Sử Dụng Công Cụ Cấp Key (Admin Keygen CLI)

Mở terminal trong thư mục dự án và dùng Python venv:

### 3.1. Cấp bản quyền VĨNH VIỄN (PRO Lifetime):
```bash
d:\Coding\VSCode\TranslateVideo\backend\venv\Scripts\python.exe tools/keygen_cli.py --issue --hwid <MÃ_MÁY> --tier PRO --days 0 --client "Anh Nam - Khách VIP"
```
*Kết quả xuất ra mã bắt đầu bằng `ED25519....` để gửi cho khách.*

### 3.2. Cấp bản quyền CÓ THỜI HẠN (Ví dụ 30 ngày hoặc 365 ngày):
```bash
# Cấp 30 ngày:
d:\Coding\VSCode\TranslateVideo\backend\venv\Scripts\python.exe tools/keygen_cli.py --issue --hwid <MÃ_MÁY> --tier PRO --days 30

# Cấp 1 năm (365 ngày):
d:\Coding\VSCode\TranslateVideo\backend\venv\Scripts\python.exe tools/keygen_cli.py --issue --hwid <MÃ_MÁY> --tier PRO --days 365
```

### 3.3. Kiểm tra thông tin của một mã bản quyền bất kỳ:
```bash
d:\Coding\VSCode\TranslateVideo\backend\venv\Scripts\python.exe tools/keygen_cli.py --verify <CHUỖI_KEY_ED25519>
```

---

## 4. Kịch Bản Kiểm Thử Chi Tiết Khi Về Nhà

### Kịch bản 1: Kiểm tra giao diện & HWID
1. Khởi động app qua file `start.bat`.
2. Mở trình duyệt tại `http://localhost:5173`.
3. Kiểm tra thanh điều hướng thấy badge **"Còn 30 ngày"** (trạng thái Trial mặc định).
4. Nhấp vào badge -> Kiểm tra mã máy `TTS-XXXX-XXXX-XXXX-XXXX`.
5. Bấm nút **"Sao chép"** -> Kiểm tra xem clipboard có lưu đúng mã máy không.

### Kịch bản 2: Kiểm tra các rào cản tính năng ở chế độ Trial
1. **TTS:** Thử tạo audio với đoạn văn bản > 2.000 ký tự -> Hệ thống phải báo lỗi từ chối và yêu cầu nâng cấp PRO. Rút ngắn < 2.000 ký tự thì tạo thành công.
2. **Voice Clone:** Đã có 1 giọng clone -> Cố tình tạo thêm giọng thứ 2 -> Hệ thống phải chặn với thông báo giới hạn 1 voice profile.
3. **Auto Caption:** Nạp video > 2 phút -> Preview được toàn bộ -> Bấm **"Tải về .SRT"** -> Toast Sonner hiện thông báo giới hạn 2 phút và mở file `.srt` kiểm tra các mốc thời gian không vượt quá `00:02:00,000`.
4. **Dịch Video:** Dịch video dài hơn 2 phút -> Video thành phẩm được giới hạn ở 2 phút đầu và có tiếng chime watermark ở giây thứ 45s, 90s.

### Kịch bản 3: Kiểm tra Chống Lùi Ngày Giờ (Anti-Clock Rollback)
1. Trong Windows Settings -> Tắt *"Set time automatically"*.
2. Chỉnh lùi ngày về 1 năm trước (ví dụ: năm 2024 hoặc 2025).
3. F5 lại trình duyệt.
4. **Kỳ vọng:** Màn hình khóa an ninh lập tức xuất hiện: *"Thời Gian Hệ Thống Bất Thường"*.
5. Bật lại *"Set time automatically"* của Windows -> F5 -> Ứng dụng tự động trở lại bình thường.

### Kịch bản 4: Kiểm tra Chống Gỡ Cài Đặt (Anti-Reinstall Persistence)
1. Thử xóa file `backend/.license_store.dat`.
2. F5 lại trang.
3. **Kỳ vọng:** Ứng dụng không bị reset về ngày 1 mà tự động khôi phục số ngày dùng thử còn lại từ các vị trí AppData/ProgramData chuẩn.

### Kịch bản 5: Kích hoạt bản quyền PRO bằng Key Ed25519
1. Chạy lệnh:
   ```bash
   d:\Coding\VSCode\TranslateVideo\backend\venv\Scripts\python.exe tools/keygen_cli.py --issue --hwid <MÃ_MÁY_CỦA_BẠN> --tier PRO --days 0
   ```
2. Copy chuỗi `ED25519....` dán vào ô kích hoạt trong app -> Bấm **Xác Thực & Kích Hoạt**.
3. **Kỳ vọng:**
   - Toast báo thành công, badge đổi thành **"Bản Quyền PRO - Vĩnh viễn"** (màu xanh lá).
   - Mọi rào cản tính năng lập tức được mở khóa hoàn toàn (TTS không giới hạn ký tự, dịch video full độ dài không watermark, xuất full phụ đề, clone không giới hạn giọng).

---

## 5. Lưu Ý Về Khóa Bí Mật (`tools/ed25519_private.pem`)

- File `tools/ed25519_private.pem` là **khóa gốc** dùng để ký mọi License Key.
- File này đã được thêm vào `.gitignore` để không bao giờ bị đẩy lên GitHub.
- **Khuyến nghị:** Hãy sao lưu file `tools/ed25519_private.pem` này vào USB hoặc Google Drive cá nhân của bạn để khi đổi máy làm việc bạn chỉ cần copy lại vào thư mục `tools/` là có thể tiếp tục cấp key cho khách hàng bình thường.
