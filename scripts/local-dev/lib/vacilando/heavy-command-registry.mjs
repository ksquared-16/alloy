/**
 * Heavy-command ownership.
 *
 * THE DEFECT THIS EXISTS FOR. 198 commands were recorded as
 * "heavy_test: backgrounding — unclassifiable" and ran ungoverned. One of them
 * was `bash run-execution-durability-tests.sh 2>&1 | tail -6`. The pipeline
 * made it unclassifiable for ROUTING, and being unclassifiable for routing
 * meant nothing recorded WHO OWNED THE PROCESS GROUP. Its run ended; the group
 * survived; a `tail` sat blocked on the pipe holding the whole group open; and
 * a test spun at 95% CPU for four hours with nothing able to find it.
 *
 * ROUTING AND OWNERSHIP ARE DIFFERENT QUESTIONS. "Should this be brokered?" may
 * legitimately answer "I cannot tell". "Who owns this process group?" may not —
 * we always know which run spawned it. Conflating them is what let backgrounding
 * sever lifecycle ownership.
 *
 * So: EVERY heavy or backgroundable command is registered here, whatever the
 * router decided, and the registration carries the process group. When the
 * owning run reaches a terminal state, Host Steward can find the group and
 * reconcile it.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export const HEAVY_COMMAND_SCHEMA = "vacilando.heavy_command.v1";

/** Resource classes that must be registered even when routing cannot classify them. */
export const REGISTERED_CLASSES = Object.freeze([
  "heavy_test", "typecheck", "production_build", "browser_e2e", "machine_exclusive", "unclassifiable",
]);

/** Terminal dispositions a registration can end in. */
export const DISPOSITIONS = Object.freeze(["completed", "failed", "killed", "reconciled", "abandoned"]);

export function heavyCommandStorePath(root) {
  return join(root, "heavy-commands", "commands.json");
}

function readStore(root) {
  try {
    const j = JSON.parse(readFileSync(heavyCommandStorePath(root), "utf8"));
    return { schema_version: HEAVY_COMMAND_SCHEMA, commands: j.commands || {} };
  } catch { return { schema_version: HEAVY_COMMAND_SCHEMA, commands: {} }; }
}

function writeStore(root, store) {
  const p = heavyCommandStorePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

export function heavyCommandId({ runId, pgid, startedAt }) {
  return `hcmd_${createHash("sha256").update(`${runId}:${pgid}:${startedAt}`).digest("hex").slice(0, 14)}`;
}

/**
 * Register a heavy command's process group against its owning run.
 *
 * `pgid` is required and is the whole point: a PID identifies one process, and
 * the thing that survived was a GROUP. Registering only the pid would have
 * recorded the shell and missed the test.
 */
export function registerHeavyCommand({
  root, runId = null, laneId = null, pid = null, pgid = null,
  command = null, resourceClass = "unclassifiable", routingDecision = null,
  nowMs = Date.now(),
} = {}) {
  if (!root) return { ok: false, error: "missing_runtime_root" };
  if (pgid == null) return { ok: false, error: "missing_process_group" };
  if (!command) return { ok: false, error: "missing_command" };
  // A command with no owning run is still registered — as UNOWNED. Refusing to
  // record it is how the last one became invisible.
  const startedAt = new Date(nowMs).toISOString();
  const id = heavyCommandId({ runId: runId || "unowned", pgid, startedAt });
  const store = readStore(root);
  store.commands[id] = {
    schema_version: HEAVY_COMMAND_SCHEMA,
    id,
    run_id: runId || null,
    lane_id: laneId || null,
    pid: pid ?? null,
    pgid,
    command: String(command).slice(0, 500),
    resource_class: REGISTERED_CLASSES.includes(resourceClass) ? resourceClass : "unclassifiable",
    routing_decision: routingDecision || null,
    started_at: startedAt,
    last_progress_at: startedAt,
    disposition: null,
    disposition_at: null,
  };
  writeStore(root, store);
  return { ok: true, id, registration: store.commands[id] };
}

/** Progress heartbeat. Absence of a heartbeat is evidence, so it is recorded explicitly. */
export function heartbeatHeavyCommand({ root, id, nowMs = Date.now() } = {}) {
  const store = readStore(root);
  const rec = store.commands[id];
  if (!rec) return { ok: false, error: "unknown_heavy_command" };
  rec.last_progress_at = new Date(nowMs).toISOString();
  writeStore(root, store);
  return { ok: true, registration: rec };
}

/** Close a registration. A closed registration is never reconciled again. */
export function closeHeavyCommand({ root, id, disposition = "completed", nowMs = Date.now() } = {}) {
  const store = readStore(root);
  const rec = store.commands[id];
  if (!rec) return { ok: false, error: "unknown_heavy_command" };
  if (!DISPOSITIONS.includes(disposition)) return { ok: false, error: "invalid_disposition" };
  rec.disposition = disposition;
  rec.disposition_at = new Date(nowMs).toISOString();
  writeStore(root, store);
  return { ok: true, registration: rec };
}

export function listHeavyCommands({ root } = {}) {
  return Object.values(readStore(root).commands);
}

/**
 * Registrations whose owning run has ended and whose process group is still on
 * the host. This is the query that did not exist, and the reason a spinning
 * test could not be found by anything but a person reading `ps`.
 *
 * `runStateFor` resolves a run id to its state; `groupAlive` reports whether a
 * process group still has members. Both are injected so this stays pure.
 */
export function residualHeavyCommands({
  root, runStateFor = () => null, groupAlive = () => false, nowMs = Date.now(),
} = {}) {
  const out = [];
  for (const rec of listHeavyCommands({ root })) {
    if (rec.disposition) continue;
    if (!groupAlive(rec.pgid)) continue;
    const state = rec.run_id ? runStateFor(rec.run_id) : null;
    out.push({
      ...rec,
      owning_run_state: state,
      // An unresolvable run is NOT assumed terminal; the steward decides.
      owning_runs: rec.run_id ? (state ? [{ run_id: rec.run_id, state, updated_at: rec.started_at }] : null) : [],
      age_ms: nowMs - Date.parse(rec.started_at),
      progress_stale_ms: nowMs - Date.parse(rec.last_progress_at || rec.started_at),
    });
  }
  return out;
}

/**
 * Ingest a routing bypass as an ownership claim.
 *
 * The bridge from "we allowed this through ungoverned" to "we still know whose
 * it is". A bypass that cannot be owned is returned unregistered rather than
 * silently dropped, so the gap is visible instead of invisible.
 */
export function registerFromBypass({ root, record, nowMs = Date.now() } = {}) {
  if (!record) return { ok: false, error: "missing_bypass_record" };
  if (record.pgid == null) return { ok: false, error: "bypass_without_process_group", record };
  return registerHeavyCommand({
    root,
    runId: record.run_id || null,
    laneId: record.lane_id || null,
    pid: record.pid ?? null,
    pgid: record.pgid,
    command: record.command,
    resourceClass: record.kind === "typecheck" ? "typecheck"
      : record.kind === "production_build" ? "production_build" : "unclassifiable",
    routingDecision: record.decision || null,
    nowMs,
  });
}

/**
 * Turn a residual registration into a resource the steward can classify.
 * Kept here so the steward never has to know the registry's shape.
 */
export function asStewardResource(residual, { progressGraceMs = 10 * 60_000 } = {}) {
  return {
    id: residual.id,
    resourceClass: residual.resource_class === "typecheck" ? "typecheck_process"
      : residual.resource_class === "production_build" ? "build_process"
        : "test_process",
    alloyOwned: true,
    pid: residual.pid,
    pgid: residual.pgid,
    command: residual.command,
    owningRuns: residual.owning_runs,
    activeLeases: [],
    lastProgressAt: Date.parse(residual.last_progress_at || residual.started_at),
    progressGraceMs,
    lastTerminalAt: Date.parse(residual.started_at),
  };
}
