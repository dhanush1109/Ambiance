@echo off
setlocal
cd /d "%~dp0"

REM Node is installed but not on PATH on this machine.
set "PATH=C:\Program Files\nodejs;%PATH%"

echo Starting the BLE bridge...
start "Ambiance BLE bridge" cmd /k ".venv\Scripts\python.exe server.py"

cd web
if not exist node_modules (
  echo Installing dependencies, this takes a minute...
  call npm install
)

echo Starting the Ambiance UI...
start "Ambiance UI" cmd /k "npm run dev"

timeout /t 3 >nul
start http://127.0.0.1:5173

echo.
echo Ambiance is starting in two windows.
echo   - BLE bridge  : http://127.0.0.1:8787
echo   - App         : http://127.0.0.1:5173
echo.
echo Close both windows to stop.
endlocal
