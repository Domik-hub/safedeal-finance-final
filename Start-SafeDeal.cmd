@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or later with npm, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\ganache (
  echo Installing pinned dependencies from npm...
  call npm ci --ignore-scripts
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
echo SafeDeal opens at http://127.0.0.1:4173 after initialization.
echo Keep this window open. Press Ctrl+C to stop the local server.
set PORT=4173
node app-server.cjs
pause
