/**
 * Cursor IDE / cursor-agent transcript adapter (read-only).
 *
 * Source: ~/.cursor/projects/<encoded-cwd>/agent-transcripts/
 * Stability: SEMI-STABLE — local session files Cursor already writes.
 * Isolated so Gateway UI never reads Cursor paths directly.
 *
 * Does not spawn cursor-agent, attach tmux, or mutate transcripts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { extractAssistantText } from "../claude/telemetry.mjs";

export const CURSOR_TELEMETRY_SOURCE = "cursor_agent_transcript";
export const LATEST_RESPONSE_MAX_CHARS = 64 * 1024;
const SESSION_DIR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_JSONL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;

export function cursorProjectsDir() {
  return process.env.CURSOR_PROJECTS_DIR?.trim() || join(homedir(), ".cursor", "projects");
}

/** `/Users/Kelly/Code/foo` → `Users-Kelly-Code-foo` (Cursor project folder). */
export function encodeCursorProjectDir(cwd) {
  const raw = String(cwd || "").trim().replace(/\\/g, "/");
  if (!raw) return null;
  return raw.replace(/^\/+/, "").replace(/\//g, "-");
}

export function cursorProjectDir(cwd, projectsDir = cursorProjectsDir()) {
  const enc = encodeCursorProjectDir(cwd);
  if (!enc) return null;
  return join(projectsDir, enc);
}

export function cursorTranscriptsDir(cwd, projectsDir = cursorProjectsDir()) {
  const project = cursorProjectDir(cwd, projectsDir);
  if (!project) return null;
  return join(project, "agent-transcripts");
}

function jsonlCandidates(root) {
  if (!root || !existsSync(root)) return [];
  const out = [];
  let names;
  try { names = readdirSync(root); } catch { return []; }
  for (const name of names) {
    const full = join(root, name);
    if (SESSION_JSONL_RE.test(name)) {
      out.push({ path: full, session_id: basename(name, ".jsonl") });
      continue;
    }
    if (!SESSION_DIR_RE.test(name)) continue;
    const nested = join(full, `${name}.jsonl`);
    if (existsSync(nested)) out.push({ path: nested, session_id: name });
  }
  return out;
}

export function latestCursorTranscript(cwd, { sessionId = null, projectsDir = cursorProjectsDir() } = {}) {
  const root = cursorTranscriptsDir(cwd, projectsDir);
  const files = jsonlCandidates(root);
  if (!files.length) return null;
  const boundId = sessionId ? String(sessionId).trim() : "";
  let best = null;
  for (const file of files) {
    let mtimeMs = 0;
    try { mtimeMs = statSync(file.path).mtimeMs; } catch { continue; }
    const rec = { ...file, mtimeMs };
    if (boundId && rec.session_id === boundId) {
      if (!best || best.session_id !== boundId || mtimeMs >= best.mtimeMs) best = rec;
      continue;
    }
    if (best?.session_id === boundId) continue;
    if (!best || mtimeMs >= best.mtimeMs) best = rec;
  }
  return best;
}

export function latestAssistantResponseFromCursorTranscript(filePath, { maxChars = LATEST_RESPONSE_MAX_CHARS } = {}) {
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
      timestamp: ev.timestamp || ev.message?.timestamp || null,
    };
  }
  return { available: false, error: "no_assistant_text", text: null };
}

export function collectLatestCursorResponse({
  cwd,
  sessionId = null,
  projectsDir = cursorProjectsDir(),
  maxChars = LATEST_RESPONSE_MAX_CHARS,
} = {}) {
  const latest = latestCursorTranscript(cwd, { sessionId, projectsDir });
  if (!latest?.path) {
    return { available: false, error: "transcript_missing", text: null, session_id: sessionId || null };
  }
  const parsed = latestAssistantResponseFromCursorTranscript(latest.path, { maxChars });
  return {
    ...parsed,
    session_id: parsed.session_id || latest.session_id || sessionId || null,
    mtime_ms: latest.mtimeMs,
    source: CURSOR_TELEMETRY_SOURCE,
  };
}
