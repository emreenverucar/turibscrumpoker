@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org/ adresinden LTS surumunu kurup tekrar deneyin.
  pause
  exit /b 1
)
echo Scrum Poker sunucusu baslatiliyor...
start "" "http://localhost:8765"
node server.js
pause
