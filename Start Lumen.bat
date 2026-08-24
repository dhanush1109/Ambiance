@echo off
cd /d "%~dp0"
start "Lumen BLE" cmd /k ".venv\Scripts\python.exe server.py"
cd web
if not exist node_modules call npm install
start "Lumen UI" cmd /k "npm run dev"
timeout /t 2 >nul
start http://127.0.0.1:5173
