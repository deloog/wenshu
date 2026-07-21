import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { statfsSync } from "node:fs";
import { arch, cpus, platform, release, totalmem, version } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { FIXTURE_MANIFEST_SHA256 } from "@wenshu/fixtures";
import { FONT_MANIFEST_SHA256 } from "@wenshu/fonts";

import { EnvironmentEvidenceError } from "./errors.ts";
import { parseMachineEvidence } from "./evidence.ts";
import type { MachineEvidence } from "./types.ts";

const execFileAsync = promisify(execFile);

const DISPLAY_PROBE_SCRIPT =
  "$ErrorActionPreference='Stop'; " +
  "$dpi=$null; " +
  "try { $dpi=[int](Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' " +
  "-Name AppliedDPI -ErrorAction Stop).AppliedDPI } catch {}; " +
  "if (-not $dpi) { $dpi=[int](Get-CimInstance Win32_DesktopMonitor | " +
  "Where-Object { $_.PixelsPerXLogicalInch -gt 0 } | Select-Object -First 1)" +
  ".PixelsPerXLogicalInch }; " +
  "if (-not $dpi) { throw 'system dpi unavailable' }; " +
  "$v=Get-CimInstance Win32_VideoController | " +
  "Where-Object { $_.CurrentHorizontalResolution -gt 0 } | Select-Object -First 1; " +
  "[pscustomobject]@{dpi=$dpi; width=[int]$v.CurrentHorizontalResolution; " +
  "height=[int]$v.CurrentVerticalResolution} | ConvertTo-Json -Compress";

interface DisplayProbeResult {
  readonly width_px: number;
  readonly height_px: number;
  readonly scale_percent: number;
  readonly dpi: number;
}

function parseDisplayProbe(stdout: string): DisplayProbeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "display probe did not return JSON",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "display probe returned an unexpected shape",
    );
  }
  const record = parsed as Record<string, unknown>;
  const { dpi, width, height } = record;
  if (
    typeof dpi !== "number" ||
    !Number.isSafeInteger(dpi) ||
    dpi < 24 ||
    typeof width !== "number" ||
    !Number.isSafeInteger(width) ||
    width < 1 ||
    typeof height !== "number" ||
    !Number.isSafeInteger(height) ||
    height < 1
  ) {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "display probe returned invalid values",
    );
  }
  return Object.freeze({
    width_px: width,
    height_px: height,
    scale_percent: Math.round((dpi / 96) * 100),
    dpi,
  });
}

async function probeWindowsDisplay(): Promise<DisplayProbeResult> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", DISPLAY_PROBE_SCRIPT],
      { timeout: 30_000, maxBuffer: 64 * 1024 },
    );
    stdout = result.stdout;
  } catch {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "display probe could not be executed",
    );
  }
  return parseDisplayProbe(stdout);
}

async function readPnpmVersion(repositoryRoot: string): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  } catch {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "repository package manifest cannot be read",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "repository package manifest is invalid",
    );
  }
  const manager = (parsed as Record<string, unknown>)["packageManager"];
  if (typeof manager !== "string" || !manager.startsWith("pnpm@")) {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "repository package manager pin is invalid",
    );
  }
  return manager.slice("pnpm@".length);
}

function diskMountFor(root: string): string {
  if (platform() === "win32") {
    const drive = /^[A-Za-z]:/u.exec(root)?.[0];
    if (drive === undefined) {
      throw new EnvironmentEvidenceError(
        "ENV_PROBE_FAILED",
        "repository root has no drive mount",
      );
    }
    return `${drive.toUpperCase()}\\`;
  }
  return "/";
}

export async function collectMachineEvidence(
  repositoryRoot: string,
  machineLabel: string,
): Promise<MachineEvidence> {
  if (platform() !== "win32") {
    throw new EnvironmentEvidenceError(
      "ENV_PLATFORM_UNSUPPORTED",
      "machine evidence collection requires the Windows reference machine",
    );
  }
  const root = resolve(repositoryRoot);
  const [display, pnpm] = await Promise.all([
    probeWindowsDisplay(),
    readPnpmVersion(root),
  ]);
  const processor = cpus()[0];
  if (processor === undefined) {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "machine cpu cannot be inspected",
    );
  }
  let stats: ReturnType<typeof statfsSync>;
  try {
    stats = statfsSync(root);
  } catch {
    throw new EnvironmentEvidenceError(
      "ENV_PROBE_FAILED",
      "repository disk cannot be inspected",
    );
  }
  return parseMachineEvidence({
    schema_version: "0.1.0",
    evidence_id: "wenshu.reference-machine",
    recorded_at: new Date().toISOString(),
    machine_label: machineLabel,
    os: Object.freeze({
      platform: platform(),
      release: release(),
      version: version(),
      arch: arch(),
    }),
    cpu: Object.freeze({
      model: processor.model,
      logical_cores: cpus().length,
      speed_mhz: processor.speed,
    }),
    memory: Object.freeze({ total_bytes: totalmem() }),
    display,
    disk: Object.freeze({
      mount: diskMountFor(root),
      total_bytes: stats.bsize * stats.blocks,
      free_bytes: stats.bsize * stats.bavail,
    }),
    runtime: Object.freeze({ node: process.version, pnpm }),
    frozen_inputs: Object.freeze({
      fixture_manifest_sha256: FIXTURE_MANIFEST_SHA256,
      font_manifest_sha256: FONT_MANIFEST_SHA256,
    }),
  });
}
