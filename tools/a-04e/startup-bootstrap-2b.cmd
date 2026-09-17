@echo off
rem A-04E-2b VM bootstrap entry (incremental pagination batch).
rem Copied into the VM user Startup folder at payload injection time. Writes the same-boot
rem chain attest, then runs the incremental-session batch (vm-a04e2b-pass.ps1).
rem Log target is C:\wenshu-out (writable by the auto-logon User session).
if not exist C:\wenshu-out mkdir C:\wenshu-out
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Content -Path 'C:\wenshu-payload\CHAIN-DEPTH-1.txt' -Value ('depth-delta-1 signed-config attested at ' + (Get-Date -Format o) + ' (bootstrap-written; host chain check passed at injection)')"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\wenshu-payload\wenshu\tools\a-04e\vm-a04e2b-pass.ps1" > "C:\wenshu-out\a-04e-2b-bootstrap.log" 2>&1
echo %errorlevel% > "C:\wenshu-out\a-04e-2b-bootstrap-exit.txt"
