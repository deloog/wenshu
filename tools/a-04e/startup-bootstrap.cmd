@echo off
rem A-04E VM bootstrap entry: copied into the VM user Startup folder at payload injection time.
rem %~dp0 would resolve to the Startup folder, so the script path MUST be absolute.
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\wenshu-payload\vm-decomposition.ps1" > C:\wenshu-bootstrap-a04e.log 2>&1
