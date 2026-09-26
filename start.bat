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

:: Tu dong don dep port cu bi treo va tray manager cu
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill_ports.ps1" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tray_manager.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Tu dong tao Shortcut ngoai Desktop neu chua co
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_desktop_shortcut.ps1" -Silent >nul 2>&1

cd /d "%~dp0frontend"
call pnpm run start:all

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [LOI] Co loi xay ra khi khoi dong ung dung.
    pause
)
exit /b 0


