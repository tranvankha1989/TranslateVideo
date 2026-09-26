@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
title VoiceSync AI Launcher
cd /d "%~dp0"

echo ===================================================
echo        Khoi dong he thong VoiceSync AI
echo ===================================================
echo.
echo - Backend AI : http://localhost:8000
echo - Giao dien  : http://localhost:5173
echo.
echo Trinh duyet se TU DONG MO khi he thong san sang!
echo Nhan Ctrl+C de dung toan bo he thong.
echo ===================================================

:: Tu dong don dep port cu bi treo neu co
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Tu dong tat tien trinh tray manager cu neu co
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*tray_manager.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Tu dong tao Shortcut ngoai Desktop neu chua co
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_desktop_shortcut.ps1" -Silent >nul 2>&1

cd /d "%~dp0frontend"
call pnpm exec concurrently --kill-others --names "BACKEND,FRONTEND,TRAY" --prefix-colors "blue,magenta,cyan" "cd /d \"%~dp0backend\" && \"%~dp0backend\venv\Scripts\python.exe\" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" "call pnpm dev" "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0scripts\tray_manager.ps1\""

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [LOI] Co loi xay ra khi khoi dong ung dung.
    pause
)
exit /b 0


