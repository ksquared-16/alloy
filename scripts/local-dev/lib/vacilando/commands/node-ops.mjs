/**
 * CLI helpers for node identity, durable backup/restore, lane adoption,
 * and attaching a live Cursor session.
 */
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

function lookupWorktree(worktreeName, { cfg = null } = {}) {
  const name = String(worktreeName || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return { ok: false, error: "invalid_worktree_name" };
  const runtime = cfg || resolveRuntimeConfig();
  const meta = readAllMetadata(runtime).find((m) => m.worktree === name);
  const path = meta?.path || join(runtime.worktree_root, name);
  if (!existsSync(path)) return { ok: false, error: "worktree_missing", path };
  return {
    ok: true,
    worktree_name: name,
    worktree_path: path,
    branch: meta?.branch_expected || null,
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
