/**
 * Vacilando Runtime — Command Registry (Slice 2/3).
 *
 * A command is a REGISTERED key mapped to an explicit toolkit CLI (or an
 * internal read), with a declarative input schema, an eligibility resolver, a
 * preview builder, a confirmation policy, and refresh targets. There is NO way
 * to run anything that is not defined here:
 *
 *   - unknown command keys fail closed (executor)
 *   - malformed input fails closed (validateInput)
 *   - argv is built by buildArgv from VALIDATED, TYPED input only — never from a
 *     raw string in the request
 *   - `bin` is a FIXED basename resolved to an absolute path under the toolkit;
 *     the request never supplies an executable path
 *   - no shell is ever invoked (executor uses execFile with an arg array)
 *
 * Consequential commands require preview → explicit confirmation. Release,
 * promotion, merge, and destructive git are intentionally NOT executable
 * (declared unsupported with a reason) — the toolkit prints but never runs them.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { resolveSlotIdentity, invalidateIdentity } from "../identity.mjs";
import { routeInstruction, recordAsk } from "./director.mjs";
import { PROVIDERS } from "../providers.mjs";
import { sendViaProvider, verifyProvider, reconnectInfo, providerDiagnostics, ADAPTERS } from "../provider-runtime.mjs";
import { recordReview } from "./review.mjs";
import { preserveOutputs, discardGenerated } from "../closeout.mjs";

// --------------------------------------------------------------------------
// Declarative input validation (fail-closed).
// --------------------------------------------------------------------------
const KEY_RE = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

function validateField(name, spec, raw) {
  if (raw === undefined || raw === null || raw === "") {
    if (spec.required) return { ok: false, error: `${name}: required` };
    return { ok: true, value: spec.default ?? null };
  }
  switch (spec.type) {
    case "slot": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 6) return { ok: false, error: `${name}: must be an integer slot 1–6` };
      return { ok: true, value: n };
    }
    case "key":
    case "id": {
      const s = String(raw);
      if (!KEY_RE.test(s)) return { ok: false, error: `${name}: must match ${KEY_RE}` };
      return { ok: true, value: s };
    }
    case "name": {
      const s = String(raw).trim();
      if (!s || s.length > 120) return { ok: false, error: `${name}: 1–120 chars` };
      return { ok: true, value: s };
    }
    case "text": {
      const s = String(raw);
      const max = spec.max ?? 8000; // per-field override (Director instructions allow much more)
      if (!s.trim()) return { ok: false, error: `${name}: required` };
      if (s.length > max) return { ok: false, error: `${name}: ${s.length} chars exceeds the ${max}-character limit` };
      return { ok: true, value: s };
    }
    case "enum": {
      const s = String(raw);
      if (!Array.isArray(spec.options) || !spec.options.includes(s)) return { ok: false, error: `${name}: must be one of ${(spec.options || []).join(", ")}` };
      return { ok: true, value: s };
    }
    case "bool":
      return { ok: true, value: raw === true || raw === "true" };
    default:
      return { ok: false, error: `${name}: unknown field type` };
  }
}

export function validateInput(schema, input) {
  const value = {};
  const errors = [];
  const provided = input && typeof input === "object" ? input : {};
  // Reject unexpected fields (fail closed on shape).
  for (const k of Object.keys(provided)) {
    if (!schema[k]) errors.push(`${k}: unexpected field`);
  }
  for (const [name, spec] of Object.entries(schema)) {
    const r = validateField(name, spec, provided[name]);
    if (!r.ok) errors.push(r.error);
    else value[name] = r.value;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

// --------------------------------------------------------------------------
// Helpers shared by command definitions.
// --------------------------------------------------------------------------
const sprintBySlot = (snap, slot) => (snap?.sprints || []).find((s) => s.slot === slot) || null;

const BASE_REF = "origin/staging";
/**
 * AUTHORITATIVE worktree state for a destructive gate — computed live from the
 * slot's identity-resolved worktree, NEVER from the (possibly-null, possibly
 * stale, possibly registry-only) snapshot. This is the guard that makes Delete
 * Worktree safe under host pressure: when the board is registry-only its
 * `git` field is null, so a `snap.git.state === "dirty"` check would silently
 * pass. Here we read the real git state and FAIL CLOSED on anything uncertain.
 * Returns { ok, worktree, path, dirty, ahead, reason }.
 */
function authoritativeWorktreeState(slot) {
  const id = resolveSlotIdentity(slot);
  if (!id.worktree_name) return { ok: false, reason: `slot ${slot} is not occupied` };
  if (!id.ok) return { ok: false, worktree: id.worktree_name, reason: `slot identity conflict: ${id.conflict?.detail || "unverified"}` };
  const path = id.worktree_path;
  if (!existsSync(path)) return { ok: false, worktree: id.worktree_name, path, reason: "worktree not found on disk" };
  let dirty, ahead;
  try {
    dirty = execFileSync("git", ["-C", path, "status", "--porcelain=v1", "-uall"], { encoding: "utf8", timeout: 12000 }).split("\n").filter(Boolean).length > 0;
    ahead = Number(execFileSync("git", ["-C", path, "rev-list", "--count", `${BASE_REF}..HEAD`], { encoding: "utf8", timeout: 12000 }).trim() || 0);
  } catch (e) {
    return { ok: false, worktree: id.worktree_name, path, reason: `could not read git state (${String(e.code || e.message)}) — refusing to delete` };
  }
  return { ok: true, worktree: id.worktree_name, path, dirty, ahead };
}
const target = (kind, label, ref) => ({ kind, label, ref });

// Director instructions are engineering-scale. Both provider CLIs read the
// prompt from stdin (no ARG_MAX bound), so we allow well beyond the old 8k text
// cap. No authoritative provider restriction requires a lower ceiling.
export const DIRECTOR_MESSAGE_MAX = 24000;

// Dev-server capacity: the toolkit caps concurrently running Next dev servers
// (ALLOY_MAX_RUNNING_SERVERS, default 3). Starting one at capacity is blocked —
// an operator must stop another first (surfaced in the Start-server dialog).
const runningServerCount = (snap) => (snap?.sprints || []).filter((s) => s.server === "running").length;
function maxRunningServers() {
  try {
    const p = join(os.homedir(), ".config", "alloy-dev", "config");
    if (existsSync(p)) {
      const m = readFileSync(p, "utf8").match(/^ALLOY_MAX_RUNNING_SERVERS=["']?(\d+)/m);
      if (m) return Number(m[1]);
    }
  } catch { /* fall through to default */ }
  return 3;
}

// --------------------------------------------------------------------------
// Supported commands.
// --------------------------------------------------------------------------
const COMMANDS = {
  "runtime.refresh": {
    key: "runtime.refresh",
    title: "Refresh runtime state",
    risk: "low",
    execution: "internal",
    confirmation: "none",
    input: {},
    resolveTarget: () => target("runtime", "the live projection", null),
    eligibility: () => ({ eligible: true }),
    preview: () => ({
      summary: "Recompute the Command Center projection from authoritative sources now.",
      authoritative_target: "alloy-ro (worker/agent/sprint/initiative) + read-only git",
      effects: ["Re-reads all sources; changes nothing in the toolkit."],
    }),
    refresh: ["snapshot"],
  },

  "sprint.inspect": {
    key: "sprint.inspect",
    title: "Inspect sprint",
    risk: "low",
    execution: "internal",
    confirmation: "none",
    input: { slot: { type: "slot", required: true } },
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("sprint", `${s.title} (slot ${s.slot})`, { slot: s.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t) => (t ? { eligible: true } : { eligible: false, reason: "no occupied sprint on that slot" }),
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return {
        summary: `Show the authoritative detail for slot ${v.slot}${s ? ` — ${s.title}` : ""}.`,
        authoritative_target: `alloy-ro agent-status ${v.slot} + worker-detail + sprint-manifest`,
        effects: ["Read-only; returns the projected sprint, worker, and repository slice."],
      };
    },
    // Internal read: return the projected slice for the slot.
    run: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      const w = (snap.workers || []).find((x) => x.slot === v.slot) || null;
      const repo = (snap.repository?.worktrees || []).find((x) => x.slot === v.slot) || null;
      return { sprint: s, worker: w, repository: repo };
    },
    refresh: [],
  },

  "lane.list": {
    key: "lane.list",
    title: "List development lanes",
    risk: "low",
    execution: "internal",
    confirmation: "none",
    input: {},
    resolveTarget: () => target("runtime", "development lanes", null),
    eligibility: () => ({ eligible: true }),
    preview: () => ({
      summary: "List persistent Development Lanes (durable identity + live substrate).",
      authoritative_target: "Vacilando durable lane store + tmux list-panes (read-only) + workspace-facts git",
      effects: [
        "Read-only. Does not attach, send keys, spawn Claude, or use tmux session name as durable lane identity.",
      ],
    }),
    run: async () => {
      const { listDevelopmentLanes } = await import("../lanes.mjs");
      const { attachLaneInstructions } = await import("../lane-runtime.mjs");
      const { attachLaneRuns } = await import("../execution-run.mjs");
      const { attachLaneResourceWaits } = await import("../execution-resource.mjs");
      const { attachLaneRecovery } = await import("../execution-recovery.mjs");
      const { attachLaneAgentSessions } = await import("../agent-session-lifecycle.mjs");
      const out = await listDevelopmentLanes();
      if (out.lanes) out.lanes = attachLaneAgentSessions(attachLaneRecovery(attachLaneResourceWaits(attachLaneRuns(attachLaneInstructions(out.lanes), undefined, { includeInstruction: false }))));
      return out;
    },
    refresh: [],
  },

  "lane.inspect": {
    key: "lane.inspect",
    title: "Inspect development lane",
    risk: "low",
    execution: "internal",
    confirmation: "none",
    input: { lane_id: { type: "id", required: true } },
    resolveTarget: (v) => target("lane", v.lane_id, { lane_id: v.lane_id }),
    eligibility: (t, snap, v) => (v.lane_id ? { eligible: true } : { eligible: false, reason: "lane_id required" }),
    preview: (v) => ({
      summary: `Show the Development Lane projection for ${v.lane_id}.`,
      authoritative_target: `durable Development Lane ${v.lane_id} → current runtime binding → git facts`,
      effects: ["Read-only. Does not attach or mutate the session."],
    }),
    run: async (v) => {
      const { getDevelopmentLane } = await import("../lanes.mjs");
      const { attachLaneInstructions } = await import("../lane-runtime.mjs");
      const { attachLaneRuns } = await import("../execution-run.mjs");
      const { attachLaneResourceWaits } = await import("../execution-resource.mjs");
      const { attachLaneRecovery } = await import("../execution-recovery.mjs");
      const { attachLaneAgentSessions } = await import("../agent-session-lifecycle.mjs");
      const out = await getDevelopmentLane(v.lane_id);
      if (out.lane) out.lane = attachLaneAgentSessions(attachLaneRecovery(attachLaneResourceWaits(attachLaneRuns(attachLaneInstructions([out.lane]), undefined, { includeInstruction: true }))))[0];
      return out;
    },
    refresh: [],
  },

  "lane.output": {
    key: "lane.output",
    title: "Read development lane output",
    risk: "low",
    execution: "internal",
    confirmation: "none",
    input: { lane_id: { type: "id", required: true } },
    resolveTarget: (v) => target("lane", v.lane_id, { lane_id: v.lane_id }),
    eligibility: (t, snap, v) => (v.lane_id ? { eligible: true } : { eligible: false, reason: "lane_id required" }),
    preview: (v) => ({
      summary: `Read the currently visible pane output for Development Lane ${v.lane_id}.`,
      authoritative_target: `tmux capture-pane -p of the server-resolved pane for ${v.lane_id}`,
      effects: [
        "Read-only. Does not attach, send keys, spawn Claude, or accept a client tmux target.",
      ],
    }),
    run: async (v) => {
      const { getLaneOutput } = await import("../lanes.mjs");
      return getLaneOutput(v.lane_id);
    },
    refresh: [],
  },

  "lane.send_instruction": {
    key: "lane.send_instruction",
    title: "Send instruction to development lane",
    risk: "consequential",
    execution: "internal",
    confirmation: "required",
    input: {
      lane_id: { type: "id", required: true },
      instruction: { type: "text", required: true, max: 24000 },
    },
    resolveTarget: (v) => target("lane", v.lane_id, { lane_id: v.lane_id }),
    eligibility: (t, snap, v) => (v.lane_id ? { eligible: true } : { eligible: false, reason: "lane_id required" }),
    preview: (v) => ({
      summary: `Paste a ${String(v.instruction || "").length}-character instruction into the existing process for Development Lane ${v.lane_id} and submit once.`,
      authoritative_target: `tmux load-buffer/paste-buffer of the server-resolved pane for ${v.lane_id}`,
      effects: [
        "Delivers the instruction as literal terminal input (data), then one Enter.",
        "Does not attach, spawn Claude, run claude -p, or accept a client tmux target or key sequence.",
        "Proves delivery only — not that Claude finished responding.",
      ],
    }),
    run: async (v) => {
      const { deliverManagedLaneInstruction } = await import("../execution-run-send.mjs");
      return deliverManagedLaneInstruction(v.lane_id, v.instruction);
    },
    refresh: [],
  },

  "execution_run.inspect": {
    key: "execution_run.inspect",
    title: "Inspect execution run",
    risk: "low",
    execution: "internal",
    confirmation: "none",
    input: { lane_id: { type: "id", required: true } },
    resolveTarget: (v) => target("lane", v.lane_id, { lane_id: v.lane_id }),
    eligibility: (t, snap, v) => (v.lane_id ? { eligible: true } : { eligible: false, reason: "lane_id required" }),
    preview: (v) => ({
      summary: `Show the current Execution Run for Development Lane ${v.lane_id}.`,
      authoritative_target: `Vacilando execution-run store for ${v.lane_id}`,
      effects: ["Read-only. Does not mutate run state or deliver an instruction."],
    }),
    run: async (v) => {
      const { inspectLaneRun } = await import("../execution-run.mjs");
      return inspectLaneRun(v.lane_id);
    },
    refresh: [],
  },

  "worker.doctor": {
    key: "worker.doctor",
    title: "Diagnose worker health",
    risk: "low",
    execution: "cli",
    bin: "alloy-worker-doctor",
    confirmation: "none", // read-only diagnosis (never passes --recover)
    input: { slot: { type: "slot", required: true } },
    buildArgv: (v) => [String(v.slot)], // NOTE: never --recover
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `${s.provider} on slot ${s.slot}`, { slot: v.slot }) : target("worker", `slot ${v.slot}`, { slot: v.slot });
    },
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot is not occupied" }),
    preview: (v) => ({
      summary: `Run a read-only health diagnosis of slot ${v.slot}.`,
      authoritative_target: `alloy-worker-doctor ${v.slot}`,
      effects: ["Read-only diagnosis (drift, stale PIDs). Never recovers/mutates (no --recover)."],
    }),
    refresh: ["snapshot"],
  },

  "worker.pause": {
    key: "worker.pause",
    title: "Pause worker",
    risk: "consequential",
    execution: "cli",
    bin: "alloy-worker-pause",
    confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    buildArgv: (v) => [String(v.slot)],
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `${s.provider} on slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t, snap, v) => {
      const s = sprintBySlot(snap, v.slot);
      if (!s) return { eligible: false, reason: "slot is not occupied" };
      if (s.status === "paused") return { eligible: false, reason: "worker is already paused" };
      return { eligible: true };
    },
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return {
        summary: `Pause the worker on slot ${v.slot}${s ? ` (${s.title})` : ""}.`,
        authoritative_target: `alloy-worker-pause ${v.slot}`,
        effects: [
          "Stops the registry-owned provider, dev server, and browser for this slot only.",
          "Preserves all work and records a pause state. Reversible with resume.",
        ],
      };
    },
    refresh: ["snapshot"],
  },

  "worker.resume": {
    key: "worker.resume",
    title: "Resume worker",
    risk: "consequential",
    execution: "cli",
    bin: "alloy-worker-resume",
    confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    buildArgv: (v) => [String(v.slot)],
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t, snap, v) => {
      const s = sprintBySlot(snap, v.slot);
      if (!s) return { eligible: false, reason: "slot is not occupied" };
      if (s.status !== "paused") return { eligible: false, reason: "worker is not paused" };
      return { eligible: true };
    },
    preview: (v) => ({
      summary: `Resume the paused worker on slot ${v.slot}.`,
      authoritative_target: `alloy-worker-resume ${v.slot}`,
      effects: ["Restores the slot's prior resources from its pause state."],
    }),
    refresh: ["snapshot"],
  },

  "server.start": {
    key: "server.start",
    title: "Start dev server",
    risk: "consequential",
    execution: "cli",
    bin: "alloy-dev-start",
    confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    buildArgv: (v, snap) => [sprintBySlot(snap, v.slot)?.worktree],
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `dev server for slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t, snap, v) => {
      const s = sprintBySlot(snap, v.slot);
      if (!s) return { eligible: false, reason: "slot is not occupied" };
      if (s.server === "running") return { eligible: false, reason: "dev server is already running" };
      const running = runningServerCount(snap), max = maxRunningServers();
      if (running >= max) return { eligible: false, reason: `${running}/${max} dev servers already running — stop one first to free capacity` };
      return { eligible: true };
    },
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      const running = runningServerCount(snap), max = maxRunningServers();
      return {
        summary: `Start the dev server for slot ${v.slot}${s ? ` (${s.title})` : ""}.`,
        authoritative_target: `alloy-dev-start ${s?.worktree || ""}`,
        effects: [
          `Boots the toolkit-owned Next dev server${s?.port ? ` on port :${s.port}` : ""} so its app becomes openable.`,
          `Server capacity after start: ${running + 1}/${max}.`,
        ],
      };
    },
    refresh: ["snapshot"],
  },

  "server.stop": {
    key: "server.stop",
    title: "Stop dev server",
    risk: "consequential",
    execution: "cli",
    bin: "alloy-dev-stop",
    confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    buildArgv: (v, snap) => [sprintBySlot(snap, v.slot)?.worktree],
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `dev server for slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t, snap, v) => {
      const s = sprintBySlot(snap, v.slot);
      if (!s) return { eligible: false, reason: "slot is not occupied" };
      if (s.server !== "running") return { eligible: false, reason: "no running dev server on this slot" };
      return { eligible: true };
    },
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return {
        summary: `Stop the dev server for slot ${v.slot}${s ? ` (${s.title})` : ""}.`,
        authoritative_target: `alloy-dev-stop ${s?.worktree || ""}`,
        effects: [
          "Gracefully stops the toolkit-owned dev server for this slot only.",
          "Frees a server-capacity slot. Does not touch the agent or worktree.",
        ],
      };
    },
    refresh: ["snapshot"],
  },

  "question.answer": {
    key: "question.answer",
    title: "Answer a pending question",
    risk: "consequential",
    execution: "cli",
    bin: "alloy-product-decide",
    confirmation: "required",
    input: {
      initiative_key: { type: "key", required: true },
      decision_id: { type: "id", required: true },
      choice: { type: "name", required: true },
      decided_by: { type: "name", required: true },
      reason: { type: "text", required: true },
    },
    buildArgv: (v) => [v.initiative_key, v.decision_id, "--choice", v.choice, "--decided-by", v.decided_by, "--reason", v.reason],
    resolveTarget: (v, snap) => {
      const q = (snap.approvals?.questions || []).find((x) => x.initiative_key === v.initiative_key && x.id === v.decision_id);
      return q ? target("question", `${v.initiative_key}/${v.decision_id}`, { initiative_key: v.initiative_key, decision_id: v.decision_id }) : null;
    },
    eligibility: (t, snap, v) => {
      const q = (snap.approvals?.questions || []).find((x) => x.initiative_key === v.initiative_key && x.id === v.decision_id);
      if (!q) return { eligible: false, reason: "no open question matches that initiative + decision id" };
      if (Array.isArray(q.options) && q.options.length && !q.options.includes(v.choice)) {
        return { eligible: false, reason: `choice must be one of: ${q.options.join(", ")}` };
      }
      return { eligible: true };
    },
    preview: (v, t, snap) => {
      const q = (snap.approvals?.questions || []).find((x) => x.initiative_key === v.initiative_key && x.id === v.decision_id);
      return {
        summary: `Record the answer "${v.choice}" to ${v.initiative_key}/${v.decision_id}.`,
        authoritative_target: `alloy-product-decide ${v.initiative_key} ${v.decision_id} --choice ${v.choice}`,
        effects: [
          q ? `Question: ${q.summary}` : "Records a structured product decision.",
          "Regenerates affected contract sections. The decision becomes immutable for this product revision.",
        ],
      };
    },
    refresh: ["snapshot"],
  },

  "director.route": {
    key: "director.route",
    title: "Copy Instruction",
    risk: "consequential",
    execution: "internal",
    confirmation: "required",
    input: { slot: { type: "slot", required: true }, message: { type: "text", required: true, max: DIRECTOR_MESSAGE_MAX } },
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot is not occupied" }),
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return {
        summary: `Copy this instruction for the worker on slot ${v.slot}.`,
        authoritative_target: `director log (slot ${v.slot}) + clipboard`,
        effects: [
          "Records the interaction and copies the instruction to the clipboard for manual paste.",
          "Delivery mode: clipboard/manual paste — Vacilando has no governed API to inject into a running worker session.",
        ],
      };
    },
    run: async (v, snap, ctx) => {
      const s = sprintBySlot(snap, v.slot);
      const r = await routeInstruction({ slot: v.slot, worktree: s?.worktree, provider: s?.provider, message: v.message, occurredAtMs: ctx?.nowMs });
      return { ok: true, routed: true, ...r };
    },
    refresh: [],
  },

  "director.ask": {
    key: "director.ask",
    title: "Send to Worker",
    risk: "consequential",
    execution: "internal",
    confirmation: "required",
    input: { slot: { type: "slot", required: true }, message: { type: "text", required: true, max: DIRECTOR_MESSAGE_MAX } },
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree, provider: s.provider }) : null;
    },
    eligibility: (t, snap, v) => {
      const s = sprintBySlot(snap, v.slot);
      if (!s) return { eligible: false, reason: "slot is not occupied" };
      if (!PROVIDERS[s.provider]) return { eligible: false, reason: `no provider adapter for ${s.provider}` };
      return { eligible: true };
    },
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return {
        summary: `Send this instruction to the worker on slot ${v.slot}${s ? ` (assigned provider: ${s.provider})` : ""}.`,
        authoritative_target: `worker request → ${s?.provider === "cursor" ? "cursor-agent" : "claude"} -p (headless, prompt via stdin, worktree context)`,
        effects: [
          "This sends a live request to the assigned worker.",
          "Delivery mode: headless provider turn with the worktree as context (not injection into a live editor buffer).",
          "Usage will be shown after completion when reported by the provider.",
        ],
      };
    },
    run: async (v, snap, ctx) => {
      const s = sprintBySlot(snap, v.slot);
      const cwd = s?.worktree ? `${process.env.HOME}/Code/alloy-worktrees/${s.worktree}` : null;
      // Worker Runtime → Provider Runtime (single owner does the shared auth
      // pre-check; the worker never authenticates the provider itself).
      const response = await sendViaProvider({ provider: s?.provider, message: v.message, cwd });
      const rec = recordAsk({ slot: v.slot, worktree: s?.worktree, provider: s?.provider, message: v.message, response, occurredAtMs: ctx?.nowMs });
      return { ok: response.ok, provider: s?.provider, response: response.text, response_ok: response.ok, error: response.error, usage: response.usage, session_id: response.session_id, auth_required: response.auth_required === true, reconnect_cmd: response.reconnect_cmd || null, audit_id: rec.id };
    },
    refresh: [],
  },

  // ---- Provider Runtime commands (auth is infrastructure, owned centrally) ----
  "provider.verify": {
    key: "provider.verify", title: "Verify provider", risk: "read-only", execution: "internal", confirmation: "none",
    input: { provider: { type: "name", required: true } },
    resolveTarget: (v) => target("provider", `verify ${v.provider}`, { provider: v.provider }),
    eligibility: (t, snap, v) => (ADAPTERS[v.provider] ? { eligible: true } : { eligible: false, reason: `unknown provider: ${v.provider}` }),
    preview: (v) => ({ summary: `Re-check authentication + connection for ${v.provider}.`, authoritative_target: `probe ${v.provider} (no round-trip, no cost)`, effects: ["Forces a fresh auth/version probe of the provider.", "Read-only — no request is sent to the provider."] }),
    run: async (v) => await verifyProvider(v.provider),
    refresh: [],
  },
  "provider.reconnect": {
    key: "provider.reconnect", title: "Reconnect provider", risk: "read-only", execution: "internal", confirmation: "none",
    input: { provider: { type: "name", required: true } },
    resolveTarget: (v) => target("provider", `reconnect ${v.provider}`, { provider: v.provider }),
    eligibility: (t, snap, v) => (ADAPTERS[v.provider] ? { eligible: true } : { eligible: false, reason: `unknown provider: ${v.provider}` }),
    preview: (v) => ({ summary: `Show how to reconnect ${v.provider}.`, authoritative_target: `reconnect instructions for ${v.provider}`, effects: ["Vacilando cannot perform interactive OAuth sign-in from a headless command.", "Returns the exact one-time operator command; the whole Provider Runtime then uses it."] }),
    run: async (v) => reconnectInfo(v.provider),
    refresh: [],
  },
  "provider.diagnostics": {
    key: "provider.diagnostics", title: "Provider diagnostics", risk: "read-only", execution: "internal", confirmation: "none",
    input: { provider: { type: "name", required: true } },
    resolveTarget: (v) => target("provider", `diagnostics ${v.provider}`, { provider: v.provider }),
    eligibility: (t, snap, v) => (ADAPTERS[v.provider] ? { eligible: true } : { eligible: false, reason: `unknown provider: ${v.provider}` }),
    preview: (v) => ({ summary: `Full diagnostics for ${v.provider} (executable, version, auth, capabilities, runtime).`, authoritative_target: `diagnose ${v.provider}`, effects: ["Read-only. No secrets or tokens are read into the result."] }),
    run: async (v) => await providerDiagnostics(v.provider),
    refresh: [],
  },

  "review.resolve": {
    key: "review.resolve",
    title: "Resolve review",
    risk: "consequential",
    execution: "internal",
    confirmation: "required",
    input: { initiative_key: { type: "key", required: true }, disposition: { type: "enum", options: ["approve", "request_changes"], required: true }, note: { type: "text" } },
    resolveTarget: (v, snap) => {
      const r = (snap.approvals?.reviews || []).find((x) => x.initiative_key === v.initiative_key);
      return r ? target("review", `${v.initiative_key}`, { initiative_key: v.initiative_key }) : null;
    },
    eligibility: (t, snap, v) => ((snap.approvals?.reviews || []).some((x) => x.initiative_key === v.initiative_key) ? { eligible: true } : { eligible: false, reason: "no open review for that initiative" }),
    preview: (v) => ({
      summary: `Record review disposition "${v.disposition}" for ${v.initiative_key}.`,
      authoritative_target: `vacilando review log (${v.initiative_key})`,
      effects: [
        v.disposition === "approve" ? "Records an audited approval; clears the review from Needs You." : "Records an audited request-for-changes; pair with a routed instruction.",
        "Does not force the toolkit's initiative state machine (the toolkit owns promotion/merge).",
      ],
    }),
    run: async (v, snap, ctx) => {
      const rec = recordReview({ initiative_key: v.initiative_key, disposition: v.disposition, note: v.note, occurredAtMs: ctx?.nowMs });
      return { ok: true, disposition: v.disposition, review_id: rec.id };
    },
    refresh: ["snapshot"],
  },

  "sprint.start": {
    key: "sprint.start",
    title: "Start work",
    risk: "consequential",
    execution: "cli",
    bin: "alloy-sprint-start",
    confirmation: "required",
    input: {
      name: { type: "key", required: true },
      provider: { type: "enum", options: ["claude", "cursor"], required: true },
      slot: { type: "slot" },
      objective: { type: "text" },
    },
    buildArgv: (v) => [v.name, "--provider", v.provider, "--slot", v.slot ? String(v.slot) : "auto", "--without-server", ...(v.objective ? ["--objective", v.objective] : [])],
    resolveTarget: (v) => target("slot", v.slot ? `slot ${v.slot}` : "auto slot", { slot: v.slot ?? null }),
    eligibility: (t, snap, v) => {
      const occupied = new Set((snap.sprints || []).map((s) => s.slot));
      const free = [1, 2, 3, 4, 5, 6].filter((n) => !occupied.has(n));
      if (v.slot && occupied.has(v.slot)) return { eligible: false, reason: `slot ${v.slot} is occupied` };
      if (!free.length) return { eligible: false, reason: "all six slots are occupied — end a worker to free capacity" };
      return { eligible: true };
    },
    preview: (v) => ({
      summary: `Start a ${v.provider} worker for "${v.name}"${v.slot ? ` on slot ${v.slot}` : " on an auto-selected slot"}.`,
      authoritative_target: `alloy-sprint-start ${v.name} --provider ${v.provider} --slot ${v.slot || "auto"}`,
      effects: [
        "Creates a managed worktree from origin/staging, installs deps, prepares env, opens the provider.",
        "Long-running (dependency install). Server not started (--without-server).",
      ],
    }),
    refresh: ["snapshot"],
  },

  "sprint.finish": {
    key: "sprint.finish",
    title: "End work — close session (keep worktree)",
    risk: "consequential",
    execution: "cli",
    bin: "alloy-sprint-finish",
    confirmation: "required",
    input: { slot: { type: "slot", required: true }, acknowledge_uncommitted: { type: "bool" } },
    buildArgv: (v) => [String(v.slot), ...(v.acknowledge_uncommitted ? ["--acknowledge-uncommitted"] : [])],
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot is not occupied" }),
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      const dirty = s && s.git?.state === "dirty";
      return {
        summary: `End work on slot ${v.slot}${s ? ` (${s.title})` : ""} — close the session, keep the worktree.`,
        authoritative_target: `alloy-sprint-finish ${v.slot}${v.acknowledge_uncommitted ? " --acknowledge-uncommitted" : ""}`,
        effects: [
          "Stops managed processes, writes a continuation record, archives metadata, frees the slot.",
          "NEVER deletes the worktree, pushes, merges, or promotes.",
          dirty && !v.acknowledge_uncommitted ? "⚠ worktree is dirty — will refuse unless you acknowledge uncommitted changes." : "",
        ].filter(Boolean),
      };
    },
    refresh: ["snapshot"],
  },
};

// --------------------------------------------------------------------------
// Governed repository / promotion / merge / worktree commands (gh + git).
// Mutating ones are preview + confirm (typed confirm for deletion); they run
// real fixed-argv adapters. NOT executed during QA (preview only) per safety.
// --------------------------------------------------------------------------
const branchOf = (snap, slot) => sprintBySlot(snap, slot)?.branch || null;
const wtPath = (snap, slot) => `${process.env.HOME}/Code/alloy-worktrees/${sprintBySlot(snap, slot)?.worktree}`;

Object.assign(COMMANDS, {
  "repository.commit": {
    key: "repository.commit", title: "Commit", risk: "consequential", execution: "cli", bin: "git", confirmation: "required",
    input: { slot: { type: "slot", required: true }, message: { type: "text", required: true }, allow_empty: { type: "bool" } },
    buildArgv: (v, snap) => ["-C", `${process.env.HOME}/Code/alloy-worktrees/${sprintBySlot(snap, v.slot)?.worktree}`, "commit", ...(v.allow_empty ? ["--allow-empty"] : ["-a"]), "-m", v.message],
    resolveTarget: (v, snap) => target("repository", `commit on ${branchOf(snap, v.slot)}`, { slot: v.slot }),
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot not occupied" }),
    preview: (v, t, snap) => ({ summary: `Create a commit on ${branchOf(snap, v.slot)}.`, authoritative_target: `git commit ${v.allow_empty ? "--allow-empty " : "-a "}-m "${v.message}"`, effects: [v.allow_empty ? "Creates an empty commit (no file changes) — safe for fixture certification." : "Commits all tracked changes in the worktree.", "Local only — does not push."] }),
    refresh: ["snapshot"],
  },
  "repository.push": {
    key: "repository.push", title: "Push branch", risk: "consequential", execution: "cli", bin: "git", confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    buildArgv: (v, snap) => ["-C", `${process.env.HOME}/Code/alloy-worktrees/${sprintBySlot(snap, v.slot)?.worktree}`, "push", "-u", "origin", branchOf(snap, v.slot)],
    resolveTarget: (v, snap) => target("repository", `push ${branchOf(snap, v.slot)}`, { slot: v.slot }),
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot not occupied" }),
    preview: (v, t, snap) => ({ summary: `Push ${branchOf(snap, v.slot)} to origin.`, authoritative_target: `git push -u origin ${branchOf(snap, v.slot)}`, effects: ["Publishes local commits to the remote branch. Does not open a PR, merge, or promote.", "Release is never auto-approved."] }),
    refresh: ["snapshot"],
  },
  "promotion.open_pr": {
    key: "promotion.open_pr", title: "Open pull request (draft)", risk: "consequential", execution: "cli", bin: "gh", confirmation: "required",
    input: { slot: { type: "slot", required: true }, title: { type: "text", required: true } },
    cwd: (v, snap) => wtPath(snap, v.slot),
    buildArgv: (v, snap) => ["pr", "create", "--draft", "--base", "staging", "--head", branchOf(snap, v.slot), "--title", v.title, "--body", "Opened from Vacilando control plane (draft; human review required)."],
    resolveTarget: (v, snap) => target("repository", `PR for ${branchOf(snap, v.slot)}`, { slot: v.slot }),
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot not occupied" }),
    preview: (v, t, snap) => ({ summary: `Open a DRAFT PR: ${branchOf(snap, v.slot)} → staging.`, authoritative_target: `gh pr create --draft --base staging --head ${branchOf(snap, v.slot)}`, effects: ["Creates a draft pull request via the authenticated gh CLI.", "Draft only — not marked ready, not merged. Human review + explicit merge required."] }),
    refresh: ["snapshot"],
  },
  "merge.execute": {
    key: "merge.execute", title: "Merge pull request", risk: "consequential", execution: "cli", bin: "gh", confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    cwd: (v, snap) => wtPath(snap, v.slot),
    buildArgv: (v, snap) => ["pr", "merge", branchOf(snap, v.slot), "--merge"],
    resolveTarget: (v, snap) => target("repository", `merge PR for ${branchOf(snap, v.slot)}`, { slot: v.slot }),
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot not occupied" }),
    preview: (v, t, snap) => ({ summary: `Merge the PR for ${branchOf(snap, v.slot)} into its base.`, authoritative_target: `gh pr merge --merge`, effects: ["Merges the pull request via gh (respects branch protection + required checks).", "Release/merge is never auto-approved — this requires your explicit confirmation."] }),
    refresh: ["snapshot"],
  },
  "promotion.close_pr": {
    key: "promotion.close_pr", title: "Close pull request", risk: "consequential", execution: "cli", bin: "gh", confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    cwd: (v, snap) => wtPath(snap, v.slot),
    buildArgv: (v, snap) => ["pr", "close", branchOf(snap, v.slot)],
    resolveTarget: (v, snap) => target("repository", `close PR for ${branchOf(snap, v.slot)}`, { slot: v.slot }),
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot not occupied" }),
    preview: (v, t, snap) => ({ summary: `Close the PR for ${branchOf(snap, v.slot)} WITHOUT merging.`, authoritative_target: `gh pr close ${branchOf(snap, v.slot)}`, effects: ["Closes the pull request without merging (no code lands).", "Safe for certification — nothing is promoted."] }),
    refresh: ["snapshot"],
  },
  "closeout.preserve_evidence": {
    key: "closeout.preserve_evidence", title: "Preserve outputs", risk: "consequential", execution: "internal", confirmation: "required",
    input: { slot: { type: "slot", required: true } },
    resolveTarget: (v, snap) => target("repository", `preserve outputs for ${sprintBySlot(snap, v.slot)?.worktree}`, { slot: v.slot }),
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot not occupied" }),
    preview: (v, snap) => ({ summary: `Copy this worker's evidence + unique planning docs to the durable store.`, authoritative_target: `cp -R .alloy-agent-evidence + planning → evidence store`, effects: ["Non-destructive — copies only. Nothing in the worktree is changed.", "Makes it safe to later discard generated artifacts and delete the worktree without losing outputs."] }),
    run: async (v, snap) => await preserveOutputs(sprintBySlot(snap, v.slot)),
    refresh: [],
  },
  "closeout.discard_generated": {
    key: "closeout.discard_generated", title: "Discard generated artifacts", risk: "consequential", execution: "internal", confirmation: "required",
    input: { slot: { type: "slot", required: true }, confirm_text: { type: "name" } },
    typedConfirm: (v) => `discard ${v.slot}`,
    resolveTarget: (v, snap) => target("repository", `discard generated in ${sprintBySlot(snap, v.slot)?.worktree}`, { slot: v.slot }),
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot not occupied" }),
    preview: (v, snap) => ({ summary: `Remove ONLY untracked generated/evidence artifacts (never source, never unpreserved planning).`, authoritative_target: `rm untracked evidence/generated (requires prior Preserve)`, effects: ["DESTRUCTIVE for generated artifacts only. Source, tests, config, and planning docs are never touched.", "Refuses unless outputs were preserved to the durable store first.", `Type "discard ${v.slot}" to confirm.`] }),
    run: async (v, snap) => await discardGenerated(sprintBySlot(snap, v.slot)),
    refresh: ["snapshot"],
  },

  "worktree.delete": {
    key: "worktree.delete", title: "Delete worktree", risk: "consequential", execution: "internal", confirmation: "required",
    input: { slot: { type: "slot", required: true }, confirm_text: { type: "name" } },
    typedConfirm: (v) => `delete ${v.slot}`,
    // ATOMIC: remove the worktree AND free the slot in one governed action, so the
    // operator is never left with a dangling registration that the normal
    // End-Work path (alloy-sprint-finish) then refuses to clean because the
    // worktree it expects is gone. Path + guards come from the AUTHORITATIVE
    // identity, never the snapshot.
    run: (v) => {
      const w = authoritativeWorktreeState(v.slot);
      if (!w.ok) return { ok: false, error: w.reason };
      if (w.dirty) return { ok: false, error: "worktree has uncommitted changes — deletion blocked" };
      if (w.ahead > 0) return { ok: false, error: `worktree has ${w.ahead} unmerged commit(s) — deletion blocked` };
      try {
        execFileSync("git", ["-C", join(os.homedir(), "Alloy"), "worktree", "remove", w.path], { timeout: 30000, stdio: "pipe" });
      } catch (e) {
        return { ok: false, error: `git worktree remove failed: ${String(e.stderr || e.message || e).slice(0, 200)}` };
      }
      // Free the slot: archive its metadata (never --force, never touch history).
      let slot_freed = false;
      try {
        const metaDir = join(os.homedir(), ".local", "state", "alloy-dev", "metadata");
        const finDir = join(os.homedir(), ".local", "state", "alloy-dev", "finished");
        const src = join(metaDir, `${w.worktree}.env`);
        if (existsSync(src)) { if (!existsSync(finDir)) mkdirSync(finDir, { recursive: true }); renameSync(src, join(finDir, `${w.worktree}.env`)); slot_freed = true; }
      } catch { /* worktree is gone regardless; slot archival is best-effort */ }
      invalidateIdentity(v.slot);
      return { ok: true, worktree: w.worktree, path: w.path, removed: true, slot_freed };
    },
    resolveTarget: (v) => target("repository", `delete ${authoritativeWorktreeState(v.slot).worktree || "(unresolved)"}`, { slot: v.slot }),
    eligibility: (t, snap, v) => {
      // FAIL CLOSED on anything uncertain — identity conflict, missing worktree,
      // unreadable git, dirty tree, or unmerged commits. Independent of the
      // snapshot, so host pressure can never weaken this gate.
      const w = authoritativeWorktreeState(v.slot);
      if (!w.ok) return { eligible: false, reason: w.reason };
      if (w.dirty) return { eligible: false, reason: "worktree has uncommitted changes — commit, preserve, or discard first (deletion blocked when dirty)" };
      if (w.ahead > 0) return { eligible: false, reason: `worktree has ${w.ahead} commit(s) not in ${BASE_REF} — they would be orphaned. Push/merge them first.` };
      return { eligible: true };
    },
    preview: (v) => {
      const w = authoritativeWorktreeState(v.slot);
      return {
        summary: `Delete the worktree for slot ${v.slot} (${w.worktree || "unresolved"}) and free the slot.`,
        authoritative_target: `git worktree remove ${w.path || "<path>"} (never --force)`,
        effects: [
          `Runs: git -C ~/Alloy worktree remove ${w.path || "<path>"}`,
          "DESTRUCTIVE — removes only this worktree checkout, then frees the slot.",
          "Blocked when dirty, when the identity is in conflict, or when it holds unmerged commits; never uses --force.",
          "Merged repository history and the branch are untouched.",
          `Type the phrase "delete ${v.slot}" to confirm.`,
        ],
      };
    },
    refresh: ["snapshot"],
  },
});

// --------------------------------------------------------------------------
// Intentionally UNSUPPORTED — surfaced with a reason, never simulated.
// --------------------------------------------------------------------------
export const UNSUPPORTED = {
  "director.inject_live_session": "No governed API injects text into a running Claude/Cursor EDITOR buffer. director.ask runs a real governed headless round-trip (fresh session, worktree context); director.route stages via clipboard. Injecting into the live interactive buffer remains unavailable.",
};

export function getCommand(key) {
  return COMMANDS[key] || null;
}
export function isUnsupported(key) {
  return Object.prototype.hasOwnProperty.call(UNSUPPORTED, key) ? UNSUPPORTED[key] : null;
}
export function listCommands() {
  return Object.values(COMMANDS).map((c) => ({
    key: c.key, title: c.title, risk: c.risk, execution: c.execution,
    confirmation: c.confirmation, input: Object.keys(c.input || {}), supported: true,
  })).concat(Object.entries(UNSUPPORTED).map(([key, reason]) => ({ key, supported: false, reason })));
}
export { COMMANDS };
