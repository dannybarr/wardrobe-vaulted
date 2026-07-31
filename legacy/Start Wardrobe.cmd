@echo off
setlocal
cd /d "%~dp0"
start "Wardrobe local server" cmd /k "npm exec vite -- --host 127.0.0.1 --port 5173"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173/"
endlocal
