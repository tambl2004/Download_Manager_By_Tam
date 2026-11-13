$ErrorActionPreference = 'Stop'
Remove-Item 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.mydm.host' -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA 'MyDM\ChromeHost\com.mydm.host.json') -ErrorAction SilentlyContinue
Write-Host 'Host registration removed. Download history and downloaded files remain.'
