@echo off
chcp 65001 >nul
title VideoTranslate AI - 1-Click Build & Package (Electron Desktop App)
cd /d "%~dp0\.."

echo ====================================================================
echo    QUY TRINH DONG GOI UNG DUNG ELECTRON DESKTOP (STANDALONE + KEY)
echo ====================================================================
echo.

:: 1. Build Frontend & Dong goi Electron Binary
echo [1/4] Dang build Frontend va dong goi Electron Desktop Native App...
cd /d "%~dp0\..\frontend"
call pnpm run build
if %ERRORLEVEL% NEQ 0 (
    echo [LOI] Build Frontend that bai!
    pause
    exit /b 1
)

call pnpm run electron:pack
if %ERRORLEVEL% NEQ 0 (
    echo [LOI] Dong goi Electron that bai!
    pause
    exit /b 1
)
cd /d "%~dp0\.."

:: 2. Kiem tra va thiet lap moi truong Python Portable Embeddable
echo.
echo [2/4] Kiem tra Python Portable Runtime...
if not exist "%~dp0\..\python_runtime\python.exe" (
    echo Dang khoi tao Python Runtime moi...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_runtime.ps1"
) else (
    echo [OK] Python Runtime da san sang.
)

:: 3. Kiem tra binaries FFmpeg
echo.
echo [3/4] Kiem tra FFmpeg binaries...
if not exist "%~dp0\..\bin\ffmpeg.exe" (
    echo [CANH BAO] Chua co bin\ffmpeg.exe! Dang sao chep tu he thong...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Path '%~dp0\..\bin' -Force | Out-Null; Copy-Item (Get-Command ffmpeg).Source '%~dp0\..\bin\ffmpeg.exe' -Force; Copy-Item (Get-Command ffprobe).Source '%~dp0\..\bin\ffprobe.exe' -Force"
)
if exist "%~dp0\..\bin\ffmpeg.exe" (
    echo [OK] FFmpeg binaries da san sang trong thu muc bin\.
)

:: 4. Bien dich Inno Setup thanh file Setup.exe
echo.
echo [4/4] Dang bien dich Inno Setup thanh file Setup.exe (Ma hoa Key cai dat)...
set "ISCC="
if exist "C:\Program Files\Inno Setup 7\ISCC.exe" set "ISCC=C:\Program Files\Inno Setup 7\ISCC.exe"
if not defined ISCC if exist "C:\Program Files (x86)\Inno Setup 7\ISCC.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 7\ISCC.exe"
if not defined ISCC if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not defined ISCC (
    where ISCC >nul 2>&1
    if %ERRORLEVEL% EQU 0 set "ISCC=ISCC"
)

if not defined ISCC (
    echo [LOI] Khong tim thay Inno Setup Compiler (ISCC.exe)!
    echo Vui long cai dat Inno Setup tu: https://jrsoftware.org/isdl.php
    pause
    exit /b 1
)

echo Dang su dung: "%ISCC%"
"%ISCC%" "%~dp0installer.iss"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================================================
    echo [HOAN TAT XUAT SAC] File cai dat Setup.exe da duoc tao tai:
    echo %~dp0..\installer_output
    echo MAT KHAU / KEY CAI DAT MAC DINH: Aimabiet
    echo ====================================================================
) else (
    echo.
    echo [LOI] Bien dich Inno Setup that bai.
)

pause
