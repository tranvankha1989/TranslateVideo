@echo off
chcp 65001 >nul
title VideoTranslate AI - KeyGen Admin

:: Uu tien su dung backend venv de dam bao day du thu vien cryptography va tkinter
set "PY_EXE="
if exist "%~dp0..\backend\venv\Scripts\python.exe" set "PY_EXE=%~dp0..\backend\venv\Scripts\python.exe"
if not defined PY_EXE if exist "%~dp0..\python_runtime\python.exe" set "PY_EXE=%~dp0..\python_runtime\python.exe"
if not defined PY_EXE (
    where python >nul 2>&1
    if %ERRORLEVEL% EQU 0 set "PY_EXE=python"
)

if not defined PY_EXE (
    echo [LOI] Khong tim thay Python tren he thong de khoi chay KeyGen Admin!
    pause
    exit /b 1
)

set "PYTHONPATH=%~dp0;%~dp0..;%PYTHONPATH%"

:: Khoi chay bang pythonw neu co de khong hien cua so CMD den, hoac chay python
set "PYW_EXE=%PY_EXE:python.exe=pythonw.exe%"
if exist "%PYW_EXE%" (
    start "" "%PYW_EXE%" "%~dp0keygen_gui.py"
) else (
    start "" "%PY_EXE%" "%~dp0keygen_gui.py"
)

exit /b 0
