$ErrorActionPreference = 'Continue'
$out = 'C:\wenshu-out\pa-13\calibration-v2'
$payload = 'C:\wenshu-payload'
$repo = "$payload\wenshu"
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$script:failed = $false

if (Test-Path $out) {
  throw "PA-13 calibration output already exists: $out"
}
New-Item -ItemType Directory -Force $out | Out-Null
$env:PATH = "$payload\bin;$payload\node;" + $env:PATH
$env:COREPACK_HOME = "$payload\corepack"
$env:PNPM_STORE_DIR = "$payload\store"
Set-Location $repo

function Step($name, [scriptblock]$block) {
  & $block *>&1 | Out-File "$out\$name.log" -Encoding utf8
  "$name=$LASTEXITCODE" | Out-File "$out\results.txt" -Append -Encoding utf8
  if ($LASTEXITCODE -ne 0) { $script:failed = $true }
}

Step 'node-version' { node --version }
Step 'pnpm-version' { pnpm --version }
Step 'edge-version' { & $edge --version }
Step 'install' { pnpm install --frozen-lockfile --store-dir "$payload\store" }
Step 'environment-check' { pnpm environment:check }
Copy-Item "$repo\artifacts\reference-machine\environment.win11.json" "$out\environment.win11.json" -ErrorAction Stop
Step 'build-input' { node packages/report-checks/scripts/build-pa13-performance-input.ts --out "$out\input" }
Step 'export' {
  pnpm --filter @wenshu/pdf-export export:baseline --out "$out\export" `
    --label wenshu-poc-a-win11 --browser $edge `
    --fixture "$out\input\pa-13-performance-30-page.md" `
    --fixture-root "$out\input" --template "$out\input\formal-business.template.json"
}
Step 'source-hash' { Get-FileHash "$out\input\pa-13-performance-30-page.md" -Algorithm SHA256 }

if ($script:failed) {
  throw "PA-13 calibration contains failed steps; no DONE marker was issued"
}

$head = Get-Content "$repo\.git\HEAD" -Raw
Out-File "$out\anchor.txt" -InputObject $head -NoNewline
New-Item -ItemType File "$out\DONE" -Force | Out-Null
shutdown /s /t 60 /f
