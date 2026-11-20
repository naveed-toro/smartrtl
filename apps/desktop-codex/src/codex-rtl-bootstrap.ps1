# Runs in its own hidden Windows console, separate from the user's PowerShell window.
param(
    [Parameter(Mandatory=$true)][string]$PackageFamily,
    [Parameter(Mandatory=$true)][string]$NodeExecutable,
    [Parameter(Mandatory=$true)][string]$AppExecutable,
    [Parameter(Mandatory=$true)][string]$RunId
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'paths.ps1')
$paths = Get-SmartRTLPaths -CreateRuntime
$bootstrapReport = Join-Path $paths.Runtime 'codex-rtl-bootstrap-report.json'
function Write-BootstrapState([string]$State, [string]$Message = '') {
    @{runId=$RunId;at=[DateTime]::UtcNow.ToString('o');pid=$PID;state=$State;message=$Message} | ConvertTo-Json | Set-Content -LiteralPath $bootstrapReport
}
try {
    Write-BootstrapState 'starting'
    $liveScript = Join-Path $PSScriptRoot 'codex-rtl-live.cjs'
    $guiHost = Join-Path $paths.Distribution 'SmartRTLHost-v2.exe'
    if (-not (Test-Path -LiteralPath $guiHost)) {
        & (Join-Path $paths.Application 'build\build-host.ps1') | Out-Null
    }
    $hostRequest = Join-Path $paths.Runtime 'codex-rtl-host-request.json'
    # The marked icon is written by the live script; the host gives it to the app's windows, and
    # a pin of their taskbar button opens the app the way the Start menu entry does.
    $relaunch = '"{0}" -NoProfile -WindowStyle Hidden -File "{1}" -FromShortcut' -f (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'),(Join-Path $paths.Application 'launch.ps1')
    @{runId=$RunId;nodeExecutable=$NodeExecutable;appExecutable=$AppExecutable;liveScript=$liveScript;packageFamily=$PackageFamily;markedIconLight=(Join-Path $paths.Runtime 'chatgpt-smartrtl-light.ico');markedIconDark=(Join-Path $paths.Runtime 'chatgpt-smartrtl-dark.ico');relaunchCommand=$relaunch;displayName='ChatGPT (SmartRTL)'} | ConvertTo-Json | Set-Content -LiteralPath $hostRequest
    Invoke-CommandInDesktopPackage -PackageFamilyName $PackageFamily -AppId 'App' -Command $guiHost -Args ('"{0}"' -f $hostRequest) -PreventBreakaway
    Write-BootstrapState 'gui-host-requested'
    $liveReport = Join-Path $paths.Runtime 'codex-rtl-live-report.json'
    $heartbeatPath = Join-Path $paths.Runtime 'codex-rtl-heartbeat.json'
    $startedAt = [DateTime]::UtcNow
    while ($true) {
        $live = $null; $beat = $null
        try { $live = Get-Content -LiteralPath $liveReport -Raw | ConvertFrom-Json } catch { }
        try { $beat = Get-Content -LiteralPath $heartbeatPath -Raw | ConvertFrom-Json } catch { }
        if ($live -and $live.runId -eq $RunId -and $live.state -in @('app-exited','app-not-attached','launch-error','helper-exited')) { break }
        if ($beat -and $beat.runId -eq $RunId) {
            if (([DateTime]::UtcNow - [DateTime]::Parse($beat.at).ToUniversalTime()).TotalSeconds -gt 45) { Write-BootstrapState 'heartbeat-stale'; return }
        } elseif (([DateTime]::UtcNow - $startedAt).TotalSeconds -gt 90) { Write-BootstrapState 'no-heartbeat'; return }
        Start-Sleep -Seconds 5
    }
    Write-BootstrapState 'app-ended'
} catch {
    Write-BootstrapState 'error' $_.Exception.Message
}
