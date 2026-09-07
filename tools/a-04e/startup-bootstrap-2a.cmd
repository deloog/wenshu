@echo off
rem A-04E-2a VM bootstrap entry (phase 2: persistent-session steady-state batch).
rem Copied into the VM user Startup folder at payload injection time. Writes the same-boot
rem chain attest, then runs the persistent-session batch (vm-persistent-pass.ps1).
rem Phase 1 (single-pass CLI-form batch, vm-single-pass.ps1) completed as run-2a-8 on
rem 2026-09-07 with all gates green and BUDGET_NOT_MET registered per decision #18 D3.
rem Log target is C:\wenshu-out (writable by the auto-logon User session).
if not exist C:\wenshu-out mkdir C:\wenshu-out
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Content -Path 'C:\wenshu-payload\CHAIN-DEPTH-1.txt' -Value ('depth-delta-1 signed-config attested at ' + (Get-Date -Format o) + ' (bootstrap-written; host chain check passed at injection)')"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\wenshu-payload\wenshu\tools\a-04e\vm-persistent-pass.ps1" > "C:\wenshu-out\a-04e-2a-persistent-bootstrap.log" 2>&1
echo %errorlevel% > "C:\wenshu-out\a-04e-2a-persistent-bootstrap-exit.txt"
