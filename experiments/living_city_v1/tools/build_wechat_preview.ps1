param(
    [string]$CreatorPath = 'C:/ProgramData/cocos/editors/Creator/3.8.8/CocosCreator.exe'
)
$ErrorActionPreference = 'Stop'
$wechatProject = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
Push-Location $wechatProject
try {
    & node tools/prepare_wechat_preview.mjs
    if ($LASTEXITCODE -ne 0) { throw 'WeChat configuration preparation failed.' }
    $wechatStdout = Join-Path $wechatProject 'temp/wechat_preview_stdout.log'
    $wechatStderr = Join-Path $wechatProject 'temp/wechat_preview_stderr.log'
    New-Item -ItemType Directory -Path (Split-Path $wechatStdout -Parent) -Force | Out-Null
    # Keep configPath relative to the working directory: this installed Creator
    # exits before logging when passed an absolute drive path in --build.
    $wechatArguments = '--project "{0}" --build "platform=wechatgame;debug=false;configPath=./tools/wechat-preview.build.json;" --disable-gpu' -f $wechatProject.Replace('\', '/')
    $wechatBuildStartedAt = Get-Date
    $wechatProcess = Start-Process -FilePath $CreatorPath -ArgumentList $wechatArguments -WindowStyle Hidden -RedirectStandardOutput $wechatStdout -RedirectStandardError $wechatStderr -PassThru
    Write-Output "WeChat build process: $($wechatProcess.Id)"
    while (-not $wechatProcess.WaitForExit(1000)) {
        $wechatProcess.Refresh()
    }
    Write-Output "Cocos build exit: $($wechatProcess.ExitCode)"
    # Creator returns 36 for successful command-line builds.
    if ($wechatProcess.ExitCode -notin @(0, 36)) {
        Get-Content -LiteralPath $wechatStdout -Tail 15
        Get-Content -LiteralPath $wechatStderr -Tail 15
        throw "Cocos WeChat build failed: $($wechatProcess.ExitCode)"
    }
    $wechatBuildLog = Get-Content -LiteralPath $wechatStdout -Raw
    if ((Get-Item -LiteralPath $wechatStdout).LastWriteTime -lt $wechatBuildStartedAt -or $wechatBuildLog -notmatch 'build Task \(wechatgame\) Finished') {
        throw 'Creator did not confirm this WeChat build finished; existing output cannot establish success.'
    }
    & node tools/finalize_wechat_preview.mjs
    if ($LASTEXITCODE -ne 0) { throw 'WeChat output validation failed.' }
} finally {
    Pop-Location
}
