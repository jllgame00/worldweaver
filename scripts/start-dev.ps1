$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$python = Join-Path $root '.venv\Scripts\python.exe'

foreach ($port in @(8000, 5173)) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try {
        $listener.ExclusiveAddressUse = $true
        $listener.Start()
    } catch {
        throw "Port $port is already in use or unavailable. Stop its owner in its original terminal and retry."
    } finally {
        $listener.Stop()
    }
}
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (!(Test-Path -LiteralPath $python) -or !$node -or
    !(Test-Path -LiteralPath "$frontend\node_modules\vite\bin\vite.js")) {
    throw 'Development dependencies are missing. Run scripts\setup.ps1 first.'
}

$vite = $null
Push-Location -LiteralPath $root
try {
    & $python -m scripts.chatkhu check
    if ($LASTEXITCODE) {
        Write-Warning 'Review the configuration error above before generating. Restart after updating the server settings.'
    }
    $vite = Start-Process -FilePath $node.Source -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -ArgumentList @(
        'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'
    )
    $deadline = (Get-Date).AddSeconds(30)
    do {
        if ($vite.HasExited) { throw "Vite exited (code $($vite.ExitCode)). Check the port and run scripts\setup.ps1." }
        try {
            $ready = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173/' -TimeoutSec 1).StatusCode -eq 200
        } catch {
            $ready = $false
        }
        if (!$ready) {
            if ((Get-Date) -gt $deadline) { throw 'Vite startup timed out. Run scripts\setup.ps1.' }
            Start-Sleep -Milliseconds 250
        }
    } until ($ready)
    Write-Host 'When Uvicorn is ready, open http://127.0.0.1:5173. Press Ctrl+C here to stop both servers.'
    # The foreground console reaches the interpreter behind the Windows venv launcher.
    & $python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers --no-access-log
    if ($LASTEXITCODE -notin 0, 130, -1073741510) { throw "Backend exited (code $LASTEXITCODE). Check dependencies and port 8000." }
} finally {
    if ($vite -and !$vite.HasExited) {
        $vite.Kill()
        $vite.WaitForExit()
    }
    Pop-Location
}
