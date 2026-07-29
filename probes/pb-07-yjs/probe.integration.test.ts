import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import * as Y from "yjs";

const NODE_ID = /^node_[0-9a-f]{32}$/;
const TRANSACTION_ID = /^tx_[a-z]+_[0-9]+$/;

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createReplica() {
  const document = new Y.Doc();
  document.getMap("nodes");
  document.getMap("transactions");
  return document;
}

function seed(document) {
  document.transact(() => {
    document.getMap("nodes").set("node_00000000000000000000000000000001", {
      id: "node_00000000000000000000000000000001",
      text: "initial",
    });
  }, "seed");
}

function applyOfflineEdit(document, transaction) {
  assert.match(transaction.transactionId, TRANSACTION_ID);
  assert.equal(transaction.affectedNodeIds.length, 1);
  for (const nodeId of transaction.affectedNodeIds) assert.match(nodeId, NODE_ID);

  document.transact(() => {
    const nodes = document.getMap("nodes");
    if (transaction.kind === "rewrite") {
      const node = nodes.get(transaction.nodeId);
      assert.notEqual(node, undefined);
      nodes.set(transaction.nodeId, { id: transaction.nodeId, text: transaction.text });
    } else {
      assert.equal(nodes.has(transaction.nodeId), false);
      nodes.set(transaction.nodeId, { id: transaction.nodeId, text: transaction.text });
    }
    document.getMap("transactions").set(transaction.transactionId, {
      transactionId: transaction.transactionId,
      actor: transaction.actor,
      affectedNodeIds: transaction.affectedNodeIds,
      kind: transaction.kind,
    });
  }, transaction.transactionId);
}

function exchange(left, right) {
  Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
  Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
}

function state(document) {
  return {
    nodes: [...document.getMap("nodes").entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    transactions: [...document.getMap("transactions").entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  };
}

function assertStableMapping(document) {
  const nodes = document.getMap("nodes");
  for (const [, transaction] of document.getMap("transactions")) {
    assert.match(transaction.transactionId, TRANSACTION_ID);
    assert.equal(transaction.affectedNodeIds.length, 1);
    for (const nodeId of transaction.affectedNodeIds) {
      assert.match(nodeId, NODE_ID);
      assert.equal(nodes.has(nodeId), true);
    }
  }
}

function validateRecord(record, allowed, required) {
  assert.deepEqual(Object.keys(record).sort(), [...allowed].sort());
  for (const key of required) assert.notEqual(record[key], undefined);
}

function assertRecordIsolation(records) {
  validateRecord(
    records.editHistory,
    ["actor", "affectedNodeIds", "command", "transactionId"],
    ["actor", "affectedNodeIds", "command", "transactionId"],
  );
  validateRecord(
    records.crdtMerge,
    ["candidate", "mergeId", "stateVectorDigest", "updateDigest"],
    ["candidate", "mergeId", "stateVectorDigest", "updateDigest"],
  );
  validateRecord(
    records.semanticAudit,
    ["action", "actor", "eventId", "locator"],
    ["action", "actor", "eventId", "locator"],
  );
}

test("two offline replicas converge and retain node-to-transaction mapping", () => {
  const seedReplica = createReplica();
  seed(seedReplica);
  const replicaA = createReplica();
  const replicaB = createReplica();
  Y.applyUpdate(replicaA, Y.encodeStateAsUpdate(seedReplica));
  Y.applyUpdate(replicaB, Y.encodeStateAsUpdate(seedReplica));

  applyOfflineEdit(replicaA, {
    transactionId: "tx_alice_1",
    actor: "human",
    kind: "rewrite",
    nodeId: "node_00000000000000000000000000000001",
    text: "alice offline rewrite",
    affectedNodeIds: ["node_00000000000000000000000000000001"],
  });
  applyOfflineEdit(replicaB, {
    transactionId: "tx_bob_1",
    actor: "ai",
    kind: "insert",
    nodeId: "node_00000000000000000000000000000002",
    text: "bob offline insert",
    affectedNodeIds: ["node_00000000000000000000000000000002"],
  });

  exchange(replicaA, replicaB);
  assert.deepEqual(state(replicaA), state(replicaB));
  assertStableMapping(replicaA);
  assertStableMapping(replicaB);
});

test("the three record schemas stay structurally isolated", () => {
  const stateVector = Y.encodeStateVector(createReplica());
  const records = {
    editHistory: {
      transactionId: "tx_alice_1",
      actor: "human",
      command: "rewrite",
      affectedNodeIds: ["node_00000000000000000000000000000001"],
    },
    crdtMerge: {
      mergeId: "merge_0001",
      candidate: "yjs@13.6.27",
      stateVectorDigest: digest(stateVector),
      updateDigest: digest(Y.encodeStateAsUpdate(createReplica())),
    },
    semanticAudit: {
      eventId: "audit_0001",
      actor: "user",
      action: "ai_change_decided",
      locator: { kind: "node", nodeId: "node_00000000000000000000000000000001" },
    },
  };
  assertRecordIsolation(records);
  assert.throws(
    () =>
      assertRecordIsolation({
        ...records,
        semanticAudit: { ...records.semanticAudit, transactionId: "tx_alice_1" },
      }),
    /Expected values to be strictly deep-equal/,
  );

  const schema = JSON.parse(
    readFileSync(new URL("./records.schema.json", import.meta.url), "utf8"),
  );
  const definitions = schema.$defs;
  const layers = [
    definitions.edit_history,
    definitions.crdt_merge,
    definitions.semantic_audit,
  ];
  for (const layer of layers) assert.equal(layer.additionalProperties, false);
  assert.equal("transactionId" in definitions.semantic_audit.properties, false);
  assert.equal("updateDigest" in definitions.edit_history.properties, false);
  assert.equal("updateDigest" in definitions.semantic_audit.properties, false);
  assert.equal("locator" in definitions.crdt_merge.properties, false);
});
