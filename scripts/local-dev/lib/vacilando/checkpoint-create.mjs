/**
 * Explicit checkpoint creation — the ONLY sanctioned way Vacilando commits.
 *
 * Reporting run state is read-only (see checkpoint-readiness). This is the other
 * half of that separation: a deliberate, separately authorized Git mutation that
 * commits a named list of paths and nothing else.
 *
 * EVERY CONSTRAINT HERE EXISTS BECAUSE ITS ABSENCE CAUSED THE INCIDENT.
 *
 *  - A MANIFEST IS REQUIRED. The old path ran `git add -A`, which cannot mean
 *    anything narrower than "every dirty file". An empty manifest is refused,
 *    never widened.
 *  - EXPECTED HEAD IS COMPARE-AND-SWAP. A checkpoint authorized against one
 *    commit must not land on another.
 *  - PATHS DIRTY BEFORE THE RUN ARE REFUSED. The run's baseline says what it did
 *    not create. Committing those is adoption by silence, which is what swept in
 *    the 67 files.
 *  - STAGED CONTENT OUTSIDE THE MANIFEST IS REFUSED. Otherwise a commit carries
 *    whatever someone else happened to stage.
 *  - THE RESULT IS VERIFIED. The commit is read back and must contain exactly
 *    the manifest. A commit that took more than it was told to is reported as a
 *    failure even though it succeeded, because silence there is how this went
 *    unnoticed twice.
 *
 * WHAT IT NEVER DOES: `add -A`, `add .`, globs, repository-wide staging, stash,
 * reset, clean, branch creation, ref rewriting. Foreign dirty files are left
 * exactly as they were, in the working tree and in the index.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { readWorktreeGitState, snapshotPathSet } from "./git-worktree-state.mjs";

const execFileAsync = promisify(execFile);

export const CHECKPOINT_MESSAGE_MAX = 2000;
export const MANIFEST_MAX = 500;

export const CHECKPOINT_REFUSALS = Object.freeze({
  NO_MANIFEST: "checkpoint_requires_manifest",
  MANIFEST_TOO_LARGE: "manifest_too_large",
  PATH_REFUSED: "manifest_path_refused",
  PATH_OUTSIDE_PROFILE: "path_outside_repository_profile",
  RUN_NOT_FOUND: "run_not_found",
  RUN_NOT_ACTIVE: "run_not_active",
  WORKTREE_MISMATCH: "worktree_mismatch",
  HEAD_MOVED: "expected_head_mismatch",
  FOREIGN_PATH: "path_dirty_before_run",
  ADOPTION_FINGERPRINT: "adopted_path_fingerprint_mismatch",
  ADOPTION_UNNECESSARY: "adopted_path_was_not_dirty_before_run",
  ADOPTION_UNDECLARED: "adoption_requires_origin_and_reason",
  UNEXPECTED_STAGED: "unexpected_staged_files",
  NOTHING_TO_COMMIT: "nothing_to_commit",
  BAD_MESSAGE: "invalid_message",
  VERIFY_FAILED: "commit_contents_unexpected",
  CONFLICT: "worktree_conflict",
});

/** sha256 of a file's bytes, or null when it cannot be read. */
export function fileFingerprint(absPath) {
  try {
    return createHash("sha256").update(readFileSync(absPath)).digest("hex");
  } catch {
    return null;
  }
}

/** `{path: sha256}`, a Map, or `["path=sha256"]` -> Map. Anything else is empty. */
export function normalizeAdoptions(adopt) {
  const out = new Map();
  if (!adopt) return out;
  const put = (k, v) => {
    const path = String(k || "").trim();
    const sha = String(v || "").trim().toLowerCase();
    if (path && /^[0-9a-f]{64}$/.test(sha)) out.set(path, sha);
  };
  if (adopt instanceof Map) { for (const [k, v] of adopt) put(k, v); return out; }
  if (Array.isArray(adopt)) {
    for (const entry of adopt) {
      const str = String(entry || "");
      const at = str.lastIndexOf("=");
      if (at > 0) put(str.slice(0, at), str.slice(at + 1));
    }
    return out;
  }
  if (typeof adopt === "object") { for (const [k, v] of Object.entries(adopt)) put(k, v); }
  return out;
}

/**
 * Adoption is a governance event, so it is written down whether or not anyone
 * asks. An adoption that left no record would afterwards be indistinguishable
 * from work this run authored itself — which is the very thing being guarded.
 */
export function recordAdoption(entry, root) {
  try {
    const base = root || join(process.env.HOME || "", ".local", "state", "alloy-dev", "gateway");
    const path = join(base, "vacilando", "checkpoint-adoptions.jsonl");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
    return path;
  } catch {
    return null;
  }
}

async function git(args, cwd, { timeout = 30_000 } = {}) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd, timeout, maxBuffer: 16 * 1024 * 1024, encoding: "utf8",
    });
    return { ok: true, stdout: String(stdout) };
  } catch (err) {
    return { ok: false, error: String(err?.stderr || err?.message || err).split("\n")[0].slice(0, 300) };
  }
}

/** A path may be committed only if it is repository-relative and inert. */
export function validateManifestPath(rel) {
  const p = String(rel || "").trim();
  if (!p) return { ok: false, error: CHECKPOINT_REFUSALS.PATH_REFUSED, detail: "empty path" };
  if (p.startsWith("/")) return { ok: false, error: CHECKPOINT_REFUSALS.PATH_REFUSED, detail: "absolute path" };
  if (p.includes("..")) return { ok: false, error: CHECKPOINT_REFUSALS.PATH_REFUSED, detail: "traversal" };
  if (/[;|&`$\n]/.test(p)) return { ok: false, error: CHECKPOINT_REFUSALS.PATH_REFUSED, detail: "shell metacharacter" };
  // A glob cannot be reviewed, so it cannot be authorized.
  if (/[*?\[\]]/.test(p)) return { ok: false, error: CHECKPOINT_REFUSALS.PATH_REFUSED, detail: "glob" };
  return { ok: true, path: p };
}

/**
 * Roots a repository profile allows a checkpoint to touch.
 *
 * A profile with no checkpoint policy allows nothing: a generic Git repository
 * has no convention that says which paths a lane owns, and inventing one would
 * be the same guess that `add -A` made.
 */
export function checkpointRootsFor(profile) {
  if (!profile) return [];
  if (profile.governed_promotion === true) return ["*"];   // the managed profile owns its tree
  return [];
}

export function pathAllowedByProfile(rel, roots) {
  if (!roots || !roots.length) return false;
  if (roots.includes("*")) return true;
  return roots.some((r) => rel === r || rel.startsWith(`${r.replace(/\/+$/, "")}/`));
}

export function validCheckpointMessage(message) {
  const m = String(message ?? "").trim();
  if (m.length < 3) return false;
  if (m.length > CHECKPOINT_MESSAGE_MAX) return false;
  return true;
}

/**
 * Create a checkpoint commit containing exactly the manifest.
 *
 * Returns `{ ok:false, error }` for every refusal, having changed nothing. The
 * only mutations it ever performs are staging the manifest and committing it,
 * and both happen after every check has passed.
 */
export async function createCheckpoint({
  runId,
  expectedHead,
  message = null,
  messageFile = null,
  paths = [],
  allowForeign = false,
  adopt = null,
  adoptFrom = null,
  adoptReason = null,
  origin = "operator",
  nowMs = Date.now(),
  root = undefined,
  gitImpl = git,
  readState = readWorktreeGitState,
} = {}) {
  // ---- manifest ---------------------------------------------------------
  const raw = Array.isArray(paths) ? paths.map(String).filter((p) => p.trim()) : [];
  if (!raw.length) {
    return { ok: false, error: CHECKPOINT_REFUSALS.NO_MANIFEST, detail: "name the paths to commit" };
  }
  if (raw.length > MANIFEST_MAX) {
    return { ok: false, error: CHECKPOINT_REFUSALS.MANIFEST_TOO_LARGE, count: raw.length, limit: MANIFEST_MAX };
  }
  const manifest = [];
  for (const p of raw) {
    const v = validateManifestPath(p);
    if (!v.ok) return { ok: false, error: v.error, path: String(p).slice(0, 120), detail: v.detail };
    manifest.push(v.path);
  }
  const manifestSet = new Set(manifest);

  // ---- message ----------------------------------------------------------
  let body = message;
  if (!body && messageFile) {
    try { body = readFileSync(messageFile, "utf8"); } catch (e) {
      return { ok: false, error: CHECKPOINT_REFUSALS.BAD_MESSAGE, detail: `unreadable message file` };
    }
  }
  if (!validCheckpointMessage(body)) {
    return { ok: false, error: CHECKPOINT_REFUSALS.BAD_MESSAGE };
  }
  const commitMessage = String(body).trim();

  // ---- ownership --------------------------------------------------------
  const { getExecutionRun, isTerminalRunState, patchRunFields } = await import("./execution-run.mjs");
  const run = getExecutionRun(runId, root);
  if (!run) return { ok: false, error: CHECKPOINT_REFUSALS.RUN_NOT_FOUND };
  if (isTerminalRunState(run.state)) {
    return { ok: false, error: CHECKPOINT_REFUSALS.RUN_NOT_ACTIVE, state: run.state };
  }
  const worktreePath = run.worktree_path;
  if (!worktreePath) return { ok: false, error: CHECKPOINT_REFUSALS.WORKTREE_MISMATCH, detail: "run has no worktree" };

  // ---- repository profile ----------------------------------------------
  let roots = ["*"];
  if (run.repository_id || run.lane_id) {
    try {
      const { getDurableLane } = await import("./development-lane.mjs");
      const { getRepository, profileFor } = await import("./repository-registry.mjs");
      const lane = getDurableLane(run.lane_id, root);
      const repositoryId = run.repository_id || lane?.repository_id || null;
      if (repositoryId) {
        const repo = getRepository(repositoryId, root);
        roots = checkpointRootsFor(profileFor(repo?.profile));
      }
    } catch { /* an unreadable registry must not widen anything */ }
  }
  for (const rel of manifest) {
    if (!pathAllowedByProfile(rel, roots)) {
      return {
        ok: false,
        error: CHECKPOINT_REFUSALS.PATH_OUTSIDE_PROFILE,
        path: rel,
        detail: roots.length
          ? "the repository profile does not allow checkpoints on this path"
          : "this repository profile has no checkpoint policy, so no path may be committed",
      };
    }
  }

  // ---- current state ----------------------------------------------------
  const state = await readState(worktreePath);
  if (!state?.ok) return { ok: false, error: "git_unreadable", detail: state?.error || null };
  if (state.conflict) return { ok: false, error: CHECKPOINT_REFUSALS.CONFLICT, paths: state.conflicted.slice(0, 20) };

  // ---- compare-and-swap on HEAD ----------------------------------------
  const want = String(expectedHead || "").trim();
  if (!want) return { ok: false, error: CHECKPOINT_REFUSALS.HEAD_MOVED, detail: "expected head is required" };
  if (!state.head.startsWith(want) && !want.startsWith(state.head)) {
    return { ok: false, error: CHECKPOINT_REFUSALS.HEAD_MOVED, expected: want, actual: state.head };
  }

  // ---- foreign paths ----------------------------------------------------
  //
  // THE GAP ADOPTION CLOSES. A run that dies mid-turn leaves its authored,
  // tested work dirty in the worktree. Every successor run then inherits those
  // paths in its own baseline, so `path_dirty_before_run` refuses them — and
  // keeps refusing them forever. The work is valid and mission-owned, but
  // unreachable through the sanctioned path; the only escapes were a blanket
  // --allow-foreign or committing outside governance entirely. One drops the
  // protection, the other leaves no record.
  //
  // ADOPTION IS THE NARROW EXCEPTION. A successor run may claim a pre-dirty path
  // only by naming it AND the exact sha256 of the content it claims. If the file
  // changed after it was reviewed the fingerprint no longer matches and the
  // adoption is refused, so this stays content-bound in the way the blanket flag
  // never was. The default stays fail-closed: a path nobody adopted is still
  // foreign, and one unadopted foreign path still refuses the whole manifest.
  const before = run.git_baseline ? snapshotPathSet(run.git_baseline) : null;
  const adoptions = normalizeAdoptions(adopt);
  if (adoptions.size) {
    if (!String(adoptFrom || "").trim() || !String(adoptReason || "").trim()) {
      return {
        ok: false,
        error: CHECKPOINT_REFUSALS.ADOPTION_UNDECLARED,
        detail: "adoption must name the originating run and why this run owns the change",
      };
    }
    for (const [rel, declared] of adoptions) {
      if (!manifestSet.has(rel)) {
        return {
          ok: false, error: CHECKPOINT_REFUSALS.PATH_REFUSED, paths: [rel],
          detail: "an adopted path must also be named in the manifest",
        };
      }
      if (before && !before.has(rel)) {
        // Adopting a path this run dirtied itself would launder ordinary work
        // through the exception; the normal route already covers that case.
        return { ok: false, error: CHECKPOINT_REFUSALS.ADOPTION_UNNECESSARY, paths: [rel] };
      }
      const actual = fileFingerprint(join(worktreePath, rel));
      if (actual !== declared) {
        return {
          ok: false, error: CHECKPOINT_REFUSALS.ADOPTION_FINGERPRINT, paths: [rel],
          expected: declared, actual,
          detail: "the file changed after its fingerprint was taken; re-read it and adopt the content actually reviewed",
        };
      }
    }
  }
  if (!allowForeign) {
    if (!before) {
      return {
        ok: false,
        error: CHECKPOINT_REFUSALS.FOREIGN_PATH,
        detail: "this run has no recorded starting state, so no path can be shown to belong to it",
      };
    }
    const foreign = manifest.filter((p) => before.has(p) && !adoptions.has(p));
    if (foreign.length) {
      return { ok: false, error: CHECKPOINT_REFUSALS.FOREIGN_PATH, paths: foreign.slice(0, 20), count: foreign.length };
    }
  }

  // ---- nothing outside the manifest may already be staged ---------------
  const staged = state.staged || [];
  const unexpected = staged.filter((p) => !manifestSet.has(p));
  if (unexpected.length) {
    return {
      ok: false,
      error: CHECKPOINT_REFUSALS.UNEXPECTED_STAGED,
      paths: unexpected.slice(0, 20),
      count: unexpected.length,
      detail: "unstage these, or name them in the manifest; a checkpoint never carries what it was not given",
    };
  }

  // ---- IDEMPOTENCY, CHECKED FIRST ---------------------------------------
  // A retry must report success, not a refusal. It has to be tested BEFORE the
  // "anything to commit?" gate, because a successful checkpoint leaves its own
  // paths clean — so a retry looks exactly like "nothing to do" and would be
  // refused for the wrong reason. Compared against the MANIFEST rather than the
  // still-dirty subset, which after a successful commit is empty.
  const headMsg = await gitImpl(["log", "-1", "--pretty=%B"], worktreePath);
  const headFiles = await gitImpl(["show", "--name-only", "--pretty=format:", "HEAD"], worktreePath);
  if (headMsg.ok && headFiles.ok) {
    const sameMsg = String(headMsg.stdout).trim() === commitMessage;
    const files = String(headFiles.stdout).split("\n").map((l) => l.trim()).filter(Boolean).sort();
    const manifestSorted = [...manifest].sort();
    const sameFiles = files.length > 0
      && files.length === manifestSorted.length
      && files.join("\n") === manifestSorted.join("\n");
    if (sameMsg && sameFiles) {
      return { ok: true, already: true, sha: state.head, paths: manifestSorted, message: commitMessage };
    }
  }

  // ---- is there anything to commit? -------------------------------------
  const dirtyNow = new Set([...(state.staged || []), ...(state.unstaged || []), ...(state.untracked || [])]);
  const actionable = manifest.filter((p) => dirtyNow.has(p));
  if (!actionable.length) {
    return { ok: false, error: CHECKPOINT_REFUSALS.NOTHING_TO_COMMIT, paths: manifest.slice(0, 20) };
  }

  // ---- the bounded diff the operator is shown ---------------------------
  const diff = await gitImpl(["diff", "--stat", "HEAD", "--", ...actionable], worktreePath);

  // ---- MUTATION BEGINS HERE, and only here ------------------------------
  const add = await gitImpl(["add", "--", ...actionable], worktreePath);
  if (!add.ok) return { ok: false, error: "git_add_failed", detail: add.error };

  const commit = await gitImpl(["commit", "-m", commitMessage, "--", ...actionable], worktreePath);
  if (!commit.ok) return { ok: false, error: "commit_failed", detail: commit.error };

  const shaOut = await gitImpl(["rev-parse", "HEAD"], worktreePath);
  const sha = shaOut.ok ? shaOut.stdout.trim() : null;

  // ---- VERIFY WHAT ACTUALLY LANDED --------------------------------------
  // A commit that succeeded is not a commit that did what it was told. This is
  // the check whose absence let 67 files land twice without anyone noticing.
  const landed = await gitImpl(["show", "--name-only", "--pretty=format:", sha || "HEAD"], worktreePath);
  const committedPaths = landed.ok
    ? String(landed.stdout).split("\n").map((l) => l.trim()).filter(Boolean).sort()
    : null;
  const expectedPaths = [...actionable].sort();
  const exact = committedPaths
    && committedPaths.length === expectedPaths.length
    && committedPaths.join("\n") === expectedPaths.join("\n");
  if (!exact) {
    return {
      ok: false,
      error: CHECKPOINT_REFUSALS.VERIFY_FAILED,
      sha,
      expected: expectedPaths,
      actual: committedPaths,
      detail: "the commit was created but does not contain exactly the manifest; inspect it before continuing",
    };
  }

  try {
    patchRunFields(runId, { checkpoint_ready: false }, { nowMs, root });
  } catch { /* the commit stands regardless of the flag */ }

  let adoptionRecord = null;
  if (adoptions.size) {
    adoptionRecord = recordAdoption({
      at: new Date(nowMs).toISOString(),
      adopting_run: runId,
      originating_run: String(adoptFrom).trim(),
      reason: String(adoptReason).trim().slice(0, 1000),
      worktree: worktreePath,
      commit: sha,
      paths: [...adoptions.keys()].sort(),
      fingerprints: Object.fromEntries([...adoptions.entries()].sort()),
    }, root);
  }

  return {
    ok: true,
    sha,
    paths: expectedPaths,
    message: commitMessage,
    diffstat: diff.ok ? String(diff.stdout).trim().slice(0, 4000) : null,
    origin,
    pushed: false,
    adopted: adoptions.size ? [...adoptions.keys()].sort() : null,
    adoption_audit: adoptionRecord,
  };
}
