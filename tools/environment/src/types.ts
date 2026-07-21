export interface MachineOs {
  readonly platform: "win32" | "linux" | "darwin";
  readonly release: string;
  readonly version: string;
  readonly arch: string;
}

export interface MachineCpu {
  readonly model: string;
  readonly logical_cores: number;
  readonly speed_mhz: number;
}

export interface MachineMemory {
  readonly total_bytes: number;
}

export interface MachineDisplay {
  readonly width_px: number;
  readonly height_px: number;
  readonly scale_percent: number;
  readonly dpi: number;
}

export interface MachineDisk {
  readonly mount: string;
  readonly total_bytes: number;
  readonly free_bytes: number;
}

export interface MachineRuntime {
  readonly node: string;
  readonly pnpm: string;
}

export interface FrozenInputs {
  readonly fixture_manifest_sha256: string;
  readonly font_manifest_sha256: string;
}

export interface MachineEvidence {
  readonly schema_version: "0.1.0";
  readonly evidence_id: "wenshu.reference-machine";
  readonly recorded_at: string;
  readonly machine_label: string;
  readonly os: MachineOs;
  readonly cpu: MachineCpu;
  readonly memory: MachineMemory;
  readonly display: MachineDisplay;
  readonly disk: MachineDisk;
  readonly runtime: MachineRuntime;
  readonly frozen_inputs: FrozenInputs;
}
