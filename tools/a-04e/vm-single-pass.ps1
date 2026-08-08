# vm-single-pass.ps1 — A-04E-2a 正式批次：单遍+回填管线 ≤8s 复测（决策 #19/#21）。
# 在 Win11 参考 VM（wenshu-poc-a-win11）内运行。NEVER run on the host：
# INSIDE-VM.txt 守卫。批次不自动关机（与阶段一不同：便于就地查看失败证据），
# 需要无人值守时由调用方自行安排 shutdown。
#
# 前置（强制顺序，缺一即拒跑）：
#   1. 宿主塌链：tools\a-04e\vm-chain-depth-check.ps1 必须 PASS（链深=1）。
#   2. 同次引导 attest：C:\wenshu-payload\CHAIN-DEPTH-1.txt 存在且新于上次引导时间。
# 验收口径（任务书 §5.1，等修订稿钉定后本脚本常量同步——当前标 PROVISIONAL 处）：
#   - 预算：10 跑 totalMs（全管线）p95 ≤ 8000ms；
#   - 双标定门：批前+批后 renderMs 落在 2a 标定带（见下，PROVISIONAL）；
#   - 确定性：10 跑 normalized sha256 全等（tools/a-04e/normalized-pdf-sha.mjs）；
#   - 跨引擎基线等价：同 VM 单遍产物 vs 签署基线（21 页 golden）全 run 序列
#     逐一项相等（text/baselineY/x/fontSize/tag，含目录页数字 run）。
#
# 【PROVISIONAL 标定带——待 §5.1 修订钉定】阶段一签署带 [20553.4,24300.2] 是
# 两遍渲染 30 页 renderMs，单遍管线不可能复现（renderMs 约减半），故 2a 标定带
# 必须重订。下方默认值取自阶段一 run-8 批次实测构成：首遍/stab 4637.6–5127.1
# （渲染本体）+ server/browser/teardown 观测开销 ~800–1200ms，留出诚实余量。
# 这不是签署带，是等待裁定的占位推导值；批次跑出的 calibrate 值出带即停。
$ErrorActionPreference = 'Continue'
$out = 'C:\wenshu-out\a-04e\single-pass-v1'
$p = 'C:\wenshu-payload'
$r = "$p\wenshu"
$e = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$script:failed = $false
# PROVISIONAL（待 §5.1 修订钉定）：2a 单遍标定带，推导见头部注释。
$calMinMs = 5200.0
$calMaxMs = 6800.0
$budgetP95Ms = 8000.0
# Input identity: sha256 of the PA-13 final-v6 signed 30-page input（与阶段一同语料保可比）。
$expectedInputSha = '4dedb1c2dee256c1f929f54a0e7922eb66daea072df8567cc129e331c25b6258'

function Fail-Stop($msg) {
  $msg | Out-File "$out\STATUS.txt" -Encoding utf8
  exit 1
}

if (-not (Test-Path "$p\INSIDE-VM.txt")) { throw 'refuse: INSIDE-VM marker missing (host safety guard)' }
if (Test-Path $out) { throw "existing a-04e evidence: $out" }
# 塌链 attest 门：同次引导、先于批次人工书写（宿主 vm-chain-depth-check.ps1 已实测链深=1）。
$attest = "$p\CHAIN-DEPTH-1.txt"
if (-not (Test-Path $attest)) { throw 'refuse: CHAIN-DEPTH-1.txt missing — run host vm-chain-depth-check.ps1, then write the attest file this boot' }
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
if ((Get-Item $attest).LastWriteTime -lt $boot) { throw "refuse: CHAIN-DEPTH-1.txt predates this boot ($boot) — re-attest after each boot" }
Get-Content $attest | Out-File "$out.attest.tmp" -Encoding utf8
New-Item -ItemType Directory -Force $out | Out-Null
Move-Item "$out.attest.tmp" "$out\chain-attest.txt" -Force
$env:PATH = "$p\bin;$p\node;$p\git\cmd;" + $env:PATH
$env:COREPACK_HOME = "$p\corepack"
$env:PNPM_STORE_DIR = "$p\store"
# Offline VM: pnpm 11 lockfile 供应链核验需 registry 元数据（run-4 发现），只跳该元数据段。
$env:PNPM_CONFIG_TRUST_LOCKFILE = 'true'
Set-Location $r
function S($n, [scriptblock]$b) {
  & $b *>&1 | Out-File "$out\$n.log" -Encoding utf8
  "$n=$LASTEXITCODE" | Out-File "$out\results.txt" -Append -Encoding utf8
  if ($LASTEXITCODE -ne 0) { $script:failed = $true }
}

S 'node-version' { node --version }
if (-not (Get-Content "$out\node-version.log" -Raw).Contains('v24.17.0')) { Fail-Stop 'FAILED: node is not v24.17.0 (payload runtime anchor broken)' }
S 'git-version' { git --version }
if (-not (Get-Content "$out\git-version.log" -Raw).Contains('git version')) { Fail-Stop 'FAILED: git unavailable in VM' }
S 'pnpm-version' { pnpm --version }
S 'edge-version' { (Get-Item $e).VersionInfo.ProductVersion; $global:LASTEXITCODE = 0 }
S 'install' { pnpm install --frozen-lockfile --store-dir "$p\store" }
S 'environment-check' { pnpm environment:check }
Copy-Item "$r\artifacts\reference-machine\environment.win11.json" "$out\environment.win11.json" -ErrorAction Stop

# 批次机器证据四步规程（A-04 任务书 §6，VM 内形态）。
S 'env-record' { pnpm env:record --label wenshu-poc-a-win11 --out environment.a-04e-2a.json }
if (-not (Test-Path "$r\artifacts\reference-machine\environment.a-04e-2a.json")) { Fail-Stop 'FAILED: env:record produced no output' }
Move-Item "$r\artifacts\reference-machine\environment.a-04e-2a.json" "$out\environment.a-04e-2a.json" -ErrorAction Stop
S 'env-record-clean' { $st = git -c safe.directory=C:/wenshu-payload/wenshu status --short artifacts/reference-machine/; $st; if ($st) { $global:LASTEXITCODE = 1 } }
S 'environment-check-2' { pnpm environment:check }

S 'build-input' { node packages/report-checks/scripts/build-pa13-performance-input.ts --out "$out\input" --repetitions 280 }
$inputSha = (Get-FileHash "$out\input\pa-13-performance-30-page.md" -Algorithm SHA256).Hash.ToLower()
"input-sha256=$inputSha expected=$expectedInputSha" | Out-File "$out\source-hash.txt" -Encoding utf8
if ($inputSha -ne $expectedInputSha) { Fail-Stop 'FAILED: input sha256 mismatch vs PA-13 final-v6 signed input' }

$fixture = "$out\input\pa-13-performance-30-page.md"
$template = "$out\input\formal-business.template.json"
S 'warmup' { pnpm --filter @wenshu/pdf-export export:baseline --out "$out\warmup" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
S 'calibrate' { pnpm --filter @wenshu/pdf-export export:baseline --out "$out\calibrate" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
if ($script:failed) { Fail-Stop 'FAILED before calibration gate (see results.txt)' }

# 批前标定门（PROVISIONAL 带，见头部注释）。
$cal = (Get-Content "$out\calibrate\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs
"calibrate-renderMs=$cal gate=[$calMinMs,$calMaxMs] PROVISIONAL (2a single-pass derivation, pending task-book amendment)" | Out-File "$out\calibration.txt" -Encoding utf8
if ($cal -lt $calMinMs -or $cal -gt $calMaxMs) { Fail-Stop "CALIBRATION_DIVERGED: renderMs=$cal outside PROVISIONAL [$calMinMs,$calMaxMs]; no runs issued" }

1..10 | ForEach-Object {
  $i = $_
  $pre = @(Get-Process msedge -ErrorAction SilentlyContinue)
  $preWs = [math]::Round((($pre | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
  $preFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
  "pre-run-$i edgeProcs=$($pre.Count) edgeWS_MB=$preWs freeMemMB=$preFree" | Out-File "$out\drift.txt" -Append -Encoding utf8
  S "run-$i" { pnpm --filter @wenshu/pdf-export export:baseline --out "$out\runs\$i" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
  $post = @(Get-Process msedge -ErrorAction SilentlyContinue)
  $postWs = [math]::Round((($post | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
  $postFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
  "post-run-$i edgeProcs=$($post.Count) edgeWS_MB=$postWs freeMemMB=$postFree" | Out-File "$out\drift.txt" -Append -Encoding utf8
}
if ($script:failed) { Fail-Stop 'FAILED during 10-run batch (see results.txt)' }

# 预算门：10 跑 totalMs（全管线）p95 ≤ 8000ms。nearest-rank 口径，书面化。
$totals = 1..10 | ForEach-Object {
  [double](Get-Content "$out\runs\$_\evidence.json" -Raw | ConvertFrom-Json).timings.totalMs
}
$sorted = $totals | Sort-Object
$p95 = $sorted[[math]::Ceiling(0.95 * $sorted.Count) - 1]
$renders = 1..10 | ForEach-Object { [double](Get-Content "$out\runs\$_\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs }
$posts = 1..10 | ForEach-Object { [double](Get-Content "$out\runs\$_\evidence.json" -Raw | ConvertFrom-Json).timings.postprocessMs }
"totalMs sorted: $($sorted -join ', ')" | Out-File "$out\summary.txt" -Encoding utf8
"renderMs: $($renders -join ', ')" | Out-File "$out\summary.txt" -Append -Encoding utf8
"postprocessMs: $($posts -join ', ')" | Out-File "$out\summary.txt" -Append -Encoding utf8
"p95(totalMs, nearest-rank)=$p95 budget=$budgetP95Ms" | Out-File "$out\summary.txt" -Append -Encoding utf8
# 插桩语义留证（R7）：单遍下 firstPassMs=唯一渲染遍、stabilizationRoundMs=[]、finalPassMs=0。
$bd = (Get-Content "$out\runs\1\evidence.json" -Raw | ConvertFrom-Json).timings.renderBreakdown
"run-1 breakdown: firstPassMs=$($bd.firstPassMs) stabilizationRoundMs=[$($bd.stabilizationRoundMs -join ',')] finalPassMs=$($bd.finalPassMs)" | Out-File "$out\summary.txt" -Append -Encoding utf8
if ($p95 -gt $budgetP95Ms) { Fail-Stop "BUDGET_NOT_MET: p95(totalMs)=$p95 > $budgetP95Ms (decision #18 D3: no DEGRADE, report as-is)" }

# 确定性门：10 跑 normalized sha256 全等（归一 Skia 墙钟时间戳后）。
$hashes = 1..10 | ForEach-Object {
  (node "$r\tools\a-04e\normalized-pdf-sha.mjs" "$out\runs\$_\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
}
$hashes | Out-File "$out\determinism.txt" -Encoding utf8
if (($hashes | Select-Object -Unique).Count -ne 1) { Fail-Stop 'DETERMINISM_FAIL: 10-run normalized sha256 not identical' }
"determinism=0 (10/10 identical)" | Out-File "$out\determinism.txt" -Append -Encoding utf8

# 跨引擎基线等价门（决策 #21「无视觉变化」承重点的 VM 侧证据）：同 VM 单遍产物
# （21 页 golden 语料）vs 签署基线 PDF，全页全 run 序列逐一项相等。
S 'golden-export' { pnpm --filter @wenshu/pdf-export export:baseline --out "$out\golden" --label wenshu-poc-a-win11 --browser $e --fixture "$r\docs\poc-a\fixtures\golden-report.md" --fixture-root "$r\docs\poc-a\fixtures" --template "$r\docs\poc-a\fixtures\formal-business.template.json" }
S 'golden-equivalence' { node packages/pdf-export/scripts/a04e2a-signed-baseline-compare.ts "$out\golden\golden-report-baseline.pdf" }
if ($script:failed) { Fail-Stop 'FAILED at golden equivalence gate (see golden-equivalence.log)' }

# 批后标定门（PROVISIONAL 带）。
S 'calibrate-post' { pnpm --filter @wenshu/pdf-export export:baseline --out "$out\calibrate-post" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
$cal2 = (Get-Content "$out\calibrate-post\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs
"calibrate-post-renderMs=$cal2 gate=[$calMinMs,$calMaxMs] PROVISIONAL" | Out-File "$out\calibration.txt" -Append -Encoding utf8
if ($cal2 -lt $calMinMs -or $cal2 -gt $calMaxMs) { Fail-Stop "CALIBRATION_DIVERGED_POST: renderMs=$cal2 outside PROVISIONAL band; quantitative results invalid, raw evidence retained" }

S 'anchor' { git -c safe.directory=C:/wenshu-payload/wenshu rev-parse HEAD | Tee-Object "$out\anchor.txt" }
if (-not $script:failed) { New-Item -ItemType File "$out\DONE" -Force | Out-Null } else { 'FAILED (raw logs retained; no DONE marker)' | Out-File "$out\STATUS.txt" -Encoding utf8 }
