@echo off
setlocal
cd /d "%~dp0"
title TrustLock - turn on real sign-in

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is missing. Installing it with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js installed. CLOSE this window, open a new one, and run setup-real.bat again.
  pause
  exit /b 0
)

if exist .env.local (
  echo .env.local already exists, so I will not overwrite your keys.
  echo Delete it and run this again if you want to re-enter them.
  goto install
)

echo.
echo Get your keys at clerk.com - your app - Configure - API keys.
echo.
set /p CLERK_PK=Paste Clerk Publishable key (pk_test_...): 
set /p CLERK_SK=Paste Clerk Secret key (sk_test_...): 
echo.
echo Supabase keeps data after restart. Press Enter to skip for now (data then resets on restart).
set /p SB_URL=Supabase project URL: 
set /p SB_KEY=Supabase service role key: 

> .env.local echo NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=%CLERK_PK%
>> .env.local echo CLERK_SECRET_KEY=%CLERK_SK%
>> .env.local echo NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
>> .env.local echo NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
>> .env.local echo NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
>> .env.local echo NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
>> .env.local echo TRUSTLOCK_SEED_DEMO=false
if not "%SB_URL%"=="" >> .env.local echo NEXT_PUBLIC_SUPABASE_URL=%SB_URL%
if not "%SB_KEY%"=="" >> .env.local echo SUPABASE_SERVICE_ROLE_KEY=%SB_KEY%
echo Saved .env.local

:install
call npm install
if errorlevel 1 (
  echo npm install failed. Read the message above.
  pause
  exit /b 1
)
echo.
echo Starting TrustLock at http://localhost:3000
call npm run dev
