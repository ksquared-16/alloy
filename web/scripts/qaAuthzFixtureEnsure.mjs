#!/usr/bin/env node
/**
 * Apply Documents authz_q1 vendor fixture ENSURE (B2).
 * Frozen path. ORG_ID + QA_RUN_ID from registered reconciliation only.
 * Refuses production, Firefly, unregistered orgs, missing run id, hash mismatch.
 */
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POSTGRES_CLIENT_MISSING_DETAIL, resolvePostgresClient } from "./lib/resolvePostgresClient.mjs";

const FIXTURE_RELATIVE = "certification/fixtures/qa-authz-vendors-ensure.sql";
const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const QA_SECONDARY = "ad53fee2-2570-460f-9300-f0e106c473b6";
const FIREFLY = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const PROD = "vslwnntzzgpnmrpjipat";
const STAGING = "ikaxilmwmrmbagoidedu";
const ORG_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_RE = /^qar_[a-z0-9]{8,}$/i;

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
if (orgId !== QA_SHARED && orgId !== QA_SECONDARY) fail("unregistered_organization", orgId);
if (!RUN_RE.test(qaRunId)) fail("qa_run_id_required", "QA_RUN_ID must be qar_…");

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

const psql = (args) => execFileSync(client.path, [databaseUrl, "-v", "ON_ERROR_STOP=1", ...args], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
});

try {
  psql(["-v", `org=${orgId}`, "-v", `qa_run_id=${qaRunId}`, "-f", fixturePath]);
} catch (e) {
  fail("fixture_apply_failed", String(e?.stderr || e?.message || e).split("\n")[0].slice(0, 240));
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  seeded: 1,
  reconciliation_key: "qa_authz_fixture_ensure",
  fixture_path: FIXTURE_RELATIVE,
  fixture_hash: `sha256:${fixtureHash}`,
  organization_id: orgId,
  organization_source: "registered_context",
  qa_run_id: qaRunId,
  started_at: started.toISOString(),
  finished_at: new Date().toISOString(),
})}\n`);
