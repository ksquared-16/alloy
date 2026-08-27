#!/usr/bin/env node
/**
 * S3 — executor authority for governed database operations.
 *
 * THE INVENTORY FINDING THESE FIXTURES ENCODE. The registered migration
 * capability validates `environment` against an allowlist and then executes
 * through a child that takes DATABASE_URL from ONE place — the canonical
 * checkout's env file. Measured on this host: one DATABASE_URL, hosted, no
 * per-environment key. staging, certification and cert therefore all execute
 * against the SAME database. The environment input is a LABEL, not an authority
 * boundary, and adding a fourth string to that allowlist would have routed
 * nothing anywhere new.
 *
 * That is also a live hazard independent of this slice: a migration approved
 * for "certification" today reaches whatever that single URL names, so the
 * operator reads one environment on the card and gets another.
 *
 * NOTHING IN THIS SUITE TOUCHES A CREDENTIAL. The model reasons about
 * credential REFERENCES; the fixtures assert that a reference without a binding
 * refuses, and that a worker can never be the one holding it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const E = await import("../lib/vacilando/executor-authority.mjs");
const G = await import("../lib/vacilando/governed-dependency.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// ── Environment identity ─────────────────────────────────────────────────────

await test("1 — a registered alias normalizes; an unrelated name does NOT", () => {
  assert.equal(E.normalizeEnvironmentId("cert"), "certification");
  assert.equal(E.normalizeEnvironmentId("CERT"), "certification");
  assert.equal(E.normalizeEnvironmentId("stage"), "staging");
  assert.equal(E.normalizeEnvironmentId("dev_certification"), "development_certification");
  // The one that matters: it is its OWN environment, not a near-miss for certification.
  assert.equal(E.normalizeEnvironmentId("development_certification"), "development_certification");
  assert.notEqual(E.normalizeEnvironmentId("development_certification"), "certification");
});

await test("2 — normalization happens BEFORE the governance content hash", () => {
  const mk = (env) => ({ action_key: "database.apply_migration", inputs: { environment: env, expectedSha: "abc1234", migrations: ["m1.sql"] } });
  // Aliases must hash identically, or an operator is asked the same question twice.
  assert.equal(G.governedContentHash(mk("cert")), G.governedContentHash(mk("certification")));
  assert.equal(G.governedContentHash(mk("CERT ")), G.governedContentHash(mk("certification")));
  // And a genuinely different environment must NOT.
  assert.notEqual(G.governedContentHash(mk("development_certification")), G.governedContentHash(mk("certification")));
  assert.notEqual(G.governedContentHash(mk("staging")), G.governedContentHash(mk("certification")));
});

await test("3 — production is refused BY NAME, not merely left out of a list", () => {
  for (const env of E.FORBIDDEN_ENVIRONMENTS) {
    const v = E.assertEnvironmentAuthority({ environment: env, capability: "trusted_host.database.migrate" });
    assert.equal(v.ok, false, env);
    assert.equal(v.refusal, "environment_forbidden", env);
  }
});

// ── Authority ────────────────────────────────────────────────────────────────

await test("4 — development_certification is registered, approvable, and REFUSED at execution", () => {
  const v = E.assertEnvironmentAuthority({ environment: "development_certification", capability: "trusted_host.database.migrate" });
  assert.equal(v.ok, false);
  assert.equal(v.refusal, "environment_unprovisioned");
  assert.equal(v.credential_ref, "trusted_secret:development_certification_database");
  // The gap is ONE named action, not a discussion.
  assert.equal(v.must_be_provisioned.length, 1);
  assert.match(v.must_be_provisioned[0], /readable only by the trusted executor/);
});

await test("5 — an unregistered environment is not silently allowed by an allowlist edit", () => {
  const v = E.assertEnvironmentAuthority({ environment: "qa_sandbox", capability: "trusted_host.database.migrate" });
  assert.equal(v.refusal, "environment_unknown");
  assert.match(v.detail, /register it with a credential reference rather than adding it to an allowlist/);
});

await test("6 — THE LIVE HAZARD: strict binding refuses a label that cannot be proven", () => {
  // Today certification shares the ambient DATABASE_URL, so a migration
  // labelled `certification` cannot be shown to have reached certification.
  const lax = E.assertEnvironmentAuthority({ environment: "certification", capability: "trusted_host.database.migrate" });
  assert.equal(lax.ok, true, "current behaviour, preserved");
  assert.equal(lax.distinct_binding, false, "and it says so rather than implying otherwise");

  const strict = E.assertEnvironmentAuthority({
    environment: "certification", capability: "trusted_host.database.migrate", requireDistinctBinding: true,
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.refusal, "environment_binding_not_distinct");
  assert.match(strict.detail, /cannot be proven to reach certification/);
});

await test("7 — read and write are SEPARATE capabilities, and a mismatch refuses", () => {
  assert.equal(E.AUTHORITY_SEPARATION.decision, "separate");
  assert.notEqual(E.AUTHORITY_SEPARATION.read, E.AUTHORITY_SEPARATION.write);
  const wrong = E.assertEnvironmentAuthority({
    environment: "certification", capability: "trusted_host.database.migrate", mode: "read",
  });
  assert.equal(wrong.refusal, "capability_mismatch");
  assert.match(wrong.detail, /read is owned by trusted_host\.database\.read/);
  const right = E.assertEnvironmentAuthority({
    environment: "certification", capability: "trusted_host.database.read", mode: "read",
  });
  assert.equal(right.ok, true);
});

await test("8 — a missing credential refuses even for a provisioned environment", () => {
  const v = E.assertEnvironmentAuthority({
    environment: "staging", capability: "trusted_host.database.migrate", credentialAvailable: false,
  });
  assert.equal(v.refusal, "environment_unprovisioned");
});

// ── Credential boundary ──────────────────────────────────────────────────────

await test("9 — the feature lane cannot obtain the credential, for four independent reasons", () => {
  const b = E.CREDENTIAL_BOUNDARY;
  assert.equal(b.inheritable_by_provider_processes, false);
  assert.equal(b.why_the_feature_lane_cannot_obtain_it.length, 4);
  assert.match(b.lifetime, /unsets DATABASE_URL/);
  assert.ok(b.audited_by.some((a) => /ABSENCE is a distinct exit code/.test(a)));
});

await test("9b — the executor child really does unset and redact, as the boundary claims", () => {
  // The document is only worth what the script does.
  const sh = readFileSync(new URL("../lib/vacilando/trusted-host-apply-migration.sh", import.meta.url), "utf8");
  assert.match(sh, /unset SAFE_DATABASE_URL PGPASSWORD SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(sh, /trusted_credential_unavailable/);
  assert.match(sh, /exit 42/);
  assert.match(sh, /postgresql:\/\/\[redacted\]/, "postgres URLs are scrubbed from stderr");
});

await test("9c — the authority model never reads or transports a secret", () => {
  // It reasons about credential REFERENCES. A module that could open the env
  // file or read process.env would be a module that could leak one.
  const src = readFileSync(new URL("../lib/vacilando/executor-authority.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  for (const forbidden of ["readFileSync", "process.env", "execFile", "spawn(", "require(", "import("]) {
    assert.equal(src.includes(forbidden), false, forbidden);
  }
  // The references it does carry are names, not values.
  for (const spec of Object.values(E.ENVIRONMENT_REGISTRY)) {
    assert.match(spec.credential_ref, /^(ambient|trusted_secret):/, spec.canonical);
    assert.equal(/postgres|password|:\/\//i.test(spec.credential_ref), false, spec.canonical);
  }
});

// ── Content integrity ────────────────────────────────────────────────────────

const APPROVED = Object.freeze({
  repository: "ksquared-16/alloy",
  source_sha: "0f0cf15602bd619adf39b3d613b8c3bf16e6b850",
  migrations: ["20260826120000_h1_person_health_facts.sql", "20260826121000_m1_health_grain_correction.sql", "20260826122000_dh6_health_visibility_permission.sql"],
  environment: "development_certification",
  content_hash: "hash-A",
  approval_identity: "gar_new_exact",
});

await test("10 — identical content in a different ORDER still binds", () => {
  const observed = { ...APPROVED, migrations: [...APPROVED.migrations].reverse() };
  assert.equal(E.bindExecutionToApproval({ approved: APPROVED, observed }).ok, true);
});

await test("11 — same filenames, DIFFERENT SHA, cannot inherit approval", () => {
  // The exact Health & Safety shape.
  const observed = { ...APPROVED, source_sha: "95a76983e4f1d685353b0b3fb1ab7cffad690115" };
  const v = E.bindExecutionToApproval({ approved: APPROVED, observed });
  assert.equal(v.ok, false);
  assert.equal(v.refusal, "content_does_not_match_approval");
  assert.equal(v.mismatches[0].field, "source_sha");
});

await test("11b — every integrity field is actually compared", () => {
  for (const [field, mutate] of [
    ["repository", { repository: "someone/else" }],
    ["migrations", { migrations: [...APPROVED.migrations, "20260827000000_extra.sql"] }],
    ["environment", { environment: "certification" }],
    ["content_hash", { content_hash: "hash-B" }],
    ["approval_identity", { approval_identity: "gar_other" }],
  ]) {
    const v = E.bindExecutionToApproval({ approved: APPROVED, observed: { ...APPROVED, ...mutate } });
    assert.equal(v.ok, false, field);
    assert.equal(v.mismatches[0].field, field);
  }
  assert.deepEqual(E.INTEGRITY_FIELDS.length, 6);
});

await test("11c — an environment ALIAS does not read as a content mismatch", () => {
  const observed = { ...APPROVED, environment: "development-certification" };
  assert.equal(E.bindExecutionToApproval({ approved: APPROVED, observed }).ok, true);
});

// ── Idempotency ──────────────────────────────────────────────────────────────

await test("12 — an exact action that already succeeded converges instead of re-executing", () => {
  const ledger = [{ execution_key: E.executionKey(APPROVED), ok: true, result_ref: "tha_prior" }];
  const d = E.idempotentExecutionDecision({ ...APPROVED, ledger });
  assert.equal(d.execute, false);
  assert.equal(d.reason, "already_executed");
  assert.equal(d.converged_on, "tha_prior");
});

await test("13 — different content is never mistaken for a repeat", () => {
  const ledger = [{ execution_key: E.executionKey(APPROVED), ok: true, result_ref: "tha_prior" }];
  const other = E.idempotentExecutionDecision({ content_hash: "hash-B", environment: "development_certification", ledger });
  assert.equal(other.execute, true);
  // Same content, different ENVIRONMENT, is also not a repeat.
  const elsewhere = E.idempotentExecutionDecision({ content_hash: "hash-A", environment: "staging", ledger });
  assert.equal(elsewhere.execute, true);
});

await test("13b — a FAILED prior execution does not suppress a retry", () => {
  const ledger = [{ execution_key: E.executionKey(APPROVED), ok: false }];
  assert.equal(E.idempotentExecutionDecision({ ...APPROVED, ledger }).execute, true);
});

// ── Real-read verification ───────────────────────────────────────────────────

await test("14 — a real read that returns rows is POSITIVE and carries its proof", () => {
  const v = E.realReadVerdict({ probe: "relation_exists", ran: true, rows: [{ table_name: "person_health_facts" }] });
  assert.equal(v.method, "real_read");
  assert.equal(v.present, true);
  assert.equal(v.rows_read, 1);
  assert.equal(v.capability, "trusted_host.database.read");
});

await test("15 — ZERO rows from a query that RAN is negative, never unknown", () => {
  const v = E.realReadVerdict({ probe: "relation_exists", ran: true, rows: [] });
  assert.equal(v.present, false);
  assert.equal(v.unreadable, undefined);
});

await test("16 — an error, or a probe that did not run, is UNREADABLE, never negative and never positive", () => {
  for (const input of [
    { probe: "relation_exists", ran: false },
    { probe: "relation_exists", ran: true, error: "connection refused" },
    { probe: "relation_exists", ran: true, rows: null },
  ]) {
    const v = E.realReadVerdict(input);
    assert.equal(v.present, null, JSON.stringify(input));
    assert.equal(v.unreadable, true);
  }
});

await test("17 — the verifier's verdicts satisfy the router's proof contract end to end", async () => {
  const dep = G.declareGovernedDependency({
    originating_run_id: "erun_p", requested_capability: "migrate",
    governed_action_key: "database.apply_migration",
    action_inputs: { environment: "development_certification" },
    resume_conditions: E.HEALTH_SAFETY_VERIFICATION,
  }, { now: 1 }).dependency;

  const ok = await G.verifyResumeConditions(dep, {
    readEvidence: async (c) => E.realReadVerdict({ probe: c.kind, ran: true, rows: [{ subject: c.subject }] }),
  });
  assert.equal(ok.verified, true);

  const zero = await G.verifyResumeConditions(dep, {
    readEvidence: async (c) => E.realReadVerdict({ probe: c.kind, ran: true, rows: c.subject === "person_health_facts" ? [{ x: 1 }] : [] }),
  });
  assert.equal(zero.verified, false);
  assert.equal(zero.reason, "conditions_not_met", "a zero-row read is a real negative, not unreadable");

  const down = await G.verifyResumeConditions(dep, {
    readEvidence: async (c) => E.realReadVerdict({ probe: c.kind, ran: true, error: "database unreachable" }),
  });
  assert.equal(down.verified, false);
});

await test("18 — head_count remains rejected whatever the executor claims", async () => {
  const dep = G.declareGovernedDependency({
    originating_run_id: "erun_p", requested_capability: "migrate",
    action_inputs: {}, resume_conditions: E.HEALTH_SAFETY_VERIFICATION,
  }, { now: 1 }).dependency;
  const v = await G.verifyResumeConditions(dep, { readEvidence: async () => ({ method: "head_count", present: true, count: 0 }) });
  assert.equal(v.verified, false);
  assert.equal(v.reason, "evidence_does_not_prove");
});

await test("19 — the verification probes read named relations, not arbitrary SQL", () => {
  for (const [kind, spec] of Object.entries(E.VERIFICATION_PROBES)) {
    assert.ok(spec.reads, kind);
    assert.equal(spec.capability, "trusted_host.database.read", kind);
  }
  const src = readFileSync(new URL("../lib/vacilando/executor-authority.mjs", import.meta.url), "utf8");
  assert.equal(/\bsql\s*[:=]/i.test(src.replace(/^\s*\*.*$/gm, "")), false, "no free-form SQL parameter exists");
});

// ── Operator surface ─────────────────────────────────────────────────────────

await test("20 — the operator label names the executor without exposing implementation", () => {
  const l = E.operatorExecutorLabel("development_certification");
  assert.match(l, /Trusted development\/certification database executor/);
  assert.match(l, /not yet provisioned/);
  assert.equal(/credential|DATABASE_URL|psql|env\.local/i.test(l), false);
  assert.match(E.operatorExecutorLabel("cert"), /Trusted certification database executor$/);
});

// ── Mutations on the real guards ─────────────────────────────────────────────

await test("MUTATION — normalizing development_certification onto certification approves the wrong database", () => {
  // The tempting shortcut: treat it as an alias.
  const mutated = (e) => (e === "development_certification" ? "certification" : E.normalizeEnvironmentId(e));
  assert.equal(mutated("development_certification"), "certification", "the mutation folds them together");
  const mk = (env) => ({ action_key: "database.apply_migration", inputs: { environment: env, migrations: ["m.sql"], expectedSha: "abc1234" } });
  // Under the mutation an approval for certification would satisfy dev/cert.
  assert.notEqual(G.governedContentHash(mk("development_certification")), G.governedContentHash(mk("certification")));
});

await test("MUTATION — dropping the provisioned check executes against a credential that is not there", () => {
  const spec = E.ENVIRONMENT_REGISTRY.development_certification;
  assert.equal(spec.provisioned, false);
  // The mutation: authority = "is it in the registry".
  assert.ok(E.ENVIRONMENT_REGISTRY.development_certification, "the mutation would admit it");
  assert.equal(E.assertEnvironmentAuthority({ environment: "development_certification", capability: "trusted_host.database.migrate" }).ok, false);
});

await test("MUTATION — comparing filenames instead of content lets a different SHA execute", () => {
  const observed = { ...APPROVED, source_sha: "95a76983e4f1d685353b0b3fb1ab7cffad690115" };
  const byFilename = JSON.stringify([...APPROVED.migrations].sort()) === JSON.stringify([...observed.migrations].sort());
  assert.equal(byFilename, true, "the mutation sees a match");
  assert.equal(E.bindExecutionToApproval({ approved: APPROVED, observed }).ok, false);
});

await test("MUTATION — treating zero rows as unreadable would let a retry look like a transient", () => {
  const mutated = (rows) => ({ present: rows.length > 0 ? true : null });
  assert.equal(mutated([]).present, null, "the mutation hides a real negative as a blip");
  assert.equal(E.realReadVerdict({ probe: "relation_exists", ran: true, rows: [] }).present, false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
