@echo off
setlocal enabledelayedexpansion
title ContentFlow - Iniciar Chrome Gemini

set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=default"

set "PORT=9644"
if /i "%PROFILE%"=="conta2" set "PORT=10126"
if /i "%PROFILE%"=="conta3" set "PORT=10545"
if /i "%PROFILE%"=="contentflow" set "PORT=9786"

set "PROFILE_DIR=%USERPROFILE%\.contentflow\gemini-browser-profiles\%PROFILE%"
set "EXT_DIR=%APPDATA%\ContentFlow\data\browser-bridge"

set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME_EXE%" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

echo ==================================================================
echo  ContentFlow — Chrome Dedicado (Gemini Browser Studio)
echo ==================================================================
echo Perfil:    %PROFILE%
echo Pasta:     %PROFILE_DIR%
echo Porta CDP: %PORT%
echo Extensao:  %EXT_DIR%
echo ==================================================================
echo.

if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

start "" "%CHROME_EXE%" --remote-debugging-port=%PORT% --remote-debugging-address=127.0.0.1 --user-data-dir="%PROFILE_DIR%" --load-extension="%EXT_DIR%" --disable-blink-features=AutomationControlled --no-first-run --no-default-browser-check --window-size=1280,900 "https://gemini.google.com/app"

echo Chrome iniciado para o perfil [%PROFILE%].
