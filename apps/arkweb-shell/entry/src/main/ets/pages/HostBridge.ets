/**
 * PA-14H only exposes the v0 registry. Concrete capability payload schemas are
 * intentionally absent, so every capability remains explicitly unsupported.
 */
const CAPABILITIES: Array<string> = [
  'project.directory.select', 'project.directory.authorize',
  'project.save.atomic', 'project.save.as', 'project.backup.create',
  'project.backup.restore', 'file.import.select', 'file.export.write',
  'print.pdf.export', 'font.catalog.list', 'font.catalog.check',
  'window.control', 'clipboard.text.write', 'share.invoke',
  'link.open.external', 'secret.credential.manage',
  'secret.credential.status', 'platform.info.read'
];

interface Limits {
  max_concurrent_requests: number;
  timeout_ms: number;
  max_payload_bytes: number;
}

interface Fallback {
  strategy: string;
  reason_code: string;
}

interface Capability {
  name: string;
  capability_version: string;
  support_status: string;
  permission_status: string;
  input_schema: string;
  output_schema: string;
  limits: Limits;
  lifecycle: string;
  cancellation: string;
  progress: string;
  error_codes: Array<string>;
  fallback: Fallback;
}

interface Registry {
  protocol_version: string;
  kind: string;
  host_kind: string;
  host_version: string;
  instance_id: string;
  capabilities: Array<Capability>;
}

function declaration(name: string): Capability {
  return {
    name,
    capability_version: '0.1.0',
    support_status: 'unsupported',
    permission_status: 'not_applicable',
    input_schema: `wenshu.host.input.${name}/0.1.0`,
    output_schema: `wenshu.host.output.${name}/0.1.0`,
    limits: { max_concurrent_requests: 1, timeout_ms: 300000, max_payload_bytes: 0 },
    lifecycle: 'request', cancellation: 'none', progress: 'none',
    error_codes: ['HOST_UNSUPPORTED'],
    fallback: { strategy: 'read_only', reason_code: 'PA14H_OUT_OF_SCOPE' }
  };
}

export class HostBridge {
  registry(): string {
    const registry: Registry = {
      protocol_version: '0.1.0',
      kind: 'registry',
      host_kind: 'arkweb',
      host_version: '6.1.1.290',
      instance_id: 'host_14a00000000000000000000000000000',
      capabilities: CAPABILITIES.map(declaration)
    };
    return JSON.stringify(registry);
  }
}
