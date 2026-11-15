$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\src\codex-rtl-task-validation.ps1')
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$exe=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$task=[pscustomobject]@{Actions=[pscustomobject]@{Execute=$exe.ToUpperInvariant();Arguments='-File "C:\test file\start.ps1"'};Principal=[pscustomobject]@{UserId=$identity.User.Value}}
$common=@{Task=$task;Execute=$exe;Arguments='-File "C:\test file\start.ps1"';UserSid=$identity.User.Value}
if (@(Get-SmartRTLTaskMismatch @common).Count -ne 0){throw 'Single-action SID case failed'}
$resolved=Resolve-SmartRTLTaskOwnerSid $identity.Name
if($resolved -ne $identity.User.Value){throw 'Account name did not resolve to the same SID'}
$task.Principal.UserId=$identity.Name
if (@(Get-SmartRTLTaskMismatch @common).Count -ne 0){throw 'Account-name ownership case failed'}
$task.Actions.Arguments='-File "C:\different.ps1"'
if ('arguments' -notin @(Get-SmartRTLTaskMismatch @common)){throw 'Different action was not rejected'}
$task.Principal.UserId='S-1-5-18'
if ('owner' -notin @(Get-SmartRTLTaskMismatch @common)){throw 'Different owner was not rejected'}
'Task validation checks passed'
