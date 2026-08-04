/**
 * Presentation revision — cheap fingerprint for Mission Control freshness.
 * Must stay stable across worker heartbeat rewrites.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
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

// Heartbeat dirs must not affect revision (excluded from watch).
mkdirSync(join(root, "vacilando", "worker-health"), { recursive: true });
mkdirSync(join(root, "vacilando", "execution-sessions"), { recursive: true });
writeFileSync(join(root, "vacilando", "worker-health", "claude-6.json"), JSON.stringify({
  workerId: "claude-6",
  lastHeartbeatAt: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));
writeFileSync(join(root, "vacilando", "execution-sessions", "exs_1.json"), JSON.stringify({
  sessionId: "exs_1",
  progress: { lastHeartbeatAt: new Date().toISOString() },
  updated_at: new Date().toISOString(),
}));
const afterHeartbeatDirs = computePresentationRevision();
assert.equal(afterHeartbeatDirs.revision, b.revision, "worker-health / execution-sessions must not thrash revision");

// Assignment heartbeat (updated_at only) must not thrash revision.
mkdirSync(join(root, "vacilando", "assignments"), { recursive: true });
const asgPath = join(root, "vacilando", "assignments", "msn_x.json");
writeFileSync(asgPath, JSON.stringify({
  mission_id: "msn_x",
  assignments: [{ assignmentId: "asg_1", status: "running", updated_at: "2026-01-01T00:00:00.000Z" }],
}));
const asgA = computePresentationRevision();
writeFileSync(asgPath, JSON.stringify({
  mission_id: "msn_x",
  assignments: [{ assignmentId: "asg_1", status: "running", updated_at: "2026-01-01T00:00:05.000Z" }],
}));
// Touch mtime explicitly so a naive mtime fingerprint would change.
const later = new Date(Date.now() + 10_000);
utimesSync(asgPath, later, later);
const asgB = computePresentationRevision();
assert.equal(asgA.revision, asgB.revision, "assignment updated_at-only write must not change revision");

// Real assignment status change must bump revision.
writeFileSync(asgPath, JSON.stringify({
  mission_id: "msn_x",
  assignments: [{ assignmentId: "asg_1", status: "completed", updated_at: "2026-01-01T00:00:06.000Z" }],
}));
const asgC = computePresentationRevision();
assert.notEqual(asgA.revision, asgC.revision, "assignment status change must change revision");

rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({
  ok: true,
  revision_changed_on_write: true,
  heartbeat_dirs_ignored: true,
  assignment_heartbeat_stable: true,
  assignment_status_detected: true,
}, null, 2));
