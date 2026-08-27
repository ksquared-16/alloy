/**
 * Vacilando Gateway V2 — Development Lane discovery (Slice 1).
 *
 * A Development Lane is the operator-facing resolution of a persistent tmux
 * session + worktree + Git branch. Vacilando does not own those objects.
 *
 * Lane != Slot. Slot registry is optional enrichment, never the discovery
 * source — alloy-identity is discoverable even when slot 1 names another tree.
 *
 * Observation: tmux list-panes -a + capture-pane -p of a discovered pane.
 * Delivery: load-buffer stdin → paste-buffer -d -p → one server-owned Enter.
 * Never attach, spawn Claude, interpolate instruction into a shell, or accept
 * a browser tmux target. Browser supplies lane_id (+ instruction for send).
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { writeAuditEvent } from "./commands/audit.mjs";
import { parseAheadBehind } from "./model.mjs";
import { gitFactsForPath, readAllMetadata, resolveRuntimeConfig } from "./workspace-facts.mjs";
import {
  adoptLegacyIdentityLane,
  canonicalLaneStoreId,
  durableLanesEnabled,
  ensureKnownLaneMissionBindings,
  getDurableLane,
  laneAliases,
  listDurableLanes,
  validateRuntimeBinding,
} from "./development-lane.mjs";
import { collectLatestClaudeResponse } from "./providers/claude/telemetry.mjs";
import { collectLatestCursorResponse } from "./providers/cursor/telemetry.mjs";
import {
  PROMPT_NOT_READY_ERROR,
  assessPanePromptReadiness,
  promptReadinessAllowsSend,
  publicPromptReadiness,
} from "./provider-prompt-readiness.mjs";

export const LANE_SCHEMA = "vacilando.lane.v1";
export const LANE_OUTPUT_SCHEMA = "vacilando.lane.output.v1";
export const LANE_SEND_SCHEMA = "vacilando.lane.send.v1";
export const CURSOR_DELIVERY_UNAVAILABLE = "cursor_delivery_unavailable";
export const CURSOR_DELIVERY_UNAVAILABLE_SUMMARY =
  "Cursor delivery unavailable: transcript is readable, but no executable Cursor transport is attached.";
export const TMUX_SESSION_RE = /^alloy-[a-z0-9]+(-[a-z0-9]+)*$/;
export const LANE_ID_RE = /^(?:lane_[a-f0-9]{12}|alloy-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
/** Recent: fast poll / fingerprint. Extended: operator-requested review only. */
export const LANE_OUTPUT_RECENT_LINES = 120;
export const LANE_OUTPUT_DEFAULT_LINES = LANE_OUTPUT_RECENT_LINES;
export const LANE_OUTPUT_EXTENDED_LINES = 8000;
export const LANE_OUTPUT_MAX_LINES = LANE_OUTPUT_EXTENDED_LINES;
export const LANE_OUTPUT_RECENT_CHARS = 64 * 1024;
export const LANE_OUTPUT_MAX_CHARS = 512 * 1024;
export const LANE_OUTPUT_HISTORY_LINES = LANE_OUTPUT_RECENT_LINES;
export const LANE_OUTPUT_MODES = Object.freeze(["recent", "extended", "latest_response"]);
/** Same bound as DIRECTOR_MESSAGE_MAX — operator instructions, not shell lines. */
export const LANE_INSTRUCTION_MAX = 24000;
/** Absorb mobile double-tap / HTTP retry of the same payload. */
export const LANE_SEND_DUPLICATE_MS = 8000;
export const CONTROL_OVERRIDE_KEYS = [
  "tmux_target", "target", "session", "pane", "pane_id", "paneId",
  "command", "argv", "cwd", "executable", "keys", "key_sequence",
];

export const START_SESSION_FORBIDDEN_FIELDS = [
  ...CONTROL_OVERRIDE_KEYS,
  "worktree", "worktree_path", "branch", "tmux", "tmux_session",
  "claude_flags", "flags", "shell", "cmd",
];

export function unexpectedLaneControlFields(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return START_SESSION_FORBIDDEN_FIELDS.filter((k) => value[k] != null && value[k] !== "");
}

/** Pipe is not used in Alloy worktree paths; tmux -F emits it literally. */
const TMUX_SEP = "|";
const TMUX_FORMAT = [
  "#{session_name}",
  "#{window_index}",
  "#{pane_index}",
  "#{pane_id}",
  "#{pane_pid}",
  "#{pane_dead}",
  "#{session_attached}",
  "#{session_activity}",
  "#{pane_current_command}",
  "#{pane_current_path}",
  "#{pane_title}",
].join(TMUX_SEP);

function tmuxBin() {
  const home = process.env.HOME || homedir();
  for (const p of ["/usr/local/bin/tmux", "/opt/homebrew/bin/tmux", join(home, ".local/bin/tmux")]) {
    if (existsSync(p)) return p;
  }
  return "tmux";
}

function runTmux(args, timeoutOrOpts = 4000) {
  const opts = typeof timeoutOrOpts === "number" ? { timeout: timeoutOrOpts } : (timeoutOrOpts || {});
  const timeout = opts.timeout ?? 4000;
  const maxBuffer = opts.maxBuffer ?? 2 * 1024 * 1024;
  const input = opts.input;
  return new Promise((res) => {
    const child = execFile(tmuxBin(), args, { timeout, maxBuffer, windowsHide: true }, (err, stdout, stderr) => {
      res({
        ok: !err,
        stdout: stdout || "",
        stderr: stderr || "",
        error: err ? String(err.message || err) : null,
      });
    });
    if (input != null && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.end(Buffer.from(String(input), "utf8"));
    }
  });
}

export async function listTmuxPanesRaw() {
  return runTmux(["list-panes", "-a", "-F", TMUX_FORMAT]);
}

export function parseTmuxPaneLines(text) {
  const panes = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(TMUX_SEP);
    if (parts.length < 11) continue;
    const [session, window, pane, pane_id, pid, dead, attached, activity, command, cwd, ...titleParts] = parts;
    panes.push({
      session,
      window,
      pane,
      pane_id,
      pid: pid || null,
      dead: dead === "1",
      attached: Number(attached) > 0,
      session_activity: activity && /^\d+$/.test(activity) ? Number(activity) : null,
      command: command || "",
      cwd: cwd || "",
      title: titleParts.join(TMUX_SEP) || "",
    });
  }
  return panes;
}

export function isAllowlistedSession(session) {
  return TMUX_SESSION_RE.test(String(session || ""));
}

export function inferClaudePresence(pane) {
  const cmd = String(pane?.command || "");
  const title = String(pane?.title || "");
  if (/claude/i.test(cmd) || /claude/i.test(title)) return "present";
  // Claude Code TUI often reports its version as pane_current_command (e.g. 2.1.220).
  if (/^\d+\.\d+\.\d+$/.test(cmd)) return "present";
  if (pane?.dead) return "absent";
  return "unknown";
}

/**
 * Provider-aware presence. inferClaudePresence only ever recognised Claude, so
 * a Cursor lane read as "unknown" and the Gateway showed it as not running.
 * Claude detection is unchanged; Cursor is recognised on its own terms.
 */
export function inferAgentPresence(pane, { provider = null } = {}) {
  const p = String(provider || "").toLowerCase();
  const cmd = String(pane?.command || "");
  const title = String(pane?.title || "");
  if (p === "cursor" || /cursor[- ]?agent/i.test(cmd) || /cursor[- ]?agent/i.test(title)) {
    if (/cursor/i.test(cmd) || /cursor/i.test(title)) return "present";
    // Cursor's TUI reports a bare version the same way Claude's does.
    if (/^\d+\.\d+\.\d+$/.test(cmd)) return "present";
    // Bound Cursor Agent panes often report as `node` with an operator-set
    // tmux title (not "Cursor Agent"). Command + provider is the live signal.
    if (/^node(\b|$)/i.test(cmd) && !pane?.dead) return "present";
    if (pane?.dead) return "absent";
    return "unknown";
  }
  return inferClaudePresence(pane);
}

export function selectPrimaryPane(panes) {
  if (!Array.isArray(panes) || !panes.length) return null;
  const claude = panes.find((p) => inferClaudePresence(p) === "present");
  return claude || panes[0];
}

function stripTitleNoise(title) {
  return String(title || "").replace(/^[\s_*✳✦★☆-]+/, "").trim();
}

export function displayLabelForLane({ pane, worktreeName, session }) {
  const title = stripTitleNoise(pane?.title);
  if (title && !/\.local$/i.test(title) && !/^MacBook/i.test(title)) return title;
  if (worktreeName) {
    const rest = String(worktreeName).replace(/^wt\d+-/, "").replace(/-/g, " ");
    return rest.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return String(session || "lane").replace(/^alloy-/, "");
}

function underWorktreeRoot(cwd, worktreeRoot) {
  if (!cwd || !worktreeRoot) return false;
  const root = worktreeRoot.replace(/\/+$/, "");
  return cwd === root || cwd.startsWith(`${root}/`);
}

function worktreeFromCwd(cwd, worktreeRoot) {
  if (!cwd) return { name: null, path: null, managed: false };
  if (underWorktreeRoot(cwd, worktreeRoot)) {
    const root = worktreeRoot.replace(/\/+$/, "");
    const rel = cwd.slice(root.length + 1);
    const name = rel.split("/")[0] || null;
    if (!name) return { name: null, path: cwd, managed: false };
    return { name, path: join(root, name), managed: true };
  }
  return { name: basename(cwd), path: cwd, managed: false };
}

function slotForWorktree(metadata, { name, path }) {
  if (!Array.isArray(metadata)) return null;
  for (const m of metadata) {
    const slot = Number(m.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 6) continue;
    if (path && m.path && m.path === path) return slot;
    if (name && m.worktree === name) return slot;
  }
  return null;
}

export function composeLane({ pane, gitFacts = null, slot = null, worktreeRoot, nowMs }) {
  const session = pane.session;
  const wt = worktreeFromCwd(pane.cwd, worktreeRoot);
  const ab = parseAheadBehind(gitFacts?.ahead_behind);
  const activityMs = pane.session_activity ? pane.session_activity * 1000 : null;
  return {
    schema_version: LANE_SCHEMA,
    lane_id: session,
    label: displayLabelForLane({ pane, worktreeName: wt.name, session }),
    tmux: {
      session,
      window: pane.window,
      pane: pane.pane,
      pane_id: pane.pane_id || null,
      pid: pane.pid,
      alive: !pane.dead && Boolean(pane.pid),
      attached: Boolean(pane.attached),
      command: pane.command || "",
      title: pane.title || "",
      cwd: pane.cwd || "",
    },
    claude: {
      presence: inferClaudePresence(pane),
      pane_title: displayLabelForLane({ pane, worktreeName: wt.name, session }),
    },
    worktree: {
      name: wt.name,
      path: wt.path || pane.cwd || null,
      managed: wt.managed,
    },
    git: gitFacts
      ? {
        branch: gitFacts.branch && gitFacts.branch !== "?" ? gitFacts.branch : null,
        state: gitFacts.git || "unknown",
        ahead: ab.ahead,
        behind: ab.behind,
        head: gitFacts.head || null,
        head_in_base: gitFacts.head_in_base ?? null,
      }
      : { branch: null, state: "unknown", ahead: 0, behind: 0 },
    slot,
    last_activity_ms: activityMs,
    last_activity_at: activityMs ? new Date(activityMs).toISOString() : null,
    observed_at: new Date(nowMs ?? Date.now()).toISOString(),
  };
}

async function defaultListPanes() {
  const raw = await listTmuxPanesRaw();
  if (!raw.ok) return { ok: false, panes: [], error: raw.error || raw.stderr || "tmux_unavailable" };
  return { ok: true, panes: parseTmuxPaneLines(raw.stdout), error: null };
}

/**
 * Discover Development Lanes. Inject listPanes / gitFacts / metadata in tests.
 * Live path never takes a browser-supplied tmux target.
 *
 * listPanes may return { ok, panes } or { ok, stdout }.
 */
export async function listDevelopmentLanes({
  listPanes = defaultListPanes,
  gitFacts = gitFactsForPath,
  metadata = null,
  slotMetadata = null,
  worktreeRoot = null,
  cfg = null,
  nowMs = null,
  laneId = null,
  includeGitFacts = true,
} = {}) {
  const runtime = cfg || resolveRuntimeConfig();
  const root = worktreeRoot || runtime.worktree_root;
  const meta = metadata || slotMetadata || readAllMetadata(runtime);

  const listed = typeof listPanes === "function" ? await listPanes() : listPanes;
  let panes = listed?.panes;
  if (!panes && listed?.stdout != null) panes = parseTmuxPaneLines(listed.stdout);
  if (listed && listed.ok === false) {
    return { ok: false, lanes: [], error: listed.error || "tmux_unavailable" };
  }
  panes = panes || [];

  const bySession = new Map();
  for (const pane of panes) {
    if (!isAllowlistedSession(pane.session)) continue;
    if (!bySession.has(pane.session)) bySession.set(pane.session, []);
    bySession.get(pane.session).push(pane);
  }

  const jobs = [];
  const filterBySession = !durableLanesEnabled() && laneId;
  for (const [session, sessionPanes] of bySession) {
    if (filterBySession && session !== laneId) continue;
    const pane = selectPrimaryPane(sessionPanes);
    if (!pane) continue;
    const wt = worktreeFromCwd(pane.cwd, root);
    if (!wt.managed) continue;
    jobs.push((async () => {
      const factPath = (wt.path && existsSync(wt.path)) ? wt.path : (pane.cwd && existsSync(pane.cwd) ? pane.cwd : null);
      const facts = includeGitFacts && factPath ? await gitFacts(factPath, runtime) : null;
      const slot = slotForWorktree(meta, wt);
      return composeLane({ pane, gitFacts: facts, slot, worktreeRoot: root, nowMs: nowMs ?? Date.now() });
    })());
  }
  const observations = [];
  observations.push(...await Promise.all(jobs));
  observations.sort((a, b) => String(a.lane_id).localeCompare(String(b.lane_id)));

  if (!durableLanesEnabled()) {
    const lanes = laneId ? observations.filter((l) => l.lane_id === laneId) : observations;
    return { ok: true, lanes, error: null };
  }

  const identityObs = observations.find((l) => l.lane_id === "alloy-identity" || l.tmux?.session === "alloy-identity");
  if (identityObs) {
    try { adoptLegacyIdentityLane({ observation: identityObs }); } catch { /* migration must not fail discovery */ }
  }
  try { ensureKnownLaneMissionBindings(); } catch { /* backfill must not fail discovery */ }

  const records = listDurableLanes();
  const wanted = laneId ? records.filter((r) => laneAliases(r).includes(laneId) || r.lane_id === laneId) : records;
  const lanes = [];
  for (const rec of wanted) {
    let projected = projectDurableObservation(rec, observations);
    if (includeGitFacts && rec.binding?.worktree_path && (!projected.git || projected.git.state === "unknown")) {
      try {
        const facts = await gitFacts(rec.binding.worktree_path, runtime);
        const ab = String(facts?.ahead_behind || "").split("/");
        projected = {
          ...projected,
          git: {
            branch: (facts?.branch && facts.branch !== "?") ? facts.branch : (rec.binding.branch || null),
            state: facts?.conflict ? "conflict" : (facts?.git || projected.git?.state || "unknown"),
            ahead: Number(ab[0]) || 0,
            behind: Number(ab[1]) || 0,
            modified: Number(facts?.modified) || 0,
            untracked: Number(facts?.untracked) || 0,
            conflict: Boolean(facts?.conflict),
            last_commit_at: facts?.last_commit_at || null,
            head: facts?.head || null,
            head_in_base: facts?.head_in_base ?? null,
          },
          worktree: {
            name: rec.binding.worktree_name || projected.worktree?.name,
            path: rec.binding.worktree_path,
            managed: true,
          },
          slot: rec.binding.slot ?? projected.slot,
        };
      } catch { /* keep stub */ }
    }
    lanes.push(projected);
  }
  lanes.sort((a, b) => String(a.label || a.lane_id).localeCompare(String(b.label || b.lane_id)));
  return { ok: true, lanes, error: null };
}

export function projectDurableObservation(rec, observations = []) {
  const obs = (observations || []).find((o) =>
    (rec.binding?.tmux_session && (o.tmux?.session === rec.binding.tmux_session || o.lane_id === rec.binding.tmux_session))
    || (rec.binding?.worktree_path && o.worktree?.path === rec.binding.worktree_path)
  ) || null;
  const bindingCheck = validateRuntimeBinding(rec, obs);
  const base = obs ? { ...obs } : {
    schema_version: LANE_SCHEMA,
    tmux: {
      session: rec.binding?.tmux_session || null,
      pane_id: rec.binding?.tmux_pane || null,
      alive: false,
      attached: false,
      command: "",
      title: "",
      cwd: rec.binding?.worktree_path || "",
    },
    claude: { presence: "absent" },
    worktree: {
      name: rec.binding?.worktree_name || null,
      path: rec.binding?.worktree_path || null,
      managed: Boolean(rec.binding?.worktree_path),
    },
    git: { branch: rec.binding?.branch || null, state: "unknown", ahead: 0, behind: 0 },
    slot: rec.binding?.slot ?? null,
    last_activity_ms: null,
    last_activity_at: null,
    observed_at: new Date().toISOString(),
  };
  return {
    ...base,
    lane_id: rec.lane_id,
    label: rec.name,
    name: rec.name,
    durable: true,
    aliases: laneAliases(rec).filter((a) => a !== rec.lane_id),
    binding: rec.binding,
    lane_status: rec.status,
    binding_ok: bindingCheck.ok,
    binding_blockers: bindingCheck.blockers,
    execution_capacity: rec.execution_capacity || null,
    mission_id: rec.mission_id || null,
    mission_bound_at: rec.mission_bound_at || null,
    preferred_provider: rec.preferred_provider || rec.binding?.provider || null,
    folder_id: rec.folder_id || null,
    repository_id: rec.repository_id || null,
  };
}

export function normalizeLaneId(laneId) {
  const raw = String(laneId ?? "").trim();
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export async function getDevelopmentLane(laneId, opts = {}) {
  const id = normalizeLaneId(laneId);
  if (!LANE_ID_RE.test(id) && !(durableLanesEnabled() && getDurableLane(id))) {
    return { ok: false, error: "invalid_lane_id", lane: null };
  }
  if (durableLanesEnabled()) {
    if (id === "alloy-identity" && !getDurableLane(id)) {
      const listed = await listDevelopmentLanes({ ...opts, laneId: undefined });
      const rec = getDurableLane(id);
      const lane = listed.ok ? listed.lanes.find((l) => l.lane_id === rec?.lane_id) : null;
      if (lane) return { ok: true, lane };
    }
    const rec = getDurableLane(id);
    if (!rec) return { ok: false, error: "lane_not_found", lane_id: id, lane: null };
    const listed = await listDevelopmentLanes({ ...opts, laneId: rec.lane_id });
    if (!listed.ok) return { ok: false, error: listed.error, lane: null };
    const lane = listed.lanes.find((l) => l.lane_id === rec.lane_id) || null;
    if (!lane) return { ok: false, error: "lane_not_found", lane_id: id, lane: null };
    return { ok: true, lane };
  }
  const listed = await listDevelopmentLanes({ ...opts, laneId: id });
  if (!listed.ok) return { ok: false, error: listed.error, lane: null };
  const lane = listed.lanes.find((l) => l.lane_id === id) || null;
  if (!lane) return { ok: false, error: "lane_not_found", lane_id: id, lane: null };
  return { ok: true, lane };
}

export function normalizeOutputMode(raw) {
  const m = String(raw || "recent").trim().toLowerCase();
  if (m === "extended" || m === "review") return "extended";
  if (m === "latest_response" || m === "latest") return "latest_response";
  return "recent";
}

export function clampOutputLines(requested, { max = LANE_OUTPUT_MAX_LINES, fallback = LANE_OUTPUT_DEFAULT_LINES } = {}) {
  const n = Number(requested);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * Server-owned tmux -t value from a discovered lane. Never accepts a
 * browser-supplied session/pane/target.
 */
export function resolvedTmuxTarget(lane) {
  const paneId = String(lane?.tmux?.pane_id || "");
  if (/^%[0-9]+$/.test(paneId)) return { ok: true, target: paneId, kind: "pane_id" };
  const session = String(lane?.tmux?.session || "");
  const window = String(lane?.tmux?.window ?? "");
  const pane = String(lane?.tmux?.pane ?? "");
  if (TMUX_SESSION_RE.test(session) && /^\d+$/.test(window) && /^\d+$/.test(pane)) {
    return { ok: true, target: `${session}:${window}.${pane}`, kind: "session_window_pane" };
  }
  return { ok: false, error: "pane_unavailable", target: null };
}

export function outputFingerprint(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex").slice(0, 16);
}

export function boundVisibleText(raw, { maxLines, maxChars } = {}) {
  const linesCap = clampOutputLines(maxLines);
  const charCap = Math.min(Number(maxChars) > 0 ? Number(maxChars) : LANE_OUTPUT_MAX_CHARS, LANE_OUTPUT_MAX_CHARS);
  const all = String(raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (all.length && all[all.length - 1] === "") all.pop();
  const truncatedLines = all.length > linesCap;
  const lines = truncatedLines ? all.slice(-linesCap) : all;
  let text = lines.join("\n");
  let truncatedChars = false;
  if (text.length > charCap) {
    truncatedChars = true;
    text = text.slice(text.length - charCap);
    const nl = text.indexOf("\n");
    if (nl >= 0 && nl < text.length - 1) text = text.slice(nl + 1);
  }
  return {
    text,
    line_count: text === "" ? 0 : text.split("\n").length,
    truncated: truncatedLines || truncatedChars,
    empty: text.length === 0,
  };
}

function clientTriedTmuxOverride(opts) {
  if (!opts || typeof opts !== "object") return false;
  return CONTROL_OVERRIDE_KEYS.some((k) => opts[k] != null && opts[k] !== "");
}

function unavailable(laneId, error, nowMs, extra = {}) {
  return {
    ok: false,
    available: false,
    schema_version: LANE_OUTPUT_SCHEMA,
    lane_id: laneId || null,
    error,
    captured_at: new Date(nowMs ?? Date.now()).toISOString(),
    text: null,
    revision: nowMs ?? Date.now(),
    provider: extra.provider || null,
    session_id: extra.session_id || null,
    run_id: extra.run_id || null,
  };
}

export function outputRevisionMs(capturedAt, nowMs = Date.now()) {
  const ms = Date.parse(capturedAt);
  return Number.isFinite(ms) ? ms : nowMs;
}

function laneOutputProvider(lane) {
  const raw = String(lane?.binding?.provider || lane?.preferred_provider || lane?.agent_session?.provider || "").toLowerCase();
  if (raw === "cursor" || raw === "cursor-agent" || raw === "cursor_ide") return "cursor";
  if (raw === "claude" || raw === "claudecode" || raw === "claude-code") return "claude";
  return raw || null;
}

function withOutputIdentity(out, lane, nowMs) {
  const capturedAt = out.captured_at || new Date(nowMs).toISOString();
  return {
    ...out,
    captured_at: capturedAt,
    revision: Number.isFinite(Number(out.revision)) ? Number(out.revision) : outputRevisionMs(capturedAt, nowMs),
    provider: out.provider || laneOutputProvider(lane),
    session_id: out.session_id || lane?.agent_session?.provider_session_id || lane?.agent_session?.agent_session_id || null,
    run_id: out.run_id || lane?.execution_run?.run_id || null,
  };
}

/** Bounded pane history tail — not an unbounded dump, no attach, no send-keys. */
export function capturePaneArgv(target, historyLines = LANE_OUTPUT_HISTORY_LINES) {
  const n = clampOutputLines(historyLines);
  return ["capture-pane", "-p", "-J", "-S", `-${n}`, "-t", target];
}

export function paneFactsArgv(target) {
  return ["display-message", "-p", "-t", target, "#{alternate_on}|#{history_size}|#{history_limit}|#{pane_height}"];
}

export function parsePaneFacts(stdout) {
  const parts = String(stdout || "").trim().split("|");
  const historySize = Number(parts[1]);
  const historyLimit = Number(parts[2]);
  const paneHeight = Number(parts[3]);
  return {
    alternate_screen: parts[0] === "1",
    history_size: Number.isFinite(historySize) ? historySize : null,
    history_limit: Number.isFinite(historyLimit) ? historyLimit : null,
    pane_height: Number.isFinite(paneHeight) ? paneHeight : null,
  };
}

export async function defaultCapturePane(target, { historyLines = LANE_OUTPUT_HISTORY_LINES, timeout = 4000 } = {}) {
  const n = clampOutputLines(historyLines);
  return runTmux(capturePaneArgv(target, n), {
    timeout: n > LANE_OUTPUT_RECENT_LINES ? Math.max(timeout, 8000) : timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
}

export async function defaultPaneFacts(target) {
  const out = await runTmux(paneFactsArgv(target), { timeout: 2500 });
  if (!out?.ok) return parsePaneFacts("");
  return parsePaneFacts(out.stdout);
}

async function latestResponseForLane(lane, durableId, nowMs, opts = {}) {
  const cwd = lane?.worktree?.path || lane?.tmux?.cwd || null;
  let sessionId = opts.sessionId || null;
  if (!sessionId) {
    try {
      const { activeAgentSessionForLane } = await import("./agent-session.mjs");
      sessionId = activeAgentSessionForLane(durableId, opts.runtimeRoot)?.provider_session_id || null;
    } catch { /* presentation-only */ }
  }
  const provider = laneOutputProvider(lane);
  const collect = opts.collectLatestResponse
    || (provider === "cursor" ? collectLatestCursorResponse : collectLatestClaudeResponse);
  const source = provider === "cursor" ? "cursor_agent_transcript" : "claude_code_session_transcript";
  let result;
  try {
    result = collect({
      cwd,
      sessionId,
      configDir: opts.claudeConfigDir,
      projectsDir: opts.cursorProjectsDir,
    });
  } catch {
    result = { available: false, error: "latest_response_failed", text: null };
  }
  const capturedAt = result?.timestamp || (Number.isFinite(result?.mtime_ms) ? new Date(result.mtime_ms).toISOString() : new Date(nowMs).toISOString());
  if (!result?.available) {
    return withOutputIdentity({
      ok: true,
      available: false,
      schema_version: LANE_OUTPUT_SCHEMA,
      lane_id: durableId,
      mode: "latest_response",
      source,
      error: result?.error || "latest_response_unavailable",
      captured_at: capturedAt,
      revision: Number.isFinite(result?.mtime_ms) ? result.mtime_ms : nowMs,
      text: null,
      fingerprint: null,
      line_count: 0,
      truncated: false,
      empty: true,
    }, lane, nowMs);
  }
  const text = String(result.text || "");
  return withOutputIdentity({
    ok: true,
    available: true,
    schema_version: LANE_OUTPUT_SCHEMA,
    lane_id: durableId,
    mode: "latest_response",
    source,
    session_id: result.session_id || sessionId,
    captured_at: capturedAt,
    revision: Number.isFinite(result?.mtime_ms) ? result.mtime_ms : outputRevisionMs(capturedAt, nowMs),
    text,
    fingerprint: outputFingerprint(text),
    line_count: text === "" ? 0 : text.split("\n").length,
    truncated: Boolean(result.truncated),
    empty: text.length === 0,
  }, lane, nowMs);
}

function cursorTranscriptOutput(lane, durableId, nowMs, opts = {}) {
  const cwd = lane?.worktree?.path || lane?.tmux?.cwd || null;
  const collect = opts.collectLatestResponse || collectLatestCursorResponse;
  let result;
  try {
    result = collect({
      cwd,
      sessionId: opts.sessionId || lane?.agent_session?.provider_session_id || null,
      projectsDir: opts.cursorProjectsDir,
    });
  } catch {
    result = { available: false, error: "transcript_unreadable", text: null };
  }
  const capturedAt = result?.timestamp || (Number.isFinite(result?.mtime_ms) ? new Date(result.mtime_ms).toISOString() : new Date(nowMs).toISOString());
  const text = result?.available ? String(result.text || "") : "";
  if (!result?.available) {
    return withOutputIdentity({
      ok: false,
      available: false,
      schema_version: LANE_OUTPUT_SCHEMA,
      lane_id: durableId,
      mode: opts.mode || "recent",
      source: "cursor_agent_transcript",
      error: result?.error || "output_unavailable",
      captured_at: capturedAt,
      revision: Number.isFinite(result?.mtime_ms) ? result.mtime_ms : nowMs,
      text: null,
      fingerprint: null,
      line_count: 0,
      truncated: false,
      empty: true,
    }, lane, nowMs);
  }
  return withOutputIdentity({
    ok: true,
    available: true,
    schema_version: LANE_OUTPUT_SCHEMA,
    lane_id: durableId,
    mode: opts.mode || "recent",
    source: "cursor_agent_transcript",
    session_id: result.session_id || null,
    captured_at: capturedAt,
    revision: Number.isFinite(result?.mtime_ms) ? result.mtime_ms : outputRevisionMs(capturedAt, nowMs),
    text,
    fingerprint: outputFingerprint(text),
    line_count: text === "" ? 0 : text.split("\n").length,
    truncated: Boolean(result.truncated),
    empty: text.length === 0,
  }, lane, nowMs);
}

/**
 * Bounded observation of a discovered Development Lane's tmux pane.
 * mode=recent is polled; mode=extended / latest_response are operator-requested.
 */
/**
 * Persist receipt confirmation the first time this run's own token appears in
 * advanced output. After that the run's output is its own, even once the
 * envelope scrolls out of the capture window.
 */
async function maybeConfirmInstructionReceipt(run, out, opts = {}) {
  if (!run?.run_id || opts.skipRunCorrelation || opts.listPanes) return run;
  if (!runReceiptToken(run) || runReceiptConfirmed(run)) return run;
  if (!textProvesInstructionReceipt(run, out?.text, out?.fingerprint)) return run;
  try {
    const { noteInstructionReceipt } = await import("./execution-run.mjs");
    const noted = noteInstructionReceipt(run.run_id, {
      text: out.text,
      fingerprint: out.fingerprint,
      nowMs: opts.nowMs ?? Date.now(),
    });
    return noted?.run || run;
  } catch {
    return run;
  }
}

export async function getLaneOutput(laneId, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const mode = normalizeOutputMode(opts.mode);
  const requested = normalizeLaneId(laneId);
  const id = canonicalLaneStoreId(requested);
  if (!LANE_ID_RE.test(requested) && !LANE_ID_RE.test(id)) return unavailable(requested || null, "invalid_lane_id", nowMs);
  if (clientTriedTmuxOverride(opts)) return unavailable(id, "tmux_target_not_allowed", nowMs);

  const found = await getDevelopmentLane(requested, { ...opts, includeGitFacts: false });
  if (!found.ok) return unavailable(id, found.error || "lane_not_found", nowMs);

  const lane = found.lane;
  const durableId = lane.lane_id || id;
  let correlatedRun = lane?.execution_run || lane?.previous_run || null;
  if (!opts.skipRunCorrelation && !opts.listPanes) {
    try {
      const { inspectLaneRun } = await import("./execution-run.mjs");
      const pack = inspectLaneRun(durableId);
      correlatedRun = pack?.execution_run || pack?.previous_run || correlatedRun;
    } catch { /* observation still returns */ }
  }

  if (mode === "latest_response") {
    return bindOutputToRun(await latestResponseForLane(lane, durableId, nowMs, opts), correlatedRun);
  }

  if (!lane?.tmux?.alive) {
    if (laneOutputProvider(lane) === "cursor") {
      return bindOutputToRun(cursorTranscriptOutput(lane, durableId, nowMs, { ...opts, mode }), correlatedRun);
    }
    return bindOutputToRun(unavailable(durableId, "pane_unavailable", nowMs, { provider: laneOutputProvider(lane) }), correlatedRun);
  }

  const resolved = resolvedTmuxTarget(lane);
  if (!resolved.ok) return unavailable(durableId, "pane_unavailable", nowMs);

  const maxLines = mode === "extended"
    ? clampOutputLines(opts.maxLines ?? opts.lines, { max: LANE_OUTPUT_EXTENDED_LINES, fallback: LANE_OUTPUT_EXTENDED_LINES })
    : clampOutputLines(opts.maxLines ?? opts.lines, { max: LANE_OUTPUT_RECENT_LINES, fallback: LANE_OUTPUT_RECENT_LINES });
  const maxChars = mode === "extended" ? LANE_OUTPUT_MAX_CHARS : LANE_OUTPUT_RECENT_CHARS;

  const capturePane = opts.capturePane || defaultCapturePane;
  const cap = await capturePane(resolved.target, { historyLines: maxLines });
  if (!cap?.ok) return unavailable(durableId, "pane_unavailable", nowMs);

  let facts = { alternate_screen: null, history_size: null, history_limit: null, pane_height: null };
  if (opts.paneFacts !== undefined) {
    facts = opts.paneFacts && typeof opts.paneFacts === "object" ? opts.paneFacts : facts;
  } else if (!opts.capturePane) {
    facts = await defaultPaneFacts(resolved.target);
  }

  const bounded = boundVisibleText(cap.stdout, { maxLines, maxChars });
  const viewportOnly = facts.alternate_screen === true && Number(facts.history_size) === 0;
  const observed = withOutputIdentity({
    ok: true,
    available: true,
    schema_version: LANE_OUTPUT_SCHEMA,
    lane_id: durableId,
    mode,
    source: "tmux_pane",
    captured_at: new Date(nowMs).toISOString(),
    text: bounded.text,
    fingerprint: outputFingerprint(bounded.text),
    line_count: bounded.line_count,
    returned_lines: bounded.line_count,
    available_history_lines: facts.history_size,
    truncated: bounded.truncated,
    empty: bounded.empty,
    alternate_screen: facts.alternate_screen,
    history_size: facts.history_size,
    history_limit: facts.history_limit,
    pane_height: facts.pane_height,
    viewport_only: viewportOnly,
  }, lane, nowMs);
  correlatedRun = await maybeConfirmInstructionReceipt(correlatedRun, observed, opts);
  return bindOutputToRun(observed, correlatedRun);
}

// --------------------------------------------------------------------------
// Slice 3 — governed instruction delivery (literal paste, not a shell).
// --------------------------------------------------------------------------

const laneSendLocks = new Set();
const lastDelivered = new Map();

export function resetLaneSendStateForTests() {
  laneSendLocks.clear();
  lastDelivered.clear();
}

export function isLaneSendInProgress(laneId) {
  return laneSendLocks.has(normalizeLaneId(laneId));
}

export function laneSendBufferName(laneId) {
  return `vacilando-${laneId}`;
}

export function loadBufferArgv(bufferName) {
  return ["load-buffer", "-b", bufferName, "-"];
}

export function pasteBufferArgv(bufferName, target) {
  return ["paste-buffer", "-d", "-p", "-b", bufferName, "-t", target];
}

/**
 * Read a pane's visible text.
 *
 * Exported because callers outside this module need the CURRENT screen — a
 * blocking dialog must be re-read at answer time, not trusted from whatever the
 * UI last rendered.
 */
export async function capturePaneText(target, historyLines = 200) {
  const t = String(target || "").trim();
  if (!t) return { ok: false, error: "missing_target", text: "" };
  const out = await runTmux(capturePaneArgv(t, historyLines));
  return { ok: Boolean(out?.ok), text: String(out?.stdout || ""), error: out?.error || null };
}

/**
 * Send one bounded key argv to a pane.
 *
 * Exported deliberately: `runTmux` is private, and reaching for a private
 * symbol from another module is how three earlier fixes silently no-opped — the
 * import resolved to undefined and the caller's catch swallowed it.
 */
export async function sendPaneKeys(argv) {
  if (!Array.isArray(argv) || argv[0] !== "send-keys") {
    return { ok: false, error: "unsupported_key_argv" };
  }
  return runTmux(argv);
}

/**
 * Kill whatever is on the composer line before pasting into it.
 *
 * NOT yet wired into delivery. paste-buffer inserts at the cursor, so residual
 * text on the composer is appended to and submitted as one line — observed on
 * the Surfaces pane sitting at `❯ alloy-dev-stop wt6-surfaces-faacca`. Adding
 * this to defaultDeliverInstruction is the fix, but the delivery sequence is a
 * governed contract with tests asserting the exact tmux mutations, and widening
 * it broke five of them. That belongs in a change that updates the contract
 * deliberately, not as a side effect of a bug fix.
 */
export function clearComposerArgv(target) {
  return ["send-keys", "-t", target, "C-u"];
}

export function submitEnterArgv(target) {
  return ["send-keys", "-t", target, "Enter"];
}

/**
 * Tell the provider to abandon the turn it is working on.
 *
 * Exported deliberately: `runTmux` is private, and reaching for a private
 * symbol from another module is how two earlier fixes silently no-opped — the
 * import resolved to undefined and the caller's catch swallowed it.
 */
export async function interruptPane(target) {
  const t = String(target || "").trim();
  if (!t) return { ok: false, error: "missing_target" };
  // Escape twice: the first dismisses any transient overlay, the second
  // cancels the turn underneath it.
  return runTmux(["send-keys", "-t", t, "Escape", "Escape"]);
}

export function deleteBufferArgv(bufferName) {
  return ["delete-buffer", "-b", bufferName];
}

export function validateLaneInstruction(instruction) {
  const s = String(instruction ?? "");
  if (!s.trim()) return { ok: false, error: "instruction_empty", size: s.length };
  if (s.length > LANE_INSTRUCTION_MAX) return { ok: false, error: "instruction_too_large", size: s.length };
  return { ok: true, instruction: s, size: s.length };
}

/**
 * Send-time re-validation of a freshly discovered lane. Discovery already
 * requires an allowlisted session + managed worktree; send additionally
 * requires a live pane whose current command/title matches the existing
 * Claude-presence contract (semver TUI, "claude", or title — not a blind
 * process-name equality check).
 */
export function validateSendTarget(lane) {
  if (!lane) return { ok: false, error: "lane_not_found" };
  if (!LANE_ID_RE.test(String(lane.lane_id || ""))) return { ok: false, error: "invalid_lane_id" };
  if (!lane.worktree?.managed || !lane.worktree.path) return { ok: false, error: "target_mismatch" };
  if (!lane.tmux?.alive) return { ok: false, error: "pane_unavailable" };
  const cwd = String(lane.tmux.cwd || "");
  const wt = String(lane.worktree.path);
  if (!cwd || (cwd !== wt && !cwd.startsWith(`${wt}/`))) return { ok: false, error: "target_mismatch" };
  const provider = String(lane.binding?.provider || lane.preferred_provider || "").toLowerCase();
  const presence = inferAgentPresence({
    command: lane.tmux.command,
    title: lane.tmux.title,
    dead: !lane.tmux.alive,
  }, { provider: provider || undefined });
  if (presence !== "present") return { ok: false, error: "target_mismatch" };
  const resolved = resolvedTmuxTarget(lane);
  if (!resolved.ok) return { ok: false, error: "pane_unavailable" };
  return { ok: true, target: resolved.target, lane };
}

/**
 * Cursor IDE transcripts are observation-only. Send requires a live tmux pane
 * whose command/title is an executable cursor-agent (or Cursor TUI) process.
 * An attached conversation UUID is not a delivery transport.
 */
export function cursorExecutableTransport(lane) {
  if (!lane) {
    return { ok: false, error: CURSOR_DELIVERY_UNAVAILABLE, detail: "lane_missing" };
  }
  const check = validateSendTarget({
    ...lane,
    binding: { ...(lane.binding || {}), provider: "cursor" },
    preferred_provider: "cursor",
  });
  if (!check.ok) {
    return {
      ok: false,
      error: CURSOR_DELIVERY_UNAVAILABLE,
      detail: check.error,
      observation_only: true,
    };
  }
  return { ok: true, kind: "tmux_cursor_agent", target: check.target };
}

function runAcknowledgedDelivery(run) {
  if (!run) return false;
  if (run.delivery && typeof run.delivery === "object") {
    return run.delivery.acknowledged === true;
  }
  return Boolean(run.started_at);
}

/**
 * The per-run receipt token. The execution envelope opens with the run id, so
 * the run id appearing in pane output is direct evidence that THIS instruction
 * reached the provider. Runs delivered before receipt tracking existed carry no
 * token and are governed by the older baseline rule alone.
 */
export function runReceiptToken(run) {
  return run?.delivery?.receipt_token || null;
}

export function runReceiptConfirmed(run) {
  return run?.delivery?.receipt_confirmed === true;
}

/**
 * Does captured text prove receipt of this run's instruction? Requires both:
 * the token is present, and the text has moved past the pre-paste baseline.
 * Either alone is insufficient — the token can be echoed by an operator paste,
 * and movement alone can be the PREVIOUS turn still rendering.
 */
export function textProvesInstructionReceipt(run, text, fingerprint = null) {
  const token = runReceiptToken(run);
  if (!token) return false;
  const body = String(text || "");
  if (!body.includes(token)) return false;
  const baseline = run.output_fingerprint_at_send || run.delivery?.output_baseline_fingerprint || null;
  if (baseline && fingerprint && fingerprint === baseline) return false;
  return true;
}

export function bindOutputToRun(out, run) {
  if (!out) return out;
  if (!run?.run_id) return out;
  const delivered = runAcknowledgedDelivery(run);
  const live = ["QUEUED", "EXECUTING", "VALIDATING", "WAITING_RESOURCE", "RECOVERING"].includes(run.state);
  if (run.state === "FAILED" && !delivered) {
    return {
      ...out,
      ok: false,
      available: false,
      text: null,
      fingerprint: null,
      awaiting: false,
      withheld_prior_output: true,
      error: run.state_reason || run.delivery?.error || "delivery_failed",
      run_id: run.run_id,
    };
  }
  if (!delivered && live) {
    return {
      ...out,
      ok: true,
      available: false,
      text: null,
      fingerprint: null,
      awaiting: true,
      withheld_prior_output: true,
      error: "awaiting_provider_output",
      run_id: run.run_id,
    };
  }
  const baseline = run.output_fingerprint_at_send || run.delivery?.output_baseline_fingerprint || null;
  if (delivered && run.state === "EXECUTING" && baseline && out.fingerprint === baseline) {
    return {
      ...out,
      available: false,
      text: null,
      awaiting: true,
      withheld_prior_output: true,
      error: "awaiting_provider_output",
      run_id: run.run_id,
    };
  }
  // Output that advanced past the baseline is still not THIS run's output until
  // the run's own receipt token appears in it. Without this, a pane finishing
  // the PREVIOUS turn reads as the new instruction being worked on — which is
  // exactly how a stale completion was attributed to a newer run.
  if (delivered && live && runReceiptToken(run) && !runReceiptConfirmed(run)
      && !textProvesInstructionReceipt(run, out.text, out.fingerprint)) {
    return {
      ...out,
      available: false,
      text: null,
      fingerprint: out.fingerprint || null,
      awaiting: true,
      withheld_prior_output: true,
      error: "awaiting_instruction_receipt",
      run_id: run.run_id,
    };
  }
  return { ...out, run_id: out.run_id || run.run_id };
}

function instructionHash(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

/** In-memory duplicate window used by sendLaneInstruction. Does not create a run. */
export function wouldDuplicateLaneSend(laneId, instruction, nowMs = Date.now(), windowMs = LANE_SEND_DUPLICATE_MS) {
  const id = normalizeLaneId(laneId);
  const prev = lastDelivered.get(id);
  if (!prev) return false;
  const hash = instructionHash(String(instruction ?? ""));
  return prev.hash === hash && (nowMs - prev.at) >= 0 && (nowMs - prev.at) < windowMs;
}

function sendResult({ ok, laneId, error, status, nowMs, size, auditId, worktreePath, readiness, baseline }) {
  const rec = {
    ok,
    schema_version: LANE_SEND_SCHEMA,
    lane_id: laneId || null,
    delivered_at: new Date(nowMs).toISOString(),
    status,
    error: error || null,
    instruction_size: size ?? null,
    audit_id: auditId || null,
  };
  if (worktreePath) rec.worktree_path = worktreePath;
  if (readiness) rec.prompt_readiness = publicPromptReadiness(readiness);
  if (baseline) {
    rec.output_baseline_fingerprint = baseline.fingerprint || null;
    rec.output_baseline_captured_at = baseline.captured_at || null;
  }
  return rec;
}

/**
 * Read the pane immediately before pasting. Two facts come out of one capture:
 * whether the pane is at an actionable prompt, and the exact output baseline
 * this delivery is bound to. Both must come from the SAME read — a baseline
 * taken after the paste already contains the instruction, and a readiness check
 * taken earlier can describe a screen that has since changed.
 */
async function prePasteObservation(target, { tmux, capturePane, provider, nowMs }) {
  let text = "";
  let captured = false;
  try {
    if (typeof capturePane === "function") {
      const cap = await capturePane(target, { historyLines: LANE_OUTPUT_RECENT_LINES });
      if (cap?.ok) {
        text = String(cap.stdout ?? cap.text ?? "");
        captured = true;
      }
    } else if (typeof tmux === "function") {
      const cap = await tmux(capturePaneArgv(target, LANE_OUTPUT_RECENT_LINES));
      if (cap?.ok) {
        text = String(cap.stdout ?? "");
        captured = true;
      }
    }
  } catch {
    captured = false;
    text = "";
  }
  const bounded = boundVisibleText(text, {
    maxLines: LANE_OUTPUT_RECENT_LINES,
    maxChars: LANE_OUTPUT_RECENT_CHARS,
  });
  return {
    readiness: assessPanePromptReadiness(bounded.text, {
      provider: provider || null,
      captured: captured && Boolean(bounded.text.trim()),
    }),
    baseline: captured && bounded.text
      ? { fingerprint: outputFingerprint(bounded.text), captured_at: new Date(nowMs).toISOString() }
      : null,
  };
}

async function defaultDeliverInstruction({ target, instruction, bufferName, tmux }) {
  const load = await tmux(loadBufferArgv(bufferName), { input: instruction });
  if (!load?.ok) {
    return { ok: false, error: "delivery_failed", step: "load-buffer", detail: load?.error || load?.stderr || null };
  }
  const paste = await tmux(pasteBufferArgv(bufferName, target));
  if (!paste?.ok) {
    await tmux(deleteBufferArgv(bufferName));
    return { ok: false, error: "delivery_failed", step: "paste-buffer", detail: paste?.error || paste?.stderr || null };
  }
  const enter = await tmux(submitEnterArgv(target));
  if (!enter?.ok) {
    return { ok: false, error: "delivery_failed", step: "submit", detail: enter?.error || enter?.stderr || null };
  }
  const lines = String(instruction || "").split("\n").length;
  if (lines > 20 || String(instruction || "").length > 1200) {
    await new Promise((r) => setTimeout(r, 250));
    const again = await tmux(submitEnterArgv(target));
    if (!again?.ok) {
      return { ok: false, error: "delivery_failed", step: "submit-expand", detail: again?.error || again?.stderr || null };
    }
  }
  return { ok: true };
}

/**
 * Deliver literal instruction text into the current Development Lane pane.
 * Client supplies lane_id + instruction only. tmux target is re-resolved now.
 */
export async function sendLaneInstruction(laneId, instruction, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const audit = opts.writeAudit || writeAuditEvent;
  const requested = normalizeLaneId(laneId);
  const id = canonicalLaneStoreId(requested);
  const body = validateLaneInstruction(instruction);
  const size = body.size ?? String(instruction ?? "").length;

  const auditAndReturn = (rec) => {
    let auditId = null;
    try {
      const ev = audit({
        actor: opts.actor || "operator",
        command: "lane.send_instruction",
        input: { lane_id: id || null, instruction_size: size },
        target: { kind: "lane", label: id || null, ref: { lane_id: id || null } },
        preview_summary: rec.ok
          ? `Deliver ${size}-char instruction to Development Lane ${id}`
          : `Refuse instruction delivery to ${id || "(invalid)"}: ${rec.error}`,
        confirmed: true,
        outcome: rec.ok ? "succeeded" : (rec.status === "failed" ? "failed" : "refused"),
        error: rec.error || null,
        sources_refreshed: [],
      }, nowMs);
      auditId = ev?.id || null;
    } catch { /* audit must not block the operator result */ }
    rec.audit_id = auditId;
    return rec;
  };

  if (!LANE_ID_RE.test(requested) && !LANE_ID_RE.test(id)) {
    return auditAndReturn(sendResult({ ok: false, laneId: requested || null, error: "invalid_lane_id", status: "refused", nowMs, size }));
  }
  if (clientTriedTmuxOverride(opts)) {
    return auditAndReturn(sendResult({ ok: false, laneId: id, error: "unexpected_control_field", status: "refused", nowMs, size }));
  }
  if (!body.ok) {
    return auditAndReturn(sendResult({ ok: false, laneId: id, error: body.error, status: "refused", nowMs, size }));
  }

  if (laneSendLocks.has(id)) {
    return auditAndReturn(sendResult({ ok: false, laneId: id, error: "send_in_progress", status: "refused", nowMs, size }));
  }

  const dupWindow = Number.isInteger(opts.duplicateWindowMs) ? opts.duplicateWindowMs : LANE_SEND_DUPLICATE_MS;
  const prev = lastDelivered.get(id);
  const hash = instructionHash(opts.dedupeKey != null ? String(opts.dedupeKey) : body.instruction);
  if (prev && prev.hash === hash && (nowMs - prev.at) >= 0 && (nowMs - prev.at) < dupWindow) {
    return auditAndReturn(sendResult({ ok: false, laneId: id, error: "duplicate_send", status: "refused", nowMs, size }));
  }

  laneSendLocks.add(id);
  try {
    const found = await getDevelopmentLane(requested, { ...opts, includeGitFacts: false });
    if (!found.ok) {
      const err = found.error === "invalid_lane_id" ? "invalid_lane_id" : (found.error || "lane_not_found");
      return auditAndReturn(sendResult({ ok: false, laneId: id, error: err, status: "refused", nowMs, size }));
    }

    const durableId = found.lane?.lane_id || id;
    if (found.lane?.durable && found.lane.binding_ok === false) {
      return auditAndReturn(sendResult({ ok: false, laneId: durableId, error: "target_mismatch", status: "refused", nowMs, size }));
    }

    const targetCheck = validateSendTarget(found.lane);
    if (!targetCheck.ok) {
      return auditAndReturn(sendResult({ ok: false, laneId: durableId, error: targetCheck.error, status: "refused", nowMs, size }));
    }

    const tmux = opts.tmux || runTmux;
    const provider = String(found.lane?.binding?.provider || found.lane?.preferred_provider || "").toLowerCase() || null;

    // Readiness is decided BEFORE the paste, from a live read of the pane. A
    // successful paste-buffer is not evidence an agent read anything.
    let observed = await prePasteObservation(targetCheck.target, {
      tmux,
      capturePane: opts.capturePane,
      provider,
      nowMs,
    });
    // Operator Send is a new turn. If the pane is mid-turn (a spinner, not a
    // modal), interrupt once and re-read. Queued admission retries do not pass
    // interruptIfBusy — they wait for the pane to become ready on its own.
    if (opts.interruptIfBusy === true && observed.readiness?.state === "busy") {
      try {
        await tmux(["send-keys", "-t", targetCheck.target, "Escape", "Escape"]);
      } catch { /* recapture below still decides */ }
      const settle = Number.isFinite(opts.interruptSettleMs) ? opts.interruptSettleMs : 800;
      if (settle > 0) {
        const sleep = typeof opts.sleep === "function" ? opts.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
        await sleep(settle);
      }
      observed = await prePasteObservation(targetCheck.target, {
        tmux,
        capturePane: opts.capturePane,
        provider,
        nowMs,
      });
    }
    const gate = promptReadinessAllowsSend(observed.readiness, {
      strictCapture: opts.strictPromptCapture === true,
    });
    if (!gate.allow) {
      return auditAndReturn(sendResult({
        ok: false,
        laneId: durableId,
        error: PROMPT_NOT_READY_ERROR,
        status: "refused",
        nowMs,
        size,
        readiness: observed.readiness,
      }));
    }

    const delivered = await defaultDeliverInstruction({
      target: targetCheck.target,
      instruction: body.instruction,
      bufferName: laneSendBufferName(durableId),
      tmux,
    });
    if (!delivered.ok) {
      return auditAndReturn(sendResult({ ok: false, laneId: durableId, error: "delivery_failed", status: "failed", nowMs, size, readiness: observed.readiness }));
    }

    lastDelivered.set(id, { hash, at: nowMs, size });
    lastDelivered.set(durableId, { hash, at: nowMs, size });
    return auditAndReturn(sendResult({
      ok: true,
      laneId: durableId,
      error: null,
      status: "delivered",
      nowMs,
      size,
      worktreePath: found.lane?.worktree?.path || null,
      readiness: observed.readiness,
      baseline: observed.baseline,
    }));
  } finally {
    laneSendLocks.delete(id);
  }
}
