@echo off
title Odyssey Bluetooth bridge
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0odyssey-bridge.ps1" %*
pause
