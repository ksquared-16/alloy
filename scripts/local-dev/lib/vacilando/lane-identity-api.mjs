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
} from "./development-lane.mjs";
import { getDevelopmentLane, listDevelopmentLanes } from "./lanes.mjs";
import { normalizeExecutionProvider } from "./execution-providers.mjs";

function pathLikeFields(body = {}) {
  const keys = [
    "path", "worktree_path", "cwd", "filesystem_path", "dir", "directory",
    "branch", "slot", "tmux", "tmux_session", "port", "command", "argv", "worktree",
  ];
  return keys.filter((k) => body[k] != null && String(body[k]).trim() !== "");
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
  const extra = pathLikeFields(body);
  if (extra.length) return { status: 400, body: { ok: false, error: "path_refused", fields: extra } };
  const named = validateLaneName(body.name);
  if (!named.ok) return { status: 400, body: { ok: false, error: named.error } };
  const provider = normalizeExecutionProvider(body.provider, "claude");
  if (!provider) {
    return { status: 400, body: { ok: false, error: "unsupported_provider" } };
  }
  const instruction = body.instruction != null ? String(body.instruction) : "";
  const created = createDurableLane({
    name: named.name,
    origin: "created",
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

  const found = await getDevelopmentLane(created.lane.lane_id);
  return {
    status: 200,
    body: {
      ok: true,
      lane: found.ok ? found.lane : publicDurableLane(created.lane),
      execution_run: run ? { run_id: run.run_id, state: run.state, lane_id: run.lane_id } : null,
      admission,
      substrate_mutated: false,
    },
  };
}
