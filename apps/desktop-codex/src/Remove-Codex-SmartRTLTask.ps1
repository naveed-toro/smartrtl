# Run after fully quitting the preview app to remove this preview's on-demand background task.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'paths.ps1')
$paths = Get-SmartRTLPaths
. (Join-Path $PSScriptRoot 'codex-rtl-task-validation.ps1')
$recordFile = Join-Path $paths.Runtime 'codex-rtl-task.json'
if (-not (Test-Path -LiteralPath $recordFile)) { Write-Host 'No SmartRTL task record was found.'; return }
$record = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
if ($record.taskName -notmatch '^SmartRTL-Codex-[0-9A-F]{12}$') { throw 'Unexpected task name; nothing was removed.' }
$task = Get-ScheduledTask -TaskPath '\' -TaskName $record.taskName -ErrorAction SilentlyContinue
if (-not $task) { Write-Host 'The recorded task is already absent.'; return }
$expectedExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$expectedArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -RequestFile "{1}"' -f (Join-Path $PSScriptRoot 'codex-rtl-task-entry.ps1'),(Join-Path $paths.Runtime 'codex-rtl-start-request.json')
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$userName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$mismatch = @(Get-SmartRTLTaskMismatch -Task $task -Execute $expectedExe -Arguments $expectedArgs -UserSid $sid)
if ($mismatch.Count -gt 0 -and $record.userSid -eq $sid -and $record.execute -eq $expectedExe) {
    $mismatch = @(Get-SmartRTLTaskMismatch -Task $task -Execute $record.execute -Arguments $record.arguments -UserSid $sid)
}
if ($mismatch.Count -gt 0) { throw ('The task does not match this preview and user: '+($mismatch -join ', ')+'. Nothing was removed.') }
if ([string]$task.State -eq 'Running') { throw 'Quit the preview app and let its helper finish before removing the task.' }
Unregister-ScheduledTask -TaskPath '\' -TaskName $record.taskName -Confirm:$false
# 'Codex (RTL)' is the entry point's earlier name.
foreach ($name in 'ChatGPT (SmartRTL).lnk','Codex (RTL).lnk') {
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) $name
    if (Test-Path -LiteralPath $shortcutPath) {
        $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
        if ($shortcut.TargetPath -eq $expectedExe -and $shortcut.Arguments -eq ('-NoProfile -WindowStyle Hidden -File "{0}" -FromShortcut' -f (Join-Path $paths.Application 'launch.ps1'))) { Remove-Item -LiteralPath $shortcutPath }
    }
}
Remove-Item -LiteralPath $recordFile
Write-Host 'The SmartRTL on-demand task was removed. The installed app was not changed.'
