#!/usr/bin/env node
/**
 * Multi-repository lanes.
 *
 * THE ASSUMPTION THIS REMOVES. Every path in Vacilando assumed one repository,
 * and the load-bearing one was in startPersistentAgentSession: a provider could
 * only start under Alloy's single worktree root. Containment was right;
 * defining "managed" as one constant path was not.
 *
 * WHAT MUST STAY TRUE. A repository is an execution boundary, not a folder. Git
 * decides identity, not a display name or a path. A worktree is never a
 * repository. And nothing, ever, falls back to Alloy.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-repo-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

/**
 * A real repository root Vacilando is allowed to use, for fixtures.
 *
 * realpath'd deliberately: on macOS /var is a symlink to /private/var, and the
 * registry resolves symlinks before comparing paths — which is the security
 * property. A fixture using the unresolved form would fail the comparison for
 * the wrong reason.
 */
const SANDBOX = realpathSync(mkdtempSync(join(tmpdir(), "vac-repo-sandbox-")));
process.env.VACILANDO_REPOSITORY_ROOTS = SANDBOX;

const R = await import("../lib/vacilando/repository-registry.mjs");
const W = await import("../lib/vacilando/repository-worktree.mjs");
const M = await import("../lib/vacilando/repository-migration.mjs");
const { createDurableLane, getDurableLane, listDurableLanes, resetDevelopmentLanesForTests, setLaneRepository } =
  await import("../lib/vacilando/development-lane.mjs");
const { createLaneFolder, assignLaneToFolder, listLaneFolders, resetLaneFoldersForTests } =
  await import("../lib/vacilando/lane-folders.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");

const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

/** A real Git repository, with a deliberately non-default branch name. */
function makeRepo(name, { branch = "trunk", remote = null } = {}) {
  const dir = join(SANDBOX, name);
  mkdirSync(dir, { recursive: true });
  git(["init", "-q", "-b", branch, "."], dir);
  git(["config", "user.email", "t@t"], dir);
  git(["config", "user.name", "T"], dir);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "init"], dir);
  if (remote) git(["remote", "add", "origin", remote], dir);
  return dir;
}

const reset = () => { R.resetRepositoriesForTests(); resetDevelopmentLanesForTests(); };

// ------------------------------------------------------------ identity

test("equivalent remote forms normalise to one identity", () => {
  const forms = [
    "git@github.com:org/repo.git",
    "https://github.com/org/Repo.git",
    "ssh://git@github.com/org/repo",
    "https://user@github.com/org/repo/",
  ];
  const seen = new Set(forms.map(R.normalizeRemote));
  assert.equal(seen.size, 1, [...seen].join(" | "));
  assert.equal(R.normalizeRemote(""), null);
});

test("a repository is identified by Git, not by its display name", async () => {
  reset();
  const dir = makeRepo("ident");
  const a = await R.registerLocalRepository({ path: dir, name: "First" });
  assert.equal(a.ok, true, a.error);
  const b = await R.registerLocalRepository({ path: dir, name: "A Completely Different Name" });
  assert.equal(b.error, "repository_already_registered");
});

test("a worktree is never registered as its own repository", async () => {
  reset();
  const dir = makeRepo("parent");
  await R.registerLocalRepository({ path: dir, name: "Parent" });
  const wt = join(SANDBOX, "parent-wt");
  git(["worktree", "add", "-b", "side", wt, "trunk"], dir);
  const out = await R.registerLocalRepository({ path: wt, name: "Sneaky" });
  assert.equal(out.error, "path_is_worktree");
  // It names the parent, so the operator has somewhere to go.
  assert.equal(out.parent_root, dir);
});

test("a worktree reports its parent's Git common directory", async () => {
  const dir = join(SANDBOX, "parent");
  const wt = join(SANDBOX, "parent-wt");
  const main = await R.inspectGitPath(dir);
  const side = await R.inspectGitPath(wt);
  assert.equal(main.is_worktree, false);
  assert.equal(side.is_worktree, true);
  assert.equal(side.git_common_dir, main.git_common_dir, "one object store");
});

// -------------------------------------------------------- containment

test("paths outside approved roots are refused", () => {
  assert.equal(R.containPath("/etc/passwd").error, "path_outside_approved_roots");
  assert.equal(R.containPath("relative").error, "path_must_be_absolute");
  assert.equal(R.containPath("").error, "path_required");
});

test("a symlink cannot escape an approved root", () => {
  // A prefix test on the LITERAL path would pass this; resolving first is what
  // actually stops it.
  const link = join(SANDBOX, "escape-link");
  try { rmSync(link, { force: true }); } catch { /* */ }
  symlinkSync("/etc", link);
  const out = R.containPath(link);
  assert.equal(out.ok, false, "a symlink to /etc must not be accepted");
  assert.equal(out.error, "path_outside_approved_roots");
});

test("a sibling directory sharing a prefix is not inside the root", () => {
  // "/tmp/sandboxEVIL" must not pass as being inside "/tmp/sandbox".
  const evil = `${SANDBOX}EVIL`;
  mkdirSync(evil, { recursive: true });
  assert.equal(R.containPath(evil).ok, false);
});

// ----------------------------------------------------------- profiles

test("the generic profile assumes no Alloy concept", () => {
  const g = R.profileFor("generic");
  assert.equal(g.slots, false);
  assert.equal(g.governed_promotion, false);
  assert.equal(g.sprint_tooling, false);
  assert.equal(g.fixed_ports, false);
  assert.equal(g.branch_policy.prefix, "");
});

test("the Alloy profile keeps its conventions", () => {
  const a = R.profileFor("alloy");
  assert.equal(a.slots, true);
  assert.equal(a.governed_promotion, true);
  assert.equal(a.branch_policy.prefix, "agent/");
});

test("a repository uses its OWN default branch, never staging", async () => {
  reset();
  const dir = makeRepo("branchy", { branch: "trunk" });
  const out = await R.registerLocalRepository({ path: dir, name: "Branchy" });
  assert.equal(out.repository.default_branch, "trunk");
  assert.equal(out.repository.default_branch.includes("staging"), false);
});

test("a local-only repository is supported and labelled truthfully", async () => {
  reset();
  const dir = makeRepo("lonely");
  const out = await R.registerLocalRepository({ path: dir, name: "Lonely" });
  assert.equal(out.ok, true);
  assert.equal(out.repository.has_remote, false);
  assert.equal(out.repository.remote, null);
});

test("worktrees are never placed inside the repository", async () => {
  reset();
  const dir = makeRepo("inside");
  const out = await R.registerLocalRepository({ path: dir, name: "Inside", worktreeParent: join(dir, "wt") });
  assert.equal(out.error, "worktree_parent_inside_repository");
});

// -------------------------------------------------- worktree lifecycle

test("provisioning a worktree proves it belongs to the repository", async () => {
  reset();
  const dir = makeRepo("prov");
  const reg = await R.registerLocalRepository({ path: dir, name: "Prov" });
  const made = await W.createRepositoryWorktree({ repositoryId: reg.repository.repository_id, laneName: "My Lane" });
  assert.equal(made.ok, true, made.error);
  assert.equal(made.base_ref, "trunk");
  assert.equal(made.git_common_dir, `${dir}/.git`);
  assert.ok(made.worktree_path.startsWith(reg.repository.worktree_parent));
  assert.ok(existsSync(made.worktree_path));
});

test("a generic repository gets no branch prefix", async () => {
  const repos = R.listRepositories({});
  const prov = repos.find((r) => r.name === "Prov");
  assert.equal(W.branchNameFor(prov, "My Lane"), "my-lane", "no agent/ prefix on a generic repo");
});

test("a colliding branch or destination is refused, not adopted", async () => {
  const reg = R.listRepositories({}).find((r) => r.name === "Prov");
  const again = await W.createRepositoryWorktree({ repositoryId: reg.repository_id, laneName: "My Lane" });
  assert.ok(["destination_exists", "branch_exists"].includes(again.error), again.error);
});

test("a named branch names the worktree directory too", async () => {
  // The wizard previews `<worktree parent>/<branch leaf>` next to the branch it
  // derived it from; naming the directory after the lane instead created
  // `.../ui` under a review screen that read `.../vui`.
  const reg = R.listRepositories({}).find((r) => r.name === "Prov");
  const made = await W.createRepositoryWorktree({
    repositoryId: reg.repository_id, laneName: "ui", branch: "agent/vui",
  });
  assert.equal(made.ok, true, made.error);
  assert.equal(made.branch, "agent/vui");
  assert.equal(made.worktree_name, "vui");
  assert.equal(made.worktree_path, `${reg.worktree_parent}/vui`);
});

test("a branch Git would reject is refused before the worktree is built", () => {
  const reg = R.listRepositories({}).find((r) => r.name === "Prov");
  assert.equal(W.validBranchName("agent/vui"), true);
  assert.equal(W.validBranchName("agent/../evil"), false);
  assert.equal(W.validBranchName("agent//evil"), false);
  assert.equal(W.validBranchName("agent/.hidden"), false);
  assert.equal(W.branchNameFor(reg, "L", { explicit: "agent/../evil" }), null);
});

test("a missing base ref fails closed instead of guessing", async () => {
  const reg = R.listRepositories({}).find((r) => r.name === "Prov");
  const out = await W.createRepositoryWorktree({
    repositoryId: reg.repository_id, laneName: "Other", baseRef: "refs/heads/does-not-exist",
  });
  assert.equal(out.error, "base_ref_not_found");
});

test("connecting a worktree from ANOTHER repository fails closed", async () => {
  reset();
  const a = makeRepo("repo-a");
  const b = makeRepo("repo-b");
  const ra = await R.registerLocalRepository({ path: a, name: "A" });
  await R.registerLocalRepository({ path: b, name: "B" });
  const bWt = join(SANDBOX, "b-side");
  git(["worktree", "add", "-b", "bside", bWt, "trunk"], b);
  const out = await W.connectRepositoryWorktree({ repositoryId: ra.repository.repository_id, path: bWt });
  assert.equal(out.ok, false);
  assert.equal(out.error, "cross_repository_binding_refused");
  assert.notEqual(out.expected, out.actual);
});

test("git truth resolves through the lane's own repository", async () => {
  const ra = R.listRepositories({}).find((r) => r.name === "A");
  const wt = join(SANDBOX, "a-side");
  git(["worktree", "add", "-b", "aside", wt, "trunk"], join(SANDBOX, "repo-a"));
  const st = await W.repositoryGitStatus(wt, { repositoryId: ra.repository_id });
  assert.equal(st.ok, true, st.error);
  assert.equal(st.base_ref, "trunk", "never compared to Alloy staging");
  assert.equal(st.has_remote, false);
  assert.equal(st.branch, "aside");
});

test("git truth refuses a worktree from a different repository", async () => {
  const ra = R.listRepositories({}).find((r) => r.name === "A");
  const st = await W.repositoryGitStatus(join(SANDBOX, "b-side"), { repositoryId: ra.repository_id });
  assert.equal(st.error, "cross_repository_binding_refused");
});

// ------------------------------------------------- managed-path boundary

test("managed means 'in a registered repository', not one hard-coded path", async () => {
  const a = R.listRepositories({}).find((r) => r.name === "A");
  // A worktree inside the repository's own parent is managed.
  const made = await W.createRepositoryWorktree({ repositoryId: a.repository_id, laneName: "Managed One" });
  assert.equal(made.ok, true, made.error);
  assert.equal(R.managedWorktreePath(made.worktree_path).repository_id, a.repository_id);
  assert.equal(R.managedWorktreePath("/tmp").ok, false);
  assert.equal(R.managedWorktreePath("/tmp").error, "worktree_not_managed");
});

test("a worktree outside the default parent is managed once a lane binds it", () => {
  // Connect and start must agree. Before this, connecting a pre-existing
  // worktree succeeded and then starting the provider on the SAME path was
  // refused as unmanaged.
  const a = R.listRepositories({}).find((r) => r.name === "A");
  const outside = join(SANDBOX, "a-side");
  assert.equal(R.managedWorktreePath(outside).ok, false, "not managed before any lane binds it");
  const lane = createDurableLane({ name: "Connected", binding: { worktree_path: outside, tmux_session: "alloy-conn" } });
  setLaneRepository(lane.lane.lane_id, a.repository_id);
  const after = R.managedWorktreePath(outside);
  assert.equal(after.ok, true, "a bound worktree of an active repository is managed");
  assert.equal(after.via, "lane_binding");
});

test("a retired repository stops being a managed location", async () => {
  const b = R.listRepositories({}).find((r) => r.name === "B");
  const made = await W.createRepositoryWorktree({ repositoryId: b.repository_id, laneName: "B Lane" });
  assert.equal(made.ok, true, made.error);
  assert.equal(R.managedWorktreePath(made.worktree_path).ok, true);
  R.retireRepository(b.repository_id, { activeLaneIds: [] });
  assert.equal(R.managedWorktreePath(made.worktree_path).ok, false, "a disconnected repository is not a place to run");
  R.reactivateRepository(b.repository_id);
});

test("retirement is refused while work is running, and deletes nothing", () => {
  const b = R.listRepositories({}).find((r) => r.name === "B");
  const busy = R.retireRepository(b.repository_id, { activeLaneIds: ["lane_x"] });
  assert.equal(busy.error, "repository_has_active_work");
  const ok = R.retireRepository(b.repository_id, { activeLaneIds: [] });
  assert.ok(ok.preserved.includes("worktrees"));
  assert.ok(existsSync(join(SANDBOX, "repo-b")), "the repository is still on disk");
  R.reactivateRepository(b.repository_id);
});

// ------------------------------------------------------------ migration

test("existing lanes migrate to Alloy without changing anything else", async () => {
  reset();
  const alloyish = makeRepo("alloy-stand-in");
  // Stand in for Alloy: same shape, registered under the fixed Alloy id.
  const store = R.readRepositoryStore();
  const info = await R.inspectGitPath(alloyish);
  store.repositories[R.ALLOY_REPOSITORY_ID] = {
    schema_version: R.REPOSITORY_SCHEMA, repository_id: R.ALLOY_REPOSITORY_ID, name: "Alloy",
    root: info.root, git_common_dir: info.git_common_dir, remote: null, default_branch: "trunk",
    worktree_parent: join(SANDBOX, "alloy-wt"), profile: "alloy", state: "ACTIVE",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  writeFileSync(R.repositoryStorePath(), JSON.stringify(store, null, 2));

  const wt = join(SANDBOX, "alloy-wt", "lane-one");
  mkdirSync(join(SANDBOX, "alloy-wt"), { recursive: true });
  git(["worktree", "add", "-b", "lane-one", wt, "trunk"], alloyish);
  const bound = createDurableLane({ name: "Bound Lane", binding: { worktree_path: wt, tmux_session: "alloy-x" } });
  const unbound = createDurableLane({ name: "Planning Lane" });
  assert.equal(bound.ok, true, bound.error);

  const before = M.laneInvariantSnapshot({});
  const out = await M.migrateLanesToAlloy({});
  assert.equal(out.ok, true, out.error);
  assert.equal(out.refused.length, 0, JSON.stringify(out.refused));
  assert.equal(out.attributed.length, 2);
  assert.deepEqual(out.invariant_drift, [], "migration changed something it must not");
  assert.deepEqual(M.diffInvariants(before, M.laneInvariantSnapshot({})), []);
  assert.equal(getDurableLane(bound.lane.lane_id).repository_id, R.ALLOY_REPOSITORY_ID);
  assert.equal(getDurableLane(unbound.lane.lane_id).repository_id, R.ALLOY_REPOSITORY_ID);
  // Evidence differs by kind, and both are honest.
  assert.equal(out.attributed.find((a) => a.name === "Bound Lane").evidence, "git_common_dir_match");
  assert.equal(out.attributed.find((a) => a.name === "Planning Lane").evidence, "pre_registry_unbound_lane");
});

test("migration is idempotent", async () => {
  const again = await M.migrateLanesToAlloy({});
  assert.equal(again.attributed.length, 0);
  assert.equal(again.skipped.length, 2);
  assert.deepEqual(again.invariant_drift, []);
});

test("a lane in a DIFFERENT object store is refused, never defaulted to Alloy", async () => {
  const other = makeRepo("not-alloy");
  const wt = join(SANDBOX, "not-alloy-wt");
  git(["worktree", "add", "-b", "side", wt, "trunk"], other);
  const stray = createDurableLane({ name: "Stray", binding: { worktree_path: wt, tmux_session: "alloy-stray" } });
  const out = await M.migrateLanesToAlloy({});
  const refusal = out.refused.find((r) => r.lane_id === stray.lane.lane_id);
  assert.ok(refusal, "a foreign lane must be refused");
  assert.equal(refusal.reason, "different_git_object_store");
  assert.equal(getDurableLane(stray.lane.lane_id).repository_id, null, "and left unattributed");
  assert.equal(M.unattributedLanes({}).length, 1);
});

// -------------------------------------------------------------- folders

test("folder names are unique per repository, not globally", () => {
  resetLaneFoldersForTests();
  const a = createLaneFolder({ name: "Active", repositoryId: "repo_one" });
  const b = createLaneFolder({ name: "Active", repositoryId: "repo_two" });
  const dup = createLaneFolder({ name: "Active", repositoryId: "repo_one" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true, "the same name in another repository is a different folder");
  assert.equal(dup.error, "folder_name_taken");
});

test("folders list can be scoped to one repository", () => {
  assert.equal(listLaneFolders(undefined, { repositoryId: "repo_one" }).length, 1);
  assert.equal(listLaneFolders().length, 2, "unscoped still lists all");
});

test("a lane cannot be filed into another repository's folder", () => {
  const lane = createDurableLane({ name: "Filed" });
  setLaneRepository(lane.lane.lane_id, "repo_one");
  const foreign = listLaneFolders(undefined, { repositoryId: "repo_two" })[0];
  const out = assignLaneToFolder(lane.lane.lane_id, foreign.folder_id);
  assert.equal(out.error, "folder_repository_mismatch");
});

test("moving a lane between repositories is explicit, not a folder move", () => {
  const lane = listDurableLanes().find((l) => l.name === "Filed");
  // A rebind must state what it believes the current attribution is.
  const wrong = setLaneRepository(lane.lane_id, "repo_two", { expectCurrent: null });
  assert.equal(wrong.error, "repository_attribution_conflict");
  const right = setLaneRepository(lane.lane_id, "repo_two", { expectCurrent: "repo_one" });
  assert.equal(right.ok, true);
});

// ------------------------------------------------------------------- UI

test("the lane list groups by repository when there is more than one", () => {
  const lanes = [
    { lane_id: "a", label: "Alloy Lane", repository_id: "repo_alloy" },
    { lane_id: "b", label: "Other Lane", repository_id: "repo_two" },
  ];
  const repos = [
    { repository_id: "repo_alloy", name: "Alloy", profile: "alloy", default_branch: "origin/staging", has_remote: true },
    { repository_id: "repo_two", name: "Fixture", profile: "generic", default_branch: "trunk", has_remote: false },
  ];
  const html = V.renderLaneList(lanes, null, { repositories: repos, folders: [], collapsedFolders: new Set() });
  assert.ok(html.includes('data-gw-repo-toggle="repo_alloy"'));
  assert.ok(html.includes('data-gw-repo-toggle="repo_two"'));
  assert.ok(html.includes("local only"), "a remote-less repo says so");
});

test("one repository keeps the list shape the operator already knows", () => {
  const html = V.renderLaneList([{ lane_id: "a", label: "L", repository_id: "repo_alloy" }], null, {
    repositories: [{ repository_id: "repo_alloy", name: "Alloy" }], folders: [], collapsedFolders: new Set(),
  });
  assert.equal(html.includes("gw-repo-h"), false, "no repository chrome for a single repository");
});

test("a lane whose repository is unknown is shown, not hidden", () => {
  const groups = V.groupLanesByRepository(
    [{ lane_id: "x", label: "Orphan", repository_id: "repo_gone" }],
    [{ repository_id: "repo_alloy", name: "Alloy" }], [],
  );
  const unknown = groups.find((g) => g.repository_id === V.UNKNOWN_REPOSITORY_ID);
  assert.ok(unknown, "an unattributable lane must still appear");
  assert.equal(unknown.lanes.length, 1);
});

test("repository grouping preserves attention-first ordering", () => {
  const t = (h) => new Date(`2026-08-23T${h}:00:00Z`).toISOString();
  const lanes = [
    { lane_id: "idle", label: "Idle", repository_id: "r1", execution_run: { state: "COMPLETE", updated_at: t("18") } },
    { lane_id: "blocked", label: "Blocked", repository_id: "r2", execution_run: { state: "NEEDS_INPUT", updated_at: t("09"), state_reason: "?" } },
  ];
  const repos = [{ repository_id: "r1", name: "Quiet" }, { repository_id: "r2", name: "Busy" }];
  const groups = V.groupLanesByRepository(lanes, repos, []);
  assert.equal(groups[0].repository_id, "r2", "the repository holding blocked work comes first");
});

test("Details shows repository identity read-only", () => {
  const html = V.renderLaneRepository({ repository_id: "r1" }, [
    { repository_id: "r1", name: "Fixture", default_branch: "trunk", has_remote: false, profile_label: "Git repository" },
  ]);
  assert.ok(html.includes("Fixture"));
  assert.ok(html.includes("local only"));
  // No control that could rebind execution.
  assert.equal(/<select|<input/.test(html), false, "repository must not be editable from Details");
});

test("an unattributed lane says so in Details", () => {
  assert.ok(V.renderLaneRepository({}, []).includes("Not attributed"));
});

test("every repository refusal has operator-facing copy", () => {
  for (const e of ["path_outside_approved_roots", "path_not_found", "not_a_git_repository", "path_is_worktree",
    "repository_already_registered", "worktree_parent_inside_repository", "repository_has_active_work",
    "cross_repository_binding_refused", "clone_not_implemented", "repository_not_active"]) {
    const text = V.repositoryErrorText(e, { approved_roots: ["/x"], active_lanes: ["a"] });
    assert.ok(text && !text.includes("_"), `${e} -> ${text}`);
  }
});
