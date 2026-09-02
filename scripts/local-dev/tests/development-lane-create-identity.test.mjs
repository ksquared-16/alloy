#!/usr/bin/env node
/**
 * A HUMAN LANE NAME IS NOT A PATH.
 *
 * THE DEFECT. The Director tried to create an ordinary lane through the UI and
 * was told "That path contains characters Vacilando will not open." No path was
 * involved and no character was at fault. `createNewLaneRequest` refused
 * `branch` and `worktree_path` on its first line as "path-like fields" — and
 * then, seventy lines later, read `body.branch` to name a new worktree's branch
 * and `body.worktree_path` to connect an existing one. The function could never
 * reach either of its own workspace modes; the route's allowlist named both
 * fields as accepted; and the browser rendered the refusal with the repository
 * text about characters.
 *
 * Measured against the live Gateway before the fix:
 *   {name:"Billing & Invoices", workspace_mode:"planning"}         -> created
 *   {..., workspace_mode:"new_worktree", branch:"billing-invoices"} -> path_refused ['branch']
 *   {..., workspace_mode:"connect_existing", worktree_path:"/…"}    -> path_refused ['worktree_path']
 * The lane NAME was never the problem. The operator was refused for filling in
 * a field the wizard itself offers.
 *
 * The contract these lock down:
 *   human name -> validated lane identity -> Vacilando-generated safe slug,
 *   branch and worktree path -> lane created.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-lane-create-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const { createNewLaneRequest, renameLaneRequest } = await import("../lib/vacilando/lane-identity-api.mjs");
const { branchNameFor, worktreeNameFor } = await import("../lib/vacilando/repository-worktree.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");
const { resetDevelopmentLanesForTests } = await import("../lib/vacilando/development-lane.mjs");
const View = await import("../apps/vacilando/public/gateway-view.mjs");

writeFileSync(repositoryStorePath(ROOT), `${JSON.stringify({
  schema_version: "vacilando.repository.v1",
  repositories: {
    repo_alloy: {
      schema_version: "vacilando.repository.v1",
      repository_id: "repo_alloy", name: "Alloy", profile: "alloy", state: "ACTIVE",
      root: join(ROOT, "r"), git_common_dir: join(ROOT, "r", ".git"),
      worktree_parent: join(ROOT, "w"), default_branch: "origin/staging",
      remote: "git@github.com:ksquared-16/alloy.git",
      branch_policy: { prefix: "agent/claude/" },
      created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
    },
  },
}, null, 2)}\n`, "utf8");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const REPO = { repository_id: "repo_alloy", branch_policy: { prefix: "agent/claude/" }, profile: "alloy" };

// ------------------------------------------------- the reported failure
await test("an ordinary human lane name with punctuation is accepted", async () => {
  for (const name of ["Billing & Invoices", "Q3 Planning (draft)", "Auth: sign-in flow", "Café — notes"]) {
    const out = await createNewLaneRequest({
      name, provider: "claude", repository_id: "repo_alloy", workspace_mode: "planning",
    });
    assert.equal(out.status, 200, `${name}: ${JSON.stringify(out.body)}`);
    assert.equal(out.body.lane.name, name, "the human display name is preserved verbatim");
  }
});

await test("the wizard's own Branch name field no longer refuses the request", async () => {
  // Exactly what the browser sends when the operator types into the field the
  // wizard renders for them.
  const out = await createNewLaneRequest({
    name: "Billing & Invoices", provider: "claude", repository_id: "repo_alloy",
    workspace_mode: "new_worktree", branch: "billing-invoices",
  });
  assert.notEqual(out.body.error, "path_refused", "branch is an input this endpoint documents and consumes");
  assert.equal(out.status, 200, JSON.stringify(out.body));
});

await test("connect-existing no longer refuses its own worktree path", async () => {
  const out = await createNewLaneRequest({
    name: "Connected", provider: "claude", repository_id: "repo_alloy",
    workspace_mode: "connect_existing", worktree_path: join(ROOT, "w", "wt1-somewhere"),
  });
  assert.notEqual(out.body.error, "path_refused");
  assert.equal(out.status, 200, JSON.stringify(out.body));
});

// ------------------------------------------------- what stays refused
await test("runtime identity a caller may never supply is still refused", async () => {
  for (const field of ["slot", "port", "tmux_session", "command", "argv", "cwd", "path", "directory", "worktree"]) {
    const out = await createNewLaneRequest({
      name: "Overreach", provider: "claude", repository_id: "repo_alloy",
      workspace_mode: "planning", [field]: field === "slot" || field === "port" ? 3 : "x",
    });
    assert.equal(out.status, 400, `${field} must be refused`);
    assert.equal(out.body.error, "runtime_identity_refused", field);
    assert.deepEqual(out.body.fields, [field]);
  }
});

await test("rename stays strict: it has no workspace step at all", () => {
  const out = renameLaneRequest("lane_000000000000", { name: "New", branch: "x" });
  assert.equal(out.status, 400);
  assert.equal(out.body.error, "path_refused", "a workspace field on rename is still caller overreach");
});

await test("the refusal now says what actually happened", () => {
  const text = View.repositoryErrorText("runtime_identity_refused", { fields: ["slot", "port"] });
  assert.match(text, /slot/);
  assert.match(text, /port/);
  assert.ok(!/characters/.test(text), "it is not about characters");
});

// ------------------------------------------------- the identity contract
await test("a human string becomes a safe branch under the repository prefix", () => {
  assert.equal(branchNameFor(REPO, "Billing & Invoices"), "agent/claude/billing-invoices");
  assert.equal(branchNameFor(REPO, "Q3 Planning (draft)"), "agent/claude/q3-planning-draft");
  // The explicit field gets the same treatment — the operator is shown a slug
  // placeholder, but typing prose into it must not cost them the lane.
  assert.equal(branchNameFor(REPO, "anything", { explicit: "Billing & Invoices" }), "agent/claude/billing-invoices");
  assert.equal(branchNameFor(REPO, "anything", { explicit: "Q3 Planning (draft)" }), "agent/claude/q3-planning-draft");
});

await test("an explicit value that is already a real ref is honoured exactly", () => {
  // Someone who typed a ref meant that ref; slugging it would silently retarget.
  assert.equal(branchNameFor(REPO, "x", { explicit: "agent/claude/5-work-unit" }), "agent/claude/5-work-unit");
  assert.equal(branchNameFor(REPO, "x", { explicit: "promote/thing" }), "promote/thing");
});

await test("nothing unsafe is invented, and traversal never survives", () => {
  assert.equal(branchNameFor(REPO, "x", { explicit: "../../etc/passwd" }), "agent/claude/etc-passwd");
  assert.equal(branchNameFor(REPO, "x", { explicit: "a/../b" }), "agent/claude/a-b");
  assert.equal(branchNameFor(REPO, "!!!", { explicit: "!!!" }), null, "a string with nothing to slug yields no branch");
  // Without an explicit value the neutral fallback is correct: a lane always
  // has a validated name by the time this runs, and a nameless one still needs
  // a safe ref rather than none.
  assert.equal(branchNameFor(REPO, ""), "agent/claude/lane");
  for (const b of ["agent/claude/billing-invoices", "agent/claude/q3-planning-draft"]) {
    assert.ok(!/[^A-Za-z0-9._/-]/.test(b), `${b} must be git-safe`);
    assert.ok(!b.includes(".."), `${b} must not traverse`);
  }
});

await test("worktree names stay filesystem-safe whatever the human wrote", () => {
  assert.equal(worktreeNameFor("Billing & Invoices"), "billing-invoices");
  assert.equal(worktreeNameFor("../../escape"), "escape");
  assert.equal(worktreeNameFor("Café — notes"), "caf-notes");
  assert.equal(worktreeNameFor(""), "lane");
  for (const n of ["billing-invoices", "escape", "caf-notes", "lane"]) {
    assert.ok(!n.includes("/") && !n.includes(".."), n);
  }
});

await test("the browser preview and the server agree on the generated identity", () => {
  // Two implementations of one slug would drift; the preview the operator reads
  // must be the identity they get.
  for (const name of ["Billing & Invoices", "Q3 Planning (draft)", "Auth: sign-in flow"]) {
    assert.equal(View.previewBranch(REPO, name), branchNameFor(REPO, name),
      `preview and server disagree for ${name}`);
  }
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
