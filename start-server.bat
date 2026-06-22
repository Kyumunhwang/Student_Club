@echo off
title Student Club Record Management System
echo ==========================================================
echo   Student Club Record Management System Local Server
echo ==========================================================
echo.
echo Starting Next.js Local Server...
d:
cd "d:\Student Club Record Management System"
powershell -ExecutionPolicy Bypass -Command "npm run dev"
pause
