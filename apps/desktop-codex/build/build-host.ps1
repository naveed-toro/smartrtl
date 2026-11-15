$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -eq 'Core') {
    & (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
    if ($LASTEXITCODE -ne 0) { throw 'The Windows PowerShell GUI host build failed.' }
    return
}
$appRoot = Split-Path $PSScriptRoot -Parent
$distribution = Join-Path $appRoot 'dist'
New-Item -ItemType Directory -Path $distribution -Force | Out-Null
$hostExe = Join-Path $distribution 'SmartRTLHost-v1.exe'
if (-not (Test-Path -LiteralPath $hostExe)) {
    $source = Get-Content -LiteralPath (Join-Path $appRoot 'src\SmartRTLHost.cs') -Raw
    Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies @('System.dll','System.Core.dll','System.Web.Extensions.dll') -OutputAssembly $hostExe -OutputType WindowsApplication
}
Write-Output $hostExe
