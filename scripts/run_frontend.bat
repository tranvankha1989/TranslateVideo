@echo off
chcp 65001 >nul
cd /d "%~dp0..\frontend"
call pnpm dev
