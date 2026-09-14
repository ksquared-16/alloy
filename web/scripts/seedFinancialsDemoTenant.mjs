#!/usr/bin/env node
/**
 * Apply the frozen Financials certification fixture to deployed staging.
 *
 * REPOSITORY-OWNED AND FROZEN. The fixture path is a constant in this file, not
 * an argument. The organization arrives as ORG_ID from the registered
 * reconciliation's `frozen_context` — the registry names it, the caller cannot.
 * Connectivity is resolved here, server-side, from the environment the trusted
 * host already hands this process. Nothing executable comes from a request.
 *
 * WHAT IT WRITES. Household, child, person, enrolment and funding STRUCTURE.
 * No money: charges, payments, allocations and claims are created by the
 * canonical Financials services, because money has invariants a fixture that
 * INSERTed past them would quietly violate.
 *
 * WHAT IT DESTROYS. Its own prior rows, so a rerun restores the proving state
 * rather than adding to it. Every one of the fixture's 26 destructive statements
 * is scoped to fixture-owned identities — six subsidy-chain deletes that were
 * once scoped by organization alone are now constrained through the fixture's
 * own program and agency, and `hosted-fixture-safety.mjs` is a required gate
 * that keeps them that way.
 *
 * Fail-fast: psql runs under ON_ERROR_STOP=1, so a partial apply is a failure
 * rather than a half-seeded tenant that looks fine.
 */
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Frozen. Never an argument, never an environment variable. */
const FIXTURE_RELATIVE = "certification/fixtures/financials-demo-tenant.sql";
const ORG_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/*
 * The canonical root the control plane designates, not a walk up from cwd.
 * A trusted-host action that executes REPOSITORY CONTENT must run from the
 * checkout the platform calls canonical; a discovered one lands wherever the
 * Gateway happened to start.
 */
const repoRoot = process.env.ALLOY_CANONICAL_ROOT?.trim()
  || process.env.ALLOY_REPO?.trim()
  || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const fixturePath = join(repoRoot, FIXTURE_RELATIVE);
if (!existsSync(fixturePath)) {
  fail("fixture_missing", `the frozen fixture is not present at ${FIXTURE_RELATIVE}`);
}
const fixtureSql = readFileSync(fixturePath);
const fixtureHash = `sha256:${createHash("sha256").update(fixtureSql).digest("hex")}`;

let repositorySha = null;
try {
  repositorySha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch { /* recorded as null rather than guessed */ }

const orgId = String(process.env.ORG_ID ?? "").trim();
if (!orgId) fail("organization_missing", "ORG_ID is supplied by the registered reconciliation and was absent");
if (!ORG_RE.test(orgId)) fail("organization_malformed", "ORG_ID is not a canonical UUID; ambiguity is refused rather than guessed");

/** Session port, pgbouncer stripped — the same shape the canonical apply path uses. */
function resolveDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim() || process.env.DIRECT_DATABASE_URL?.trim();
  if (!raw) fail("database_unreachable", "no trusted database connectivity is configured for this host");
  const url = new URL(raw.replace(/^postgresql:/, "postgres:"));
  url.searchParams.delete("pgbouncer");
  if (url.port === "6543") url.port = "5432";
  return url.toString();
}
const databaseUrl = resolveDatabaseUrl();

/** Identity WITHOUT credentials: host and database name only, never user or password. */
function databaseIdentity(urlString) {
  try {
    const u = new URL(urlString);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch { return null; }
}

const psql = (args) => execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", ...args], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
});

// The organization must already exist. This runner seeds INTO a tenant; it does
// not create one, and a typo must refuse rather than quietly build a new world.
let orgExists = false;
try {
  const out = psql(["-tAc", `select 1 from orgs where id = '${orgId}'::uuid`]);
  orgExists = out.trim() === "1";
} catch (e) {
  fail("organization_probe_failed", firstLine(e));
}
if (!orgExists) fail("organization_not_found", `organization ${orgId} does not exist on this target`);

let diagnostic = null;
try {
  diagnostic = psql(["-v", `org=${orgId}`, "-f", fixturePath]);
} catch (e) {
  fail("fixture_apply_failed", firstLine(e));
}

const finished = new Date();
process.stdout.write(`${JSON.stringify({
  ok: true,
  seeded: 1,
  reconciliation_key: "seed_financials_demo_tenant",
  repository_sha: repositorySha,
  fixture_path: FIXTURE_RELATIVE,
  fixture_hash: fixtureHash,
  organization_id: orgId,
  organization_source: "registered_context",
  target_database_identity: databaseIdentity(databaseUrl),
  trusted_env_source: process.env.ALLOY_SERVER_ENV_SOURCE ?? null,
  started_at: started.toISOString(),
  finished_at: finished.toISOString(),
  duration_ms: finished - started,
  // Bounded, and psql's own words. Never the connection string.
  diagnostic: lastLines(diagnostic, 12),
})}\n`);

function firstLine(e) {
  const text = String(e?.stderr || e?.stdout || e?.message || e);
  return (text.split("\n").map((l) => l.trim()).find(Boolean) || "psql failed").slice(0, 300);
}
function lastLines(text, n) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-n).join(" | ").slice(0, 600);
}
