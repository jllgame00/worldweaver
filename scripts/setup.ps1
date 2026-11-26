$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (Test-Path -LiteralPath $venv) {
    $entry = Get-Item -Force -LiteralPath $venv
    if (!$entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        (!(Test-Path -LiteralPath "$venv\pyvenv.cfg" -PathType Leaf) -and
            (Get-ChildItem -Force -LiteralPath $venv | Select-Object -First 1))) {
        throw 'Unrecognized existing .venv. Move it aside before running setup.'
    }
}
if (!(Get-Command node.exe -ErrorAction SilentlyContinue) -or
    !(Get-Command npm.cmd -ErrorAction SilentlyContinue) -or
    [int](& node.exe -p "process.versions.node.split('.')[0]") -lt 24) {
    throw 'Install Node.js 24 or newer with npm, then run setup again.'
}

$usable = $false
if (Test-Path -LiteralPath $python -PathType Leaf) {
    & $python -c 'import sys, pip; sys.exit(sys.version_info[:2] != (3,13) or sys.prefix == sys.base_prefix)'
    $usable = $LASTEXITCODE -eq 0
}
if (!$usable) {
    $base = Get-Command py.exe -ErrorAction SilentlyContinue
    $version = @('-3.13')
    if (!$base) {
        $base = Get-Command python.exe -ErrorAction SilentlyContinue
        $version = @()
    }
    if (!$base) { throw 'Install Python 3.13 with venv and pip, then run setup again.' }
    & $base.Source @version -c 'import sys; sys.exit(sys.version_info[:2] != (3,13))'
    if ($LASTEXITCODE) { throw 'Python 3.13 is required to create or repair .venv.' }
    & $base.Source @version -m venv $venv
    if ($LASTEXITCODE) { throw 'Could not create or repair .venv. Check the Python installation and directory permissions.' }
}
& $python -m pip install -r (Join-Path $root 'backend\requirements.txt')
if ($LASTEXITCODE) { throw 'Backend dependency installation failed.' }
& npm.cmd --prefix (Join-Path $root 'frontend') ci
if ($LASTEXITCODE) { throw 'Frontend dependency installation failed.' }
Write-Host 'Setup complete. Run scripts\start-dev.ps1.'
