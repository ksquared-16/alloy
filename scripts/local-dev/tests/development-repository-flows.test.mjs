#!/usr/bin/env node
/**
 * Add Repository and Add Lane as real product flows.
 *
 * WHAT REPLACED WHAT. Both were chains of window.prompt(). A prompt chain has
 * already acted by the time the operator sees what they picked: it cannot show
 * that a path is a worktree rather than a repository, cannot preview the branch
 * and worktree it will create, and cannot be stepped back through. These flows
 * validate first, show what was found, and create nothing until a confirmation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const V = await import("../apps/vacilando/public/gateway-view.mjs");
const clientSrc = readFileSync(join(HERE, "..", "apps", "vacilando", "public", "gateway.js"), "utf8");

const REPOS = [
  { repository_id: "r_alloy", name: "Alloy", profile: "alloy", default_branch: "origin/staging",
    has_remote: true, branch_policy: { prefix: "agent/" }, worktree_parent: "/Users/x/Code/alloy-worktrees",
    git_common_dir: "/Users/x/Alloy/.git" },
  { repository_id: "r_fix", name: "Fixture", profile: "generic", default_branch: "trunk",
    has_remote: false, branch_policy: { prefix: "" }, worktree_parent: "/Users/x/Code/fx-worktrees",
    git_common_dir: "/Users/x/Code/fx/.git" },
];
const FOLDERS = [
  { folder_id: "f_fix", name: "Active", repository_id: "r_fix", lane_count: 1 },
  { folder_id: "f_alloy", name: "Platform", repository_id: "r_alloy", lane_count: 3 },
];

// --------------------------------------------------------- no prompts remain

test("repository and lane creation use no browser prompts", () => {
  // The flows they belong to, by the functions that own them.
  for (const fn of ["addRepositoryFlow", "validateRepositoryPath", "confirmRepositoryRegistration",
    "openLaneWizard", "wizardCreate", "wizardValidateWorktree"]) {
    const start = clientSrc.indexOf(`function ${fn}(`);
    assert.ok(start > 0, `${fn} is missing`);
    const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
    assert.equal(/window\.(prompt|confirm|alert)\s*\(/.test(body), false,
      `${fn} still uses a browser dialog`);
  }
});

test("the sheets render real form controls, not dialogs", () => {
  const rs = V.renderRepositorySheet({ path: "" });
  assert.ok(rs.includes('data-gw-repo-path'), "a real path field");
  assert.ok(rs.includes("data-gw-repo-validate"));
  assert.ok(rs.includes("data-gw-sheet-cancel"));
});

// ------------------------------------------- validate without persisting

test("Add Repository shows what was found before anything is registered", () => {
  const html = V.renderRepositorySheet({
    path: "/Users/x/Code/fx",
    validation: {
      path: "/Users/x/Code/fx", root: "/Users/x/Code/fx", git_common_dir: "/Users/x/Code/fx/.git",
      default_branch: "trunk", has_remote: false, profile: "generic",
    },
  });
  for (const shown of ["/Users/x/Code/fx", "/Users/x/Code/fx/.git", "trunk", "Local only", "Generic Git"]) {
    assert.ok(html.includes(shown), `result panel is missing ${shown}`);
  }
  assert.ok(html.includes("fx-worktrees"), "the proposed worktree parent is shown");
  assert.ok(html.includes("data-gw-repo-confirm"), "and only now is Confirm offered");
});

test("validation alone offers no way to register", () => {
  const before = V.renderRepositorySheet({ path: "/Users/x/Code/fx" });
  assert.equal(before.includes("data-gw-repo-confirm"), false, "Confirm must not exist before validation");
  assert.ok(before.includes("data-gw-repo-validate"));
});

test("the inspect endpoint used for validation is read-only", () => {
  const start = clientSrc.indexOf("async function validateRepositoryPath(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("/api/repositories/inspect"));
  assert.equal(/method:\s*"POST"/.test(body), false, "validation must not POST anything");
});

test("a worktree is refused in the sheet, naming its parent", () => {
  const html = V.renderRepositorySheet({
    path: "/wt", validation: { root: "/wt", git_common_dir: "/p/.git", is_worktree: true, parent_root: "/p" },
  });
  assert.ok(html.includes("worktree of"));
  assert.ok(html.includes("/p"));
  assert.equal(html.includes("data-gw-repo-confirm"), false, "and cannot be registered");
});

test("an already-registered repository cannot be registered again", () => {
  const html = V.renderRepositorySheet({
    path: "/x", validation: { root: "/x", git_common_dir: "/x/.git", already_registered: { name: "Fixture" } },
  });
  assert.ok(html.includes("Already registered"));
  assert.equal(html.includes("data-gw-repo-confirm"), false);
});

test("Clone is visible and honestly unavailable", () => {
  const html = V.renderRepositorySheet({ method: "clone" });
  assert.ok(html.includes("Clone is not available yet"));
  assert.ok(html.includes("Connect local"), "and it says what to do instead");
  assert.equal(html.includes("data-gw-repo-confirm"), false);
});

test("cancel exists on every sheet and creates nothing", () => {
  for (const html of [V.renderRepositorySheet({}), V.renderLaneWizard({ step: "repository", repositories: REPOS })]) {
    assert.ok(html.includes("data-gw-sheet-cancel"));
  }
  const start = clientSrc.indexOf("function closeSheets(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("G.repositorySheet = null") && body.includes("G.laneWizard = null"));
  assert.equal(/gwFetch|method:\s*"POST"/.test(body), false, "cancel must not call the API at all");
});

// --------------------------------------------------------------- lane steps

test("the wizard has the six required steps in order", () => {
  assert.deepEqual(V.LANE_STEPS.map((s) => s.id),
    ["repository", "folder", "identity", "workspace", "provider", "review"]);
});

test("steps gate on decisions, not on a counter", () => {
  assert.equal(V.laneStepReady("folder", {}), false, "no repository chosen yet");
  assert.equal(V.laneStepReady("workspace", { repository_id: "r_fix" }), false, "no lane name yet");
  assert.equal(V.laneStepReady("workspace", { repository_id: "r_fix", name: "x" }), true);
  assert.equal(V.laneStepReady("review", { workspace_mode: "new_worktree" }), false, "no provider yet");
  assert.equal(V.laneStepReady("review", { workspace_mode: "planning" }), true, "planning needs none");
});

test("the repository step lists active repositories and a way to add one", () => {
  const html = V.renderLaneWizard({ step: "repository", repositories: REPOS, draft: {} });
  assert.ok(html.includes('data-gw-wiz-repo="r_alloy"'));
  assert.ok(html.includes('data-gw-wiz-repo="r_fix"'));
  assert.ok(html.includes("Alloy managed sprint") && html.includes("Generic Git"));
  assert.ok(html.includes("trunk") && html.includes("local only"), "profile and base branch are shown");
  assert.ok(html.includes("data-gw-wiz-add-repo"), "Add repository is a route into the flow");
});

test("a retired repository is not offered", () => {
  const html = V.renderLaneWizard({
    step: "repository", draft: {},
    repositories: [...REPOS, { repository_id: "r_old", name: "Retired", state: "RETIRED" }],
  });
  assert.equal(html.includes('data-gw-wiz-repo="r_old"'), false);
});

test("the folder step shows only the selected repository's folders", () => {
  const html = V.renderLaneWizard({
    step: "folder", repositories: REPOS, folders: FOLDERS, draft: { repository_id: "r_fix" },
  });
  assert.ok(html.includes('data-gw-wiz-folder="f_fix"'), "its own folder");
  assert.equal(html.includes('data-gw-wiz-folder="f_alloy"'), false, "never another repository's");
  assert.ok(html.includes('data-gw-wiz-folder=""'), "No folder is a choice");
  assert.ok(html.includes("data-gw-wiz-newfolder"), "and a folder can be created here");
});

test("switching repository clears choices scoped to the old one", () => {
  // Otherwise the folder step would offer a folder from the previous repository.
  const start = clientSrc.indexOf('const repo = hit("[data-gw-wiz-repo]");');
  const body = clientSrc.slice(start, start + 700);
  assert.ok(body.includes("d.folder_id = null"));
  assert.ok(body.includes("d.worktree_path"));
});

test("lane identity validates without touching durable state", () => {
  const html = V.renderLaneWizard({
    step: "identity", repositories: REPOS, draft: { repository_id: "r_fix" }, nameError: "Give this lane a name.",
  });
  assert.ok(html.includes("Give this lane a name."));
  assert.ok(html.includes("data-gw-wiz-name"));
  // Inline, not an alert.
  assert.ok(html.includes("gw-field-err"));
});

// ----------------------------------------------------------- workspace modes

test("all three workspace modes are offered", () => {
  const html = V.renderLaneWizard({
    step: "workspace", repositories: REPOS, draft: { repository_id: "r_fix", name: "My Lane" },
  });
  for (const m of ["new_worktree", "connect_existing", "planning"]) {
    assert.ok(html.includes(`data-gw-wiz-mode="${m}"`), m);
  }
});

test("new worktree previews the base, branch and path before creating", () => {
  const html = V.renderLaneWizard({
    step: "workspace", repositories: REPOS,
    draft: { repository_id: "r_fix", name: "My Lane", workspace_mode: "new_worktree" },
  });
  assert.ok(html.includes("trunk"), "its own base branch");
  assert.ok(html.includes("my-lane"));
  assert.ok(html.includes("/Users/x/Code/fx-worktrees/my-lane"));
  assert.ok(html.includes("data-gw-wiz-suffix"), "the branch is editable");
});

test("branch preview follows the repository's policy, not a global one", () => {
  assert.equal(V.previewBranch(REPOS[1], "My Lane"), "my-lane", "generic: no prefix");
  assert.equal(V.previewBranch(REPOS[0], "My Lane"), "agent/my-lane", "alloy: its prefix");
  assert.equal(V.previewBranch(REPOS[1], "   "), null);
});

test("planning-only says plainly that it uses no capacity", () => {
  const html = V.renderLaneWizard({
    step: "workspace", repositories: REPOS,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "planning" },
  });
  assert.ok(/no worktree and no agent/i.test(html));
  assert.ok(/three provider seats/i.test(html));
});

test("connect existing offers validation and shows the proof", () => {
  const html = V.renderLaneWizard({
    step: "workspace", repositories: REPOS,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "connect_existing", worktree_path: "/p" },
    connectCheck: { ok: true, branch: "side", git_common_dir: "/Users/x/Code/fx/.git" },
  });
  assert.ok(html.includes("data-gw-wiz-validate-wt"));
  assert.ok(html.includes("side"));
  assert.ok(html.includes("/Users/x/Code/fx/.git"), "the common-directory proof is shown");
});

test("a cross-repository worktree is refused in the form", () => {
  const html = V.renderLaneWizard({
    step: "workspace", repositories: REPOS,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "connect_existing", worktree_path: "/p" },
    connectCheck: { ok: false, text: "That worktree belongs to a different repository (/Users/x/Alloy/.git)." },
  });
  assert.ok(html.includes("belongs to a different repository"));
});

test("the client refuses a cross-repository path before creating anything", () => {
  const start = clientSrc.indexOf("async function wizardValidateWorktree(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("j.git_common_dir !== repo.git_common_dir"));
});

// -------------------------------------------------------------- provider

test("Claude is selectable and Cursor is visibly disabled with a reason", () => {
  const html = V.renderLaneWizard({
    step: "provider", repositories: REPOS,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "new_worktree", provider: "claude" },
  });
  assert.ok(html.includes('data-gw-wiz-provider="claude"'));
  assert.match(html, /data-gw-wiz-provider="cursor"[^>]*disabled/);
  assert.ok(/not certified/i.test(html), "and says why");
});

test("a planning lane may choose no agent yet", () => {
  const html = V.renderLaneWizard({
    step: "provider", repositories: REPOS,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "planning" },
  });
  assert.ok(html.includes("Decide later"));
});

// ---------------------------------------------------------------- review

test("review states everything, including that nothing is pushed", () => {
  const html = V.renderLaneWizard({
    step: "review", repositories: REPOS, folders: FOLDERS,
    draft: { repository_id: "r_fix", folder_id: "f_fix", name: "My Lane",
      workspace_mode: "new_worktree", provider: "claude" },
  });
  for (const shown of ["Fixture", "Active", "My Lane", "New worktree", "trunk", "my-lane", "Claude"]) {
    assert.ok(html.includes(shown), `review is missing ${shown}`);
  }
  assert.ok(/nothing is pushed and nothing is merged/i.test(html));
  assert.ok(html.includes("data-gw-wiz-create"), "and only here is Create offered");
});

test("a planning lane never shows a worktree in review", () => {
  // Caught in the live browser pass: a worktree_path left over from a
  // Connect-existing attempt the operator had moved away from still appeared
  // in the review of a Planning-only lane.
  const html = V.renderLaneWizard({
    step: "review", repositories: REPOS, folders: FOLDERS,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "planning",
      worktree_path: "/Users/x/Code/alloy-worktrees/wt5" },
  });
  assert.equal(html.includes("wt5"), false, "a planning lane has no worktree to show");
  assert.equal(html.includes("<dt>Worktree</dt>"), false);
});

test("a new-worktree lane shows its PREVIEW, not a stale connect path", () => {
  const html = V.renderLaneWizard({
    step: "review", repositories: REPOS, folders: FOLDERS,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "new_worktree",
      provider: "claude", worktree_path: "/stale/path" },
  });
  assert.equal(html.includes("/stale/path"), false);
  assert.ok(html.includes("/Users/x/Code/fx-worktrees/l"));
});

test("no step before review offers Create", () => {
  for (const step of ["repository", "folder", "identity", "workspace", "provider"]) {
    const html = V.renderLaneWizard({
      step, repositories: REPOS, folders: FOLDERS,
      draft: { repository_id: "r_fix", name: "L", workspace_mode: "new_worktree", provider: "claude" },
    });
    assert.equal(html.includes("data-gw-wiz-create"), false, `${step} must not create`);
  }
});

// ------------------------------------------------------------- behaviour

test("back navigation preserves entered values", () => {
  const draft = { repository_id: "r_fix", folder_id: "f_fix", name: "Kept Name",
    workspace_mode: "new_worktree", branch_suffix: "kept-branch", provider: "claude" };
  assert.equal(V.prevLaneStep("review"), "provider");
  const back = V.renderLaneWizard({ step: "identity", repositories: REPOS, folders: FOLDERS, draft });
  assert.ok(back.includes("Kept Name"), "the name survives going back");
  const fwd = V.renderLaneWizard({ step: "workspace", repositories: REPOS, folders: FOLDERS, draft });
  assert.ok(fwd.includes("kept-branch"), "and so does the branch");
});

test("double submission is prevented", () => {
  const html = V.renderLaneWizard({
    step: "review", repositories: REPOS, submitting: true,
    draft: { repository_id: "r_fix", name: "L", workspace_mode: "planning" },
  });
  assert.match(html, /data-gw-wiz-create[^>]*disabled/);
  const start = clientSrc.indexOf("async function wizardCreate(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("if (!w || w.submitting) return"), "and guarded in the handler");
});

test("an API failure keeps the draft and says nothing was created", () => {
  const start = clientSrc.indexOf("async function wizardCreate(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("Nothing was created"));
  assert.ok(body.includes("w.submitting = false"), "and the form becomes usable again");
  const html = V.renderLaneWizard({
    step: "review", repositories: REPOS, error: "network", errorText: "Could not reach the Gateway.",
    draft: { repository_id: "r_fix", name: "Kept", workspace_mode: "planning" },
  });
  assert.ok(html.includes("Could not reach the Gateway."));
  assert.ok(html.includes("Kept"), "the draft is still there");
});

test("success lands in the created lane's chat", () => {
  const start = clientSrc.indexOf("async function wizardCreate(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("laneDetailHash(j.lane.lane_id)"));
});

test("the sheet is keyboard-safe and safe-area correct", () => {
  const css = readFileSync(join(HERE, "..", "apps", "vacilando", "public", "styles.css"), "utf8");
  const foot = css.match(/\.gw-sheet-foot\{[^}]*\}/)[0];
  assert.ok(foot.includes("env(safe-area-inset-bottom)"), "the action row must clear the home indicator");
  const head = css.match(/\.gw-sheet-head\{[^}]*\}/)[0];
  assert.ok(head.includes("env(safe-area-inset-top)"));
  const field = css.match(/\.gw-field input\{[^}]*\}/)[0];
  // Below 16px iOS zooms the whole page on focus.
  assert.ok(field.includes("font-size:16px"), "inputs must not trigger iOS zoom");
});

test("every choice control meets the touch target minimum", () => {
  const css = readFileSync(join(HERE, "..", "apps", "vacilando", "public", "styles.css"), "utf8");
  for (const sel of [".gw-choice\\{", ".gw-seg-opt\\{", ".gw-sheet-foot .btn\\{", ".gw-field input\\{"]) {
    const rule = css.match(new RegExp(`${sel}[^}]*\\}`))[0];
    assert.match(rule, /min-height:(4[4-9]|5[0-9]|[6-9][0-9])px/, sel);
  }
});

// ------------------------------------------- what is created is what was shown

test("the wizard asks for the branch it previewed, prefix and all", () => {
  // The Add lane review said "New branch agent/vui" while the request carried
  // the bare suffix `vui`, so the branch created was not the one confirmed.
  const start = clientSrc.indexOf("async function wizardCreate(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.equal(body.includes("body.branch = d.branch_suffix"), false,
    "the bare suffix must not be sent as the branch name");
  assert.ok(body.includes("View.previewBranch("), "it sends the previewed branch");
});

test("a refused create is explained in the words of what was refused", () => {
  // repositoryErrorText answered a refused branch with "That path contains
  // characters Vacilando will not open" — about a path nobody had typed.
  const text = V.laneCreateErrorText("path_refused", { fields: ["slot"] });
  assert.match(text, /slot/);
  assert.equal(/path contains characters/.test(text), false);
  assert.match(V.laneCreateErrorText("invalid_branch_name"), /branch name/i);
  const start = clientSrc.indexOf("async function wizardCreate(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("View.laneCreateErrorText("));
});

test("a lane whose workspace failed is not reported as ready", () => {
  const text = V.workspaceFailureText({ mode: "new_worktree", provisioned: false, error: "branch_exists", branch: "agent/vui" });
  assert.match(text, /created/);
  assert.match(text, /agent\/vui already exists/);
  assert.match(text, /duplicate/, "and it says not to press Create again");
  const start = clientSrc.indexOf("async function wizardCreate(");
  const body = clientSrc.slice(start, clientSrc.indexOf("\n}\n", start));
  assert.ok(body.includes("ws.provisioned === false"), "the client checks provisioning, not just ok");
  assert.ok(body.includes("w.createdLaneId"), "and remembers the lane that does exist");
});

test("after a half-created lane the sheet offers Open lane, never Create again", () => {
  const html = V.renderLaneWizard({
    step: "review", repositories: REPOS, folders: FOLDERS, createdLaneId: "lane_abc",
    error: "branch_exists", errorText: "The lane was created, but its workspace was not.",
    draft: { repository_id: "r_alloy", name: "ui", workspace_mode: "new_worktree", provider: "claude" },
  });
  assert.equal(html.includes("data-gw-wiz-create"), false);
  assert.ok(html.includes("Open lane"));
  assert.ok(html.includes(V.laneDetailHash("lane_abc")));
});
