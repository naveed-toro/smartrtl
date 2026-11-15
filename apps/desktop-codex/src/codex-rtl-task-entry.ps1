# Task Scheduler entry point. It is not a descendant of the interactive PowerShell console.
param([Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'paths.ps1')
$paths = Get-SmartRTLPaths -CreateRuntime
try {
    $request = Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json
    $package = Get-AppxPackage -Name OpenAI.Codex | Select-Object -Last 1
    $runtime = Get-AppxPackage | Where-Object Name -Like 'OpenAI.CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1
    if (-not $package -or -not $runtime) { throw 'The installed app or bundled runtime was not found.' }
    $nodeExe = Join-Path $runtime.InstallLocation 'dependencies\node\bin\node.exe'
    $appExe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
    & (Join-Path $PSScriptRoot 'codex-rtl-bootstrap.ps1') -PackageFamily $package.PackageFamilyName -NodeExecutable $nodeExe -AppExecutable $appExe -RunId $request.runId
} catch {
    @{runId=$request.runId;at=[DateTime]::UtcNow.ToString('o');pid=$PID;state='error';message=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $paths.Runtime 'codex-rtl-bootstrap-report.json')
    exit 1
}
