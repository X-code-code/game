$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temporaryDirectory = [IO.Path]::GetFullPath((Join-Path $projectDirectory 'temp'))
foreach ($cleanupRoot in @($projectDirectory, $temporaryDirectory)) {
    if (((Get-Item -LiteralPath $cleanupRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing a linked cleanup root' }
}
$reportDirectory = Join-Path $projectDirectory 'art/review/wechat_v17'
$activeBrowsers = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('msedge.exe', 'chrome.exe') })
$reportPath = Join-Path $reportDirectory 'test_cleanup_report.json'
$removedProfiles = if (Test-Path -LiteralPath $reportPath) { @((Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json).removed) } else { @() }
foreach ($entry in Get-ChildItem -LiteralPath $temporaryDirectory -Directory) {
    if ($entry.Name -notmatch '^edge-refined-\d+$') { continue }
    $targetDirectory = [IO.Path]::GetFullPath($entry.FullName)
    if (-not $targetDirectory.StartsWith($temporaryDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Target escaped temporary directory' }
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing a linked test directory' }
    # Command lines can use forward slashes or a different path case. Unknown
    # browser command lines also prevent deletion rather than weakening the guard.
    $normalizedTarget = $targetDirectory.Replace('/', '\')
    if ($activeBrowsers | Where-Object {
        -not $_.CommandLine -or $_.CommandLine.Replace('/', '\').IndexOf($normalizedTarget, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }) { continue }
    $files = @(Get-ChildItem -LiteralPath $targetDirectory -Recurse -File -Force -ErrorAction Stop)
    if (Get-ChildItem -LiteralPath $targetDirectory -Recurse -Force | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }) { throw 'Refusing linked contents' }
    $bytes = ($files | Measure-Object -Property Length -Sum).Sum
    Remove-Item -LiteralPath $targetDirectory -Recurse -Force -ErrorAction Stop
    $removedProfiles += [ordered]@{ path = $targetDirectory; files = $files.Count; bytes = $bytes }
}
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
[long]$releasedBytes = 0
foreach ($profileRecord in $removedProfiles) { $releasedBytes += [long]$profileRecord.bytes }
$report = [ordered]@{ scope = 'inactive disposable test browser profiles only'; removed = $removedProfiles; totalBytes = $releasedBytes }
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding utf8
$report | ConvertTo-Json -Depth 5 -Compress
