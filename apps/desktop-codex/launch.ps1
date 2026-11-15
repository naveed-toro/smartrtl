param([switch]$FromShortcut)
& (Join-Path $PSScriptRoot 'src\Start-Codex-SmartRTL.ps1') -FromShortcut:$FromShortcut
