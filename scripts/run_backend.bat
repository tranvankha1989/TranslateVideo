@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0..\backend"
"%~dp0..\backend\venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-dir "%~dp0..\backend\app"
