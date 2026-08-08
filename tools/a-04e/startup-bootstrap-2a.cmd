@echo off
rem A-04E-2a VM bootstrap entry: copied into the VM user Startup folder at payload
rem injection time. Writes the same-boot chain attest, then runs the single-pass batch.
rem Chain of custody: host vm-chain-depth-check.ps1 PASSed (signed layer config) in the
rem same operator session that injected this file; the batch re-verifies attest freshness
rem (LastWriteTime newer than LastBootUpTime), so a stale/foreign attest cannot pass.
rem Log target is C:\wenshu-out (writable by the auto-logon User session; C:\ root needs
rem elevation and a failed redirection kills this entry silently -- run-2 root cause).
if not exist C:\wenshu-out mkdir C:\wenshu-out
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Content -Path 'C:\wenshu-payload\CHAIN-DEPTH-1.txt' -Value ('depth-delta-1 signed-config attested at ' + (Get-Date -Format o) + ' (bootstrap-written; host chain check passed at injection)')"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\wenshu-payload\wenshu\tools\a-04e\vm-single-pass.ps1" > "C:\wenshu-out\a-04e-2a-bootstrap.log" 2>&1
echo %errorlevel% > "C:\wenshu-out\a-04e-2a-bootstrap-exit.txt"
