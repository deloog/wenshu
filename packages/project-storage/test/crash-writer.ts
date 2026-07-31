import { writeSync } from "node:fs";

import { atomicWriteFile } from "../src/index.ts";

/**
 * PB-10 crash-test child process. Performs real atomic writes and reports
 * real phases on stdout; when the kill phase is reached it blocks the event
 * loop so the parent can SIGKILL it at that exact point. No mocking: every
 * file-system step really executes.
 */
const [root, killPhase, sizeArgument] = process.argv.slice(2);
if (root === undefined || killPhase === undefined || sizeArgument === undefined) {
  throw new Error("usage: crash-writer.ts <root> <kill-phase> <size>");
}
const size = Number.parseInt(sizeArgument, 10);

function report(phase: string): void {
  writeSync(1, `PHASE ${phase}\n`);
}

function blockEventLoop(milliseconds: number): void {
  const cell = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(cell, 0, 0, milliseconds);
}

const target = `${root}/artifact.bin`;
await atomicWriteFile(target, Buffer.alloc(1024, 0x41));
await atomicWriteFile(target, Buffer.alloc(size, 0x42), {
  onPhase: (phase) => {
    report(phase);
    if (phase === killPhase) {
      blockEventLoop(15000);
    }
  },
});
writeSync(1, "DONE\n");
