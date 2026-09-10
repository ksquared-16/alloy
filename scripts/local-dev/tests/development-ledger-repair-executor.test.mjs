#!/usr/bin/env node
/**
 * THE EXECUTOR'S OWN SCOPE.
 *
 * WHAT HAPPENED. The ledger repair module had sixteen passing controls while the
 * executor was broken: it called `sha256`, which is not defined in
 * trusted-host-actions.mjs. The migration executor never needed one, because
 * applyMigrationBatch hashes inside trusted-host-migrate where sha256 IS
 * defined. The first real repair was approved by the operator and then died
 * `execution_threw` — a decision spent on a ReferenceError.
 *
 * A pure-function suite cannot see that: it exercises the module, and the bug
 * was in the caller. These are scope guards over the executor's own source.
 *
 * THIS IS NOT A SUBSTITUTE FOR RUNNING IT. Building a full executor test needs a
 * stored, authorized action whose inputs survive real git resolution and a
 * governed candidate proof, which a temp runtime root does not have. That gap is
 * real and is reported rather than papered over; these guards close the specific
 * hole that shipped.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../lib/vacilando/trusted-host-actions.mjs", import.meta.url), "utf8");
const EXECUTOR = SRC.slice(
  SRC.indexOf("export function executeLedgerRepairTrustedHostAction"),
  SRC.indexOf("/** Injection seam"),
);

await test("LX1 — the executor is locatable and non-trivial", () => {
  assert.ok(EXECUTOR.length > 800, "the executor must be present to be checked");
});

await test("LX2 — it calls no hashing helper this module does not define", () => {
  // The exact defect: sha256 exists in trusted-host-migrate, not here.
  assert.equal(/\bsha256\s*\(/.test(EXECUTOR), false,
    "sha256 is not in this module's scope; hash with createHash");
  assert.match(EXECUTOR, /createHash\("sha256"\)/);
  assert.match(SRC, /import \{[^}]*createHash[^}]*\} from "node:crypto";/,
    "and createHash must actually be imported");
});

await test("LX3 — every helper the executor calls is defined or imported here", () => {
  // Names the executor invokes, minus JS builtins and member calls.
  const called = [...new Set([...EXECUTOR.matchAll(/(?<![.\w])([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)].map((m) => m[1]))];
  const builtins = new Set(["if", "for", "while", "switch", "catch", "return", "typeof",
    "String", "Number", "Boolean", "Array", "Object", "JSON", "Math", "Date", "createHash", "of"]);
  const undefinedHere = called.filter((id) => {
    if (builtins.has(id)) return false;
    const declared = new RegExp(`(^|\\n)\\s*(export\\s+)?(async\\s+)?function\\s+${id}\\b`).test(SRC)
      || new RegExp(`(^|\\n)\\s*(const|let|var)\\s+${id}\\b`).test(SRC);
    const imported = new RegExp(`import[^;]*\\b${id}\\b[^;]*from`, "s").test(SRC);
    return !declared && !imported;
  });
  assert.deepEqual(undefinedHere, [],
    `the executor calls helpers this module neither defines nor imports: ${undefinedHere.join(", ")}`);
});

await test("LX4 — the result still refuses to claim reconciliation", () => {
  // The property that must survive any refactor of this executor.
  assert.match(EXECUTOR, /recensus_required: true/);
  assert.match(EXECUTOR, /source: "transaction_assertion"/);
  assert.match(EXECUTOR, /payloadHasSecrets/);
});
