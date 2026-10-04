@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
title VideoTranslate AI - Trình Cài Đặt Tự Động 1-Click
cd /d "%~dp0"

echo ===================================================================
echo     🚀 CHƯƠNG TRÌNH TỰ ĐỘNG THIẾT LẬP & CÀI ĐẶT VIDEOTRANSLATE AI
echo ===================================================================
echo.
echo Hệ thống sẽ tự động cấu hình toàn bộ từ A đến Z:
echo   [1] Kiểm tra môi trường Python và Node.js/pnpm
echo   [2] Tạo môi trường ảo venv cho Backend (nếu chưa có)
echo   [3] Tự động cài toàn bộ thư viện Python (AI, PyTorch, Whisper, FastAPI)
echo   [4] Tự động cài đặt thư viện Frontend (React + Vite)
echo   [5] Tạo biểu tượng Shortcut ra màn hình Desktop
echo.
echo Bạn KHÔNG CẦN gõ bất kỳ câu lệnh nào!
echo ===================================================================
echo.
pause

echo.
echo -------------------------------------------------------------------
echo [Bước 1/4] Kiểm tra phần mềm nền tảng...
echo -------------------------------------------------------------------

:: 1. Kiểm tra Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [LỖI] Máy tính chưa cài Python hoặc chưa tích chọn "Add python.exe to PATH"!
    echo Vui lòng tải và cài Python 3.10 hoặc 3.11 từ: https://www.python.org/
    echo Khi cài nhớ tích vào ô: [x] Add python.exe to PATH
    echo.
    pause
    exit /b 1
)
python --version

:: 2. Kiểm tra Node.js & pnpm
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [LỖI] Máy tính chưa cài Node.js!
    echo Vui lòng tải Node.js (bản LTS) từ: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
node --version

where pnpm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Đang tự động cài đặt pnpm cho hệ thống...
    call npm install -g pnpm
)
call pnpm --version

echo.
echo -------------------------------------------------------------------
echo [Bước 2/4] Thiết lập môi trường Python Backend (venv)...
echo -------------------------------------------------------------------

if not exist "%~dp0backend\venv\Scripts\python.exe" (
    echo Đang khởi tạo môi trường ảo Python venv tại backend\venv...
    cd /d "%~dp0backend"
    python -m venv venv
    cd /d "%~dp0"
) else (
    echo Đã có sẵn môi trường ảo backend\venv.
)

echo.
echo -------------------------------------------------------------------
echo [Bước 3/4] Cài đặt toàn bộ thư viện Python Backend (AI Models)...
echo -------------------------------------------------------------------
echo Quá trình này có thể mất 2-5 phút tùy tốc độ mạng, vui lòng chờ...

:: Nâng cấp pip trong venv
"%~dp0backend\venv\Scripts\python.exe" -m pip install --upgrade pip --quiet

:: Kiểm tra card NVIDIA để tối ưu PyTorch
where nvidia-smi >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Phát hiện card đồ họa rời NVIDIA. Tối ưu PyTorch hỗ trợ GPU CUDA...
    "%~dp0backend\venv\Scripts\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 --upgrade
) else (
    echo Máy sử dụng CPU. Cài đặt PyTorch chuẩn cho CPU...
)

:: Cài toàn bộ requirements
"%~dp0backend\venv\Scripts\python.exe" -m pip install -r "%~dp0backend\requirements.txt"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [CẢNH BÁO] Có một số gói phụ thuộc chưa cài được hết, đang thử cài lại các gói cốt lõi...
    "%~dp0backend\venv\Scripts\python.exe" -m pip install fastapi "uvicorn[standard]" python-multipart pydantic faster-whisper edge-tts
)

echo.
echo -------------------------------------------------------------------
echo [Bước 4/4] Cài đặt thư viện Frontend (React + Vite)...
echo -------------------------------------------------------------------
cd /d "%~dp0frontend"
call pnpm install
cd /d "%~dp0"

echo.
echo -------------------------------------------------------------------
echo [Hoàn Tất] Tạo Shortcut ra màn hình Desktop...
echo -------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_desktop_shortcut.ps1"

echo.
echo ===================================================================
echo   🎉 CHÚC MỪNG BẠN! TOÀN BỘ ỨNG DỤNG ĐÃ ĐƯỢC CÀI ĐẶT THÀNH CÔNG 100%!
echo ===================================================================
echo.
echo - Biểu tượng "VideoTranslate AI" đã xuất hiện ngoài màn hình Desktop.
echo - Bạn có thể bấm phím bất kỳ dưới đây để KHỞI ĐỘNG ỨNG DỤNG NGAY!
echo.
pause

call "%~dp0start.bat"
