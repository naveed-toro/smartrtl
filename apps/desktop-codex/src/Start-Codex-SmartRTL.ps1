# Preview: opens the original installed app in its normal profile, with an in-memory RTL adapter.
# Quit the existing app fully before running. No admin rights, file patches, or TCP port.
param([switch]$FromShortcut)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'paths.ps1')
$paths = Get-SmartRTLPaths -CreateRuntime
. (Join-Path $PSScriptRoot 'codex-rtl-task-validation.ps1')
$codexPackage = Get-AppxPackage -Name OpenAI.Codex | Select-Object -Last 1
if (-not $codexPackage) { throw 'The installed Codex/ChatGPT package was not found.' }
$codexExe = Join-Path $codexPackage.InstallLocation 'app\ChatGPT.exe'
$runningCodex = Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -eq $codexExe } catch { $false } }
if ($runningCodex) {
    $beat = $null; $currentLive = $null
    try { $beat=Get-Content -LiteralPath (Join-Path $paths.Runtime 'codex-rtl-heartbeat.json') -Raw | ConvertFrom-Json; $currentLive=Get-Content -LiteralPath (Join-Path $paths.Runtime 'codex-rtl-live-report.json') -Raw | ConvertFrom-Json } catch { }
    if (-not $beat -or -not $currentLive) {
        try {
            $legacy = Get-Content -LiteralPath (Join-Path $paths.Runtime 'legacy-runtime.json') -Raw | ConvertFrom-Json
            $beat = Get-Content -LiteralPath (Join-Path $legacy.directory 'codex-rtl-heartbeat.json') -Raw | ConvertFrom-Json
            $currentLive = Get-Content -LiteralPath (Join-Path $legacy.directory 'codex-rtl-live-report.json') -Raw | ConvertFrom-Json
        } catch { }
    }
    if ($beat -and $currentLive -and $beat.runId -eq $currentLive.runId -and $currentLive.exe -eq $codexExe -and ([DateTime]::UtcNow-[DateTime]::Parse($beat.at).ToUniversalTime()).TotalSeconds -lt 20 -and $currentLive.state -in @('running','waiting-for-chat')) {
        Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList ('shell:AppsFolder\' + $codexPackage.PackageFamilyName + '!App') -WindowStyle Hidden
        return
    }
    $message = 'Fully Quit Codex/ChatGPT first (including its tray icon), then open ChatGPT (SmartRTL). The current app was not stopped.'
    if ($FromShortcut) { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($message,'ChatGPT (SmartRTL)') | Out-Null }
    throw $message
}
$runtimePackage = Get-AppxPackage | Where-Object Name -Like 'OpenAI.CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1
$nodePath = if ($runtimePackage) { Join-Path $runtimePackage.InstallLocation 'dependencies\node\bin\node.exe' }
if (-not $nodePath -or -not (Test-Path -LiteralPath $nodePath)) { throw 'The bundled Node runtime was not found.' }
$liveRun = [guid]::NewGuid().ToString()
$taskEntry = Join-Path $PSScriptRoot 'codex-rtl-task-entry.ps1'
$requestFile = Join-Path $paths.Runtime 'codex-rtl-start-request.json'
$taskRecord = Join-Path $paths.Runtime 'codex-rtl-task.json'
$sha = [Security.Cryptography.SHA256]::Create()
try { $taskSuffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($paths.Application.ToLowerInvariant())))).Replace('-','').Substring(0,12) } finally { $sha.Dispose() }
$taskName = 'SmartRTL-Codex-' + $taskSuffix
$taskExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -RequestFile "{1}"' -f $taskEntry,$requestFile
$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$previous = $null
if (Test-Path -LiteralPath $taskRecord) {
    $previous = Get-Content -LiteralPath $taskRecord -Raw | ConvertFrom-Json
    if ($previous.userSid -eq $userSid -and $previous.taskName -match '^SmartRTL-Codex-[0-9A-F]{12}$') { $taskName = $previous.taskName }
}
$existingTask = Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    $mismatch = @(Get-SmartRTLTaskMismatch -Task $existingTask -Execute $taskExe -Arguments $taskArguments -UserSid $userSid)
    # Migrate only the exact previously recorded action owned by this user.
    if ($mismatch.Count -gt 0 -and $previous -and $previous.userSid -eq $userSid -and $previous.execute -eq $taskExe) {
        $legacyMismatch = @(Get-SmartRTLTaskMismatch -Task $existingTask -Execute $previous.execute -Arguments $previous.arguments -UserSid $userSid)
        if ($legacyMismatch.Count -eq 0) { $mismatch = @() }
    }
    if ($mismatch.Count -gt 0) {
        @{at=[DateTime]::UtcNow.ToString('o');reasons=$mismatch;expected=@{execute=$taskExe;arguments=$taskArguments;userSid=$userSid};actual=@{taskPath=$existingTask.TaskPath;actions=@($existingTask.Actions|Select-Object Execute,Arguments);userId=$existingTask.Principal.UserId;ownerSid=(Resolve-SmartRTLTaskOwnerSid $existingTask.Principal.UserId)}} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $paths.Runtime 'codex-rtl-task-mismatch.json')
        throw ('Existing task mismatch: ' + ($mismatch -join ', ') + '. Diagnostic: codex-rtl-task-mismatch.json. No task was replaced.')
    }
    if ([string]$existingTask.State -eq 'Running') { throw 'The previous SmartRTL task is still running. After fully quitting the app, wait a few seconds before retrying.' }
}
$taskAction = New-ScheduledTaskAction -Execute $taskExe -Argument $taskArguments -WorkingDirectory $PSScriptRoot
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $userSid -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
# No timer or logon trigger. The task starts only when this launcher is used.
Register-ScheduledTask -TaskPath '\' -TaskName $taskName -Action $taskAction -Principal $taskPrincipal -Settings $taskSettings -Description 'Starts the original Codex app and its private-pipe SmartRTL helper independently of the invoking console.' -Force | Out-Null
@{taskName=$taskName;userSid=$userSid;execute=$taskExe;arguments=$taskArguments;registeredAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $taskRecord
@{runId=$liveRun;requestedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $requestFile
Start-ScheduledTask -TaskPath '\' -TaskName $taskName
$liveReport = Join-Path $paths.Runtime 'codex-rtl-live-report.json'
$liveDeadline = (Get-Date).AddSeconds(70)
while ((Get-Date) -lt $liveDeadline) {
    if (Test-Path -LiteralPath $liveReport) {
        $liveResult = $null
        try { $liveResult = Get-Content -LiteralPath $liveReport -Raw | ConvertFrom-Json } catch { }
        if ($liveResult -and $liveResult.runId -eq $liveRun) {
            if ($liveResult.state -in @('running','waiting-for-chat')) {
                # Install a clear daily entry point; the packaged app's original shortcut is unchanged.
                $programs = [Environment]::GetFolderPath('Programs')
                $shortcutArguments = '-NoProfile -WindowStyle Hidden -File "{0}" -FromShortcut' -f (Join-Path $paths.Application 'launch.ps1')
                # The entry point's earlier name, removed only when it is this launcher's own shortcut.
                $oldShortcut = Join-Path $programs 'Codex (RTL).lnk'
                if (Test-Path -LiteralPath $oldShortcut) {
                    $old = (New-Object -ComObject WScript.Shell).CreateShortcut($oldShortcut)
                    if ($old.TargetPath -eq $taskExe -and $old.Arguments -eq $shortcutArguments) { Remove-Item -LiteralPath $oldShortcut }
                }
                $shortcutPath = Join-Path $programs 'ChatGPT (SmartRTL).lnk'
                $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
                $shortcut.TargetPath = $taskExe
                $shortcut.Arguments = $shortcutArguments
                $shortcut.WorkingDirectory = $paths.Application
                $lightTheme = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -ErrorAction SilentlyContinue).SystemUsesLightTheme -ne 0
                $markedIcon = Join-Path $paths.Runtime ('chatgpt-smartrtl-{0}.ico' -f $(if ($lightTheme) { 'light' } else { 'dark' }))
                $shortcut.IconLocation = $(if (Test-Path -LiteralPath $markedIcon) { $markedIcon } else { $codexExe }) + ',0'
                $shortcut.WindowStyle = 7
                $shortcut.Save()
                Write-Host 'SmartRTL preview is running in the original app. Open an existing Urdu/English chat.'
                Write-Host 'Report: codex-rtl-live-report.json (refreshes automatically).'
                Write-Host ('Background task: ' + $taskName)
                Write-Host 'You may close this PowerShell window. The helper is started by Windows Task Scheduler.'
                Write-Host 'No messages are sent automatically.'
                Write-Host 'For daily use, open ChatGPT (SmartRTL) from Windows Start.'
                if ($liveResult.state -eq 'waiting-for-chat') { Write-Host 'Waiting for chat elements; the formula is not yet confirmed on real messages.' }
                return
            }
            if ($liveResult.state -in @('launch-error','app-not-attached','app-exited','adapter-error','pipe-disconnected')) {
                throw ('Preview did not start: {0}. {1} {2}' -f $liveResult.state,$liveResult.error,$liveResult.nextAction)
            }
        }
    }
    $bootstrapResult = $null
    try { $bootstrapResult = Get-Content -LiteralPath (Join-Path $paths.Runtime 'codex-rtl-bootstrap-report.json') -Raw | ConvertFrom-Json } catch { }
    if ($bootstrapResult -and $bootstrapResult.runId -eq $liveRun -and $bootstrapResult.state -eq 'error') { throw $bootstrapResult.message }
    Start-Sleep -Milliseconds 500
}
throw 'Preview did not report ready within 70 seconds. Check codex-rtl-live-report.json.'
