$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
cargo build --release -p mydm-native-host --locked
if ($LASTEXITCODE -ne 0) { throw 'Native host build failed' }
Set-Location (Join-Path $root 'apps\desktop')
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npm run tauri -- build --no-bundle
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
$dest = Join-Path $root 'release\MyDM'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $root 'target\release\mydm.exe') $dest -Force
Copy-Item (Join-Path $root 'target\release\mydm-native-host.exe') $dest -Force
Copy-Item (Join-Path $root 'apps\chrome-extension') $dest -Recurse -Force
Copy-Item (Join-Path $root 'packaging\windows\*.ps1') $dest -Force
Copy-Item (Join-Path $root 'README.md') $dest -Force
Write-Host "Ready: $dest\mydm.exe"
