#!/usr/bin/env node
/**
 * Lane freshness and safe resume.
 *
 * THE FAILURE BEING PREVENTED IS NOT HYPOTHETICAL. A Governance implementation
 * lane was found to be 654 commits behind staging, at promotion time, after the
 * work was finished. Re-measured on 2026-09-12 the live fleet still carried
 * lanes 207, 390, 719, 915 and 1930 commits behind.
 *
 * So the controls below are mostly about the REFUSALS, not the happy path. A
 * policy that reconciles when it should is worth little if it also reconciles
 * when it should not: rebasing a dirty worktree, a shared branch or a
 * certification candidate destroys work or evidence, and does it quietly.
 *
 * `git` is injected throughout. These assert the POLICY — which conditions
 * permit a mutation and which forbid it — not git's behaviour, which is git's to
 * get right.
 *
 * Isolated runtime only. No repository is touched.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-fresh-"));
process.env.ALLOY_RUNTIME_ROOT = join(ROOT, "gateway");
mkdirSync(join(ROOT, "gateway", "vacilando"), { recursive: true });
writeFileSync(join(ROOT, "INSTALL-MANIFEST"), "toolkit 0123456789ab\n");

const F = await import("../lib/vacilando/lane-freshness.mjs");
const H = await import("../lib/vacilando/health.mjs");
const BA = await import("../lib/vacilando/browser-auth.mjs");
const { managedSlots } = await import("../lib/vacilando/managed-slots.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);

/** A lane, its worktree and its git state — every fact injected. */
function scenario({
  idleHours = 1,
  behind = 0,
  ahead = 0,
  dirty = [],
  untracked = [],
  slot = 3,
  branch = "agent/x",
  worktreePath = "/w/lane",
  unresolved = [],
  worktreeResolvable = true,
  bootstrapStamped = true,
  shared = null,
  cert = null,
  readable = true,
} = {}) {
  const rec = {
    lane_id: "lane_aaaaaaaaaaaa",
    name: "Test Lane",
    updated_at: new Date(NOW - idleHours * HOUR).toISOString(),
    binding: { worktree_path: worktreePath, slot },
    ...(bootstrapStamped ? { bootstrap: { contract_version: "vacilando.lane_bootstrap.v1", at: "x" } } : {}),
  };
  return {
    rec,
    opts: {
      nowMs: NOW,
      getLane: () => rec,
      bootstrap: () => ({
        ok: true,
        unresolved,
        baseline: {
          worktree: { resolvable: worktreeResolvable, path: worktreePath, code: worktreeResolvable ? null : "lane_worktree_unregistered" },
          development_slot: { assigned: slot != null, slot },
        },
      }),
      gitFacts: () => ({ readable, branch, head_sha: "abc123", dirty_paths: dirty, untracked }),
      divergence: () => ({ readable, behind, ahead, base: "origin/staging" }),
      qaCapability: (s) => (s == null
        ? { slot: null, capable: true }
        : { slot: s, capable: true, identity: `qa-slot${s}@example.com` }),
      branchReferences: shared ? () => shared : () => ({ shared: false }),
      certificationCandidate: cert ? () => cert : () => ({ active: false }),
      runsForLane: () => [],
    },
  };
}

const evaluate = (s) => F.evaluateLaneFreshness("lane_aaaaaaaaaaaa", s.opts);

// ── 1. Recent and current does nothing ───────────────────────────────────────

test("1 — recent clean lane with no material divergence is CURRENT and mutates nothing", () => {
  const r = evaluate(scenario({ idleHours: 2, behind: 12 }));
  assert.equal(r.state, F.FRESHNESS.CURRENT);
  assert.equal(r.safe_to_start_new_work, true);
  // 12 behind is what a healthy active lane actually carries; calling that stale
  // would make the policy fire on the whole fleet every day.
  assert.ok(r.behind < F.FRESHNESS_POLICY.material_behind);
});

test("1b — a CURRENT lane is refused reconciliation as a no-op, not as a failure", () => {
  const s = scenario({ idleHours: 2, behind: 12 });
  let gitCalls = 0;
  const out = F.reconcileLaneFreshness("lane_aaaaaaaaaaaa", {
    ...s.opts,
    gitImpl: () => { gitCalls += 1; return "sha"; },
  });
  assert.equal(out.noop, true);
  assert.equal(out.reconciled, false);
  assert.equal(gitCalls, 0, "a current lane must not even be fetched");
});

// ── 2. Materially behind, clean and exclusive → reconcile ────────────────────

test("2 — inactive clean exclusive lane with divergence reconciles", () => {
  const s = scenario({ idleHours: 30, behind: 400 });
  const r = evaluate(s);
  assert.equal(r.state, F.FRESHNESS.STALE_SAFE_TO_RECONCILE);
  assert.equal(r.reason, "materially_behind");

  const calls = [];
  let behind = 400;
  const out = F.reconcileLaneFreshness("lane_aaaaaaaaaaaa", {
    ...s.opts,
    // After the rebase the lane is current, which is what the re-evaluation sees.
    divergence: () => ({ readable: true, behind, ahead: 0, base: "origin/staging" }),
    gitImpl: (args) => {
      calls.push(args[0]);
      if (args[0] === "rebase") behind = 0;
      return "newsha";
    },
  });
  assert.equal(out.reconciled, true);
  assert.equal(out.state, F.FRESHNESS.RECONCILED);
  assert.equal(out.safe_to_start_new_work, true);
  assert.deepEqual(calls, ["rev-parse", "fetch", "rebase", "rev-parse"]);
  assert.equal(out.pre_image_sha, "newsha", "the pre-image is always carried back");
});

test("12 — a second evaluation after reconciliation is quiet and idempotent", () => {
  const s = scenario({ idleHours: 30, behind: 0 });
  const r = evaluate(s);
  assert.equal(r.state, F.FRESHNESS.CURRENT, "reconciled lanes stop being stale");
  const again = F.reconcileLaneFreshness("lane_aaaaaaaaaaaa", { ...s.opts, gitImpl: () => "sha" });
  assert.equal(again.noop, true);
});

// ── 3–6. Refusals. None of these is made safe by an approval. ────────────────

test("4 — a dirty worktree refuses mutation", () => {
  const s = scenario({ idleHours: 100, behind: 900, dirty: ["web/app/page.tsx"] });
  const r = evaluate(s);
  assert.equal(r.state, F.FRESHNESS.BLOCKED_DIRTY);
  assert.equal(r.safe_to_start_new_work, false);
  let gitCalls = 0;
  const out = F.reconcileLaneFreshness("lane_aaaaaaaaaaaa", { ...s.opts, gitImpl: () => { gitCalls += 1; return "x"; } });
  assert.equal(out.refused, true);
  assert.equal(out.reconciled, false);
  assert.equal(gitCalls, 0, "a refused lane is never touched");
});

test("4b — untracked files alone are enough to refuse", () => {
  // Untracked work is still work. A rebase does not delete it, but reporting the
  // lane as safe invites the next step that will.
  const r = evaluate(scenario({ idleHours: 100, behind: 900, untracked: ["notes.md"] }));
  assert.equal(r.state, F.FRESHNESS.BLOCKED_DIRTY);
});

test("5 — a shared branch or worktree refuses mutation", () => {
  const r = evaluate(scenario({
    idleHours: 100, behind: 900,
    shared: { shared: true, detail: "also referenced by lane_b", references: ["lane_b"] },
  }));
  assert.equal(r.state, F.FRESHNESS.BLOCKED_SHARED);
  assert.match(r.detail, /lane_b/);
});

test("6 — a certification or promotion candidate refuses mutation", () => {
  const r = evaluate(scenario({
    idleHours: 100, behind: 900,
    cert: { active: true, reason: "promotion_branch", detail: "promote/x is a candidate" },
  }));
  assert.equal(r.state, F.FRESHNESS.BLOCKED_CERTIFICATION);
  assert.equal(r.reason, "promotion_branch");
});

test("6b — the default candidate guard fires on convention, and errs toward refusing", () => {
  // No candidate registry exists yet (DevOps 6 owns it), so the default is
  // deliberately broad: a false positive costs a manual rebase, a false negative
  // silently uncertifies a candidate.
  assert.equal(F.defaultCertificationCandidate({ branch: "promote/thing" }).active, true);
  assert.equal(F.defaultCertificationCandidate({ worktreePath: "/x/alloy-promotions/y" }).active, true);
  assert.equal(F.defaultCertificationCandidate({ branch: "agent/ordinary" }).active, false);
});

test("7 — a conflict during reconciliation preserves the branch and reports it", () => {
  const s = scenario({ idleHours: 100, behind: 900 });
  const calls = [];
  const out = F.reconcileLaneFreshness("lane_aaaaaaaaaaaa", {
    ...s.opts,
    gitImpl: (args) => {
      calls.push(args.join(" "));
      if (args[0] === "rebase" && args[1] !== "--abort") return null; // conflict
      return "preimage";
    },
  });
  assert.equal(out.state, F.FRESHNESS.BLOCKED_CONFLICT);
  assert.equal(out.reconciled, false);
  assert.equal(out.safe_to_start_new_work, false);
  assert.ok(calls.includes("rebase --abort"), "a conflicted rebase must be aborted, never left mid-flight");
  assert.equal(out.pre_image_sha, "preimage");
  assert.equal(out.restored, true, "HEAD must be back where it started");
});

test("11 — no path through reconciliation can discard commits", () => {
  // Asserted against the command stream rather than trusted from the prose:
  // nothing here may use a force, a hard reset or a prune.
  const s = scenario({ idleHours: 100, behind: 900 });
  const commands = [];
  F.reconcileLaneFreshness("lane_aaaaaaaaaaaa", {
    ...s.opts,
    divergence: () => ({ readable: true, behind: 0, ahead: 0, base: "origin/staging" }),
    gitImpl: (args) => { commands.push(args.join(" ")); return "sha"; },
  });
  const joined = commands.join(" | ");
  for (const dangerous of ["--force", "-f ", "reset --hard", "clean -", "push"]) {
    assert.ok(!joined.includes(dangerous), `reconciliation must never run ${dangerous}: ${joined}`);
  }
});

// ── 3, 8, 9. Bootstrap, slots and QA capability ──────────────────────────────

test("3 — a lane that does not satisfy the bootstrap contract is revalidated, not stamped", () => {
  const r = evaluate(scenario({ idleHours: 100, behind: 900, unresolved: ["worktree:lane_worktree_unregistered"] }));
  assert.equal(r.state, F.FRESHNESS.UNRESOLVED_BOOTSTRAP);
  assert.equal(r.safe_to_start_new_work, false);
  // And crucially it is NOT offered as safe to reconcile: rebasing would not fix
  // an unresolved baseline, it would just move a lane that is still wrong.
  assert.notEqual(r.state, F.FRESHNESS.STALE_SAFE_TO_RECONCILE);
});

test("3b — a stale bootstrap stamp makes an otherwise-current lane reconcilable, not current", () => {
  const r = evaluate(scenario({ idleHours: 1, behind: 0, bootstrapStamped: false }));
  assert.equal(r.state, F.FRESHNESS.STALE_SAFE_TO_RECONCILE);
  assert.equal(r.reason, "bootstrap_contract_stale");
  assert.equal(r.bootstrap_stale, true);
});

test("8 — a slotless lane is valid and needs no QA resource", () => {
  const r = evaluate(scenario({ idleHours: 2, behind: 0, slot: null }));
  assert.equal(r.state, F.FRESHNESS.CURRENT);
  assert.equal(r.qa_capability.capable, true);
  assert.equal(r.qa_capability.reason, "slotless_lane_needs_no_active_qa");
});

test("9 — a lane on a managed slot that cannot resolve QA is drift, not an optional gap", () => {
  // THE CORRECTED CONTRACT. Capability must be uniform: the same lane on slot 3
  // and on slot 9 must be equally able to run mounted certification. A slot that
  // cannot resolve a QA identity makes slot ASSIGNMENT decide capability.
  const s = scenario({ idleHours: 2, behind: 0, slot: 9 });
  s.opts.qaCapability = () => ({ slot: 9, capable: false, reason: "qa_identity_undeclared", declare: "ALLOY_SLOT_9_QA_IDENTITY" });
  const r = evaluate(s);
  assert.equal(r.state, F.FRESHNESS.UNRESOLVED_BOOTSTRAP);
  assert.equal(r.reason, "qa_identity_undeclared");
  assert.match(r.detail, /ALLOY_SLOT_9_QA_IDENTITY/);
});

test("9b — every managed slot resolves the same QA capability contract", () => {
  // Slots 7 and 9-11 were second-class: identities were declared for 1-6, 8 and
  // 12 only, so which slot the scheduler picked decided what the lane could do.
  const previous = process.env.ALLOY_CONFIG_FILE;
  process.env.ALLOY_CONFIG_FILE = new URL("../alloy-config.example", import.meta.url).pathname;
  BA.resetQaIdentityCacheForTests();
  const incapable = managedSlots().filter((s) => !BA.qaCapabilityForSlot(s).capable);
  process.env.ALLOY_CONFIG_FILE = previous;
  BA.resetQaIdentityCacheForTests();
  assert.deepEqual(incapable, [], "the shipped baseline must make every managed slot QA-capable");
});

test("9c — a missing QA identity is no longer cached, so declaring one takes effect live", () => {
  // Absence used to be cached alongside hits, which made a missing identity
  // permanent for the life of the process — so the one safe way to complete the
  // topology needed a Gateway restart, which an active soak forbids.
  // A slot NOTHING declares. The installed toolkit's alloy-config.example is
  // always the final fallback, so any slot it lists can never read as absent —
  // which is the whole reason this uses one outside every config.
  const SLOT = 77;
  BA.resetQaIdentityCacheForTests();
  delete process.env[`ALLOY_SLOT_${SLOT}_QA_IDENTITY`];
  assert.equal(BA.qaIdentityForSlot(SLOT), null, "undeclared reads as absent");
  // Declared afterwards, with NO cache reset and no restart.
  process.env[`ALLOY_SLOT_${SLOT}_QA_IDENTITY`] = "qa-slot77-late@example.com";
  assert.equal(
    BA.qaIdentityForSlot(SLOT), "qa-slot77-late@example.com",
    "a later declaration must be visible without restarting the Gateway",
  );
  delete process.env[`ALLOY_SLOT_${SLOT}_QA_IDENTITY`];
  BA.resetQaIdentityCacheForTests();
});

// ── 10. The check costs nothing scarce ───────────────────────────────────────

test("10 — evaluating freshness acquires no slot, server, browser or provider", () => {
  // Asserted by injection. Every owner is a recorder; anything that tried to
  // allocate would have to call something absent from this list.
  const s = scenario({ idleHours: 2, behind: 0 });
  const touched = [];
  F.evaluateLaneFreshness("lane_aaaaaaaaaaaa", {
    ...s.opts,
    getLane: (...a) => { touched.push("getLane"); return s.opts.getLane(...a); },
    bootstrap: (...a) => { touched.push("bootstrap"); return s.opts.bootstrap(...a); },
    gitFacts: (...a) => { touched.push("gitFacts"); return s.opts.gitFacts(...a); },
    divergence: (...a) => { touched.push("divergence"); return s.opts.divergence(...a); },
    qaCapability: (...a) => { touched.push("qaCapability"); return s.opts.qaCapability(...a); },
  });
  // QA capability is resolved with the lane's own facts, before any git is run,
  // so an unresolvable slot is reported without paying for git at all.
  assert.deepEqual(touched, ["getLane", "bootstrap", "qaCapability", "gitFacts", "divergence"]);
  // Named explicitly so the intent survives a refactor that adds an owner.
  for (const forbidden of ["ensureLaneSlot", "startDevServer", "mintQaSession", "launchBrowser", "admitProvider"]) {
    assert.ok(!touched.includes(forbidden));
  }
});

test("an unreadable worktree is UNRESOLVED, never quietly safe", () => {
  const r = evaluate(scenario({ readable: false, behind: 900 }));
  assert.equal(r.state, F.FRESHNESS.UNRESOLVED_BOOTSTRAP);
  assert.equal(r.reason, "git_unreadable");
});

// ── 13. Fleet classification and the health surface ──────────────────────────

test("13 — the fleet classifies read-only and survives a lane that throws", () => {
  const inv = F.inventoryLaneFreshness({
    lanes: [{ lane_id: "lane_1", name: "A" }, { lane_id: "lane_2", name: "B" }],
    evaluate: (id) => {
      if (id === "lane_2") throw new Error("boom");
      return { ok: true, lane_id: id, name: "A", state: F.FRESHNESS.CURRENT, behind: 0 };
    },
  });
  assert.equal(inv.lanes, 2);
  assert.equal(inv.by_state.CURRENT, 1);
  assert.equal(inv.by_state.UNKNOWN, 1, "a lane that cannot be evaluated must not vanish from the count");
});

test("the health check reports through the existing framework with honest severities", () => {
  assert.ok(H.CHECKS.includes("lane.freshness"));
  const row = (state, extra = {}) => ({ lane_id: "l", name: "L", state, behind: 0, ...extra });

  assert.equal(H.checkLaneFreshness({ inventory: { rows: [row("CURRENT")], policy: {} } }).severity, "healthy");
  // Stale and blocked are WATCH: a lane being behind is normal, and a refusal is
  // the policy working. Scoring either as a problem trains the operator to ignore it.
  assert.equal(H.checkLaneFreshness({ inventory: { rows: [row("STALE_SAFE_TO_RECONCILE", { behind: 400 })], policy: {} } }).severity, "watch");
  assert.equal(H.checkLaneFreshness({ inventory: { rows: [row("BLOCKED_DIRTY")], policy: {} } }).severity, "watch");
  // Unresolved is a PROBLEM: the lane is not as capable as it should be.
  assert.equal(H.checkLaneFreshness({ inventory: { rows: [row("UNRESOLVED_BOOTSTRAP")], policy: {} } }).severity, "problem");
  assert.equal(H.checkLaneFreshness({ inventory: null }).incomplete, true);
});

test("the thresholds are centrally owned and configurable, not scattered literals", () => {
  for (const key of ["recent_hours", "long_inactive_hours", "material_behind", "canonical_base"]) {
    assert.ok(key in F.FRESHNESS_POLICY, `${key} must live in the policy`);
  }
  assert.equal(F.FRESHNESS_POLICY.canonical_base, "origin/staging");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
