$ErrorActionPreference='Continue'; $out='C:\wenshu-out\pa-13\final-v6'; $p='C:\wenshu-payload'; $r="$p\wenshu"; $e='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; $script:failed=$false
if(Test-Path $out){throw 'existing final evidence'}; New-Item -ItemType Directory -Force $out|Out-Null
$env:PATH="$p\bin;$p\node;"+$env:PATH; $env:COREPACK_HOME="$p\corepack"; $env:PNPM_STORE_DIR="$p\store"; Set-Location $r
function S($n,[scriptblock]$b){&$b *>&1|Out-File "$out\$n.log" -Encoding utf8; "$n=$LASTEXITCODE"|Out-File "$out\results.txt" -Append -Encoding utf8; if($LASTEXITCODE -ne 0){$script:failed=$true}}
S 'install' {pnpm install --frozen-lockfile --store-dir "$p\store"}
S 'environment-check' {pnpm environment:check}
Copy-Item "$r\artifacts\reference-machine\environment.win11.json" "$out\environment.win11.json" -ErrorAction Stop
S 'build-input' {node packages/report-checks/scripts/build-pa13-performance-input.ts --out "$out\input" --repetitions 280}
S 'warmup' {pnpm --filter @wenshu/pdf-export export:baseline --out "$out\warmup" --label wenshu-poc-a-win11 --browser $e --fixture "$out\input\pa-13-performance-30-page.md" --fixture-root "$out\input" --template "$out\input\formal-business.template.json"}
1..10|ForEach-Object{$i=$_; S "run-$i" {pnpm --filter @wenshu/pdf-export export:baseline --out "$out\runs\$i" --label wenshu-poc-a-win11 --browser $e --fixture "$out\input\pa-13-performance-30-page.md" --fixture-root "$out\input" --template "$out\input\formal-business.template.json"}}
S 'cancellation-tests' {pnpm --filter @wenshu/pdf-export exec node --test --test-concurrency=1 test/cancellation.render.test.ts}
if(-not $script:failed){S 'independent-replay' {node packages/report-checks/scripts/audit-pa13-batch.ts --batch $out}}
Get-FileHash "$out\input\pa-13-performance-30-page.md" -Algorithm SHA256|Out-File "$out\source-hash.txt"; Get-Content .git\HEAD|Out-File "$out\anchor.txt"
if(-not $script:failed){New-Item -ItemType File "$out\DONE" -Force|Out-Null}else{'FAILED (raw logs retained; no DONE marker)'|Out-File "$out\STATUS.txt" -Encoding utf8}
shutdown /s /t 60 /f
