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
echo Hệ thống sẽ tự động cấu hình toàn bộ theo 5 giai đoạn:
echo   [10%%] Kiểm tra môi trường Python và Node.js / pnpm
echo   [30%%] Tạo môi trường ảo venv cho Backend
echo   [60%%] Tự động cài thư viện Python AI (có thanh %% tải trực tiếp)
echo   [85%%] Tự động cài đặt thư viện Frontend (React + Vite)
echo   [95%%] Tạo biểu tượng Shortcut ra màn hình Desktop
echo   [100%%] Hoàn tất và phát chuông thông báo thành công!
echo.
echo Bạn KHÔNG CẦN gõ bất kỳ câu lệnh nào!
echo ===================================================================
echo.
pause

echo.
echo -------------------------------------------------------------------
echo [▓░░░░░░░░░] [10%%] Đang kiểm tra phần mềm nền tảng...
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

:: 3. Tự động kiểm tra & cập nhật Visual C++ để chống lỗi WinError 126
echo Đang kiểm tra và tự động cập nhật gói Microsoft Visual C++...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile '$env:TEMP\vc_redist.x64.exe' -UseBasicParsing; Start-Process '$env:TEMP\vc_redist.x64.exe' -ArgumentList '/install','/quiet','/norestart' -Wait; Remove-Item '$env:TEMP\vc_redist.x64.exe' -Force -ErrorAction SilentlyContinue } catch {}"

echo.
echo -------------------------------------------------------------------
echo [▓▓▓░░░░░░░] [30%%] Thiết lập môi trường Python Backend (venv)...
echo -------------------------------------------------------------------

if not exist "%~dp0backend\venv\Scripts\python.exe" (
    echo Đang khởi tạo môi trường ảo Python venv tại backend\venv...
    cd /d "%~dp0backend"
    python -m venv venv
    cd /d "%~dp0"
    echo -> Đã tạo môi trường venv thành công!
) else (
    echo -> Đã có sẵn môi trường ảo backend\venv.
)

echo.
echo -------------------------------------------------------------------
echo [▓▓▓▓▓▓░░░░] [60%%] Cài đặt toàn bộ thư viện Python Backend (AI Models)...
echo -------------------------------------------------------------------
echo Quá trình này có thể mất 2-5 phút tùy tốc độ mạng.
echo Thanh tiến trình % của từng thư viện sẽ hiển thị trực tiếp bên dưới:
echo.

:: Nâng cấp pip trong venv
"%~dp0backend\venv\Scripts\python.exe" -m pip install --upgrade pip --quiet

:: Kiểm tra card NVIDIA để tối ưu PyTorch
where nvidia-smi >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [Phát hiện GPU NVIDIA] Đang tải PyTorch CUDA 12.4...
    "%~dp0backend\venv\Scripts\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 --upgrade --progress-bar on
) else (
    echo [Máy sử dụng CPU] Đang tải PyTorch bản chuẩn CPU...
    "%~dp0backend\venv\Scripts\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu --upgrade --progress-bar on
)

:: Cài toàn bộ requirements có thanh progress bar %
"%~dp0backend\venv\Scripts\python.exe" -m pip install -r "%~dp0backend\requirements.txt" --progress-bar on

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [CẢNH BÁO] Đang kiểm tra và bổ sung các gói cốt lõi còn thiếu...
    "%~dp0backend\venv\Scripts\python.exe" -m pip install fastapi "uvicorn[standard]" python-multipart pydantic faster-whisper edge-tts --progress-bar on
)

echo.
echo -> Đã cài đặt xong toàn bộ thư viện Backend!
echo.
echo -------------------------------------------------------------------
echo [▓▓▓▓▓▓▓▓░░] [85%%] Cài đặt thư viện Frontend (React + Vite)...
echo -------------------------------------------------------------------
cd /d "%~dp0frontend"
call pnpm install
cd /d "%~dp0"

echo.
echo -------------------------------------------------------------------
echo [▓▓▓▓▓▓▓▓▓░] [95%%] Tạo Shortcut ra màn hình Desktop...
echo -------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_desktop_shortcut.ps1"

:: Phát chuông báo hoàn thành của Windows
powershell -NoProfile -Command "[System.Media.SystemSounds]::Asterisk.Play()" >nul 2>&1

echo.
echo ===================================================================
echo [▓▓▓▓▓▓▓▓▓▓] [100%%] CÀI ĐẶT HOÀN TẤT THÀNH CÔNG 100%!
echo ===================================================================
echo.
echo  🎉 CHÚC MỪNG BẠN! ỨNG DỤNG ĐÃ ĐƯỢC THIẾT LẬP HOÀN CHỈNH!
echo  - Biểu tượng "VideoTranslate AI" đã xuất hiện trên màn hình Desktop.
echo  - Bạn có thể bấm phím bất kỳ dưới đây để KHỞI ĐỘNG ỨNG DỤNG NGAY!
echo ===================================================================
echo.
pause

call "%~dp0start.bat"
