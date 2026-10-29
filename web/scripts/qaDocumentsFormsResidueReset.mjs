#!/usr/bin/env node
/**
 * Apply the Documents authz_q1 Forms / packet RESIDUE RESET (registered reconciliation
 * qa_documents_forms_residue_reset). Same gates as the other authz_q1 fixtures, narrowed to QA Shared:
 * the fixture removes the OPEN run's qa_<run>_ Forms rows and the frozen, enumerated residue of closed
 * runs, refuses while documents remain linked, and never touches health facts or audit history.
 * The deleted counts the fixture prints are returned as the governed result.
 */
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POSTGRES_CLIENT_MISSING_DETAIL, resolvePostgresClient } from "./lib/resolvePostgresClient.mjs";

const FIXTURE_RELATIVE = "certification/fixtures/qa-documents-forms-residue-reset.sql";
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
const fixturePath = join(repoRoot, FIXTURE_RELATIVE);
if (!existsSync(fixturePath)) fail("fixture_missing", FIXTURE_RELATIVE);
const bytes = readFileSync(fixturePath);
const fixtureHash = createHash("sha256").update(bytes).digest("hex");
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

let counts = null;
for (const line of String(stdout).split("\n").reverse()) {
  const t = line.trim();
  if (!t.startsWith("{")) continue;
  try { counts = JSON.parse(t).forms_residue_reset_counts || null; } catch { counts = null; }
  if (counts) break;
}
if (!counts || counts.qa_run_id !== qaRunId) fail("result_unreadable", "the fixture committed but did not report its counts");

process.stdout.write(`${JSON.stringify({
  ok: true,
  reset: 1,
  reconciliation_key: "qa_documents_forms_residue_reset",
  fixture_path: FIXTURE_RELATIVE,
  fixture_hash: `sha256:${fixtureHash}`,
  organization_id: orgId,
  organization_source: "registered_context",
  qa_run_id: qaRunId,
  deleted: counts,
  started_at: started.toISOString(),
  finished_at: new Date().toISOString(),
})}\n`);
