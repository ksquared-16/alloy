/**
 * CLI helpers for node identity, durable backup/restore, lane adoption,
 * and attaching a live Cursor session.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  createDurableLane,
  ensureVacilandoSpecialistLane,
  findLaneByBinding,
  findVacilandoSpecialistLane,
  getDurableLane,
  listDurableLanes,
  publicDurableLane,
  rebindDurableLane,
} from "../development-lane.mjs";
import {
  backupDurableState,
  restoreDurableState,
  verifyBackup,
} from "../durable-state.mjs";
import {
  ensureLocalNode,
  publicExecutionNode,
  vacilandoGatewayRoot,
} from "../execution-node.mjs";
import { normalizeExecutionProvider } from "../execution-providers.mjs";
import { readAllMetadata, resolveRuntimeConfig } from "../workspace-facts.mjs";
import {
  activeAgentSessionForLane,
  createAgentSession,
  markAgentSessionActive,
  publicAgentSession,
} from "../agent-session.mjs";

export function cmdNode({ root, name } = {}) {
  const rec = ensureLocalNode({ root: root || vacilandoGatewayRoot(), name: name || null });
  return publicExecutionNode(rec);
}

export function cmdBackup({ sourceRoot, backupRoot } = {}) {
  return backupDurableState({
    sourceRoot: sourceRoot || vacilandoGatewayRoot(),
    backupRoot,
  });
}

export function cmdVerify({ backupPath } = {}) {
  return verifyBackup(backupPath);
}

export function cmdRestore({ backupPath, destRoot, invalidateBindings = true } = {}) {
  return restoreDurableState({ backupPath, destRoot, invalidateBindings });
}

export function cmdEnsureVacilandoLane({ root } = {}) {
  const r = root || vacilandoGatewayRoot();
  const out = ensureVacilandoSpecialistLane({ root: r });
  return {
    ok: out.ok,
    created: out.created,
    lane: publicDurableLane(out.lane),
    error: out.error || null,
  };
}

export function cmdLanes({ root } = {}) {
  return listDurableLanes(root || vacilandoGatewayRoot()).map(publicDurableLane);
}

/**
 * What Git says the worktree's HEAD is.
 *
 * Three OUTCOMES, kept distinct because they are different facts:
 *   { state: "branch",   branch }  — on a named branch
 *   { state: "detached" }          — a real state; there is no branch
 *   { state: "unreadable" }        — Git could not answer
 *
 * `git rev-parse --abbrev-ref HEAD` prints the literal string `HEAD` when
 * detached. Recording that as a branch name would be a different lie than the
 * one this replaces: a lane bound to a branch called "HEAD" that no
 * `git worktree list` will ever agree with.
 *
 * stderr is captured: a path that is not a repository is a value this function
 * returns, not a line in the Gateway log.
 */
function readHeadBranch(worktreePath) {
  let out;
  try {
    out = execFileSync("git", ["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return { state: "unreadable" };
  }
  if (!out) return { state: "unreadable" };
  if (out === "HEAD") return { state: "detached" };
  return { state: "branch", branch: out };
}

/**
 * Resolve a worktree by name.
 *
 * THE DEFECT THIS REPLACES: `branch` came from `meta?.branch_expected` — the
 * value written into slot metadata when the worktree was CREATED. It is an
 * expectation, and an expectation goes stale the moment the worktree checks out
 * anything else. Binding wrote that stale expectation into the lane as if it
 * were fact: after the Mac mini migration, `bind-lane` recorded
 * `agent/cursor/5-vac-run-idle-complete` for a worktree standing on
 * `agent/cursor/5-governed-approval-complete`.
 *
 * That is not cosmetic. The recorded branch is passed to
 * startPersistentAgentSession as `expectedBranch`, which refuses
 * `branch_mismatch` against Git truth — so a binding built from stale metadata
 * makes the lane it describes unstartable.
 *
 * Git is the authority on what branch a worktree is on. Metadata answers only
 * what Git cannot (slot, provider, sprint), and supplies `branch` ONLY when Git
 * was unreadable. A detached worktree records no branch: `null` means "no
 * branch", which is the truth, and is never overwritten by a stale guess.
 */
function lookupWorktree(worktreeName, { cfg = null } = {}) {
  const name = String(worktreeName || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return { ok: false, error: "invalid_worktree_name" };
  const runtime = cfg || resolveRuntimeConfig();
  const meta = readAllMetadata(runtime).find((m) => m.worktree === name);
  const path = meta?.path || join(runtime.worktree_root, name);
  if (!existsSync(path)) return { ok: false, error: "worktree_missing", path };
  const head = readHeadBranch(path);
  const expected = meta?.branch_expected || null;
  let branch = null;
  let branchSource = "unknown";
  if (head.state === "branch") {
    branch = head.branch;
    branchSource = "git";
  } else if (head.state === "detached") {
    branch = null;
    branchSource = "detached_head";
  } else if (expected) {
    branch = expected;
    branchSource = "metadata_expected";
  }
  return {
    ok: true,
    worktree_name: name,
    worktree_path: path,
    branch,
    branch_source: branchSource,
    branch_expected: expected,
    detached_head: head.state === "detached",
    slot: meta?.slot ? Number(meta.slot) : null,
    provider: normalizeExecutionProvider(meta?.provider, "claude") || "claude",
    sprint: meta?.sprint || null,
  };
}

/**
 * Adopt an existing Alloy worktree as a durable Development Lane.
 * Does not create Git objects, tmux sessions, or a new specialist identity type.
 */
export function cmdAdoptWorktree({
  name,
  worktree,
  provider = null,
  root = vacilandoGatewayRoot(),
} = {}) {
  const found = lookupWorktree(worktree);
  if (!found.ok) return found;
  const existing = findLaneByBinding({ worktreePath: found.worktree_path, root });
  if (existing) {
    return {
      ok: true,
      created: false,
      already_connected: true,
      lane: publicDurableLane(existing),
      git_mutated: false,
    };
  }
  const out = createDurableLane({
    name: name || found.sprint || found.worktree_name.replace(/^wt\d+-/, ""),
    origin: "adopted",
    root,
    binding: {
      worktree_path: found.worktree_path,
      worktree_name: found.worktree_name,
      branch: found.branch,
      slot: found.slot,
      provider: normalizeExecutionProvider(provider || found.provider, "claude") || "claude",
      tmux_session: null,
    },
  });
  return {
    ...out,
    created: Boolean(out.ok),
    already_connected: false,
    lane: publicDurableLane(out.lane),
    git_mutated: false,
  };
}

/**
 * Bind a durable lane to an existing worktree/provider without minting a new lane.
 */
export function cmdBindLane({
  laneId,
  worktree,
  provider = null,
  root = vacilandoGatewayRoot(),
} = {}) {
  const rec = getDurableLane(laneId, root)
    || (String(laneId) === "vacilando" ? findVacilandoSpecialistLane(root) : null);
  if (!rec) return { ok: false, error: "lane_not_found" };
  const found = lookupWorktree(worktree);
  if (!found.ok) return found;
  const out = rebindDurableLane(rec.lane_id, {
    worktree_path: found.worktree_path,
    worktree_name: found.worktree_name,
    branch: found.branch,
    slot: found.slot,
    provider: normalizeExecutionProvider(provider || found.provider, rec.binding?.provider || "claude") || "claude",
    tmux_session: rec.binding?.tmux_session || null,
  }, { root });
  return {
    ...out,
    lane: publicDurableLane(out.lane),
    git_mutated: false,
  };
}

/**
 * Attach a live Cursor IDE conversation as a replaceable Agent Session
 * on an existing durable lane. Does not spawn cursor-agent or tmux.
 */
export function cmdAttachCursorSession({
  laneId,
  worktree,
  providerSessionId = null,
  model = null,
  root = vacilandoGatewayRoot(),
} = {}) {
  const wantVac = !laneId || String(laneId) === "vacilando";
  const ensured = wantVac
    ? ensureVacilandoSpecialistLane({ root })
    : { ok: true, lane: getDurableLane(laneId, root) };
  if (!ensured.ok || !ensured.lane) return { ok: false, error: ensured.error || "lane_not_found" };
  let lane = ensured.lane;
  if (worktree) {
    const bound = cmdBindLane({ laneId: lane.lane_id, worktree, provider: "cursor", root });
    if (!bound.ok) return bound;
    lane = getDurableLane(lane.lane_id, root);
  }
  const existing = activeAgentSessionForLane(lane.lane_id, root);
  if (existing) {
    const updated = markAgentSessionActive(existing.agent_session_id, {
      root,
      providerSessionId: providerSessionId || existing.provider_session_id,
      model: model || existing.model,
    }) || existing;
    return {
      ok: true,
      created: false,
      lane: publicDurableLane(lane),
      session: publicAgentSession(updated),
      git_mutated: false,
    };
  }
  const created = createAgentSession({
    laneId: lane.lane_id,
    provider: "cursor",
    providerSessionId,
    model,
    root,
    // An attached IDE conversation is a transcript, not a spawned process.
    executable: false,
  });
  if (!created.ok) return created;
  const active = markAgentSessionActive(created.session.agent_session_id, {
    root,
    providerSessionId,
    model,
  }) || created.session;
  return {
    ok: true,
    created: true,
    lane: publicDurableLane(getDurableLane(lane.lane_id, root)),
    session: publicAgentSession(active),
    git_mutated: false,
  };
}
