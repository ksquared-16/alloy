/**
 * Presentation revision — cheap fingerprint for Mission Control freshness.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "vac-rev-"));
process.env.ALLOY_RUNTIME_ROOT = root;

const { computePresentationRevision } = await import("../lib/vacilando/presentation-revision.mjs");

mkdirSync(join(root, "vacilando", "decisions"), { recursive: true });
const a = computePresentationRevision();
assert.ok(a.revision);
assert.equal(a.revision.length, 20);

writeFileSync(join(root, "vacilando", "decisions", "msn_x.json"), JSON.stringify({ decisions: [] }));
const b = computePresentationRevision();
assert.notEqual(a.revision, b.revision, "mutation must change revision");

const c = computePresentationRevision();
assert.equal(b.revision, c.revision, "stable when unchanged");

rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, revision_changed_on_write: true }, null, 2));
