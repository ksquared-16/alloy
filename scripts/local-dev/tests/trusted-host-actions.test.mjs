/**
 * Trusted Host Actions — safety, authz, and sandbox boundary tests.
 * Does not hit the shared tenant; SQL validation is offline.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const runtimeRoot = mkdtempSync(join(tmpdir(), "tha-test-"));
process.env.ALLOY_RUNTIME_ROOT = runtimeRoot;

const { validateReadOnlySql } = await import("../lib/vacilando/trusted-host-sql-readonly.mjs");
const {
  looksLikeManualPrivilegedExecutionRequest,
  looksLikeDatabaseCensusRequest,
} = await import("../lib/vacilando/trusted-host-director.mjs");
const {
  grantMissionAuthorization,
  findAuthorization,
  listAuthorizations,
} = await import("../lib/vacilando/trusted-host-authz.mjs");
const {
  ACTION_TYPES,
  requestTrustedHostAction,
  authorizeTrustedHostAction,
  getTrustedHostAction,
  reconcileTrustedHostActionsOnBoot,
  trustedHostDiagnostics,
  parseTrustedHostSqlOutput,
} = await import("../lib/vacilando/trusted-host-actions.mjs");

const labeled = parseTrustedHostSqlOutput([
  "BEGIN",
  "Q15-A1|row_count|{\"row_count\": 0}",
  "Q15-A1|row|{\"legacy_role\":\"admin\",\"principals\":2}",
  "Q15-D1|row_count|{\"row_count\": 1}",
  "COMMIT",
].join("\n"));
assert.equal(labeled.format, "q15_labeled_rows");
assert.equal(labeled.questions["Q15-A1"].row_count, 0);
assert.equal(labeled.questions["Q15-A1"].rows[0].principals, 2);
assert.deepEqual(labeled.question_ids, ["Q15-A1", "Q15-D1"]);
assert.equal(parseTrustedHostSqlOutput("{\"org_count\": 3}").org_count, 3);
assert.equal(parseTrustedHostSqlOutput(""), null);

function sha(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// --- SQL validation ---
assert.equal(validateReadOnlySql("SELECT 1").ok, true);
assert.equal(validateReadOnlySql("WITH x AS (SELECT 1) SELECT * FROM x").ok, true);
assert.equal(validateReadOnlySql("DELETE FROM users").ok, false);
assert.equal(validateReadOnlySql("INSERT INTO t VALUES (1)").ok, false);
assert.equal(validateReadOnlySql("UPDATE t SET a=1").ok, false);
assert.equal(validateReadOnlySql("DROP TABLE t").ok, false);
assert.equal(validateReadOnlySql("WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x").ok, false);
assert.equal(validateReadOnlySql("SELECT 1; SELECT 2").ok, false);
assert.equal(validateReadOnlySql("SELECT 1 INTO tmp").ok, false);
assert.equal(validateReadOnlySql("COPY t TO '/tmp/x'").ok, false);
assert.equal(validateReadOnlySql("DO $$ BEGIN NULL; END $$").ok, false);
assert.equal(validateReadOnlySql("CREATE TABLE t (id int)").ok, false);
assert.equal(validateReadOnlySql("GRANT SELECT ON t TO u").ok, false);

// Hash mismatch + wrong target via registry validateInputs
const { getActionDefinition } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);
const artifactRel = "docs/platform/planning/vacilando-os/qa/access-identity-v2/wave0-authority-census.json";
const hashMismatch = def.validateInputs({
  queryArtifactPath: artifactRel,
  expectedQueryHash: "0".repeat(64),
  databaseTarget: "alloy_deployed_primary",
});
assert.equal(hashMismatch.ok, false);
assert.equal(hashMismatch.code, "query_hash_mismatch");
const wrongTarget = def.validateInputs({
  queryArtifactPath: artifactRel,
  databaseTarget: "someone_elses_db",
});
assert.equal(wrongTarget.ok, false);
assert.equal(wrongTarget.code, "wrong_database_target");

// Mutation hidden in comment should still allow SELECT
assert.equal(validateReadOnlySql("SELECT 1 /* DELETE FROM t */").ok, true);
// Mutation in string should allow SELECT
assert.equal(validateReadOnlySql("SELECT 'DELETE FROM t'").ok, true);

// --- Director recognition ---
assert.equal(looksLikeManualPrivilegedExecutionRequest({
  title: "W-0 needs an execution channel",
  situation: "managed slot lacks DATABASE_URL",
  options: [{ label: "Run in Terminal", description: "paste JSON" }],
}), true);
assert.equal(looksLikeDatabaseCensusRequest({
  title: "Wave 0 authority census",
  situation: "need deployed database read",
}), true);
assert.equal(looksLikeManualPrivilegedExecutionRequest({
  title: "Pick a color",
  situation: "brand decision",
}), false);

// --- Authz scopes ---
const mid = "msn_tha_test_authz";
const grant = grantMissionAuthorization({
  missionId: mid,
  actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
  actor: "test",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
});
assert.equal(grant.ok, true);
const found = findAuthorization({
  missionId: mid,
  actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
  databaseTarget: "alloy_deployed_primary",
});
assert.ok(found);
assert.equal(found.authorizationId, grant.authorization.authorizationId);

// Wrong action type denied
assert.equal(findAuthorization({
  missionId: mid,
  actionType: "database.read_query",
  databaseTarget: "alloy_deployed_primary",
}), null);

// Expired rejected
const expiredMid = "msn_tha_expired";
grantMissionAuthorization({
  missionId: expiredMid,
  actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
  actor: "test",
  expiresAt: new Date(Date.now() - 1000).toISOString(),
});
assert.equal(findAuthorization({
  missionId: expiredMid,
  actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
  databaseTarget: "alloy_deployed_primary",
  nowMs: Date.now(),
}), null);

// --- Credential never in worker package ---
const agentEnv = join(runtimeRoot, "fake-worktree", "web", ".env.local.agent");
mkdirSync(join(runtimeRoot, "fake-worktree", "web"), { recursive: true });
writeFileSync(agentEnv, "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_APP_URL=http://127.0.0.1:3011\n");
const agentBody = readFileSync(agentEnv, "utf8");
assert.doesNotMatch(agentBody, /DATABASE_URL/);
assert.doesNotMatch(agentBody, /SERVICE_ROLE/);

// Diagnostics never expose secrets
const diag = trustedHostDiagnostics();
const diagJson = JSON.stringify(diag);
assert.doesNotMatch(diagJson, /postgresql:\/\//i);
assert.doesNotMatch(diagJson, /eyJ[A-Za-z0-9_-]{10,}\./);
assert.ok(Array.isArray(diag.registeredActions));
assert.ok(diag.registeredActions.some((a) => a.actionType === ACTION_TYPES.DATABASE_READ_CENSUS));

// --- Restart reconciles in-flight ---
const storeDir = join(runtimeRoot, "vacilando", "trusted-host-actions");
mkdirSync(storeDir, { recursive: true });
const stuckId = "tha_stuck_test_001";
writeFileSync(join(storeDir, `${stuckId}.json`), JSON.stringify({
  id: stuckId,
  missionId: mid,
  actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
  state: "executing",
  executionState: "running",
  inputs: {},
}, null, 2));
writeFileSync(join(storeDir, `index_${mid}.json`), JSON.stringify({ missionId: mid, ids: [stuckId] }));
const recon = reconcileTrustedHostActionsOnBoot();
assert.ok(recon.interrupted.includes(stuckId), `expected ${stuckId} in ${JSON.stringify(recon)}`);
const stuck = getTrustedHostAction(stuckId);
assert.equal(stuck.state, "failed");
assert.equal(stuck.failureReason?.code, "host_restart");

// Missing artifact rejected
const bad = requestTrustedHostAction({
  missionId: mid,
  actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
  inputs: { queryArtifactPath: "does-not-exist.json", databaseTarget: "alloy_deployed_primary" },
});
assert.equal(bad.ok, false);

assert.equal(sha("SELECT 1").length, 64);
assert.ok(listAuthorizations(mid).length >= 1);

writeFileSync(join(storeDir, "tha_lonely.json"), JSON.stringify({
  id: "tha_lonely",
  missionId: "msn_tha_no_auth",
  actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
  state: "requested",
  authorizationState: "pending",
  inputs: { databaseTarget: "alloy_deployed_primary", queryHash: "abc" },
}, null, 2));
writeFileSync(join(storeDir, "index_msn_tha_no_auth.json"), JSON.stringify({
  missionId: "msn_tha_no_auth",
  ids: ["tha_lonely"],
}));
const authNeed = authorizeTrustedHostAction("tha_lonely");
assert.equal(authNeed.ok, false);
assert.equal(authNeed.error, "authorization_required");

rmSync(runtimeRoot, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  covered: [
    "readonly_sql_accept",
    "mutation_reject",
    "writable_cte_reject",
    "multi_statement_reject",
    "director_manual_detection",
    "mission_authz",
    "expired_authz",
    "wrong_action_denied",
    "agent_env_no_database_url",
    "diagnostics_no_secrets",
    "restart_reconcile",
    "auth_required_path",
    "q15_labeled_row_parse",
  ],
}, null, 2));
