@echo off
chcp 65001 >nul
title CẬP NHẬT PHẦN MỀM VIDEOSYNC AI - PRO AUTO UPDATE
echo ===================================================================
echo     🚀 TIẾN HÀNH CẬP NHẬT PHIÊN BẢN MỚI CHO VIDEOSYNC AI...
echo ===================================================================
echo.

:: 1. Tải mã nguồn mới từ Git
echo [1/3] Đang kiểm tra và tải các bản cập nhật mới nhất từ GitHub...
git pull origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [CẢNH BÁO] Không thể kéo code tự động. Hãy đảm bảo máy tính đã kết nối Internet và có quyền truy cập repo.
)
echo.

:: 2. Cập nhật thư viện Python backend nếu có gói mới
echo [2/3] Đang kiểm tra và cài đặt thư viện Backend (nếu có bổ sung)...
if exist "backend\venv\Scripts\activate.bat" (
    call backend\venv\Scripts\activate.bat
    python -m pip install -r backend\requirements.txt --quiet
) else (
    echo [Bỏ qua] Không tìm thấy thư mục backend\venv
)
echo.

:: 3. Build lại giao diện Frontend mới
echo [3/3] Đang cập nhật và biên dịch giao diện người dùng mới nhất...
if exist "frontend\package.json" (
    cd frontend
    call npm install --silent
    call npm run build
    cd ..
)
echo.

echo ===================================================================
echo   🎉 HOÀN TẤT CẬP NHẬT PHẦN MỀM!
echo   Bây giờ bạn có thể khởi động lại hệ thống bằng run_all.bat
echo ===================================================================
echo.
pause
