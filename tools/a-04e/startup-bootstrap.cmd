@echo off
rem A-04E VM bootstrap entry: copied into the VM user Startup folder at payload injection time.
rem %~dp0 would resolve to the Startup folder, so the script path MUST be absolute.
rem Log target MUST NOT be C:\ root: creating files there requires an elevated token,
rem and a failed redirection kills this entry silently (run-2 root cause, 2026-08-06).
rem C:\wenshu-out is writable by the auto-logon User session (proven by PA-13 batch).
if not exist C:\wenshu-out mkdir C:\wenshu-out
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\wenshu-payload\vm-decomposition.ps1" > "C:\wenshu-out\a-04e-bootstrap.log" 2>&1
echo %errorlevel% > "C:\wenshu-out\a-04e-bootstrap-exit.txt"
