/**
 * Vacilando Runtime — execution audit seam (Slice 5).
 *
 * A durable, append-only record of what the control plane DID — not a parallel
 * state database. Projection truth stays owned by the toolkit, git, and provider
 * state; this log stores only execution facts:
 *
 *   who/what initiated · which registered command · what it targeted ·
 *   the preview that was confirmed · when it ran · success/failure ·
 *   which authoritative sources refreshed afterward.
 *
 * Format: one JSON object per line (JSONL) under the runtime root. Append-only;
 * never rewritten. The executor is the only writer. Reads are for the audit
 * view; they never feed a projection.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const AUDIT_SCHEMA = "vacilando.audit.v1";

function auditRoot() {
  const root = process.env.ALLOY_RUNTIME_ROOT && process.env.ALLOY_RUNTIME_ROOT.trim()
    ? process.env.ALLOY_RUNTIME_ROOT
    : join(process.env.HOME || "", ".local", "state", "alloy-dev");
  return join(root, "vacilando");
}
export function auditPath() {
  return join(auditRoot(), "audit.jsonl");
}

/** Deterministic-ish event id from content + timestamp. */
function eventId(rec) {
  const h = createHash("sha256");
  h.update(`${rec.occurred_at}|${rec.command}|${rec.actor}|${JSON.stringify(rec.input || {})}|${rec.outcome}`);
  return "evt_" + h.digest("hex").slice(0, 20);
}

/**
 * Append one execution audit event. Returns the stored record (with id).
 * `rec` fields: actor, command, input, target, preview_summary, confirmed,
 * outcome ("succeeded"|"failed"|"refused"|"blocked"), exit, error,
 * sources_refreshed[]. `occurredAtMs` is normally injected (the executor reads
 * the clock); it defaults to now so an omitting caller loses no record.
 */
export function writeAuditEvent(rec, occurredAtMs = Date.now()) {
  // Defaulted, not required. Callers wrap this in a best-effort catch, so an
  // omitted timestamp did not surface as an error — it threw RangeError and
  // deleted the audit record. "Now" is the honest value for a caller that did
  // not carry one, and it cannot fail.
  const occurred_at = new Date(occurredAtMs).toISOString();
  const full = {
    schema_version: AUDIT_SCHEMA,
    occurred_at,
    actor: rec.actor || "operator",
    command: rec.command,
    input: sanitizeInput(rec.input),
    target: rec.target || null,
    preview_summary: rec.preview_summary || null,
    confirmed: rec.confirmed === true,
    outcome: rec.outcome,
    exit: rec.exit ?? null,
    error: rec.error || null,
    sources_refreshed: rec.sources_refreshed || [],
  };
  full.id = eventId(full);
  const dir = dirname(auditPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(auditPath(), JSON.stringify(full) + "\n", "utf8");
  return full;
}

/** Never persist anything secret-shaped from a command payload. */
function sanitizeInput(input) {
  if (!input || typeof input !== "object") return input ?? null;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (/secret|password|token|key/i.test(k)) { out[k] = "[redacted]"; continue; }
    out[k] = typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
  }
  return out;
}

/** Read the most recent audit events (newest first). Never throws. */
export function readAuditEvents(limit = 50) {
  try {
    const text = readFileSync(auditPath(), "utf8");
    const lines = text.split("\n").filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try { out.push(JSON.parse(lines[i])); } catch { /* skip corrupt line */ }
    }
    return out;
  } catch {
    return [];
  }
}
