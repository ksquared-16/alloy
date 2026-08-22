/**
 * Claude Code session telemetry adapter (read-only).
 *
 * Source: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
 * Stability: SEMI-STABLE — structured local session files Claude Code already
 * writes. Not a documented pull API. Isolated here so Gateway UI never reads
 * Claude paths directly.
 *
 * Does not spawn `claude`, attach tmux, scrape the TUI, or modify settings.
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export const CLAUDE_TELEMETRY_SOURCE = "claude_code_session_transcript";
export const CLAUDE_TELEMETRY_STABILITY = "semi_stable";
export const DEFAULT_CONTEXT_WINDOW = 200_000;
export const EXTENDED_CONTEXT_WINDOW = 1_000_000;
export const LATEST_RESPONSE_MAX_CHARS = 64 * 1024;
const SESSION_JSONL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

const scanCache = new Map();

export function resetClaudeTelemetryCacheForTests() {
  scanCache.clear();
}

export function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
}

export function encodeClaudeProjectDir(cwd) {
  const raw = String(cwd || "").trim();
  if (!raw) return null;
  return raw.replace(/\\/g, "/").replace(/\//g, "-");
}

export function claudeProjectDir(cwd, configDir = claudeConfigDir()) {
  const enc = encodeClaudeProjectDir(cwd);
  if (!enc) return null;
  return join(configDir, "projects", enc);
}

export function nToken(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function usageFromRecord(obj) {
  if (!obj || obj.type !== "assistant") return null;
  const msg = obj.message && typeof obj.message === "object" ? obj.message : {};
  const usage = msg.usage || obj.usage;
  if (!usage || typeof usage !== "object") return null;
  const id = msg.id || obj.uuid || null;
  return {
    id,
    model: msg.model || obj.model || null,
    timestamp: obj.timestamp || null,
    input_tokens: nToken(usage.input_tokens),
    output_tokens: nToken(usage.output_tokens),
    cache_read_tokens: nToken(usage.cache_read_input_tokens),
    cache_write_tokens: nToken(usage.cache_creation_input_tokens),
  };
}

export function contextUsedTokens(usage) {
  if (!usage) return null;
  return usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens;
}

/**
 * Percent is only derived when the window size is known.
 * A live context above the 200k default can only fit in the 1m extended window.
 * Below that, 200k vs 1m is ambiguous — leave max/percent null.
 */
export function inferContextWindow(usedTokens) {
  const used = Number(usedTokens);
  if (!Number.isFinite(used) || used < 0) {
    return { max_tokens: null, max_source: null, percent_used: null };
  }
  if (used > DEFAULT_CONTEXT_WINDOW) {
    const max = EXTENDED_CONTEXT_WINDOW;
    return {
      max_tokens: max,
      max_source: "inferred_extended_context",
      percent_used: Math.max(0, Math.min(100, Math.round((used / max) * 100))),
    };
  }
  return { max_tokens: null, max_source: null, percent_used: null };
}

export function latestSessionJsonl(projectDir) {
  if (!projectDir || !existsSync(projectDir)) return null;
  let newest = null;
  let newestMtime = 0;
  let entries = [];
  try { entries = readdirSync(projectDir); } catch { return null; }
  for (const name of entries) {
    if (!SESSION_JSONL_RE.test(name)) continue;
    const full = join(projectDir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    if (st.mtimeMs >= newestMtime) {
      newestMtime = st.mtimeMs;
      newest = { path: full, session_id: basename(name, ".jsonl"), mtimeMs: st.mtimeMs, size: st.size };
    }
  }
  return newest;
}

function emptyCum() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    assistant_turns: 0,
    seen: new Set(),
    started_at: null,
    last_usage: null,
    session_id: null,
  };
}

function applyLine(state, line) {
  const raw = String(line || "").trim();
  if (!raw) return;
  let obj;
  try { obj = JSON.parse(raw); } catch { return; }
  if (!state.session_id && obj.sessionId) state.session_id = obj.sessionId;
  if (!state.started_at && obj.timestamp) state.started_at = obj.timestamp;
  const usage = usageFromRecord(obj);
  if (!usage) return;
  const key = usage.id || `${usage.timestamp}:${usage.output_tokens}:${usage.cache_read_tokens}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  state.input_tokens += usage.input_tokens;
  state.output_tokens += usage.output_tokens;
  state.cache_read_tokens += usage.cache_read_tokens;
  state.cache_write_tokens += usage.cache_write_tokens;
  state.assistant_turns += 1;
  state.last_usage = usage;
}

function readFromOffset(filePath, start) {
  const st = statSync(filePath);
  if (start <= 0) return readFileSync(filePath, "utf8");
  const len = st.size - start;
  if (len <= 0) return "";
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function scanTranscript(filePath) {
  const st = statSync(filePath);
  const prev = scanCache.get(filePath);
  const fresh = !prev || prev.size > st.size;
  const state = fresh ? emptyCum() : prev.state;
  const start = fresh ? 0 : prev.size;
  let chunk = readFromOffset(filePath, start);
  if (!fresh && prev.tailPartial) chunk = prev.tailPartial + chunk;
  const lines = chunk.split("\n");
  const tailPartial = chunk.endsWith("\n") || chunk === "" ? "" : (lines.pop() || "");
  for (const line of lines) applyLine(state, line);
  scanCache.set(filePath, {
    size: st.size,
    mtimeMs: st.mtimeMs,
    tailPartial,
    state,
  });
  return state;
}

export function claudeBillingJsonPath(configDir = claudeConfigDir()) {
  if (process.env.CLAUDE_HOME_JSON?.trim()) return process.env.CLAUDE_HOME_JSON.trim();
  return join(dirname(configDir), ".claude.json");
}

export function readClaudeBilling(configDir = claudeConfigDir()) {
  try {
    const j = JSON.parse(readFileSync(claudeBillingJsonPath(configDir), "utf8"));
    const oa = j?.oauthAccount || {};
    const orgType = oa.organizationType || null;
    const billingType = oa.billingType || null;
    const extra = oa.hasExtraUsageEnabled === true ? true : (oa.hasExtraUsageEnabled === false ? false : null);
    let mode = "unknown";
    if (orgType === "claude_max" || /max/i.test(String(oa.organizationRateLimitTier || ""))) {
      mode = "claude_max_subscription";
    } else if (billingType === "stripe_subscription") {
      mode = "claude_subscription";
    } else if (billingType) {
      mode = String(billingType);
    }
    return {
      mode,
      extra_usage_enabled: extra,
      organization_type: orgType,
    };
  } catch {
    return { mode: "unknown", extra_usage_enabled: null, organization_type: null };
  }
}

export function collectClaudeSessionTelemetry({
  cwd,
  configDir = claudeConfigDir(),
  nowMs = Date.now(),
} = {}) {
  const project = claudeProjectDir(cwd, configDir);
  if (!project) {
    return { ok: true, available: false, error: "no_cwd", provider: "claude" };
  }
  const latest = latestSessionJsonl(project);
  if (!latest) {
    return { ok: true, available: false, error: "transcript_not_found", provider: "claude" };
  }
  let state;
  try {
    state = scanTranscript(latest.path);
  } catch {
    return { ok: true, available: false, error: "transcript_unreadable", provider: "claude" };
  }
  const last = state.last_usage;
  const used = last ? contextUsedTokens(last) : null;
  const window = inferContextWindow(used);
  const billing = readClaudeBilling(configDir);
  const sessionId = state.session_id || latest.session_id;
  return {
    ok: true,
    available: true,
    provider: "claude",
    source: {
      kind: CLAUDE_TELEMETRY_SOURCE,
      stability: CLAUDE_TELEMETRY_STABILITY,
    },
    agent: {
      session_id: sessionId,
      model: last?.model || null,
      started_at: state.started_at,
      last_usage_at: last?.timestamp || null,
    },
    context: {
      used_tokens: used,
      max_tokens: window.max_tokens,
      max_source: window.max_source,
      percent_used: window.percent_used,
    },
    usage: {
      input_tokens: state.input_tokens,
      output_tokens: state.output_tokens,
      cache_read_tokens: state.cache_read_tokens,
      cache_write_tokens: state.cache_write_tokens,
      assistant_turns: state.assistant_turns,
    },
    cost: {
      reported_usd: null,
      estimated_usd: null,
      billing_mode: billing.mode,
      extra_usage_enabled: billing.extra_usage_enabled,
    },
    observed_at: new Date(nowMs).toISOString(),
  };
}

/**
 * Presentation-only: last assistant text in a Claude Code JSONL transcript.
 * Not Governor authority. Does not include tool/TUI chrome.
 */
export function extractAssistantText(obj) {
  if (!obj || typeof obj !== "object") return "";
  const msg = obj.message && typeof obj.message === "object" ? obj.message : obj;
  const role = msg.role || obj.role || (obj.type === "assistant" ? "assistant" : null);
  if (role !== "assistant" && obj.type !== "assistant") return "";
  const content = msg.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.filter((p) => p && p.type === "text" && p.text).map((p) => String(p.text)).join("\n").trim();
  }
  return "";
}

export function latestAssistantResponseFromTranscript(filePath, { maxChars = LATEST_RESPONSE_MAX_CHARS } = {}) {
  let raw;
  try { raw = readFileSync(filePath, "utf8"); } catch {
    return { available: false, error: "transcript_unreadable", text: null };
  }
  const cap = Number(maxChars) > 0 ? Number(maxChars) : LATEST_RESPONSE_MAX_CHARS;
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const text = extractAssistantText(ev);
    if (!text) continue;
    const truncated = text.length > cap;
    return {
      available: true,
      text: truncated ? text.slice(0, cap) : text,
      truncated,
      timestamp: ev.timestamp || null,
      session_id: ev.sessionId || ev.session_id || null,
      source: CLAUDE_TELEMETRY_SOURCE,
    };
  }
  return { available: false, error: "no_assistant_text", text: null };
}

/**
 * Newest worktree transcript wins. Bound session id is used only when that
 * file is at least as new as the latest jsonl (Claude may rotate files).
 */
export function collectLatestClaudeResponse({
  cwd,
  sessionId = null,
  configDir = claudeConfigDir(),
  maxChars = LATEST_RESPONSE_MAX_CHARS,
} = {}) {
  const project = claudeProjectDir(cwd, configDir);
  if (!project) return { available: false, error: "missing_cwd", text: null };
  const boundId = sessionId ? String(sessionId).trim() : "";
  const boundPath = boundId ? join(project, `${boundId}.jsonl`) : null;
  const latest = latestSessionJsonl(project);
  let file = latest?.path || null;
  let chosenId = latest?.session_id || null;
  if (boundPath && existsSync(boundPath)) {
    try {
      const st = statSync(boundPath);
      if (!latest || st.mtimeMs >= latest.mtimeMs) {
        file = boundPath;
        chosenId = boundId;
      }
    } catch { /* keep newest-by-mtime */ }
  }
  if (!file || !existsSync(file)) {
    return { available: false, error: "transcript_missing", text: null, session_id: boundId || chosenId };
  }
  const parsed = latestAssistantResponseFromTranscript(file, { maxChars });
  return {
    ...parsed,
    session_id: parsed.session_id || chosenId,
  };
}
