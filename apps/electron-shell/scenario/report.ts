/** Per-chain result recording: failures are always surfaced, never swallowed. */

export interface ChainResult {
  readonly id: string;
  readonly status: "pass" | "fail";
  readonly detail: string;
}

export class ChainFailed extends Error {
  public constructor(public readonly chainId: string) {
    super(`chain failed: ${chainId}`);
  }
}

/**
 * Records one result per chain step. A failing step is recorded with its real
 * error and then aborts the remaining dependent steps via ChainFailed.
 */
export class ChainRecorder {
  readonly #results: ChainResult[] = [];

  public get results(): readonly ChainResult[] {
    return this.#results;
  }

  public async step(id: string, run: () => Promise<string> | string): Promise<void> {
    try {
      const detail = await run();
      this.#results.push(Object.freeze({ id, status: "pass" as const, detail }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#results.push(Object.freeze({ id, status: "fail" as const, detail }));
      throw new ChainFailed(id);
    }
  }
}

export async function reportChain(result: ChainResult): Promise<void> {
  const { e2eBridge } = await import("./bridge.ts");
  await e2eBridge().report({ type: "chain", ...result });
}

export async function reportAll(results: readonly ChainResult[]): Promise<void> {
  for (const result of results) {
    await reportChain(result);
  }
}

export async function reportSummary(payload: Record<string, unknown>): Promise<void> {
  const { e2eBridge } = await import("./bridge.ts");
  await e2eBridge().report({ type: "summary", ...payload });
}
