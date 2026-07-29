$ErrorActionPreference = 'Stop'
$probeRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Resolve-Path (Join-Path $probeRoot '..\..')
Set-Location $workspaceRoot

& node apps/arkweb-shell/scripts/prepare-static-probe.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$previousPath = $env:PATH
$previousJavaHome = $env:JAVA_HOME
$previousSdkHome = $env:DEVECO_SDK_HOME
$previousHvigorHome = $env:HVIGOR_USER_HOME
$env:DEVECO_SDK_HOME = 'D:\DevEco Studio\sdk'
$env:JAVA_HOME = 'D:\DevEco Studio\jbr'
$env:HVIGOR_USER_HOME = 'D:\DevCaches\Huawei\hvigor'
$env:PATH = 'D:\DevEco Studio\jbr\bin;D:\DevEco Studio\tools\node;D:\DevEco Studio\tools\ohpm\bin;D:\DevEco Studio\tools\hvigor\bin;' + $previousPath
Set-Location $probeRoot
& ohpm install --all
$buildExit = $LASTEXITCODE
if ($buildExit -eq 0) {
  & 'D:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' assembleHap --mode module -p module=entry@default -p product=default -p buildMode=debug
  $buildExit = $LASTEXITCODE
}
$env:PATH = $previousPath
$env:JAVA_HOME = $previousJavaHome
$env:DEVECO_SDK_HOME = $previousSdkHome
$env:HVIGOR_USER_HOME = $previousHvigorHome
exit $buildExit
