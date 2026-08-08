# vm-chain-depth-check.ps1 — A-04E-2a VM 批次前置（宿主机上运行，需管理员 + Hyper-V PS 模块）。
# 用途：实测 wenshu-ref-win11 全部虚拟盘的差分链层数，核验处于**签署层配置**：
# 基盘 + 恰一个活动差分盘（"深度 1"=单层 delta；pre-pa13 锚为基盘冻结态）。
# 依据：PA-13 签署批次（final-v6，标定带 [20553.4,24300.2] 来源）与 A-04E 阶段一
# 可比批次均运行于该配置（pre-pa13-calibration-20260729 快照与活动 avhdx 同秒
# 创建为直接证据；阶段一塌链移除 6 个 pre-a04e 快照后保留的正是此形态）。
# 7 层差分盘曾使结果与签署带不可比（阶段一实证）；层数 ≠ 2（基盘+1 delta）即拒。
# 用法（VM 关机状态）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\a-04e\vm-chain-depth-check.ps1
# 退出码 0 = 全部盘处于签署层配置；1 = 偏离（输出塌链指引，批次不得启动）。
# 塌链（仅在偏离时）：Hyper-V Manager 删除多余检查点子树并等合并完成，
# 保留 pre-pa13 锚；再跑本检查。通过后操作顺序：注入 payload → 启动 VM →
# VM 内同次引导 attest（CHAIN-DEPTH-1.txt）→ 跑批。
$ErrorActionPreference = 'Stop'
$vmName = 'wenshu-ref-win11'

$vm = Get-VM -Name $vmName
$disks = Get-VMHardDiskDrive -VMName $vmName
if (-not $disks) { Write-Error "no hard disks on $vmName"; exit 1 }

$signedLayers = 2  # 基盘 + 恰一个活动差分盘 = 签署层配置（见头部依据）
$ok = $true
foreach ($disk in $disks) {
  $layers = 1
  $vhd = Get-VHD -Path $disk.Path
  $chain = @($vhd.Path)
  while ($vhd.ParentPath) {
    $layers += 1
    $vhd = Get-VHD -Path $vhd.ParentPath
    $chain += $vhd.Path
  }
  $sizeGB = [math]::Round((Get-Item $disk.Path).Length / 1GB, 2)
  "disk: $($disk.Path) (active file ${sizeGB}GB) chain-layers=$layers (signed config=$signedLayers)"
  if ($layers -gt 2) { $chain | ForEach-Object { "  parent-chain: $_" } }
  if ($layers -ne $signedLayers) { $ok = $false }
}
# 孤儿差分盘检查：盘上 avhdx 数量必须恰为 1（多出=历史残留，层数语义不再干净）。
$avhdx = @(Get-ChildItem 'D:\VMs\wenshu-ref-win11\*.avhdx' -ErrorAction SilentlyContinue)
"avhdx-on-disk=$($avhdx.Count) (expected 1)"
if ($avhdx.Count -ne 1) { $ok = $false }
$snapshots = @(Get-VMSnapshot -VMName $vmName)
"snapshots=$($snapshots.Count): $($snapshots.Name -join ', ')"
"vm-state=$($vm.State)"
if (-not $ok) {
  Write-Host 'FAIL: disk chain is not at the signed layer configuration (base + exactly one delta).'
  Write-Host 'Collapse extra checkpoints (Hyper-V Manager > Delete subtree, keep the pre-pa13 anchor),'
  Write-Host 'wait for merge, then re-run this check before booting the VM.'
  exit 1
}
'PASS: signed layer configuration (base + exactly one delta). Inject payload, boot, attest this boot, then run the batch.'
exit 0
