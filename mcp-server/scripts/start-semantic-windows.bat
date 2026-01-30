@echo off
REM
REM Semantic Search Startup Script for Windows
REM
REM Launches the Rhythm Chamber MCP server with semantic search.
REM Optionally launches LM Studio if not running.
REM

setlocal enabledelayedexpansion

REM Configuration
set EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
set LM_STUDIO_ENDPOINT=http://localhost:1234/v1
if not "%RC_LMSTUDIO_ENDPOINT%"=="" set LM_STUDIO_ENDPOINT=%RC_LMSTUDIO_ENDPOINT%

REM Get script directory
set SCRIPT_DIR=%~dp0
set MCP_SERVER_DIR=%SCRIPT_DIR%..

REM Print banner
echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║        Rhythm Chamber MCP Server - Semantic Search           ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

REM Check LM Studio
echo Checking LM Studio availability...
echo.

REM Try to reach LM Studio API
curl -s --max-time 5 "%LM_STUDIO_ENDPOINT%/models" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] LM Studio is running

    REM Check for embedding model
    curl -s "%LM_STUDIO_ENDPOINT%/models" | findstr /i "embedding" >nul
    if %errorlevel% equ 0 (
        echo [OK] Embedding model available
        echo.
        echo Using LM Studio for embeddings (fast, GPU-accelerated)
    ) else (
        echo.
        echo [!] No embedding model loaded
        echo.
        echo To load the embedding model in LM Studio:
        echo   1. Open LM Studio
        echo   2. Search for "%EMBEDDING_MODEL%"
        echo   3. Download and load the model
        echo.
        echo Using Transformers.js fallback
    )
) else (
    echo [!] LM Studio is not running
    echo.
    echo To use LM Studio for faster embeddings:
    echo   1. Install LM Studio: https://lmstudio.ai/
    echo   2. Load model: %EMBEDDING_MODEL%
    echo   3. Run API server on %LM_STUDIO_ENDPOINT%
    echo.
    echo Using Transformers.js fallback (slower, CPU-based)
)

echo.
echo ─────────────────────────────────────────────────────────────────
echo.
echo Starting MCP Server with semantic search...
echo.

REM Export environment
set RC_SEMANTIC_SEARCH=true
set RC_LMSTUDIO_ENDPOINT=%LM_STUDIO_ENDPOINT%

REM Change to server directory
cd /d "%MCP_SERVER_DIR%"

REM Start server
node server.js

REM Exit with server's exit code
exit /b %errorlevel%
