#!/usr/bin/env node
/**
 * Apply the Documents R5 SHARED-CHILD subject fixture (proposed registered reconciliations
 * qa_documents_shared_child_ensure / qa_documents_shared_child_reset; contract
 * certification/qa-shared/documents-r5-shared-child-fixture-contract.json).
 *
 *   node scripts/qaDocumentsSharedChildFixture.mjs ensure|reset
 *
 * Same gates as the other authz_q1 fixtures, narrowed to QA Shared: armed apply only, synthetic only, never
 * production, never another staging project, the registered organization only, the open QA run's id only, and
 * the exact fixture bytes when the registry pins them. Every gate is checked before any database connection.
 * The fixture is one transaction; its JSON result line is returned as the governed result.
 */
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POSTGRES_CLIENT_MISSING_DETAIL, resolvePostgresClient } from "./lib/resolvePostgresClient.mjs";

const MODES = {
  ensure: {
    fixture: "certification/fixtures/qa-documents-shared-child-ensure.sql",
    key: "qa_documents_shared_child_ensure",
    resultField: "shared_child_ensure",
    outcome: "seeded",
  },
  reset: {
    fixture: "certification/fixtures/qa-documents-shared-child-reset.sql",
    key: "qa_documents_shared_child_reset",
    resultField: "shared_child_reset_counts",
    outcome: "reset",
  },
};
const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const FIREFLY = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const PROD = "vslwnntzzgpnmrpjipat";
const STAGING = "ikaxilmwmrmbagoidedu";
const ORG_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_RE = /^qar_[0-9a-f]{12}$/;

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

const started = new Date();
const fail = (code, detail) => {
  process.stdout.write(`${JSON.stringify({
    ok: false, code, detail,
    started_at: started.toISOString(), finished_at: new Date().toISOString(),
  })}\n`);
  process.exit(1);
};

const modeName = String(process.argv[2] || "").trim();
const mode = Object.hasOwn(MODES, modeName) ? MODES[modeName] : null;
if (!mode) fail("mode_required", "ensure or reset");

if (process.env.CERT_FIXTURE_APPLY !== "1" || process.env.DRY_RUN === "1") {
  fail("apply_not_armed", "CERT_FIXTURE_APPLY=1 and DRY_RUN=0 are required");
}
if (process.env.SYNTHETIC_ONLY !== "1") fail("synthetic_only_required", "SYNTHETIC_ONLY=1 is required");

const projectRef = String(process.env.SUPABASE_PROJECT_REF || process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || "").trim();
if (projectRef === PROD) fail("production_refused", "production is unreachable");
if (projectRef && projectRef !== STAGING) fail("wrong_staging_project", projectRef);

const repoRoot = process.env.ALLOY_CANONICAL_ROOT?.trim()
  || process.env.ALLOY_REPO?.trim()
  || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = join(repoRoot, mode.fixture);
if (!existsSync(fixturePath)) fail("fixture_missing", mode.fixture);
const fixtureHash = createHash("sha256").update(readFileSync(fixturePath)).digest("hex");
const pinned = String(process.env.FIXTURE_SHA256 || "").trim();
if (pinned && pinned !== fixtureHash) fail("fixture_content_mismatch", `disk ${fixtureHash.slice(0, 12)} pin ${pinned.slice(0, 12)}`);

const orgId = String(process.env.ORG_ID || "").trim();
const qaRunId = String(process.env.QA_RUN_ID || "").trim();
if (!ORG_RE.test(orgId)) fail("organization_malformed", "ORG_ID required");
if (orgId === FIREFLY) fail("firefly_refused", orgId);
if (orgId !== QA_SHARED) fail("unregistered_organization", orgId);
if (!RUN_RE.test(qaRunId)) fail("qa_run_id_required", "QA_RUN_ID must be qar_ followed by 12 lowercase hex characters");

function resolveDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim() || process.env.DIRECT_DATABASE_URL?.trim();
  if (!raw) fail("database_unreachable", "no trusted database connectivity");
  const url = new URL(raw.replace(/^postgresql:/, "postgres:"));
  url.searchParams.delete("pgbouncer");
  if (url.port === "6543") url.port = "5432";
  return url.toString();
}
const databaseUrl = resolveDatabaseUrl();
const client = resolvePostgresClient();
if (!client) fail("postgres_client_missing", POSTGRES_CLIENT_MISSING_DETAIL);

let stdout = "";
try {
  stdout = execFileSync(client.path, [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", `org=${orgId}`, "-v", `qa_run_id=${qaRunId}`, "-f", fixturePath], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
} catch (e) {
  fail("fixture_apply_failed", String(e?.stderr || e?.message || e).split("\n")[0].slice(0, 240));
}

let result = null;
for (const line of String(stdout).split("\n").reverse()) {
  const t = line.trim();
  if (!t.startsWith("{")) continue;
  try { result = JSON.parse(t)[mode.resultField] || null; } catch { result = null; }
  if (result) break;
}
if (!result || result.qa_run_id !== qaRunId) fail("result_unreadable", "the fixture committed but did not report its result");
if (modeName === "reset" && result.residue !== 0) fail("residue_remaining", `residue ${result.residue}`);

process.stdout.write(`${JSON.stringify({
  ok: true,
  [mode.outcome]: 1,
  reconciliation_key: mode.key,
  fixture_path: mode.fixture,
  fixture_hash: `sha256:${fixtureHash}`,
  organization_id: orgId,
  organization_source: "registered_context",
  qa_run_id: qaRunId,
  result,
  started_at: started.toISOString(),
  finished_at: new Date().toISOString(),
})}\n`);
