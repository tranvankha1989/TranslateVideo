# 🎬 VideoTranslate AI - Ứng Dụng Dịch Video, Phụ Đề & Lồng Tiếng AI Đa Ngôn Ngữ

Một ứng dụng toàn diện giúp **Dịch Video AI**, dịch phụ đề đa ngữ, tách/ghép âm thanh và tổng hợp giọng đọc cao cấp (Text-to-Speech & Voice Clone). Hệ thống bao gồm Frontend giao diện hiện đại (React + Vite + Tailwind CSS + Sonner) và Backend AI mạnh mẽ (Python + FastAPI + Gemini + OmniVoice Diffusion).

---

## ✨ Tính Năng Nổi Bật

- 🎛️ **Phòng Thu Đa Chế Độ (Studio):**
  - **Voice Cloning:** Sao chép giọng từ mẫu hệ thống hoặc giọng cá nhân, tự động lưu và tái sử dụng bộ đệm embedding `.pt` (khởi tạo 0ms).
  - **Voice Design:** Tự thiết kế giọng nói qua mô tả đặc tính hoặc chọn nhanh từ bộ mẫu gợi ý sẵn (`instruct`: phong cách, giới tính, độ tuổi, tông giọng, thì thầm, v.v.) với giọng đọc đồng nhất xuyên suốt đoạn văn.
  - **Thanh công cụ cảm xúc phi ngôn ngữ (Non-verbal symbols):** Chèn nhanh thẻ biểu cảm như `[laughter]`, `[sigh]`, `[surprise-ah]`, `[surprise-oh]`, `[dissatisfaction-hnn]`, `[question-ah]` vào văn bản.
  - **Lưu Cấu Hình Mặc Định:** Nút **Lưu cấu hình** giúp ghi nhớ các thông số mô hình hay dùng (CFG, Tốc độ, Cao độ, Định dạng) cho các phiên làm việc sau.
  - **Chất lượng Studio 24,000 Hz:** Âm thanh đầu ra trong trẻo, chi tiết cao, hỗ trợ xuất `.mp3` và `.wav`.
- 🎲 **Tạo Giọng Random & Sao Chép Giọng (Cloning Voice):**
  - **Tạo giọng Random:** Tự sinh các giọng nói ngẫu nhiên mới lạ, nghe thử trực tiếp, nếu ưng ý có thể lưu lại vào danh sách giọng để sử dụng lâu dài, hoặc hủy bỏ nhanh chóng.
  - **Sao chép giọng (Clone Voice):** Tải file hoặc thu âm trực tiếp (3 - 15 giây).
  - **Bóc băng tự động:** Tùy chọn nhập transcript hoặc để trống, hệ thống sẽ tự động dùng Whisper ASR để trích xuất văn bản và lưu prompt `.pt`.
- 📁 **Quản Lý Dự Án (Projects):** Gom nhóm các file âm thanh theo từng dự án riêng biệt (Podcast, Audiobook, Video quảng cáo, v.v.).
- 🎧 **Thư Viện (Library):** Lưu trữ toàn bộ lịch sử tạo âm thanh, nghe lại, tải xuống nhanh chóng, sao chép văn bản và quản lý danh mục.
- 🖥️ **Tiện Ích Khởi Chạy 1-Click & System Tray:**
  - **File `start.bat`:** Tự động khởi chạy cả Backend, Frontend và tự động mở trình duyệt ngay khi mô hình AI nạp xong.
  - **Thu nhỏ xuống khay hệ thống (Hide to Tray):** Khi bấm nút thu nhỏ (`_`) trên Terminal, cửa sổ sẽ tự động ẩn xuống System Tray (khay đồng hồ) giúp màn hình làm việc luôn gọn gàng. Click đúp vào icon để mở lại bất cứ lúc nào.
  - **Icon ứng dụng & Shortcut Desktop:** Tự động tạo Shortcut `OmniVoice TTS` ngoài màn hình Desktop với biểu tượng App chuyên nghiệp.
- ⚡ **Tối Ưu Hiệu Suất:**
  - Tốc độ suy luận Diffusion siêu tốc (RTF ~0.025, nhanh gấp ~40 lần real-time trên GPU).
  - Tích hợp bộ đệm (Cache Hit) ở backend giúp trả về âm thanh ngay lập tức (0ms) cho các yêu cầu trùng lặp.

---

## 🛠️ Yêu Cầu Hệ Thống

Trước khi bắt đầu, đảm bảo máy tính của bạn đã cài đặt:

- **Python 3.10+** (khuyên dùng Python 3.10 hoặc 3.11).
- **Node.js v18+**.
- **pnpm** (Trình quản lý gói cho Node.js). Cài đặt nhanh: `npm install -g pnpm`.
- **FFmpeg** (Bắt buộc để xử lý âm thanh ở Backend).
  - **Cài đặt nhanh trên Windows:** Mở terminal (với quyền Admin nếu cần) và chạy: `winget install Gyan.FFmpeg` (hoặc `winget install ffmpeg`).
  - Sau khi cài đặt xong, hãy **khởi động lại máy tính** hoặc **khởi động lại Terminal/VSCode** để hệ thống nhận diện biến môi trường PATH của FFmpeg.

---

## 🚀 Hướng Dẫn Cài Đặt

### 1. Cài đặt Backend (Python)

Mở terminal và thực hiện các bước sau:

```bash
# Di chuyển vào thư mục backend
cd backend

# Tạo môi trường ảo (Virtual Environment)
python -m venv venv

# Kích hoạt môi trường ảo (Windows)
# Powershell
.\venv\Scripts\activate
# Git bash
source venv/Scripts/activate

# Cài đặt PyTorch hỗ trợ CUDA 12.4 (Quan trọng cho máy có card NVIDIA)
# Lưu ý: Chạy lệnh này TRƯỚC để tải bản GPU, tránh tải nhầm bản CPU
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 --upgrade --force-reinstall

# Cài đặt các thư viện cần thiết
pip install -r requirements.txt
# python -m pip install -r requirements.txt

# Chạy test
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Cài đặt Frontend (React + Vite)

Mở terminal tại thư mục dự án và thực hiện:

```bash
# Di chuyển vào thư mục frontend
cd frontend

# Cài đặt các gói phụ thuộc bằng pnpm
pnpm install
```

---

## 🌐 Tăng Tốc Bằng Cloud GPU Từ Xa (Hugging Face Spaces A100 / Google Colab T4)

Nếu máy tính của bạn **không có card đồ hoạ rời (VGA)** hoặc chỉ có CPU, việc sinh âm thanh cho văn bản dài hàng nghìn từ sẽ rất lâu. Bạn có thể uỷ quyền xử lý toàn bộ thuật toán OmniVoice sang Cloud GPU miễn phí:

### 🌟 Tùy chọn 1: Hugging Face Spaces (ZeroGPU A100/A10G) — Khuyên Dùng (Chạy 24/7, Không Cần Treo Tab)
1. Tạo một Space mới trên [Hugging Face Spaces](https://huggingface.co/spaces) (chọn SDK **Gradio**, phần cứng **ZeroGPU**).
2. Upload các file trong thư mục `hf_space/` (`app.py`, `requirements.txt`, `README.md`) lên Space.
3. Khi Space hiển thị **Running**, copy link Direct URL (dạng `https://<tên-bạn>-<tên-space>.hf.space`).
4. Cấu hình file `backend/.env`:
   ```env
   USE_REMOTE_GPU=true
   REMOTE_GPU_URL=https://<tên-bạn>-<tên-space>.hf.space
   ```

### ☕ Tùy chọn 2: Google Colab GPU T4 (NVIDIA Tesla T4 16GB)
Mở file [`notebooks/OmniVoice_Colab_T4.ipynb`](file:///d:/Coding/VSCode/self-tts/notebooks/OmniVoice_Colab_T4.ipynb) trên [Google Colab](https://colab.research.google.com/) và vào `Runtime` ➔ `Change runtime type` ➔ Chọn **T4 GPU**.

#### 🌟 Cách 1: Kết nối cố định vĩnh viễn với Ngrok Static Domain (Khuyên dùng - Điền 1 lần dùng mãi mãi)
1. Đăng ký tài khoản miễn phí tại [dashboard.ngrok.com](https://dashboard.ngrok.com/) (đăng nhập bằng Google trong 10 giây).
2. Lấy **Authtoken** tại mục [Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).
3. Bấm nhận **1 Domain tĩnh miễn phí** tại mục [Cloud Edge ➔ Domains](https://dashboard.ngrok.com/cloud-edge/domains) (ví dụ: `my-colab-tts.ngrok-free.app`).
4. Điền cố định vào `backend/.env` trên máy bạn (**chỉ làm 1 lần duy nhất**):
   ```env
   USE_REMOTE_GPU=true
   REMOTE_GPU_URL=https://my-colab-tts.ngrok-free.app
   ```
5. Trên Google Colab: Nhập `NGROK_AUTHTOKEN` và `NGROK_STATIC_DOMAIN` vào form ô chạy rồi bấm **Play (▶️)**.
   👉 **Từ nay về sau:** Mỗi lần mở Colab chỉ cần bấm **Play**, web tự động kết nối ngay mà **không bao giờ phải sửa file `.env` nữa!**

#### 🌐 Cách 2: Kết nối ngẫu nhiên qua Cloudflare Tunnel (Không cần đăng ký)
- Trên Colab, chọn `TUNNEL_METHOD = "cloudflare"` rồi bấm **Play (▶️)**.
- Sau khi chạy xong, copy URL dạng `https://xxxx.trycloudflare.com` dán vào `REMOTE_GPU_URL` trong file `backend/.env`.

---

## ⚡ Khởi Chạy Nhanh 1-Click (Khuyên Dùng)

Sau khi hoàn tất cài đặt lần đầu, bạn chỉ cần:

1. **Khởi động ứng dụng:**
   - Click đúp vào file **`start.bat`** tại thư mục gốc của dự án (hoặc click vào shortcut **`OmniVoice TTS`** ngoài màn hình Desktop).
   - Hệ thống sẽ tự khởi động Backend & Frontend trên cùng một màn hình điều khiển, đồng thời **tự động mở trình duyệt** `http://localhost:5173` ngay khi mô hình AI nạp xong vào RAM/VRAM.
2. **Thu nhỏ xuống khay hệ thống:**
   - Nhấn nút thu nhỏ (`_`) trên cửa sổ Terminal, ứng dụng sẽ ẩn vào khay hệ thống cạnh đồng hồ.
   - Click đúp vào icon để mở lại cửa sổ, hoặc click chuột phải để truy cập menu tiện ích.
3. **Tạo lại Shortcut Desktop (nếu cần):**
   - Click đúp vào file **`create_shortcut.bat`** để tạo ngay shortcut app ngoài Desktop với icon chuyên nghiệp.

---

## 📖 Hướng Dẫn Sử Dụng Chi Tiết

1. **Sử Dụng Phòng Thu (Studio):**
   - Chọn chế độ: **Voice Cloning** (theo mẫu có sẵn hoặc giọng clone) hoặc **Voice Design** (thiết kế phong cách giọng nói qua mô tả).
   - Nhập đoạn văn bản cần đọc, có thể chèn nhanh các biểu cảm phi ngôn ngữ (`[laughter]`, `[sigh]`, v.v.).
   - Điều chỉnh các thông số: Hướng dẫn (CFG), Số bước khuếch tán (Steps), Tốc độ, Cao độ và Định dạng (.mp3 / .wav).
   - Bấm **Lưu cấu hình** để lưu lại các thông số hay dùng làm mặc định.
   - Bấm **Bắt đầu tổng hợp** để tạo giọng đọc.
2. **Trang Nhân Bản & Tạo Giọng (Cloning Voice):**
   - **Tạo giọng ngẫu nhiên:** Nhấn `Tạo thử giọng mới`, nghe thử mẫu phát âm sinh ngẫu nhiên. Nếu thích, bấm `Lưu vào danh sách giọng` để dùng vĩnh viễn; nếu không thích, bấm `Hủy / Xóa`.
   - **Clone giọng từ file âm thanh:** Tải lên file ghi âm mẫu (3 - 15 giây), hệ thống tự động bóc băng qua Whisper ASR và tạo embedding `.pt` tối ưu.
3. **Quản Lý Dự Án (Projects) & Thư Viện (Library):**
   - Tạo các thư mục dự án (Podcast, Audiobook, Video...) để phân loại.
   - Thư viện tự động lưu trữ toàn bộ các file đã tạo, hỗ trợ nghe lại, đổi dự án và tải xuống tức thì.

---

## 🏗️ Cấu Trúc Mã Nguồn

```text
├── assets/                 # Icon ứng dụng (app.ico, app.png)
├── backend/                # Server Python FastAPI & Mô hình OmniVoice AI
│   ├── main.py             # Entrypoint FastAPI REST API
│   ├── model_handler.py    # Xử lý suy luận TTS, cache embedding .pt, Whisper ASR
│   ├── presets/            # Giọng mẫu hệ thống và giọng người dùng tạo
│   ├── outputs/            # File âm thanh kết quả (.mp3, .wav)
│   └── requirements.txt    # Danh sách thư viện Python
├── frontend/               # Giao diện React + Vite + Tailwind CSS + Sonner
│   ├── src/pages/          # Các trang (Studio, Library, Projects, CloningVoice)
│   ├── src/store/          # Zustand State Management (useTTSStore.ts)
│   └── src/components/     # UI components (Header, Sidebar, Player, v.v.)
├── scripts/                # Scripts tiện ích
│   ├── tray_manager.ps1    # Quản lý ẩn khay hệ thống (System Tray) & auto-open
│   ├── create_desktop_shortcut.ps1 # Tạo shortcut ngoài Desktop với app icon
│   └── generate_icon.py    # Script sinh icon ứng dụng chuẩn đa kích thước
├── start.bat               # Trình khởi chạy 1-click toàn bộ hệ thống
└── create_shortcut.bat     # Trình tạo shortcut Desktop 1-click
```

---

_Phát triển bởi đội ngũ đam mê AI._
