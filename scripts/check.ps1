$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
cargo test -p mydm-engine -p mydm-native-host --locked
if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }
cargo build -p mydm-engine --example smoke --locked
if ($LASTEXITCODE -ne 0) { throw 'Smoke build failed' }
py tests\run_smoke.py
if ($LASTEXITCODE -ne 0) { throw 'HTTP tests failed' }
node --test tests\chrome_bridge.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Bridge tests failed' }
Set-Location (Join-Path $root 'apps\desktop')
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
