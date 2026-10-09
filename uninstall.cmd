@echo off
rem Uninstalls Blind Claude. Double click this file, or run it from a command prompt.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
pause
