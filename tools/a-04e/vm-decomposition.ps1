# A-04E stage-1 Chromium decomposition batch (decision #18: D1=phased, D2=evaluation-only).
# Runs INSIDE the Win11 reference VM (wenshu-poc-a-win11) via User Startup autologon.
# NEVER run on the host: guarded by INSIDE-VM.txt marker; ends with shutdown.
# Anchor: payload clone HEAD, recorded to anchor.txt at the end.
# Calibration gate constants: PA-13 final-v6 signed batch renderMs observed min/max
# (artifacts/perf/2026-07-29-PA-13-final-v6-user-startup runs/5=20553.4, runs/8=24300.2).
$ErrorActionPreference = 'Continue'
$out = 'C:\wenshu-out\a-04e\decomposition-v1'
$p = 'C:\wenshu-payload'
$r = "$p\wenshu"
$e = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$script:failed = $false
$calMinMs = 20553.4
$calMaxMs = 24300.2
# Input identity: sha256 of the PA-13 final-v6 signed 30-page input.
$expectedInputSha = '4dedb1c2dee256c1f929f54a0e7922eb66daea072df8567cc129e331c25b6258'

function Fail-Stop($msg) {
  $msg | Out-File "$out\STATUS.txt" -Encoding utf8
  shutdown /s /t 60 /f
  exit 1
}

if (-not (Test-Path "$p\INSIDE-VM.txt")) { throw 'refuse: INSIDE-VM marker missing (host safety guard)' }
if (Test-Path $out) { throw "existing a-04e evidence: $out" }
New-Item -ItemType Directory -Force $out | Out-Null
$env:PATH = "$p\bin;$p\node;" + $env:PATH
$env:COREPACK_HOME = "$p\corepack"
$env:PNPM_STORE_DIR = "$p\store"
Set-Location $r
function S($n, [scriptblock]$b) {
  & $b *>&1 | Out-File "$out\$n.log" -Encoding utf8
  "$n=$LASTEXITCODE" | Out-File "$out\results.txt" -Append -Encoding utf8
  if ($LASTEXITCODE -ne 0) { $script:failed = $true }
}

S 'node-version' { node --version }
if (-not (Get-Content "$out\node-version.log" -Raw).Contains('v24.17.0')) { Fail-Stop 'FAILED: node is not v24.17.0 (payload runtime anchor broken)' }
S 'pnpm-version' { pnpm --version }
S 'edge-version' { (Get-Item $e).VersionInfo.ProductVersion; $global:LASTEXITCODE = 0 }
S 'install' { pnpm install --frozen-lockfile --store-dir "$p\store" }
S 'environment-check' { pnpm environment:check }
Copy-Item "$r\artifacts\reference-machine\environment.win11.json" "$out\environment.win11.json" -ErrorAction Stop

# Batch machine evidence (A-04 task book section 6 four-step protocol, in-VM form):
# record with --out rename, move into batch dir immediately, git status must be empty, environment:check re-run.
S 'env-record' { pnpm env:record --label wenshu-poc-a-win11 --out environment.a-04e.json }
if (-not (Test-Path "$r\artifacts\reference-machine\environment.a-04e.json")) { Fail-Stop 'FAILED: env:record produced no output' }
Move-Item "$r\artifacts\reference-machine\environment.a-04e.json" "$out\environment.a-04e.json" -ErrorAction Stop
S 'env-record-clean' { $st = git status --short artifacts/reference-machine/; $st; if ($st) { $global:LASTEXITCODE = 1 } }
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

# Calibration gate (auditor boundary 2, hardened by implementer): instrumented renderMs must
# reproduce the PA-13 observed range BEFORE any decomposition run is issued; diverge = stop, no conclusions.
$cal = (Get-Content "$out\calibrate\evidence.json" -Raw | ConvertFrom-Json).timings.renderMs
"calibrate-renderMs=$cal gate=[$calMinMs,$calMaxMs] (PA-13 final-v6 observed min/max)" | Out-File "$out\calibration.txt" -Encoding utf8
if ($cal -lt $calMinMs -or $cal -gt $calMaxMs) { Fail-Stop "CALIBRATION_DIVERGED: renderMs=$cal outside [$calMinMs,$calMaxMs]; no decomposition runs issued" }

1..10 | ForEach-Object { $i = $_; S "run-$i" { pnpm --filter @wenshu/pdf-export export:baseline --out "$out\runs\$i" --label wenshu-poc-a-win11 --browser $e --fixture $fixture --fixture-root "$out\input" --template $template } }
if (-not $script:failed) { S 'independent-replay' { node packages/report-checks/scripts/audit-pa13-batch.ts --batch $out } }
git rev-parse HEAD | Out-File "$out\anchor.txt" -Encoding utf8
if (-not $script:failed) { New-Item -ItemType File "$out\DONE" -Force | Out-Null } else { 'FAILED (raw logs retained; no DONE marker)' | Out-File "$out\STATUS.txt" -Encoding utf8 }
shutdown /s /t 60 /f
