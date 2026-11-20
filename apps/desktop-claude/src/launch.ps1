# Claude's original updater runs inside the RTL copy using its installed package identity.
# Every launcher invocation rebuilds from the version currently installed by Windows.
param([string]$StatusDirectory)
$ErrorActionPreference = 'Stop'
# The same number as PATCH_REVISION in patch.js: a copy made with another one is rebuilt.
$patchRevision = 3
$app = Split-Path $PSScriptRoot -Parent
$pkg = Get-AppxPackage -Name Claude | Sort-Object Version -Descending | Select-Object -First 1
if (-not $pkg) { throw 'The original Claude package is not installed.' }
$originalExe = Join-Path $pkg.InstallLocation 'app\claude.exe'
$copyRoot = Join-Path $env:LOCALAPPDATA 'SmartRTL\claude\'
$running = Get-Process -Name Claude -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -eq $originalExe -or ($_.Path.StartsWith($copyRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $_.Path -Leaf) -eq 'claude.exe') } catch { $false }
}
if ($running) { throw 'Quit Claude completely (including its tray icon), then open Claude (SmartRTL) again. No running work was stopped.' }
$copy = Join-Path $env:LOCALAPPDATA "SmartRTL\claude\$($pkg.Version)"
$preparedCopy = $copy + '.building'
$preparedMarker = Join-Path $preparedCopy 'smartrtl-patched.json'
if (-not (Test-Path -LiteralPath $copy) -and (Test-Path -LiteralPath $preparedMarker)) {
    $prepared = Get-Content -LiteralPath $preparedMarker -Raw | ConvertFrom-Json
    if ($prepared.version -eq [string]$pkg.Version -and $prepared.patchRevision -eq $patchRevision -and (Test-Path -LiteralPath (Join-Path $preparedCopy 'claude.exe'))) {
        $expectedParent = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'SmartRTL\claude'))
        if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($preparedCopy)) -ne $expectedParent -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($copy)) -ne $expectedParent) { throw 'Prepared copy path mismatch.' }
        Move-Item -LiteralPath $preparedCopy -Destination $copy -ErrorAction Stop
    }
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExe)) {
    $runtime = Get-AppxPackage | Where-Object Name -Like 'OpenAI.CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1
    if ($runtime) { $nodeExe = Join-Path $runtime.InstallLocation 'dependencies\node\bin\node.exe' }
}
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js was not found; the existing RTL copy was not changed.' }
$marker = Join-Path $copy 'smartrtl-patched.json'
$current = $null
if (Test-Path -LiteralPath $marker) { try { $current = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json } catch { } }
if (-not $current -or $current.patchRevision -ne $patchRevision) {
    $patcher = Join-Path $app 'src\patch.js'
    $priorRunAsNode = $env:ELECTRON_RUN_AS_NODE
    try {
        $env:ELECTRON_RUN_AS_NODE = $null
        $patchProcess = Start-Process -FilePath $nodeExe -ArgumentList ('"{0}"' -f $patcher) -WindowStyle Hidden -Wait -PassThru
        if ($patchProcess.ExitCode -ne 0) { throw 'The new RTL copy could not be built. The previous copy and original app were kept.' }
    } finally { $env:ELECTRON_RUN_AS_NODE = $priorRunAsNode }
}
$copyExe = Join-Path $copy 'claude.exe'
if (-not (Test-Path -LiteralPath $copyExe)) { throw 'The matching RTL executable was not found.' }
$previousStatus = $env:SMARTRTL_STATUS_DIRECTORY
try {
    if ($StatusDirectory) {
        New-Item -ItemType Directory -Path $StatusDirectory -Force | Out-Null
        $env:SMARTRTL_STATUS_DIRECTORY = (Resolve-Path -LiteralPath $StatusDirectory).Path
    }
    # No remote debugging switch, no changes to the original package or its updater.
    Invoke-CommandInDesktopPackage -PackageFamilyName $pkg.PackageFamilyName -AppId 'Claude' -Command $copyExe -PreventBreakaway
} finally { $env:SMARTRTL_STATUS_DIRECTORY = $previousStatus }
