# vm-a04e2-p6-pass.ps1 — A-04E-2-P6 VM 批次：取消 target 隔离（closeTarget）
# 2s 预算判定（决策 #27 D3 唯一验收条款：逐轮 settleAfterClickMs ≤ 2000）+
# 存量 G1–G6 零回归 + 签署管线零回归（本棒触碰 report-render CDP 连接层）。
# 在 Win11 参考 VM（wenshu-ref-win11）内运行。NEVER run on the host：INSIDE-VM.txt 守卫。
#
# 与 A-04E-2b 批次（vm-a04e2b-pass.ps1）全表同纪律：塌链 attest、双检出锚定
# （main=f64f348 逐位拒跑）、900s 沉降、离线 install、输入 sha 钉死、批前批后
# 双标定对旧签署带 [20553.4, 24300.2]（破下限/破上限均无自动豁免——停下请示，
# 决策 #26 D3 第四条）、签署基线等价门。差异项：
#   - 预算判定收尾换为 G7：判定器逐轮 settleAfterClickMs ≤ 2000（取消后 2 秒内
#     停止消耗，冻结预算原文语义=单次操作，逐轮判定非 p95/均值）；
#   - 增量编辑 p95 ≤1s 预算**已在决策 #27 D1 永久登记未达成、不得追认**——
#     本批次仍输出 p95 指标留证，但不再以 BUDGET_NOT_MET 截断批次（否则与
#     「永久登记」自相矛盾）；P6 预算判定唯一落点 = 判定器 G7。
$ErrorActionPreference = 'Continue'
$out = 'C:\wenshu-out\a-04e\a04e-2-p6-cancel-v1'
$p = 'C:\wenshu-payload'
$branch = "$p\wenshu"
$main = "$p\wenshu-main"
$e = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$script:failed = $false
# PA-13 final-v6 签署带（两遍管线 renderMs 观测 min/max，artifacts/perf/2026-07-29 批次）。
$calMinMs = 20553.4
$calMaxMs = 24300.2
$expectedMainHead = 'f64f348db026590e44f44a639d14f5b55d5614c3'
# Input identity: sha256 of the PA-13 final-v6 signed 30-page input（与 2a/2b 同语料保可比）。
$expectedInputSha = '4dedb1c2dee256c1f929f54a0e7922eb66daea072df8567cc129e331c25b6258'

function Fail-Stop($msg) {
  $msg | Out-File "$out\STATUS.txt" -Encoding utf8
  exit 1
}

if (-not (Test-Path "$p\INSIDE-VM.txt")) { throw 'refuse: INSIDE-VM marker missing (host safety guard)' }
if (Test-Path $out) { throw "existing a-04e-2-p6 evidence: $out" }
# 塌链 attest 门：同次引导、先于批次人工书写（宿主 vm-chain-depth-check.ps1 已实测签署层配置）。
$attest = "$p\CHAIN-DEPTH-1.txt"
if (-not (Test-Path $attest)) { throw 'refuse: CHAIN-DEPTH-1.txt missing — run host vm-chain-depth-check.ps1, then write the attest file this boot' }
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
if ((Get-Item $attest).LastWriteTime -lt $boot) { Fail-Stop "refuse: CHAIN-DEPTH-1.txt predates this boot ($boot) — re-attest after each boot" }
if (-not (Test-Path "$main\.git")) { throw 'refuse: signed-main checkout missing at $main (two-pass calibration checkout)' }
if (-not (Test-Path "$branch\.git")) { throw 'refuse: branch checkout missing at $branch' }
New-Item -ItemType Directory -Force $out | Out-Null
Get-Content $attest | Out-File "$out\chain-attest.txt" -Encoding utf8
$env:PATH = "$p\bin;$p\node;$p\git\cmd;" + $env:PATH
$env:COREPACK_HOME = "$p\corepack"
$env:PNPM_STORE_DIR = "$p\store"
# Offline VM: pnpm 11 lockfile 供应链核验需 registry 元数据，只跳该元数据段。
$env:PNPM_CONFIG_TRUST_LOCKFILE = 'true'
# Offline VM: corepack 按 cwd 的 package.json 解析 packageManager 钉版（run-2a-1 实证）。
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
# --offline fail-fast（run-2a-4 教训）+ 900s 沉降窗口（run-2a-6 教训，业主 2026-09-07 裁定）。
'settle: waiting 900s for post-boot load to settle (owner 2026-09-07 ruling, same as 2a/2b batches)' | Out-File "$out\settle.log" -Encoding utf8
Start-Sleep -Seconds 900
('settle: done at ' + (Get-Date -Format o)) | Out-File "$out\settle.log" -Append -Encoding utf8

S 'install-branch' { pnpm -C $branch install --frozen-lockfile --offline --store-dir "$p\store" }
S 'install-main' { pnpm -C $main install --frozen-lockfile --offline --store-dir "$p\store" }
S 'environment-check' { pnpm -C $branch environment:check }
Copy-Item "$branch\artifacts\reference-machine\environment.win11.json" "$out\environment.win11.json" -ErrorAction Stop

# 批次机器证据四步规程（A-04 任务书 §6，VM 内形态，分支检出侧）。
S 'env-record' { pnpm -C $branch env:record --label wenshu-poc-a-win11 --out environment.a-04e-2-p6-cancel.json }
if (-not (Test-Path "$branch\artifacts\reference-machine\environment.a-04e-2-p6-cancel.json")) { Fail-Stop 'FAILED: env:record produced no output' }
Move-Item "$branch\artifacts\reference-machine\environment.a-04e-2-p6-cancel.json" "$out\environment.a-04e-2-p6-cancel.json" -ErrorAction Stop
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

# 批次：工装 10 轮（每轮：基线上下文 + 3 次确定性编辑增量更新 + 对账 +
# ADR-0014 ③取消演示——P6 起后台整份在独立 target、取消主路径 closeTarget）。
$pre = @(Get-Process msedge -ErrorAction SilentlyContinue)
$preWs = [math]::Round((($pre | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
$preFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
"pre-batch edgeProcs=$($pre.Count) edgeWS_MB=$preWs freeMemMB=$preFree" | Out-File "$out\drift.txt" -Encoding utf8
S 'harness-batch' { node "$branch\packages\pdf-export\scripts\a04e2b-harness.ts" --out "$out\harness" --fixture-root "$out\input" --browser $e --runs 10 }
$post = @(Get-Process msedge -ErrorAction SilentlyContinue)
$postWs = [math]::Round((($post | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
$postFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
"post-batch edgeProcs=$($post.Count) edgeWS_MB=$postWs freeMemMB=$postFree" | Out-File "$out\drift.txt" -Append -Encoding utf8
if ($script:failed) { Fail-Stop 'FAILED during harness batch (see harness-batch.log)' }

# 机械判定门（G1~G7：报告完整/轮次完整/增量诚实性/对账事实/跨轮确定性/取消演示/
# 取消结案 2s 预算逐轮判定——决策 #27 D3 唯一验收条款）。
S 'verify-harness' { node "$branch\tools\a-04e\verify-a04e2b-harness.mjs" "$out\harness" }
if ($script:failed) { Fail-Stop 'FAILED at harness verification gate (see verify-harness.log)' }
$p95Line = (Get-Content "$out\verify-harness.log" | Select-String '^p95-incremental-totalMs=([0-9.]+)').Matches.Groups[1].Value
if (-not $p95Line) { Fail-Stop 'FAILED: verifier did not emit p95-incremental-totalMs (metrics line missing)' }
$p95 = [double]$p95Line
# 决策 #27 D1：增量编辑 ≤1s 预算永久登记未达成，本批次 p95 仅留证不作判定。
"p95(incremental edit totalMs, 30 samples, nearest-rank)=$p95 — informational only (permanently registered NOT MET, decision #27 D1; P6 budget verdict = verifier G7)" | Out-File "$out\summary.txt" -Encoding utf8
Get-Content "$out\verify-harness.log" | Out-File "$out\summary.txt" -Append -Encoding utf8

# 签署管线零回归门（本棒触碰 report-render CDP 连接层与 render-full）：分支产物对签署基线等价门重跑。
S 'golden-export' { pnpm -C $branch --filter @wenshu/pdf-export export:baseline --out "$out\golden" --label wenshu-poc-a-win11 --browser $e --fixture "$branch\docs\poc-a\fixtures\golden-report.md" --fixture-root "$branch\docs\poc-a\fixtures" --template "$branch\docs\poc-a\fixtures\formal-business.template.json" }
S 'golden-equivalence' { node "$branch\packages\pdf-export\scripts\a04e2a-signed-baseline-compare.ts" "$out\golden\golden-report-baseline.pdf" }
$goldenSha = (node "$branch\tools\a-04e\normalized-pdf-sha.mjs" "$out\golden\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
$signedSha = (node "$branch\tools\a-04e\normalized-pdf-sha.mjs" "$branch\packages\pdf-evidence\fixtures\baseline\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
"golden-normalized-sha256=$goldenSha" | Out-File "$out\summary.txt" -Append -Encoding utf8
"signed-baseline-normalized-sha256=$signedSha" | Out-File "$out\summary.txt" -Append -Encoding utf8
if ($script:failed) { Fail-Stop 'FAILED at golden equivalence gate (see golden-equivalence.log)' }

# 批后标定门：批末机器仍在签署带内，批次定量结果才有效。
S 'calibrate-post' { pnpm -C $main --filter @wenshu/pdf-export export:baseline --out "$out\calibrate-post" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
$cal2 = (Get-Content "$out\calibrate-post\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs
"calibrate-post-renderMs=$cal2 gate=[$calMinMs,$calMaxMs] (signed band)" | Out-File "$out\calibration.txt" -Append -Encoding utf8
if ($cal2 -lt $calMinMs -or $cal2 -gt $calMaxMs) { Fail-Stop "CALIBRATION_DIVERGED_POST: renderMs=$cal2 outside signed band; batch quantitative results invalid, raw evidence retained" }

S 'anchor' { "main=$mainHead`nbranch=$branchHead" | Tee-Object "$out\anchor.txt" }
"p6-budget-verdict: verifier G7 per-run settleAfterClickMs <= 2000ms (decision #27 D3) — see verify-harness.log" | Out-File "$out\summary.txt" -Append -Encoding utf8
if (-not $script:failed) { New-Item -ItemType File "$out\DONE" -Force | Out-Null } else { 'FAILED (raw logs retained; no DONE marker)' | Out-File "$out\STATUS.txt" -Encoding utf8 }
