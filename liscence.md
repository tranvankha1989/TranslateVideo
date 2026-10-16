# Software Licensing & Anti-Tamper Specification (Offline-First Architecture)

## 1. Tổng quan kiến trúc & Mục tiêu

- **Stack:** Electron (Frontend UI) + Python (Backend Engine: FastAPI/IPC) + Cython/C++ (Core License Binding).
- **Mục tiêu:**
  - Hỗ trợ dùng thử (Trial) 30 ngày hoàn toàn Offline.
  - Ngăn chặn triệt để hành vi lùi ngày hệ thống (Time Tampering / Clock Rollback).
  - Ngăn chặn hành vi gỡ cài đặt rồi cài lại (Re-installation loop).
  - Vô hiệu hóa việc format/cài lại Windows để lạm dụng trial thông qua cơ chế **Feature Gating (Rào cản đầu ra)**.
  - Hỗ trợ kích hoạt Offline bằng chữ ký số bất đối xứng (Ed25519) ràng buộc theo mã phần cứng (HWID).

---

## 2. Luồng kiểm tra trạng thái (Application Lifecycle Flow)

[Khởi động App]
│
▼
[Thu thập HWID] (CPU + Motherboard + Disk Serial)
│
▼
[Kiểm tra License Key hiện có]
├─► (Hợp lệ vĩnh viễn): Mở khóa toàn bộ tính năng ──► [Chạy Full Mode]
│
└─► (Chưa kích hoạt / Key Trial):
│
▼
[Đọc 3 vị trí Breadcrumbs lưu trạng thái]
(Registry + %ProgramData% + Alternate Data Stream)
│
▼
[Kiểm tra can thiệp thời gian]
├─► (Now < Last_Run_Timestamp - 180s) ──► [Phát hiện lùi ngày] ──► [Khóa Trial]
├─► (Now < Max(FileSystem_Logs)) ──► [Phát hiện lùi ngày] ──► [Khóa Trial]
└─► (Hợp lệ):
│
▼
[Tính toán thời hạn Trial]
├─► (Thời gian chạy > 30 ngày) ────────► [Khóa Trial] ──► [Hiện Form Key]
└─► (Còn hạn dùng thử):
│
▼
[Chạy Trial Mode kèm Feature Gating]
(Worker chạy ngầm mỗi 120s ghi đè Last_Run_Timestamp)

---

## 3. Danh mục công việc chi tiết (Tasks Breakdown)

### Task 1: Module Định danh Thiết bị Cố định (HWID Engine)

- **Vị trí code:** `backend/core/hwid.py` (hoặc module Cython/Native).
- **Mục tiêu:** Tạo chuỗi định danh bất biến ngay cả khi format ổ C hoặc cài lại Windows.
- **Chi tiết thực thi:**
  1. Sử dụng WMI (hoặc thư viện native C++) để trích xuất 3 thông số:
     - `CPU Processor ID`: `wmic cpu get processorid`
     - `BaseBoard Serial`: `wmic baseboard get serialnumber`
     - `System Disk Serial`: `wmic diskdrive where "Index=0" get serialnumber`
  2. Chuẩn hóa chuỗi (loại bỏ khoảng trắng, ký tự rác, uppercase):
     ```python
     raw_id = f"{cpu_id.strip()}:{mb_serial.strip()}:{disk_serial.strip()}:{APP_SALT}"
     hwid = hashlib.sha256(raw_id.encode('utf-8')).hexdigest().upper()
     # Format hiển thị cho người dùng: TTS-XXXX-XXXX-XXXX-XXXX
     ```
  3. Bổ sung IPC endpoint trong Electron và Python API để gửi HWID lên giao diện UI kèm nút copy.

---

### Task 2: Chống lùi ngày hệ thống (Anti-Clock Rollback)

- **Vị trí code:** `backend/core/security/clock_monitor.py`
- **Mục tiêu:** Phát hiện ngay lập tức hành vi chỉnh lùi ngày giờ trên OS.
- **Chi tiết thực thi:**
  1. **Monotonic Tick Counter:**
     - Sử dụng API `ctypes.windll.kernel32.GetTickCount64()` để theo dõi thời gian uptime máy tính kể từ lúc bật máy. Lưu tổng số giờ tích lũy đã chạy app.
  2. **Heartbeat Timestamp Tracker:**
     - Tạo một background thread chạy ngầm mỗi 120 giây:
       - Đọc `current_time = time.time()`.
       - Đọc `last_run = read_last_run_timestamp()`.
       - Nếu `current_time < (last_run - 180)`:
         - Đánh dấu trạng thái `CLOCK_TAMPERED = True`.
         - Hủy phiên làm việc hiện tại, gửi tín hiệu qua IPC để Electron chuyển sang màn hình thông báo: _"Phát hiện thay đổi ngày giờ hệ thống không hợp lệ. Vui lòng đồng bộ lại giờ hoặc nhập key bản quyền."_
       - Nếu hợp lệ: Cập nhật `last_run = current_time`.
  3. **Kiểm tra chéo File Hệ thống (FS Timestamp):**
     - Quét thời gian sửa đổi gần nhất (`os.path.getmtime`) của `C:\Windows\System32\winevt\Logs\System.evtx` hoặc `C:\Windows\System32\config\SOFTWARE`.
     - Nếu `current_time < file_mtime - 300`: Đánh dấu gian lận.

---

### Task 3: Phân tán dấu vết Trial & Chống gỡ cài lại (Anti-Reinstall Persistence)

- **Vị trí code:** `backend/core/security/persistence.py`
- **Mục tiêu:** Không để người dùng reset trial bằng cách gỡ app và cài lại.
- **Chi tiết thực thi:**
  1. Cấu trúc Payload trạng thái:
     ```json
     {
       "install_timestamp": 1792137600,
       "last_run_timestamp": 1792224000,
       "accumulated_run_seconds": 3600,
       "is_expired": false
     }
     ```
  2. Mã hóa Payload bằng **AES-256-GCM**, sử dụng khóa dẫn xuất từ chính HWID của máy (`PBKDF2(HWID, salt)`).
  3. Ghi song song vào 3 vị trí độc lập trên Windows:
     - **Vị trí 1 (Registry ẩn):** `HKCU\Software\Classes\CLSID\{8A7D4C12-65B3-4E89-9F12-3B4A5D6E7F80}\Data` (ngụy trang dưới tên registry của COM Object).
     - **Vị trí 2 (File hệ thống ẩn):** `%ProgramData%\Microsoft\Vault\syscache.bin` (hoặc thư mục tương tự ít bị quét khi uninstall).
     - **Vị trí 3 (Alternate Data Stream - NTFS):** Gắn stream vào file có sẵn: `os.path.join(os.environ['USERPROFILE'], 'ntuser.ini:tts_metrics')`.
  4. Cơ chế đồng thuận: Khi app khởi động, đọc cả 3 vị trí. Nếu 1 trong 3 vị trí báo `is_expired == True` hoặc `install_timestamp` đã quá 30 ngày $\rightarrow$ Khóa tính năng trial.

---

### Task 4: Giới hạn Tính năng Nghiệp vụ (Feature Gating)

- **Vị trí code:** Phân bổ tại các module nghiệp vụ của Backend Python.
- **Mục tiêu:** Cho phép trải nghiệm chất lượng nhưng ngăn chặn xuất bản phẩm thương mại hoàn chỉnh (triệt tiêu động lực cài lại Win để cày tool).

| Module nghiệp vụ            | Giới hạn khi ở chế độ TRIAL                                                              | Chế độ BẢN QUYỀN (LICENSED)                |
| :-------------------------- | :--------------------------------------------------------------------------------------- | :----------------------------------------- |
| **TTS Cơ bản**              | Tối đa 2.000 ký tự / lần xuất âm thanh.                                                  | Không giới hạn ký tự.                      |
| **Dịch & Lồng tiếng Video** | Giới hạn xử lý tối đa **2 phút** đầu của video. Chèn audio watermark ngẫu nhiên mỗi 45s. | Xử lý full độ dài video, không watermark.  |
| **Tự tạo Caption (.srt)**   | Xem preview toàn bộ, nhưng xuất file `.srt` chỉ lấy **2 phút** đầu.                      | Xuất toàn bộ file subtitle chuẩn timeline. |
| **Clone giọng mới**         | Cho phép clone và lưu tối đa **1 profile voice** duy nhất để test.                       | Không giới hạn số lượng voice profiles.    |

---

### Task 5: Hệ thống Ký số & Xác thực License (Ed25519 Engine)

- **Vị trí code:**
  - `backend/core/licensing/verifier.py` (Tích hợp trong app).
  - `tools/keygen_cli.py` (Script nội bộ riêng cho Admin/Developer).
- **Mục tiêu:** Cấp key offline mà không thể bị làm giả nếu không có Private Key.
- **Chi tiết thực thi:**
  1. **Tạo cặp khóa Ed25519 (dùng thư viện `cryptography`):**
     - Private Key: Lưu bí mật trên máy của developer, tuyệt đối không commit vào repo app.
     - Public Key: Nhúng cố định dạng byte array vào mã nguồn Python/C++ của app.
  2. **Cấu trúc License Payload:**
     ```json
     {
       "hwid": "TTS-XXXX-XXXX-XXXX-XXXX",
       "expiry_date": "2099-12-31",
       "tier": "PRO",
       "features": ["tts_unlimited", "video_dub", "voice_clone", "auto_caption"]
     }
     ```
  3. **Quy trình ký (Keygen CLI):**
     - `Signature = Ed25519_Sign(Private_Key, JSON_Payload)`
     - `License_String = Base64_Encode(JSON_Payload + ":::" + Signature)`
  4. **Quy trình Xác thực trên Client:**
     - Tách `JSON_Payload` và `Signature`.
     - Gọi `public_key.verify(Signature, JSON_Payload)`. Nếu chữ ký bị sửa đổi $\rightarrow$ Raise Error.
     - Kiểm tra `Payload["hwid"] == Current_HWID`. Nếu sai mã máy $\rightarrow$ Từ chối.
     - Kiểm tra `Payload["expiry_date"] >= Today`.

---

### Task 6: Ràng buộc mã nguồn & Nâng cao bảo mật (Code Hardening)

- **Mục tiêu:** Chống decompilation và patch code trực tiếp.
- **Chi tiết thực thi:**
  1. **Biên dịch module kiểm tra thành Native C-Extension:**
     - Sử dụng Cython để biên dịch `hwid.py`, `clock_monitor.py`, và `verifier.py` thành file `.pyd` (Windows dynamic library).
  2. **Interleaving (Ràng buộc logic model):**
     - Không trả về boolean `is_license_valid() -> True/False`.
     - Sử dụng một phần giá trị hash của Public Key hoặc License Signature làm **IV/Key giải mã cho file cấu hình model TTS (config.json) hoặc weight âm thanh**. Nếu patch code bỏ qua lệnh check key, model AI sẽ thiếu khóa giải mã và không thể load vào bộ nhớ GPU/VRAM.
  3. **Bảo vệ Frontend Electron:**
     - Bật `contextIsolation: true`, tắt `nodeIntegration: false` ở BrowserWindow.
     - Sử dụng `electron-builder` kết hợp mã hóa mã nguồn ASAR (`asar: true`).
