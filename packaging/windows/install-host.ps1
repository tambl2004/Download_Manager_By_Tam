param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
[string]$HostExe = (Join-Path $PSScriptRoot 'mydm-native-host.exe'))
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $HostExe).Path
$dir = Join-Path $env:LOCALAPPDATA 'MyDM\ChromeHost'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$manifest = Join-Path $dir 'com.mydm.host.json'
$data = @{name='com.mydm.host';description='MyDM Chrome Native Host';path=$exe;type='stdio';allowed_origins=@("chrome-extension://$ExtensionId/")} | ConvertTo-Json
[IO.File]::WriteAllText($manifest,$data,(New-Object Text.UTF8Encoding($false)))
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.mydm.host'
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value $manifest
Write-Host 'Registered for current Windows user. Reload the Chrome extension and click Check connection.'
