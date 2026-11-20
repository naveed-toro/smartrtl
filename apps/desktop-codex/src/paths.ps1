function Get-SmartRTLPaths {
    param([switch]$CreateRuntime)
    $source = $PSScriptRoot
    $application = Split-Path $source -Parent
    $runtime = Join-Path $application '.runtime'
    if ($CreateRuntime) { New-Item -ItemType Directory -Path $runtime -Force | Out-Null }
    [pscustomobject]@{Source=$source;Application=$application;Runtime=$runtime;Distribution=(Join-Path $application 'dist');GuiHost=(Join-Path $application 'dist\SmartRTLHost-v3.exe')}
}
