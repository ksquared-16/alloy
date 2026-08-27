#!/usr/bin/env node
/**
 * Trusted-host assignment of application access for one managed QA identity.
 *
 * Provisioning creates an auth account; this grants it a place in the application. They are separate
 * because they are separate decisions: an account that can sign in but reach nothing is a safe
 * default, and access should be granted deliberately rather than as a side effect of creation.
 *
 * The organization is DERIVED, never supplied. It is the organization that existing staging admins
 * already belong to, and it must be unambiguous: if the directory shows zero or several such
 * organizations this refuses rather than picking one, because guessing which tenant a QA identity
 * joins is exactly the mistake that would matter.
 *
 * Prints METADATA ONLY - ids and counts, never tokens, keys or provider payloads.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCanonicalRepoRoot } from "./lib/vacilando/trusted-host-action-registry.mjs";

function fail(code, detail) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: code, detail: detail ? String(detail).slice(0, 300) : null })}\n`);
    process.exit(1);
}

const REPO_ROOT = resolveCanonicalRepoRoot();
const webRequire = createRequire(join(REPO_ROOT, "web", "package.json"));
let createClient;
try {
    ({ createClient } = webRequire("@supabase/supabase-js"));
} catch (e) {
    fail("dependencies_unresolved", e?.message);
}

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };

const identity = arg("identity");
const envSource = arg("env-source");
const slot = arg("slot");
const role = arg("role");
if (!identity || !envSource || !slot || !role) fail("bad_arguments", "identity, env-source, slot and role are required");

// Second, independent check on the identity shape, as in provisioning: this must never be able to
// grant access to a customer or employee account even if a registry were misconfigured.
if (!/^qa-slot[1-6]-[a-z0-9-]+@/i.test(identity)) {
    fail("identity_not_managed_qa_shape", "only registered slot QA identities may be assigned access");
}
if (role !== "admin") fail("role_not_permitted", "only the admin role is authorized for this action");

function readTrustedEnv(path) {
    let text;
    try { text = readFileSync(path, "utf8"); } catch (e) { return fail("trusted_env_unreadable", e?.message); }
    const out = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        out[m[1]] = v;
    }
    return out;
}

const env = readTrustedEnv(envSource);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) fail("trusted_env_incomplete", "missing supabase url or service role key");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

/** Walk the whole directory; a single page would make "absent" mean "absent from page one". */
const PER_PAGE = 200;
const MAX_PAGES = 50;
let user = null;
for (let page = 1; page <= MAX_PAGES && !user; page++) {
    const list = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE }).catch((e) => ({ error: e }));
    if (list?.error) fail("directory_read_failed", list.error.message);
    const users = list?.data?.users || [];
    user = users.find((u) => String(u.email || "").toLowerCase() === identity.toLowerCase()) || null;
    if (users.length < PER_PAGE) break;
}
if (!user) fail("identity_not_registered", "provision the identity before assigning access");

/*
 * Derive the canonical staging organization.
 *
 * The organization QA admins already belong to IS the canonical one — that is what "the same
 * organization used by Slot 5's real Work Views and existing staging QA admin fixtures" means in
 * data. Ambiguity is refused rather than resolved: with several candidates there is no evidence for
 * choosing, and a wrong tenant is not a recoverable mistake.
 */
const roles = await admin.from("user_roles").select("user_id, org_id, role").eq("role", role);
if (roles.error) fail("user_roles_read_failed", roles.error.message);
const rows = Array.isArray(roles.data) ? roles.data : [];
const existingForUser = rows.filter((r) => r.user_id === user.id);
const candidateOrgs = [...new Set(rows.map((r) => r.org_id).filter(Boolean))];

if (existingForUser.length > 0) {
    // Idempotent: already assigned. Nothing is mutated, and a duplicate is reported as a failure
    // below rather than quietly accepted.
    if (existingForUser.length > 1) {
        fail("duplicate_membership", `expected at most one ${role} row, found ${existingForUser.length}`);
    }
    process.stdout.write(`${JSON.stringify({
        ok: true, result: "already_exists", mutated: false,
        user_id: user.id, org_id: existingForUser[0].org_id, role,
        memberships_for_user: existingForUser.length,
        candidate_orgs_seen: candidateOrgs.length,
    })}\n`);
    process.exit(0);
}

if (candidateOrgs.length === 0) fail("no_canonical_org_found", `no existing ${role} membership to derive the organization from`);
if (candidateOrgs.length > 1) {
    fail("canonical_org_ambiguous", `${candidateOrgs.length} organizations have ${role} members; refusing to choose`);
}
const orgId = candidateOrgs[0];

const inserted = await admin.from("user_roles").insert({ user_id: user.id, org_id: orgId, role }).select("user_id, org_id, role");
if (inserted.error) fail("assignment_failed", inserted.error.message);

// Prove the post-condition rather than assume it: exactly one membership for this user.
const after = await admin.from("user_roles").select("user_id, org_id, role").eq("user_id", user.id);
if (after.error) fail("verify_read_failed", after.error.message);
const mine = Array.isArray(after.data) ? after.data : [];
if (mine.length !== 1) fail("post_condition_failed", `expected exactly one membership, found ${mine.length}`);
if (mine[0].org_id !== orgId || mine[0].role !== role) fail("post_condition_failed", "membership does not match the requested assignment");

process.stdout.write(`${JSON.stringify({
    ok: true, result: "assigned", mutated: true,
    user_id: user.id, org_id: orgId, role,
    memberships_for_user: mine.length,
    candidate_orgs_seen: candidateOrgs.length,
})}\n`);
