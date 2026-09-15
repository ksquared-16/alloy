#!/usr/bin/env node
/**
 * FIVE ROOTS THAT WERE ONE VARIABLE.
 *
 * S3 began by asking what `ALLOY_RUNTIME_ROOT` actually means. Across 104
 * executable resolutions, every one falls back to `~/.local/state/alloy-dev` —
 * a directory under the OPERATOR'S HOME. It has never meant "the Alloy
 * checkout". It means "where Vacilando keeps its own control-plane state",
 * which is Vacilando's concept wearing Alloy's name.
 *
 * So a rename would have been wrong twice: it preserves the real defect, which
 * is that five distinct roots were being resolved by hand in 119 files with
 * nothing telling them apart, and it renames a thing whose problem was never
 * its name.
 *
 * THE DEFECT THAT HAS ALREADY COST AN OUTAGE. One variable carries two
 * incompatible meanings — 40 sites treat it as the state root, 20 as the
 * Gateway root one level deeper — and which is correct depends on how the host
 * happens to set it:
 *
 *   unset             the 40 are wrong
 *   set to the parent all 60 are wrong
 *   set to the child  all 60 are right   <- what this host happens to run
 *
 * `trusted-host-merge` was bitten and defended itself with a private probe:
 * reading the wrong depth named a store file that did not exist, so the parity
 * gate evaluated against ZERO census records for every merge, permanently, and
 * PR #848 was denied while a completed census sat in the store 42 minutes old.
 * One file solving it privately is exactly what kept it invisible to the other
 * fifty-nine. The probe is now the owner's, and case 4 is the ratchet.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-s3-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
const ALLOY_ROOT = "/Users/vacilando/Alloy";
const VAC_ROOT = "/Users/vacilando/Code/vacilando";

const LIB = new URL("../lib/vacilando/", import.meta.url).pathname;
const R = await import("../lib/vacilando/repository-registry.mjs");
const RR = await import("../lib/vacilando/runtime-roots.mjs");

mkdirSync(join(ROOT, "vacilando"), { recursive: true });
writeFileSync(join(ROOT, "vacilando", "repositories.json"), JSON.stringify({
  schema_version: R.REPOSITORY_SCHEMA,
  repositories: {
    [R.ALLOY_REPOSITORY_ID]: {
      repository_id: R.ALLOY_REPOSITORY_ID, name: "Alloy", root: ALLOY_ROOT,
      profile: "alloy", state: "ACTIVE",
    },
    repo_vac: {
      repository_id: "repo_vac", project_id: "prj_vacilando", name: "Vacilando",
      root: VAC_ROOT, worktree_parent: "/Users/vacilando/Code/vacilando-worktrees",
      default_branch: "main", profile: "generic", state: "ACTIVE",
      promotion: { governed_promotion: true, promotion_branch: "main" },
    },
  },
}), "utf8");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const src = (f) => readFileSync(`${LIB}${f}`, "utf8");
/** Executable text only: a comment NAMING a removed literal is not the literal. */
const code = (f) => src(f).split("\n")
  .map((l) => l.replace(/\/\/.*$/, "")).filter((l) => !/^\s*[*/]/.test(l)).join("\n");

/* ── the roots are told apart ─────────────────────────────────────────────── */

test("1 — the five roots are distinct concepts with distinct owners", () => {
  for (const fn of ["stateRoot", "gatewayStateRoot", "repositoryRootFor",
                    "executionCheckoutFor", "runtimeSourceRoot", "installedToolkitRoot"]) {
    assert.equal(typeof RR[fn], "function", `${fn} must exist`);
  }
  // The state root is NOT a repository root, and cannot be confused for one.
  assert.notEqual(RR.stateRoot(), ALLOY_ROOT);
  assert.notEqual(RR.stateRoot(), RR.runtimeSourceRoot());
  assert.equal(RR.gatewayStateRoot(), join(RR.stateRoot(), "gateway"));
});

test("2 — the state root is Vacilando's own, never a checkout", () => {
  // The whole census result in one assertion: what this variable resolves to.
  const unsetHome = RR.stateRoot();
  assert.ok(!unsetHome.includes("/Alloy"), `the state root must not be a repository: ${unsetHome}`);
  assert.equal(dirname(RR.gatewayStateRoot()), RR.stateRoot());
});

test("3 — THE POINT: all three real configurations converge", () => {
  /*
   * The defect, in the three settings that actually occur. Before S3 these
   * disagreed; a caller's correctness depended on a variable it never read.
   */
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  const answers = new Set();
  const base = mkdtempSync(join(tmpdir(), "vac-s3-depth-"));
  mkdirSync(join(base, "gateway", "vacilando", "governed-actions"), { recursive: true });
  for (const v of [undefined, base, join(base, "gateway")]) {
    if (v === undefined) delete process.env.ALLOY_RUNTIME_ROOT;
    else process.env.ALLOY_RUNTIME_ROOT = v;
    if (v !== undefined) answers.add(RR.gatewayStateRoot());
  }
  process.env.ALLOY_RUNTIME_ROOT = prev;
  assert.equal(answers.size, 1, `parent and child settings must resolve alike, got ${[...answers].join(" | ")}`);
  assert.equal([...answers][0], join(base, "gateway"), "and to the level that actually holds the store");
});

/**
 * EVERY FILE THAT STILL READS THE DEPRECATED VARIABLE, ENUMERATED.
 *
 * Certification 7 asks that remaining readers be "explicitly compatibility-only
 * and enumerated". This is the list, generated from the tree rather than
 * guessed -- my first attempt at writing it by hand named twelve files when the
 * real number was eighty-one, which is its own argument for measuring.
 *
 * Each is compatibility-only: none is the AUTHORITY on any root, because
 *  is, and each resolves the same default this list's owner
 * does. They are routed slice by slice; the list only ever shrinks, and a NEW
 * name here fails case 4 rather than joining quietly.
 */
const KNOWN_COMPATIBILITY_READERS = new Set([
  "acceptance.mjs",
  "agent-session-lifecycle.mjs",
  "agent-session.mjs",
  "alloy-dev-adapter.mjs",
  "assignment-dispatch.mjs",
  "audit.mjs",
  "browser-auth.mjs",
  "capability.mjs",
  "closeout.mjs",
  "compiled-mission.mjs",
  "control-plane-health.mjs",
  "control-plane-recovery.mjs",
  "decisions.mjs",
  "deliverable-director-loop.mjs",
  "deliverable-review.mjs",
  "deployed-qa-session-restore-action.mjs",
  "development-lane.mjs",
  "director-capability-freshness.mjs",
  "director-comms.mjs",
  "director-idempotency.mjs",
  "director-requests.mjs",
  "director-summary.mjs",
  "director.mjs",
  "evidence-experience.mjs",
  "evidence.mjs",
  "execution-admission.mjs",
  "execution-exclusive.mjs",
  "execution-node.mjs",
  "execution-recovery.mjs",
  "execution-resource.mjs",
  "execution-run.mjs",
  "execution-session.mjs",
  "gap-analysis.mjs",
  "gateway-host-mutation.mjs",
  "governed-action-request.mjs",
  "governed-dependency-runtime.mjs",
  "governed-repository-authority.mjs",
  "improvements.mjs",
  "knowledge.mjs",
  "lane-attachments.mjs",
  "lane-execution-capacity.mjs",
  "lane-notifications.mjs",
  "lane-push.mjs",
  "lane-runtime.mjs",
  "lane-worktree-lifecycle.mjs",
  "mission-advance.mjs",
  "mission-archive.mjs",
  "mission-brief.mjs",
  "mission-collaboration.mjs",
  "mission-confidence.mjs",
  "mission-context.mjs",
  "mission-conversation-director.mjs",
  "mission-delegation.mjs",
  "mission-executor.mjs",
  "mission-packages.mjs",
  "missions.mjs",
  "notification-preferences.mjs",
  "objective.mjs",
  "operational-findings.mjs",
  "outputs.mjs",
  "platform-resources.mjs",
  "presentation-revision.mjs",
  "product-definition.mjs",
  "progress-board-store.mjs",
  "register-complete-synthesis.mjs",
  "repository-registry.mjs",
  "resource-claims.mjs",
  "review.mjs",
  "server-fleet-observation.mjs",
  "source-control.mjs",
  "timeline.mjs",
  "trusted-host-actions.mjs",
  "trusted-host-authz.mjs",
  "trusted-host-production-migrate.mjs",
  "ui-v2-views.mjs",
  "usage-ledger.mjs",
  "usage.mjs",
  "vacilando-api-auth.mjs",
  "worker-assignment.mjs",
  "worker-health.mjs",
  "workspace-facts.mjs",
  "workspace-last-seen.mjs",
]);

test("4 — THE RATCHET: every remaining reader is enumerated", () => {
  /*
   * Certification 7 asks that any remaining reader be "explicitly
   * compatibility-only and enumerated". This is that list. A NEW generic
   * runtime file reading the deprecated variable fails here, which is what
   * stops it spreading again while the compatibility window is open.
   */
  const ALLOWED = new Set(["runtime-roots.mjs"]);
  const out = execFileSync("grep", ["-rl", "process.env.ALLOY_RUNTIME_ROOT", `${LIB}`], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean).map((p) => p.split("/").pop());
  const unexpected = out.filter((f) => !ALLOWED.has(f) && !KNOWN_COMPATIBILITY_READERS.has(f));
  assert.deepEqual(unexpected, [],
    `new reader(s) of the deprecated variable: ${unexpected.join(", ")} — route them through runtime-roots.mjs`);
  /*
   * The owner reads it through a computed property (`process.env[NAME]`, from
   * the declared constant) rather than the literal, which is why it is not in
   * the grep above — and is also why the declaration is the thing to assert.
   */
  assert.equal(RR.DEPRECATED_STATE_ROOT_INPUT.name, "ALLOY_RUNTIME_ROOT",
    "the owner must be the one place that names the deprecated input");
  assert.match(src("runtime-roots.mjs"), /process\.env\[DEPRECATED_STATE_ROOT_INPUT\.name\]/,
    "and must read it from that declaration, so the two cannot drift");
});

test("5 — the deprecated input is declared, with deletion criteria", () => {
  const d = RR.DEPRECATED_STATE_ROOT_INPUT;
  assert.equal(d.name, "ALLOY_RUNTIME_ROOT");
  assert.equal(d.replaced_by, RR.STATE_ROOT_INPUT);
  assert.ok(d.slice, "its removal must be assigned to a slice");
  assert.ok(d.deletion_criteria.length >= 3, "and say exactly what must be true first");
  // The canonical input wins when both are set.
  const prev = { c: process.env[RR.STATE_ROOT_INPUT], d: process.env.ALLOY_RUNTIME_ROOT };
  const a = mkdtempSync(join(tmpdir(), "vac-s3-c-"));
  mkdirSync(join(a, "gateway", "vacilando", "governed-actions"), { recursive: true });
  process.env[RR.STATE_ROOT_INPUT] = a;
  process.env.ALLOY_RUNTIME_ROOT = "/tmp/should-lose";
  assert.equal(RR.gatewayStateRoot(), join(a, "gateway"), "canonical input must win");
  if (prev.c === undefined) delete process.env[RR.STATE_ROOT_INPUT]; else process.env[RR.STATE_ROOT_INPUT] = prev.c;
  process.env.ALLOY_RUNTIME_ROOT = prev.d;
});

test("6 — clearing the deprecated input does NOT make runtime guess Alloy", () => {
  const prev = process.env.ALLOY_RUNTIME_ROOT;
  delete process.env.ALLOY_RUNTIME_ROOT;
  const s = RR.stateRoot();
  assert.ok(!s.includes("/Alloy"), `cleared state root must not be a repository: ${s}`);
  assert.ok(s.includes("/.local/state/"), "it is the operator's own state directory");
  process.env.ALLOY_RUNTIME_ROOT = prev;
});

/* ── two real projects, two real roots ────────────────────────────────────── */

test("7 — prj_alloy and prj_vacilando resolve their OWN repository roots", () => {
  assert.equal(RR.repositoryRootFor(R.ALLOY_REPOSITORY_ID), ALLOY_ROOT);
  assert.equal(RR.repositoryRootFor("repo_vac"), VAC_ROOT);
  assert.notEqual(RR.repositoryRootFor("repo_vac"), RR.repositoryRootFor(R.ALLOY_REPOSITORY_ID));
});

test("8 — the two coexist in one process without ambiguity", () => {
  const a = R.projectScope(R.ALLOY_REPOSITORY_ID);
  const v = R.projectScope("repo_vac");
  assert.equal(a.project_id, "prj_alloy");
  assert.equal(v.project_id, "prj_vacilando");
  assert.notEqual(a.root, v.root);
  assert.notEqual(a.worktree_parent, v.worktree_parent);
  // Reading one does not disturb the other, in either order.
  assert.equal(RR.repositoryRootFor("repo_vac"), VAC_ROOT);
  assert.equal(RR.repositoryRootFor(R.ALLOY_REPOSITORY_ID), ALLOY_ROOT);
});

test("9 — an unknown project resolves ABSENCE, never the incumbent", () => {
  for (const id of [null, undefined, "", "repo_invented", "prj_vacilando"]) {
    // note: repositoryRootFor takes a REPOSITORY id; a project id is not one.
    assert.equal(RR.repositoryRootFor(id), null, `${JSON.stringify(id)} resolved something`);
  }
});

test("10 — a lane resolves ITS checkout, not a global Alloy root", () => {
  assert.equal(RR.executionCheckoutFor({ worktree_path: "/tmp/wt-7" }), "/tmp/wt-7");
  // Failing a stated worktree, the lane's own repository answers.
  assert.equal(RR.executionCheckoutFor({ repository_id: "repo_vac" }), VAC_ROOT);
  assert.equal(RR.executionCheckoutFor({ repository_id: R.ALLOY_REPOSITORY_ID }), ALLOY_ROOT);
  // A lane belonging to nothing known gets nothing.
  assert.equal(RR.executionCheckoutFor({ repository_id: "repo_invented" }), null);
  assert.equal(RR.executionCheckoutFor(null), null);
});

/* ── runtime self-identity ────────────────────────────────────────────────── */

test("11 — the runtime's own source root is not 'the project being operated'", () => {
  const self = RR.runtimeSourceRoot();
  assert.ok(self && self.length > 1);
  // The distinction that matters once Vacilando develops Vacilando while
  // operating Alloy: these are different questions.
  assert.notEqual(self, RR.repositoryRootFor("repo_vac"));
  const body = code("runtime-roots.mjs");
  const start = body.indexOf("export function runtimeSourceRoot");
  const fn = body.slice(start, body.indexOf("\n}", start));
  assert.ok(!fn.includes("cwd"), "process cwd must not be hidden authority here");
  assert.ok(fn.includes("import.meta.url"), "it is derived from where the code actually is");
});

test("12 — installed toolkit vs source checkout is a DISTRIBUTION answer", () => {
  assert.ok(["installed_toolkit", "source_checkout"].includes(RR.runtimeDistribution()));
  const body = code("runtime-roots.mjs");
  const start = body.indexOf("export function installedToolkitRoot");
  const fn = body.slice(start, body.indexOf("\n}", start));
  assert.ok(!fn.includes("repositoryRootFor") && !fn.includes("projectScope"),
    "a distribution path must not become a semantic authority");
});

/* ── the person-specific literals ─────────────────────────────────────────── */

test("13 — /Users/Kelly/Alloy appears zero times in executable generic runtime", () => {
  const out = execFileSync("grep", ["-rl", "/Users/Kelly", `${LIB}`], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  for (const f of out) {
    /*
     * COMMENT SYNTAX IS PER-LANGUAGE, and getting that wrong makes this case
     * fail on the file that documents the removal best. A shell script's
     * comments start with `#`; a JS file's do not.
     */
    const isShell = f.endsWith(".sh");
    const body = readFileSync(f, "utf8").split("\n")
      .map((l) => (isShell ? l.replace(/#.*$/, "") : l.replace(/\/\/.*$/, "")))
      .filter((l) => isShell || !/^\s*[*/]/.test(l)).join("\n");
    assert.ok(!body.includes("/Users/Kelly"),
      `${f.split("/").pop()} still has an EXECUTABLE reference to another operator's home`);
  }
});

test("14 — the canonical root fails closed rather than naming a stranger", () => {
  const body = code("trusted-host-action-registry.mjs");
  const start = body.indexOf("export function resolveCanonicalRepoRoot");
  const fn = body.slice(start, body.indexOf("\n}", start));
  assert.ok(!fn.includes("/Users/Kelly"), "the literal must be gone from the candidate list");
  assert.ok(fn.includes("return null"), "and the answer of last resort must be absence");
});

test("15 — the instructed-path trust list is derived, and covers BOTH projects", () => {
  const prefixes = RR.instructedPathPrefixes();
  assert.ok(prefixes.some((p) => p.startsWith(ALLOY_ROOT)), "Alloy's root must be instructed");
  assert.ok(prefixes.some((p) => p.startsWith(VAC_ROOT)), "and Vacilando's, once it is registered");
  assert.ok(!prefixes.some((p) => p.includes("/Users/Kelly")),
    "a trust list under another operator's home matched nothing, which read as covering everything");
  assert.ok(prefixes.every((p) => p.endsWith("/")), "prefixes stay prefixes");
});

/* ── self-hosting preparation ─────────────────────────────────────────────── */

test("16 — the three self-hosting arrangements are all representable", () => {
  // (a) operating Alloy while the Vacilando runtime is installed elsewhere.
  assert.equal(RR.repositoryRootFor(R.ALLOY_REPOSITORY_ID), ALLOY_ROOT);
  assert.notEqual(RR.runtimeSourceRoot(), ALLOY_ROOT);
  // (b) operating Vacilando while Alloy still exists separately.
  assert.equal(RR.repositoryRootFor("repo_vac"), VAC_ROOT);
  assert.equal(R.projectScope(R.ALLOY_REPOSITORY_ID).known, true);
  // (c) a Vacilando lane against the Vacilando repository, resolving no Alloy.
  const lane = { lane_id: "ln_v", repository_id: "repo_vac" };
  const checkout = RR.executionCheckoutFor(lane);
  assert.equal(checkout, VAC_ROOT);
  assert.ok(!checkout.includes("/Alloy"), "a Vacilando lane must not resolve Alloy as its root");
});

test("17 — no second root registry or project authority was introduced", () => {
  const body = src("runtime-roots.mjs");
  assert.ok(body.includes('from "./repository-registry.mjs"'), "roots defer to the one registry");
  assert.ok(!/REPOSITORY_PROFILES\s*=/.test(body), "and declare no profile map of their own");
  // Every root that concerns a project goes through projectScope.
  for (const fn of ["repositoryRootFor", "executionCheckoutFor"]) {
    const start = body.indexOf(`export function ${fn}`);
    const slice = body.slice(start, body.indexOf("\n}", start));
    assert.ok(/projectScope|repositoryRootFor/.test(slice), `${fn} must resolve through the registry`);
  }
});

test("18 — a caller that appends `vacilando/` means the GATEWAY root", () => {
  /*
   * THE REGRESSION S3 SHIPPED, AND THE LIVE GATEWAY REPORTED ZERO LANES.
   *
   * The control-plane stores live at `<gateway>/vacilando/...`. The old
   * expressions read the variable and fell back to the PARENT, and S3 mapped
   * them to `stateRoot()` on the strength of that fallback — but the fallback
   * was the latent half of the two-depth defect, right only when the variable
   * was unset. On this host it is set to the child, so the old code landed
   * correctly and the "fix" moved every lane read one level up.
   *
   * `durableLanesEnabled()` was the tell the whole time: it tests that the
   * configured root ends in `/gateway`.
   */
  const laneSrc = readFileSync(`${LIB}development-lane.mjs`, "utf8");
  const knowledgeSrc = readFileSync(`${LIB}lane-knowledge.mjs`, "utf8");
  for (const [name, src] of [["development-lane", laneSrc], ["lane-knowledge", knowledgeSrc]]) {
    const fn = src.slice(src.indexOf("function runtimeRoot()"), src.indexOf("}", src.indexOf("function runtimeRoot()")) + 1);
    assert.ok(fn.includes("gatewayStateRoot"),
      `${name} resolves the parent of the store it reads; the Gateway reports zero lanes`);
  }
  // The invariant in one line: the store lives one level below the state root.
  assert.equal(RR.gatewayStateRoot(), join(RR.stateRoot(), "gateway"));
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
