# vm-single-pass.ps1 — A-04E-2a 正式批次：单遍+回填管线 ≤8s 复测（决策 #19/#21/#22）。
# 在 Win11 参考 VM（wenshu-poc-a-win11）内运行。NEVER run on the host：
# INSIDE-VM.txt 守卫。批次不自动关机（便于就地查看失败证据）。
#
# 前置（强制顺序，缺一即拒跑）：
#   1. 宿主层数核验：tools\a-04e\vm-chain-depth-check.ps1 必须 PASS（签署层配置=基盘+单一差分盘）。
#   2. 同次引导 attest：C:\wenshu-payload\CHAIN-DEPTH-1.txt 存在且新于上次引导时间。
#   3. 双检出就位（业主 2026-08-08 标定带裁定）：
#      C:\wenshu-payload\wenshu        = a-04e-2a 分支（单遍管线，正式 10 跑）
#      C:\wenshu-payload\wenshu-main   = 签署 main f64f348（两遍管线，标定专用）
#      ——标定轮跑旧管线对旧签署带，机器漂移与产品变化因此可分；签署带一个数字不改。
#
# 验收口径（任务书 §5.1 修订版）：
#   - 预算：分支 10 跑 totalMs（全管线）p95 ≤ 8000ms（nearest-rank，书面化）；
#   - 双标定门：main 检出 calibrate（批前+批后）renderMs ∈ [20553.4, 24300.2]
#     （PA-13 final-v6 签署带，两遍管线，含义不变）；
#   - 确定性：分支 10 跑 normalized sha256 全等（tools/a-04e/normalized-pdf-sha.mjs）；
#   - 输出不变：同 VM 分支产物 vs 签署基线（21 页 golden）全 run 序列逐一项相等
#     （零差异硬门；normalized sha 若不等，差异来源如实登记 summary.txt）；
#   - 机器证据：env:record 四步规程 + 漂移插桩。
$ErrorActionPreference = 'Continue'
$out = 'C:\wenshu-out\a-04e\single-pass-v1'
$p = 'C:\wenshu-payload'
$branch = "$p\wenshu"
$main = "$p\wenshu-main"
$e = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$script:failed = $false
# PA-13 final-v6 签署带（两遍管线 renderMs 观测 min/max，artifacts/perf/2026-07-29 批次）。
$calMinMs = 20553.4
$calMaxMs = 24300.2
$budgetP95Ms = 8000.0
$expectedMainHead = 'f64f348db026590e44f44a639d14f5b55d5614c3'
# Input identity: sha256 of the PA-13 final-v6 signed 30-page input（与阶段一同语料保可比）。
$expectedInputSha = '4dedb1c2dee256c1f929f54a0e7922eb66daea072df8567cc129e331c25b6258'

function Fail-Stop($msg) {
  $msg | Out-File "$out\STATUS.txt" -Encoding utf8
  exit 1
}

if (-not (Test-Path "$p\INSIDE-VM.txt")) { throw 'refuse: INSIDE-VM marker missing (host safety guard)' }
if (Test-Path $out) { throw "existing a-04e evidence: $out" }
# 塌链 attest 门：同次引导、先于批次人工书写（宿主 vm-chain-depth-check.ps1 已实测签署层配置）。
$attest = "$p\CHAIN-DEPTH-1.txt"
if (-not (Test-Path $attest)) { throw 'refuse: CHAIN-DEPTH-1.txt missing — run host vm-chain-depth-check.ps1, then write the attest file this boot' }
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
if ((Get-Item $attest).LastWriteTime -lt $boot) { throw "refuse: CHAIN-DEPTH-1.txt predates this boot ($boot) — re-attest after each boot" }
if (-not (Test-Path "$main\.git")) { throw "refuse: signed-main checkout missing at $main (two-pass calibration checkout)" }
if (-not (Test-Path "$branch\.git")) { throw "refuse: branch checkout missing at $branch" }
New-Item -ItemType Directory -Force $out | Out-Null
Get-Content $attest | Out-File "$out\chain-attest.txt" -Encoding utf8
$env:PATH = "$p\bin;$p\node;$p\git\cmd;" + $env:PATH
$env:COREPACK_HOME = "$p\corepack"
$env:PNPM_STORE_DIR = "$p\store"
# Offline VM: pnpm 11 lockfile 供应链核验需 registry 元数据（run-4 发现），只跳该元数据段。
$env:PNPM_CONFIG_TRUST_LOCKFILE = 'true'
# Offline VM: corepack resolves the packageManager pin from the package.json of the
# CURRENT working directory (not from pnpm -C). With any other cwd it falls back to
# 'latest' and tries the network -> ENOTFOUND offline (run-2a-1 evidence:
# single-pass-v1-FAILED-corepack-cwd, all pnpm steps exit 1 before pnpm even runs).
# Stage-one form (vm-decomposition.ps1:34) is Set-Location into the repo; keep it.
Set-Location $branch
function S($n, [scriptblock]$b) {
  & $b *>&1 | Out-File "$out\$n.log" -Encoding utf8
  "$n=$LASTEXITCODE" | Out-File "$out\results.txt" -Append -Encoding utf8
  if ($LASTEXITCODE -ne 0) { $script:failed = $true }
}

# 锚定门：main 检出必须逐位等于签署锚（标定语义的全部基础）；分支 HEAD 留证。
$mainHead = (git -c safe.directory=C:/wenshu-payload/wenshu-main -C $main rev-parse HEAD).Trim()
$branchHead = (git -c safe.directory=C:/wenshu-payload/wenshu -C $branch rev-parse HEAD).Trim()
"main-head=$mainHead expected=$expectedMainHead" | Out-File "$out\anchors.txt" -Encoding utf8
"branch-head=$branchHead" | Out-File "$out\anchors.txt" -Append -Encoding utf8
if ($mainHead -ne $expectedMainHead) { Fail-Stop "FAILED: main checkout HEAD drifted ($mainHead != $expectedMainHead); calibration would not be the signed two-pass pipeline" }

S 'node-version' { node --version }
if (-not (Get-Content "$out\node-version.log" -Raw).Contains('v24.17.0')) { Fail-Stop 'FAILED: node is not v24.17.0 (payload runtime anchor broken)' }
S 'git-version' { git --version }
if (-not (Get-Content "$out\git-version.log" -Raw).Contains('git version')) { Fail-Stop 'FAILED: git unavailable in VM' }
S 'pnpm-version' { pnpm --version }
S 'edge-version' { (Get-Item $e).VersionInfo.ProductVersion; $global:LASTEXITCODE = 0 }
S 'install-branch' { pnpm -C $branch install --frozen-lockfile --store-dir "$p\store" }
S 'install-main' { pnpm -C $main install --frozen-lockfile --store-dir "$p\store" }
S 'environment-check' { pnpm -C $branch environment:check }
Copy-Item "$branch\artifacts\reference-machine\environment.win11.json" "$out\environment.win11.json" -ErrorAction Stop

# 批次机器证据四步规程（A-04 任务书 §6，VM 内形态，分支检出侧）。
S 'env-record' { pnpm -C $branch env:record --label wenshu-poc-a-win11 --out environment.a-04e-2a.json }
if (-not (Test-Path "$branch\artifacts\reference-machine\environment.a-04e-2a.json")) { Fail-Stop 'FAILED: env:record produced no output' }
Move-Item "$branch\artifacts\reference-machine\environment.a-04e-2a.json" "$out\environment.a-04e-2a.json" -ErrorAction Stop
S 'env-record-clean' { $st = git -c safe.directory=C:/wenshu-payload/wenshu -C $branch status --short artifacts/reference-machine/; $st; if ($st) { $global:LASTEXITCODE = 1 } }
S 'environment-check-2' { pnpm -C $branch environment:check }

S 'build-input' { node "$branch\packages\report-checks\scripts\build-pa13-performance-input.ts" --out "$out\input" --repetitions 280 }
$inputSha = (Get-FileHash "$out\input\pa-13-performance-30-page.md" -Algorithm SHA256).Hash.ToLower()
"input-sha256=$inputSha expected=$expectedInputSha" | Out-File "$out\source-hash.txt" -Encoding utf8
if ($inputSha -ne $expectedInputSha) { Fail-Stop 'FAILED: input sha256 mismatch vs PA-13 final-v6 signed input' }
$fixture = "$out\input\pa-13-performance-30-page.md"
$template = "$out\input\formal-business.template.json"
if ($script:failed) { Fail-Stop 'FAILED before calibration gate (see results.txt)' }

# 批前标定门：main 检出（签署两遍管线）renderMs 对旧签署带——机器漂移与产品变化可分。
S 'calibrate' { pnpm -C $main --filter @wenshu/pdf-export export:baseline --out "$out\calibrate" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
$cal = (Get-Content "$out\calibrate\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs
"calibrate-renderMs=$cal gate=[$calMinMs,$calMaxMs] (PA-13 final-v6 signed band, two-pass pipeline @ main)" | Out-File "$out\calibration.txt" -Encoding utf8
if ($cal -lt $calMinMs -or $cal -gt $calMaxMs) { Fail-Stop "CALIBRATION_DIVERGED: renderMs=$cal outside signed band [$calMinMs,$calMaxMs]; machine not in signed envelope, no runs issued" }

S 'warmup' { pnpm -C $branch --filter @wenshu/pdf-export export:baseline --out "$out\warmup" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
1..10 | ForEach-Object {
  $i = $_
  $pre = @(Get-Process msedge -ErrorAction SilentlyContinue)
  $preWs = [math]::Round((($pre | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
  $preFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
  "pre-run-$i edgeProcs=$($pre.Count) edgeWS_MB=$preWs freeMemMB=$preFree" | Out-File "$out\drift.txt" -Append -Encoding utf8
  S "run-$i" { pnpm -C $branch --filter @wenshu/pdf-export export:baseline --out "$out\runs\$i" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
  $post = @(Get-Process msedge -ErrorAction SilentlyContinue)
  $postWs = [math]::Round((($post | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
  $postFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
  "post-run-$i edgeProcs=$($post.Count) edgeWS_MB=$postWs freeMemMB=$postFree" | Out-File "$out\drift.txt" -Append -Encoding utf8
}
if ($script:failed) { Fail-Stop 'FAILED during 10-run batch (see results.txt)' }

# 预算门：10 跑 totalMs（全管线）p95 ≤ 8000ms。
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
  (node "$branch\tools\a-04e\normalized-pdf-sha.mjs" "$out\runs\$_\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
}
$hashes | Out-File "$out\determinism.txt" -Encoding utf8
if (($hashes | Select-Object -Unique).Count -ne 1) { Fail-Stop 'DETERMINISM_FAIL: 10-run normalized sha256 not identical' }
"determinism=0 (10/10 identical)" | Out-File "$out\determinism.txt" -Append -Encoding utf8

# 输出不变门（§5.1 修订版）：同 VM 分支产物 vs 签署基线，全 run 序列零差异硬门。
# normalized sha 与签署基线必然不等（增量更新结构），差异来源在此如实登记。
S 'golden-export' { pnpm -C $branch --filter @wenshu/pdf-export export:baseline --out "$out\golden" --label wenshu-poc-a-win11 --browser $e --fixture "$branch\docs\poc-a\fixtures\golden-report.md" --fixture-root "$branch\docs\poc-a\fixtures" --template "$branch\docs\poc-a\fixtures\formal-business.template.json" }
S 'golden-equivalence' { node "$branch\packages\pdf-export\scripts\a04e2a-signed-baseline-compare.ts" "$out\golden\golden-report-baseline.pdf" }
$goldenSha = (node "$branch\tools\a-04e\normalized-pdf-sha.mjs" "$out\golden\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
$signedSha = (node "$branch\tools\a-04e\normalized-pdf-sha.mjs" "$branch\packages\pdf-evidence\fixtures\baseline\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
"golden-normalized-sha256=$goldenSha" | Out-File "$out\summary.txt" -Append -Encoding utf8
"signed-baseline-normalized-sha256=$signedSha" | Out-File "$out\summary.txt" -Append -Encoding utf8
if ($goldenSha -ne $signedSha) { "normalized-sha differs from signed baseline: expected (incremental-update structure from backfill/repair/stamp chain; run-sequence equivalence gate is the visual-invariance evidence)" | Out-File "$out\summary.txt" -Append -Encoding utf8 }
if ($script:failed) { Fail-Stop 'FAILED at golden equivalence gate (see golden-equivalence.log)' }

# 批后标定门：批末机器仍在签署带内，批次定量结果才有效。
S 'calibrate-post' { pnpm -C $main --filter @wenshu/pdf-export export:baseline --out "$out\calibrate-post" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
$cal2 = (Get-Content "$out\calibrate-post\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs
"calibrate-post-renderMs=$cal2 gate=[$calMinMs,$calMaxMs] (signed band)" | Out-File "$out\calibration.txt" -Append -Encoding utf8
if ($cal2 -lt $calMinMs -or $cal2 -gt $calMaxMs) { Fail-Stop "CALIBRATION_DIVERGED_POST: renderMs=$cal2 outside signed band; batch quantitative results invalid, raw evidence retained" }

S 'anchor' { "main=$mainHead`nbranch=$branchHead" | Tee-Object "$out\anchor.txt" }
if (-not $script:failed) { New-Item -ItemType File "$out\DONE" -Force | Out-Null } else { 'FAILED (raw logs retained; no DONE marker)' | Out-File "$out\STATUS.txt" -Encoding utf8 }
