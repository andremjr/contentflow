@echo off
setlocal enabledelayedexpansion
title ContentFlow - Teste Real Gemini Browser Studio
cd /d "%~dp0"

set "PROFILE=%~1"
if "%PROFILE%"=="" (
  echo ==================================================================
  echo  ContentFlow — Teste Real do Gemini Browser Studio
  echo ==================================================================
  echo  Perfis disponiveis detectados:
  if exist "%USERPROFILE%\.contentflow\gemini-browser-profiles\default" echo   - default
  if exist "%USERPROFILE%\.contentflow\gemini-browser-profiles\conta2" echo   - conta2
  if exist "%USERPROFILE%\.contentflow\gemini-browser-profiles\conta3" echo   - conta3
  if exist "%USERPROFILE%\.contentflow\gemini-browser-profiles\contentflow" echo   - contentflow
  echo ==================================================================
  echo.
  set /p "PROFILE=Digite o nome do perfil ou pressione [ENTER] para default: "
)
if "%PROFILE%"=="" set "PROFILE=default"

echo.
echo Iniciando teste real com o perfil [%PROFILE%]...
echo O Chrome sera aberto de forma visivel para voce acompanhar.
echo.

node test-live-browser.mjs %PROFILE%

echo.
echo ==================================================================
echo Teste finalizado.
echo ==================================================================
pause
