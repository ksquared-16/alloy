/**
 * Certification migration SHA reachability.
 *
 * The gate: which commits may a governed migration be applied from?
 *
 * For staging and production the answer is unchanged and must stay unchanged —
 * equal to, or an ancestor of, origin/staging. Certification gets one extra
 * route, because certification exists to test work that has NOT landed on
 * staging yet; requiring staging-ancestry there makes the gate unsatisfiable
 * for exactly the commits it is supposed to admit.
 *
 * Every control below is a way the widened path could become a hole. They run
 * against real Git, because the claims are claims about what Git considers
 * reachable and a stubbed git can only prove the code called what the test
 * expected.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const M = await import("../lib/vacilando/trusted-host-migrate.mjs");
const g = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/**
 * A clone with a real origin carrying: staging, a NESTED agent branch, a
 * promotion branch, an arbitrary origin branch, and a tag. Plus a local-only
 * branch and an unpushed commit that must never be accepted.
 */
function world() {
  const base = mkdtempSync(join(tmpdir(), "certreach-"));
  const origin = join(base, "origin.git");
  const repo = join(base, "repo");
  mkdirSync(repo);
  g(["init", "-q", "--bare", origin], base);
  g(["init", "-q", "-b", "staging"], repo);
  g(["config", "user.email", "t@example.com"], repo);
  g(["config", "user.name", "t"], repo);
  const commit = (msg) => { writeFileSync(join(repo, "f.txt"), msg); g(["add", "."], repo); g(["commit", "-qm", msg], repo); return g(["rev-parse", "HEAD"], repo); };

  const root = commit("root");
  const stagingTip = commit("staging tip");
  g(["remote", "add", "origin", origin], repo);
  g(["push", "-q", "origin", "staging"], repo);

  // A NESTED agent branch: two levels below agent/, like every real one.
  g(["checkout", "-q", "-b", "agent/claude/4-thing", root], repo);
  const agentMid = commit("agent middle");
  const agentTip = commit("agent tip");
  g(["push", "-q", "origin", "agent/claude/4-thing"], repo);

  g(["checkout", "-q", "-b", "promotion/some-promo", root], repo);
  const promoTip = commit("promo tip");
  g(["push", "-q", "origin", "promotion/some-promo"], repo);

  // Arbitrary origin branch — pushed, but NOT sanctioned.
  g(["checkout", "-q", "-b", "feature/not-sanctioned", root], repo);
  const featureTip = commit("feature tip");
  g(["push", "-q", "origin", "feature/not-sanctioned"], repo);

  // A tag, pushed. Tags are never a sanctioned route.
  g(["checkout", "-q", "-b", "tagged", root], repo);
  const taggedTip = commit("tagged tip");
  g(["tag", "v-cert"], repo);
  g(["push", "-q", "origin", "v-cert"], repo);

  // Local-only branch, never pushed.
  g(["checkout", "-q", "-b", "local-only", root], repo);
  const localOnlyTip = commit("local only");

  // An unpushed commit on top of the agent branch.
  g(["checkout", "-q", "agent/claude/4-thing"], repo);
  const unpushed = commit("unpushed on agent");

  g(["fetch", "-q", "--prune", "origin"], repo);
  return { base, repo, root, stagingTip, agentMid, agentTip, promoTip, featureTip, taggedTip, localOnlyTip, unpushed };
}

const reach = (sha, environment, w) =>
  M.assertShaReachableForEnvironment(sha, { environment, cwd: w.repo, fetchIfMissing: false });

/* ── Staging and production semantics must not move ───────────────────────── */

await test("staging: a SHA equal to origin/staging is accepted, exactly as before", () => {
  const w = world();
  const now = reach(w.stagingTip, "staging", w);
  const before = M.assertShaReachableFromStaging(w.stagingTip, { cwd: w.repo, fetchIfMissing: false });
  assert.equal(now.ok, true);
  assert.deepEqual(now, before, "the staging path must return the original result verbatim");
});

await test("staging: an ancestor of origin/staging is accepted, exactly as before", () => {
  const w = world();
  const now = reach(w.root, "staging", w);
  assert.equal(now.ok, true);
  assert.deepEqual(now, M.assertShaReachableFromStaging(w.root, { cwd: w.repo, fetchIfMissing: false }));
});

await test("NC1 — staging: an unmerged agent commit is still REFUSED, with the original failure", () => {
  const w = world();
  const now = reach(w.agentTip, "staging", w);
  const before = M.assertShaReachableFromStaging(w.agentTip, { cwd: w.repo, fetchIfMissing: false });
  assert.equal(now.ok, false);
  assert.equal(now.code, "source_sha_not_reachable");
  // Byte-identical: nothing downstream may be able to tell this function exists.
  assert.deepEqual(now, before);
});

await test("NC2 — a non-certification environment never consults the sanctioned refs", () => {
  const w = world();
  const calls = [];
  const spy = (args, opts) => { calls.push(args.join(" ")); return execFileSyncSafe(args, opts, w.repo); };
  M.assertShaReachableForEnvironment(w.agentTip, {
    environment: "production", git: spy, cwd: w.repo, fetchIfMissing: false,
  });
  assert.ok(!calls.some((c) => c.startsWith("for-each-ref")), "for-each-ref must never run outside certification");
});

function execFileSyncSafe(args, opts, cwd) {
  try {
    const stdout = execFileSync("git", args, { cwd: opts?.cwd || cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return { ok: true, status: 0, stdout, stderr: "" };
  } catch (e) {
    return { ok: false, status: e.status ?? 1, stdout: String(e.stdout || ""), stderr: String(e.stderr || "") };
  }
}

/* ── Certification: what it accepts ───────────────────────────────────────── */

await test("certification: a commit reachable from a NESTED agent ref is accepted", () => {
  const w = world();
  const r = reach(w.agentMid, "certification", w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.relation, "ancestor_of_sanctioned_certification_ref");
  assert.match(r.sanctionedRef, /^refs\/remotes\/origin\/agent\/claude\/4-thing$/);
});

await test("certification: a commit equal to a promotion ref tip is accepted", () => {
  const w = world();
  const r = reach(w.promoTip, "certification", w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.relation, "equals_sanctioned_certification_ref");
});

await test("cert is accepted under both spellings, and only those", () => {
  const w = world();
  assert.equal(reach(w.agentTip, "cert", w).ok, true);
  assert.equal(reach(w.agentTip, "CERTIFICATION", w).ok, true, "environment match is case-insensitive");
  assert.equal(reach(w.agentTip, "staging", w).ok, false);
  assert.equal(reach(w.agentTip, "production", w).ok, false);
  assert.equal(reach(w.agentTip, "", w).ok, false);
});

/* ── Certification: what it must REFUSE ───────────────────────────────────── */

await test("NC3 — certification REFUSES a local-only branch", () => {
  const w = world();
  const r = reach(w.localOnlyTip, "certification", w);
  assert.equal(r.ok, false);
  assert.equal(r.code, "source_sha_not_reachable");
});

await test("NC4 — certification REFUSES an unpushed commit, even on a sanctioned branch", () => {
  const w = world();
  // The local branch agent/claude/4-thing has it; origin does not.
  assert.equal(w.unpushed, g(["rev-parse", "agent/claude/4-thing"], w.repo));
  const r = reach(w.unpushed, "certification", w);
  assert.equal(r.ok, false, "a commit only this checkout has proves nothing");
});

await test("NC5 — certification REFUSES an arbitrary origin/* branch", () => {
  const w = world();
  const r = reach(w.featureTip, "certification", w);
  assert.equal(r.ok, false, "origin/feature/* is pushed but not sanctioned");
});

await test("NC6 — certification REFUSES a commit reachable only through a tag", () => {
  const w = world();
  const r = reach(w.taggedTip, "certification", w);
  assert.equal(r.ok, false, "tags are never a sanctioned route");
});

await test("NC7 — certification never accepts the worktree HEAD merely because it exists", () => {
  const w = world();
  g(["checkout", "-q", "local-only"], w.repo);
  const head = g(["rev-parse", "HEAD"], w.repo);
  const r = reach(head, "certification", w);
  assert.equal(r.ok, false, "having the object is not reachability");
});

await test("NC8 — a symbolic */HEAD ref is skipped", () => {
  const w = world();
  // origin/HEAD is symbolic; make it exist and point at staging.
  try { g(["remote", "set-head", "origin", "staging"], w.repo); } catch { /* not fatal */ }
  const src = M.assertShaReachableForEnvironment.toString();
  assert.ok(/endsWith\("\/HEAD"\)/.test(src), "the enumeration must skip symbolic HEAD refs");
  // And a non-sanctioned commit still fails with origin/HEAD present.
  assert.equal(reach(w.featureTip, "certification", w).ok, false);
});

await test("NC9 — only remote-tracking refs are ever consulted", () => {
  const w = world();
  for (const glob of M.CERTIFICATION_SANCTIONED_REF_GLOBS) {
    assert.ok(glob.startsWith("refs/remotes/"), `${glob} must be remote-tracking`);
  }
  const src = M.assertShaReachableForEnvironment.toString();
  assert.ok(/startsWith\("refs\/remotes\/"\)/.test(src), "the enumeration must assert remote-tracking, not just filter by pattern");
});

await test("NC10 — a SHA that is not a commit is refused whatever the environment", () => {
  const w = world();
  // A well-formed but absent object name: `git rev-parse` accepts the SYNTAX
  // without proving the object exists, so the staging check reports it as
  // unreachable rather than unavailable. What matters is that certification
  // does not rescue it.
  const absent = reach("0".repeat(40), "certification", w);
  assert.equal(absent.ok, false);
  // Unparseable input takes the explicit early return instead.
  const garbage = reach("not-a-sha-at-all", "certification", w);
  assert.equal(garbage.ok, false);
  assert.equal(garbage.code, "source_sha_unavailable");
});

/* ── The glob defect ──────────────────────────────────────────────────────── */

await test("NC11 — the agent glob must cross a slash, or it silently matches nothing", () => {
  const w = world();
  // git for-each-ref matches with wildmatch in PATHNAME mode: `*` does NOT
  // cross a slash. Real agent branches are agent/<provider>/<name>, so a single
  // star matches ZERO of them while promotion/* (one level) matches and looks
  // like proof the pattern works.
  const single = g(["for-each-ref", "--format=%(refname)", "refs/remotes/origin/agent/*"], w.repo);
  const double = g(["for-each-ref", "--format=%(refname)", "refs/remotes/origin/agent/**"], w.repo);
  assert.equal(single, "", "a single star matches no nested agent ref — this is the trap");
  assert.ok(double.includes("agent/claude/4-thing"), "the double star matches nested agent refs");
  assert.ok(
    M.CERTIFICATION_SANCTIONED_REF_GLOBS.includes("refs/remotes/origin/agent/**"),
    "the shipped glob must be the one that actually matches",
  );
});

await test("NC12 — the sanctioned globs do not leak outside their prefixes", () => {
  const w = world();
  const listed = g(["for-each-ref", "--format=%(refname)", ...M.CERTIFICATION_SANCTIONED_REF_GLOBS], w.repo)
    .split("\n").filter(Boolean);
  assert.ok(listed.length > 0);
  for (const r of listed) {
    assert.ok(
      r === "refs/remotes/origin/staging"
      || r.startsWith("refs/remotes/origin/agent/")
      || r.startsWith("refs/remotes/origin/promotion/"),
      `${r} is outside the sanctioned prefixes`,
    );
  }
  assert.ok(!listed.some((r) => r.includes("feature/not-sanctioned")));
});

/* ── Drift guard: absent is not changed ───────────────────────────────────────
 *
 * One layer below reachability sits the same shape of defect. The guard asks
 * "is the migration I approved still the migration that will run?" and answers
 * it by comparing against staging. For a certification apply of unmerged work
 * the file is absent from staging BY DEFINITION, so the guard failed on a
 * condition certification can never satisfy. A NEW migration is not a CHANGED
 * one — but a migration PRESENT on staging and different is still drift, in
 * every environment including certification.
 */

/** A repo where a migration exists on an agent branch and NOT on staging. */
function migrationWorld({ alsoOnStaging = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), "certmig-"));
  const origin = join(base, "origin.git");
  const repo = join(base, "repo");
  mkdirSync(repo);
  g(["init", "-q", "--bare", origin], base);
  g(["init", "-q", "-b", "staging"], repo);
  g(["config", "user.email", "t@example.com"], repo);
  g(["config", "user.name", "t"], repo);
  mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
  const rel = "supabase/migrations/20260827180000_thing.sql";
  writeFileSync(join(repo, "README.md"), "root");
  g(["add", "."], repo); g(["commit", "-qm", "root"], repo);
  if (alsoOnStaging !== null) {
    writeFileSync(join(repo, rel), alsoOnStaging);
    g(["add", "."], repo); g(["commit", "-qm", "migration on staging"], repo);
  }
  g(["remote", "add", "origin", origin], repo);
  g(["push", "-q", "origin", "staging"], repo);
  const stagingSha = g(["rev-parse", "HEAD"], repo);

  g(["checkout", "-q", "-b", "agent/claude/9-mig"], repo);
  writeFileSync(join(repo, rel), "-- the approved migration\n");
  // A marker so the branch commit is never empty — when staging already holds
  // identical migration content, `git commit` would otherwise refuse and the
  // fixture would fail in a way that looks like a code failure.
  writeFileSync(join(repo, "branch-marker.txt"), "agent");
  g(["add", "."], repo); g(["commit", "-qm", "migration"], repo);
  const migSha = g(["rev-parse", "HEAD"], repo);
  g(["push", "-q", "origin", "agent/claude/9-mig"], repo);
  g(["fetch", "-q", "--prune", "origin"], repo);
  return { repo, rel, stagingSha, migSha };
}

const readAt = (w, environment) => M.readMigrationContent({
  environment, root: w.repo, sha: w.migSha, relative: w.rel,
  gitCwd: w.repo, currentStagingSha: w.stagingSha, fetchIfMissing: false,
});

await test("certification: a migration absent from staging is NEW, not changed", () => {
  const w = migrationWorld();
  const r = readAt(w, "certification");
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.text, /the approved migration/);
});

await test("NC13 — staging still REFUSES a migration absent from staging", () => {
  const w = migrationWorld();
  const r = readAt(w, "staging");
  assert.equal(r.ok, false);
  assert.equal(r.code, "migration_changed_since_approval");
});

await test("NC14 — real drift still fails in CERTIFICATION: present on staging and different", () => {
  // This is the case the guard exists for, and widening must not touch it.
  const w = migrationWorld({ alsoOnStaging: "-- a DIFFERENT migration\n" });
  const r = readAt(w, "certification");
  assert.equal(r.ok, false, "content that differs on staging is drift in every environment");
  assert.equal(r.code, "migration_changed_since_approval");
  assert.match(r.detail, /changed on staging after approval/);
});

await test("NC15 — identical content on staging passes everywhere", () => {
  const w = migrationWorld({ alsoOnStaging: "-- the approved migration\n" });
  assert.equal(readAt(w, "certification").ok, true);
  assert.equal(readAt(w, "staging").ok, true);
});

await test("NC16 — a migration absent at its OWN sha fails in every environment", () => {
  const w = migrationWorld();
  const r = M.readMigrationContent({
    environment: "certification", root: w.repo, sha: w.stagingSha,
    relative: w.rel, gitCwd: w.repo, currentStagingSha: w.stagingSha, fetchIfMissing: false,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "migration_missing_at_sha");
});

await test("NC17 — the runtime re-read applies the same environment rule as validation", () => {
  // Reading under staging semantics at execution time would re-introduce the
  // failure AFTER the request had already been approved.
  const src = readFileSync(new URL("../lib/vacilando/trusted-host-migrate.mjs", import.meta.url), "utf8");
  const i = src.indexOf("const latest = readContent({");
  assert.ok(i > -1, "the runtime re-read must exist");
  const block = src.slice(i, i + 400);
  assert.ok(/environment:\s*normalized\.environment/.test(block),
    "the runtime re-read must pass the normalized environment");
});
