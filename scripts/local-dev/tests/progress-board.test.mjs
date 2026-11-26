/**
 * Progress board — normalize / persist / derive / presentation VM.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "vac-pb-"));
process.env.ALLOY_RUNTIME_ROOT = root;

const {
  normalizeProgressBoard,
  writeProgressBoard,
  readProgressBoard,
  progressBoardVm,
  deriveProgressBoardFromAssignments,
} = await import("../lib/vacilando/progress-board.mjs");

const sample = {
  headline: "Block A ~85%; register 5/8",
  overall_percent: 62.5,
  execution_blocks: [
    { id: "foundation", label: "Foundation — Tasks 1–4", status: "Complete", percent: 100 },
    {
      id: "block_a",
      label: "Block A — Operator Conversation Loop",
      status: "~85%",
      detail: "A1 ✅ A3 ✅ · A2, A5 outstanding",
      percent: 85,
    },
    { id: "block_b", label: "Block B — Compliance & Convergence", status: "Not started" },
  ],
  register: {
    label: "8-task register",
    done: 5,
    total: 8,
    line: "1 ✅ · 2 ✅ · 3 ✅ · 4 ✅ · 5 ✅ · 6 partial · 7 not started · 8 not started → 5 / 8 = 62.5%",
  },
  migrations: {
    branch_files: 321,
    unique_versions: 320,
    applied: 320,
    pending: 0,
    verified_through: "20260810180000",
    collisions: "20260807090000 — governance follow-up",
  },
  workstreams: [
    { id: "WS4", label: "Composer Convergence", status: "Partial", approx: 72, detail: "HTTP reachable; UI wiring outstanding" },
    { id: "WS6", label: "Hierarchy & Inheritance", status: "Planned", approx: 0, detail: "Out of scope" },
  ],
};

const n = normalizeProgressBoard(sample, { source: "test" });
assert.equal(n.kind, "progress_board");
assert.equal(n.overallPercent, 62.5);
assert.equal(n.executionBlocks.length, 3);
assert.equal(n.workstreams.length, 2);
assert.equal(n.register.done, 5);
assert.equal(n.register.total, 8);
assert.equal(n.migrations.pending, 0);
assert.match(n.executionBlocks[1].detail, /A2/);

const mid = "msn_progress_board_test";
const written = writeProgressBoard(mid, sample);
assert.ok(written);
const read = readProgressBoard(mid);
assert.equal(read.executionBlocks[0].label, "Foundation — Tasks 1–4");
assert.equal(read.migrations.verifiedThrough, "20260810180000");

const vm = progressBoardVm(mid);
assert.equal(vm.kind, "progress_board_vm");
assert.equal(vm.overallLabel, "62.5%");
assert.equal(vm.hasDepth, true);
assert.equal(vm.workstreams[0].id, "WS4");

// Empty / garbage → null
assert.equal(normalizeProgressBoard(null), null);
assert.equal(normalizeProgressBoard({}), null);

// Derive returns null with no assignments
assert.equal(deriveProgressBoardFromAssignments("msn_none"), null);

console.log("progress-board.test.mjs: ok");
rmSync(root, { recursive: true, force: true });
