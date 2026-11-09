#!/usr/bin/env node
/**
 * Apply the Documents D9-H2 write fixtures (proposed registered reconciliations qa_d9_aged_upload_ensure /
 * qa_d9_write_fixture_reset, QA plan documents_d9_write_v1; certification/documents-v1/D9-2-3-HOSTED-QA-PLAN.md §3, §6).
 *
 *   node scripts/qaDocumentsD9WriteFixture.mjs aged-ensure|write-reset
 *
 * A sibling of qaDocumentsD9ExternalFixture.mjs, whose bytes are pinned for documents_d9_read_v1 and are therefore left
 * unchanged. Same gates: armed apply only, synthetic only, never production, never another staging project, QA Shared
 * only (the SQL fixes QA Secondary itself), the open QA run's id only, the registry's pin of the fixture bytes REQUIRED.
 * Every gate is checked before any database connection. Each fixture is one transaction; its JSON result line is
 * returned as the governed result.
 *
 * write-reset has one step the SQL cannot do: stored bytes. The SQL deletes the rows and lists the objects they stored
 * (plus D9 write objects left without a row); after it commits, this runner removes exactly those objects through the
 * Storage API (the audited delete's order: row first, then its files) and re-reads storage.objects. Any object left is
 * a failure, never a pass. Every listed object must be in org_documents under a QA org prefix, or nothing is removed.
 */
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POSTGRES_CLIENT_MISSING_DETAIL, resolvePostgresClient } from "./lib/resolvePostgresClient.mjs";

const MODES = {
  "aged-ensure": {
    fixture: "certification/documents-v1/d9-hosted/qa_d9_aged_upload_ensure.sql",
    key: "qa_d9_aged_upload_ensure",
    resultField: "d9_aged_upload_ensure",
    outcome: "seeded",
  },
  "write-reset": {
    fixture: "certification/documents-v1/d9-hosted/qa_d9_write_fixture_reset.sql",
    key: "qa_d9_write_fixture_reset",
    resultField: "d9_write_fixture_reset_counts",
    outcome: "reset",
  },
};
const QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const QA_SECONDARY = "ad53fee2-2570-460f-9300-f0e106c473b6";
const FIREFLY = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const PROD = "vslwnntzzgpnmrpjipat";
const STAGING = "ikaxilmwmrmbagoidedu";
const BUCKET = "org_documents";
const ORG_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_RE = /^qar_[0-9a-f]{12}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

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
if (!mode) fail("mode_required", "aged-ensure or write-reset");

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
if (!SHA_RE.test(pinned)) fail("fixture_pin_required", "FIXTURE_SHA256 (the registry's pin) is required");
if (pinned !== fixtureHash) fail("fixture_content_mismatch", `disk ${fixtureHash.slice(0, 12)} pin ${pinned.slice(0, 12)}`);

const orgId = String(process.env.ORG_ID || "").trim();
const qaRunId = String(process.env.QA_RUN_ID || "").trim();
if (!ORG_RE.test(orgId)) fail("organization_malformed", "ORG_ID required");
if (orgId === FIREFLY) fail("firefly_refused", orgId);
if (orgId !== QA_SHARED) fail("unregistered_organization", orgId);
if (!RUN_RE.test(qaRunId)) fail("qa_run_id_required", "QA_RUN_ID must be qar_ followed by 12 lowercase hex characters");

/* write-reset may have bytes to remove: the Storage endpoint is resolved and checked before any database connection too. */
let storage = null;
if (modeName === "write-reset") {
  const rawUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (rawUrl && key) {
    let host = "";
    try { host = new URL(rawUrl).hostname; } catch { fail("storage_url_malformed", "SUPABASE_URL"); }
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
    if (host === `${PROD}.supabase.co`) fail("production_refused", "production storage is unreachable");
    if (!loopback && host !== `${STAGING}.supabase.co`) fail("wrong_staging_project", host);
    storage = { url: rawUrl.replace(/\/+$/, ""), key };
  }
}

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

if (modeName === "write-reset") {
  if (result.residue !== 0) fail("residue_remaining", `residue ${result.residue}`);
  const objects = Array.isArray(result.objects_to_remove) ? result.objects_to_remove : null;
  if (!objects) fail("result_unreadable", "objects_to_remove missing");
  const qaPrefix = (p) => p.startsWith(`${QA_SHARED}/`) || p.startsWith(`${QA_SECONDARY}/`);
  const outside = objects.filter((o) => o?.bucket !== BUCKET || typeof o?.path !== "string" || !qaPrefix(o.path) || o.path.includes(".."));
  if (outside.length) fail("object_outside_qa_orgs", `${outside.length} listed object(s) outside ${BUCKET}/<qa org>/; nothing removed`);
  const paths = objects.map((o) => o.path);
  if (paths.length) {
    if (!storage) fail("storage_unreachable", `${paths.length} object(s) to remove and no trusted Storage credential; rows are gone, bytes remain`);
    for (let i = 0; i < paths.length; i += 100) {
      // The Storage API's bulk remove (what supabase-js storage.from(bucket).remove(paths) sends).
      const res = await fetch(`${storage.url}/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers: { apikey: storage.key, Authorization: `Bearer ${storage.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
      }).catch((e) => ({ ok: false, status: 0, statusText: String(e?.message || e) }));
      if (!res.ok) fail("storage_remove_failed", `status ${res.status} ${String(res.statusText || "").slice(0, 120)}`);
    }
  }
  // Prove it: re-read storage.objects for exactly the listed names (read-only).
  let left = 0;
  if (paths.length) {
    const list = paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(",");
    try {
      const out = execFileSync(client.path, [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
        `select count(*) from storage.objects where bucket_id = '${BUCKET}' and name in (${list})`], { encoding: "utf8" });
      left = Number.parseInt(String(out).trim(), 10);
    } catch (e) {
      fail("object_verify_failed", String(e?.stderr || e?.message || e).split("\n")[0].slice(0, 240));
    }
    if (!Number.isInteger(left)) fail("object_verify_failed", "unreadable count");
  }
  if (left !== 0) fail("object_residue_remaining", `objects remaining ${left}`);
  result = { ...result, objects_to_remove: undefined, storage_objects_removed: paths.length, storage_objects_remaining: 0 };
}

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
