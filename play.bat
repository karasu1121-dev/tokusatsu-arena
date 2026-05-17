@echo off
setlocal
title Ultraman vs Kaiju

REM Find a Node.js installation
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] Node.js not found.
    echo.
    echo  Please install Node.js from https://nodejs.org/
    echo  ^(LTS version, default options^)
    echo  Then double-click play.bat again.
    echo.
    pause
    exit /b 1
)

REM Open the game in default browser after a short delay, then start the server
start "" "http://localhost:8000/"
echo.
echo  Ultraman vs Kaiju — server starting at http://localhost:8000/
echo  Close this window to stop the server.
echo.
node serve.js
pause
