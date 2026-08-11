/**
 * Vacilando progress board — operator-facing status matrix.
 *
 * This is the "where do we stand?" surface: execution blocks, workstream rows,
 * register fraction, optional migration ledger. Workers emit it in
 * vacilando-report.progress_board; Director persists the latest per mission and
 * the UI renders it in the Status rail and review card.
 *
 * Never invent completion — derive only from worker-supplied board + assignment
 * ledger when the worker omitted it.
 */
import { listAssignments } from "./worker-assignment.mjs";
import {
  normalizeProgressBoard,
  readProgressBoard,
  writeProgressBoard,
} from "./progress-board-store.mjs";

export {
  normalizeProgressBoard,
  readProgressBoard,
  writeProgressBoard,
};

/**
 * Derive a coarse board from the assignment ledger when the worker did not emit one.
 */
export function deriveProgressBoardFromAssignments(missionId) {
  const asgs = listAssignments(missionId) || [];
  if (!asgs.length) return null;
  const terminal = new Set(["complete", "accepted", "cancelled"]);
  const partial = new Set(["verification", "blocked", "failed", "ready", "running", "active", "dispatched"]);
  const items = asgs.map((a, i) => {
    const st = String(a.status || "").toLowerCase();
    let status = "not_started";
    if (terminal.has(st)) status = st === "cancelled" ? "cancelled" : "complete";
    else if (partial.has(st)) status = st === "blocked" || st === "failed" ? st : "partial";
    return {
      id: a.phaseId || a.assignmentId || `t${i + 1}`,
      label: a.title || a.phaseId || `Task ${i + 1}`,
      status,
    };
  });
  const done = items.filter((t) => t.status === "complete").length;
  const total = items.length;
  const percent = total ? Math.round((done / total) * 1000) / 10 : null;
  const blocks = [
    {
      id: "implementation_register",
      label: "Implementation register",
      status: done === total ? "Complete" : (done === 0 ? "Not started" : `~${percent}%`),
      detail: `${done} of ${total} assignments closed`,
      percent,
    },
  ];
  const workstreams = items.map((t) => ({
    id: t.id,
    label: t.label,
    status: t.status,
    approx: t.status === "complete" ? 100 : (t.status === "partial" ? 50 : 0),
    detail: null,
  }));
  return normalizeProgressBoard({
    headline: `${done} / ${total} current-work assignments closed`,
    // Never treat register fraction as Mission overall %.
    overall_percent: null,
    execution_blocks: blocks,
    workstreams,
    register: {
      label: "Current work",
      done,
      total,
      percent,
      line: `${done} / ${total} assignments complete`,
      items,
    },
  }, { source: "derived_assignments" });
}

/**
 * Resolve the board to show: explicit worker board > persisted > derived.
 */
export function resolveProgressBoard(missionId, { report = null } = {}) {
  const fromReport = normalizeProgressBoard(
    report?.progressBoard || report?.progress_board || null,
    { source: "completion_report", at: report?.at || null },
  );
  if (fromReport) {
    writeProgressBoard(missionId, fromReport);
    return fromReport;
  }
  return readProgressBoard(missionId) || deriveProgressBoardFromAssignments(missionId);
}

/** Presentation VM for Status rail / review card. */
export function progressBoardVm(missionId, { report = null } = {}) {
  const board = resolveProgressBoard(missionId, { report });
  if (!board) return null;
  return {
    kind: "progress_board_vm",
    headline: board.headline,
    overallPercent: board.overallPercent,
    overallLabel: board.overallPercent != null ? `${board.overallPercent}%` : null,
    source: board.source,
    at: board.at,
    executionBlocks: board.executionBlocks,
    workstreams: board.workstreams,
    register: board.register,
    migrations: board.migrations,
    hasDepth: Boolean(
      board.executionBlocks.length
      || board.workstreams.length
      || board.register
      || board.migrations,
    ),
  };
}
