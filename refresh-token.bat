@echo off
chcp 65001 >nul
echo ====================================
echo   Advice & Studio7 Auto-Updater
echo ====================================
echo.

cd /d "%~dp0"
node scraper.js

echo.
pause
