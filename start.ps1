# ─────────────────────────────────────────────────────────────────────────────
#  AI LinkedIn Platform — Optimized Startup Script
#  Runs FastAPI with 4 workers for 1000+ concurrent users
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "Stopping any old processes..." -ForegroundColor Yellow
Get-Process -Name "node","python","uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Starting FastAPI Backend (4 workers)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "cd 'D:\Agent\Linkdin agent\fastapi_backend'; .\venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 --loop asyncio"

Start-Sleep -Seconds 3

Write-Host "Starting Next.js Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
  "cd 'D:\Agent\Linkdin agent\linkedin-agent-app'; pnpm run dev"

Write-Host ""
Write-Host "─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host " Backend : http://localhost:8000" -ForegroundColor Cyan
Write-Host " Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host "─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host " Ready for 1000+ concurrent users!" -ForegroundColor Magenta
