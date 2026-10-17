@echo off
chcp 65001 > nul
echo ===================================================================
echo     DONG GOI KEYGEN ADMIN DESKTOP APP - SETUP INSTALLER
echo ===================================================================

cd /d "%~dp0"

set "PYTHON_EXE=..\backend\venv\Scripts\python.exe"
set "PYINSTALLER_EXE=..\backend\venv\Scripts\pyinstaller.exe"
set "ISCC_EXE=C:\Program Files\Inno Setup 7\ISCC.exe"

if not exist "%PYINSTALLER_EXE%" (
    echo [ERROR] Khong tim thay PyInstaller tai %PYINSTALLER_EXE%
    echo Vui long chay: ..\backend\venv\Scripts\pip.exe install pyinstaller
    pause
    exit /b 1
)

if not exist "%ISCC_EXE%" (
    echo [ERROR] Khong tim thay Inno Setup 7 tai %ISCC_EXE%
    pause
    exit /b 1
)

echo [1/3] Don dep thu muc build cu...
if exist "build" rd /s /q "build"
if exist "dist\KeyGen VideoTranslateAI" rd /s /q "dist\KeyGen VideoTranslateAI"
if exist "dist\KeyGen Admin" rd /s /q "dist\KeyGen Admin"

echo [2/3] Bien dich Python sang Windows Executable bang PyInstaller...
"%PYINSTALLER_EXE%" --noconsole ^
    --name="KeyGen VideoTranslateAI" ^
    --icon="license-key-icon.ico" ^
    --clean ^
    --distpath="dist" ^
    --workpath="build" ^
    --hidden-import="cryptography" ^
    --hidden-import="keygen_cli" ^
    keygen_gui.py

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PyInstaller gap loi!
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Tao bo cai dat Setup bang Inno Setup...
if not exist "..\installer_output" mkdir "..\installer_output"
"%ISCC_EXE%" keygen_installer.iss

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Inno Setup compiler gap loi!
    pause
    exit /b %ERRORLEVEL%
)

echo ===================================================================
echo [THANH CONG] File cai dat da duoc tao tai:
echo installer_output\KeyGen_VideoTranslateAI_Setup.exe
echo ===================================================================
