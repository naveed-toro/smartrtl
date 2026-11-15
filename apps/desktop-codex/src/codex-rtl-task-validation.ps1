function Resolve-SmartRTLTaskOwnerSid {
    param([string]$Identity)
    if ([string]::IsNullOrWhiteSpace($Identity)) { return $null }
    $value = $Identity.Trim()
    try {
        if ($value -match '^S-1-') { return ([Security.Principal.SecurityIdentifier]::new($value)).Value }
        return ([Security.Principal.NTAccount]::new($value)).Translate([Security.Principal.SecurityIdentifier]).Value
    } catch { return $null }
}

function Get-SmartRTLTaskMismatch {
    param($Task,[string]$Execute,[string]$Arguments,[string]$UserSid)
    $actions = @($Task.Actions)
    if ($actions.Count -ne 1) { 'action-count' }
    else {
        try {
            $actualExe = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables(([string]$actions[0].Execute).Trim('"')))
            $expectedExe = [IO.Path]::GetFullPath($Execute)
            if (-not $actualExe.Equals($expectedExe,[StringComparison]::OrdinalIgnoreCase)) { 'executable' }
        } catch { 'executable' }
        if (([string]$actions[0].Arguments).Trim() -ne $Arguments.Trim()) { 'arguments' }
    }
    $ownerSid = Resolve-SmartRTLTaskOwnerSid ([string]$Task.Principal.UserId)
    if (-not $ownerSid) { 'owner-unresolved' }
    elseif ($ownerSid -ne $UserSid) { 'owner' }
}
