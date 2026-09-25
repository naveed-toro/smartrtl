# What the "Claude (SmartRTL)" shortcut runs.
#
# The installed Claude updates itself; the copy cannot. So before opening the copy, this
# asks which version is installed now. If there is no patched copy of that version yet,
# it makes one (patch.js, about a minute, once per Claude update), then opens it.
$ErrorActionPreference = 'Stop'
$app = Split-Path $PSScriptRoot -Parent
$pkg = Get-AppxPackage -Name Claude | Select-Object -Last 1
if (-not $pkg) { exit 1 }
$copy = Join-Path $env:LOCALAPPDATA "SmartRTL\claude\$($pkg.Version)"

if (-not (Test-Path (Join-Path $copy 'smartrtl-patched.json'))) {
  $env:ELECTRON_RUN_AS_NODE = $null
  Start-Process -FilePath 'node' -ArgumentList "`"$(Join-Path $app 'src\patch.js')`"" -Wait
}
if (Test-Path (Join-Path $copy 'claude.exe')) {
  Start-Process -FilePath (Join-Path $copy 'claude.exe') -WorkingDirectory $copy
}
