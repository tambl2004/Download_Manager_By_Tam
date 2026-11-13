$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\apps\desktop')
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npm run tauri -- dev
if ($LASTEXITCODE -ne 0) { throw 'Tauri dev failed' }
