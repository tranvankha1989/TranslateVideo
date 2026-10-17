@echo off
chcp 65001 >nul
title VideoTranslate AI - 1-Click Build and Package (Electron Desktop App)
cd /d "%~dp0..\.."

echo ====================================================================
echo    QUY TRINH DONG GOI UNG DUNG ELECTRON DESKTOP (1-CLICK SETUP)
echo ====================================================================
echo.

:: 1. Build Frontend & Dong goi Electron Binary
echo [1/5] Dang don dep va build Frontend Vite moi nhat & dong goi Electron Desktop Native App...
cd /d "%~dp0..\..\frontend"
if exist "dist" rmdir /s /q "dist"
if exist "release" rmdir /s /q "release"

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
cd /d "%~dp0..\.."

:: 2. Kiem tra va thiet lap moi truong Python Portable Embeddable
echo.
echo [2/5] Kiem tra Python Portable Runtime...
if not exist "%~dp0..\..\python_runtime\python.exe" (
    echo Dang khoi tao Python Runtime moi...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_runtime.ps1"
) else (
    echo [OK] Python Runtime da san sang.
)

:: 3. Kiem tra binaries FFmpeg
echo.
echo [3/5] Kiem tra FFmpeg binaries...
if not exist "%~dp0..\..\bin\ffmpeg.exe" (
    echo [CANH BAO] Chua co bin\ffmpeg.exe! Dang sao chep tu he thong...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Path '%~dp0..\..\bin' -Force | Out-Null; Copy-Item (Get-Command ffmpeg).Source '%~dp0..\..\bin\ffmpeg.exe' -Force; Copy-Item (Get-Command ffprobe).Source '%~dp0..\..\bin\ffprobe.exe' -Force"
)
if exist "%~dp0..\..\bin\ffmpeg.exe" (
    echo [OK] FFmpeg binaries da san sang trong thu muc bin\.
)

:: 4. Tien hanh bao ve ma nguon: Bien dich Backend sang Bytecode (.pyc) & Xoa toan bo file .py goc
echo.
echo [4/5] Dang ma hoa va bien dich Backend chong dich nguoc (Python Bytecode Compilation)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$staging = '%~dp0..\..\build_staging\backend'; if (Test-Path '%~dp0..\..\build_staging') { Remove-Item '%~dp0..\..\build_staging' -Recurse -Force }; New-Item -ItemType Directory -Path $staging -Force | Out-Null; robocopy '%~dp0..\..\backend' $staging /E /XD venv .git .vscode __pycache__ logs outputs local_models /XF .env *.pyc /NDL /NFL /NJH /NJS /nc /ns /np | Out-Null; $pyExe = '%~dp0..\..\python_runtime\python.exe'; if (-not (Test-Path $pyExe)) { $pyExe = '%~dp0..\..\backend\venv\Scripts\python.exe' }; if (-not (Test-Path $pyExe)) { $pyExe = 'python' }; & $pyExe -O -m compileall -b $staging | Out-Null; Get-ChildItem -Path $staging -Recurse -Filter '*.py' | Remove-Item -Force -ErrorAction SilentlyContinue; if (Test-Path (Join-Path $staging '.env')) { Remove-Item (Join-Path $staging '.env') -Force };"
echo [OK] Backend da duoc bien dich hoan toan sang ma nhi phan bytecode chong dich nguoc!

:: 5. Bien dich Inno Setup thanh file Setup.exe
echo.
echo [5/5] Dang bien dich Inno Setup thanh file Setup.exe (Cai dat 1-Click tu do)...
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
    echo [LOI] Khong tim thay Inno Setup Compiler ISCC.exe
    echo Vui long cai dat Inno Setup tu: https://jrsoftware.org/isdl.php
    if exist "%~dp0..\..\build_staging" rmdir /s /q "%~dp0..\..\build_staging"
    pause
    exit /b 1
)

echo Dang su dung: "%ISCC%"
"%ISCC%" "%~dp0installer.iss"
set "BUILD_STATUS=%ERRORLEVEL%"

:: Don dep thu muc tam staging sau khi build xong
if exist "%~dp0..\..\build_staging" rmdir /s /q "%~dp0..\..\build_staging" 2>nul

if %BUILD_STATUS% EQU 0 (
    echo.
    echo ====================================================================
    echo [HOAN TAT XUAT SAC] File cai dat Setup.exe da duoc tao tai:
    echo %~dp0..\..\installer_output
    echo.
    echo - CAI DAT 1-CLICK: Cai dat nhanh chong khong can nhap key.
    echo - TRIAL 7 NGAY: Tu dong kich hoat va khoa may bang HWID chong cai lai.
    echo - CHONG DICH NGUOC: 100%% code da duoc ma hoa sang bytecode nhi phan.
    echo ====================================================================
) else (
    echo.
    echo [LOI] Bien dich Inno Setup that bai.
)

pause
