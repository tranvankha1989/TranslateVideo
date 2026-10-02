@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
title VideoTranslate AI Launcher
cd /d "%~dp0"

echo ===================================================
echo        Khoi dong he thong VideoTranslate AI
echo ===================================================
echo.
echo - Backend AI : http://localhost:8000
echo - Giao dien  : http://localhost:5173
echo.
echo Trinh duyet se TU DONG MO khi he thong san sang!
echo Nhan Ctrl+C de dung toan bo he thong.
echo ===================================================

:: Kiem tra moi truong Python venv
if not exist "%~dp0backend\venv\Scripts\python.exe" (
    echo [LOI] Khong tim thay Python venv tai: %~dp0backend\venv
    echo Vui long kiem tra lai thu muc backend.
    pause
    exit /b 1
)

:: Kiem tra cong cu pnpm
where pnpm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [LOI] Khong tim thay lenh 'pnpm' trong he thong!
    echo Vui long cai dat pnpm bang cach mo CMD go: npm install -g pnpm
    pause
    exit /b 1
)

:: Tu dong don dep port cu bi treo va tray manager cu
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill_ports.ps1" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tray_manager.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Cho he thong giai phong hoan toan Socket TCP va Mutex
timeout /t 1 /nobreak >nul

:: Tu dong tao Shortcut ngoai Desktop neu chua co
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_desktop_shortcut.ps1" -Silent >nul 2>&1

:: Kiem tra ket noi GPU Online (Colab/Ngrok/HF) neu co cau hinh
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check_online_gpu.ps1"

cd /d "%~dp0frontend"
call pnpm run start:all

echo.
echo ===================================================
echo [THONG BAO] He thong VideoTranslate AI da dung.
echo ===================================================
exit /b 0


