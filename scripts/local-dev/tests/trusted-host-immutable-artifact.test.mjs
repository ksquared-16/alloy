#!/usr/bin/env node
/**
 * Governed migration artifacts resolve from Git objects, never a dirty checkout.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const {
  CANONICAL_MIGRATION_DIR,
  ACCESS_IDENTITY_STAGING_MIGRATIONS,
  PRIVILEGED_DEPLOYMENT_WORKING_COPY_INVARIANT,
  validateMigrationInputs,
  readMigrationContent,
  applyMigrationBatch,
} = await import("../lib/vacilando/trusted-host-migrate.mjs");

function sha256(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || args.join(" "));
  return String(r.stdout || "").trim();
}

function porcelain(cwd) {
  return spawnSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).stdout;
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), "imm-art-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "vacilando@example.test"]);
  git(dir, ["config", "user.name", "Vacilando"]);
  mkdirSync(join(dir, CANONICAL_MIGRATION_DIR), { recursive: true });
  return dir;
}

function commitFile(dir, relative, text, message) {
  writeFileSync(join(dir, relative), text);
  git(dir, ["add", relative]);
  git(dir, ["commit", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}

const dir = initRepo();
const rel1 = `${CANONICAL_MIGRATION_DIR}/20260818170000_w13_collapse_portal_eligible.sql`;
const rel2 = `${CANONICAL_MIGRATION_DIR}/20260818180000_w61_role_key_fk_restrict_no_cascade.sql`;
const committedBody = "-- committed\nselect 1;\n";
const dirtyBody = "-- dirty working copy must be ignored\nselect 999;\n";
const shaA = commitFile(dir, rel1, committedBody, "add w13");
const shaB = commitFile(dir, rel2, "-- two\nselect 2;\n", "add w61");
git(dir, ["update-ref", "refs/remotes/origin/staging", shaB]);

writeFileSync(join(dir, rel1), dirtyBody);
writeFileSync(join(dir, "untracked-noise.sql"), "-- untracked\n");
writeFileSync(join(dir, rel2), "-- modified sibling\n");
const dirtyBefore = porcelain(dir);
assert.match(dirtyBefore, /untracked-noise/);

const resolved = readMigrationContent({
  root: dir,
  sha: shaA,
  relative: rel1,
  fetchIfMissing: false,
});
assert.equal(resolved.ok, true, resolved.detail);
assert.equal(resolved.source, "git_object");
assert.equal(resolved.text, committedBody);
assert.notEqual(resolved.text, dirtyBody);

const batch = validateMigrationInputs({
  environment: "staging",
  expected_sha: shaB,
  migrations: [
    { version: "20260818170000", path: rel1 },
    { version: "20260818180000", path: rel2 },
  ],
}, { repoRoot: dir, fetchIfMissing: false, stagingRef: "origin/staging" });
assert.equal(batch.ok, true, batch.detail || batch.code);
assert.equal(batch.normalized.artifactSource, "git_object");
assert.equal(batch.normalized.migrations[0].fileSha, sha256(committedBody));
assert.notEqual(batch.code, "dirty_worktree");

assert.equal(validateMigrationInputs({
  environment: "staging",
  expected_sha: shaB,
  migrations: [{ version: "20260818170000", path: `${CANONICAL_MIGRATION_DIR}/../secret.sql` }],
}, { repoRoot: dir, fetchIfMissing: false }).code, "path_escape");

assert.equal(validateMigrationInputs({
  environment: "staging",
  expected_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  migrations: [{ version: "20260818170000", path: rel1 }],
}, { repoRoot: dir, fetchIfMissing: false }).code, "source_sha_unavailable");

assert.equal(readMigrationContent({
  root: dir,
  sha: shaB,
  relative: `${CANONICAL_MIGRATION_DIR}/20260819999999_missing.sql`,
  fetchIfMissing: false,
}).code, "migration_missing_at_sha");

commitFile(dir, rel1, "-- changed after approval\nselect 3;\n", "change w13");
const shaC = git(dir, ["rev-parse", "HEAD"]);
git(dir, ["update-ref", "refs/remotes/origin/staging", shaC]);
const changed = validateMigrationInputs({
  environment: "staging",
  expected_sha: shaB,
  migrations: [
    { version: "20260818170000", path: rel1 },
    { version: "20260818180000", path: rel2 },
  ],
}, { repoRoot: dir, fetchIfMissing: false, stagingRef: "origin/staging" });
assert.equal(changed.ok, false);
assert.equal(changed.code, "migration_changed_since_approval");

writeFileSync(join(dir, rel1), committedBody);
git(dir, ["add", rel1]);
git(dir, ["commit", "-m", "staging advanced, bytes identical"]);
const shaD = git(dir, ["rev-parse", "HEAD"]);
git(dir, ["update-ref", "refs/remotes/origin/staging", shaD]);
const stillValid = validateMigrationInputs({
  environment: "staging",
  expected_sha: shaB,
  migrations: [
    { version: "20260818170000", path: rel1 },
    { version: "20260818180000", path: rel2 },
  ],
}, { repoRoot: dir, fetchIfMissing: false, stagingRef: "origin/staging" });
assert.equal(stillValid.ok, true, stillValid.detail || stillValid.code);

const hashMismatch = applyMigrationBatch(batch.normalized, {
  inspectLedger: () => ({ applied: false }),
  applyFile: () => ({ ok: true, ledger: "applied" }),
  readContent: () => ({ ok: true, text: dirtyBody, source: "git_object" }),
});
assert.equal(hashMismatch.ok, false);
assert.equal(hashMismatch.results[0].code, "artifact_hash_mismatch");

const dirtyAfter = porcelain(dir);
assert.equal(dirtyAfter.includes("untracked-noise.sql"), true);
assert.equal(PRIVILEGED_DEPLOYMENT_WORKING_COPY_INVARIANT.dirtyWorktreeIsNotABlocker, true);

const liveSha = "63aa211ce086ac73caae94b0183a7c1fe5cc6f6a";
const liveRoot = join(fileURLToPath(new URL("../../..", import.meta.url)));
const liveProbe = spawnSync("git", ["cat-file", "-e", `${liveSha}^{commit}`], { cwd: liveRoot });
if (liveProbe.status === 0) {
  const alloy = "/Users/Kelly/Alloy";
  const alloyBefore = spawnSync("git", ["status", "--porcelain"], { cwd: alloy, encoding: "utf8" });
  const ten = [
    "supabase/migrations/20260818170000_w13_collapse_portal_eligible_fifth_layer_grants.sql",
    "supabase/migrations/20260818180000_w61_role_key_fk_restrict_no_cascade.sql",
    "supabase/migrations/20260818190000_w16_user_roles_role_foreign_key.sql",
    "supabase/migrations/20260818220000_s3_action_link_token_hash.sql",
    "supabase/migrations/20260818230000_s3_action_link_token_drop_plaintext.sql",
    "supabase/migrations/20260818240000_w60_m20_drop_catalog_compatibility_views.sql",
    "supabase/migrations/20260819120000_w13_i35b_analytics_read_preservation.sql",
    "supabase/migrations/20260819140000_od8_ops_users_roles_read_preservation.sql",
    "supabase/migrations/20260820130000_w28_replace_role_permission_grants_rpc.sql",
    "supabase/migrations/20260820140000_w58_save_role_definition_and_grants.sql",
  ];
  const live = validateMigrationInputs({
    environment: "staging",
    expected_sha: liveSha,
    migrations: ten.map((path) => ({
      version: path.replace("supabase/migrations/", "").slice(0, 14),
      path,
    })),
  }, { repoRoot: liveRoot, fetchIfMissing: false, stagingRef: "origin/staging" });
  assert.equal(live.ok, true, live.detail || live.code);
  assert.equal(live.normalized.migrations.length, 10);
  assert.equal(live.normalized.artifactSource, "git_object");
  assert.equal(ACCESS_IDENTITY_STAGING_MIGRATIONS.length, 10);
  const alloyAfter = spawnSync("git", ["status", "--porcelain"], { cwd: alloy, encoding: "utf8" });
  assert.equal(alloyAfter.stdout, alloyBefore.stdout, "Alloy working copy must not change");
  assert.match(String(alloyBefore.stdout || ""), /\S/, "Alloy checkout must remain dirty for this proof");
}

console.log("ok - trusted-host immutable migration artifacts");
