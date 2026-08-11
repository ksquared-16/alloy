/**
 * Progress board persistence + normalize (no assignment ledger deps).
 * Kept separate so worker-assignment can write without a circular import.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const RUNTIME = () =>
  process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(homedir(), ".local", "state", "alloy-dev");

function boardPath(missionId) {
  return join(RUNTIME(), "missions", missionId, "progress-board.json");
}

function clip(s, n = 160) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * Normalize a worker-supplied progress_board into a stable VM.
 */
export function normalizeProgressBoard(raw, { source = "worker", at = null } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const blocks = Array.isArray(raw.execution_blocks || raw.executionBlocks || raw.blocks)
    ? (raw.execution_blocks || raw.executionBlocks || raw.blocks).map((b, i) => ({
        id: String(b.id || b.key || `block_${i + 1}`),
        label: String(b.label || b.name || b.block || b.id || `Block ${i + 1}`),
        status: String(b.status || b.state || "unknown"),
        detail: clip(b.detail || b.notes || b.remaining || b.what || null, 220),
        percent: b.percent != null && Number.isFinite(Number(b.percent)) ? Number(b.percent) : null,
      }))
    : [];
  const workstreams = Array.isArray(raw.workstreams || raw.ws || raw.rows)
    ? (raw.workstreams || raw.ws || raw.rows).map((w, i) => ({
        id: String(w.id || w.ws || w.key || `ws_${i + 1}`),
        label: String(w.label || w.name || w.workstream || w.id || `WS${i + 1}`),
        status: String(w.status || w.state || "unknown"),
        approx: w.approx != null ? Number(w.approx) : (w.percent != null ? Number(w.percent) : null),
        detail: clip(w.detail || w.what || w.changed || w.remaining || null, 220),
      }))
    : [];
  const register = raw.register || raw.task_register || raw.tasks || null;
  let registerVm = null;
  if (register && typeof register === "object") {
    const items = Array.isArray(register.items || register.tasks)
      ? (register.items || register.tasks).map((t, i) => ({
          id: String(t.id || t.key || i + 1),
          status: String(t.status || (t.done ? "complete" : t.partial ? "partial" : "not_started")),
          label: clip(t.label || t.title || null, 80),
        }))
      : [];
    const done = Number(register.done ?? register.complete ?? items.filter((t) => /complete|done|✅/.test(t.status)).length);
    const total = Number(register.total ?? items.length);
    const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : (register.percent != null ? Number(register.percent) : null);
    registerVm = {
      label: String(register.label || "Task register"),
      done,
      total,
      percent: pct,
      line: clip(register.line || register.summary || (total ? `${done} / ${total} = ${pct}%` : null), 160),
      items,
    };
  }
  const migrations = raw.migrations || raw.migration_state || null;
  let migrationVm = null;
  if (migrations && typeof migrations === "object") {
    migrationVm = {
      branchFiles: migrations.branch_files ?? migrations.branchFiles ?? null,
      uniqueVersions: migrations.unique_versions ?? migrations.uniqueVersions ?? null,
      applied: migrations.applied ?? migrations.applied_cert_ledger_versions ?? migrations.appliedCertLedgerVersions ?? null,
      pending: migrations.pending ?? migrations.pending_cert_versions ?? migrations.pendingCertVersions ?? null,
      verifiedThrough: migrations.verified_through
        ?? migrations.verifiedThrough
        ?? migrations.real_schema_verified_through
        ?? migrations.realSchemaVerifiedThrough
        ?? null,
      collisions: migrations.collisions ?? migrations.known_version_collisions ?? migrations.knownVersionCollisions ?? null,
      detail: clip(migrations.detail || migrations.notes || null, 200),
    };
  }
  const headline = clip(raw.headline || raw.summary || raw.overall || null, 200);
  // Only use an explicit overall percent. Never invent Mission % from register denominator.
  const hasExplicitOverall = Object.prototype.hasOwnProperty.call(raw, "overall_percent")
    || Object.prototype.hasOwnProperty.call(raw, "overallPercent")
    || Object.prototype.hasOwnProperty.call(raw, "percent");
  const overallPercent = hasExplicitOverall
    ? (raw.overall_percent != null
      ? Number(raw.overall_percent)
      : (raw.overallPercent != null
        ? Number(raw.overallPercent)
        : (raw.percent != null ? Number(raw.percent) : null)))
    : null;

  if (!blocks.length && !workstreams.length && !registerVm && !migrationVm && !headline) {
    return null;
  }

  return {
    kind: "progress_board",
    source,
    at: at || new Date().toISOString(),
    headline,
    overallPercent: Number.isFinite(overallPercent) ? overallPercent : null,
    executionBlocks: blocks,
    workstreams,
    register: registerVm,
    migrations: migrationVm,
  };
}

export function readProgressBoard(missionId) {
  if (!missionId) return null;
  const p = boardPath(missionId);
  if (!existsSync(p)) return null;
  try {
    return normalizeProgressBoard(JSON.parse(readFileSync(p, "utf8")), { source: "persisted" });
  } catch {
    return null;
  }
}

export function writeProgressBoard(missionId, board) {
  if (!missionId || !board) return null;
  const normalized = normalizeProgressBoard(board, {
    source: board.source || "worker",
    at: board.at || new Date().toISOString(),
  });
  if (!normalized) return null;
  const dir = join(RUNTIME(), "missions", missionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(boardPath(missionId), JSON.stringify(normalized, null, 2));
  return normalized;
}
