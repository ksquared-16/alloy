#!/usr/bin/env node
/**
 * Gateway V2 — bounded last-instruction persistence (operator interaction state).
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { outputFingerprint } from "../lib/vacilando/lanes.mjs";
import {
  LANE_RUNTIME_MAX_LANES,
  attachLaneInstructions,
  maybeSetSendBaseline,
  publicLastInstruction,
  readLaneInstruction,
  recordDeliveredInstruction,
} from "../lib/vacilando/lane-runtime.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-lane-runtime-"));

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

await test("successful send records latest instruction", () => {
  const out = recordDeliveredInstruction("alloy-identity", {
    instruction: "Reconcile remaining tests.",
    delivered_at: "2026-08-17T20:00:00.000Z",
    status: "delivered",
    instruction_size: 26,
  }, ROOT);
  assert.equal(out.ok, true);
  const rec = readLaneInstruction("alloy-identity", ROOT);
  assert.equal(rec.instruction, "Reconcile remaining tests.");
  assert.equal(rec.status, "delivered");
  assert.equal(rec.delivered_at, "2026-08-17T20:00:00.000Z");
});

await test("failed / refused send does not record", () => {
  const before = readLaneInstruction("alloy-identity", ROOT);
  const refused = recordDeliveredInstruction("alloy-identity", {
    instruction: "should not store",
    status: "refused",
    delivered_at: "2026-08-17T20:01:00.000Z",
  }, ROOT);
  assert.equal(refused.ok, false);
  assert.equal(readLaneInstruction("alloy-identity", ROOT).instruction, before.instruction);
});

await test("latest instruction survives reread and is lane-scoped", () => {
  recordDeliveredInstruction("alloy-other", {
    instruction: "only other",
    status: "delivered",
    delivered_at: "2026-08-17T20:02:00.000Z",
  }, ROOT);
  assert.equal(readLaneInstruction("alloy-identity", ROOT).instruction, "Reconcile remaining tests.");
  assert.equal(readLaneInstruction("alloy-other", ROOT).instruction, "only other");
  const lanes = attachLaneInstructions([
    { lane_id: "alloy-identity", label: "A" },
    { lane_id: "alloy-other", label: "B" },
  ], ROOT);
  assert.equal(lanes[0].last_instruction.instruction, "Reconcile remaining tests.");
  assert.equal(lanes[1].last_instruction.instruction, "only other");
});

await test("bounded persistence prunes oldest lanes", () => {
  const root = mkdtempSync(join(tmpdir(), "vac-lane-runtime-prune-"));
  for (let i = 0; i < LANE_RUNTIME_MAX_LANES + 4; i++) {
    const id = `alloy-t${i}`;
    recordDeliveredInstruction(id, {
      instruction: `n${i}`,
      status: "delivered",
      delivered_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    }, root);
  }
  assert.equal(readLaneInstruction("alloy-t0", root), null);
  assert.ok(readLaneInstruction(`alloy-t${LANE_RUNTIME_MAX_LANES + 3}`, root));
});

await test("send baseline fingerprint then change is activity evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "vac-lane-runtime-fp-"));
  recordDeliveredInstruction("alloy-identity", {
    instruction: "go",
    status: "delivered",
    delivered_at: new Date(1_700_000_000_000).toISOString(),
  }, root);
  const fp1 = outputFingerprint("paste visible");
  const after = maybeSetSendBaseline("alloy-identity", fp1, 1_700_000_000_000 + 2000, root);
  assert.equal(after.output_fingerprint_at_send, fp1);
  const again = maybeSetSendBaseline("alloy-identity", outputFingerprint("later"), 1_700_000_000_000 + 4000, root);
  assert.equal(again.output_fingerprint_at_send, fp1, "baseline must not be overwritten");
});

await test("public record never includes Claude transcript fields", () => {
  const rec = publicLastInstruction({
    instruction: "hi",
    status: "delivered",
    delivered_at: "2026-08-17T20:00:00.000Z",
    transcript: "secret",
    messages: [],
  });
  assert.deepEqual(Object.keys(rec).sort(), [
    "delivered_at",
    "instruction",
    "instruction_size",
    "output_fingerprint_at_send",
    "status",
  ]);
  const store = JSON.parse(readFileSync(join(ROOT, "vacilando/lane-runtime/sends.json"), "utf8"));
  assert.equal(store.schema_version, "vacilando.lane.runtime.v1");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
