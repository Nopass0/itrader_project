@echo off
title Itrader Issue Fixer

echo.
echo ==========================================
echo      Itrader Issue Fix Utility
echo ==========================================
echo.
echo This will fix common issues:
echo - Gmail OAuth "Invalid authorization code"
echo - Application exiting immediately
echo.

echo Checking prerequisites...

REM Check if bun is installed
where bun >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Bun is not installed or not in PATH
    echo Please install Bun first: https://bun.sh/
    pause
    exit /b 1
)

echo [OK] Bun is installed

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    bun install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo [OK] Dependencies installed

REM Check if database is initialized
if not exist "prisma\data\database.db" (
    echo Initializing database...
    bun run db:generate
    bun run db:push
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to initialize database
        pause
        exit /b 1
    )
)

echo [OK] Database initialized

echo.
echo ==========================================
echo Choose what to fix:
echo 1. Setup Gmail OAuth (fixes "Invalid authorization code")
echo 2. Test application startup
echo 3. Full setup (Gmail + test startup)
echo 4. Exit
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo.
    echo Starting Gmail OAuth setup...
    echo.
    
    REM Check if credentials exist
    if not exist "data\gmail-credentials.json" (
        echo ERROR: Gmail credentials not found!
        echo.
        echo Please download OAuth2 credentials from Google Cloud Console
        echo and save as: data\gmail-credentials.json
        echo.
        echo See GMAIL_SETUP.md for detailed instructions.
        pause
        exit /b 1
    )
    
    bun run setup-gmail.ts
    
    if %ERRORLEVEL% EQ 0 (
        echo.
        echo Gmail setup completed successfully!
    ) else (
        echo.
        echo Gmail setup failed. Please check the error messages above.
    )
    
) else if "%choice%"=="2" (
    echo.
    echo Testing application startup...
    echo.
    
    REM First check if any accounts are configured
    echo Checking configured accounts...
    
    REM Create a test script to check accounts
    echo import { db } from "./src/db"; > check-accounts.ts
    echo async function check() { >> check-accounts.ts
    echo   const gateAccounts = await db.getActiveGateAccounts(); >> check-accounts.ts
    echo   const bybitAccounts = await db.getActiveBybitAccounts(); >> check-accounts.ts
    echo   const gmailAccount = await db.getActiveGmailAccount(); >> check-accounts.ts
    echo   console.log(`Gate accounts: ${gateAccounts.length}`); >> check-accounts.ts
    echo   console.log(`Bybit accounts: ${bybitAccounts.length}`); >> check-accounts.ts
    echo   console.log(`Gmail account: ${gmailAccount ? "Yes" : "No"}`); >> check-accounts.ts
    echo   await db.disconnect(); >> check-accounts.ts
    echo   if (gateAccounts.length === 0 ^|^| bybitAccounts.length === 0) { >> check-accounts.ts
    echo     console.log("\nWARNING: You need at least one Gate and one Bybit account!"); >> check-accounts.ts
    echo     console.log("Run 'bun run cli' to add accounts."); >> check-accounts.ts
    echo     process.exit(1); >> check-accounts.ts
    echo   } >> check-accounts.ts
    echo } >> check-accounts.ts
    echo check(); >> check-accounts.ts
    
    bun run check-accounts.ts
    del check-accounts.ts
    
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo Please configure accounts before running the application.
        pause
        exit /b 1
    )
    
    echo.
    echo Starting application...
    timeout /t 2 >nul
    
    bun run src/index.ts
    
) else if "%choice%"=="3" (
    echo.
    echo Running full setup...
    
    REM Run Gmail setup first
    call :setup_gmail
    
    echo.
    echo Testing application...
    call :test_app
    
) else if "%choice%"=="4" (
    echo.
    echo Goodbye!
    exit /b 0
) else (
    echo.
    echo Invalid choice. Please run again.
    pause
    exit /b 1
)

pause
exit /b 0

:setup_gmail
if not exist "data\gmail-credentials.json" (
    echo ERROR: Gmail credentials not found!
    echo Please see GMAIL_SETUP.md for instructions.
    exit /b 1
)
bun run setup-gmail.ts
exit /b %ERRORLEVEL%

:test_app
bun run src/index.ts
exit /b %ERRORLEVEL%