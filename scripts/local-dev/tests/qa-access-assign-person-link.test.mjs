/**
 * W7-F002 (Director, 2026-10-09): QA provisioning follows the production rule — Person → explicit link →
 * money-capable role — and never infers who a login is from an email address.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "vac-qa-access-assign.mjs"), "utf8");

test("the person link is ensured before the role row is written", () => {
    const link = src.indexOf("const identityLink = await ensureQaPersonLink(orgId, user.id, identity);");
    const role = src.indexOf('await admin.from("user_roles").insert(');
    assert.ok(link > 0 && role > 0, "both steps present");
    assert.ok(link < role, "Person → link happens before the role is assigned");
});

test("an existing QA admin is converged on the idempotent path too", () => {
    const idem = src.indexOf('result: "already_exists"');
    const converge = src.indexOf("ensureQaPersonLink(existingForUser[0].org_id, user.id, identity)");
    assert.ok(converge > 0 && converge < idem);
});

test("the QA person is a keyed fixture, never found by email", () => {
    const fn = src.slice(src.indexOf("async function ensureQaPersonLink"), src.indexOf("/* Existing memberships"));
    assert.match(fn, /\.eq\("external_source", QA_PERSON_SOURCE\)\.eq\("external_id", managedIdentity\)/);
    assert.doesNotMatch(fn, /\.eq\("email"|\.ilike\("email"|email:/, "no person lookup or write by email");
});

test("an existing link is respected, never re-pointed", () => {
    const fn = src.slice(src.indexOf("async function ensureQaPersonLink"), src.indexOf("/* Existing memberships"));
    assert.match(fn, /if \(existing\.data\?\.person_id\) return \{ person_id: existing\.data\.person_id, link: "existing" \};/);
    assert.doesNotMatch(fn, /\.update\(/, "the helper never rewrites an existing link or person");
});
