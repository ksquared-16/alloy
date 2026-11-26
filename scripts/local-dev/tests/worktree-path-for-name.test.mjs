#!/usr/bin/env node
/**
 * Worktree paths must honor ALLOY_WORKTREE_ROOT, not a hardcoded Mac layout.
 */
import assert from "node:assert/strict";
import { join } from "node:path";

const { worktreePathForName } = await import("../lib/vacilando/workspace-facts.mjs");

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

await test("empty name is null", () => {
  assert.equal(worktreePathForName(""), null);
  assert.equal(worktreePathForName(null), null);
});

await test("ALLOY_WORKTREE_ROOT wins over the MacBook default", () => {
  const prev = process.env.ALLOY_WORKTREE_ROOT;
  process.env.ALLOY_WORKTREE_ROOT = "/tmp/vac-wt-root";
  try {
    assert.equal(worktreePathForName("wt1-example"), join("/tmp/vac-wt-root", "wt1-example"));
  } finally {
    if (prev == null) delete process.env.ALLOY_WORKTREE_ROOT;
    else process.env.ALLOY_WORKTREE_ROOT = prev;
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
