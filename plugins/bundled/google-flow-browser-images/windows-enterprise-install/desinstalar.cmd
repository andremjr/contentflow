@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-ContentFlowExtension.ps1"
if errorlevel 1 pause
