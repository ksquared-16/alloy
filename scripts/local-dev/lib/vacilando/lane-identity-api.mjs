/**
 * HTTP helpers for durable Development Lane identity + Connect Existing Work.
 * Vacilando Core records + Alloy adapter discovery.
 */
import { writeAuditEvent } from "./commands/audit.mjs";
import {
  listAlloyAdoptionCandidates,
  lookupCandidate,
  parseCandidateId,
} from "./alloy-dev-adapter.mjs";
import {
  connectExistingWork,
  createDurableLane,
  listDurableLanes,
  publicDurableLane,
  renameDurableLane,
  validateLaneName,
  deriveLaneNameFromInstruction,
} from "./development-lane.mjs";
import { getDevelopmentLane, listDevelopmentLanes } from "./lanes.mjs";
import { normalizeExecutionProvider } from "./execution-providers.mjs";
import { registerCreatedWorktree } from "./lane-worktree-lifecycle.mjs";

function pathLikeFields(body = {}) {
  const keys = [
    "path", "worktree_path", "cwd", "filesystem_path", "dir", "directory",
    "branch", "slot", "tmux", "tmux_session", "port", "command", "argv", "worktree",
  ];
  return keys.filter((k) => body[k] != null && String(body[k]).trim() !== "");
}

/**
 * Fields the create endpoint refuses in every mode.
 *
 * These name execution substrate the Gateway owns — a slot, a tmux session, a
 * port, an argv, a bare filesystem path. An operator who could set them could
 * point a new lane at anything on the machine.
 */
const CREATE_SUBSTRATE_FIELDS = Object.freeze([
  "path", "cwd", "filesystem_path", "dir", "directory",
  "slot", "tmux", "tmux_session", "port", "command", "argv", "worktree",
]);

/**
 * Which fields must this create request be refused for?
 *
 * `branch`, `base_ref` and `worktree_path` are NOT substrate — they are the
 * workspace the Add lane sheet asks for, and the HTTP route already accepts
 * them by name. Refusing them here refused every new-worktree lane the wizard
 * could create: the operator confirmed a review screen reading "New branch
 * agent/vui" and got back "That path contains characters Vacilando will not
 * open" about a path they had never typed.
 *
 * They are accepted only in the mode that consumes them, so a planning lane
 * still cannot smuggle in a branch and a new-worktree lane cannot smuggle in a
 * path — which is what the original blanket refusal was protecting.
 */
function refusedCreateFields(body = {}) {
  const given = (k) => body[k] != null && String(body[k]).trim() !== "";
  const mode = String(body.workspace_mode || "");
  const refused = CREATE_SUBSTRATE_FIELDS.filter(given);
  if (mode !== "new_worktree") refused.push(...["branch", "base_ref"].filter(given));
  if (mode !== "connect_existing") refused.push(...["worktree_path"].filter(given));
  return refused;
}

export function publicCandidate(c) {
  if (!c) return null;
  const git = c.git_state && typeof c.git_state === "object"
    ? c.git_state
    : { state: c.git_state || "unknown", ahead: c.git_ahead || 0, behind: c.git_behind || 0, branch: c.branch || null };
  return {
    candidate_id: c.candidate_id,
    suggested_name: c.suggested_name,
    worktree_name: c.worktree_name,
    branch: c.branch || git.branch || null,
    slot: c.slot ?? null,
    provider: c.provider || null,
    tmux_session: c.tmux_session || null,
    claude_presence: c.claude_presence || (c.tmux_alive ? "unknown" : "absent"),
    git,
    already_connected: Boolean(c.already_connected),
    runtime_blocked: Boolean(c.runtime_blocked),
    connected_lane_id: c.connected_lane_id || null,
    connected_name: c.connected_name || null,
    start_claude_implemented: false,
  };
}

export async function listAdoptionCandidates(opts = {}) {
  const listed = await listDevelopmentLanes({ includeGitFacts: false, ...opts });
  const boundPaths = new Set();
  const boundSessions = new Set();
  const byPath = new Map();
  for (const rec of listDurableLanes()) {
    if (rec.binding?.worktree_path) {
      boundPaths.add(rec.binding.worktree_path);
      byPath.set(rec.binding.worktree_path, rec);
    }
    if (rec.binding?.tmux_session) boundSessions.add(rec.binding.tmux_session);
  }
  const raw = await listAlloyAdoptionCandidates({
    observations: listed.ok ? listed.lanes : [],
    boundPaths,
    boundSessions,
  });
  const candidates = raw.map((c) => {
    const rec = byPath.get(c.worktree_path);
    if (rec) {
      c.already_connected = true;
      c.connected_lane_id = rec.lane_id;
      c.connected_name = rec.name;
    }
    return publicCandidate(c);
  }).filter((c) => c && !c.runtime_blocked);
  return { ok: true, candidates };
}

export async function connectExistingWorkRequest(body = {}, { actor = "operator", nowMs = Date.now() } = {}) {
  const extraPath = pathLikeFields(body);
  if (extraPath.length || body.candidate_id && (String(body.candidate_id).includes("/") || String(body.candidate_id).includes(".."))) {
    return { status: 400, body: { ok: false, error: "path_refused" } };
  }
  const candidateId = String(body.candidate_id || "").trim();
  if (!parseCandidateId(candidateId)) {
    return { status: 400, body: { ok: false, error: "invalid_candidate_id" } };
  }
  const named = validateLaneName(body.name);
  if (!named.ok) return { status: 400, body: { ok: false, error: named.error } };

  const listed = await listAdoptionCandidates();
  const pub = lookupCandidate(listed.candidates, candidateId);
  if (!pub) return { status: 404, body: { ok: false, error: "candidate_not_found" } };
  if (pub.runtime_blocked) return { status: 409, body: { ok: false, error: "runtime_adoption_blocked" } };

  const rawList = await listAlloyAdoptionCandidates({
    observations: (await listDevelopmentLanes({ includeGitFacts: false })).lanes || [],
  });
  const candidate = rawList.find((c) => c.candidate_id === candidateId);
  if (!candidate) return { status: 404, body: { ok: false, error: "candidate_not_found" } };

  const out = connectExistingWork({
    candidate,
    name: named.name,
    startClaude: body.start_claude === true,
    nowMs,
  });
  if (out.error === "already_connected") {
    return {
      status: 409,
      body: {
        ok: false,
        error: "already_connected",
        lane: publicDurableLane(out.lane),
        lane_id: out.lane_id,
        name: out.name,
      },
    };
  }
  if (!out.ok) {
    const status = out.error === "runtime_adoption_blocked" || out.error === "path_refused" ? 409 : 400;
    return { status, body: { ok: false, error: out.error } };
  }
  try {
    writeAuditEvent({
      actor,
      command: "lane.connect_existing",
      input: { candidate_id: candidateId, name: named.name },
      target: { kind: "lane", label: out.lane.lane_id, ref: { lane_id: out.lane.lane_id } },
      preview_summary: `Connect existing work ${candidate.worktree_name} as Development Lane ${named.name}`,
      confirmed: true,
      outcome: "succeeded",
      error: null,
      sources_refreshed: [],
    }, nowMs);
  } catch { /* */ }
  const found = await getDevelopmentLane(out.lane.lane_id);
  return {
    status: 200,
    body: {
      ok: true,
      lane: found.ok ? found.lane : publicDurableLane(out.lane),
      substrate_mutated: false,
      start_claude_implemented: false,
    },
  };
}

export function renameLaneRequest(laneId, body = {}, { actor = "operator", nowMs = Date.now() } = {}) {
  const extraPath = pathLikeFields(body);
  if (extraPath.length) return { status: 400, body: { ok: false, error: "path_refused" } };
  const out = renameDurableLane(laneId, body.name, { nowMs });
  if (!out.ok) {
    const status = out.error === "lane_not_found" ? 404 : 400;
    return { status, body: { ok: false, error: out.error } };
  }
  try {
    writeAuditEvent({
      actor,
      command: "lane.rename",
      input: { lane_id: out.lane.lane_id, name: out.lane.name, previous_name: out.previous_name },
      target: { kind: "lane", label: out.lane.lane_id, ref: { lane_id: out.lane.lane_id } },
      preview_summary: `Rename Development Lane ${out.previous_name} → ${out.lane.name}`,
      confirmed: true,
      outcome: "succeeded",
      error: null,
      sources_refreshed: [],
    }, nowMs);
  } catch { /* */ }
  return {
    status: 200,
    body: {
      ok: true,
      lane: publicDurableLane(out.lane),
      previous_name: out.previous_name,
      substrate_mutated: false,
    },
  };
}

export async function createNewLaneRequest(body = {}, { actor = "operator", nowMs = Date.now() } = {}) {
  const extra = refusedCreateFields(body);
  if (extra.length) return { status: 400, body: { ok: false, error: "path_refused", fields: extra } };
  const instructionText = body.instruction != null ? String(body.instruction) : "";
  // A name is no longer required to start. If the operator did not give one,
  // the opening message names the lane — and Rename Lane changes it later.
  const requestedName = String(body.name ?? "").trim()
    || deriveLaneNameFromInstruction(instructionText);
  const named = validateLaneName(requestedName);
  if (!named.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        error: named.error === "name_empty" ? "name_or_instruction_required" : named.error,
      },
    };
  }
  const provider = normalizeExecutionProvider(body.provider, "claude");
  if (!provider) {
    return { status: 400, body: { ok: false, error: "unsupported_provider" } };
  }

  // ---------------------------------------------------------------------
  // Repository selection. A lane belongs to exactly one repository, and the
  // repository must be registered and active before a lane can point at it —
  // a lane attributed to nothing has no execution boundary at all.
  // ---------------------------------------------------------------------
  const R = await import("./repository-registry.mjs");
  const requestedRepo = body.repository_id ? String(body.repository_id) : null;
  let repositoryId = requestedRepo;
  if (!repositoryId) {
    // No explicit choice: fall back to Alloy only if it is registered, so the
    // existing single-repository flow keeps working unchanged.
    const alloy = R.getRepository(R.ALLOY_REPOSITORY_ID);
    repositoryId = alloy ? alloy.repository_id : null;
  }
  if (repositoryId) {
    const repo = R.getRepository(repositoryId);
    if (!repo) return { status: 404, body: { ok: false, error: "repository_not_found" } };
    if (repo.state !== "ACTIVE") return { status: 409, body: { ok: false, error: "repository_not_active" } };
  }

  // workspace_mode says what the lane should have, not what it is called.
  //   new_worktree      — provision a worktree and branch in the repository
  //   connect_existing  — bind an existing worktree of that repository
  //   planning          — no worktree, no provider, no capacity consumed
  const workspaceMode = ["new_worktree", "connect_existing", "planning"]
    .includes(String(body.workspace_mode || "")) ? String(body.workspace_mode) : null;

  // The workspace inputs are accepted, so they are checked HERE and not only
  // where they are used. A lane created first and provisioned second would
  // otherwise exist with no workspace over a value that was never usable.
  const { validBranchName } = await import("./repository-worktree.mjs");
  const requestedBranch = String(body.branch ?? "").trim() || null;
  const requestedBaseRef = String(body.base_ref ?? "").trim() || null;
  const requestedWorktreePath = String(body.worktree_path ?? "").trim() || null;
  if (workspaceMode === "new_worktree") {
    if (requestedBranch && !validBranchName(requestedBranch)) {
      return { status: 400, body: { ok: false, error: "invalid_branch_name" } };
    }
    if (requestedBaseRef && !validBranchName(requestedBaseRef)) {
      return { status: 400, body: { ok: false, error: "invalid_base_ref" } };
    }
  }
  if (workspaceMode === "connect_existing" && requestedWorktreePath) {
    // containPath() decides which roots are open; this only refuses the shapes
    // no path may have, before a lane record exists to be half-provisioned.
    if (!requestedWorktreePath.startsWith("/")
      || requestedWorktreePath.includes("..")
      || /[;|&]/.test(requestedWorktreePath)
      || /[\u0000-\u001f]/.test(requestedWorktreePath)) {
      return { status: 400, body: { ok: false, error: "path_refused", fields: ["worktree_path"] } };
    }
  }

  const instruction = instructionText;
  const created = createDurableLane({
    name: named.name,
    origin: "created",
    preferred_provider: provider,
    repository_id: repositoryId,
    nowMs,
  });
  if (!created.ok) {
    return { status: created.error === "already_connected" ? 409 : 400, body: { ok: false, error: created.error } };
  }

  let run = null;
  let admission = null;
  if (instruction.trim()) {
    const { createQueuedRun } = await import("./execution-run.mjs");
    const queued = createQueuedRun({
      laneId: created.lane.lane_id,
      instruction,
      nowMs,
      origin: "operator",
    });
    if (!queued.ok) {
      return { status: 400, body: { ok: false, error: queued.error, lane: publicDurableLane(created.lane) } };
    }
    run = queued.run;
    const { createAdmissionRequest, evaluateAdmissionQueue } = await import("./execution-admission.mjs");
    const adm = createAdmissionRequest({
      laneId: created.lane.lane_id,
      runId: run.run_id,
      provider,
      nowMs,
    });
    admission = adm.request || null;
    try { await evaluateAdmissionQueue({ nowMs }); } catch { /* queue remains */ }
    const { publicAdmission, admissionForLane, readAdmissionStore } = await import("./execution-admission.mjs");
    const store = readAdmissionStore();
    admission = publicAdmission(admissionForLane(created.lane.lane_id) || admission, store);
  }

  try {
    writeAuditEvent({
      actor,
      command: "lane.create",
      input: { name: named.name, has_instruction: Boolean(instruction.trim()) },
      target: { kind: "lane", label: created.lane.lane_id, ref: { lane_id: created.lane.lane_id } },
      preview_summary: `Create Development Lane ${named.name}`,
      confirmed: true,
      outcome: "succeeded",
      error: null,
      sources_refreshed: [],
    }, nowMs);
  } catch { /* */ }

  // Provision the workspace the operator asked for. A planning lane gets
  // nothing on purpose: no worktree, no provider, no capacity.
  let workspace = { mode: workspaceMode || "planning", provisioned: false };
  if (workspaceMode === "new_worktree" && repositoryId) {
    const { createRepositoryWorktree } = await import("./repository-worktree.mjs");
    const made = await createRepositoryWorktree({
      repositoryId,
      laneName: named.name,
      branch: requestedBranch,
      baseRef: requestedBaseRef,
    });
    if (!made.ok) {
      // The lane exists but has no workspace. Say so rather than pretending it
      // is ready; the operator can retry provisioning without losing the lane.
      workspace = { mode: workspaceMode, provisioned: false, error: made.error, detail: made.detail || null };
    } else {
      // A CREATED WORKTREE MUST ALSO BE A REGISTERED ONE.
      //
      // Creating the worktree is not provisioning the lane. Without a slot and a
      // metadata registration the lane has no port, no dev server, no managed QA
      // environment — and, since the dispatch guard, no delivery at all. The
      // Financials lane was created this way: worktree, branch, tmux and a live
      // Claude, and every message refused `lane_worktree_unregistered` while the
      // operator watched for an agent that was already running.
      //
      // The canonical writer is `alloy-worktree-adopt`; this calls it rather
      // than writing metadata of its own.
      const registered = await registerCreatedWorktree({
        worktreeName: made.worktree_name,
        provider,
      });
      const { bindDurableLane } = await import("./development-lane.mjs");
      bindDurableLane(created.lane.lane_id, {
        worktree_path: made.worktree_path,
        worktree_name: made.worktree_name,
        branch: made.branch,
        provider,
        ...(registered.ok ? { slot: registered.slot, port: registered.port } : {}),
      }, { nowMs });
      workspace = {
        mode: workspaceMode,
        // Provisioned means USABLE. A worktree the fleet cannot see is not a
        // provisioned lane, and reporting it as one is what hid this.
        provisioned: registered.ok,
        worktree_path: made.worktree_path, branch: made.branch,
        base_ref: made.base_ref, repository_id: made.repository_id,
        ...(registered.ok
          ? { slot: registered.slot, port: registered.port, registered: true }
          : { registered: false, error: registered.error, detail: registered.detail || null }),
      };
    }
  } else if (workspaceMode === "connect_existing" && repositoryId && requestedWorktreePath) {
    const { connectRepositoryWorktree } = await import("./repository-worktree.mjs");
    const { listDurableLanes, bindDurableLane } = await import("./development-lane.mjs");
    const boundPaths = listDurableLanes().map((l) => l.binding?.worktree_path).filter(Boolean);
    const conn = await connectRepositoryWorktree({ repositoryId, path: requestedWorktreePath, boundPaths });
    if (!conn.ok) {
      workspace = { mode: workspaceMode, provisioned: false, error: conn.error, detail: conn.actual || null };
    } else {
      bindDurableLane(created.lane.lane_id, {
        worktree_path: conn.worktree_path,
        worktree_name: conn.worktree_name,
        branch: conn.branch,
        provider,
      }, { nowMs });
      workspace = { mode: workspaceMode, provisioned: true, worktree_path: conn.worktree_path, branch: conn.branch, repository_id: conn.repository_id };
    }
  }

  const found = await getDevelopmentLane(created.lane.lane_id);
  return {
    status: 200,
    body: {
      ok: true,
      lane: found.ok ? found.lane : publicDurableLane(created.lane),
      repository_id: repositoryId,
      workspace,
      execution_run: run ? { run_id: run.run_id, state: run.state, lane_id: run.lane_id } : null,
      admission,
      substrate_mutated: workspace.provisioned === true,
    },
  };
}
