@echo off
REM One-click: installs Node if missing (winget), installs packages, then checks + wires Clerk and Supabase.
cd /d "%~dp0"
where node >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where node >nul 2>nul || (echo Node was just installed. Close this window and double-click WIRE_DB.bat again. & pause & exit /b 1)
if not exist node_modules call npm ci --no-audit --no-fund
if not exist .env.local copy .env.example .env.local >nul & echo Created .env.local - open it, paste your keys, then run this again. & notepad .env.local & pause & exit /b 0
node scripts\wire-db.mjs %*
pause
