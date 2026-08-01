import { assert, base64Encode, e2eBridge, hostInvoke, sha256Hex } from "./bridge.ts";

/**
 * Save-loop scenario (`?mode=save-loop&previous=<sha256>`), PB-12 W3 chains
 * 4 and 6. The renderer alternately saves two deterministic ~4 MiB versions
 * through the real Host 0.2.0 project.save.atomic capability, chaining
 * expected_previous_sha256 from the host-confirmed digest, and reports one
 * NDJSON line per completed save. It never writes a summary: the W3
 * orchestrator SIGKILLs the process mid-flight (the 180 s watchdog in
 * e2e-main.cjs is the backstop).
 *
 * Payload is 2 MiB, not larger: the frozen Host 0.2.0 ContentBase64 schema
 * pattern exhausts V8's RegExp stack on ~4 MiB strings (measured), and the
 * schema is untouchable (PB-12 明确不做). 2 MiB saves still run back-to-back
 * (~100 ms duty cycle), so an arbitrary SIGKILL lands mid-save.
 */

const PAYLOAD_BYTES = 2 * 1024 * 1024;

interface LoopVersion {
  readonly name: "V1" | "V2";
  readonly base64: string;
  readonly sha256: string;
}

/** Version header line + deterministic repeated pattern, ~4 MiB total. */
function buildPayload(version: 1 | 2): Uint8Array {
  const header = new TextEncoder().encode(`# PB-12 save-loop version V${version}\n`);
  const bytes = new Uint8Array(PAYLOAD_BYTES);
  bytes.set(header);
  const stride = version === 1 ? 7 : 13;
  for (let index = header.length; index < bytes.length; index += 1) {
    bytes[index] = 65 + ((index * stride + version) % 26);
  }
  return bytes;
}

async function prepareVersion(version: 1 | 2): Promise<LoopVersion> {
  const bytes = buildPayload(version);
  return {
    name: version === 1 ? "V1" : "V2",
    base64: base64Encode(bytes),
    sha256: await sha256Hex(bytes),
  };
}

function successOutput(response: Record<string, unknown>, capability: string) {
  assert(
    response["kind"] === "success",
    `${capability} did not succeed: ${response["kind"]}`,
  );
  const output = response["output"];
  assert(typeof output === "object" && output !== null, `${capability} output missing`);
  return output as Record<string, unknown>;
}

export async function runSaveLoopScenario(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const previous = params.get("previous") ?? "";
  assert(
    previous === "" || /^[0-9a-f]{64}$/u.test(previous),
    `previous digest malformed: ${previous}`,
  );

  const selected = successOutput(
    await hostInvoke("project.directory.select", { purpose: "open_project" }),
    "project.directory.select",
  );
  const grantId = selected["grant_id"];
  assert(
    typeof grantId === "string" && grantId.startsWith("grant_"),
    "grant_id malformed",
  );

  const v1 = await prepareVersion(1);
  const v2 = await prepareVersion(2);
  let previousSha256: string | null = previous === "" ? null : previous;
  let ordinal = 0;

  for (;;) {
    const current = ordinal % 2 === 0 ? v1 : v2;
    const saved = successOutput(
      await hostInvoke("project.save.atomic", {
        grant_id: grantId,
        file_name: "document.json",
        content_base64: current.base64,
        content_sha256: current.sha256,
        expected_previous_sha256: previousSha256,
      }),
      "project.save.atomic",
    );
    assert(
      saved["sha256"] === current.sha256,
      "host-confirmed sha256 must equal the renderer webcrypto digest",
    );
    previousSha256 = current.sha256;
    ordinal += 1;
    await e2eBridge().report({
      type: "save-loop",
      version: current.name,
      ordinal,
      sha256: current.sha256,
      bytes: PAYLOAD_BYTES,
    });
  }
}
