/**
 * Trusted Host Actions — privileged host-side execution runtime.
 *
 * Workers may request; workers never receive credentials.
 * Director authorizes; this runtime executes outside the managed sandbox.
 */
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  ACTION_TYPES,
  DEFAULT_TARGET,
  getActionDefinition,
  listRegisteredActions,
  directorRegistryFreshness,
  resolveCanonicalRepoRoot,
  resolveTrustedServerEnvSource,
  findRepoRoot,
  hashSql,
  resolveArtifactRoot,
  sqlFromCensusArtifact,
} from "./trusted-host-action-registry.mjs";
import {
  findAuthorization,
  markAuthorizationUsed,
  recognizePriorCensusAuthorization,
  listAuthorizations,
  databaseTargetFingerprint,
} from "./trusted-host-authz.mjs";
import {
  mergePullRequest,
  publicMergeResult,
} from "./trusted-host-merge.mjs";
import {
  applyMigrationBatch,
  publicMigrationResult,
  APPLY_MIGRATION_SH,
  readMigrationContent,
  ledgerLookupSql,
} from "./trusted-host-migrate.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { attachEvidence } from "./evidence.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const STORE_DIR = join(RUNTIME_ROOT, "vacilando", "trusted-host-actions");
const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_SQL_SH = join(HERE, "trusted-host-run-sql.sh");
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir(p = STORE_DIR) {
  mkdirSync(p, { recursive: true });
}

function newActionId() {
  return `tha_${randomBytes(7).toString("hex")}`;
}

/**
 * Trusted-host SQL stdout → census object.
 * Accepts a single JSON document (wave0) or Q15 labeled rows:
 *   BEGIN
 *   Q15-A1|row_count|{"row_count": 0}
 *   Q15-A1|row|{...}
 *   COMMIT
 */
export function parseTrustedHostSqlOutput(outText) {
  const stripped = String(outText || "").trim();
  if (!stripped) return null;
  try {
    return JSON.parse(stripped);
  } catch { /* fall through */ }
  const blob = stripped.match(/\{[\s\S]*\}/);
  if (blob && !/^[A-Za-z0-9_.-]+\|/.test(stripped.split(/\r?\n/).find((l) => l.includes("|")) || "")) {
    try {
      return JSON.parse(blob[0]);
    } catch { /* labeled rows below */ }
  }
  const rows = [];
  for (const line of stripped.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t === "BEGIN" || t === "COMMIT" || t === "ROLLBACK") continue;
    const i1 = t.indexOf("|");
    const i2 = i1 >= 0 ? t.indexOf("|", i1 + 1) : -1;
    if (i2 < 0) continue;
    const questionId = t.slice(0, i1).trim();
    const kind = t.slice(i1 + 1, i2).trim();
    const payloadRaw = t.slice(i2 + 1);
    let payload = payloadRaw;
    try { payload = JSON.parse(payloadRaw); } catch { /* keep string */ }
    if (!questionId) continue;
    rows.push({ question_id: questionId, kind, payload });
  }
  if (!rows.length) return null;
  const questions = {};
  for (const r of rows) {
    const q = questions[r.question_id] || { question_id: r.question_id, row_count: null, rows: [] };
    if (r.kind === "row_count") {
      q.row_count = r.payload && typeof r.payload === "object" && "row_count" in r.payload
        ? r.payload.row_count
        : r.payload;
    } else {
      q.rows.push(r.payload);
    }
    questions[r.question_id] = q;
  }
  return {
    format: "q15_labeled_rows",
    census_run_at: new Date().toISOString(),
    question_ids: Object.keys(questions),
    questions,
    row_count: rows.length,
  };
}

function storePath(actionId) {
  return join(STORE_DIR, `${actionId}.json`);
}

function indexPath(missionId) {
  return join(STORE_DIR, `index_${missionId}.json`);
}

function readAction(actionId) {
  const p = storePath(actionId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeAction(action) {
  ensureDir();
  writeFileSync(storePath(action.id), JSON.stringify(action, null, 2));
  const idxP = indexPath(action.missionId);
  let idx = { missionId: action.missionId, ids: [] };
  if (existsSync(idxP)) {
    try { idx = JSON.parse(readFileSync(idxP, "utf8")); } catch { /* */ }
  }
  if (!idx.ids.includes(action.id)) idx.ids.push(action.id);
  writeFileSync(idxP, JSON.stringify(idx, null, 2));
  return action;
}

export function listTrustedHostActions(missionId = null) {
  ensureDir();
  if (!missionId) return [];
  const idxP = indexPath(missionId);
  if (!existsSync(idxP)) return [];
  const idx = JSON.parse(readFileSync(idxP, "utf8"));
  return (idx.ids || []).map(readAction).filter(Boolean);
}

export function getTrustedHostAction(actionId) {
  return readAction(actionId);
}

function redactSecrets(text) {
  return String(text || "")
    .replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(/postgres:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted_jwt]");
}

function buildAudit(action, extra = {}) {
  return {
    actionId: action.id,
    missionId: action.missionId,
    assignmentId: action.assignmentId,
    executionSessionId: action.executionSessionId,
    actionType: action.actionType,
    authorizationId: action.authorizationId,
    authorizingOperator: extra.authorizingOperator || null,
    databaseTarget: action.inputs?.databaseTarget,
    databaseTargetFingerprint: databaseTargetFingerprint(action.inputs?.databaseTarget),
    queryArtifactPath: action.inputs?.queryArtifactPath,
    queryHash: action.inputs?.queryHash,
    validationResult: action.inputs?.validation || null,
    started_at: action.started_at,
    completed_at: action.completed_at,
    rowCount: extra.rowCount ?? null,
    outputArtifactPath: extra.outputArtifactPath || null,
    success: extra.success === true,
    failureCode: extra.failureCode || null,
    retryHistory: action.retryState || null,
  };
}

export function requestTrustedHostAction({
  missionId,
  assignmentId = null,
  executionSessionId = null,
  requestedBy = "director",
  actionType,
  inputs = {},
  nowMs,
} = {}) {
  if (!missionId || !actionType) return { ok: false, error: "missing_fields" };
  const def = getActionDefinition(actionType);
  if (!def) return { ok: false, error: "unknown_action_type", actionType };

  const validated = def.validateInputs(inputs);
  if (!validated.ok) {
    return { ok: false, error: "input_validation_failed", validation: validated };
  }

  const dedupeKey = validated.normalized.dedupeKey
    || validated.normalized.queryHash
    || null;
  // Dedupe in-flight / completed only — failed actions may be retried.
  const existing = listTrustedHostActions(missionId).find((a) =>
    a.actionType === actionType
    && (dedupeKey
      ? (a.inputs?.dedupeKey === dedupeKey || a.inputs?.queryHash === dedupeKey)
      : a.inputs?.queryHash === validated.normalized.queryHash)
    && ["requested", "policy_review", "authorized", "executing", "completed", "retrying"].includes(a.state));
  if (existing) {
    return { ok: true, action: existing, deduped: true };
  }

  const action = {
    schema_version: "vacilando.trusted_host_action.v1",
    id: newActionId(),
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy,
    actionType,
    actionVersion: def.version,
    requestedInputs: { ...validated.normalized },
    inputs: { ...validated.normalized },
    policyClassification: def.riskClass,
    authorizationState: "pending",
    authorizationId: null,
    executionState: "not_started",
    state: "requested",
    hostProcess: null,
    started_at: null,
    completed_at: null,
    result: null,
    evidence: [],
    audit: null,
    failureReason: null,
    retryState: { attempts: 0, maxAttempts: def.retry?.maxAttempts ?? 1 },
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
  };
  writeAction(action);
  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: "Director prepared a Trusted Host Action",
      summary: `${def.title} requested — credentials stay on the trusted host.`,
      visibility: "summary",
      actor: "director",
      detail: { trustedHostActionId: action.id, actionType },
      nowMs,
    });
  } catch { /* optional */ }
  return { ok: true, action, normalized: validated.normalized };
}

export function authorizeTrustedHostAction(actionId, {
  actor = "operator",
  authorizationId = null,
  nowMs,
} = {}) {
  const action = readAction(actionId);
  if (!action) return { ok: false, error: "not_found" };
  let auth = null;
  if (authorizationId) {
    auth = listAuthorizations(action.missionId).find((a) => a.authorizationId === authorizationId) || null;
  } else {
    auth = findAuthorization({
      missionId: action.missionId,
      actionType: action.actionType,
      databaseTarget: action.inputs?.databaseTarget
        || action.inputs?.environment
        || action.inputs?.targetBranch
        || action.inputs?.target_branch
        || DEFAULT_TARGET,
      queryHash: action.inputs?.queryHash
        || action.inputs?.expectedHeadSha
        || action.inputs?.expected_head_sha
        || action.inputs?.expectedSha
        || action.inputs?.expected_sha
        || action.inputs?.dedupeKey
        || null,
      actionRequestId: action.id,
      nowMs: nowMs ?? Date.now(),
    });
  }
  if (!auth) {
    action.state = "policy_review";
    action.authorizationState = "required";
    action.updated_at = iso(nowMs);
    writeAction(action);
    return { ok: false, error: "authorization_required", action };
  }
  action.state = "authorized";
  action.authorizationState = "authorized";
  action.authorizationId = auth.authorizationId;
  action.updated_at = iso(nowMs);
  writeAction(action);
  return { ok: true, action, authorization: auth };
}

export function executeTrustedHostAction(actionId, { actor = "director", nowMs } = {}) {
  let action = readAction(actionId);
  if (!action) return { ok: false, error: "not_found" };
  if (action.state === "completed") return { ok: true, action, already: true };

  if (action.actionType === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST) {
    return executeMergeTrustedHostAction(action, { actor, nowMs });
  }
  if (action.actionType === ACTION_TYPES.DATABASE_APPLY_MIGRATION) {
    return executeMigrationTrustedHostAction(action, { actor, nowMs });
  }
  if (action.actionType !== ACTION_TYPES.DATABASE_READ_CENSUS) {
    return { ok: false, error: "unknown_action_type", actionType: action.actionType };
  }

  const authz = authorizeTrustedHostAction(actionId, { actor, nowMs });
  if (!authz.ok) return authz;
  action = authz.action;

  const absSqlArtifact = action.inputs.queryArtifactAbsolute
    || join(action.inputs.artifactRoot || resolveArtifactRoot(action.inputs), action.inputs.queryArtifactPath);
  let sql = null;
  const rawSql = readFileSync(absSqlArtifact, "utf8");
  sql = sqlFromCensusArtifact(rawSql, absSqlArtifact);
  if (hashSql(sql) !== action.inputs.queryHash) {
    action.state = "failed";
    action.failureReason = "query_hash_mismatch";
    action.completed_at = iso(nowMs);
    action.audit = buildAudit(action, { success: false, failureCode: "query_hash_mismatch" });
    writeAction(action);
    return { ok: false, error: "query_hash_mismatch", action };
  }

  const tmpDir = join(STORE_DIR, "tmp");
  ensureDir(tmpDir);
  const sqlFile = join(tmpDir, `${action.id}.sql`);
  const outFile = join(tmpDir, `${action.id}.out`);
  const errFile = join(tmpDir, `${action.id}.err`);
  writeFileSync(sqlFile, sql.endsWith(";") ? sql : `${sql};`);

  action.state = "executing";
  action.executionState = "executing";
  action.started_at = iso(nowMs);
  action.hostProcess = { kind: "trusted-host-run-sql" };
  action.retryState.attempts = (action.retryState.attempts || 0) + 1;
  action.updated_at = iso(nowMs);
  writeAction(action);

  try {
    appendTimelineEvent(action.missionId, {
      type: "progress",
      headline: "Director is running an approved database census",
      summary: "Trusted Host Action executing on the control-plane host — worker still has no credentials.",
      visibility: "summary",
      actor: "director",
      detail: { trustedHostActionId: action.id },
      nowMs,
    });
  } catch { /* */ }

  if (!existsSync(RUN_SQL_SH)) {
    action.state = "failed";
    action.failureReason = "host_runtime_missing";
    action.completed_at = iso(nowMs);
    writeAction(action);
    return { ok: false, error: "host_runtime_missing", action };
  }
  try { chmodSync(RUN_SQL_SH, 0o755); } catch { /* */ }

  const originatingRoot = action.inputs.artifactRoot
    || action.inputs.worktreePath
    || resolveArtifactRoot(action.inputs);
  const hostCheckout = findRepoRoot();
  const canonical = resolveCanonicalRepoRoot();
  const envSource = resolveTrustedServerEnvSource();
  const child = spawnSync("bash", [RUN_SQL_SH, sqlFile, outFile, errFile], {
    env: {
      ...process.env,
      ALLOY_CANONICAL_ROOT: canonical,
      ALLOY_REPO: canonical,
      ALLOY_SERVER_ENV_SOURCE: envSource,
      // Toolkit + credentials stay on the Director/canonical host.
      // Do not point these at the originating lane — Identity has no DATABASE_URL.
      VACILANDO_CHECKOUT: hostCheckout,
      ALLOY_WORKTREE: hostCheckout,
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
    },
    timeout: action.inputs.timeoutMs || 180_000,
    encoding: "utf8",
  });

  const errText = redactSecrets(
    (existsSync(errFile) ? readFileSync(errFile, "utf8") : "") || child.stderr || "",
  );
  const outText = existsSync(outFile) ? readFileSync(outFile, "utf8").trim() : "";
  try { unlinkSync(sqlFile); } catch { /* */ }

  if (child.status !== 0) {
    const code = /trusted_credential_unavailable/.test(errText)
      ? "trusted_credential_unavailable"
      : (child.error?.code === "ETIMEDOUT" ? "timeout" : "execution_failed");
    const transient = code === "timeout" || /could not connect|timeout|Connection refused/i.test(errText);
    action.failureReason = code;
    action.executionState = "failed";
    action.completed_at = iso(nowMs);
    action.audit = buildAudit(action, {
      success: false,
      failureCode: code,
      authorizingOperator: authz.authorization?.granted_by || null,
    });
    action.state = (transient && action.retryState.attempts < (action.retryState.maxAttempts || 1))
      ? "retrying"
      : "failed";
    action.updated_at = iso(nowMs);
    writeAction(action);
    try {
      appendTimelineEvent(action.missionId, {
        type: "progress",
        headline: code === "trusted_credential_unavailable"
          ? "Trusted credential unavailable on the host"
          : "Database census failed",
        summary: redactSecrets(errText).slice(0, 240) || "Host execution failed.",
        visibility: "summary",
        actor: "director",
        detail: { trustedHostActionId: action.id, code },
        nowMs,
      });
    } catch { /* */ }
    return { ok: false, error: code, detail: redactSecrets(errText).slice(0, 500), action };
  }

  const resultObj = parseTrustedHostSqlOutput(outText);
  if (!resultObj) {
    action.state = "failed";
    action.failureReason = "result_parse_failed";
    action.completed_at = iso(nowMs);
    action.audit = buildAudit(action, { success: false, failureCode: "result_parse_failed" });
    writeAction(action);
    return { ok: false, error: "result_parse_failed", action };
  }

  const queryRel = action.inputs.queryArtifactPath
    || "docs/platform/planning/vacilando-os/qa/access-identity-v2/wave0-authority-census.json";
  const evidenceRel = String(queryRel).replace(/\.json$/i, "") + ".results.json";
  const storeEvidenceAbs = join(STORE_DIR, `${action.id}.results.json`);
  try {
    writeFileSync(storeEvidenceAbs, JSON.stringify({
      trusted_host_action_id: action.id,
      query_hash: action.inputs.queryHash,
      results: resultObj,
    }, null, 2));
  } catch { /* action.result still holds the census */ }
  const evidenceAbs = join(originatingRoot, evidenceRel);
  try {
    mkdirSync(dirname(evidenceAbs), { recursive: true });
    if (existsSync(evidenceAbs) && evidenceAbs.endsWith(".json")) {
      try {
        const prior = JSON.parse(readFileSync(evidenceAbs, "utf8"));
        const merged = {
          ...prior,
          status: "executed",
          query_hash: action.inputs.queryHash,
          execution: {
            ...(prior.execution || {}),
            executed: true,
            executed_at: iso(nowMs),
            executed_by: "trusted_host_action",
            trusted_host_action_id: action.id,
            authorization_id: action.authorizationId,
            query_hash: action.inputs.queryHash,
            database_target: action.inputs.databaseTarget,
            database_target_fingerprint: databaseTargetFingerprint(action.inputs.databaseTarget),
            blocker: null,
          },
          results: resultObj,
        };
        writeFileSync(evidenceAbs, JSON.stringify(merged, null, 2));
      } catch {
        writeFileSync(evidenceAbs, JSON.stringify({
          trusted_host_action_id: action.id,
          query_hash: action.inputs.queryHash,
          results: resultObj,
        }, null, 2));
      }
    } else {
      writeFileSync(evidenceAbs, JSON.stringify({
        trusted_host_action_id: action.id,
        query_hash: action.inputs.queryHash,
        results: resultObj,
      }, null, 2));
    }
  } catch {
    /* originating worktree write is best-effort; Director store holds the result */
  }

  const auditPath = join(STORE_DIR, `${action.id}.audit.json`);
  const audit = buildAudit(action, {
    success: true,
    rowCount: 1,
    outputArtifactPath: evidenceRel,
    authorizingOperator: authz.authorization?.granted_by || null,
  });
  writeFileSync(auditPath, JSON.stringify(audit, null, 2));

  action.state = "completed";
  action.executionState = "completed";
  action.completed_at = iso(nowMs);
  action.result = {
    databaseTarget: action.inputs.databaseTarget,
    queryHash: action.inputs.queryHash,
    rowCount: 1,
    census: resultObj,
    evidencePath: evidenceRel,
  };
  action.evidence = [
    { type: "query_artifact", path: action.inputs.queryArtifactPath },
    { type: "query_hash", value: action.inputs.queryHash },
    { type: "validation_report", value: action.inputs.validation },
    { type: "result_json", path: evidenceRel },
    { type: "execution_audit", path: auditPath },
  ];
  action.audit = audit;
  action.failureReason = null;
  action.updated_at = iso(nowMs);
  writeAction(action);
  markAuthorizationUsed(action.missionId, action.authorizationId, { nowMs });

  try {
    attachEvidence({
      missionId: action.missionId,
      assignmentId: action.assignmentId,
      type: "database",
      title: "Wave 0 authority census results (Trusted Host Action)",
      description: "Read-only deployed-database census completed on the trusted host. No credentials entered the worker.",
      fileUri: evidenceRel,
      acceptanceCriteriaIds: ["AC_W0"],
      createdBy: "director",
      nowMs,
    });
  } catch { /* */ }

  try {
    appendTimelineEvent(action.missionId, {
      type: "evidence_added",
      headline: "Database census completed",
      summary: "Results returned to Claude. Paused work can resume.",
      visibility: "summary",
      actor: "director",
      detail: { trustedHostActionId: action.id, evidencePath: evidenceRel },
      nowMs,
    });
  } catch { /* */ }

  return { ok: true, action, result: action.result, audit };
}

/**
 * Director path: request → recognize prior auth → authorize → execute.
 */
export function fulfillDatabaseCensusForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  queryArtifactPath = "docs/platform/planning/vacilando-os/qa/access-identity-v2/wave0-authority-census.json",
  worktreePath = null,
  actor = "director",
  nowMs,
} = {}) {
  recognizePriorCensusAuthorization(missionId, { nowMs });

  const req = requestTrustedHostAction({
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy: actor,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    inputs: {
      queryArtifactPath,
      databaseTarget: DEFAULT_TARGET,
      worktreePath,
    },
    nowMs,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) {
    return { ok: true, action: req.action, already: true };
  }

  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs });
  if (!auth.ok) {
    return {
      ok: false,
      error: "authorization_required",
      action: auth.action,
      decisionNeeded: {
        title: "Authorize read-only database census for this mission",
        recommendation: "Authorize read-only database census for this mission.",
        whatDirectorWillDo: [
          "validate the committed query",
          "run it through the trusted host",
          "store the result as evidence",
          "resume Claude",
        ],
      },
    };
  }

  return executeTrustedHostAction(req.action.id, { actor, nowMs });
}

export function trustedHostDiagnostics() {
  const envSource = resolveTrustedServerEnvSource();
  const credentialFilePresent = existsSync(envSource);
  ensureDir();
  const recentFailures = [];
  let lastSuccess = null;
  const activeActions = [];
  try {
    for (const f of fsReaddirSafe()) {
      try {
        const a = JSON.parse(readFileSync(join(STORE_DIR, f), "utf8"));
        if (["requested", "policy_review", "authorized", "executing", "retrying"].includes(a.state)) {
          activeActions.push({ id: a.id, state: a.state, actionType: a.actionType });
        }
        if (a.state === "failed") {
          recentFailures.push({ id: a.id, reason: a.failureReason, at: a.completed_at });
        }
        if (a.state === "completed") {
          if (!lastSuccess || Date.parse(a.completed_at || 0) > Date.parse(lastSuccess.at || 0)) {
            lastSuccess = { id: a.id, at: a.completed_at, actionType: a.actionType };
          }
        }
      } catch { /* */ }
    }
  } catch { /* */ }

  return {
    kind: "trusted_host_diagnostics",
    hostRuntimeAvailable: existsSync(RUN_SQL_SH),
    databaseCredentialAvailable: credentialFilePresent,
    approvedDatabaseTarget: DEFAULT_TARGET,
    registeredActions: listRegisteredActions(),
    activeActions,
    recentFailures: recentFailures.slice(-10),
    lastSuccessfulAction: lastSuccess,
    note: "Secret values are never displayed.",
    directorCapabilities: (() => {
      try {
        const live = directorRegistryFreshness();
        return {
          stale: live.stale,
          loaded_fingerprint: live.loaded.fingerprint,
          current_fingerprint: live.disk.fingerprint,
          loaded_action_keys: live.loaded.actionKeys,
          current_action_keys: live.disk.actionKeys,
        };
      } catch {
        return null;
      }
    })(),
  };
}

function fsReaddirSafe() {
  return readdirSync(STORE_DIR).filter((f) => f.startsWith("tha_") && f.endsWith(".json"));
}

/**
 * After control-plane restart: stuck "executing" actions cannot be trusted mid-flight.
 * Mark them failed for safe retry (dedupe excludes failed). Never re-expose credentials.
 */
export function reconcileTrustedHostActionsOnBoot({ nowMs } = {}) {
  ensureDir();
  const interrupted = [];
  for (const f of fsReaddirSafe()) {
    try {
      const a = JSON.parse(readFileSync(join(STORE_DIR, f), "utf8"));
      if (a.state === "executing" || a.state === "retrying") {
        a.state = "failed";
        a.executionState = "interrupted_by_restart";
        a.failureReason = {
          code: "host_restart",
          detail: "Control plane restarted while Trusted Host Action was in flight. Safe to retry.",
        };
        a.completed_at = iso(nowMs);
        a.updated_at = iso(nowMs);
        writeAction(a);
        interrupted.push(a.id);
        try {
          appendTimelineEvent(a.missionId, {
            type: "progress",
            headline: "Trusted Host Action interrupted by restart",
            summary: "Director will not ask for Terminal workarounds. Retry the registered action.",
            visibility: "summary",
            actor: "director",
            detail: { trustedHostActionId: a.id },
            nowMs,
          });
        } catch { /* */ }
      }
    } catch { /* */ }
  }
  return { interrupted };
}

let mergeGhForTests = null;
let migrationRunnersForTests = null;

export function setTrustedHostMergeGhForTests(fn) {
  mergeGhForTests = typeof fn === "function" ? fn : null;
}

export function setTrustedHostMigrationRunnersForTests(runners = null) {
  migrationRunnersForTests = runners;
}

function payloadHasSecrets(value) {
  const text = typeof value === "string" ? value : (() => {
    try { return JSON.stringify(value); } catch { return ""; }
  })();
  return /postgresql:\/\/|postgres:\/\/|DATABASE_URL|ghp_[A-Za-z0-9]|github_pat_/i.test(text);
}

function failTrustedAction(action, code, detail, { nowMs } = {}) {
  action.state = "failed";
  action.executionState = "failed";
  action.failureReason = code;
  action.completed_at = iso(nowMs);
  action.updated_at = iso(nowMs);
  action.result = { ok: false, code, detail: redactSecrets(detail || code).slice(0, 400) };
  writeAction(action);
  return { ok: false, error: code, detail: action.result.detail, action };
}

function completeTrustedAction(action, result, { nowMs } = {}) {
  action.state = "completed";
  action.executionState = "completed";
  action.completed_at = iso(nowMs);
  action.updated_at = iso(nowMs);
  action.result = result;
  action.failureReason = null;
  writeAction(action);
  return { ok: true, action, result };
}

export function executeMergeTrustedHostAction(action, { actor = "director", nowMs } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const out = mergePullRequest(action.inputs, mergeGhForTests ? { gh: mergeGhForTests } : {});
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Merge result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    return failTrustedAction(action, out?.code || "merge_failed", out?.detail || "Merge failed", { nowMs });
  }
  return completeTrustedAction(action, publicMergeResult(out), { nowMs });
}

function defaultInspectLedger({ version }) {
  const tmpDir = join(STORE_DIR, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const sqlFile = join(tmpDir, `ledger-${version}.sql`);
  const outFile = join(tmpDir, `ledger-${version}.out`);
  const errFile = join(tmpDir, `ledger-${version}.err`);
  writeFileSync(sqlFile, ledgerLookupSql(version));
  try { chmodSync(RUN_SQL_SH, 0o755); } catch { /* */ }
  const child = spawnSync("bash", [RUN_SQL_SH, sqlFile, outFile, errFile], {
    env: {
      ...process.env,
      ALLOY_CANONICAL_ROOT: resolveCanonicalRepoRoot(),
      ALLOY_REPO: resolveCanonicalRepoRoot(),
      ALLOY_SERVER_ENV_SOURCE: resolveTrustedServerEnvSource(),
      VACILANDO_CHECKOUT: findRepoRoot(),
      ALLOY_WORKTREE: findRepoRoot(),
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
    },
    timeout: 60_000,
    encoding: "utf8",
  });
  const outText = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  const errText = redactSecrets(existsSync(errFile) ? readFileSync(errFile, "utf8") : (child.stderr || ""));
  try { unlinkSync(sqlFile); } catch { /* */ }
  if (child.status !== 0) {
    return {
      ok: false,
      applied: false,
      code: /trusted_credential_unavailable/.test(errText) ? "trusted_credential_unavailable" : "preflight_failed",
      detail: errText.slice(0, 400) || "Ledger inspect failed",
    };
  }
  const applied = String(outText).includes(String(version));
  return { applied };
}

function defaultApplyMigrationFile({ entry, text }) {
  const tmpDir = join(STORE_DIR, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const file = join(tmpDir, `${entry.version}.sql`);
  const outFile = join(tmpDir, `${entry.version}.out`);
  const errFile = join(tmpDir, `${entry.version}.err`);
  writeFileSync(file, text);
  try { chmodSync(APPLY_MIGRATION_SH, 0o755); } catch { /* */ }
  const child = spawnSync("bash", [APPLY_MIGRATION_SH, file, outFile, errFile], {
    env: {
      ...process.env,
      ALLOY_CANONICAL_ROOT: resolveCanonicalRepoRoot(),
      ALLOY_REPO: resolveCanonicalRepoRoot(),
      ALLOY_SERVER_ENV_SOURCE: resolveTrustedServerEnvSource(),
      VACILANDO_CHECKOUT: findRepoRoot(),
      ALLOY_WORKTREE: findRepoRoot(),
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
    },
    timeout: 180_000,
    encoding: "utf8",
  });
  const errText = redactSecrets(existsSync(errFile) ? readFileSync(errFile, "utf8") : (child.stderr || ""));
  try { unlinkSync(file); } catch { /* */ }
  if (child.status !== 0) {
    return { ok: false, code: /trusted_credential_unavailable/.test(errText) ? "trusted_credential_unavailable" : "apply_failed", detail: errText.slice(0, 400) };
  }
  return { ok: true, ledger: "applied" };
}

export function executeMigrationTrustedHostAction(action, { actor = "director", nowMs } = {}) {
  const authz = authorizeTrustedHostAction(action.id, { actor, nowMs });
  if (!authz.ok) return authz;
  action = authz.action;
  action.state = "executing";
  action.executionState = "executing";
  action.started_at = action.started_at || iso(nowMs);
  action.updated_at = iso(nowMs);
  writeAction(action);
  const runners = migrationRunnersForTests || {};
  const out = applyMigrationBatch(action.inputs, {
    inspectLedger: runners.inspectLedger || defaultInspectLedger,
    applyFile: runners.applyFile || defaultApplyMigrationFile,
    readContent: runners.readContent || readMigrationContent,
    nowMs,
  });
  if (payloadHasSecrets(out)) {
    return failTrustedAction(action, "result_contained_secrets", "Migration result contained secrets and was discarded.", { nowMs });
  }
  if (!out?.ok) {
    const failed = out?.results?.find((r) => !r.ok);
    const publicResult = publicMigrationResult(out);
    const failedAction = failTrustedAction(
      action,
      failed?.code || "apply_failed",
      failed?.detail || "Migration batch stopped on failure.",
      { nowMs },
    );
    if (failedAction.action) {
      failedAction.action.result = {
        ...publicResult,
        ok: false,
        code: failed?.code || "apply_failed",
        detail: failed?.detail || "Migration batch stopped on failure.",
      };
      writeAction(failedAction.action);
    }
    return failedAction;
  }
  const result = { ...publicMigrationResult(out), ok: true };
  action.result = result;
  return completeTrustedAction(action, result, { nowMs });
}

export function fulfillRepositoryMergeForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
} = {}) {
  const req = requestTrustedHostAction({
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy: actor,
    actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    inputs,
    nowMs,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs });
  if (!auth.ok) {
    return {
      ok: false,
      error: "authorization_required",
      action: auth.action,
    };
  }
  return executeTrustedHostAction(req.action.id, { actor, nowMs });
}

export function fulfillDatabaseMigrationForMission(missionId, {
  assignmentId = null,
  executionSessionId = null,
  inputs = {},
  actor = "director",
  nowMs,
} = {}) {
  const req = requestTrustedHostAction({
    missionId,
    assignmentId,
    executionSessionId,
    requestedBy: actor,
    actionType: ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    inputs,
    nowMs,
  });
  if (!req.ok) return req;
  if (req.action.state === "completed" && req.deduped) return { ok: true, action: req.action, already: true };
  const auth = authorizeTrustedHostAction(req.action.id, { actor, nowMs });
  if (!auth.ok) {
    return {
      ok: false,
      error: "authorization_required",
      action: auth.action,
    };
  }
  return executeTrustedHostAction(req.action.id, { actor, nowMs });
}

export { ACTION_TYPES, listRegisteredActions };
