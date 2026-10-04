@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
title VideoTranslate AI [CHE DO DEV - HOT RELOAD]
cd /d "%~dp0"

echo ===================================================
echo     CHE DO PHAT TRIEN / CHINH SUA CODE (DEV MODE)
echo ===================================================
echo.
echo - Backend AI (Uvicorn Reload): http://localhost:8000
echo - Frontend   (Vite HMR)      : http://localhost:5173
echo.
echo * Cua so nay luon mo giup ban quan sat log truc tiep.
echo * Chinh sua file .tsx / .py he thong se TU DONG RELOAD.
echo * Neu go do co loi cu phap, server KHONG bi sap ma se cho ban sua xong.
echo.
echo Nhan Ctrl+C de dung he thong.
echo ===================================================
echo.

:: Kiem tra Python venv
if not exist "%~dp0backend\venv\Scripts\python.exe" (
    echo [LOI] Khong tim thay Python venv tai: %~dp0backend\venv
    pause
    exit /b 1
)

:: Don dep port cu neu co
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kill_ports.ps1" >nul 2>&1
timeout /t 1 /nobreak >nul

cd /d "%~dp0frontend"
call pnpm run dev:all
pause
