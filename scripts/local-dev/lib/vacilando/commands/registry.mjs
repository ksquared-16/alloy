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
import { routeInstruction } from "./director.mjs";

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
      if (!s.trim() || s.length > 8000) return { ok: false, error: `${name}: 1–8000 chars` };
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
const target = (kind, label, ref) => ({ kind, label, ref });

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
    title: "Send instruction (Director)",
    risk: "consequential",
    execution: "internal",
    confirmation: "required",
    input: { slot: { type: "slot", required: true }, message: { type: "text", required: true } },
    resolveTarget: (v, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return s ? target("worker", `${s.provider} on slot ${s.slot} — ${s.title}`, { slot: v.slot, worktree: s.worktree }) : null;
    },
    eligibility: (t, snap, v) => (sprintBySlot(snap, v.slot) ? { eligible: true } : { eligible: false, reason: "slot is not occupied" }),
    preview: (v, t, snap) => {
      const s = sprintBySlot(snap, v.slot);
      return {
        summary: `Route this instruction to ${s ? s.provider : "the worker"} on slot ${v.slot}.`,
        authoritative_target: `director log (slot ${v.slot}) + clipboard`,
        effects: [
          "Records the interaction and copies the instruction to the clipboard.",
          "You paste it into the live session — Vacilando cannot inject into a running Claude/Cursor session (no governed API).",
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
// Intentionally UNSUPPORTED — surfaced with a reason, never simulated.
// --------------------------------------------------------------------------
export const UNSUPPORTED = {
  "promotion.promote": "Promotion is human-only. The toolkit PRINTS the push/PR commands but never executes them; there is no governed, previewable promotion command to wrap. Release is never auto-approved.",
  "repo.push": "Push is not an executable toolkit command (printed, never run). Requires explicit human action outside the control plane.",
  "repo.merge": "Merge is not an executable toolkit command. Landing happens through PR review into staging, by a human.",
  "worktree.delete": "alloy-worktree-remove is guarded (refuses dirty/unmerged, never --force) but requires an INTERACTIVE TTY confirmation — it cannot run from the loopback server. Delete a worktree from a terminal: alloy-worktree-remove <worktree>.",
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
