# vm-chain-depth-check.ps1 — A-04E-2a VM 批次前置（宿主机上运行，需管理员 + Hyper-V PS 模块）。
# 用途：实测 wenshu-poc-a-win11 全部虚拟盘的差分链深度。2a 正式批次只在链深=1
# （单一 VHDX、无父盘）时有效——7 层差分盘曾使批次结果与签署带不可比（阶段一实证）。
# 用法（VM 关机状态）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\a-04e\vm-chain-depth-check.ps1
# 退出码 0 = 全部盘链深 1；1 = 存在更深链（输出塌链指引，批次不得启动）。
# 塌链后操作顺序（强制）：本检查通过 → 启动 VM → VM 内立即写同次引导 attest 文件：
#   Set-Content C:\wenshu-payload\CHAIN-DEPTH-1.txt "depth=1 attested $(Get-Date -Format s)"
# → 再启动批次（vm-single-pass.ps1 校验 attest 文件新于上次引导时间，缺/旧即拒跑）。
$ErrorActionPreference = 'Stop'
$vmName = 'wenshu-poc-a-win11'

$vm = Get-VM -Name $vmName
$disks = Get-VMHardDiskDrive -VMName $vmName
if (-not $disks) { Write-Error "no hard disks on $vmName"; exit 1 }

$worst = 1
foreach ($disk in $disks) {
  $depth = 1
  $vhd = Get-VHD -Path $disk.Path
  $chain = @($vhd.Path)
  while ($vhd.ParentPath) {
    $depth += 1
    $vhd = Get-VHD -Path $vhd.ParentPath
    $chain += $vhd.Path
  }
  $sizeGB = [math]::Round((Get-Item $disk.Path).Length / 1GB, 2)
  "disk: $($disk.Path) (delta file ${sizeGB}GB) chain-depth=$depth"
  if ($depth -gt 1) { $chain | ForEach-Object { "  parent-chain: $_" } }
  if ($depth -gt $worst) { $worst = $depth }
}
"vm-state=$($vm.State) worst-chain-depth=$worst"
if ($worst -ne 1) {
  Write-Host 'FAIL: chain depth must be 1 for the A-04E-2a signed-comparability batch.'
  Write-Host 'Collapse on host (VM off): Hyper-V Manager > Edit Disk > Merge (to parent),'
  Write-Host 'or Remove checkpoints (Checkpoints > Delete subtree) and wait for merge;'
  Write-Host 'then re-run this check before booting the VM.'
  exit 1
}
'PASS: all disks at chain depth 1. Boot the VM, write CHAIN-DEPTH-1.txt (see header), then run the batch.'
exit 0
