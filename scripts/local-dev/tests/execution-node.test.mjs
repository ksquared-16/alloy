#!/usr/bin/env node
/**
 * Minimal execution Node identity — host-portable, not a cluster.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

process.env.VACILANDO_SKIP_NODE_PROBE = "1";
process.env.VACILANDO_NODE_NAME = "rehearsal-node";

const ROOT = mkdtempSync(join(tmpdir(), "vac-node-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const {
  NODE_ID_RE,
  ensureLocalNode,
  getLocalNode,
  localNodeId,
  publicExecutionNode,
  readExecutionNode,
  resetExecutionNodeForTests,
  resolveExecutionNodeRef,
  bindWorkerCliToGatewayRoot,
} = await import("../lib/vacilando/execution-node.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

await test("node id is stable across ensure calls", () => {
  resetExecutionNodeForTests(ROOT);
  const a = ensureLocalNode({ root: ROOT, name: "MacBook rehearsal" });
  assert.match(a.node_id, NODE_ID_RE);
  const b = ensureLocalNode({ root: ROOT, name: "MacBook rehearsal" });
  assert.equal(b.node_id, a.node_id);
  assert.equal(localNodeId(ROOT), a.node_id);
});

await test("node name is operator-readable and updatable without changing id", () => {
  resetExecutionNodeForTests(ROOT);
  const a = ensureLocalNode({ root: ROOT, name: "Kelly MacBook" });
  const b = ensureLocalNode({ root: ROOT, name: "Kelly Mac mini" });
  assert.equal(a.node_id, b.node_id);
  assert.equal(b.name, "Kelly Mac mini");
});

await test("local is an alias for the current node", () => {
  const id = localNodeId(ROOT);
  assert.equal(resolveExecutionNodeRef("local", ROOT), id);
  assert.equal(resolveExecutionNodeRef(id, ROOT), id);
});

await test("public node omits nothing identity-critical", () => {
  const pub = publicExecutionNode(getLocalNode(ROOT));
  assert.equal(pub.node_id, localNodeId(ROOT));
  assert.ok(pub.name);
  assert.ok(pub.runtime_root);
});

await test("missing store is reconstructed without inventing a second identity once written", () => {
  const first = localNodeId(ROOT);
  const raw = JSON.parse(readFileSync(join(ROOT, "vacilando", "node.json"), "utf8"));
  assert.equal(raw.node_id, first);
  const again = readExecutionNode(ROOT);
  assert.equal(again.node_id, first);
});

await test("worker CLI remaps the default toolkit root onto the Gateway store", () => {
  const prevA = process.env.ALLOY_RUNTIME_ROOT;
  const prevG = process.env.VACILANDO_GATEWAY_ROOT;
  try {
    process.env.ALLOY_RUNTIME_ROOT = join(homedir(), ".local", "state", "alloy-dev");
    delete process.env.VACILANDO_GATEWAY_ROOT;
    const root = bindWorkerCliToGatewayRoot();
    assert.equal(root, join(homedir(), ".local", "state", "alloy-dev", "gateway"));
    assert.equal(process.env.ALLOY_RUNTIME_ROOT, root);
  } finally {
    process.env.ALLOY_RUNTIME_ROOT = prevA;
    if (prevG == null) delete process.env.VACILANDO_GATEWAY_ROOT;
    else process.env.VACILANDO_GATEWAY_ROOT = prevG;
  }
});

await test("worker CLI keeps an explicit fixture runtime root", () => {
  const prevA = process.env.ALLOY_RUNTIME_ROOT;
  try {
    process.env.ALLOY_RUNTIME_ROOT = ROOT;
    assert.equal(bindWorkerCliToGatewayRoot(), ROOT);
  } finally {
    process.env.ALLOY_RUNTIME_ROOT = prevA;
  }
});

rmSync(ROOT, { recursive: true, force: true });
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
