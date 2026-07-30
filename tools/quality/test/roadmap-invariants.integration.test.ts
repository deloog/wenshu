/**
 * Integration: the gate against the real roadmap and the real audits
 * directory. Zero findings, parse counts at or above the registered
 * floors, and zero unparsed rows. The registry liveness invariants
 * (deviations live, exceptions present, exempt rows genuinely reportless,
 * historical waves existing) are enforced by the gate itself.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  checkRoadmapInvariants,
  formatRoadmapCounts,
} from "../src/roadmap-invariants.ts";
import { ROADMAP_REGISTRY } from "../src/roadmap-registry.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const ROADMAP = resolve(workspaceRoot, "docs/implementation-roadmap.md");

test("real roadmap passes all ten judgments with counts at or above floors", async () => {
  const result = await checkRoadmapInvariants(ROADMAP);
  console.log(formatRoadmapCounts(result));
  const floors = ROADMAP_REGISTRY.parseCountFloors;
  assert.ok(result.counts.tasks >= floors.tasks);
  assert.ok(result.counts.dependencyEdges >= floors.dependencyEdges);
  assert.ok(result.counts.requirementIds >= floors.requirementIds);
  assert.ok(result.counts.ledgerEntries >= floors.ledgerEntries);
  assert.ok(result.counts.criticalPathEdges >= floors.criticalPathEdges);
  assert.ok(result.counts.waveGroups >= floors.waveGroups);
  assert.equal(result.unparsedRows, 0);
  assert.deepEqual(result.findings, []);
});
