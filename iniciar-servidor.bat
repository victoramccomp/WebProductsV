@echo off
chcp 65001 >nul
title WebProductsV
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node 22.13 ou mais novo: https://nodejs.org
  pause
  exit /b 1
)
start "" http://localhost:5630/
node server.js
pause
