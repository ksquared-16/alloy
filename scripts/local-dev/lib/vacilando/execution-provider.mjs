/**
 * Vacilando — Execution Provider abstraction (Director Execution Runtime V1).
 *
 * Director dispatches work through this interface. Provider-specific CLI/auth
 * details stay behind adapters. Future providers plug in without Director changes.
 *
 * Lifecycle (Director-owned transitions):
 *   queued → launching → acknowledged → running → producing_evidence
 *         → completed | retrying | failed | unavailable
 */
import { precheckProvider } from "./provider-runtime.mjs";
import { startMissionTurn } from "./providers.mjs";
import { REPO_ROOT } from "./knowledge.mjs";

export const PROVIDER_LIFECYCLE = Object.freeze([
  "queued",
  "launching",
  "acknowledged",
  "running",
  "producing_evidence",
  "completed",
  "retrying",
  "failed",
  "unavailable",
]);

export const PROVIDER_LIFECYCLE_LABELS = Object.freeze({
  queued: "Queued",
  launching: "Launching",
  acknowledged: "Acknowledged",
  running: "Executing",
  producing_evidence: "Producing evidence",
  completed: "Completed",
  retrying: "Retrying",
  failed: "Failed",
  unavailable: "Unavailable",
});

/**
 * @typedef {object} ProviderDispatchResult
 * @property {boolean} ok
 * @property {string} status — completed | failed | unavailable | waiting_for_operator | blocked
 * @property {string} [summary]
 * @property {Array<{type:string,title:string,description?:string,fileUri?:string}>} [evidence]
 * @property {string[]} [changedFiles]
 * @property {string} [error]
 * @property {number} [pid]
 */

/**
 * @typedef {object} ExecutionProvider
 * @property {string} id
 * @property {string} label
 * @property {(opts?: object) => Promise<{ok:boolean,error?:string,auth_required?:boolean}>} precheck
 * @property {(req: object) => Promise<ProviderDispatchResult>} dispatch
 * @property {(handle: object) => void} [cancel]
 * @property {() => object} [status]
 * @property {(result: ProviderDispatchResult) => object[]} [collectEvidence]
 */

function defaultCollectEvidence(result, assignment) {
  const evidence = [...(result.evidence || [])];
  if (!evidence.some((e) => e.type === "log")) {
    evidence.push({
      type: "log",
      title: `Execution log — ${assignment?.title || "assignment"}`,
      description: result.summary || result.error || "Provider turn finished",
    });
  }
  return evidence;
}

/** Claude CLI adapter — real provider launch via startMissionTurn. */
export function createClaudeProvider() {
  let lastHandle = null;
  return {
    id: "claude",
    label: "Claude",
    async precheck() {
      return precheckProvider("claude", { force: true });
    },
    async dispatch({
      message,
      cwd = REPO_ROOT,
      onActivity = null,
      onAcknowledged = null,
      maxTurnMs = 120_000,
      inactivityMs = 60_000,
    } = {}) {
      const auth = await precheckProvider("claude", { force: true });
      if (!auth.ok) {
        return {
          ok: false,
          status: "unavailable",
          error: auth.error || "claude_unavailable",
          evidence: [],
        };
      }
      let acknowledged = false;
      const ack = () => {
        if (!acknowledged) {
          acknowledged = true;
          try { onAcknowledged?.({ provider: "claude" }); } catch { /* */ }
        }
      };
      const handle = startMissionTurn({
        provider: "claude",
        message,
        cwd,
        maxTurnMs,
        inactivityMs,
        onActivity: (a) => {
          ack();
          try { onActivity?.(a); } catch { /* */ }
        },
        allowBash: false,
      });
      lastHandle = handle;
      // Process accepted the dispatch — acknowledgement is real (provider started).
      if (handle?.pid) ack();
      const r = await handle.done;
      const status = r?.status || (r?.ok === false ? "failed" : "completed");
      return {
        ok: status === "completed" || status === "waiting_for_operator",
        status,
        summary: r?.summary || r?.latest_summary || r?.error || "Claude turn finished",
        changedFiles: r?.changed_files || [],
        evidence: [{
          type: "log",
          title: "Claude execution log",
          description: r?.summary || r?.error || `status=${status}`,
        }],
        pid: handle?.pid,
        error: r?.error || null,
        raw: r,
      };
    },
    cancel() {
      try { lastHandle?.kill?.(); } catch { /* */ }
    },
    status() {
      return { id: "claude", live: Boolean(lastHandle) };
    },
    collectEvidence: defaultCollectEvidence,
  };
}

/** Cursor agent adapter. */
export function createCursorProvider() {
  let lastHandle = null;
  return {
    id: "cursor",
    label: "Cursor",
    async precheck() {
      return precheckProvider("cursor", { force: true });
    },
    async dispatch({
      message,
      cwd = REPO_ROOT,
      onActivity = null,
      onAcknowledged = null,
      maxTurnMs = 120_000,
      inactivityMs = 60_000,
    } = {}) {
      const auth = await precheckProvider("cursor", { force: true });
      if (!auth.ok) {
        return {
          ok: false,
          status: "unavailable",
          error: auth.error || "cursor_unavailable",
          evidence: [],
        };
      }
      let acknowledged = false;
      const ack = () => {
        if (!acknowledged) {
          acknowledged = true;
          try { onAcknowledged?.({ provider: "cursor" }); } catch { /* */ }
        }
      };
      const handle = startMissionTurn({
        provider: "cursor",
        message,
        cwd,
        maxTurnMs,
        inactivityMs,
        onActivity: (a) => {
          ack();
          try { onActivity?.(a); } catch { /* */ }
        },
        allowBash: false,
      });
      lastHandle = handle;
      if (handle?.pid) ack();
      const r = await handle.done;
      const status = r?.status || (r?.ok === false ? "failed" : "completed");
      return {
        ok: status === "completed" || status === "waiting_for_operator",
        status,
        summary: r?.summary || r?.error || "Cursor turn finished",
        changedFiles: r?.changed_files || [],
        evidence: [{
          type: "log",
          title: "Cursor execution log",
          description: r?.summary || r?.error || `status=${status}`,
        }],
        pid: handle?.pid,
        error: r?.error || null,
        raw: r,
      };
    },
    cancel() {
      try { lastHandle?.kill?.(); } catch { /* */ }
    },
    status() {
      return { id: "cursor", live: Boolean(lastHandle) };
    },
    collectEvidence: defaultCollectEvidence,
  };
}

/**
 * Deterministic in-process provider for Director orchestration tests.
 * Still goes through Director acknowledgement callbacks — not a bypass of lifecycle.
 */
export function createMockProvider({
  id = "mock",
  label = "Mock",
  failTimes = 0,
  delayMs = 5,
} = {}) {
  let failsLeft = failTimes;
  let live = false;
  return {
    id,
    label,
    async precheck() {
      return { ok: true };
    },
    async dispatch({
      assignment = null,
      onActivity = null,
      onAcknowledged = null,
      message = "",
    } = {}) {
      live = true;
      if (failsLeft > 0) {
        failsLeft -= 1;
        live = false;
        return { ok: false, status: "unavailable", error: "mock_forced_unavailable", evidence: [] };
      }
      await new Promise((r) => setTimeout(r, delayMs));
      // Provider accepted the work
      try { onAcknowledged?.({ provider: id }); } catch { /* */ }
      try { onActivity?.({ kind: "assistant", text: `Working on ${assignment?.title || "assignment"}` }); } catch { /* */ }
      await new Promise((r) => setTimeout(r, delayMs));
      const outputs = assignment?.expectedDeliverables || [];
      const summary = `Completed ${assignment?.title || "assignment"} via mock provider.`
        + (message ? ` Prompt length ${message.length}.` : "");
      live = false;
      return {
        ok: true,
        status: "completed",
        summary,
        changedFiles: outputs.slice(),
        evidence: [
          {
            type: "log",
            title: `Mock execution — ${assignment?.title || "assignment"}`,
            description: summary,
          },
          ...outputs.map((path) => ({
            type: "diff",
            title: `Deliverable ${path}`,
            description: `Mock provider produced ${path}`,
            fileUri: path,
          })),
        ],
        pid: 1,
      };
    },
    cancel() { live = false; },
    status() { return { id, live }; },
    collectEvidence: defaultCollectEvidence,
  };
}

const registry = new Map();

export function registerProvider(provider) {
  if (!provider?.id) throw new Error("provider_requires_id");
  registry.set(provider.id, provider);
  return provider;
}

export function getProvider(id) {
  return registry.get(id) || null;
}

export function listProviders() {
  return [...registry.values()];
}

/** Install default adapters once per process. */
export function ensureDefaultProviders({ includeMock = false } = {}) {
  if (!registry.has("claude")) registerProvider(createClaudeProvider());
  if (!registry.has("cursor")) registerProvider(createCursorProvider());
  if (includeMock && !registry.has("mock")) registerProvider(createMockProvider());
  if (process.env.VACILANDO_EXECUTION_PROVIDER === "mock" && !registry.has("mock")) {
    registerProvider(createMockProvider());
  }
  return listProviders();
}

export function resolveProviderOrder({ preferred = null, exclude = [] } = {}) {
  ensureDefaultProviders({
    includeMock: process.env.VACILANDO_ALLOW_MOCK_PROVIDER === "1"
      || process.env.VACILANDO_EXECUTION_PROVIDER === "mock",
  });
  const excludeSet = new Set(exclude);
  const forced = process.env.VACILANDO_EXECUTION_PROVIDER?.trim();
  if (forced && forced !== "auto") {
    return [forced].filter((id) => !excludeSet.has(id) && getProvider(id));
  }
  const order = [];
  if (preferred && !excludeSet.has(preferred)) order.push(preferred);
  for (const id of ["claude", "cursor", "mock"]) {
    if (!order.includes(id) && !excludeSet.has(id) && getProvider(id)) order.push(id);
  }
  return order;
}

export { defaultCollectEvidence };
