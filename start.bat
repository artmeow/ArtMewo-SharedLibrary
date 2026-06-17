@echo off
title Job Seeking Robot Launcher
cls

echo ===================================================
echo          Job Seeking Robot Launcher
echo ===================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if errorlevel 1 goto NoNode

echo [1/3] Node.js is installed.
echo.

:: 2. Check and Install Dependencies
if exist node_modules goto NodeModulesExist
echo [2/3] Installing dependencies (npm install), please wait...
call npm install
goto CheckPlaywright

:NodeModulesExist
echo [2/3] Dependencies already installed.
echo.

:CheckPlaywright
:: 3. Check and Install Playwright
if exist "%LOCALAPPDATA%\ms-playwright" goto PlaywrightExist
echo [3/3] Installing Playwright browsers...
call npx playwright install chrome
call npx playwright install chromium
goto StartServices

:PlaywrightExist
echo [3/3] Playwright browsers already installed.
echo.

:StartServices
echo ===================================================
echo [SUCCESS] Launcher initialized! Starting services...
echo Opening browser: http://localhost:3000
echo ===================================================
echo.

:: Wait 3 seconds using ping (universal delay)
ping 127.0.0.1 -n 4 > nul

start http://localhost:3000

:: 4. Start Dev Server
call npm.cmd run dev
goto End

:NoNode
echo [ERROR] Node.js is not installed!
echo Please download and install Node.js from:
echo https://nodejs.org/
echo.
pause

:End
pause
