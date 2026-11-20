$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -eq 'Core') {
    & (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
    if ($LASTEXITCODE -ne 0) { throw 'The Windows PowerShell GUI host build failed.' }
    return
}
$appRoot = Split-Path $PSScriptRoot -Parent
$distribution = Join-Path $appRoot 'dist'
New-Item -ItemType Directory -Path $distribution -Force | Out-Null
. (Join-Path $appRoot 'src\paths.ps1')
$hostExe = (Get-SmartRTLPaths).GuiHost
$sourceFile = Join-Path $appRoot 'src\SmartRTLHost.cs'
# Rebuilt whenever its source is newer, so a changed host never runs as an old build. The app
# is not running when this is called, so the host is not running and its file is free.
if (-not (Test-Path -LiteralPath $hostExe) -or (Get-Item -LiteralPath $sourceFile).LastWriteTimeUtc -gt (Get-Item -LiteralPath $hostExe).LastWriteTimeUtc) {
    Remove-Item -LiteralPath $hostExe -ErrorAction SilentlyContinue
    $source = Get-Content -LiteralPath $sourceFile -Raw
    Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies @('System.dll','System.Core.dll','System.Web.Extensions.dll') -OutputAssembly $hostExe -OutputType WindowsApplication
}
Write-Output $hostExe
