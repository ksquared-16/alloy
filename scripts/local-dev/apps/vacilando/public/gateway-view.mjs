/**
 * Vacilando Gateway V2 — pure view/helpers for Development Lanes.
 * No fetch, no timers, no tmux. The controller owns I/O.
 */
export const GATEWAY_HOME = "#/lanes";
export const LANE_INSTRUCTION_MAX = 24000;
export const OUTPUT_POLL_MS = 8000;
export const OUTPUT_BURST_POLL_MS = 2000;
export const OUTPUT_BURST_WINDOW_MS = 20000;
export const LIST_POLL_MS = 15000;
export const TELEMETRY_POLL_MS = 15000;
export const DESKTOP_MIN_PX = 861;
export const STALE_WORK_MS = 120_000;
export const LANE_LIST_GROUP_ORDER = Object.freeze(["active", "needs_input", "idle", "completed", "offline"]);

export function outputIsOlder(next, current) {
  if (!next || !current) return false;
  const nr = Number(next.revision);
  const cr = Number(current.revision);
  if (!Number.isFinite(nr) || !Number.isFinite(cr)) return false;
  return nr < cr;
}
export const MOBILE_MAX_PX = 860;
export const STATUS_OPEN_KEY = "vac.gw.statusOpen";
/** Persisted open/closed state of the single lane details panel. */
export const LANE_FOLD_KEY = "vac.gw.laneFold";
export const DETAILS_PANEL_KEY = LANE_FOLD_KEY;
export const VIEWED_KEY_PREFIX = "vac.gw.viewed.";

export function decodeLaneId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export function parseGatewayHash(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "");
  const [pathPart] = raw.split("?");
  const p = (pathPart || "").split("/").filter(Boolean).map((seg) => decodeLaneId(seg) || seg);
  const name = p[0] || "lanes";
  const sub = p[1] || null;
  if (name === "lanes" && sub === "connect") {
    return { name: "lanes", sub: "connect", candidateId: p[2] || null };
  }
  if (name === "lanes" && sub === "create") {
    return { name: "lanes", sub: "create" };
  }
  return { name, sub };
}

/**
 * List and detail share one existence contract: a selected lane_id exists if
 * the current list contains it. Inspect may still be in flight. "missing" is
 * only for a lane_id the list does not contain.
 */
export function detailViewKind({ selectedId, lanes, lane, loading, listReady } = {}) {
  if (!selectedId) return "list";
  if (selectedId === "connect") return "connect";
  if (selectedId === "create") return "create";
  if (lane) return "detail";
  const listed = Array.isArray(lanes) && lanes.some((l) => laneMatchesId(l, selectedId));
  if (loading || !listReady) return "loading";
  if (listed) return "load_error";
  return "missing";
}

export function isGatewayRoute(name) {
  return name === "lanes";
}

export function isPrimaryGatewayHash(hash) {
  const h = String(hash || "");
  return !h || h === "#" || h === "#/" || h === "#/lanes" || h.startsWith("#/lanes/");
}

export function defaultGatewayHash() {
  return GATEWAY_HOME;
}

export function laneDetailHash(laneId) {
  return `#/lanes/${encodeURIComponent(laneId)}`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function ago(ms, nowMs = Date.now()) {
  if (!ms) return null;
  const s = Math.max(0, (nowMs - Number(ms)) / 1000);
  if (s < 60) return `${s | 0}s`;
  if (s < 3600) return `${(s / 60) | 0}m`;
  if (s < 86400) return `${(s / 3600) | 0}h`;
  return `${(s / 86400) | 0}d`;
}

export function gitLine(git, sourceControl) {
  if (sourceControl?.posture === "CONFLICT") return "Conflict";
  if (sourceControl?.posture === "MERGED") return "Merged";
  if (sourceControl?.posture === "UNKNOWN") return "Git unknown";
  if (sourceControl?.posture === "SYNC_REQUIRED") return `Behind · ${sourceControl.behind}`;
  if (sourceControl?.posture === "SYNC_RECOMMENDED") return `Behind · ${sourceControl.behind}`;
  if (sourceControl?.posture === "CHECKPOINT_DUE") return "Checkpoint due";
  if (sourceControl?.posture === "CURRENT" && git?.state === "clean") return "Git healthy";
  if (git?.state === "unknown" || git?.state === "missing") return "Git unknown";
  const st = git?.state === "clean" ? "Clean" : git?.state === "dirty" ? "Dirty" : (git?.state || "Unknown");
  const ahead = Number.isFinite(git?.ahead) ? git.ahead : 0;
  const behind = Number.isFinite(git?.behind) ? git.behind : 0;
  if (git?.head_in_base === true && ahead === 0) return "Merged";
  return `${st} · ↑${ahead} · ↓${behind}`;
}

export function gitListState(lane) {
  const scm = lane?.source_control;
  if (!scm && !lane?.git) return null;
  if (scm?.posture === "MERGED" || (lane?.git?.head_in_base === true && !(Number(lane?.git?.ahead) > 0))) {
    return null;
  }
  if (scm?.posture === "UNKNOWN" || lane?.git?.state === "unknown" || lane?.git?.state === "missing") {
    return null;
  }
  if (scm?.posture === "SYNC_REQUIRED" || scm?.posture === "SYNC_RECOMMENDED") {
    return gitLine(lane.git, scm);
  }
  if (scm?.posture === "CONFLICT") return "Conflict";
  return null;
}

export function presenceLine(lane) {
  const bits = [];
  if (lane?.claude?.presence === "present") bits.push("Claude connected");
  else if (lane?.tmux?.alive) bits.push("Session running");
  else bits.push("Session unavailable");
  const when = ago(lane?.last_activity_ms);
  if (when) bits.push(`Active ${when} ago`);
  return bits.join(" · ");
}

export function agentLabel(lane) {
  return laneProviderLabel(lane);
}

/** Cheap summary from the existing /api/resources snapshot. Does not fetch. */
export function machineLine(res) {
  const o = res?.overall;
  if (!o) return null;
  const n = Number(o.running_servers) || 0;
  const bits = [n ? `${n} local server${n === 1 ? "" : "s"} running` : "No local app server"];
  if (o.slots?.pressure === "ok") bits.push("Machine healthy");
  else if (o.warning) bits.push(o.warning);
  return bits.join(" · ");
}

export function buildSendBody(instruction, extra = {}) {
  const body = { instruction: String(instruction ?? "") };
  const provider = String(extra?.provider || "").toLowerCase();
  if (provider === "claude" || provider === "cursor") body.provider = provider;
  // Order is the operator's order, and it is what the provider is told, so it
  // is sent explicitly rather than left to whatever the server iterates.
  const ids = (Array.isArray(extra?.attachmentIds) ? extra.attachmentIds : []).map(String).filter(Boolean);
  if (ids.length) body.attachment_ids = ids;
  return body;
}

/** Operator-facing text for every repository refusal the server can return. */
export function repositoryErrorText(error, detail = {}) {
  switch (error) {
    case "path_outside_approved_roots":
      return `That path is outside the folders Vacilando may use: ${(detail.approved_roots || detail.roots || []).join(", ")}.`;
    case "path_not_found": return "There is nothing at that path.";
    case "path_must_be_absolute": return "Enter the full path, starting with /.";
    case "path_refused": return "That path contains characters Vacilando will not open.";
    case "not_a_git_repository": return "That folder is not a Git repository.";
    case "path_is_worktree":
      return `That is a worktree of ${detail.parent_root || "another repository"}. Register that repository instead.`;
    case "repository_already_registered":
      return `Already registered as "${detail.repository?.name || "another entry"}".`;
    case "worktree_parent_inside_repository":
      return "Worktrees cannot live inside the repository itself.";
    case "worktree_parent_outside_approved_roots":
      return "That worktree location is outside the folders Vacilando may use.";
    case "repository_not_found": return "That repository is no longer registered.";
    case "repository_not_active": return "That repository is disconnected.";
    case "repository_has_active_work":
      return `Finish or stop the ${(detail.active_lanes || []).length} running lane(s) first.`;
    case "cross_repository_binding_refused":
      return "That worktree belongs to a different repository.";
    case "clone_not_implemented":
      return detail.detail || "Clone is not available yet. Clone it yourself, then connect it.";
    default: return "That repository could not be registered.";
  }
}

/** Operator-facing text for every attachment refusal the server can return. */
export function attachmentErrorText(error, detail = {}) {
  const mb = (n) => `${Math.round((Number(n) || 0) / (1024 * 1024))} MB`;
  switch (error) {
    case "unsupported_media_type":
      return "That file type is not supported. Use PNG, JPEG, WebP, GIF, PDF or HTML.";
    case "attachment_too_large":
      return `That image is larger than ${mb(detail.limit)}. Try a smaller one.`;
    case "attachments_total_too_large":
      return `Those images add up to more than ${mb(detail.limit)} together.`;
    case "attachment_dimensions_too_large":
      return `That image is larger than ${detail.limit}px on a side.`;
    case "too_many_attachments":
      return `You can attach up to ${detail.limit || 6} images to one prompt.`;
    case "empty_file":
      return "That file was empty.";
    case "attachment_missing":
      return "One of the images is no longer available. Remove it and attach it again.";
    case "attachment_corrupt":
      return "One of the images did not upload cleanly. Remove it and attach it again.";
    case "attachment_lane_mismatch":
      return "That image belongs to a different lane.";
    case "attachment_not_found":
      return "That image is no longer attached.";
    case "attachment_not_removable":
      return "That image has already been sent, so it stays in the conversation.";
    default:
      return "The image could not be attached.";
  }
}

export function sendPayload(laneId, instruction) {
  return { lane_id: String(laneId || ""), instruction: String(instruction ?? "") };
}

export function deliveryNotice(result) {
  if (result?.ok && result.status === "delivered") {
    if (result.stale_run_closed) {
      return { kind: "ok", text: "Previous run was stale and was closed. Delivered to the existing session." };
    }
    return { kind: "ok", text: "Delivered to the existing session." };
  }
  if (result?.ok && (result.status === "queued" || result.admission_queued)) {
    if (result.replaced) {
      return {
        kind: "ok",
        text: result.session_required
          ? "Instruction updated. Work is still queued until a session starts."
          : "Instruction updated. Still waiting for execution capacity.",
      };
    }
    if (result.session_required) {
      return { kind: "ok", text: "Work queued. No agent session is running." };
    }
    return { kind: "ok", text: "Work queued. Waiting for execution capacity." };
  }
  // A refused send carries WHY from the readiness gate. An opaque
  // "Delivery refused (provider_prompt_not_ready)" is what the operator saw the
  // first time this fired; say what the pane was doing instead.
  if (result?.error === "provider_prompt_not_ready") {
    const why = summaryText(result.prompt_readiness?.summary) || summaryText(result.blocking_screen);
    // A dialog the composer cannot reach is a different situation from a busy
    // agent, and the operator has to be told which one they are looking at —
    // one needs them at the terminal, the other needs nothing at all.
    if (result.needs_terminal_operator === true || result.prompt_readiness?.needs_terminal_operator === true) {
      return {
        kind: "err",
        text: `Your instruction was not sent. ${why || "The agent's terminal is showing a prompt."} `
          + "This prompt has to be answered in the agent's terminal — Vacilando cannot answer it for you. "
          + "Answer it there, then send again.",
      };
    }
    if (result.status === "queued" || result.admission_queued) {
      return {
        kind: "ok",
        text: `Not sent yet — ${why ? `${why.charAt(0).toLowerCase()}${why.slice(1)}` : "the agent is not at a prompt."} Queued; it will be delivered when the agent is ready.`,
      };
    }
    return {
      kind: "err",
      text: why
        ? `Not sent — ${why.charAt(0).toLowerCase()}${why.slice(1)} Open Details to see the terminal.`
        : deliveryErrorText(result.error),
    };
  }
  return { kind: "err", text: deliveryErrorText(result?.error) };
}

export function deliveryErrorText(error) {
  switch (error) {
    case "current_run_active":
      return "This lane still has an open run. If the agent already finished, send again in a moment — a leftover heartbeat should not block a new instruction.";
    case "duplicate_send":
      return "Same instruction was just sent. Wait a moment before sending it again.";
    case "send_in_progress":
      return "A send is already in progress for this lane.";
    case "instruction_empty":
      return "Instruction is empty.";
    case "instruction_too_large":
      return "Instruction is too long.";
    case "lane_not_found":
    case "invalid_lane_id":
      return "This Development Lane is no longer available.";
    case "pane_unavailable":
      return "The lane session is unavailable.";
    case "target_mismatch":
      return "The lane is no longer a valid development target.";
    case "unexpected_control_field":
      return "Send was refused: extra targeting fields are not allowed.";
    case "delivery_failed":
      return "Delivery failed. The instruction was not submitted.";
    case "cursor_delivery_unavailable":
      return "Cursor delivery unavailable: transcript is readable, but no executable Cursor transport is attached. Retry with Claude.";
    case "provider_prompt_not_ready":
      return "The agent is not at a prompt right now, so nothing was sent. It may be mid-turn or waiting on a dialog — open Details to see the terminal.";
    case "undelivered_provider_prompt_block":
      return "Not sent. The agent's terminal is showing a permission prompt, which has to be answered in the terminal — it cannot be answered from here.";
    default:
      return error ? `Delivery refused (${error}).` : "Delivery failed.";
  }
}

export function providerLifecycleErrorText(error, action = "suspend") {
  switch (error) {
    case "confirm_required":
      return "That lane is working. Confirm to interrupt it.";
    case "question_not_durable":
      return "Not suspended: the question could not be stored durably first, and suspending would lose it.";
    case "provider_stop_failed":
      return "The agent process would not stop. Nothing was changed and no capacity was freed.";
    case "no_agent_session":
      return "There is no agent attached to this lane.";
    case "provider_start_failed":
      return "The agent could not be started. The lane and its work are unchanged.";
    case "lane_not_found":
      return "This Development Lane is no longer available.";
    default:
      return error ? `Could not ${action} the agent (${error}).` : `Could not ${action} the agent.`;
  }
}

export function releaseErrorText(error) {
  switch (error) {
    case "unsafe_in_flight":
      return "Cannot release while work is in flight. Complete, close, or answer the current run first.";
    case "source_control_gate":
      return "Source control is not safe to release. Checkpoint or resolve the Git posture first.";
    case "granted_resource":
      return "A scarce resource is still granted. Release cannot proceed.";
    case "runtime_adoption_blocked":
      return "Runtime is not adopted from Gateway. That lane cannot be released here.";
    case "protected_worktree":
      return "This lane’s worktree is protected and cannot be released from Gateway.";
    case "already_idle":
      return "No execution capacity is allocated.";
    case "lane_not_found":
    case "invalid_lane_id":
      return "This Development Lane is no longer available.";
    default:
      return error ? `Release refused (${error}).` : "Could not release execution capacity.";
  }
}

export const LANE_EXECUTION_POSTURES = Object.freeze([
  "IDLE",
  "QUEUED_FOR_CAPACITY",
  "STARTING",
  "CONNECTED",
  "RUNNING",
  "FINISHING",
  "READY_TO_RELEASE",
  "NEEDS_INPUT",
  "FAILED",
]);

const LIVE_AGENT_SESSION_STATES = new Set(["ACTIVE", "STARTING", "VERIFYING", "RESTARTING", "HANDOFF"]);


export function laneProviderKind(lane) {
  const raw = String(
    lane?.binding?.provider || lane?.agent_session?.provider || lane?.preferred_provider || "",
  ).toLowerCase();
  if (raw === "cursor" || raw === "cursor-agent" || raw === "cursor_ide") return "cursor";
  if (raw === "claude" || raw === "claudecode") return "claude";
  if (lane?.claude?.presence === "present") return "claude";
  return raw || null;
}

/**
 * The agent's name for operator-facing sentences ("Cursor is running").
 * Unlike laneProviderLabel, this never degrades to "Offline"/"Session" — those
 * read wrong inside a sentence about the agent.
 */
/** Slot 1 -> 3011 … slot 6 -> 3016. The permanent per-slot port map. */
export const LANE_FIRST_AGENT_PORT = 3011;

export function lanePort(lane) {
  const slot = Number(lane?.slot ?? lane?.binding?.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) return null;
  return LANE_FIRST_AGENT_PORT + (slot - 1);
}

/**
 * The lane's assigned localhost. This is the permanent slot port, not a probe:
 * it says where this lane's server belongs, never that one is currently up.
 */
export function laneLocalhostUrl(lane) {
  const port = lanePort(lane);
  return port ? `http://localhost:${port}` : null;
}

/**
 * Stale login / update-required banner. Computed from the output already on
 * screen, so it needs no new capture and no server round trip. It states the
 * fix as a command the operator can run, and never claims anything about the
 * Execution Run.
 */
export function renderProviderHealth(health) {
  if (!health?.kind) return "";
  const fix = health.fix_command
    ? `<code class="gw-health-fix">${esc(health.fix_command)}</code>`
    : "";
  return `<aside class="gw-health" data-gw-provider-health data-kind="${esc(health.kind)}" data-provider="${esc(health.provider || "unknown")}">
    <span class="gw-health-h">${esc(health.title)}</span>
    <span class="gw-health-detail">${esc(health.detail || "")}</span>
    ${fix}
  </aside>`;
}

export function renderLaneLocalhost(lane) {
  const url = laneLocalhostUrl(lane);
  if (!url) return "";
  return `<div class="gw-localhost" data-gw-localhost>
    <span class="gw-localhost-h">Localhost</span>
    <a class="gw-localhost-url" href="${esc(url)}" target="_blank" rel="noreferrer noopener">${esc(url)}</a>
    <span class="gw-localhost-note">Assigned port for this slot</span>
  </div>`;
}

export function laneAgentLabel(lane) {
  const kind = laneProviderKind(lane);
  if (kind === "cursor") return "Cursor";
  if (kind === "claude") return "Claude";
  // An OFFLINE Claude lane still has Claude presence telemetry attached, and
  // must keep its name — "Agent is not running" would lose real information.
  // Cursor lanes are named by binding.provider above, so they never land here.
  if (lane && Object.prototype.hasOwnProperty.call(lane, "claude")) return "Claude";
  return "Agent";
}

export function laneProviderLabel(lane) {
  const kind = laneProviderKind(lane);
  if (kind === "cursor") {
    return Boolean(lane?.tmux?.alive) ? "Cursor" : "Cursor (read-only)";
  }
  if (kind === "claude") return "Claude";
  if (lane?.tmux?.alive) return "Session";
  return "Offline";
}

function liveAgentOnLane(lane) {
  if (lane?.claude?.presence === "present" || lane?.runtime === "online") return true;
  return LIVE_AGENT_SESSION_STATES.has(String(lane?.agent_session?.state || ""));
}

function laneIsBound(lane) {
  return Boolean(lane?.binding?.worktree_path || lane?.worktree?.path);
}

/**
 * Lane execution-capacity posture (not Execution Run state).
 * Development Lane = permanent identity. Slot = temporary capacity.
 */
export function isGovernedDirectorWait(run) {
  const ga = run?.governed_action;
  if (ga && ["failed", "complete"].includes(ga.status)) return false;
  if (ga && ["requested", "awaiting_director", "awaiting_control_plane_refresh", "awaiting_operator", "executing"].includes(ga.status)) {
    return true;
  }
  if (run?.state && run.state !== "WAITING_RESOURCE") return false;
  const key = run?.resource_wait?.resource_key;
  return key === "director_governed_action" || Boolean(run?.resource_wait?.governed_request_id);
}

/**
 * Every "summary" field on the wire is not a string.
 *
 * `execution_run.latest_progress` is an OBJECT — `{summary, at}` — while
 * `completion_report` is `{summary}` and `resource_wait.label` is a plain
 * string. A lane row that did `String(latest_progress)` printed the literal
 * text "[object Object]" to the operator, live, on three lanes at once. Read
 * the summary through one accessor so a shape change can never print again.
 */
export function summaryText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = summaryText(v);
      if (s) return s;
    }
    return "";
  }
  if (typeof value === "object") {
    for (const key of ["summary", "label", "text", "detail", "title", "reason", "message"]) {
      const s = summaryText(value[key]);
      if (s) return s;
    }
    return "";
  }
  return "";
}

/** A queued admission older than this, on a lane that cannot be provisioned. */
export const STALE_ADMISSION_MS = 10 * 60 * 1000;

/**
 * Proof — not a guess — that a "Queued for capacity" claim is dead.
 *
 * Observed on this host: Lifecycle Cert and Processing sat at "Queued for
 * capacity" for three days. Neither lane has a worktree binding, so neither can
 * ever be provisioned, and the only code path that clears an admission
 * (releaseLaneExecutionCapacity) returned `already_idle` before reaching it.
 * They were queued behind capacity they were structurally unable to receive.
 *
 * Returns null unless ALL of these hold — it must never demote live work:
 *   - the admission is open (QUEUED / ADMITTED / PROVISIONING)
 *   - the lane has no runtime binding, so provisioning cannot start
 *   - no agent session and no live run
 *   - it has been queued past STALE_ADMISSION_MS
 */
export function staleAdmissionClaim(lane, nowMs = Date.now()) {
  const adm = lane?.admission || lane?.execution_run?.admission || null;
  const state = String(adm?.state || "").toUpperCase();
  if (!adm || !["QUEUED", "ADMITTED", "PROVISIONING"].includes(state)) return null;
  if (liveAgentOnLane(lane)) return null;
  const runState = lane?.execution_run?.state || null;
  if (["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "RECOVERING", "NEEDS_INPUT"].includes(runState)) return null;
  if (laneIsBound(lane)) return null;
  const since = Date.parse(adm.requested_at || lane?.execution_run?.created_at || "");
  if (!Number.isFinite(since)) return null;
  const waitedMs = nowMs - since;
  if (waitedMs < STALE_ADMISSION_MS) return null;
  const blockers = Array.isArray(lane?.binding_blockers) ? lane.binding_blockers : [];
  const why = summaryText(blockers[0]) || "Lane has no worktree binding";
  return {
    admission_id: adm.admission_id || null,
    admission_state: state,
    queued_since: adm.requested_at || null,
    waited_ms: waitedMs,
    reason: why,
    detail: `Queued ${ago(since, nowMs)} ago for capacity it cannot receive: ${why}.`,
  };
}

export function deriveLaneExecutionPosture(lane, { nowMs = Date.now() } = {}) {
  const stored = String(lane?.execution_capacity?.state || "").toUpperCase();
  const bound = laneIsBound(lane);
  const liveAgent = liveAgentOnLane(lane);
  const slot = lane?.slot ?? lane?.binding?.slot ?? null;
  const sess = lane?.agent_session?.state;
  const run = lane?.execution_run;
  const queued = lane?.admission?.state === "QUEUED" || run?.admission?.state === "QUEUED";
  const n = lane?.admission?.queue_position || run?.admission?.queue_position || null;
  const runState = run?.state || null;

  if (stored === "FINISHING") {
    return {
      state: "FINISHING",
      label: "Finishing",
      mark: "…",
      hint: "Releasing execution capacity",
      headline: "Finishing · Releasing execution capacity",
      tone: "complete",
      slot,
      queue_position: null,
    };
  }
  const ga = run?.governed_action;
  if (ga?.status === "awaiting_control_plane_refresh") {
    return {
      state: "UPDATING_DIRECTOR",
      label: "Updating Director",
      mark: "◷",
      hint: "Updating governed capabilities",
      headline: "Updating Director · governed capabilities",
      tone: "run",
      slot,
      queue_position: null,
    };
  }
  if (isGovernedDirectorWait(run)) {
    const refreshing = ga?.status === "awaiting_control_plane_refresh";
    const needsApproval = ga?.status === "awaiting_operator";
    const title = refreshing
      ? "Updating governed capabilities"
      : (ga?.title || run?.resource_wait?.summary || "Governed action requested");
    return {
      state: refreshing ? "UPDATING_DIRECTOR" : (needsApproval ? "NEEDS_APPROVAL" : "WAITING_ON_DIRECTOR"),
      label: refreshing ? "Updating Director" : (needsApproval ? "Needs approval" : "Waiting on Director"),
      mark: "◷",
      hint: title,
      headline: refreshing
        ? "Updating Director · governed capabilities"
        : (needsApproval ? `Needs approval · ${title}` : `Waiting on Director · ${title}`),
      tone: "run",
      slot,
      queue_position: null,
    };
  }
  // A parked lane whose provider was put down. The work is entirely intact, so
  // "Working" would be false and "Offline" would suggest it was lost. Checked
  // before NEEDS_INPUT, which would otherwise claim it and hide the suspension.
  if (lane?.agent_session?.state === "SUSPENDED"
      || run?.provider_suspension?.state === "SUSPENDED") {
    const label = runState === "WAITING_RESOURCE" ? "Waiting for resource" : "Needs input";
    return {
      state: "PROVIDER_SUSPENDED",
      label: `${label} · suspended`,
      mark: "!",
      hint: "Provider suspended; the question and all work are kept",
      headline: `${label} · provider suspended`,
      tone: runState === "WAITING_RESOURCE" ? "queued" : "needs",
      slot,
      queue_position: null,
    };
  }
  if (runState === "NEEDS_INPUT") {
    return {
      state: "NEEDS_INPUT",
      label: "Needs input",
      mark: "!",
      hint: "Needs input",
      headline: "Needs input",
      tone: "needs",
      slot,
      queue_position: null,
    };
  }
  if (runState === "FAILED") {
    return {
      state: "FAILED",
      label: "Failed",
      mark: "×",
      hint: "Failed",
      headline: "Failed",
      tone: "failed",
      slot,
      queue_position: null,
    };
  }
  if (runState === "WAITING_RESOURCE" && isGovernedDirectorWait(run)) {
    const gaStatus = run?.governed_action?.status;
    const needsApproval = gaStatus === "awaiting_operator";
    const title = run?.governed_action?.title || run?.resource_wait?.summary || "Governed action requested";
    return {
      state: needsApproval ? "NEEDS_APPROVAL" : "WAITING_ON_DIRECTOR",
      label: needsApproval ? "Needs approval" : "Waiting on Director",
      mark: "◷",
      hint: title,
      headline: needsApproval ? `Needs approval · ${title}` : `Waiting on Director · ${title}`,
      tone: "run",
      slot,
      queue_position: null,
    };
  }
  if (sess === "STARTING" || sess === "VERIFYING" || sess === "RESTARTING") {
    const who = laneProviderLabel(lane);
    return {
      state: "STARTING",
      label: "Starting",
      mark: "●",
      hint: `Starting ${who}`,
      headline: sess === "STARTING" ? `Starting ${who}…` : `Orienting ${who}…`,
      tone: "run",
      slot,
      queue_position: null,
    };
  }
  const staleClaim = staleAdmissionClaim(lane, nowMs);
  if (staleClaim) {
    return {
      state: "QUEUED_STALE",
      label: "Stale capacity claim",
      mark: "○",
      hint: staleClaim.detail,
      headline: `Stale capacity claim · ${staleClaim.reason}`,
      tone: "",
      slot: null,
      queue_position: null,
      stale_claim: staleClaim,
    };
  }
  if (queued && !liveAgent) {
    const pos = n ? ` · #${n}` : "";
    return {
      state: "QUEUED_FOR_CAPACITY",
      label: "Queued for capacity",
      mark: "◷",
      hint: n ? `Queued for capacity · #${n}` : "Queued for capacity",
      headline: `Queued for capacity${pos}`,
      tone: "queued",
      slot: null,
      queue_position: n || null,
    };
  }
  if (runState === "COMPLETE" && liveAgent) {
    return {
      state: "READY_TO_RELEASE",
      label: "Work complete",
      mark: "✓",
      hint: "Work complete · Runtime ready to release",
      headline: "Work complete · Runtime ready to release",
      tone: "complete",
      slot,
      queue_position: null,
    };
  }
  if (liveAgent && !runState && lane?.previous_run?.state === "COMPLETE") {
    return {
      state: "READY_TO_RELEASE",
      label: "Work complete",
      mark: "✓",
      hint: "Work complete · Runtime ready to release",
      headline: "Work complete · Runtime ready to release",
      tone: "complete",
      slot,
      queue_position: null,
    };
  }
  const liveRun = ["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "RECOVERING"].includes(runState);
  if (liveAgent || liveRun) {
    const who = laneProviderLabel(lane);
    const waitLabel = run?.resource_wait?.label;
    const runLabels = {
      EXECUTING: "Executing",
      VALIDATING: "Validating",
      WAITING_RESOURCE: waitLabel
        ? (/^waiting\b/i.test(String(waitLabel)) ? String(waitLabel) : `Waiting for ${waitLabel}`)
        : "Waiting",
      RECOVERING: "Recovering",
      QUEUED: "Queued",
    };
    if (!liveRun && liveAgent) {
      return {
        state: "CONNECTED",
        label: "Connected",
        mark: "●",
        hint: `${who} connected`,
        headline: `${who} connected`,
        tone: "run",
        slot,
        queue_position: null,
      };
    }
    return {
      state: "RUNNING",
      label: runLabels[runState] || "Running",
      mark: "●",
      hint: runLabels[runState] || "Current work executing",
      headline: liveAgent ? `${runLabels[runState] || "Running"} · ${who}` : (runLabels[runState] || "Running"),
      tone: runState === "RECOVERING" ? "recovering" : "run",
      slot,
      queue_position: null,
    };
  }
  if (bound && !liveAgent) {
    return {
      state: "IDLE",
      label: "No session",
      mark: "○",
      hint: "No agent session",
      headline: "Idle · No agent session",
      tone: "",
      slot: slot || null,
      queue_position: null,
    };
  }
  return {
    state: "IDLE",
    label: "Idle",
    mark: "○",
    hint: "Idle",
    headline: "Idle · No execution slot allocated",
    tone: "",
    slot: null,
    queue_position: null,
  };
}

export function workOutputIsStale(lane, output, nowMs = Date.now()) {
  const run = lane?.execution_run;
  if (!["EXECUTING", "VALIDATING", "RECOVERING"].includes(run?.state)) return false;
  const captured = output?.captured_at ? Date.parse(output.captured_at) : NaN;
  if (Number.isFinite(captured)) return nowMs - captured > STALE_WORK_MS;
  if (!output) return false;
  const activity = Number(lane?.last_activity_ms);
  if (!Number.isFinite(activity)) return false;
  return nowMs - activity > STALE_WORK_MS;
}

export function canonicalLaneWorkState(lane, { output = null, nowMs = Date.now() } = {}) {
  const cap = deriveLaneExecutionPosture(lane, { nowMs });
  const run = lane?.execution_run;
  const prev = lane?.previous_run;
  const stale = workOutputIsStale(lane, output, nowMs);
  const liveAgent = liveAgentOnLane(lane);
  const who = laneProviderLabel(lane);

  if (cap.state === "UPDATING_DIRECTOR") {
    return { key: "waiting", label: "Updating Director", group: "active", tone: "run", mark: cap.mark, hint: cap.hint, headline: cap.headline, live: true, stale: false };
  }
  if (cap.state === "NEEDS_APPROVAL") {
    return { key: "needs_input", label: "Needs approval", group: "needs_input", tone: "needs", mark: cap.mark, hint: cap.hint, headline: cap.headline, live: false, stale: false };
  }
  if (cap.state === "WAITING_ON_DIRECTOR") {
    return { key: "waiting", label: "Waiting on Director", group: "active", tone: "run", mark: cap.mark, hint: cap.hint, headline: cap.headline, live: true, stale: false };
  }
  if (cap.state === "PROVIDER_SUSPENDED") {
    const parked = run?.state === "WAITING_RESOURCE";
    return {
      key: "needs_input", label: cap.label,
      // Durable blocked work belongs with what wants the operator — not with
      // running work, and not with offline lanes.
      group: parked ? "active" : "needs_input",
      tone: cap.tone, mark: cap.mark, hint: cap.hint, headline: cap.headline,
      live: false, stale: false,
    };
  }
  if (cap.state === "NEEDS_INPUT" || run?.state === "NEEDS_INPUT") {
    return { key: "needs_input", label: "Needs input", group: "needs_input", tone: "needs", mark: "!", hint: cap.hint || "Needs input", headline: "Needs input", live: false, stale: false };
  }
  if (cap.state === "FAILED" || run?.state === "FAILED") {
    return { key: "failed", label: "Failed", group: "completed", tone: "failed", mark: "×", hint: "Failed", headline: "Failed", live: false, stale: false };
  }
  if (run?.runtime_posture?.state === "SESSION_ROTATING") {
    return { key: "working", label: "Refreshing Claude context", group: "active", tone: "run", mark: "●", hint: "Current work preserved", headline: "Refreshing Claude context", live: true, stale: false };
  }
  if (stale) {
    return { key: "stale", label: "Stale", group: "active", tone: "needs", mark: "!", hint: "Provider output has not advanced", headline: "Stale · output has not advanced", live: false, stale: true };
  }
  if (run?.runtime_posture?.state === "RECOVERING" || run?.state === "RECOVERING" || lane?.runtime_posture?.state === "RECOVERING") {
    return { key: "recovering", label: "Recovering", group: "active", tone: "recovering", mark: "●", hint: run?.runtime_posture?.reason || lane?.runtime_posture?.reason || cap.hint, headline: cap.headline || "Recovering", live: true, stale: false };
  }
  if (run?.state === "VALIDATING" || cap.label === "Validating") {
    return { key: "validating", label: "Validating", group: "active", tone: "run", mark: cap.mark, hint: cap.hint, headline: cap.headline, live: true, stale: false };
  }
  // A stale claim is not work. Leaving it in the "active" band pushed real
  // running lanes down the list behind three-day-old ghosts.
  if (cap.state === "QUEUED_STALE") {
    return { key: "stale_claim", label: "Stale capacity claim", group: "idle", tone: "", mark: cap.mark, hint: cap.hint, headline: cap.headline, live: false, stale: false };
  }
  if (cap.state === "QUEUED_FOR_CAPACITY") {
    return { key: "waiting", label: "Queued for capacity", group: "active", tone: "queued", mark: cap.mark, hint: cap.hint, headline: cap.headline, live: false, stale: false };
  }
  if (run?.state === "WAITING_RESOURCE") {
    const wait = run.resource_wait;
    if (run.runtime_posture?.state === "QUIESCED" || lane?.runtime_posture?.state === "QUIESCED") {
      return { key: "waiting", label: "Quiesced", group: "active", tone: "quiesced", mark: "◷", hint: run.runtime_posture?.reason || lane?.runtime_posture?.reason || "Quiesced", headline: "Quiesced", live: true, stale: false };
    }
    if (wait?.exclusive_phase && wait.exclusive_phase !== "EXCLUSIVE_ACTIVE") {
      return { key: "waiting", label: "Preparing exclusive timing", group: "active", tone: "run", mark: "◷", hint: wait.exclusive_detail || wait.label || "Preparing exclusive timing", headline: "Preparing exclusive timing", live: true, stale: false };
    }
    if (wait?.resuming) {
      const available = wait.label ? `${wait.label} available` : "Resuming…";
      return { key: "waiting", label: available, group: "active", tone: "ready", mark: "●", hint: "Resuming…", headline: available, live: true, stale: false };
    }
    if (wait?.ready_to_resume) {
      return { key: "waiting", label: "Ready to resume", group: "active", tone: "ready", mark: "●", hint: wait.label || "Ready to resume", headline: "Ready to resume", live: true, stale: false };
    }
    return { key: "waiting", label: cap.label || "Waiting", group: "active", tone: "run", mark: cap.mark, hint: wait?.queue_position ? `#${wait.queue_position} in queue` : cap.hint, headline: cap.headline, live: true, stale: false };
  }
  if (cap.state === "STARTING") {
    return { key: "working", label: cap.label || "Starting", group: "active", tone: "run", mark: cap.mark, hint: cap.hint, headline: cap.headline, live: true, stale: false };
  }
  if (cap.state === "RUNNING" || run?.state === "EXECUTING") {
    return { key: "working", label: "Working", group: "active", tone: "run", mark: "●", hint: who, headline: `Working · ${who}`, live: true, stale: false };
  }
  if (run?.state === "COMPLETE") {
    return { key: "complete", label: "Complete", group: "completed", tone: "complete", mark: "✓", hint: "Complete", headline: "Complete", live: false, stale: false };
  }
  if (!run && prev?.state === "COMPLETE") {
    return { key: liveAgent ? "ready" : "idle", label: liveAgent ? "Ready" : "Idle", group: "idle", tone: "", mark: liveAgent ? "●" : "○", hint: liveAgent ? `${who} ready` : "Idle", headline: liveAgent ? "Ready" : "Idle", live: false, stale: false };
  }
  if (lane?.runtime === "offline" && !run && !liveAgent) {
    return { key: "offline", label: "Offline", group: "offline", tone: "", mark: "○", hint: "Offline", headline: "Offline", live: false, stale: false };
  }
  if (cap.state === "CONNECTED" || (liveAgent && !run)) {
    return { key: "ready", label: "Ready", group: "idle", tone: "", mark: "●", hint: `${who} ready`, headline: "Ready", live: false, stale: false };
  }
  return { key: "idle", label: "Idle", group: "idle", tone: "", mark: "○", hint: cap.hint || "Idle", headline: "Idle", live: false, stale: false };
}

/**
 * When did something MEANINGFUL last happen in this lane?
 *
 * Meaningful means the operator or the agent moved the work: a prompt was
 * delivered, the agent produced output or progress, the Execution Run changed
 * state, or a result worth notifying about landed.
 *
 * `observed_at` IS NOT ACTIVITY. It is the timestamp discovery stamps on every
 * lane on every poll. Measured against the live Gateway: two list polls three
 * seconds apart, with nothing happening, changed observed_at on 8 of 8 lanes —
 * so every lane's "recency" was really "now", the ordering was decided by
 * whatever order the poll happened to resolve in, and the list reshuffled while
 * the operator was reading it. Health checks, hydration and presence heartbeats
 * are all the same non-event.
 */
export function laneActivityMs(lane) {
  const run = lane?.execution_run || lane?.previous_run;
  const candidates = [
    // A run state transition, and when the agent last reported into it.
    Date.parse(run?.updated_at || ""),
    Date.parse(run?.completed_at || ""),
    Date.parse(run?.started_at || ""),
    Date.parse(run?.created_at || ""),
    Date.parse(run?.last_worker_report_at || ""),
    Date.parse(run?.latest_progress?.at || ""),
    // The operator's own last prompt into the lane.
    Date.parse(lane?.last_instruction?.at || lane?.last_instruction?.delivered_at || ""),
    // Agent output actually changing — not the fact that we looked.
    Number(lane?.last_activity_ms),
    // A notification-worthy result.
    Date.parse(lane?.notifications?.latest_at || ""),
  ];
  let best = 0;
  for (const c of candidates) if (Number.isFinite(c) && c > best) best = c;
  return best;
}

/**
 * Retained name for the row's "x ago" label, which legitimately wants to say
 * when the lane was last SEEN when it has no activity of its own.
 */
export function laneUpdatedMs(lane) {
  const activity = laneActivityMs(lane);
  if (activity) return activity;
  const observed = Date.parse(lane?.observed_at || "");
  return Number.isFinite(observed) ? observed : 0;
}

export function sortLanesForIndex(lanes, { outputByLane = {}, nowMs = Date.now() } = {}) {
  const list = Array.isArray(lanes) ? [...lanes] : [];
  const rank = (lane) => {
    const st = canonicalLaneWorkState(lane, { output: outputByLane[lane?.lane_id], nowMs });
    const gi = LANE_LIST_GROUP_ORDER.indexOf(st.group);
    return gi < 0 ? LANE_LIST_GROUP_ORDER.length : gi;
  };
  list.sort((a, b) => {
    const dg = rank(a) - rank(b);
    if (dg !== 0) return dg;
    const da = laneActivityMs(b) - laneActivityMs(a);
    if (da !== 0) return da;
    // Deterministic when timestamps tie: a stable, operator-meaningful key, so
    // two lanes with identical activity never trade places between polls.
    return String(a.label || a.lane_id).localeCompare(String(b.label || b.lane_id));
  });
  return list;
}

/**
 * How many notifications this lane still owes the operator.
 *
 * This reads the CANONICAL server-side count. It is deliberately not derived
 * from lane posture: a lane can be Idle and still hold an unread "complete",
 * and a lane can be Working with nothing unread.
 */
export function laneUnseenCount(lane) {
  const n = Number(lane?.unseen_notifications);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Apply the unseen count to the installed app tile.
 *
 * The Badging API only exists for an INSTALLED app (a PWA added to the Home
 * Screen / dock); in an ordinary browser tab it is usually absent, and on iOS
 * Safari it is absent even when installed. Absence is not an error and must
 * never take the in-app indicators down with it — those are the fallback.
 */
export function applyAppBadge(count, nav = (typeof navigator !== "undefined" ? navigator : null)) {
  const n = Number(count);
  const value = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (!nav) return { supported: false, applied: false, value, reason: "no_navigator" };
  const canSet = typeof nav.setAppBadge === "function";
  const canClear = typeof nav.clearAppBadge === "function";
  if (!canSet && !canClear) return { supported: false, applied: false, value, reason: "unsupported" };
  try {
    // Clearing at zero is a distinct call: setAppBadge(0) shows a dot on some
    // platforms rather than removing the badge.
    if (value === 0) {
      if (canClear) nav.clearAppBadge();
      else nav.setAppBadge(0);
      return { supported: true, applied: true, value: 0, cleared: true };
    }
    nav.setAppBadge(value);
    return { supported: true, applied: true, value };
  } catch (err) {
    return { supported: true, applied: false, value, reason: "threw", error: String(err?.message || err) };
  }
}

/** A restrained dot-and-count. Execution state stays the loudest thing in a row. */
export function renderUnseenIndicator(lane) {
  const n = laneUnseenCount(lane);
  if (!n) return "";
  const label = n === 1 ? "1 unread update" : `${n} unread updates`;
  return `<span class="gw-lane-unseen" data-gw-unseen="${n}" role="status" aria-label="${esc(label)}">${n}</span>`;
}

export const LANE_FOLDER_COLLAPSE_KEY = "vac.gw.foldersClosed";
export const UNFILED_FOLDER_ID = "__unfiled__";

/** Which folders the operator has collapsed. A preference, never lane state. */
export function readCollapsedFolders(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(LANE_FOLDER_COLLAPSE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch { return new Set(); }
}

export function writeCollapsedFolders(ids, storage) {
  try { storage?.setItem(LANE_FOLDER_COLLAPSE_KEY, JSON.stringify([...(ids || [])].map(String))); } catch { /* */ }
}

/**
 * Group lanes into folders WITHOUT losing the attention ordering.
 *
 * The lane list is ranked by what wants the operator: active work, then
 * needs-input, then idle. Folders are organisation laid over that truth, so a
 * folder inherits the rank of its most urgent lane — filing a blocked lane into
 * "Later" cannot push it below a folder where nothing is happening. Unfiled
 * lanes are not a folder; they are the plain list, and they sort by the same
 * rule alongside the folders.
 */
export function groupLanesByFolder(lanes, folders = [], { collapsed = new Set(), outputByLane = {}, nowMs = Date.now() } = {}) {
  const ordered = sortLanesForIndex(Array.isArray(lanes) ? lanes : [], { outputByLane, nowMs });
  const known = new Map();
  for (const f of Array.isArray(folders) ? folders : []) {
    if (f?.folder_id) known.set(String(f.folder_id), { folder_id: String(f.folder_id), name: String(f.name || "Folder") });
  }
  const groups = new Map();
  const groupFor = (id, name) => {
    if (!groups.has(id)) groups.set(id, { folder_id: id, name, lanes: [], rank: Number.MAX_SAFE_INTEGER, needs_attention: 0, active: 0, unseen: 0 });
    return groups.get(id);
  };
  // Empty folders still appear — you make a folder, then file lanes into it.
  for (const f of known.values()) groupFor(f.folder_id, f.name);

  ordered.forEach((lane, index) => {
    const raw = lane?.folder_id ? String(lane.folder_id) : null;
    // A folder_id the store no longer knows must not hide the lane.
    const id = raw && known.has(raw) ? raw : UNFILED_FOLDER_ID;
    const g = groupFor(id, id === UNFILED_FOLDER_ID ? "No folder" : known.get(id).name);
    g.lanes.push(lane);
    if (index < g.rank) g.rank = index;
    const work = canonicalLaneWorkState(lane, { output: outputByLane[lane?.lane_id], nowMs });
    if (work.group === "needs_input") g.needs_attention += 1;
    if (work.group === "active") g.active += 1;
    g.unseen += laneUnseenCount(lane);
  });

  return [...groups.values()]
    .map((g) => ({
      ...g,
      unfiled: g.folder_id === UNFILED_FOLDER_ID,
      lane_count: g.lanes.length,
      // A collapsed folder must never be able to hide a lane that is asking for
      // the operator, so the badge travels with the header.
      collapsed: collapsed?.has?.(g.folder_id) === true,
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.unfiled !== b.unfiled) return a.unfiled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function occupiesClaudeProviderCapacity(lane, cap = null) {
  const posture = cap || deriveLaneExecutionPosture(lane);
  if (laneProviderKind(lane) === "cursor") return false;
  if (posture.state === "READY_TO_RELEASE") return false;
  // Suspended means the process is down: durable work, no computation.
  if (posture.state === "PROVIDER_SUSPENDED") return false;
  return ["RUNNING", "STARTING", "CONNECTED", "FINISHING", "NEEDS_INPUT", "WAITING_ON_DIRECTOR", "UPDATING_DIRECTOR"].includes(posture.state);
}

export function summarizeExecutionCapacity(lanes, provision = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  const rows = list.map((lane) => ({ lane, cap: deriveLaneExecutionPosture(lane) }));
  const running = rows.filter((r) => occupiesClaudeProviderCapacity(r.lane, r.cap));
  const stale = rows.filter((r) => r.cap.state === "QUEUED_STALE");
  const queued = rows
    .filter((r) => r.cap.state === "QUEUED_FOR_CAPACITY")
    .sort((a, b) => (Number(a.cap.queue_position) || 99) - (Number(b.cap.queue_position) || 99));
  const max = Number(provision.max_active || provision.max_providers) || 3;
  const active = running.length;
  return {
    max_active: max,
    active,
    available: Math.max(0, max - active),
    running: running.map((r) => ({
      lane_id: r.lane.lane_id,
      name: r.lane.label || r.lane.name || r.lane.lane_id,
      slot: r.lane.slot ?? r.lane.binding?.slot ?? null,
    })),
    queued: queued.map((r) => ({
      lane_id: r.lane.lane_id,
      name: r.lane.label || r.lane.name || r.lane.lane_id,
      queue_position: r.cap.queue_position,
    })),
    stale_claims: stale.map((r) => ({
      lane_id: r.lane.lane_id,
      name: r.lane.label || r.lane.name || r.lane.lane_id,
      reason: r.cap.stale_claim?.reason || null,
    })),
  };
}

export function renderExecutionCapacity(summary) {
  if (!summary || typeof summary !== "object") return "";
  // ONE number, and it is the one that governs admission: live provider
  // processes. Showing the lane-posture count beside a longer list of running
  // agents was two counters disagreeing in the same panel.
  const holders = (summary.provider_holders || []).map((h) => summaryText(h?.name) || summaryText(h?.path)).filter(Boolean);
  const running = (holders.length ? holders : (summary.running || []).map((r) => r.name).filter(Boolean)).join(", ") || "None";
  const queued = (summary.queued || []).map((q) => (
    q.queue_position ? `${q.name} #${q.queue_position}` : q.name
  )).filter(Boolean).join(", ") || "None";
  return `<div class="gw-status-block" data-gw-capacity>
    <div class="gw-status-h">Execution capacity</div>
    <dl class="gw-kv">
      <dt>Active</dt><dd>${esc(String(summary.active_providers ?? summary.active ?? 0))} / ${esc(String(summary.max_active ?? 3))}</dd>
      <dt>Running</dt><dd>${esc(running)}</dd>
      <dt>Queued</dt><dd>${esc(queued)}</dd>
      <dt>Available</dt><dd>${esc(String(Math.max(0, Number(summary.max_active ?? 3) - Number(summary.active_providers ?? summary.active ?? 0))))}</dd>
      ${summary.degraded ? `<dt>Counting</dt><dd>degraded — live process inspection unavailable</dd>` : ""}
      ${(summary.stale_claims || []).length
        ? `<dt>Stale claims</dt><dd>${esc((summary.stale_claims || []).map((s) => s.name).join(", "))}</dd>`
        : ""}
    </dl>
  </div>`;
}

/**
 * Who is actually holding the agent capacity, and the two ways to free some.
 * Driven by the live provider count, so the names match the number.
 */
export function renderCapacityHolders(capacity) {
  if (!capacity) return "";
  const max = Number(capacity.max_active ?? capacity.max_providers) || 0;
  const active = Number(capacity.active_providers ?? capacity.active) || 0;
  if (!max || active < max) return "";
  const holders = (capacity.provider_holders || [])
    .map((h) => summaryText(h?.name) || summaryText(h?.path))
    .filter(Boolean);
  const named = holders.length
    ? `<ul class="gw-capacity-holders" data-gw-capacity-holders>${
        holders.map((h) => `<li>${esc(h)}</li>`).join("")
      }</ul>`
    : "";
  return `<div class="gw-capacity-block" data-gw-capacity-block>
    <p class="gw-runtime-d">All ${esc(String(max))} agent${max === 1 ? "" : "s"} are in use:</p>
    ${named}
    <p class="gw-runtime-d">Free one with <strong>Release execution capacity</strong> in that lane's Details — the lane, worktree and branch all stay — or raise the limit with <code>ALLOY_MAX_ACTIVE_PROVIDERS</code>.</p>
  </div>`;
}

export function renderLaneRuntimeControls(lane, cap, { capacity = null } = {}) {
  if (!lane) return "";
  const posture = cap || deriveLaneExecutionPosture(lane);
  const slot = posture.slot;
  const slotNote = slot ? ` · Slot ${slot}` : "";
  const id = esc(lane.lane_id || "");
  if (posture.state === "FINISHING") {
    return `<aside class="gw-runtime" data-gw-runtime data-posture="FINISHING">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">Finishing · Releasing execution capacity</p>
    </aside>`;
  }
  if (posture.state === "READY_TO_RELEASE") {
    return `<aside class="gw-runtime" data-gw-runtime data-posture="READY_TO_RELEASE">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">${esc(presenceLine(lane))}${esc(slotNote)}</p>
      <p class="gw-runtime-d">Current work is complete. The durable lane stays. Release frees temporary execution capacity.</p>
      <div class="gw-runtime-actions">
        <button type="button" class="btn sm" data-gw-runtime-keep>Keep lane running</button>
        <button type="button" class="btn sm" data-gw-runtime-release data-lane-id="${id}">Release execution capacity</button>
      </div>
    </aside>`;
  }
  if (posture.state === "WAITING_ON_DIRECTOR") {
    const ga = lane?.execution_run?.governed_action || lane?.governed_action;
    const why = ga?.reason_worker_cannot_execute
      || "Worker cannot access deployed tenant credentials by design.";
    const action = ga?.action_key ? `Director is handling ${ga.action_key}.` : "Director is handling the governed action.";
    return `<aside class="gw-runtime" data-gw-runtime data-posture="WAITING_ON_DIRECTOR">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">Waiting on Director${esc(slotNote)}</p>
      <p class="gw-runtime-d">${esc(why)}</p>
      <p class="gw-runtime-d">${esc(action)}</p>
    </aside>`;
  }
  if (posture.state === "CONNECTED") {
    const who = laneProviderLabel(lane);
    const release = laneProviderKind(lane) === "cursor" ? "" : `<div class="gw-runtime-actions">
        <button type="button" class="btn sm" data-gw-provider-suspend data-lane-id="${id}">Suspend provider</button>
        <button type="button" class="btn sm" data-gw-runtime-release data-lane-id="${id}">Release execution capacity</button>
      </div>
      <p class="gw-runtime-d">Neither deletes the lane, its branch or its worktree.</p>`;
    return `<aside class="gw-runtime" data-gw-runtime data-posture="CONNECTED">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">${esc(who)} connected${esc(slotNote)}</p>
      ${release}
    </aside>`;
  }
  if (posture.state === "RUNNING") {
    return `<aside class="gw-runtime" data-gw-runtime data-posture="RUNNING">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">${esc(posture.headline || "Running")}${esc(slotNote)}</p>
      <div class="gw-runtime-actions">
        <button type="button" class="btn sm" data-gw-provider-suspend data-gw-confirm="1" data-lane-id="${id}">Suspend provider</button>
        <button type="button" class="btn sm" data-gw-runtime-release data-lane-id="${id}">Release execution capacity</button>
      </div>
      <p class="gw-runtime-d">This lane is working — suspending interrupts it. Neither action deletes the lane, its branch or its worktree.</p>
    </aside>`;
  }
  if (posture.state === "PROVIDER_SUSPENDED") {
    const q = lane?.execution_run?.provider_suspension?.resume_state?.question || null;
    return `<aside class="gw-runtime" data-gw-runtime data-posture="PROVIDER_SUSPENDED">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">Provider suspended${esc(slotNote)}</p>
      <p class="gw-runtime-d">This lane is waiting on you. Its agent was stopped so another lane could run — the question, conversation, run, worktree and branch are all kept. Replying resumes it automatically.</p>
      ${q ? `<p class="gw-runtime-d gw-runtime-q">${esc(String(q).split("\n")[0].slice(0, 160))}</p>` : ""}
      <div class="gw-runtime-actions">
        <button type="button" class="btn sm" data-gw-provider-resume data-lane-id="${id}">Resume provider</button>
      </div>
    </aside>`;
  }
  if (posture.state === "QUEUED_STALE") {
    const claim = posture.stale_claim || {};
    return `<aside class="gw-runtime" data-gw-runtime data-posture="QUEUED_STALE">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">Stale capacity claim</p>
      <p class="gw-runtime-d">${esc(claim.detail || "This lane is queued for capacity it cannot receive.")}</p>
      <p class="gw-runtime-d">Releasing cancels the dead admission through the capacity owner. The durable lane, worktree and branch stay.</p>
      <div class="gw-runtime-actions">
        <button type="button" class="btn sm" data-gw-runtime-release data-lane-id="${id}">Release capacity</button>
      </div>
    </aside>`;
  }
  if (posture.state === "QUEUED_FOR_CAPACITY") {
    const n = posture.queue_position ? ` · #${posture.queue_position}` : "";
    // "No capacity" with nothing else said is the whole complaint: the operator
    // cannot see who holds it or what to do. Name the agents and the remedies.
    return `<aside class="gw-runtime" data-gw-runtime data-posture="QUEUED_FOR_CAPACITY">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">Queued for capacity${esc(n)}</p>
      ${renderCapacityHolders(capacity)}
      <p class="gw-runtime-d">Vacilando starts this lane as soon as an agent frees up. You do not pick a slot.</p>
    </aside>`;
  }
  if (posture.state === "IDLE") {
    return `<aside class="gw-runtime" data-gw-runtime data-posture="IDLE">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">Idle · No execution slot allocated</p>
      <p class="gw-runtime-d">Start work with an instruction. Vacilando allocates capacity.</p>
      <button type="button" class="btn primary sm" data-gw-start-work>Start work</button>
    </aside>`;
  }
  if (posture.state === "STARTING") {
    return `<aside class="gw-runtime" data-gw-runtime data-posture="STARTING">
      <div class="gw-work-h">Runtime</div>
      <p class="gw-runtime-line">${esc(posture.headline || "Starting")}</p>
    </aside>`;
  }
  return "";
}

export function shouldPollOutput({ hidden, routeName, laneId }) {
  return !hidden && routeName === "lanes" && Boolean(laneId);
}

export function shouldPollList({ hidden, routeName }) {
  return !hidden && routeName === "lanes";
}

export function outputPollIntervalMs({ burstUntil, nowMs = Date.now() } = {}) {
  if (burstUntil && nowMs < burstUntil) return OUTPUT_BURST_POLL_MS;
  return OUTPUT_POLL_MS;
}

export function connectHash(candidateId) {
  return candidateId
    ? `#/lanes/connect/${encodeURIComponent(candidateId)}`
    : "#/lanes/connect";
}

export function laneMatchesId(lane, selectedId) {
  if (!lane || !selectedId) return false;
  if (lane.lane_id === selectedId) return true;
  if ((lane.aliases || []).includes(selectedId)) return true;
  if (lane.binding?.tmux_session === selectedId) return true;
  return false;
}

export function knownLane(lanes, selectedId) {
  if (!selectedId || !Array.isArray(lanes)) return null;
  return lanes.find((l) => laneMatchesId(l, selectedId)) || null;
}

export function applyFetchedLane(selectedId, requestedId, current, next) {
  if (selectedId !== requestedId) return current;
  return next;
}

/** Keep a payload when the selected id remaps (UUID ↔ durable) mid-fetch. */
export function applyFetchedOutput(selectedId, requestedId, current, next) {
  if (!next) return current;
  const belongs = selectedId === requestedId || (next.lane_id && next.lane_id === selectedId);
  if (!belongs) return current;
  if (current && outputIsOlder(next, current)) return current;
  return {
    ...next,
    lane_id: next.lane_id || selectedId || requestedId,
  };
}

export function outputBelongsToLane(output, selectedId, lane) {
  if (!output || !selectedId) return false;
  if (output.lane_id === selectedId) return true;
  if (!output.lane_id && lane && laneMatchesId(lane, selectedId)) return true;
  if (lane && laneMatchesId(lane, selectedId) && laneMatchesId(lane, output.lane_id)) return true;
  return false;
}

export function outputBodyText(output, outputText, { pending = false } = {}) {
  if (output?.ok === false && !outputText && !output?.text) {
    return pending ? "Refreshing output…" : "Output unavailable";
  }
  if (output?.mode === "latest_response" && output.available === false && !outputText && !output?.text) {
    return pending ? "Refreshing output…" : "Output unavailable";
  }
  const raw = outputText == null ? (output?.text == null ? "" : String(output.text)) : String(outputText);
  if (!raw) {
    if (pending) return "Refreshing output…";
    return "";
  }
  return raw;
}

export function claudeRunStatus(lane) {
  const running = lane?.claude?.presence === "present" || lane?.runtime === "online"
    || LIVE_AGENT_SESSION_STATES.has(String(lane?.agent_session?.state || ""));
  const who = laneAgentLabel(lane);
  return {
    running,
    provider: laneProviderKind(lane),
    label: running ? `${who} is running` : `${who} is not running`,
  };
}

export function contextRefreshStatus(lane) {
  const rotating = lane?.runtime_posture?.state === "SESSION_ROTATING"
    || lane?.execution_run?.runtime_posture?.state === "SESSION_ROTATING"
    || lane?.session_rotation?.need === "in_progress"
    || ["HANDOFF", "RESTARTING", "VERIFYING"].includes(lane?.agent_session?.state);
  const pending = lane?.agent_session?.state === "ROTATION_PENDING"
    || lane?.session_rotation?.need === "pending"
    || lane?.session_rotation?.need === "safe_automatic";
  if (rotating) {
    return {
      kind: "progress",
      label: "Refreshing Claude context…",
    };
  }
  if (pending) {
    return { kind: "pending", label: "Refresh pending · waiting for a safe checkpoint" };
  }
  const activity = Array.isArray(lane?.recent_system_activity) ? lane.recent_system_activity : [];
  const fail = activity.find((i) => /refresh failed|orientation failed/i.test(String(i?.summary || "")));
  if (fail) return { kind: "err", label: String(fail.summary) };
  const ok = activity.find((i) => /context refreshed/i.test(String(i?.summary || "")));
  if (ok) return { kind: "ok", label: "Context refreshed automatically" };
  return null;
}

export function renderContextRefreshButton(lane, { compact = false } = {}) {
  if (!lane?.lane_id) return "";
  const refresh = contextRefreshStatus(lane);
  if (refresh?.kind === "progress") return "";
  const recommended = lane.session_rotation?.need === "recommended";
  return `<button type="button" class="btn gw-session-refresh" data-gw-session-refresh data-lane-id="${esc(lane.lane_id)}">Refresh Claude Context</button>${recommended && compact ? `<span class="gw-refresh-hint">Recommended</span>` : ""}`;
}

export function renderClaudeRunStatus(lane, telemetry) {
  const st = claudeRunStatus(lane);
  const refresh = contextRefreshStatus(lane);
  const ctx = contextCompact(telemetry);
  let extra = "";
  if (refresh?.kind === "pending") {
    extra = `${ctx ? `<span class="gw-context-pct">${esc(ctx)}</span>` : ""}<span class="gw-context-refresh" data-gw-context-refresh data-kind="pending">${esc(refresh.label)}</span>`;
  } else if (refresh?.kind === "progress") {
    extra = `<span class="gw-context-refresh" data-gw-context-refresh data-kind="progress">${esc(refresh.label)}</span><span class="gw-context-refresh-sub">Current work preserved</span>`;
  } else if (refresh?.kind === "ok") {
    extra = `${ctx ? `<span class="gw-context-pct">${esc(ctx)}</span>` : ""}<span class="gw-context-refresh" data-gw-context-refresh data-kind="ok">${esc(refresh.label)}</span>`;
  } else if (refresh?.kind === "err") {
    extra = `<span class="gw-context-refresh" data-gw-context-refresh data-kind="err">${esc(refresh.label)}</span>`;
  } else if (ctx) {
    extra = `<span class="gw-context-pct">${esc(ctx)}</span>`;
  }
  const button = renderContextRefreshButton(lane, { compact: true });
  return `<div class="gw-claude-run" data-gw-claude-run data-running="${st.running ? "1" : "0"}"${refresh ? ` data-refresh="${esc(refresh.kind)}"` : ""}>
    <span class="gw-claude-run-dot" aria-hidden="true"></span>
    <span>${esc(st.label)}</span>
    ${extra}
    ${button}
  </div>`;
}

export function viewedStorageKey(laneId) {
  return `${VIEWED_KEY_PREFIX}${laneId}`;
}

export function readViewed(laneId, storage, aliases = []) {
  if (!laneId || !storage) return null;
  const ids = [laneId, ...aliases].filter(Boolean);
  for (const id of ids) {
    try {
      const raw = storage.getItem(viewedStorageKey(id));
      if (!raw) continue;
      const rec = JSON.parse(raw);
      if (rec && typeof rec === "object") {
        if (id !== laneId) writeViewed(laneId, rec, storage);
        return rec;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function writeViewed(laneId, rec, storage) {
  if (!laneId || !storage) return;
  try {
    storage.setItem(viewedStorageKey(laneId), JSON.stringify({
      fingerprint: rec?.fingerprint || null,
      activity_ms: rec?.activity_ms || null,
      viewed_at: rec?.viewed_at || Date.now(),
    }));
  } catch { /* private mode */ }
}

export function statusOpenDefault({ widthPx, stored } = {}) {
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return Number(widthPx) >= DESKTOP_MIN_PX;
}

export function readStatusOpen(storage, widthPx) {
  let stored = null;
  try { stored = storage?.getItem(STATUS_OPEN_KEY) || null; } catch { stored = null; }
  return statusOpenDefault({ widthPx, stored });
}

export function writeStatusOpen(open, storage) {
  try { storage?.setItem(STATUS_OPEN_KEY, open ? "open" : "closed"); } catch { /* */ }
}

/** Desktop keeps the details panel open; mobile opens it on demand. */
export function laneFoldDefault({ widthPx, stored } = {}) {
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return Number(widthPx) >= DESKTOP_MIN_PX;
}

export function readLaneFoldOpen(storage, widthPx) {
  let stored = null;
  try { stored = storage?.getItem(LANE_FOLD_KEY) || null; } catch { stored = null; }
  return laneFoldDefault({ widthPx, stored });
}

export function writeLaneFoldOpen(open, storage) {
  try { storage?.setItem(LANE_FOLD_KEY, open ? "open" : "closed"); } catch { /* */ }
}

/**
 * Smallest truthful lane activity model.
 * Does not parse TUI chrome (❯ / ⏺) and does not claim Working / Waiting.
 */
export function deriveLaneStatus({
  lane,
  output,
  lastInstruction,
  viewed,
  viewing = false,
  nowMs = Date.now(),
} = {}) {
  const session = !lane?.tmux?.alive
    ? "unavailable"
    : (lane.claude?.presence === "present" ? "connected" : "running");

  if (session === "unavailable") {
    const bound = Boolean(lane?.worktree?.path || lane?.binding?.worktree_path);
    const cap = deriveLaneExecutionPosture(lane);
    if (cap.state === "QUEUED_FOR_CAPACITY") {
      return {
        session: "offline",
        activity: "queued",
        attention: "none",
        headline: cap.headline,
        listHint: cap.label,
      };
    }
    if (cap.state === "STARTING") {
      return { session: "offline", activity: "starting", attention: "none", headline: cap.headline, listHint: cap.label };
    }
    if (cap.state === "CONNECTED" || cap.state === "RUNNING") {
      return { session: "offline", activity: cap.state.toLowerCase(), attention: "none", headline: cap.headline, listHint: cap.label };
    }
    if (lane?.durable && !bound) {
      return {
        session: "offline",
        activity: "idle",
        attention: "none",
        headline: "Idle",
        listHint: "Idle",
      };
    }
    if (lane?.durable) {
      const sess = lane.agent_session?.state;
      if (sess === "STARTING") {
        return { session: "offline", activity: "starting", attention: "none", headline: cap.headline || "Starting…", listHint: "Starting" };
      }
      if (sess === "VERIFYING" || sess === "RESTARTING") {
        return { session: "offline", activity: "orienting", attention: "none", headline: cap.headline || "Orienting…", listHint: "Starting" };
      }
      return {
        session: "offline",
        activity: "offline",
        attention: "none",
        headline: "No agent session running",
        listHint: "No session",
      };
    }
    return {
      session,
      activity: "unavailable",
      attention: "unavailable",
      headline: "Session unavailable",
      listHint: "Unavailable",
    };
  }

  const fp = output?.ok === false ? null : (output?.fingerprint || null);
  const fpAtSend = lastInstruction?.output_fingerprint_at_send || null;
  const outputChangedAfterSend = Boolean(fp && fpAtSend && fp !== fpAtSend);
  const capturedMs = output?.captured_at ? Date.parse(output.captured_at) : NaN;
  const activityMs = Number(lane?.last_activity_ms) || 0;

  let activity = "quiet";
  if (outputChangedAfterSend) activity = "after_instruction";
  else if (Number.isFinite(capturedMs)) activity = "output_updated";

  const viewedFp = viewed?.fingerprint || null;
  const viewedAct = Number(viewed?.activity_ms) || 0;
  let attention = "none";
  if (!viewing) {
    if (session === "unavailable") attention = "unavailable";
    else if (fp && viewedFp && fp !== viewedFp) attention = "new_output";
    else if (activityMs && viewedAct && activityMs > viewedAct) attention = "new_output";
    else if (!viewed && lastInstruction && outputChangedAfterSend) attention = "new_output";
  }

  const sessionLabel = session === "connected" ? "Claude connected" : "Session running";
  let headline = sessionLabel;
  if (activity === "after_instruction") {
    headline = `${sessionLabel} · activity after your instruction`;
  } else if (activityMs) {
    const when = ago(activityMs, nowMs);
    if (when) headline = `${sessionLabel} · activity ${when} ago`;
  } else if (Number.isFinite(capturedMs)) {
    const when = ago(capturedMs, nowMs);
    if (when) headline = `${sessionLabel} · output ${when} ago`;
  }

  let listHint = null;
  if (attention === "new_output") listHint = "New output";

  return { session, activity, attention, headline, listHint };
}

export function notificationEvent({ status, viewingSelected, lastInstruction, laneLabel } = {}) {
  if (viewingSelected) return null;
  if (!lastInstruction) return null;
  if (status?.attention !== "new_output" && status?.activity !== "after_instruction") return null;
  const label = laneLabel || "Development Lane";
  return {
    type: "lane_unseen_after_instruction",
    title: label,
    body: "New Claude output is available.",
  };
}

export const COPY_FEEDBACK_MS = 1600;
export const NOTIFY_ENABLED_KEY = "vac.gw.notifyEnabled";

export function relativeNotifyTime(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (sec < 15) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function pageOriginKind(origin, { secureContext = true } = {}) {
  const raw = String(origin || "").trim();
  if (!raw) return secureContext ? "https" : "http_insecure";
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") return "https";
    if (["127.0.0.1", "localhost", "::1"].includes(u.hostname)) return "http_loopback";
    return "http_insecure";
  } catch {
    return secureContext ? "https" : "http_insecure";
  }
}

export function notificationUiState({
  permission,
  enabled,
  subscribed,
  secureContext,
  standalone,
  isIOS,
  error,
  originKind,
  lastTestAt,
  lastTestOk,
  vapidAvailable,
  swControlling,
  nowMs,
} = {}) {
  const kindFromOrigin = originKind || (secureContext === false ? "http_insecure" : null);
  if (secureContext === false || kindFromOrigin === "http_insecure") {
    return {
      kind: "https",
      headline: "Needs attention",
      label: "This page is HTTP, so this device cannot enable notifications. Open the https://… Vacilando address (no :3020), then tap Enable notifications.",
      action: null,
    };
  }
  if (kindFromOrigin === "http_loopback" || kindFromOrigin === "origin_mismatch") {
    return {
      kind: "origin",
      headline: "Needs attention",
      label: "Notifications need to be re-enabled on this device. Open the current HTTPS Vacilando address, then tap Enable notifications.",
      action: kindFromOrigin === "origin_mismatch" ? "repair" : null,
    };
  }
  if (isIOS && standalone === false) {
    return { kind: "install", headline: "Needs attention", label: "Add Vacilando to Home Screen, then enable notifications.", action: null };
  }
  if (permission === "denied") {
    return {
      kind: "blocked",
      headline: "Needs attention",
      label: isIOS ? "Notifications blocked in iPhone settings" : "Notifications blocked in browser settings",
      action: null,
    };
  }
  if (error) {
    return { kind: "error", headline: "Needs attention", label: String(error), action: "retry" };
  }
  const healthy = Boolean(permission === "granted" && subscribed);
  if (healthy) {
    const last = relativeNotifyTime(lastTestAt, nowMs);
    let lastTest = "Not sent yet";
    if (last && lastTestOk === false) lastTest = `Failed ${last}`;
    else if (last && lastTestOk) lastTest = `Delivered ${last}`;
    else if (last) lastTest = last;
    return {
      kind: "on",
      headline: "Enabled",
      label: "Notifications on",
      action: "test",
      health: {
        permission: "Granted",
        subscription: "Active",
        push: vapidAvailable === false ? "Not configured" : "Connected",
        worker: swControlling === false ? "Registered" : "Active",
        lastTest,
      },
    };
  }
  if (enabled && permission === "granted") {
    return {
      kind: "needs",
      headline: "Needs attention",
      label: "This device is not subscribed to the current Vacilando address.",
      action: "repair",
    };
  }
  return { kind: "off", headline: "Notify", label: "Get notified when managed work completes or needs you.", action: "enable" };
}

export function renderNotificationControls(state = {}) {
  const st = notificationUiState(state);
  let action = "";
  if (st.action === "enable") {
    action = `<button type="button" class="btn sm gw-notify-enable" data-gw-notify-enable>Enable notifications</button>`;
  } else if (st.action === "retry" || st.action === "repair") {
    action = `<button type="button" class="btn sm gw-notify-enable" data-gw-notify-enable>${st.action === "repair" ? "Repair notifications" : "Retry"}</button>`;
  } else if (st.action === "test") {
    action = `<button type="button" class="btn sm gw-notify-test" data-gw-notify-test>Send test notification</button>`;
  }
  const health = st.health
    ? `<dl class="gw-notify-health">
      <dt>Permission</dt><dd>${esc(st.health.permission)}</dd>
      <dt>Device subscription</dt><dd>${esc(st.health.subscription)}</dd>
      <dt>Push service</dt><dd>${esc(st.health.push)}</dd>
      <dt>Last test</dt><dd>${esc(st.health.lastTest)}</dd>
    </dl>`
    : "";
  return `<details class="gw-notify" data-gw-notify data-kind="${esc(st.kind || "off")}">
    <summary class="gw-notify-sum" aria-label="Notifications">
      <span class="gw-notify-mark" aria-hidden="true"></span>
      <span class="gw-notify-sum-label">${esc(st.headline || "Notify")}</span>
    </summary>
    <div class="gw-notify-pop">
      <p class="gw-notify-h">Notifications</p>
      <p class="gw-notify-copy">${esc(st.label)}</p>
      ${health}
      <div class="gw-notify-actions">${action}</div>
    </div>
  </details>`;
}

/** Active lane output only — never last instruction, metadata, or another lane. */
export function copyableOutputText({ selectedId, output, outputText, lane = null, latestResponse = null } = {}) {
  // COPY WHAT THE OPERATOR IS READING — all of it, not just the sources this
  // function used to know about.
  //
  // The conversation renders from assistantMessageSource, which falls back
  // agent report -> session transcript -> status summary. This function only
  // knew about the report and the pane, so on every lane whose message came
  // from the transcript or the status summary it returned null, the control
  // rendered `disabled`, and clicking the copy icon did nothing at all. That is
  // the reported bug: measured across four live lanes, the button was disabled
  // on every one.
  //
  // The two must not be able to disagree again, so copy asks the SAME source
  // the message is rendered from.
  const shown = assistantMessageSource(lane, { output, outputText, latestResponse });
  if (shown?.text && String(shown.text).trim()) return String(shown.text);
  const report = lane?.execution_run?.agent_report || lane?.previous_run?.agent_report || null;
  if (report?.message) return String(report.message);
  if (output && selectedId && output.lane_id && output.lane_id !== selectedId) return null;
  if (output && output.ok === false) return null;
  const raw = output && Object.prototype.hasOwnProperty.call(output, "text")
    ? output.text
    : outputText;
  if (raw == null) return null;
  const s = String(raw);
  if (!s.trim()) return null;
  if (s === "Refreshing output…") return null;
  return s;
}

/**
 * What the copy icon must copy.
 *
 * `output.text` in "recent" mode is a bounded 120-line snapshot of the visible
 * pane — copying it hands the operator a fragment of the response and calls it
 * the response. When the visible output is bounded, copy fetches the complete
 * text first: the transcript's assistant message for a finished run, retained
 * history otherwise.
 */
export function copySourcePlan(output, { lane = null } = {}) {
  // A stored report IS the message. It is already complete and already local —
  // there is nothing to fetch and nothing a pane could add.
  const report = lane?.execution_run?.agent_report || lane?.previous_run?.agent_report || null;
  if (report?.message) {
    return { needsFetch: false, mode: "agent_report", reason: "stored_report" };
  }
  const mode = output?.mode || "recent";
  if (mode === "latest_response" && output?.available !== false) {
    return { needsFetch: false, mode, reason: "already_complete" };
  }
  if (mode === "extended" && !output?.truncated) {
    return { needsFetch: false, mode, reason: "already_complete" };
  }
  // A viewport-only pane is bounded by definition: the agent TUI keeps no tmux
  // scrollback, so what is on screen is a WINDOW onto the response, never the
  // response. Copying it hands over whatever happened to be visible.
  const viewportOnly = output?.viewport_only === true
    || (output?.alternate_screen === true && Number(output?.history_size) === 0);
  const bounded = Boolean(output?.truncated)
    || viewportOnly
    || Number(output?.history_size) > Number(output?.returned_lines || output?.line_count || 0);
  if (mode === "recent" && !bounded) {
    return { needsFetch: false, mode: "recent", reason: "pane_is_whole" };
  }
  const finished = !lane?.execution_run
    || ["COMPLETE", "FAILED"].includes(String(lane?.execution_run?.state || ""));
  const cursorLane = laneProviderKind(lane) === "cursor";
  // A viewport-only pane has no retained history to fall back on, so the
  // transcript's assistant message is the only complete source there is.
  if ((finished || viewportOnly) && !cursorLane) {
    return { needsFetch: true, mode: "latest_response", fallback: "extended", reason: "complete_final_response" };
  }
  return { needsFetch: true, mode: "extended", fallback: null, reason: "retained_history" };
}

export function renderCopyControl({ text, feedback } = {}) {
  const disabled = !text;
  const label = feedback === "copied" ? "Copied" : feedback === "failed" ? "Copy failed" : "Copy";
  const mark = feedback === "copied" ? "✓" : "⧉";
  return `<button type="button" class="btn gw-copy gw-copy-icon" data-gw-copy aria-label="${esc(label)}" title="${esc(label)}" ${disabled ? "disabled" : ""}><span class="gw-copy-mark" aria-hidden="true">${mark}</span><span class="gw-copy-label">${esc(label)}</span></button>`;
}

export function notificationClickHash(laneId) {
  const id = String(laneId || "").trim();
  return id ? laneDetailHash(id) : GATEWAY_HOME;
}

export function executionRunListHint(run, lane) {
  if (lane) {
    const cap = deriveLaneExecutionPosture(lane);
    if (cap.state === "CONNECTED" && !run?.state) return cap.hint || cap.label;
    if (cap.state !== "RUNNING" && cap.state !== "CONNECTED") return cap.hint;
  }
  const bound = Boolean(lane?.binding?.worktree_path || lane?.worktree?.path);
  const liveAgent = lane?.claude?.presence === "present" || lane?.runtime === "online";
  const liveRun = ["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT", "RECOVERING"].includes(run?.state);
  if (!liveAgent && !liveRun && (lane?.admission?.state === "QUEUED" || run?.admission?.state === "QUEUED")) {
    const n = lane?.admission?.queue_position || run?.admission?.queue_position;
    if (bound) return n ? `Queued · no agent session · #${n}` : "Queued · no agent session";
    return n ? `Queued for capacity · #${n}` : "Queued for capacity";
  }
  if (lane?.admission?.state === "FAILED") return "Needs attention";
  if (!run?.state && lane?.durable && !bound) return "Idle";
  if (!run?.state && lane?.durable && bound && lane?.claude?.presence !== "present") return "No agent session";
  if (!run?.state) return lane ? "Running" : null;
  if (run.runtime_posture?.state === "SESSION_ROTATING") return "Refreshing Claude context";
  if (run.runtime_posture?.state === "RECOVERING") return "Recovering";
  if (run.runtime_posture?.state === "QUIESCED") return "Quiesced";
  switch (run.state) {
    case "NEEDS_INPUT": return "Needs input";
    case "FAILED": return "Failed";
    case "COMPLETE": return "Complete";
    case "ABANDONED": return "Abandoned";
    case "WAITING_RESOURCE": {
      if (isGovernedDirectorWait(run)) {
        if (run.governed_action?.status === "awaiting_operator") return "Needs approval";
        if (run.governed_action?.status === "awaiting_control_plane_refresh") return "Updating Director";
        return "Waiting on Director";
      }
      const phase = run.resource_wait?.exclusive_phase;
      if (phase && phase !== "EXCLUSIVE_ACTIVE") {
        return "Preparing exclusive timing";
      }
      if (run.resource_wait?.resuming) {
        return `${run.resource_wait.label || "Resource"} available`;
      }
      if (run.resource_wait?.ready_to_resume) return "Ready to resume";
      const label = run.resource_wait?.label;
      if (label) {
        const s = String(label);
        return /^waiting\b/i.test(s) ? s : `Waiting for ${s}`;
      }
      return run.state_reason || "Waiting for resource";
    }
    case "VALIDATING": return "Validating";
    case "RECOVERING": return "Recovering";
    case "EXECUTING": return "Executing";
    case "QUEUED": return "Queued";
    default: return "Current work executing";
  }
}

export function executionRunTone(stateOrRun) {
  const run = stateOrRun && typeof stateOrRun === "object" ? stateOrRun : { state: stateOrRun };
  const s = String(run.state || "");
  if (s === "NEEDS_INPUT") return "needs";
  if (s === "FAILED") return "failed";
  if (s === "COMPLETE") return "complete";
  if (s === "ABANDONED") return "abandoned";
  if (s === "WAITING_RESOURCE" && run.resource_wait?.resuming) return "ready";
  if (s === "WAITING_RESOURCE" && run.resource_wait?.ready_to_resume) return "ready";
  if (run.runtime_posture?.state === "SESSION_ROTATING") return "run";
  if (run.runtime_posture?.state === "RECOVERING" || s === "RECOVERING") return "recovering";
  if (run.runtime_posture?.state === "QUIESCED") return "quiesced";
  if (s === "WAITING_RESOURCE" || s === "VALIDATING" || s === "EXECUTING" || s === "QUEUED") return "run";
  return "";
}

export function renderOperatorDecisionActions(run) {
  const ga = run?.governed_action;
  if (ga?.status === "awaiting_operator") {
    return `<div class="gw-work-stale" data-gw-governed-approval>
      <p class="gw-work-stale-copy">${esc(ga.detail || ga.mission_need || `Read-only database census · Target: ${ga.target || "alloy_deployed_primary"} · Data mode: Read-only`)}</p>
      <div class="gw-work-stale-actions">
        <button type="button" class="btn primary" data-gw-governed-approve data-request-id="${esc(ga.request_id || "")}">${esc(ga.approve_label || "Authorize census")}</button>
        <button type="button" class="btn" data-gw-governed-deny data-request-id="${esc(ga.request_id || "")}">${esc(ga.deny_label || "Deny")}</button>
      </div>
    </div>`;
  }
  const lifecycle = run?.run_lifecycle?.class || run?.run_lifecycle?.class;
  if (lifecycle === "ambiguous" || lifecycle === "stale") {
    return `<div class="gw-work-stale">
    <p class="gw-work-stale-copy">Previous work may not have completed.</p>
    <div class="gw-work-stale-actions">
      <button type="button" class="btn primary" data-gw-close-stale data-run-id="${esc(run.run_id || "")}">Close stale run and continue</button>
      <button type="button" class="btn" data-gw-review-run>Review run</button>
    </div>
  </div>`;
  }
  return "";
}

export function renderOperatorDecisionBar(run) {
  const inner = renderOperatorDecisionActions(run);
  if (!inner) return "";
  const awaiting = run?.governed_action?.status === "awaiting_operator";
  return `<div class="gw-decision-bar" data-gw-decision-bar data-kind="${awaiting ? "approval" : "stale"}">
    <div class="gw-decision-h">${awaiting ? "Needs approval" : "Previous work"}</div>
    ${inner}
  </div>`;
}

export function renderCurrentWork(run, nowMs = Date.now()) {
  if (!run?.state) {
    return `<aside class="gw-work is-idle" data-gw-work data-run-state="none">
    <span class="gw-work-h">Current work</span>
    <span class="gw-work-state">No active work</span>
    <span class="gw-work-meta">Ready for instruction</span>
  </aside>`;
  }
  const lifecycle = run.run_lifecycle?.class;
  const tone = executionRunTone(run);
  const wait = run.resource_wait;
  const ready = run.state === "WAITING_RESOURCE" && Boolean(wait?.ready_to_resume);
  const resuming = ready && Boolean(wait?.resuming);
  const waiting = run.state === "WAITING_RESOURCE" && !ready;
  const validating = run.state === "VALIDATING";
  const recovering = run.runtime_posture?.state === "RECOVERING" || run.state === "RECOVERING";
  const rotating = run.runtime_posture?.state === "SESSION_ROTATING";
  const exclusivePreparing = waiting && wait?.exclusive_phase && wait.exclusive_phase !== "EXCLUSIVE_ACTIVE";
  const governed = isGovernedDirectorWait(run);
  const label = rotating
    ? "Refreshing Claude context…"
    : recovering
    ? "Recovering"
    : resuming
    ? "Resuming…"
    : ready
      ? "Ready to resume"
      : exclusivePreparing
        ? "Preparing exclusive timing"
        : governed
        ? (run.governed_action?.status === "awaiting_control_plane_refresh"
          ? "Updating Director"
          : (run.governed_action?.status === "awaiting_operator"
            ? "Needs approval"
            : "Waiting on Director"))
        : waiting
        ? "Waiting for resource"
        : (run.admission?.state === "QUEUED"
          ? (run.state_reason === "waiting_for_agent_session" ? "Work queued" : "Queued for development capacity")
          : (executionRunListHint(run) || run.state));
  const startedMs = run.started_at ? Date.parse(run.started_at) : NaN;
  const started = Number.isFinite(startedMs) ? ago(startedMs, nowMs) : null;
  const terminal = run.state === "COMPLETE" || run.state === "FAILED" || run.state === "ABANDONED";
  const reason = run.state_reason || run.latest_progress?.summary || null;
  const summary = run.completion_report?.summary || null;
  const instruction = run.instruction ? String(run.instruction) : "";
  const meta = !terminal && started ? `Started ${started} ago` : "";
  const resourceLine = rotating
    ? "Preserving current Execution Run"
    : recovering && run.runtime_posture?.reason
    ? run.runtime_posture.reason
    : exclusivePreparing && wait?.exclusive_detail
    ? wait.exclusive_detail
    : governed
    ? (run.governed_action?.title || wait?.summary || "Governed action requested")
    : waiting && wait?.label
    ? wait.label
    : (run.admission?.state === "QUEUED"
      ? (run.state_reason === "waiting_for_agent_session"
        ? "No agent session running."
        : "You do not need to keep this screen open.")
      : ((ready || validating) && wait?.label ? `${wait.label}${ready ? " available" : wait?.resource_key === "runtime_timing_certification" ? " window" : ""}` : ""));
  const queueLine = run.admission?.state === "QUEUED" && run.admission?.queue_position
    ? `#${run.admission.queue_position} admission queue`
    : waiting && wait?.queue_position && !exclusivePreparing
    ? `#${wait.queue_position} in queue`
    : (resuming ? "Resuming…" : (validating && wait?.resource_key === "runtime_timing_certification" ? "Exclusive timing window" : ""));
  const resumeEvent = wait?.resume_event?.summary && (validating || wait?.continuation_state === "DELIVERED")
    ? wait.resume_event.summary
    : "";
  const title = instruction || label;
  return `<aside class="gw-work${tone ? ` is-${tone}` : ""}" data-gw-work data-run-state="${esc(run.state)}"${ready ? " data-ready-to-resume" : ""}${resuming ? " data-resuming" : ""}${title ? ` title="${esc(title)}"` : ""}>
    <span class="gw-work-h">Current work</span>
    <span class="gw-work-state">${esc(label)}</span>
    ${instruction ? `<span class="gw-work-text">${esc(instruction)}</span>` : ""}
    ${resourceLine ? `<span class="gw-work-resource">${esc(resourceLine)}</span>` : ""}
    ${governed && run.governed_action?.reason_worker_cannot_execute ? `<span class="gw-work-reason">${esc(run.governed_action.reason_worker_cannot_execute)}</span>` : ""}
    ${governed && run.governed_action?.action_key ? `<span class="gw-work-meta">Director is handling ${esc(run.governed_action.action_key)}.</span>` : ""}
    ${renderOperatorDecisionActions(run)}
    ${queueLine && queueLine !== label ? `<span class="gw-work-queue">${esc(queueLine)}</span>` : ""}
    ${resumeEvent ? `<span class="gw-work-resume">${esc(resumeEvent)}</span>` : ""}
    ${meta ? `<span class="gw-work-meta">${esc(meta)}</span>` : ""}
    ${reason && reason !== summary && !waiting && !resumeEvent ? `<span class="gw-work-reason">${esc(reason)}</span>` : ""}
    ${summary && summary !== resumeEvent ? `<span class="gw-work-summary">${esc(summary)}</span>` : ""}
  </aside>`;
}

export function renderLaneSessionCallout(lane, extras = {}) {
  if (!lane?.durable) return "";
  const bound = Boolean(lane.worktree?.path || lane.binding?.worktree_path);
  const who = laneProviderLabel(lane);
  const sessState = lane.agent_session?.state;
  if (sessState === "STARTING") {
    return `<aside class="gw-session-callout" data-gw-session-callout data-starting>
      <div class="gw-work-h">Agent</div>
      <p class="gw-lead">Starting ${esc(who)}…</p>
    </aside>`;
  }
  if (sessState === "VERIFYING" || sessState === "RESTARTING") {
    return `<aside class="gw-session-callout" data-gw-session-callout data-orienting>
      <div class="gw-work-h">Agent</div>
      <p class="gw-lead">Orienting ${esc(who)}…</p>
    </aside>`;
  }
  if (liveAgentOnLane(lane)) return "";
  if (!bound) return "";
  const cap = extras.executionCapacity;
  const occupying = Array.isArray(cap?.running) ? cap.running.map((r) => r.name).filter(Boolean) : [];
  const atProviderCap = who !== "Cursor"
    && cap
    && Number(cap.available) === 0
    && occupying.length > 0;
  if (lane.admission?.state === "QUEUED" && lane.execution_run?.state_reason === "waiting_for_execution_capacity" && !atProviderCap) {
    const n = lane.admission?.queue_position;
    return `<aside class="gw-session-callout" data-gw-session-callout data-queued>
      <div class="gw-work-h">Agent</div>
      <p class="gw-lead">Queued for execution capacity</p>
      ${n ? `<p class="gw-session-callout-d">#${n}</p>` : ""}
    </aside>`;
  }
  const title = "No agent session";
  const detail = atProviderCap
    ? `Claude is at ${cap.active}/${cap.max_active}. Running: ${occupying.join(", ")}. Release one to start this session.`
    : (laneProviderKind(lane) === "cursor"
      ? "Cursor transcript is read-only. Start a Claude session to send instructions."
      : "Existing worktree is connected. Start a persistent Claude session to continue queued work.");
  const btn = `<button type="button" class="btn primary" data-gw-session-start data-lane-id="${esc(lane.lane_id)}">Start Session</button>`;
  return `<aside class="gw-session-callout" data-gw-session-callout>
    <div class="gw-work-h">Agent</div>
    <p class="gw-lead">${esc(title)}</p>
    <p class="gw-session-callout-d">${esc(detail)}</p>
    ${btn}
  </aside>`;
}

export function lastInstructionMeta(rec, nowMs = Date.now()) {
  if (!rec) return null;
  if (rec.status === "queued") {
    const when = rec.queued_at ? ago(Date.parse(rec.queued_at), nowMs) : null;
    return when ? `Queued · ${when} ago — not yet in the agent pane` : "Queued — not yet in the agent pane";
  }
  if (rec.status !== "delivered") return null;
  const when = rec.delivered_at ? ago(Date.parse(rec.delivered_at), nowMs) : null;
  return when ? `Delivered · ${when} ago` : "Delivered";
}

export function previousRunHint(run) {
  if (!run?.state) return null;
  if (run.state === "ABANDONED") return "Abandoned";
  if (run.state === "COMPLETE") return "Complete";
  if (run.state === "FAILED") return "Failed";
  return executionRunListHint(run);
}

/**
 * ABANDONED is not FAILED and not COMPLETE. When the lane and worktree still
 * match, it is a recoverable state and the operator gets the canonical
 * continuation action — never "make a new run to continue the same sprint".
 */
export function abandonedRecoveryNotice(run) {
  if (run?.state !== "ABANDONED") return null;
  if (run.recoverable) {
    return {
      recoverable: true,
      label: "Abandoned · lane and worktree still match",
      detail: "Vacilando closed this run, but the lane still looks recoverable. Continue it instead of starting a new run.",
      action: "Continue this run",
    };
  }
  const why = {
    lane_has_active_run: "Newer work is already running on this lane.",
    binding_mismatch: "The lane is no longer bound to this run's worktree.",
    lane_missing: "The Development Lane no longer exists.",
    recovery_budget_exhausted: "This run has been recovered too many times.",
  }[run.recovery_blocked_reason] || "This run can no longer be recovered.";
  return { recoverable: false, label: "Abandoned", detail: why, action: null };
}

export function renderPreviousWork(run) {
  if (!run?.state) return "";
  const notice = abandonedRecoveryNotice(run);
  const hint = notice?.label || previousRunHint(run) || run.state;
  const tone = executionRunTone(run);
  const recover = notice?.recoverable
    ? `<div class="gw-work-recover">
      <span class="gw-work-detail">${esc(notice.detail)}</span>
      <button type="button" class="btn sm gw-run-recover" data-gw-run-recover data-run-id="${esc(run.run_id || "")}">${esc(notice.action)}</button>
    </div>`
    : (notice ? `<span class="gw-work-detail">${esc(notice.detail)}</span>` : "");
  return `<aside class="gw-work is-previous${tone ? ` is-${tone}` : ""}${notice?.recoverable ? " is-recoverable" : ""}" data-gw-previous-run data-run-state="${esc(run.state)}"${notice ? ` data-recoverable="${notice.recoverable ? "1" : "0"}"` : ""}>
    <span class="gw-work-h">Previous run</span>
    <span class="gw-work-state">${esc(hint)}</span>
    ${recover}
  </aside>`;
}

export function statusSummaryLine(lane, telemetry) {
  if (!lane) return "";
  const git = gitLine(lane.git);
  const sess = lane.claude?.presence === "present"
    ? "Session connected"
    : (lane.tmux?.alive ? "Session running" : "Session unavailable");
  const ctx = contextCompact(telemetry);
  return ctx ? `${git} · ${ctx} · ${sess}` : `${git} · ${sess}`;
}

export function formatTokenCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return Number.isInteger(m) ? `${m}m` : `${m.toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) {
    const k = v / 1000;
    return `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(Math.round(v));
}

export function contextCompact(telemetry) {
  const pct = telemetry?.context?.percent_used;
  if (Number.isFinite(pct)) return `Context ${Math.round(pct)}%`;
  if (telemetry) return "Context unavailable";
  return null;
}

export function contextDetailLine(telemetry) {
  if (!telemetry?.available) return null;
  const used = formatTokenCount(telemetry.context?.used_tokens);
  const max = formatTokenCount(telemetry.context?.max_tokens);
  const pct = telemetry.context?.percent_used;
  if (used && max && Number.isFinite(pct)) return `${used} / ${max} · ${Math.round(pct)}%`;
  if (used) return used;
  return null;
}

export function sessionCostLabel(telemetry) {
  if (!telemetry) return null;
  if (Number.isFinite(telemetry.cost?.reported_usd)) {
    return `$${Number(telemetry.cost.reported_usd).toFixed(2)}`;
  }
  if (Number.isFinite(telemetry.cost?.estimated_usd)) {
    return `~$${Number(telemetry.cost.estimated_usd).toFixed(2)} estimated`;
  }
  if (telemetry.cost?.billing_mode === "claude_max_subscription") {
    return "Not reported · Claude Max subscription";
  }
  return "Not reported";
}

export function agentSessionLine(telemetry, nowMs = Date.now()) {
  if (!telemetry?.available) return null;
  const bits = [];
  if (telemetry.agent?.started_at) {
    const when = ago(Date.parse(telemetry.agent.started_at), nowMs);
    if (when) bits.push(when);
  }
  const sid = telemetry.agent?.session_id;
  if (sid) bits.push(String(sid).slice(0, 8));
  return bits.length ? bits.join(" · ") : null;
}

function laneListStatus(lane, attention) {
  const work = canonicalLaneWorkState(lane);
  if (attention?.listHint === "New output") {
    return { label: "New output", mark: work.mark, tone: "needs" };
  }
  return {
    label: work.label,
    mark: work.mark,
    tone: work.tone,
  };
}

/**
 * The one readable summary for a lane row. Every candidate goes through
 * summaryText(), so an object-shaped field is read, not stringified.
 */
export function laneRowSummary(lane, work, who) {
  const hint = summaryText(work?.hint);
  if (hint && hint !== work?.label && hint !== who && hint !== `${who} ready`) {
    return hint.slice(0, 140);
  }
  const candidates = [
    lane?.execution_run?.latest_progress,
    lane?.execution_run?.completion_report,
    lane?.execution_run?.resource_wait,
    lane?.previous_run?.completion_report,
  ];
  for (const c of candidates) {
    const text = summaryText(c);
    if (text) return text.slice(0, 140);
  }
  return "";
}

function laneRow(lane, selectedId, attentionByLane, telemetryByLane) {
  const id = lane.lane_id;
  const active = laneMatchesId(lane, selectedId) ? " is-active" : "";
  const work = canonicalLaneWorkState(lane);
  const st = laneListStatus(lane, attentionByLane?.[id]);
  const git = gitListState(lane);
  const who = agentLabel(lane);
  const summary = laneRowSummary(lane, work, who);
  const whenMs = laneUpdatedMs(lane);
  const when = whenMs ? `${ago(whenMs)} ago` : "";
  // One canonical status and one readable summary. Agent, elapsed time and git
  // state used to each get their own line, so a row was five stacked strings
  // and none of them was the answer to "what is this lane doing".
  const metaBits = [who, when, git].filter(Boolean).join(" · ");
  const extra = summary && summary !== st.label
    ? `<span class="gw-lane-summary">${esc(summary)}</span>`
    : "";
  const unseen = renderUnseenIndicator(lane);
  return `<a class="gw-lane${active}${unseen ? " has-unseen" : ""}${work.group === "active" || work.group === "needs_input" ? " is-live" : ""}" data-gw-lane="${esc(id)}" data-gw-group="${esc(work.group)}" href="${esc(laneDetailHash(id))}">
    <span class="gw-lane-title">${esc(lane.label || id)}${unseen}</span>
    <span class="gw-lane-posture${st.tone ? ` is-${st.tone}` : ""}">${esc(st.label)}</span>
    ${extra}
    <span class="gw-lane-meta">${esc(metaBits)}</span>
  </a>`;
}

/**
 * A folder header, including one for the lanes in no folder.
 *
 * The unfiled group MUST get a header once any folder exists. Without one its
 * rows sat directly under the last folder's header — the header said "Later, 1"
 * and two lanes were drawn beneath it, so an unfiled lane read as filed.
 */
function folderHeader(group) {
  const badges = [
    group.unseen ? `<span class="gw-folder-badge is-unseen">${group.unseen} unread</span>` : "",
    group.needs_attention ? `<span class="gw-folder-badge is-attention">${group.needs_attention} needs you</span>` : "",
    group.active ? `<span class="gw-folder-badge is-active">${group.active} working</span>` : "",
    `<span class="gw-folder-count">${group.lane_count}</span>`,
  ].filter(Boolean).join("");
  return `<div class="gw-folder-h" data-gw-folder-h="${esc(group.folder_id)}">
    <button type="button" class="gw-folder-toggle" data-gw-folder-toggle="${esc(group.folder_id)}"
      aria-expanded="${group.collapsed ? "false" : "true"}">
      <span class="gw-folder-caret" aria-hidden="true">${group.collapsed ? "\u25b8" : "\u25be"}</span>
      <span class="gw-folder-name">${esc(group.name)}</span>
      ${badges}
    </button>
    ${group.unfiled ? "" : `<button type="button" class="gw-folder-edit" data-gw-folder-rename="${esc(group.folder_id)}" aria-label="Rename folder ${esc(group.name)}">Rename</button>
    <button type="button" class="gw-folder-edit" data-gw-folder-delete="${esc(group.folder_id)}" aria-label="Delete folder ${esc(group.name)}">Delete</button>`}
  </div>`;
}

/**
 * Where this lane is filed. A folder is chosen from the ones that exist — there
 * is no free-text folder here, because a typo would silently create a second
 * folder that looks like the first one.
 */
/**
 * Which repository this lane executes in.
 *
 * Read-only on purpose. Moving a lane between repositories is an execution
 * rebind — a different worktree, a different Git object store, a different
 * provider working directory — and it must never be reachable from the same
 * control that reorganises folders.
 */
export function renderLaneRepository(lane, repositories = []) {
  const id = lane?.repository_id || null;
  const repo = (repositories || []).find((r) => r.repository_id === id) || null;
  if (!id && !repo) {
    return `<div class="gw-repo-id is-unknown"><span class="gw-repo-id-label">Repository</span>
      <span class="gw-repo-id-value">Not attributed</span></div>`;
  }
  const bits = [
    repo?.default_branch,
    repo?.has_remote === false ? "local only" : null,
    repo?.profile_label,
  ].filter(Boolean).join(" · ");
  return `<div class="gw-repo-id">
    <span class="gw-repo-id-label">Repository</span>
    <span class="gw-repo-id-value">${esc(repo?.name || id)}</span>
    ${bits ? `<span class="gw-repo-id-meta">${esc(bits)}</span>` : ""}
  </div>`;
}

export function renderLaneFolderPicker(lane, folders = [], selectedId = null) {
  const laneId = lane?.lane_id || selectedId;
  if (!laneId) return "";
  const list = (Array.isArray(folders) ? folders : []).filter((f) => f?.folder_id);
  const current = lane?.folder_id ? String(lane.folder_id) : "";
  const opts = [`<option value=""${current ? "" : " selected"}>No folder</option>`]
    .concat(list.map((f) => {
      const id = String(f.folder_id);
      return `<option value="${esc(id)}"${id === current ? " selected" : ""}>${esc(f.name)}</option>`;
    }))
    .join("");
  return `<label class="gw-folder-pick">
    <span class="gw-folder-pick-label">Folder</span>
    <select data-gw-folder-select data-lane-id="${esc(laneId)}"${list.length ? "" : " disabled"}>${opts}</select>
    ${list.length ? "" : `<span class="gw-folder-pick-hint">Create a folder from the lane list first.</span>`}
  </label>`;
}

export const UNKNOWN_REPOSITORY_ID = "__unattributed__";

/**
 * Group lanes by repository, then by folder inside each repository.
 *
 * A repository is the TOP boundary because it is the execution boundary; a
 * folder is presentation inside it. The active-first ordering is preserved
 * within each group, and a repository inherits the rank of its most urgent
 * lane, so a repository holding blocked work never sinks below a quiet one.
 */
export function groupLanesByRepository(lanes, repositories = [], folders = [], {
  collapsed = new Set(), outputByLane = {}, nowMs = Date.now(),
} = {}) {
  const ordered = sortLanesForIndex(Array.isArray(lanes) ? lanes : [], { outputByLane, nowMs });
  const known = new Map();
  for (const r of Array.isArray(repositories) ? repositories : []) {
    if (r?.repository_id) known.set(String(r.repository_id), r);
  }
  const groups = new Map();
  const groupFor = (id, repo) => {
    if (!groups.has(id)) {
      groups.set(id, {
        repository_id: id,
        name: repo?.name || "Unattributed",
        profile: repo?.profile || null,
        profile_label: repo?.profile_label || null,
        has_remote: repo?.has_remote ?? null,
        default_branch: repo?.default_branch || null,
        lanes: [], rank: Number.MAX_SAFE_INTEGER,
        needs_attention: 0, active: 0, unseen: 0,
        unknown: !repo,
      });
    }
    return groups.get(id);
  };
  for (const r of known.values()) groupFor(r.repository_id, r);

  ordered.forEach((lane, index) => {
    const raw = lane?.repository_id ? String(lane.repository_id) : null;
    const id = raw && known.has(raw) ? raw : UNKNOWN_REPOSITORY_ID;
    const g = groupFor(id, known.get(id) || null);
    g.lanes.push(lane);
    if (index < g.rank) g.rank = index;
    const work = canonicalLaneWorkState(lane, { output: outputByLane[lane?.lane_id], nowMs });
    if (work.group === "needs_input") g.needs_attention += 1;
    if (work.group === "active") g.active += 1;
    g.unseen += laneUnseenCount(lane);
  });

  return [...groups.values()]
    .filter((g) => g.lanes.length || !g.unknown)
    .map((g) => ({
      ...g,
      lane_count: g.lanes.length,
      collapsed: collapsed?.has?.(`repo:${g.repository_id}`) === true,
      // Folders are nested INSIDE the repository, scoped to it.
      folders: groupLanesByFolder(g.lanes, (folders || []).filter(
        (f) => (f.repository_id || null) === (g.unknown ? null : g.repository_id),
      ), { collapsed, outputByLane, nowMs }),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
      return String(a.name).localeCompare(String(b.name));
    });
}

function repositoryHeader(group) {
  const badges = [
    group.unseen ? `<span class="gw-folder-badge is-unseen">${group.unseen} unread</span>` : "",
    group.needs_attention ? `<span class="gw-folder-badge is-attention">${group.needs_attention} needs you</span>` : "",
    group.active ? `<span class="gw-folder-badge is-active">${group.active} working</span>` : "",
    `<span class="gw-folder-count">${group.lane_count}</span>`,
  ].filter(Boolean).join("");
  // Only a repository whose profile HAS the concept shows Alloy vocabulary.
  const meta = group.unknown
    ? "not attributed"
    : [group.default_branch, group.has_remote === false ? "local only" : null].filter(Boolean).join(" · ");
  return `<div class="gw-repo-h" data-gw-repo-h="${esc(group.repository_id)}">
    <button type="button" class="gw-repo-toggle" data-gw-repo-toggle="${esc(group.repository_id)}"
      aria-expanded="${group.collapsed ? "false" : "true"}">
      <span class="gw-folder-caret" aria-hidden="true">${group.collapsed ? "\u25b8" : "\u25be"}</span>
      <span class="gw-repo-name">${esc(group.name)}</span>
      ${meta ? `<span class="gw-repo-meta">${esc(meta)}</span>` : ""}
      ${badges}
    </button>
  </div>`;
}

function renderFolderGroups(groups, selectedId, attentionByLane, telemetryByLane) {
  const list = (groups || []).filter((g) => !g.unfiled || g.lanes.length);
  // Inside ONE repository with no folders, the lanes are just the lanes.
  if (list.length === 1 && list[0].unfiled) {
    return list[0].lanes.map((l) => laneRow(l, selectedId, attentionByLane, telemetryByLane)).join("");
  }
  return list.map((g) => `<div class="gw-folder${g.collapsed ? " is-collapsed" : ""}${g.unfiled ? " is-unfiled" : ""}" data-gw-folder="${esc(g.folder_id)}">
    ${folderHeader(g)}
    ${g.collapsed ? "" : (g.lanes.length
      ? g.lanes.map((l) => laneRow(l, selectedId, attentionByLane, telemetryByLane)).join("")
      : `<div class="gw-folder-empty">No lanes in this folder yet.</div>`)}
  </div>`).join("");
}

export function renderLaneList(lanes, selectedId, { loading = false, attentionByLane, telemetryByLane, folders = [], collapsedFolders, repositories = [], nowMs = Date.now() } = {}) {
  const list = sortLanesForIndex(Array.isArray(lanes) ? lanes : [], { nowMs });
  const add = `<a class="gw-add" data-gw-add href="#/lanes/connect">+ Add Lane</a>`;
  const newFolder = `<button type="button" class="gw-add gw-add-folder" data-gw-folder-new>+ Folder</button>`;
  const addRepo = `<button type="button" class="gw-add gw-add-repo" data-gw-repo-new title="Register another Git repository">+ Repo</button>`;
  const head = `<div class="gw-lanes-h-row"><div class="gw-lanes-h">Development Lanes</div>${addRepo}${newFolder}${add}</div>`;
  if (!list.length) {
    return `<div class="gw-lanes" data-gw-lanes>
      ${head}
      <div class="gw-empty">${loading ? "Loading lanes…" : "No Development Lanes discovered."}</div>
    </div>`;
  }
  const repos = Array.isArray(repositories) ? repositories : [];
  // More than one repository makes the repository the top boundary. With ONE
  // repository the operator has nothing to disambiguate, so the list keeps the
  // shape they already know rather than growing a header for a single group.
  if (repos.length > 1) {
    const repoGroups = groupLanesByRepository(list, repos, folders, {
      collapsed: collapsedFolders || new Set(), nowMs,
    });
    const rendered = repoGroups.map((g) => `<div class="gw-repo${g.collapsed ? " is-collapsed" : ""}" data-gw-repo="${esc(g.repository_id)}">
      ${repositoryHeader(g)}
      ${g.collapsed ? "" : (g.lanes.length
        ? renderFolderGroups(g.folders, selectedId, attentionByLane, telemetryByLane)
        : `<div class="gw-folder-empty">No lanes in this repository yet.</div>`)}
    </div>`).join("");
    return `<div class="gw-lanes" data-gw-lanes>${head}${rendered}</div>`;
  }
  const groups = groupLanesByFolder(list, folders, { collapsed: collapsedFolders || new Set(), nowMs });
  // With no folders at all there is nothing to organise, so the list stays
  // exactly as it was — folders must not add chrome to an operator who has none.
  const flat = groups.length === 1 && groups[0].unfiled;
  const body = flat
    ? list.map((l) => laneRow(l, selectedId, attentionByLane, telemetryByLane)).join("")
    : groups.filter((g) => !g.unfiled || g.lanes.length).map((g) => `<div class="gw-folder${g.collapsed ? " is-collapsed" : ""}${g.unfiled ? " is-unfiled" : ""}" data-gw-folder="${esc(g.folder_id)}">
        ${folderHeader(g)}
        ${g.collapsed ? "" : (g.lanes.length
          ? g.lanes.map((l) => laneRow(l, selectedId, attentionByLane, telemetryByLane)).join("")
          : `<div class="gw-folder-empty">No lanes in this folder yet.</div>`)}
      </div>`).join("");
  return `<div class="gw-lanes" data-gw-lanes>
    ${head}
    ${body}
  </div>`;
}

/**
 * The assistant message.
 *
 * The conversation is driven by the run's structured agent report, never by the
 * pane. A pane capture is a bounded window onto a terminal — it scrolls, it is
 * truncated by construction, and it holds the PREVIOUS turn until the next one
 * pushes it out. Showing it as the reply is what let a completion vanish on the
 * next poll.
 */
/**
 * A run that reported through the status-only CLI still has structured,
 * run-bound facts: the summary the worker sent with `vac run-status --summary`,
 * and the state_reason it gave — which for NEEDS_INPUT is the question itself.
 *
 * REGRESSION THIS CLOSES. When the conversation moved to structured reports,
 * every lane that had not adopted `vac run-report` rendered "No agent report on
 * this run yet" — the Runtime Performance lane sat at NEEDS_INPUT with a real
 * summary and a real blocking question in the store, and the operator was shown
 * nothing at all. Refusing to print the pane was right; refusing to print the
 * run's own structured summary was not.
 */
export function statusSummaryMessage(run) {
  if (!run) return null;
  const parts = [];
  const seen = new Set();
  const push = (value) => {
    const text = summaryText(value);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(text);
  };
  // Most specific first: the reason a run stopped is what the operator needs.
  push(run.state_reason);
  push(run.completion_report);
  push(run.latest_progress);
  push(run.resource_wait);
  if (!parts.length) return null;
  return parts.join("\n\n");
}

/** Report type a status-only run maps onto, for labelling only. */
function statusReportType(state) {
  if (state === "NEEDS_INPUT") return "needs_input";
  if (state === "COMPLETE") return "completion";
  if (state === "FAILED") return "failure";
  return "progress";
}

/**
 * The provider's own last message, parsed out of the session transcript.
 *
 * This is NOT a pane capture: `latest_response` comes from the Claude Code
 * session transcript with `source: claude_code_session_transcript`, so it is an
 * attributed assistant message with no TUI chrome and no viewport bound. A lane
 * that has not adopted `vac run-report` still wrote a real answer, and this is
 * where it lives — observed on the Runtime Performance lane: 2,862 characters
 * of summary in the transcript behind a 90-character status string.
 */
export function transcriptResponse(latestResponse) {
  const r = latestResponse;
  if (!r || r.ok === false) return null;
  if (r.mode !== "latest_response") return null;
  if (r.available === false) return null;
  if (r.source && r.source !== "claude_code_session_transcript") return null;
  const text = String(r.text || "");
  return text.trim() ? { text, truncated: r.truncated === true, at: r.captured_at || null } : null;
}

export function assistantMessageSource(lane, { output = null, outputText = "", latestResponse = null } = {}) {
  const report = lane?.execution_run?.agent_report || lane?.previous_run?.agent_report || null;
  if (report?.message) {
    return {
      kind: "report",
      report,
      text: report.message,
      terminal: false,
    };
  }
  const run = lane?.execution_run || lane?.previous_run || null;
  const state = run?.state || null;
  // No structured report, but the provider did write an answer. Prefer the
  // transcript message over the bounded status one-liner: the operator asked
  // for the summary, and the summary is here.
  const transcript = transcriptResponse(latestResponse)
    || transcriptResponse(output);
  if (transcript) {
    return {
      kind: "transcript",
      report: {
        type: statusReportType(state),
        message: transcript.text,
        revision: null,
        phase: null,
        reason: null,
        choices: null,
        result: null,
        transcript_only: true,
        truncated: transcript.truncated,
      },
      text: transcript.text,
      terminal: false,
    };
  }
  // A lane still on the status-only CLI: show what it actually reported, said
  // plainly to be a status summary rather than a full agent message.
  const status = statusSummaryMessage(run);
  if (status) {
    return {
      kind: "status",
      report: {
        type: statusReportType(state),
        message: status,
        revision: null,
        phase: null,
        reason: null,
        choices: null,
        result: null,
        status_only: true,
      },
      text: status,
      terminal: false,
    };
  }
  const working = ["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "RECOVERING", "QUEUED"].includes(state);
  if (working) {
    // No report yet. A restrained working state is honest; raw TUI content
    // dressed as a reply is not.
    return { kind: "working", report: null, text: "", terminal: false };
  }
  return { kind: "none", report: null, text: "", terminal: false };
}

const REPORT_TONE = Object.freeze({
  progress: { label: "Working", tone: "run" },
  needs_input: { label: "Needs your input", tone: "needs" },
  completion: { label: "Complete", tone: "complete" },
  failure: { label: "Failed", tone: "failed" },
});

/**
 * Minimal, escape-first Markdown. Every character is escaped BEFORE any markup
 * is applied, so a report can never inject HTML into the operator's Gateway no
 * matter what an agent puts in it.
 */
export function renderReportMarkdown(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let inCode = false;
  let list = null;
  let table = null;

  let para = [];
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  // Consecutive non-blank lines are ONE paragraph, as in Markdown. Emitting a
  // <p> per source line turned every hard-wrapped sentence into a separate
  // block with a gap through the middle of it.
  const closePara = () => {
    if (!para.length) return;
    out.push(`<p class="gw-md-p">${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeTable = () => {
    if (!table) return;
    out.push("<table class=\"gw-md-table\"><thead><tr>"
      + table.head.map((c) => `<th>${inline(c)}</th>`).join("")
      + "</tr></thead><tbody>"
      + table.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")
      + "</tbody></table>");
    table = null;
  };
  const inline = (raw) => esc(raw)
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`);

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^\s*```/.test(line)) {
      closePara(); closeList(); closeTable();
      out.push(inCode ? "</code></pre>" : "<pre class=\"gw-md-code\"><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(`${esc(raw)}\n`); continue; }
    if (!line.trim()) { closePara(); closeList(); closeTable(); continue; }

    const cells = line.trim().match(/^\|(.+)\|$/);
    if (cells) {
      const parts = cells[1].split("|").map((c) => c.trim());
      if (/^[\s|:-]+$/.test(line)) continue;
      closePara(); closeList();
      if (!table) table = { head: parts, rows: [] };
      else table.rows.push(parts);
      continue;
    }
    closeTable();

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closePara(); closeList();
      const level = Math.min(6, Math.max(2, h[1].length + 1));
      out.push(`<h${level} class="gw-md-h">${inline(h[2])}</h${level}>`);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      closePara();
      if (list !== "ul") { closeList(); out.push("<ul class=\"gw-md-list\">"); list = "ul"; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      closePara();
      if (list !== "ol") { closeList(); out.push("<ol class=\"gw-md-list\">"); list = "ol"; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  if (inCode) out.push("</code></pre>");
  closePara(); closeList(); closeTable();
  return out.join("");
}

export function renderReportResult(result) {
  if (!result || typeof result !== "object") return "";
  const rows = Object.entries(result).map(([k, v]) => {
    const value = Array.isArray(v) ? v.join(", ") : String(v);
    return `<dt>${esc(k.replace(/_/g, " "))}</dt><dd>${esc(value)}</dd>`;
  });
  if (!rows.length) return "";
  return `<dl class="gw-report-result" data-gw-report-result>${rows.join("")}</dl>`;
}

export function renderReportChoices(choices) {
  const list = Array.isArray(choices) ? choices.filter((c) => c?.label) : [];
  if (!list.length) return "";
  return `<ul class="gw-report-choices" data-gw-report-choices>${
    list.map((c) => `<li><span class="gw-report-choice-label">${esc(c.label)}</span>${
      c.detail ? `<span class="gw-report-choice-detail">${esc(c.detail)}</span>` : ""
    }</li>`).join("")
  }</ul>`;
}

/**
 * The assistant bubble body. A stored report renders as the message; with no
 * report yet the operator gets a restrained working state, never TUI text.
 */
export function renderAssistantMessage(source, { pending = false } = {}) {
  if (["report", "status", "transcript"].includes(source?.kind) && source.report) {
    const r = source.report;
    const meta = REPORT_TONE[r.type] || REPORT_TONE.progress;
    const statusOnly = r.status_only === true;
    const transcriptOnly = r.transcript_only === true;
    return `<div class="gw-report${statusOnly ? " is-status-only" : ""}" data-gw-report data-report-type="${esc(r.type)}" data-report-source="${esc(source.kind)}" data-report-id="${esc(r.report_id || "")}" data-report-revision="${esc(String(r.revision ?? ""))}">
      <div class="gw-report-h">
        <span class="gw-report-kind is-${esc(meta.tone)}">${esc(meta.label)}</span>
        ${statusOnly ? `<span class="gw-report-phase">status summary</span>` : ""}
        ${transcriptOnly ? `<span class="gw-report-phase">session transcript</span>` : ""}
        ${r.phase ? `<span class="gw-report-phase">${esc(r.phase)}</span>` : ""}
      </div>
      ${r.reason ? `<p class="gw-report-reason">${esc(r.reason)}</p>` : ""}
      <div class="gw-report-body" data-gw-report-body>${renderReportMarkdown(r.message)}</div>
      ${renderReportChoices(r.choices)}
      ${renderReportResult(r.result)}
      ${statusOnly ? `<p class="gw-report-note" data-gw-report-note>This lane reports with <code>vac run-status</code>, so this is its status summary rather than a full message. Full terminal output is under Details.</p>` : ""}
      ${transcriptOnly ? `<p class="gw-report-note" data-gw-report-note>The agent's own last message, read from the session transcript. This lane has not adopted <code>vac run-report</code>${r.truncated ? ", and the transcript capped this response" : ""}.</p>` : ""}
    </div>`;
  }
  if (source?.kind === "working" || pending) {
    return `<div class="gw-report is-working" data-gw-report data-report-type="working">
      <div class="gw-report-h"><span class="gw-report-kind is-run">Working</span></div>
      <p class="gw-report-waiting" data-gw-report-waiting>Working… the agent has not sent an update yet.</p>
    </div>`;
  }
  // Nothing structured at all. Even here the operator gets a route to the facts
  // rather than a dead end.
  return `<div class="gw-report is-empty" data-gw-report data-report-type="none">
    <p class="gw-report-waiting">This run has not reported a summary. Raw terminal output is under Details.</p>
  </div>`;
}

/**
 * Raw pane text, in Details, labelled for what it is.
 *
 * It stays because it is genuinely useful — transport receipt, readiness,
 * liveness, debugging. It is fenced off from the conversation so it can never
 * again be mistaken for the assistant's answer.
 */
export function renderTerminalDiagnostics(text, { pending = false, output = null } = {}) {
  const body = String(text || "");
  const bounded = output?.truncated === true
    || output?.viewport_only === true
    || Number(output?.history_size) > Number(output?.returned_lines || output?.line_count || 0);
  return `<details class="gw-terminal" data-gw-terminal>
    <summary class="gw-terminal-sum">Raw terminal output <span class="gw-terminal-tag">diagnostic</span></summary>
    <div class="gw-terminal-body">
      <p class="gw-terminal-note">Not the assistant's response. This is a bounded capture of the agent's terminal, kept for transport receipt, readiness and debugging.${bounded ? " It is truncated by the pane." : ""}</p>
      ${renderOutput(body, { pending })}
    </div>
  </details>`;
}

export function renderOutput(text, { pending = false } = {}) {
  const raw = text == null ? "" : String(text);
  const pendingAttr = pending ? " data-gw-output-pending" : "";
  const body = raw || (pending ? "Refreshing output…" : "");
  return `<pre class="gw-output" data-gw-output tabindex="0"${pendingAttr}>${esc(body)}</pre>`;
}

/**
 * The output panel is named for what it SHOWS, not for who produced it: the
 * same panel serves Claude and Cursor lanes. It reads "Recent output" while
 * work is in flight and "Completed output" once the run has finished.
 */
export function outputPanelHeading(lane) {
  const state = lane?.execution_run?.state || lane?.previous_run?.state || null;
  if (!lane?.execution_run && lane?.previous_run?.state === "COMPLETE") return "Completed output";
  if (state === "COMPLETE") return "Completed output";
  return "Recent output";
}

/** Honest truncation / review chrome. Does not parse TUI glyphs. */
export function outputReviewHint(output, { lane = null, lastInstruction = null } = {}) {
  const panelHeading = outputPanelHeading(lane);
  if (!output || output.ok === false) return null;
  const mode = output.mode || "recent";
  const cursorLane = laneProviderKind(lane) === "cursor";
  if (mode === "latest_response") {
    if (!output.available) {
      return {
        kind: "latest_unavailable",
        heading: "Latest response",
        text: "The latest assistant response is not available from the session transcript. Switch back to recent output.",
        showRecent: true,
        showLatest: false,
        showExtended: true,
      };
    }
    return {
      kind: "latest",
      heading: "Latest response",
      text: output.truncated
        ? "Latest assistant response (length-capped)."
        : "Latest assistant response from the session transcript. This is the assistant message, not full terminal/tool output.",
      showRecent: true,
      showLatest: false,
      showExtended: true,
    };
  }
  if (mode === "extended") {
    const extra = output.truncated
      ? `Showing last ${output.returned_lines || output.line_count || 0} lines of retained history.`
      : "Retained terminal history.";
    return {
      kind: output.truncated ? "extended_truncated" : "extended",
      heading: panelHeading,
      text: extra,
      showRecent: true,
      showLatest: true,
      showExtended: false,
    };
  }
  const viewportOnly = output.viewport_only === true
    || (output.alternate_screen === true && Number(output.history_size) === 0);
  const historyMore = Number(output.history_size) > Number(output.returned_lines || output.line_count || 0);
  const truncated = Boolean(output.truncated);
  const lastText = String(lastInstruction?.instruction || "").trim();
  const lastMissing = Boolean(
    lastInstruction?.status === "delivered"
    && lastText
    && output.text
    && !String(output.text).includes(lastText.slice(0, 32)),
  );
  let text = panelHeading;
  if (lastMissing) {
    text = "Showing the visible pane. Your last send is above this snapshot — the agent TUI often does not scroll to the newest turn.";
  } else if (viewportOnly) {
    text = "Showing the visible pane. The agent’s TUI does not keep tmux scrollback. Earlier output is not currently shown.";
  } else if (truncated || historyMore) {
    text = "Showing recent output. Earlier output is not currently shown.";
  }
  return {
    kind: lastMissing ? "last_send_not_in_pane" : (viewportOnly ? "viewport_only" : (truncated || historyMore ? "truncated" : "recent")),
    heading: panelHeading,
    text,
    showRecent: false,
    showLatest: !cursorLane,
    showExtended: !viewportOnly && (truncated || historyMore),
  };
}

export function renderOutputChrome(output, { lane = null, lastInstruction = null } = {}) {
  const hint = outputReviewHint(output, { lane, lastInstruction });
  if (!hint) return "";
  const btns = [];
  if (hint.showLatest) {
    btns.push(`<button type="button" class="btn sm gw-output-latest" data-gw-output-latest>Latest response</button>`);
  }
  if (hint.showExtended) {
    btns.push(`<button type="button" class="btn sm gw-output-more" data-gw-output-more>Load more</button>`);
  }
  if (hint.showRecent) {
    btns.push(`<button type="button" class="btn sm gw-output-recent" data-gw-output-recent>Recent output</button>`);
  }
  return `<div class="gw-output-chrome" data-gw-output-chrome data-kind="${esc(hint.kind)}">
    <p class="gw-output-hint">${esc(hint.text)}</p>
    ${btns.length ? `<div class="gw-output-actions">${btns.join("")}</div>` : ""}
  </div>`;
}

/** Mobile lines the clamped user message shows before "View more". */
export const USER_MESSAGE_CLAMP_LINES = 6;
/** Characters that fit one clamped mobile line at the message font size. */
const MOBILE_CHARS_PER_LINE = 44;

/**
 * Does this instruction need a View more control?
 *
 * An unclamped instruction is `flex:0 0 auto` in the thread, so a long one took
 * the whole scroller and squeezed the assistant reply into two rows. Estimating
 * from wrapped lines keeps the decision pure and testable; CSS line-clamp does
 * the actual clamping so the two can never disagree about WHAT is shown.
 */
export function userMessageNeedsClamp(text, { lines = USER_MESSAGE_CLAMP_LINES, charsPerLine = MOBILE_CHARS_PER_LINE } = {}) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  let wrapped = 0;
  for (const line of raw.split("\n")) {
    wrapped += Math.max(1, Math.ceil(line.length / charsPerLine));
    if (wrapped > lines) return true;
  }
  return false;
}

/** The prompt line says images were part of it, without dumping filenames. */
export function attachmentMetaSuffix(meta, attachments = []) {
  const n = (Array.isArray(attachments) ? attachments : []).length;
  if (!n) return meta;
  return `${meta} \u00b7 ${n} image${n === 1 ? "" : "s"}`;
}

export function renderLastInstruction(rec, nowMs = Date.now(), { expanded = false, attachments = [] } = {}) {
  if (!rec?.instruction || (rec.status !== "delivered" && rec.status !== "queued")) return "";
  const clampable = userMessageNeedsClamp(rec.instruction);
  const open = !clampable || expanded;
  const toggle = clampable
    ? `<button type="button" class="btn sm gw-msg-more" data-gw-msg-more aria-expanded="${open ? "true" : "false"}">${open ? "View less" : "View more"}</button>`
    : "";
  return `<article class="gw-msg gw-msg-user${clampable && !open ? " is-clamped" : ""}" data-gw-last${clampable ? ' data-gw-clampable="1"' : ""}>
    <div class="gw-msg-label">You</div>
    <div class="gw-msg-body gw-last-text" data-gw-msg-text>${esc(rec.instruction)}</div>
    ${renderMessageAttachments(attachments)}
    ${toggle}
    <div class="gw-msg-meta">${esc(attachmentMetaSuffix(lastInstructionMeta(rec, nowMs) || (rec.status === "queued" ? "Queued" : "Sent"), attachments))}</div>
  </article>`;
}

export function renderRecentSystemActivity(items) {
  const list = Array.isArray(items) ? items.filter((i) => i?.summary) : [];
  if (!list.length) return "";
  return `<aside class="gw-sys" data-gw-sys>
    <div class="gw-sys-h">Recent system activity</div>
    ${list.slice(0, 3).map((i) => `<div class="gw-sys-row">${esc(i.summary)}</div>`).join("")}
  </aside>`;
}

export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/html,.pdf,.html,.htm";

/** Images get a thumbnail; documents get a labelled chip, never a broken img. */
export function isImageAttachmentType(mime) {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(String(mime || ""));
}

export function attachmentKindLabel(mime) {
  if (String(mime) === "application/pdf") return "PDF";
  if (String(mime) === "text/html") return "HTML";
  return "Image";
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Draft attachment previews, above the input inside the composer box.
 *
 * They live INSIDE the composer rather than above it so the pinned composer
 * grows as one unit — previews stacked outside it pushed the input and Send
 * button below the safe area on a phone, which is the one thing this row must
 * never do.
 */
export function renderAttachmentDrafts(attachments = [], { uploading = 0, error = null } = {}) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length && !uploading && !error) return "";
  const items = list.map((a) => {
    const isImage = isImageAttachmentType(a.mime_type);
    const name = summaryText(a.filename) || (isImage ? "image" : "file");
    const meta = [
      formatBytes(a.byte_size),
      isImage && a.width && a.height ? `${a.width}\u00d7${a.height}` : (isImage ? "" : attachmentKindLabel(a.mime_type)),
    ].filter(Boolean).join(" \u00b7 ");
    return `<li class="gw-att" data-gw-att="${esc(a.attachment_id)}">
      ${isImage
        ? `<img class="gw-att-thumb" src="${esc(a.url)}" alt="" loading="lazy">`
        : `<span class="gw-att-thumb gw-att-doc" aria-hidden="true">${esc(attachmentKindLabel(a.mime_type))}</span>`}
      <span class="gw-att-meta"><span class="gw-att-name">${esc(name)}</span><span class="gw-att-size">${esc(meta)}</span></span>
      <button type="button" class="gw-att-x" data-gw-att-remove="${esc(a.attachment_id)}"
        aria-label="Remove ${esc(name)}">\u00d7</button>
    </li>`;
  }).join("");
  const pending = uploading
    ? `<li class="gw-att is-uploading" aria-live="polite"><span class="gw-att-spin" aria-hidden="true"></span><span class="gw-att-meta"><span class="gw-att-name">Uploading ${uploading} image${uploading === 1 ? "" : "s"}\u2026</span></span></li>`
    : "";
  const err = error ? `<div class="gw-att-err" role="alert">${esc(error)}</div>` : "";
  return `<div class="gw-atts" data-gw-atts>
    <ul class="gw-att-list" aria-label="Attached images">${items}${pending}</ul>
    ${err}
  </div>`;
}

/**
 * Attachment thumbnails on a sent operator message.
 *
 * Bounded thumbnails, never the full-resolution file: a phone should not pull
 * six multi-megabyte screenshots to render a conversation it already read.
 */
export function renderMessageAttachments(attachments = []) {
  const list = (Array.isArray(attachments) ? attachments : []).filter(Boolean);
  if (!list.length) return "";
  const items = list.map((a, i) => {
    const name = summaryText(a.filename) || `Image ${i + 1}`;
    if (a.state === "FAILED" || a.error) {
      return `<li class="gw-msg-att is-failed"><span class="gw-msg-att-bad">${esc(name)} \u2014 not delivered</span></li>`;
    }
    if (!isImageAttachmentType(a.mime_type)) {
      // A PDF or an HTML file opens in the browser; there is nothing to
      // thumbnail, and a lightbox around a document would show an empty frame.
      return `<li class="gw-msg-att is-doc">
        <a class="gw-msg-att-doc" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">
          <span class="gw-msg-att-kind">${esc(attachmentKindLabel(a.mime_type))}</span>
          <span class="gw-msg-att-name">${esc(name)}</span>
        </a>
      </li>`;
    }
    return `<li class="gw-msg-att">
      <button type="button" class="gw-msg-att-open" data-gw-att-open="${esc(a.attachment_id)}"
        aria-label="Open ${esc(name)}">
        <img src="${esc(a.url)}" alt="${esc(name)}" loading="lazy">
      </button>
    </li>`;
  }).join("");
  return `<ul class="gw-msg-atts" data-gw-msg-atts>${items}</ul>`;
}

/** A bounded lightbox. Aspect ratio preserved; Escape and the backdrop close it. */
export function renderAttachmentLightbox(attachment) {
  if (!attachment) return "";
  const name = summaryText(attachment.filename) || "Image";
  return `<div class="gw-lightbox" data-gw-lightbox role="dialog" aria-modal="true" aria-label="${esc(name)}">
    <button type="button" class="gw-lightbox-x" data-gw-lightbox-close aria-label="Close image">\u00d7</button>
    <img src="${esc(attachment.url)}" alt="${esc(name)}">
    <div class="gw-lightbox-cap">${esc(name)}</div>
  </div>`;
}

export function renderComposer({
  disabled,
  notice,
  draft,
  max = LANE_INSTRUCTION_MAX,
  idleStart = false,
  queueUntilSession = false,
  provider = null,
  cursorSendAvailable = false,
  attachments = [],
  attachmentsUploading = 0,
  attachmentError = null,
} = {}) {
  const n = notice?.text
    ? `<div class="gw-notice ${esc(notice.kind || "")}" data-gw-notice>${esc(notice.text)}</div>`
    : "";
  const placeholder = queueUntilSession
    ? "Write an instruction — it will queue until a session starts…"
    : idleStart ? "Start work — write an instruction…" : "Write an instruction…";
  const sendLabel = idleStart ? "Start" : "Send";
  const current = cursorSendAvailable && provider === "cursor" ? "cursor" : "claude";
  const cursorDisabled = cursorSendAvailable ? "" : " disabled";
  const cursorTitle = cursorSendAvailable
    ? "Send with Cursor"
    : "Cursor is read-only here: no executable transport is attached";
  return `<form class="gw-composer" data-gw-composer>
    <label class="gw-composer-h" for="gw-instruction">Instruction</label>
    <div class="gw-composer-box">
      <textarea id="gw-instruction" name="instruction" rows="1" maxlength="${max}"
        placeholder="${esc(placeholder)}" ${disabled ? "disabled" : ""}>${esc(draft || "")}</textarea>
      ${renderAttachmentDrafts(attachments, { uploading: attachmentsUploading, error: attachmentError })}
      <div class="gw-composer-row">
        <label class="gw-attach" title="Attach images">
          <input type="file" accept="${ATTACHMENT_ACCEPT}" multiple data-gw-attach-input
            aria-label="Attach images"${disabled ? " disabled" : ""}>
          <span aria-hidden="true">\ud83d\udcce</span>
        </label>
        <div class="gw-provider" role="radiogroup" aria-label="Agent">
          <button type="button" class="gw-provider-opt" data-gw-provider-opt="claude" aria-pressed="${current === "claude" ? "true" : "false"}">Claude</button>
          <button type="button" class="gw-provider-opt" data-gw-provider-opt="cursor" aria-pressed="${current === "cursor" ? "true" : "false"}"${cursorDisabled} title="${esc(cursorTitle)}">Cursor</button>
        </div>
        <input type="hidden" id="gw-composer-provider" name="provider" value="${esc(current)}" data-gw-provider>
        <span class="gw-count" data-gw-count></span>
        <span class="gw-enter-hint">Enter to send · Shift+Enter for a new line</span>
        <button class="btn primary gw-send" type="submit" data-gw-send aria-label="${esc(sendLabel)}" ${disabled || attachmentsUploading ? "disabled" : ""}>${esc(sendLabel)}</button>
      </div>
    </div>
    ${n}
  </form>`;
}

export function renderAgentTelemetry(telemetry, nowMs = Date.now(), extras = {}) {
  const sessionState = extras.lane?.agent_session?.state;
  const rotating = Boolean(extras.rotating) || ["HANDOFF", "RESTARTING", "VERIFYING"].includes(sessionState);
  const pending = sessionState === "ROTATION_PENDING"
    || extras.lane?.session_rotation?.need === "pending"
    || extras.lane?.session_rotation?.need === "safe_automatic";
  const hint = extras.rotationHint || extras.lane?.session_rotation?.hint || null;
  const economics = extras.lane?.agent_session?.lane_economics || extras.economics || null;
  const showAgent = telemetry?.available || rotating || pending || hint || extras.lane?.agent_session || extras.lane?.runtime === "offline" || extras.lane?.durable;
  if (!showAgent && extras.lane?.runtime !== "offline") return "";
  if (extras.lane?.runtime === "offline" && !rotating) {
    return `<div class="gw-status-block" data-gw-agent>
    <div class="gw-status-h">Agent</div>
    <dl class="gw-kv">
      <dt>Provider</dt><dd>${esc(laneProviderLabel(extras.lane) || "Claude Code")}</dd>
      <dt>Session</dt><dd>None</dd>
      <dt>Runtime</dt><dd>Offline</dd>
    </dl>
  </div>`;
  }
  const ctx = contextDetailLine(telemetry) || (rotating ? "Refreshing…" : "—");
  const sess = agentSessionLine(telemetry, nowMs) || extras.lane?.agent_session?.state || "—";
  const usage = telemetry?.usage || {};
  const token = (n) => formatTokenCount(n) || "—";
  const recommended = extras.lane?.session_rotation?.need === "recommended";
  const who = laneProviderLabel(extras.lane) || "Claude Code";
  const cursorLane = laneProviderKind(extras.lane) === "cursor";
  const refresh = extras.lane?.lane_id && !rotating && !cursorLane
    ? `<button type="button" class="btn gw-session-refresh" data-gw-session-refresh data-lane-id="${esc(extras.lane.lane_id)}">Refresh Claude Context</button>`
    : "";
  const laneBlock = economics
    ? `<div class="gw-status-block" data-gw-lane-econ>
    <div class="gw-status-h">Lane</div>
    <dl class="gw-kv">
      <dt>Sessions</dt><dd>${esc(String(economics.session_count ?? "—"))}</dd>
      <dt>Lifetime input</dt><dd>${esc(token(economics.lifetime_usage?.input_tokens))}</dd>
      <dt>Lifetime output</dt><dd>${esc(token(economics.lifetime_usage?.output_tokens))}</dd>
      <dt>Lifetime cost</dt><dd>${esc(economics.lifetime_cost?.note || (Number.isFinite(economics.lifetime_cost?.reported_usd) ? `$${economics.lifetime_cost.reported_usd.toFixed(2)}` : "Not reported"))}</dd>
    </dl>
  </div>`
    : "";
  return `<div class="gw-status-block" data-gw-agent>
    <div class="gw-status-h">Agent</div>
    <dl class="gw-kv">
      <dt>Provider</dt><dd>${esc(who)}</dd>
      <dt>Session</dt><dd>${esc(rotating ? "Refreshing Claude context…" : sess)}</dd>
      <dt>Model</dt><dd>${esc(telemetry?.agent?.model || extras.lane?.agent_session?.model || "—")}</dd>
      <dt>Context</dt><dd>${esc(ctx)}</dd>
    </dl>
    ${(pending || recommended) && hint ? `<p class="gw-session-hint">${esc(hint)}</p>` : ""}
    ${refresh}
  </div>
  <div class="gw-status-block" data-gw-usage>
    <div class="gw-status-h">Usage</div>
    <dl class="gw-kv">
      <dt>Input</dt><dd>${esc(token(usage.input_tokens))}</dd>
      <dt>Output</dt><dd>${esc(token(usage.output_tokens))}</dd>
      <dt>Cache read</dt><dd>${esc(token(usage.cache_read_tokens))}</dd>
      <dt>Cache write</dt><dd>${esc(token(usage.cache_write_tokens))}</dd>
      <dt>Session cost</dt><dd>${esc(sessionCostLabel(telemetry) || "Not reported")}</dd>
    </dl>
  </div>
  ${laneBlock}`;
}

export function renderMachineExclusive(snapshot, lanes) {
  const mex = snapshot?.machine_exclusive;
  if (!mex?.phase) return "";
  const name = (id) => {
    const hit = (Array.isArray(lanes) ? lanes : []).find((l) => l.lane_id === id);
    return hit?.label || id || "";
  };
  let title = "Preparing exclusive timing";
  let detail = name(mex.owner_lane_id) || "Runtime Performance";
  if (mex.phase === "EXCLUSIVE_ACTIVE") {
    title = "Exclusive timing active";
    detail = name(mex.owner_lane_id) || detail;
  } else if (mex.blockers?.some((b) => b.type === "unmanaged_heavy")) {
    title = "Machine-exclusive window blocked";
    detail = "Unmanaged conflicting process detected";
  } else if (mex.conflict_count > 0) {
    title = "Preparing exclusive timing";
    detail = `${mex.conflict_count} conflict${mex.conflict_count === 1 ? "" : "s"} draining`;
  }
  const emergency = `<button type="button" class="btn gw-ex-release" data-gw-exclusive-release>Release exclusive window</button>`;
  return `<div class="gw-status-block" data-gw-machine-ex>
    <div class="gw-status-h">Machine</div>
    <dl class="gw-kv"><dt>${esc(title)}</dt><dd>${esc(detail)}</dd></dl>
    ${emergency}
  </div>`;
}

export function renderSessionRefreshConfirmCopy() {
  return "Refresh Claude context? The Development Lane, Execution Run, worktree, and branch stay the same. Only the Claude session is replaced.";
}

export function sessionRefreshErrorText(out) {
  const err = out?.error;
  const blocker = Array.isArray(out?.blockers) ? out.blockers[0] : null;
  const detail = blocker?.detail ? String(blocker.detail) : "";
  if (err === "unsafe_checkpoint") {
    if (blocker?.code === "continuation_delivering") {
      return "Can't refresh Claude context now — a resource continuation is still delivering.";
    }
    if (blocker?.code === "unsafe_resource_phase" || blocker?.code === "exclusive_active") {
      return `Can't refresh Claude context now — ${detail || "this lane is in a protected checkpoint."}`;
    }
    if (detail) return `Can't refresh Claude context now — ${detail}`;
    return "Can't refresh Claude context now — this lane is in a protected checkpoint.";
  }
  if (err === "handoff_delivery_failed") return "Could not send the refresh instruction to Claude.";
  if (err === "confirm_required") return "Confirm refresh to continue.";
  if (err === "lane_not_found") return "This lane could not be found.";
  if (err === "claude_absent") return "Claude is not running, so context could not be refreshed.";
  if (err) return `Claude context refresh failed (${err}).`;
  return "Claude context refresh failed.";
}

export function renderDevelopmentResources(snapshot, lanes) {
  const show = ["browser_certification", "validate", "dev_servers", "runtime_timing_certification"];
  const items = Array.isArray(snapshot?.resources)
    ? snapshot.resources.filter((r) => show.includes(r.key))
    : [];
  const machine = renderMachineExclusive(snapshot, lanes);
  if (!items.length && !machine) return "";
  const name = (id) => {
    const hit = (Array.isArray(lanes) ? lanes : []).find((l) => l.lane_id === id);
    return hit?.label || id;
  };
  const line = (r) => {
    if (r.health === "not_configured" || r.health === "unwired") return "Not configured";
    if (r.health === "stale_owner") return "Blocked by stale owner";
    if (r.key === "runtime_timing_certification") {
      if (r.health === "held") return "Exclusive window";
      if (r.health === "draining") return r.exclusive?.detail || "Waiting for conflicts to settle";
      if (r.health === "verifying") return "Verifying quietness";
      if (r.health === "reserving") return "Preparing exclusive timing";
      if (r.queue?.length) return `${r.queue.length} waiting`;
      return "Available";
    }
    if (r.key === "dev_servers") return `${r.held_count} / ${r.capacity}`;
    const bits = [];
    const holderLane = (r.holders || []).find((h) => h.lane_id);
    if (holderLane) bits.push(name(holderLane.lane_id));
    else if (r.held_count > 0) bits.push("Held");
    else bits.push("Available");
    if (r.queue?.length) bits.push(`${r.queue.length} waiting`);
    return bits.join(" · ");
  };
  const rows = items.length
    ? `<dl class="gw-kv">${items.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(line(r))}</dd>`).join("")}</dl>`
    : "";
  return `${machine}<div class="gw-status-block" data-gw-resources>
    <div class="gw-status-h">Resources</div>
    ${rows}
  </div>`;
}

export function renderStatus(lane, resources, { open = false, summary, sessionLine, telemetry, developmentResources, lanes, executionCapacity } = {}) {
  const cap = executionCapacity || summarizeExecutionCapacity(lanes || (lane ? [lane] : []));
  const capHtml = renderExecutionCapacity(cap);
  if (!lane) {
    const compact = renderDevelopmentResources(developmentResources, lanes);
    return `<details class="gw-status" data-gw-status>
      <summary class="gw-status-sum-row"><span class="gw-status-h">Development Status</span></summary>
      ${capHtml}
      ${compact}
    </details>`;
  }
  const slot = lane.slot == null ? null : String(lane.slot);
  const machine = machineLine(resources);
  const sum = summary || statusSummaryLine(lane, telemetry);
  return `<details class="gw-status" data-gw-status ${open ? "open" : ""}>
    <summary class="gw-status-sum-row">
      <span class="gw-status-h">Development Status</span>
      <span class="gw-status-sum">${esc(sum)}</span>
    </summary>
    ${capHtml}
    <dl class="gw-kv">
      <dt>Session</dt><dd>${esc(sessionLine || presenceLine(lane))}</dd>
      <dt>Branch</dt><dd>${esc(lane.git?.branch || "—")}</dd>
      <dt>Worktree</dt><dd>${esc(lane.worktree?.name || "—")}</dd>
      <dt>Git</dt><dd>${esc(gitLine(lane.git, lane.source_control))}</dd>
      <dt>tmux</dt><dd>${esc(lane.tmux?.session || "—")}</dd>
      ${slot ? `<dt>Slot</dt><dd>${esc(slot)}</dd>` : ""}
      ${machine ? `<dt>Machine</dt><dd>${esc(machine)}</dd>` : ""}
    </dl>
    ${renderSourceControl(lane)}
    ${renderAgentTelemetry(telemetry, Date.now(), { lane })}
    ${renderDevelopmentResources(developmentResources, lanes || [lane])}
  </details>`;
}

/**
 * Starting a lane is starting a conversation.
 *
 * It used to be a form: Name, then a Provider dropdown, then "Initial work" —
 * three fields to fill in before anything could happen, with the name demanded
 * before the operator had said what the lane was even for. And on a phone the
 * whole form overflowed a container with `overflow:hidden`, so the Start button
 * and the bottom of the message box were simply cut off.
 *
 * Now it is a composer: one message, a provider preference beside Send, and the
 * lane names itself from what you wrote. Rename Lane is in Details when the
 * first line stops fitting.
 */
/**
 * Add Repository — a real sheet, not a chain of browser prompts.
 *
 * WHY THE SHAPE MATTERS. Registering a repository is a decision with
 * consequences the operator cannot see from a path alone: whether that path is
 * a repository or a worktree OF one, what its default branch actually is,
 * whether it has a remote, and where its worktrees will be created. A prompt
 * asks for the path and then acts. This validates first, SHOWS what it found,
 * and registers only on an explicit confirmation.
 *
 * VALIDATION NEVER PERSISTS. The inspect endpoint is read-only; nothing durable
 * exists until Confirm.
 */
export function renderRepositorySheet(state = {}) {
  const method = state.method === "clone" ? "clone" : "connect";
  const v = state.validation || null;
  const busy = Boolean(state.validating || state.submitting);
  const err = state.error
    ? `<div class="gw-notice err" role="alert">${esc(repositoryErrorText(state.error, state.errorDetail || {}))}</div>`
    : "";

  const methodRow = `<div class="gw-seg" role="radiogroup" aria-label="How to add a repository">
    <button type="button" class="gw-seg-opt" data-gw-repo-method="connect"
      aria-pressed="${method === "connect" ? "true" : "false"}">Connect local</button>
    <button type="button" class="gw-seg-opt" data-gw-repo-method="clone" disabled
      title="Clone is not available yet">Clone</button>
  </div>`;

  if (method === "clone") {
    return sheet("Add repository", `${methodRow}
      <p class="gw-sheet-note">Clone is not available yet. Clone the repository yourself, then use
      <strong>Connect local</strong> to register it.</p>`, { cancelOnly: true });
  }

  // The result panel is the whole point: it is what the operator confirms.
  const result = v ? `<dl class="gw-kv gw-repo-check">
      <dt>Repository root</dt><dd>${esc(v.root)}</dd>
      <dt>Git directory</dt><dd>${esc(v.git_common_dir)}</dd>
      <dt>Default branch</dt><dd>${esc(v.default_branch || "unknown")}</dd>
      <dt>Remote</dt><dd>${v.has_remote ? esc(v.remote_normalized || "configured") : "Local only"}</dd>
      <dt>Worktrees will go in</dt><dd>${esc(v.worktree_parent || defaultWorktreeParent(v.root))}</dd>
      <dt>Profile</dt><dd>${v.profile === "alloy" ? "Alloy managed sprint" : "Generic Git"}</dd>
    </dl>` : "";

  const warning = v && v.is_worktree
    ? `<div class="gw-notice err" role="alert">That path is a worktree of
        <strong>${esc(v.parent_root)}</strong>. Register that repository instead — a worktree shares
        its parent's Git history, so it is not a separate repository.</div>`
    : v && v.already_registered
      ? `<div class="gw-notice err" role="alert">Already registered as
          <strong>${esc(v.already_registered.name)}</strong>.</div>`
      : "";

  const canConfirm = Boolean(v && !v.is_worktree && !v.already_registered);
  const nameField = canConfirm ? `<label class="gw-field">
      <span class="gw-field-label" id="gw-repo-name-l">Display name</span>
      <input id="gw-repo-name" type="text" value="${esc(state.name ?? suggestRepositoryName(v.root))}"
        aria-labelledby="gw-repo-name-l" maxlength="80" data-gw-repo-name enterkeyhint="done">
    </label>` : "";

  const body = `${methodRow}
    <label class="gw-field">
      <span class="gw-field-label" id="gw-repo-path-l">Repository path</span>
      <input id="gw-repo-path" type="text" inputmode="url" autocapitalize="off" autocorrect="off"
        spellcheck="false" placeholder="/Users/you/Code/my-project"
        value="${esc(state.path || "")}" aria-labelledby="gw-repo-path-l"
        data-gw-repo-path enterkeyhint="go">
      <span class="gw-field-hint">Must be inside a folder Vacilando may use.</span>
    </label>
    ${err}
    ${warning}
    ${result}
    ${nameField}`;

  const actions = canConfirm
    ? `<button type="button" class="btn primary" data-gw-repo-confirm ${busy ? "disabled" : ""}>
        ${busy ? "Registering\u2026" : "Register repository"}</button>`
    : `<button type="button" class="btn primary" data-gw-repo-validate ${busy || !state.path ? "disabled" : ""}>
        ${state.validating ? "Checking\u2026" : "Validate"}</button>`;

  return sheet("Add repository", body, { actions });
}

function sheet(title, body, { actions = "", cancelOnly = false } = {}) {
  return `<section class="gw-sheet" data-gw-sheet role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="gw-sheet-head">
      <button type="button" class="gw-sheet-x" data-gw-sheet-cancel aria-label="Cancel">\u2190</button>
      <h2 class="gw-sheet-title">${esc(title)}</h2>
    </header>
    <div class="gw-sheet-body">${body}</div>
    <footer class="gw-sheet-foot">
      <button type="button" class="btn" data-gw-sheet-cancel>Cancel</button>
      ${cancelOnly ? "" : actions}
    </footer>
  </section>`;
}

export function suggestRepositoryName(root) {
  return String(root || "").split("/").filter(Boolean).pop() || "Repository";
}

export function defaultWorktreeParent(root) {
  const parts = String(root || "").split("/").filter(Boolean);
  const name = parts.pop() || "repo";
  return `/${parts.join("/")}/${name}-worktrees`;
}

export const LANE_STEPS = Object.freeze([
  { id: "repository", label: "Repository" },
  { id: "folder", label: "Folder" },
  { id: "identity", label: "Lane" },
  { id: "workspace", label: "Workspace" },
  { id: "provider", label: "Agent" },
  { id: "review", label: "Review" },
]);

/**
 * Which step can the operator actually be on?
 *
 * Steps are gated by what has been chosen, not by a counter, so Back never
 * lands somewhere that no longer makes sense and Next cannot skip a decision
 * the next step depends on.
 */
export function laneStepReady(step, draft = {}) {
  switch (step) {
    case "repository": return true;
    case "folder": return Boolean(draft.repository_id);
    case "identity": return Boolean(draft.repository_id);
    case "workspace": return Boolean(draft.repository_id && String(draft.name || "").trim());
    case "provider": return Boolean(draft.workspace_mode);
    case "review":
      // Planning lanes need no provider; everything else does.
      return Boolean(draft.workspace_mode)
        && (draft.workspace_mode === "planning" || Boolean(draft.provider));
    default: return false;
  }
}

export function nextLaneStep(current, draft) {
  const i = LANE_STEPS.findIndex((s) => s.id === current);
  for (let k = i + 1; k < LANE_STEPS.length; k += 1) {
    if (laneStepReady(LANE_STEPS[k].id, draft)) return LANE_STEPS[k].id;
  }
  return current;
}

export function prevLaneStep(current) {
  const i = LANE_STEPS.findIndex((s) => s.id === current);
  return i > 0 ? LANE_STEPS[i - 1].id : current;
}

/** The branch a new worktree would get, previewed before anything is created. */
export function previewBranch(repository, laneName, suffix = null) {
  const slug = String(suffix ?? laneName ?? "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!slug) return null;
  const prefix = repository?.branch_policy?.prefix || "";
  return `${prefix}${slug}`;
}

export function previewWorktreePath(repository, laneName, suffix = null) {
  const slug = previewBranch({ branch_policy: { prefix: "" } }, laneName, suffix);
  if (!slug || !repository?.worktree_parent) return null;
  return `${repository.worktree_parent}/${slug}`;
}

function stepRail(current, draft) {
  return `<ol class="gw-steps" aria-label="Steps">${LANE_STEPS.map((st, i) => {
    const state = st.id === current ? "is-current"
      : (laneStepReady(st.id, draft) && LANE_STEPS.findIndex((x) => x.id === current) > i ? "is-done" : "");
    return `<li class="gw-step ${state}"><span class="gw-step-n">${i + 1}</span><span class="gw-step-l">${esc(st.label)}</span></li>`;
  }).join("")}</ol>`;
}

/**
 * Add Lane — a stepped flow that creates nothing until Review is confirmed.
 *
 * Every step keeps its value when the operator goes back, and no durable record
 * exists at any point before the final create. That is the difference between a
 * form and the prompt chain this replaces: a prompt chain has already acted by
 * the time you realise you picked the wrong repository.
 */
export function renderLaneWizard(state = {}) {
  const draft = state.draft || {};
  const repositories = (state.repositories || []).filter((r) => r.state !== "RETIRED");
  const step = laneStepReady(state.step, draft) ? state.step : "repository";
  const repo = repositories.find((r) => r.repository_id === draft.repository_id) || null;
  const err = state.error
    ? `<div class="gw-notice err" role="alert">${esc(state.errorText || createErrorText(state.error))}</div>`
    : "";

  let body = "";
  if (step === "repository") {
    body = `<div class="gw-choices" role="radiogroup" aria-label="Repository">
      ${repositories.map((r) => `<button type="button" class="gw-choice${draft.repository_id === r.repository_id ? " is-on" : ""}"
        data-gw-wiz-repo="${esc(r.repository_id)}" aria-pressed="${draft.repository_id === r.repository_id ? "true" : "false"}">
        <span class="gw-choice-t">${esc(r.name)}</span>
        <span class="gw-choice-s">${esc([r.profile === "alloy" ? "Alloy managed sprint" : "Generic Git", r.default_branch, r.has_remote === false ? "local only" : null].filter(Boolean).join(" \u00b7 "))}</span>
      </button>`).join("")}
      <button type="button" class="gw-choice is-add" data-gw-wiz-add-repo>
        <span class="gw-choice-t">+ Add repository</span>
        <span class="gw-choice-s">Register another Git repository</span>
      </button>
    </div>`;
  } else if (step === "folder") {
    const folders = (state.folders || []).filter((f) => (f.repository_id || null) === (draft.repository_id || null));
    body = `<div class="gw-choices" role="radiogroup" aria-label="Folder">
      <button type="button" class="gw-choice${!draft.folder_id ? " is-on" : ""}" data-gw-wiz-folder=""
        aria-pressed="${!draft.folder_id ? "true" : "false"}">
        <span class="gw-choice-t">No folder</span>
        <span class="gw-choice-s">The lane sits directly under ${esc(repo?.name || "the repository")}</span>
      </button>
      ${folders.map((f) => `<button type="button" class="gw-choice${draft.folder_id === f.folder_id ? " is-on" : ""}"
        data-gw-wiz-folder="${esc(f.folder_id)}" aria-pressed="${draft.folder_id === f.folder_id ? "true" : "false"}">
        <span class="gw-choice-t">${esc(f.name)}</span>
        <span class="gw-choice-s">${f.lane_count} lane${f.lane_count === 1 ? "" : "s"}</span>
      </button>`).join("")}
    </div>
    <label class="gw-field">
      <span class="gw-field-label" id="gw-wiz-nf-l">Or create a folder</span>
      <input id="gw-wiz-newfolder" type="text" maxlength="60" placeholder="Folder name"
        value="${esc(draft.new_folder || "")}" aria-labelledby="gw-wiz-nf-l" data-gw-wiz-newfolder>
      <span class="gw-field-hint">It belongs to ${esc(repo?.name || "this repository")} only.</span>
    </label>`;
  } else if (step === "identity") {
    body = `<label class="gw-field">
      <span class="gw-field-label" id="gw-wiz-name-l">Lane name</span>
      <input id="gw-wiz-name" type="text" maxlength="80" autofocus placeholder="What is this lane for?"
        value="${esc(draft.name || "")}" aria-labelledby="gw-wiz-name-l" data-gw-wiz-name enterkeyhint="next">
      ${state.nameError ? `<span class="gw-field-err" role="alert">${esc(state.nameError)}</span>`
        : `<span class="gw-field-hint">You can rename it any time in Details.</span>`}
    </label>`;
  } else if (step === "workspace") {
    const modes = [
      ["new_worktree", "Create new worktree", `A fresh branch from ${esc(repo?.default_branch || "the base branch")}`],
      ["connect_existing", "Connect existing worktree", "Bind a worktree you already have"],
      ["planning", "Planning only", "No worktree, no agent, no capacity used"],
    ];
    const chosen = draft.workspace_mode;
    let detail = "";
    if (chosen === "new_worktree") {
      const branch = previewBranch(repo, draft.name, draft.branch_suffix);
      const path = previewWorktreePath(repo, draft.name, draft.branch_suffix);
      detail = `<div class="gw-preview">
        <dl class="gw-kv">
          <dt>Base branch</dt><dd>${esc(repo?.default_branch || "unknown")}</dd>
          <dt>New branch</dt><dd>${esc(branch || "\u2014")}</dd>
          <dt>Worktree path</dt><dd>${esc(path || "\u2014")}</dd>
        </dl>
        <label class="gw-field">
          <span class="gw-field-label" id="gw-wiz-suffix-l">Branch name</span>
          <input id="gw-wiz-suffix" type="text" maxlength="60" value="${esc(draft.branch_suffix || "")}"
            placeholder="${esc(previewBranch({ branch_policy: { prefix: "" } }, draft.name) || "")}"
            aria-labelledby="gw-wiz-suffix-l" data-gw-wiz-suffix>
          <span class="gw-field-hint">${repo?.branch_policy?.prefix
            ? `This repository prefixes branches with ${esc(repo.branch_policy.prefix)}`
            : "This repository has no branch prefix."}</span>
        </label>
        ${state.workspaceCheck ? `<div class="gw-notice ${state.workspaceCheck.ok ? "ok" : "err"}">${esc(state.workspaceCheck.text)}</div>` : ""}
      </div>`;
    } else if (chosen === "connect_existing") {
      const c = state.connectCheck || null;
      detail = `<div class="gw-preview">
        <label class="gw-field">
          <span class="gw-field-label" id="gw-wiz-wt-l">Worktree path</span>
          <input id="gw-wiz-wt" type="text" inputmode="url" autocapitalize="off" autocorrect="off"
            spellcheck="false" value="${esc(draft.worktree_path || "")}"
            aria-labelledby="gw-wiz-wt-l" data-gw-wiz-worktree enterkeyhint="go">
        </label>
        <button type="button" class="btn sm" data-gw-wiz-validate-wt ${draft.worktree_path ? "" : "disabled"}>Validate</button>
        ${c ? (c.ok
          ? `<dl class="gw-kv"><dt>Branch</dt><dd>${esc(c.branch || "unknown")}</dd>
             <dt>Git directory</dt><dd>${esc(c.git_common_dir)}</dd>
             <dt>Belongs to</dt><dd>${esc(repo?.name || "")}</dd></dl>`
          : `<div class="gw-notice err" role="alert">${esc(c.text)}</div>`) : ""}
      </div>`;
    } else if (chosen === "planning") {
      detail = `<p class="gw-sheet-note">This lane will exist with no worktree and no agent. It uses none of
        the three provider seats. You can provision it later from Details.</p>`;
    }
    body = `<div class="gw-choices" role="radiogroup" aria-label="Workspace">
      ${modes.map(([id, t, sub]) => `<button type="button" class="gw-choice${chosen === id ? " is-on" : ""}"
        data-gw-wiz-mode="${id}" aria-pressed="${chosen === id ? "true" : "false"}">
        <span class="gw-choice-t">${t}</span><span class="gw-choice-s">${sub}</span></button>`).join("")}
    </div>${detail}`;
  } else if (step === "provider") {
    const p = draft.provider || (draft.workspace_mode === "planning" ? null : "claude");
    body = `<div class="gw-choices" role="radiogroup" aria-label="Agent">
      <button type="button" class="gw-choice${p === "claude" ? " is-on" : ""}" data-gw-wiz-provider="claude"
        aria-pressed="${p === "claude" ? "true" : "false"}">
        <span class="gw-choice-t">Claude</span><span class="gw-choice-s">Runs in the lane's worktree</span></button>
      <button type="button" class="gw-choice is-off" data-gw-wiz-provider="cursor" disabled aria-disabled="true">
        <span class="gw-choice-t">Cursor</span>
        <span class="gw-choice-s">Read-only here: its headless integration is not certified yet</span></button>
      ${draft.workspace_mode === "planning" ? `<button type="button" class="gw-choice${!p ? " is-on" : ""}"
        data-gw-wiz-provider="" aria-pressed="${!p ? "true" : "false"}">
        <span class="gw-choice-t">Decide later</span>
        <span class="gw-choice-s">A planning lane needs no agent yet</span></button>` : ""}
    </div>`;
  } else {
    const branch = draft.workspace_mode === "new_worktree" ? previewBranch(repo, draft.name, draft.branch_suffix) : null;
    // A planning lane has NO worktree. Reading draft.worktree_path
    // unconditionally showed a path left over from a Connect-existing attempt
    // the operator had already moved away from — the review would have told
    // them a planning lane came with a worktree.
    const path = draft.workspace_mode === "new_worktree"
      ? previewWorktreePath(repo, draft.name, draft.branch_suffix)
      : (draft.workspace_mode === "connect_existing" ? (draft.worktree_path || null) : null);
    const folderName = draft.new_folder
      || (state.folders || []).find((f) => f.folder_id === draft.folder_id)?.name
      || "No folder";
    body = `<dl class="gw-kv gw-review">
      <dt>Repository</dt><dd>${esc(repo?.name || "\u2014")}</dd>
      <dt>Folder</dt><dd>${esc(folderName)}</dd>
      <dt>Lane</dt><dd>${esc(draft.name || "\u2014")}</dd>
      <dt>Workspace</dt><dd>${esc({ new_worktree: "New worktree", connect_existing: "Existing worktree", planning: "Planning only" }[draft.workspace_mode] || "\u2014")}</dd>
      ${draft.workspace_mode !== "planning" ? `<dt>Base branch</dt><dd>${esc(repo?.default_branch || "\u2014")}</dd>` : ""}
      ${branch ? `<dt>New branch</dt><dd>${esc(branch)}</dd>` : ""}
      ${path ? `<dt>Worktree</dt><dd>${esc(path)}</dd>` : ""}
      <dt>Agent</dt><dd>${esc(draft.provider === "claude" ? "Claude" : "None yet")}</dd>
    </dl>
    <p class="gw-sheet-note">${draft.workspace_mode === "new_worktree"
      ? "Creates a branch and a worktree on this machine."
      : draft.workspace_mode === "connect_existing"
        ? "Binds an existing worktree. Nothing on disk is created."
        : "Creates a lane record only."}
      Nothing is pushed and nothing is merged.</p>`;
  }

  const isLast = step === "review";
  const canNext = isLast ? true : laneStepReady(nextLaneStep(step, draft), draft);
  const actions = `${step === "repository" ? "" : `<button type="button" class="btn" data-gw-wiz-back>Back</button>`}
    <button type="button" class="btn primary" ${isLast ? "data-gw-wiz-create" : "data-gw-wiz-next"}
      ${(!canNext || state.submitting) ? "disabled" : ""}>
      ${state.submitting ? "Creating\u2026" : (isLast ? "Create lane" : "Next")}</button>`;

  return `<section class="gw-sheet gw-wizard" data-gw-wizard role="dialog" aria-modal="true" aria-label="Add lane">
    <header class="gw-sheet-head">
      <button type="button" class="gw-sheet-x" data-gw-sheet-cancel aria-label="Cancel">\u2190</button>
      <h2 class="gw-sheet-title">Add lane</h2>
    </header>
    ${stepRail(step, draft)}
    <div class="gw-sheet-body">${err}${body}</div>
    <footer class="gw-sheet-foot">
      <button type="button" class="btn" data-gw-sheet-cancel>Cancel</button>
      ${actions}
    </footer>
  </section>`;
}

export function renderCreateLaneFlow(create = {}) {
  const err = create.error ? `<div class="gw-notice err">${esc(createErrorText(create.error))}</div>` : "";
  const provider = create.provider === "cursor" ? "cursor" : "claude";
  const draft = create.instruction || "";
  return `<div class="gw-start" data-gw-start>
    <div class="gw-start-intro">
      <p class="gw-lead">Say what this lane should work on. It starts from your first message, and takes its name from it — you can rename it any time in Details.</p>
    </div>
    <form class="gw-composer gw-start-composer" data-gw-create>
      <div class="gw-composer-box">
        <label class="gw-composer-h" for="gw-create-instruction">First message</label>
        <textarea id="gw-create-instruction" name="instruction" rows="4"
          maxlength="${LANE_INSTRUCTION_MAX}" autofocus
          placeholder="What should this lane work on?">${esc(draft)}</textarea>
        <div class="gw-composer-row">
          <div class="gw-provider" role="radiogroup" aria-label="Agent">
            <button type="button" class="gw-provider-opt" data-gw-create-provider="claude" aria-pressed="${provider === "claude" ? "true" : "false"}">Claude</button>
            <button type="button" class="gw-provider-opt" data-gw-create-provider="cursor" aria-pressed="${provider === "cursor" ? "true" : "false"}">Cursor</button>
          </div>
          <input type="hidden" id="gw-create-provider" name="provider" value="${esc(provider)}" />
          <button class="btn primary gw-send" type="submit" data-gw-create-submit ${create.submitting ? "disabled" : ""}>${create.submitting ? "Starting…" : "Start"}</button>
        </div>
      </div>
      ${err}
    </form>
  </div>`;
}

export function createErrorText(error) {
  switch (error) {
    case "name_or_instruction_required":
      return "Write a first message to start this lane.";
    case "instruction_too_large":
      return "That first message is too long.";
    case "name_too_large":
      return "That first line is too long to use as a name — shorten it or rename later.";
    case "already_connected":
      return "A lane for this work already exists.";
    case "path_refused":
      return "Execution substrate fields are not accepted.";
    default:
      return error ? String(error) : "Could not start the lane.";
  }
}

export function renderSourceControl(lane) {
  const scm = lane?.source_control;
  if (!scm && !lane?.git?.branch) return "";
  const posture = scm?.posture === "CURRENT" ? "Current"
    : scm?.posture === "CHECKPOINT_DUE" ? "Checkpoint due"
    : scm?.posture === "SYNC_RECOMMENDED" ? "Sync recommended"
    : scm?.posture === "SYNC_REQUIRED" ? "Sync required"
    : scm?.posture === "CONFLICT" ? "Conflict"
    : scm?.posture === "PROMOTION_READY" ? "Ready for promotion review"
    : (lane?.git?.state === "clean" ? "Current" : "—");
  const checkpoint = scm?.last_checkpoint_at ? ago(Date.parse(scm.last_checkpoint_at)) : null;
  const pending = scm?.scheduled_sync && (scm.posture === "SYNC_RECOMMENDED" || scm.posture === "SYNC_REQUIRED")
    ? `<p class="gw-lead">Sync scheduled at next safe checkpoint</p>`
    : "";
  return `<div class="gw-status-block" data-gw-scm>
    <div class="gw-status-h">Source control</div>
    <dl class="gw-kv">
      <dt>Branch</dt><dd>${esc(scm?.branch || lane?.git?.branch || "—")}</dd>
      <dt>Checkpoint</dt><dd>${esc(checkpoint ? `${checkpoint} ago` : "None yet")}</dd>
      <dt>Base</dt><dd>${esc(Number.isFinite(scm?.behind) ? `${scm.behind} behind staging` : "—")}</dd>
      <dt>Posture</dt><dd>${esc(posture)}</dd>
    </dl>
    ${pending}
  </div>`;
}

export function renderConnectFlow(connect = {}) {
  const step = connect.step || "chooser";
  const cand = connect.candidate;
  if (step === "chooser") {
    return `<h1>Add Lane</h1>
      <p class="gw-lead">Create a durable Development Lane or connect existing work. Execution starts when capacity is available.</p>
      <div class="gw-add-actions">
        <a class="btn primary" href="#/lanes/create" data-gw-create-new>Create New Lane</a>
        <button type="button" class="btn" data-gw-connect-existing>Connect Existing Work</button>
      </div>`;
  }
  if (step === "pick" || !cand) {
    return `<h1>Connect Existing Work</h1>
      <p class="gw-lead">Select a discovered environment. Paths are not typed — only server-discovered work is shown.</p>
      ${renderCandidateList(connect.candidates, connect.loading)}`;
  }
  if (cand.already_connected) {
    return `<h1>Already connected</h1>
      <p class="gw-lead">This work is already connected to ${esc(cand.connected_name || "a Development Lane")}.</p>
      <a class="btn primary" href="${esc(laneDetailHash(cand.connected_lane_id))}">Open ${esc(cand.connected_name || "Lane")}</a>`;
  }
  const git = cand.git || {};
  const gitLineText = `${git.state === "clean" ? "Clean" : git.state === "dirty" ? "Dirty" : (git.state || "Unknown")}${Number.isFinite(git.modified) ? ` · ${git.modified} modified` : ""}${Number.isFinite(git.untracked) ? ` · ${git.untracked} untracked` : ""}`;
  const claude = cand.claude_presence === "present" ? "Running" : (cand.tmux_session ? "Session found" : "No persistent Claude session found");
  const err = connect.error ? `<div class="gw-notice err">${esc(connect.error)}</div>` : "";
  return `<h1>Connect this work?</h1>
    <p class="gw-lead">Vacilando will not modify the worktree, branch, files, or Claude session.</p>
    <form class="gw-connect" data-gw-connect>
      <label class="gw-composer-h" for="gw-lane-name">Lane name</label>
      <input id="gw-lane-name" name="name" maxlength="80" value="${esc(connect.name || cand.suggested_name || "")}" />
      <dl class="gw-kv gw-connect-facts">
        <dt>Worktree</dt><dd>${esc(cand.worktree_name || "—")}</dd>
        <dt>Branch</dt><dd>${esc(cand.branch || git.branch || "—")}</dd>
        <dt>Git</dt><dd>${esc(gitLineText)}</dd>
        <dt>Claude</dt><dd>${esc(claude)}</dd>
        <dt>tmux</dt><dd>${esc(cand.tmux_session || "—")}</dd>
        ${cand.slot != null ? `<dt>Slot</dt><dd>${esc(String(cand.slot))}</dd>` : ""}
      </dl>
      <button class="btn primary" type="submit" data-gw-connect-submit ${connect.submitting ? "disabled" : ""}>Connect to Lane</button>
      ${err}
    </form>`;
}

export function renderCandidateList(candidates, loading) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    return `<div class="gw-empty">${loading ? "Discovering existing work…" : "No eligible existing work found."}</div>`;
  }
  return `<div class="gw-candidates" data-gw-candidates>${list.map((c) => {
    const git = c.git || {};
    const st = git.state === "clean" ? "Clean" : git.state === "dirty" ? "Dirty" : (git.state || "Unknown");
    const claude = c.claude_presence === "present" ? "Claude session found" : "No persistent Claude session found";
    const open = c.already_connected
      ? `<a class="btn sm" href="${esc(laneDetailHash(c.connected_lane_id))}">Open Lane</a>`
      : `<a class="btn sm primary" href="${esc(connectHash(c.candidate_id))}">Connect</a>`;
    const badge = c.already_connected ? `<span class="gw-lane-attn">Already connected to ${esc(c.connected_name || "a lane")}</span>` : "";
    return `<div class="gw-candidate" data-candidate-id="${esc(c.candidate_id)}">
      <div class="gw-lane-title">${esc(c.suggested_name || c.worktree_name)}${badge}</div>
      <div class="gw-lane-meta">${esc(c.worktree_name || "")}${c.branch ? ` · ${esc(c.branch)}` : ""}</div>
      <div class="gw-lane-meta">${esc(claude)}${c.tmux_session ? ` · tmux: ${esc(c.tmux_session)}` : ""}</div>
      <div class="gw-lane-ab">${esc(st)} · ↑${esc(String(git.ahead || 0))} · ↓${esc(String(git.behind || 0))}</div>
      ${open}
    </div>`;
  }).join("")}</div>`;
}

export function renderGatewayShell({
  lanes,
  selectedId,
  lane,
  outputText,
  outputPending,
  composer,
  resources,
  lastInstruction,
  statusOpen,
  attentionByLane,
  emptyDetail,
  loading,
  listReady,
  nowMs,
  output,
  telemetry,
  telemetryByLane,
  copyFeedback,
  notify,
  developmentResources,
  connect,
  executionCapacity,
  latestResponse = null,
  newUpdate = false,
  asideOpen = false,
  userMessageExpanded = false,
  folders = [],
  collapsedFolders,
  attachments = [],
  attachmentsUploading = 0,
  attachmentError = null,
  lightbox = null,
  repositories = [],
  repositorySheet = null,
  laneWizard = null,
} = {}) {
  const statusOpts = { developmentResources, lanes, executionCapacity };
  const list = renderLaneList(lanes, selectedId, { loading, attentionByLane, telemetryByLane, folders, collapsedFolders, repositories });
  // A sheet owns the screen while it is open: it is a decision the operator is
  // in the middle of, and the lane list behind it must not steal the tap.
  const openSheet = repositorySheet
    ? renderRepositorySheet(repositorySheet)
    : (laneWizard ? renderLaneWizard({ ...laneWizard, repositories, folders }) : "");
  if (openSheet) {
    return `<div class="gw is-sheet" data-gw data-gw-mode="sheet">${openSheet}</div>`;
  }
  const kind = emptyDetail
    ? "missing"
    : detailViewKind({ selectedId, lanes, lane, loading, listReady });
  if (kind === "list") {
    return `<div class="gw" data-gw data-gw-mode="list">${list}
      <section class="gw-main gw-main-empty">
        <div class="gw-lane-top">
          <div>
            <h1>Development Lanes</h1>
            <p class="gw-lead">Select a lane to see its session, output, and instruction composer.</p>
          </div>
          ${renderNotificationControls(notify || {})}
        </div>
      </section>
      ${renderStatus(null, resources, statusOpts)}
    </div>`;
  }
  if (kind === "connect") {
    return `<div class="gw is-detail" data-gw data-gw-mode="connect">${list}
      <section class="gw-main">
        <a class="gw-back" data-gw-back href="#/lanes">← Lanes</a>
        ${renderConnectFlow(connect || {})}
      </section>
      ${renderStatus(null, resources, statusOpts)}
    </div>`;
  }
  if (kind === "create") {
    // Same skeleton as a lane: compact header, scrollable body, pinned
    // composer. The old markup put a tall form straight into .gw-main, which is
    // overflow:hidden — so on a phone the message box and Start button were cut
    // off with no way to scroll to them.
    return `<div class="gw is-detail is-start" data-gw data-gw-mode="create">${list}
      <section class="gw-main">
        <div class="gw-lane-stage" data-gw-stage>
          <header class="gw-chat-head" data-gw-chat-head>
            <a class="gw-back" data-gw-back href="#/lanes" aria-label="Back to lanes">← Lanes</a>
            <div class="gw-chat-id"><h1 class="gw-chat-title">New lane</h1></div>
          </header>
          ${renderCreateLaneFlow(connect || {})}
        </div>
      </section>
    </div>`;
  }
  if (kind === "loading") {
    return `<div class="gw is-detail" data-gw data-gw-mode="detail" data-lane-id="${esc(selectedId)}" data-gw-loading>
      ${list}
      <section class="gw-main">
        <a class="gw-back" data-gw-back href="#/lanes">← Lanes</a>
        <h1>${esc(selectedId)}</h1>
        <p class="gw-lead">Loading lane…</p>
      </section>
      ${renderStatus(null, resources, statusOpts)}
    </div>`;
  }
  if (kind === "missing" || kind === "load_error") {
    const title = kind === "load_error" ? "Lane not loaded" : "Lane unavailable";
    const lead = kind === "load_error"
      ? "This Development Lane is listed but its detail could not be loaded. Return to Development Lanes and open it again."
      : "This Development Lane could not be resolved.";
    return `<div class="gw is-detail" data-gw data-gw-mode="detail">${list}
      <section class="gw-main">
        <a class="gw-back" data-gw-back href="#/lanes">← Lanes</a>
        <h1>${title}</h1>
        <p class="gw-lead">${lead}</p>
      </section>
      ${renderStatus(null, resources, statusOpts)}
    </div>`;
  }
  const work = canonicalLaneWorkState(lane, { output: output || { text: outputText }, nowMs });
  const pending = Boolean(outputPending) && !(outputText && String(outputText).trim());
  const ctxLine = contextCompact(telemetry);
  const statusHtml = renderStatus(lane, resources, {
    open: Boolean(statusOpen),
    summary: statusSummaryLine(lane, telemetry),
    sessionLine: work.headline,
    telemetry,
    developmentResources,
    lanes,
    executionCapacity,
  });
  const copyText = copyableOutputText({
    selectedId: lane?.lane_id || selectedId,
    output,
    outputText,
    lane,
    latestResponse,
  });
  const assistant = assistantMessageSource(lane, { output, outputText, latestResponse });
  const cap = deriveLaneExecutionPosture(lane);
  const bodyText = outputBodyText(output, outputText, { pending });
  const liveAttr = work.live ? ` data-gw-live="1"` : "";
  const liveMark = work.live
    ? `<span class="gw-live-dot" data-gw-live-dot>${work.stale ? "Stale" : "Working"}</span>`
    : "";
  // ONE details panel. Everything that is not the conversation lives here — it
  // used to be split between an inline <details> under the thread and a second
  // "Lane details" fold in the aside, so the same lane facts appeared twice and
  // neither place was complete.
  const detailsPanel = `<aside class="gw-lane-aside" data-gw-aside id="gw-details-panel"${asideOpen ? "" : ' aria-hidden="true" inert'}>
        <div class="gw-aside-head">
          <div class="gw-aside-title">Details</div>
          <button type="button" class="btn sm gw-aside-close" data-gw-aside-close aria-label="Close details">Close</button>
        </div>
        <div class="gw-aside-body">
          <div class="gw-aside-id">
            <h1>${esc(lane?.label || selectedId)}</h1>
            <p class="gw-presence" data-gw-presence>${esc(work.headline || cap.headline)}</p>
            <button type="button" class="btn sm gw-rename" data-gw-rename data-lane-id="${esc(lane?.lane_id || selectedId)}">Rename Lane</button>
            ${renderLaneFolderPicker(lane, folders, selectedId)}
            ${renderLaneRepository(lane, repositories)}
          </div>
          ${renderNotificationControls(notify || {})}
          ${renderLaneLocalhost(lane)}
          ${renderCurrentWork(lane?.execution_run, nowMs)}${renderPreviousWork(lane?.previous_run)}
          ${renderContextRefreshButton(lane)}
          ${renderOutputChrome(output, { lane, lastInstruction: lastInstruction || lane?.last_instruction })}
          ${renderClaudeRunStatus(lane, telemetry)}
          ${renderProviderHealth(output?.provider_health)}
          ${ctxLine ? `<p class="gw-context" data-gw-context>${esc(ctxLine)}</p>` : ""}
          ${renderLaneRuntimeControls(lane, cap, { capacity: executionCapacity })}
          ${renderLaneSessionCallout(lane, { executionCapacity })}
          ${renderRecentSystemActivity(lane?.recent_system_activity)}
          ${renderTerminalDiagnostics(bodyText, { pending, output })}
          ${statusHtml}
        </div>
      </aside>`;
  // The chat status line is ONE line: canonical state, then who is on the lane.
  const providerBit = laneProviderLabel(lane);
  const statusLine = [work.label, providerBit].filter(Boolean).join(" · ");
  return `<div class="gw is-detail${asideOpen ? " is-aside-open" : ""}" data-gw data-gw-mode="detail" data-lane-id="${esc(lane?.lane_id || selectedId)}">
    ${list}
    <section class="gw-main">
      <div class="gw-lane-stage" data-gw-stage>
        <header class="gw-chat-head" data-gw-chat-head>
          <a class="gw-back" data-gw-back href="#/lanes" aria-label="Back to lanes">← Lanes</a>
          <div class="gw-chat-id">
            <h1 class="gw-chat-title">${esc(lane?.label || selectedId)}</h1>
            <span class="gw-work-state${work.tone ? ` is-${work.tone}` : ""}" data-gw-stage-status>${esc(statusLine)}</span>
          </div>
          <button type="button" class="btn sm gw-aside-toggle" data-gw-aside-toggle
            aria-expanded="${asideOpen ? "true" : "false"}" aria-controls="gw-details-panel">Details</button>
        </header>
        <div class="gw-thread" data-gw-thread>
          ${renderLastInstruction(lastInstruction || lane?.last_instruction, nowMs, {
            expanded: Boolean(userMessageExpanded),
            // The run owns its attachments, so reopening the lane restores them
            // from the same projection that restores the prompt text.
            attachments: (lane?.execution_run || lane?.previous_run)?.attachments || [],
          })}
          <article class="gw-msg gw-msg-assistant"${liveAttr} data-gw-message-source="${esc(assistant.kind)}">
            <div class="gw-msg-tools">
              ${renderCopyControl({ text: copyText, feedback: copyFeedback })}
              ${liveMark}
            </div>
            ${renderAssistantMessage(assistant, { pending })}
          </article>
        </div>
        <button type="button" class="gw-new-update" data-gw-new-update ${newUpdate ? "" : "hidden"}>New update ↓</button>
        ${renderOperatorDecisionBar(lane?.execution_run)}
        ${renderComposer({
          ...(composer || {}),
          idleStart: cap.state === "IDLE",
          queueUntilSession: cap.state === "QUEUED_FOR_CAPACITY" || lane?.execution_run?.state_reason === "waiting_for_agent_session",
          provider: lane?.preferred_provider || "claude",
          cursorSendAvailable: Boolean(lane?.tmux?.alive) && laneProviderKind(lane) === "cursor",
          attachments,
          attachmentsUploading,
          attachmentError,
        })}
      </div>
      ${renderAttachmentLightbox(lightbox)}
      <div class="gw-aside-scrim" data-gw-aside-close aria-hidden="true"></div>
      ${detailsPanel}
    </section>
  </div>`;
}

export function railHtml(lanes, selectedId, attentionByLane, telemetryByLane) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return `<div class="gw-empty-rail">No lanes</div>`;
  return list.map((lane) => {
    const active = lane.lane_id === selectedId ? " active" : "";
    const st = laneListStatus(lane, attentionByLane?.[lane.lane_id]);
    const tone = st.tone;
    const wait = lane.execution_run?.resource_wait;
    const runState = lane.execution_run?.state;
    let queue = "";
    if (lane.runtime_posture?.state === "SESSION_ROTATING" || lane.execution_run?.runtime_posture?.state === "SESSION_ROTATING") {
      queue = " · Refreshing Claude context";
    } else if (lane.agent_session?.state === "ROTATION_PENDING" || lane.session_rotation?.need === "pending") {
      queue = " · Refresh pending";
    } else if (lane.runtime_posture?.state === "RECOVERING" || lane.execution_run?.runtime_posture?.state === "RECOVERING") {
      queue = ` · ${lane.runtime_posture?.reason || lane.execution_run?.runtime_posture?.reason || "Resource ownership"}`;
    } else if (lane.runtime_posture?.state === "QUIESCED") queue = ` · ${lane.runtime_posture.reason || "Runtime timing certification"}`;
    else if (runState === "WAITING_RESOURCE" && wait?.exclusive_phase && wait.exclusive_phase !== "EXCLUSIVE_ACTIVE") {
      queue = ` · ${wait.exclusive_detail || "Preparing exclusive timing"}`;
    } else if (runState === "WAITING_RESOURCE" && wait?.resuming) queue = " · Resuming…";
    else if (runState === "WAITING_RESOURCE" && !wait?.ready_to_resume && wait?.queue_position) queue = ` · #${wait.queue_position} in queue`;
    else if (runState === "VALIDATING" && wait?.resource_key === "runtime_timing_certification") queue = " · Exclusive timing window";
    else if (runState === "VALIDATING" && wait?.label) queue = ` · ${wait.label}`;
    const attn = `<span class="gw-lane-attn${tone ? ` is-${tone}` : ""}">${esc(st.mark)} ${esc(st.label)}${esc(queue)}</span>`;
    const ctx = contextCompact(telemetryByLane?.[lane.lane_id]);
    const who = agentLabel(lane);
    const meta = ctx ? `${who} · ${ctx}` : who;
    return `<a class="mission-rail-item${active}" data-route="lanes/${esc(lane.lane_id)}" data-gw-lane="${esc(lane.lane_id)}">
      <span class="mission-rail-title">${esc(lane.label || lane.lane_id)}<span class="mission-rail-meta">${esc(meta)}</span></span>
      ${attn}
    </a>`;
  }).join("");
}
