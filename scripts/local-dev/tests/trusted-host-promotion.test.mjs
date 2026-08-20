#!/usr/bin/env node
/**
 * Trusted-host merge + migration bounds. No live GitHub or database.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const runtimeRoot = mkdtempSync(join(tmpdir(), "tha-promo-"));
process.env.ALLOY_RUNTIME_ROOT = runtimeRoot;
process.env.VACILANDO_GITHUB_REPOSITORY = "ksquared-16/alloy";

const {
  ACTION_TYPES,
  getActionDefinition,
  listRegisteredActions,
} = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
  validateMergeInputs,
  inspectPullRequest,
  evaluateMergeReadiness,
  mergePullRequest,
  classifyStatusCheck,
  classifyCheckState,
  summarizeCheckRollup,
} = await import("../lib/vacilando/trusted-host-merge.mjs");
const {
  validateMigrationInputs,
  applyMigrationBatch,
  ACCESS_IDENTITY_STAGING_MIGRATIONS,
  CANONICAL_MIGRATION_DIR,
} = await import("../lib/vacilando/trusted-host-migrate.mjs");

const registered = listRegisteredActions().map((a) => a.actionType);
assert.equal(registered.includes(ACTION_TYPES.DATABASE_READ_CENSUS), true);
assert.equal(registered.includes(ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST), true);
assert.equal(registered.includes(ACTION_TYPES.DATABASE_APPLY_MIGRATION), true);
assert.equal(registered.includes("repository.run_command"), false);
assert.equal(registered.includes("database.execute_sql"), false);

assert.equal(validateMergeInputs({
  repository: "ksquared-16/alloy",
  pull_request_number: 475,
  target_branch: "production",
  expected_head_sha: "5ec35b824aaaa",
}).code, "production_target_rejected");
assert.equal(validateMergeInputs({
  repository: "evil/repo",
  pull_request_number: 475,
  target_branch: "staging",
  expected_head_sha: "5ec35b824aaaa",
}).code, "repository_not_allowlisted");
assert.equal(validateMergeInputs({
  repository: "ksquared-16/alloy",
  pull_request_number: 475,
  target_branch: "staging",
  expected_head_sha: "5ec35b824aaaa",
  command: "gh pr merge 475",
}).code, "arbitrary_command_rejected");

const defMerge = getActionDefinition(ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST);
assert.equal(defMerge.validateInputs({
  repository: "ksquared-16/alloy",
  pull_request_number: 475,
  target_branch: "staging",
  expected_head_sha: "5ec35b824aaaaaaa",
}).ok, true);

const head = "5ec35b824aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const openPr = {
  number: 475,
  title: "Access & Identity V2",
  url: "https://github.com/ksquared-16/alloy/pull/475",
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  baseRefName: "staging",
  headRefOid: head,
  statusCheckRollup: [{ name: "ci", conclusion: "SUCCESS", isRequired: true }],
  mergeCommit: null,
};

function ghFor(pr, { mergeStatus = 0, mergeErr = "" } = {}) {
  return (args) => {
    if (args.includes("view")) return { status: 0, stdout: JSON.stringify(pr), stderr: "" };
    if (args.includes("merge")) return { status: mergeStatus, stdout: mergeStatus === 0 ? "ok" : "", stderr: mergeErr };
    return { status: 1, stderr: "unexpected gh argv", stdout: "" };
  };
}

const mergeInputs = {
  repository: "ksquared-16/alloy",
  pull_request_number: 475,
  target_branch: "staging",
  expected_head_sha: head,
};

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor(openPr) })).ok, true);
assert.equal(evaluateMergeReadiness(inspectPullRequest({
  ...mergeInputs,
  expected_head_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
}, { gh: ghFor(openPr) })).code, "stale_expected_head");
assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  statusCheckRollup: [{ name: "ci", conclusion: "FAILURE", isRequired: true }],
}) })).code, "required_checks_failed");

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [
    { name: "Docs lint (narrow blocking)", conclusion: "SUCCESS", status: "COMPLETED" },
    { name: "Vercel – firefly-early-learning", state: "SUCCESS" },
    { name: "Vercel – workwithalloy", state: "SUCCESS" },
    { name: "Supabase Preview", conclusion: "SKIPPED", status: "COMPLETED" },
  ],
}) })).ok, true);

assert.equal(classifyCheckState({ name: "ci", conclusion: "SUCCESS", status: "COMPLETED" }).state, "success");
assert.equal(classifyCheckState({ name: "optional", conclusion: "SKIPPED", status: "COMPLETED" }).state, "neutral");
assert.equal(classifyCheckState({ context: "Vercel – firefly-early-learning", state: "SUCCESS" }).state, "success");
assert.equal(classifyCheckState({ context: "Vercel – workwithalloy", state: "SUCCESS" }).state, "success");
assert.equal(classifyCheckState({ context: "deploy", state: "PENDING" }).state, "pending");
assert.equal(classifyCheckState({ name: "ci", conclusion: "FAILURE", status: "COMPLETED" }).state, "failure");
assert.equal(classifyCheckState({ name: "ci", conclusion: "CANCELLED", status: "COMPLETED" }).state, "failure");
assert.equal(classifyCheckState({ name: "ci", status: "IN_PROGRESS" }).state, "pending");
assert.equal(classifyCheckState({ name: "ci", status: "COMPLETED" }).state, "unknown");
assert.equal(classifyCheckState({ name: "empty" }).state, "unknown");
assert.equal(classifyCheckState({ name: "ci", conclusion: "SUCCESS" }).required, "unknown");
assert.equal(classifyCheckState({ name: "ci", conclusion: "SUCCESS", isRequired: true }).required, true);
assert.equal(classifyCheckState({ name: "ci", conclusion: "SUCCESS", isRequired: false }).required, false);

assert.equal(classifyStatusCheck({ name: "ci", conclusion: "SUCCESS", status: "COMPLETED" }).class, "complete");
assert.equal(classifyStatusCheck({ name: "optional", conclusion: "SKIPPED", status: "COMPLETED" }).class, "complete");
assert.equal(classifyStatusCheck({ context: "Vercel – firefly-early-learning", state: "SUCCESS" }).class, "complete");
assert.equal(classifyStatusCheck({ context: "Vercel – workwithalloy", state: "SUCCESS" }).class, "complete");
assert.equal(classifyStatusCheck({ context: "deploy", state: "PENDING" }).class, "pending");
assert.equal(classifyStatusCheck({ name: "ci", conclusion: "FAILURE", status: "COMPLETED" }).class, "failing");
assert.equal(classifyStatusCheck({ name: "ci", conclusion: "CANCELLED", status: "COMPLETED" }).class, "failing");
assert.equal(classifyStatusCheck({ name: "ci", status: "IN_PROGRESS" }).class, "pending");
assert.equal(classifyStatusCheck({ name: "ci", status: "COMPLETED" }).class, "unknown");

const mixed = summarizeCheckRollup([
  { name: "ci", conclusion: "SUCCESS", status: "COMPLETED" },
  { name: "lint", conclusion: "SKIPPED", status: "COMPLETED" },
  { context: "Vercel – firefly-early-learning", state: "SUCCESS" },
  { context: "Vercel – workwithalloy", state: "SUCCESS" },
]);
assert.equal(mixed.pending.length, 0);
assert.equal(mixed.failing.length, 0);
assert.equal(mixed.passing, 0);
assert.equal(mixed.items.filter((row) => row.state === "success" || row.state === "neutral").length, 4);

const requiredGreen = summarizeCheckRollup([
  { name: "Trust Adoption certification", conclusion: "SUCCESS", status: "COMPLETED", isRequired: true },
  { name: "Trust DB certification", conclusion: "SUCCESS", status: "COMPLETED", isRequired: true },
  { context: "Vercel – workwithalloy", state: "SUCCESS", isRequired: false },
]);
assert.equal(requiredGreen.required, 2);
assert.equal(requiredGreen.passing, 2);
assert.equal(requiredGreen.pending.length, 0);

assert.equal(summarizeCheckRollup([
  { name: "optional", status: "IN_PROGRESS", isRequired: false },
  { name: "Trust DB certification", conclusion: "SUCCESS", status: "COMPLETED", isRequired: true },
]).pending.length, 0);

assert.equal(summarizeCheckRollup([
  { name: "Trust DB certification", status: "COMPLETED", isRequired: true },
]).unknown.join(), "Trust DB certification");

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [
    { name: "ci", conclusion: "SUCCESS", status: "COMPLETED" },
    { context: "Vercel – firefly-early-learning", state: "SUCCESS" },
  ],
}) })).ok, true);

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [
    { name: "ci", conclusion: "FAILURE", status: "COMPLETED", isRequired: true },
    { context: "Vercel – workwithalloy", state: "SUCCESS" },
  ],
}) })).code, "required_checks_failed");

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  mergeStateStatus: "BLOCKED",
  statusCheckRollup: [
    { name: "ci", status: "IN_PROGRESS" },
    { context: "Vercel – firefly-early-learning", state: "SUCCESS" },
  ],
}) })).code, "required_checks_indeterminate");

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  mergeStateStatus: "BLOCKED",
  statusCheckRollup: [
    { name: "ci", status: "IN_PROGRESS", isRequired: true },
    { context: "Vercel – firefly-early-learning", state: "SUCCESS", isRequired: false },
  ],
}) })).code, "required_checks_pending");

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  mergeStateStatus: "CLEAN",
  mergeable: "MERGEABLE",
  headRefOid: head,
  statusCheckRollup: [
    { __typename: "CheckRun", name: "Docs lint (narrow blocking)", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", name: "Trust Adoption certification", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", name: "Trust DB certification", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", name: "Supabase Preview", status: "COMPLETED", conclusion: "SKIPPED" },
    { __typename: "StatusContext", context: "Vercel – firefly-early-learning", state: "SUCCESS" },
    { __typename: "StatusContext", context: "Vercel – workwithalloy", state: "SUCCESS" },
  ],
}) })).ok, true);

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  statusCheckRollup: [
    { name: "Trust DB certification", status: "COMPLETED", isRequired: true },
  ],
}) })).code, "required_checks_indeterminate");

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  expectedHeadSha: head,
  headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
}) })).code, "stale_expected_head");

assert.equal(evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [
    { name: "optional lint", conclusion: "FAILURE", status: "COMPLETED", isRequired: false },
    { name: "Trust DB certification", conclusion: "SUCCESS", status: "COMPLETED", isRequired: true },
  ],
}) })).ok, true);

assert.equal(validateMergeInputs({
  repository: "ksquared-16/alloy",
  pull_request_number: 479,
  target_branch: "staging",
  expected_head_sha: head,
  force: true,
}).code, "force_merge_rejected");
assert.equal(validateMergeInputs({
  repository: "ksquared-16/alloy",
  pull_request_number: 479,
  target_branch: "staging",
  expected_head_sha: head,
  admin: true,
}).code, "force_merge_rejected");
assert.equal(validateMergeInputs({
  repository: "ksquared-16/alloy",
  pull_request_number: 479,
  target_branch: "staging",
  expected_head_sha: head,
  bypass_checks: true,
}).code, "force_merge_rejected");

const graphqlShaped = evaluateMergeReadiness(inspectPullRequest(mergeInputs, {
  gh: () => ({
    status: 0,
    stdout: JSON.stringify({
      number: 479,
      title: "repair",
      url: "https://github.com/ksquared-16/alloy/pull/479",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      baseRefName: "staging",
      headRefOid: head,
      statusCheckRollup: [
        { name: "Production graph", conclusion: "SUCCESS", status: "COMPLETED" },
        { context: "Vercel – firefly-early-learning", state: "SUCCESS" },
      ],
      mergeCommit: null,
    }),
    stderr: "",
  }),
}));
assert.equal(graphqlShaped.ok, true, graphqlShaped.detail || graphqlShaped.code);
assert.equal(graphqlShaped.pr.checks.pending.length, 0);

const alreadySameHead = mergePullRequest(mergeInputs, {
  gh: ghFor({ ...openPr, state: "MERGED", mergeCommit: { oid: "abc123mergedabc123mergedabc123mergedabc1" }, headRefOid: head }),
});
assert.equal(alreadySameHead.ok, true);
assert.equal(alreadySameHead.idempotent, true);

const alreadyDifferent = evaluateMergeReadiness(inspectPullRequest(mergeInputs, { gh: ghFor({
  ...openPr,
  state: "MERGED",
  headRefOid: "ffffffffffffffffffffffffffffffffffffffff",
  mergeCommit: { oid: "ffffffffffffffffffffffffffffffffffffffff" },
}) }));
assert.equal(alreadyDifferent.code, "already_merged_different_head");

const already = mergePullRequest(mergeInputs, {
  gh: ghFor({ ...openPr, state: "MERGED", mergeCommit: { oid: "abc123mergedabc123mergedabc123mergedabc1" } }),
});
assert.equal(already.ok, true);
assert.equal(already.idempotent, true);

const repo = mkdtempSync(join(tmpdir(), "mig-repo-"));
mkdirSync(join(repo, CANONICAL_MIGRATION_DIR), { recursive: true });
const v1 = "20260818170000_w13_collapse_portal_eligible.sql";
const v2 = "20260818180000_w61_role_key_fk_restrict_no_cascade.sql";
const t1 = "-- one\nselect 1;\n";
const t2 = "-- two\nselect 2;\n";
writeFileSync(join(repo, CANONICAL_MIGRATION_DIR, v1), t1);
writeFileSync(join(repo, CANONICAL_MIGRATION_DIR, v2), t2);

assert.equal(validateMigrationInputs({
  environment: "production",
  expected_sha: "5ec35b824aaaa",
  migrations: [{ version: "20260818170000", path: `${CANONICAL_MIGRATION_DIR}/${v1}` }],
}, { repoRoot: repo }).code, "production_database_rejected");

assert.equal(validateMigrationInputs({
  environment: "staging",
  expected_sha: "5ec35b824aaaa",
  sql: "drop table users",
  migrations: [{ version: "20260818170000", path: `${CANONICAL_MIGRATION_DIR}/${v1}` }],
}, { repoRoot: repo }).code, "arbitrary_sql_rejected");

assert.equal(validateMigrationInputs({
  environment: "staging",
  expected_sha: "5ec35b824aaaa",
  migrations: [{ version: "20260818170000", path: "docs/secret.sql" }],
}, { repoRoot: repo }).code, "outside_canonical_directory");

assert.equal(validateMigrationInputs({
  environment: "staging",
  expected_sha: "5ec35b824aaaa",
  migrations: [
    { version: "20260818170000", path: `${CANONICAL_MIGRATION_DIR}/${v1}` },
    { version: "20260818170000", path: `${CANONICAL_MIGRATION_DIR}/${v1}` },
  ],
}, { repoRoot: repo }).code, "version_collision");

const approvedSha = "5ec35b824aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const files = {
  [`${CANONICAL_MIGRATION_DIR}/${v1}`]: t1,
  [`${CANONICAL_MIGRATION_DIR}/${v2}`]: t2,
};
const git = (args) => {
  const [cmd, a1] = args;
  if (cmd === "cat-file") return { status: 0, stdout: "" };
  if (cmd === "rev-parse") return { status: 0, stdout: `${approvedSha}\n` };
  if (cmd === "merge-base") return { status: 0, stdout: "" };
  if (cmd === "fetch") return { status: 0, stdout: "" };
  if (cmd === "ls-tree") return { status: 0, stdout: `${Object.keys(files).join("\n")}\n` };
  if (cmd === "show") {
    const rel = String(a1 || "").split(":").slice(1).join(":");
    return files[rel] != null ? { status: 0, stdout: files[rel] } : { status: 128, stdout: "", stderr: "missing" };
  }
  return { status: 1, stdout: "", stderr: `unmocked ${args.join(" ")}` };
};
const batch = validateMigrationInputs({
  environment: "staging",
  expected_sha: approvedSha,
  migrations: [
    { version: "20260818170000", path: `${CANONICAL_MIGRATION_DIR}/${v1}` },
    { version: "20260818180000", path: `${CANONICAL_MIGRATION_DIR}/${v2}` },
  ],
}, { repoRoot: repo, git, fetchIfMissing: false });
assert.equal(batch.ok, true, batch.detail || batch.code);

const applied = new Set();
const ran = applyMigrationBatch(batch.normalized, {
  inspectLedger: ({ version }) => ({ applied: applied.has(version) }),
  applyFile: ({ entry }) => {
    if (entry.version === "20260818180000") return { ok: false, code: "apply_failed", detail: "boom" };
    applied.add(entry.version);
    return { ok: true, ledger: "applied" };
  },
  readContent: ({ relative }) => ({
    ok: true,
    text: relative.endsWith(v1) ? t1 : t2,
  }),
});
assert.equal(ran.ok, false);
assert.equal(ran.stopped, true);
assert.equal(ran.results.filter((r) => r.ok).length, 1);

applied.add("20260818170000");
const again = applyMigrationBatch({
  ...batch.normalized,
  migrations: [batch.normalized.migrations[0]],
}, {
  inspectLedger: ({ version }) => ({ applied: applied.has(version) }),
  applyFile: () => { throw new Error("should not apply"); },
  readContent: () => ({ ok: true, text: t1 }),
});
assert.equal(again.ok, true);
assert.equal(again.results[0].idempotent, true);

assert.equal(ACCESS_IDENTITY_STAGING_MIGRATIONS.length, 10);
assert.equal(ACCESS_IDENTITY_STAGING_MIGRATIONS.some((m) => m.version === "20260819130000"), false);

console.log("ok - trusted-host promotion bounds");
