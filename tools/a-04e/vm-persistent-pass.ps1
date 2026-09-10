# vm-persistent-pass.ps1 — A-04E-2a 第二批：持久会话稳态整份重排 ≤8s 复测（任务书 §5.1 承重口径）。
# 在 Win11 参考 VM（wenshu-poc-a-win11）内运行。NEVER run on the host：INSIDE-VM.txt 守卫。
#
# 与第一批（vm-single-pass.ps1）的关系：第一批测「每次冷启浏览器」形态（10 次独立 CLI），
# 任务书 §5.1 定性其为结构性 not_met 形态——冷启动归启动预算、不归重排预算。本批测
# 「同一 launchBrowser 会话内 warmup+10 次连续完整管线」稳态形态（产品现实=A-04 预览持久
# 会话），驱动为 packages/pdf-export/scripts/a04e2a-persistent-session-batch.ts（纯测量，
# export-baseline.ts 签署面零改动）。
#
# 门禁与第一批同源：塌链 attest、双检出锚定（main=f64f348 逐位拒跑）、900s 沉降（业主
# 2026-09-07 裁定）、离线 install、输入 sha、批前批后双标定对旧签署带 [20553.4, 24300.2]、
# golden 等价门零差异。差异项：
#   - 确定性口径换为 tools/a-04e/normalized-pdf-sha-persistent.mjs（node ID 按首次出现序
#     重编号，比较同构非抹除；签署口径 normalized-pdf-sha.mjs 一字未动）；
#   - 交叉校验门：verify-persistent-caliber.mjs 在 VM 内重跑——会话对判等 + 冷启对上
#     新旧口径判定一致 + M1/M2/M3 决定性反例判不等（任务书 §5.1 约束③④）；
#   - 预算判定在收尾（D3 如实登记，不截断证据链；run-2a-7 教训）。
$ErrorActionPreference = 'Continue'
$out = 'C:\wenshu-out\a-04e\persistent-session-v1'
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
# Input identity: sha256 of the PA-13 final-v6 signed 30-page input（与第一批同语料保可比）。
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
'settle: waiting 900s for post-boot load to settle (owner 2026-09-07 ruling, same as batch-1)' | Out-File "$out\settle.log" -Encoding utf8
Start-Sleep -Seconds 900
('settle: done at ' + (Get-Date -Format o)) | Out-File "$out\settle.log" -Append -Encoding utf8

S 'install-branch' { pnpm -C $branch install --frozen-lockfile --offline --store-dir "$p\store" }
S 'install-main' { pnpm -C $main install --frozen-lockfile --offline --store-dir "$p\store" }
S 'environment-check' { pnpm -C $branch environment:check }
Copy-Item "$branch\artifacts\reference-machine\environment.win11.json" "$out\environment.win11.json" -ErrorAction Stop

# 批次机器证据四步规程（A-04 任务书 §6，VM 内形态，分支检出侧）。
S 'env-record' { pnpm -C $branch env:record --label wenshu-poc-a-win11 --out environment.a-04e-2a-persistent.json }
if (-not (Test-Path "$branch\artifacts\reference-machine\environment.a-04e-2a-persistent.json")) { Fail-Stop 'FAILED: env:record produced no output' }
Move-Item "$branch\artifacts\reference-machine\environment.a-04e-2a-persistent.json" "$out\environment.a-04e-2a-persistent.json" -ErrorAction Stop
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

# 持久会话批次：一次 launchBrowser，会话内 warmup 1 + 正式 10 次完整管线（30 页输入）。
$pre = @(Get-Process msedge -ErrorAction SilentlyContinue)
$preWs = [math]::Round((($pre | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
$preFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
"pre-batch edgeProcs=$($pre.Count) edgeWS_MB=$preWs freeMemMB=$preFree" | Out-File "$out\drift.txt" -Encoding utf8
S 'persistent-batch' { node "$branch\packages\pdf-export\scripts\a04e2a-persistent-session-batch.ts" --out "$out\persistent" --browser $e --fixture $fixture --fixture-root "$out\input" --template $template --runs 10 --warmup 1 }
$post = @(Get-Process msedge -ErrorAction SilentlyContinue)
$postWs = [math]::Round((($post | Measure-Object WorkingSet64 -Sum).Sum)/1MB)
$postFree = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1KB)
"post-batch edgeProcs=$($post.Count) edgeWS_MB=$postWs freeMemMB=$postFree" | Out-File "$out\drift.txt" -Append -Encoding utf8
if ($script:failed) { Fail-Stop 'FAILED during persistent-session batch (see persistent-batch.log)' }

# 预算口径：仅正式跑（kind=formal，warmup 不计）的 totalMs 全管线 p95（nearest-rank）。
$report = Get-Content "$out\persistent\persistent-session-batch.json" -Raw | ConvertFrom-Json
$formal = @($report.records | Where-Object { $_.kind -eq 'formal' })
if ($formal.Count -ne 10) { Fail-Stop "FAILED: formal run count $($formal.Count) != 10 (driver report incomplete)" }
$totals = $formal | ForEach-Object { [double]$_.timings.totalMs }
$sorted = $totals | Sort-Object
$p95 = $sorted[[math]::Ceiling(0.95 * $sorted.Count) - 1]
$renders = $formal | ForEach-Object { [double]$_.timings.renderMs }
$firsts = $formal | ForEach-Object { [double]$_.timings.renderBreakdown.firstPassMs }
"browserLaunchMs=$($report.browserLaunchMs) (启动预算归属：冷启动只付一次，不归重排预算)" | Out-File "$out\summary.txt" -Encoding utf8
"totalMs sorted: $($sorted -join ', ')" | Out-File "$out\summary.txt" -Append -Encoding utf8
"renderMs: $($renders -join ', ')" | Out-File "$out\summary.txt" -Append -Encoding utf8
"firstPassMs: $($firsts -join ', ')" | Out-File "$out\summary.txt" -Append -Encoding utf8
"p95(totalMs formal, nearest-rank)=$p95 budget=$budgetP95Ms" | Out-File "$out\summary.txt" -Append -Encoding utf8
$budgetMet = ($p95 -le $budgetP95Ms)
"budget-met=$budgetMet (p95=$p95 vs $budgetP95Ms)" | Out-File "$out\summary.txt" -Append -Encoding utf8

# 确定性门（持久会话专用口径）：10 份正式产物经 normalized-pdf-sha-persistent 全等。
$hashes = 2..11 | ForEach-Object {
  (node "$branch\tools\a-04e\normalized-pdf-sha-persistent.mjs" "$out\persistent\runs\$('{0:d2}' -f $_)\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
}
$hashes | Out-File "$out\determinism.txt" -Encoding utf8
if (($hashes | Select-Object -Unique).Count -ne 1) { Fail-Stop 'DETERMINISM_FAIL: 10-run persistent-caliber sha256 not identical' }
"determinism=0 (10/10 identical, persistent caliber)" | Out-File "$out\determinism.txt" -Append -Encoding utf8

# 输出不变门：同 VM 分支产物 vs 签署基线，全 run 序列零差异硬门（与第一批同门重跑）。
S 'golden-export' { pnpm -C $branch --filter @wenshu/pdf-export export:baseline --out "$out\golden" --label wenshu-poc-a-win11 --browser $e --fixture "$branch\docs\poc-a\fixtures\golden-report.md" --fixture-root "$branch\docs\poc-a\fixtures" --template "$branch\docs\poc-a\fixtures\formal-business.template.json" }
S 'golden-equivalence' { node "$branch\packages\pdf-export\scripts\a04e2a-signed-baseline-compare.ts" "$out\golden\golden-report-baseline.pdf" }
$goldenSha = (node "$branch\tools\a-04e\normalized-pdf-sha.mjs" "$out\golden\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
$signedSha = (node "$branch\tools\a-04e\normalized-pdf-sha.mjs" "$branch\packages\pdf-evidence\fixtures\baseline\golden-report-baseline.pdf") -split '\s+' | Select-Object -First 1
"golden-normalized-sha256=$goldenSha" | Out-File "$out\summary.txt" -Append -Encoding utf8
"signed-baseline-normalized-sha256=$signedSha" | Out-File "$out\summary.txt" -Append -Encoding utf8
if ($goldenSha -ne $signedSha) { "normalized-sha differs from signed baseline: expected (incremental-update structure from backfill/repair/stamp chain; run-sequence equivalence gate is the visual-invariance evidence)" | Out-File "$out\summary.txt" -Append -Encoding utf8 }
if ($script:failed) { Fail-Stop 'FAILED at golden equivalence gate (see golden-equivalence.log)' }

# 交叉校验门（§5.1 约束③④ VM 侧）：冷启对=两次独立 CLI golden 导出（同内容冷启形态），
# 会话对=本批正式 02/03 产物。新口径在冷启对上的判定必须与签署口径一致；会话对必须判等；
# 校验器内含 M1 换指/M2 删节点/M3 增节点决定性反例（必须判不等）。
S 'golden-export-2' { pnpm -C $branch --filter @wenshu/pdf-export export:baseline --out "$out\golden-2" --label wenshu-poc-a-win11 --browser $e --fixture "$branch\docs\poc-a\fixtures\golden-report.md" --fixture-root "$branch\docs\poc-a\fixtures" --template "$branch\docs\poc-a\fixtures\formal-business.template.json" }
S 'verify-caliber' { node "$branch\tools\a-04e\verify-persistent-caliber.mjs" --session "$out\persistent\runs\02\golden-report-baseline.pdf" "$out\persistent\runs\03\golden-report-baseline.pdf" --cold "$out\golden\golden-report-baseline.pdf" "$out\golden-2\golden-report-baseline.pdf" }
if ($script:failed) { Fail-Stop 'FAILED at caliber cross-validation gate (see verify-caliber.log)' }

# 批后标定门：批末机器仍在签署带内，批次定量结果才有效。
S 'calibrate-post' { pnpm -C $main --filter @wenshu/pdf-export export:baseline --out "$out\calibrate-post" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template }
$cal2 = (Get-Content "$out\calibrate-post\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs
"calibrate-post-renderMs=$cal2 gate=[$calMinMs,$calMaxMs] (signed band)" | Out-File "$out\calibration.txt" -Append -Encoding utf8
if ($cal2 -lt $calMinMs -or $cal2 -gt $calMaxMs) { Fail-Stop "CALIBRATION_DIVERGED_POST: renderMs=$cal2 outside signed band; batch quantitative results invalid, raw evidence retained" }

S 'anchor' { "main=$mainHead`nbranch=$branchHead" | Tee-Object "$out\anchor.txt" }
if (-not $budgetMet) { Fail-Stop "BUDGET_NOT_MET: p95(totalMs formal)=$p95 > $budgetP95Ms (decision #18 D3: no DEGRADE, report as-is; all other gates executed, see summary/determinism/calibration)" }
if (-not $script:failed) { New-Item -ItemType File "$out\DONE" -Force | Out-Null } else { 'FAILED (raw logs retained; no DONE marker)' | Out-File "$out\STATUS.txt" -Encoding utf8 }
