@echo off
chcp 65001 >nul
title WebProductsV
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python nao encontrado. Instale em https://www.python.org
  pause
  exit /b 1
)
start "" http://localhost:5630/
python -m http.server 5630 --bind 127.0.0.1 --directory public
pause
