$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$backendPath = Join-Path $projectPath 'backend'
$frontendPath = Join-Path $projectPath 'frontend'
$pythonPath = Join-Path $backendPath '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Set up the backend virtual environment first, following README.md.'
}
if (-not (Test-Path -LiteralPath (Join-Path $frontendPath 'node_modules'))) {
    throw 'Run npm install inside frontend first.'
}
$backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $backendPath 'server.log') -RedirectStandardError (Join-Path $backendPath 'server-error.log')
try {
    Write-Host 'Dashboard: http://localhost:5173'
    Write-Host 'API docs:  http://localhost:8000/docs'
    Write-Host 'Press Ctrl+C to stop the frontend and backend.'
    Push-Location $frontendPath
    npm.cmd run dev
} finally {
    Pop-Location
    if (-not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id }
}
