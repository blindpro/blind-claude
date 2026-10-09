@echo off
rem Installs Blind Claude. Double click this file, or run it from a command prompt.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
