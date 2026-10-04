@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
title Sửa Lỗi Tự Động 1-Click - VideoTranslate AI
cd /d "%~dp0"

echo ===================================================================
echo   🔧 TRÌNH TỰ ĐỘNG SỬA TẤT CẢ CÁC LỖI (DLL, PYTORCH, FASTAPI...)
echo ===================================================================
echo.
echo Công cụ này sẽ tự động:
echo   1. Tự tải và cài đặt gói Microsoft Visual C++ còn thiếu của Windows
echo   2. Tự động phát hiện loại máy và cài bản PyTorch chuẩn (không bị lỗi DLL)
echo   3. Tự động cài đặt đầy đủ FastAPI và các thư viện AI còn thiếu
echo.
echo Bạn CHỈ CẦN CHỜ máy tự động xử lý, KHÔNG CẦN gõ lệnh gì cả!
echo ===================================================================
echo.

:: 1. Tự động tải & cài đặt Visual C++ Redistributable âm thầm
echo [1/3] Đang kiểm tra và tự động cập nhật gói Microsoft Visual C++...
powershell -NoProfile -Command "try { Write-Host 'Đang tải gói C++ từ Microsoft...'; Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile '$env:TEMP\vc_redist.x64.exe' -UseBasicParsing; Write-Host 'Đang cài đặt âm thầm...'; Start-Process '$env:TEMP\vc_redist.x64.exe' -ArgumentList '/install','/quiet','/norestart' -Wait; Remove-Item '$env:TEMP\vc_redist.x64.exe' -Force -ErrorAction SilentlyContinue; Write-Host '-> Cập nhật gói C++ thành công!' -ForegroundColor Green } catch { Write-Host '-> Bỏ qua cập nhật C++' }"

echo.
:: 2. Sửa lỗi PyTorch
echo [2/3] Đang cấu hình lại PyTorch tương thích với phần cứng máy tính...
if exist "%~dp0backend\venv\Scripts\python.exe" (
    where nvidia-smi >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [Phát hiện GPU NVIDIA] Đang kiểm tra PyTorch CUDA...
        "%~dp0backend\venv\Scripts\python.exe" -c "import torch; assert torch.cuda.is_available()" >nul 2>&1
        if %ERRORLEVEL% NEQ 0 (
            echo Đang cài lại PyTorch CUDA tối ưu...
            "%~dp0backend\venv\Scripts\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 --upgrade
        ) else (
            echo -> PyTorch GPU đã sẵn sàng.
        )
    ) else (
        echo [Máy sử dụng CPU] Đang chuyển sang bản PyTorch CPU siêu nhẹ (tránh lỗi DLL)...
        "%~dp0backend\venv\Scripts\python.exe" -m pip uninstall torch torchvision torchaudio -y >nul 2>&1
        "%~dp0backend\venv\Scripts\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
    )
) else (
    echo [LỖI] Chưa có môi trường venv. Vui lòng chạy setup.bat trước.
    pause
    exit /b 1
)

echo.
:: 3. Kiểm tra và cài đặt nốt các thư viện thiếu
echo [3/3] Đang kiểm tra và bù đắp các thư viện còn thiếu (FastAPI, Whisper...)...
"%~dp0backend\venv\Scripts\python.exe" -m pip install -r "%~dp0backend\requirements.txt"

echo.
:: 4. Kiểm tra tổng kết
echo -------------------------------------------------------------------
echo Đang kiểm định hệ thống lần cuối...
"%~dp0backend\venv\Scripts\python.exe" -c "import torch; import fastapi; import uvicorn; print('✅ Tất cả thư viện Backend đã hoạt động hoàn hảo!')"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================================
    echo   🎉 ĐÃ TỰ ĐỘNG SỬA XONG TẤT CẢ CÁC LỖI!
    echo   Bây giờ bạn có thể khởi động ứng dụng ngay lập tức.
    echo ===================================================================
    echo.
    powershell -NoProfile -Command "[System.Media.SystemSounds]::Asterisk.Play()" >nul 2>&1
    pause
    call "%~dp0dev.bat"
) else (
    echo.
    echo [LỖI] Vẫn còn thư viện chưa nạp được. Hãy gửi ảnh chụp màn hình này để được hỗ trợ.
    pause
)
