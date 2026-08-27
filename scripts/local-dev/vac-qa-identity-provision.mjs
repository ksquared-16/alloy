#!/usr/bin/env node
/**
 * Trusted-host provisioning of one managed QA identity. Runs INSIDE the trusted boundary.
 *
 * Registered slot QA identities are managed, non-human accounts in hosted staging. They are machine
 * identifiers, not mailboxes: no mail is sent, no human ever signs in, and no password is created
 * for anyone to hold. The identity to create is resolved from the slot registry by the caller and
 * passed here; this process never accepts an address from a request.
 *
 * IDEMPOTENT BY CONSTRUCTION. The directory is read in full before and after. If the identity is
 * already present the process mutates nothing and says so, and the post-read proves the account
 * exists EXACTLY ONCE — a provisioning step that could quietly create a second account for the same
 * address would make every later "which session is this" question unanswerable.
 *
 * Prints METADATA ONLY. There is no field in the output that could carry a password, token or link.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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
const lane = arg("lane");
if (!identity || !envSource || !slot || !lane) fail("bad_arguments", "identity, env-source, slot and lane are required");

/**
 * Refuse anything that is not a managed QA identity, here as well as in the guard module.
 *
 * The caller already resolved this from the registry, so this is a second, independent line: a
 * future caller that resolved wrongly still cannot make this process create a customer account.
 */
if (!/^qa-slot[1-6]-[a-z0-9-]+@/i.test(identity)) {
    fail("identity_not_managed_qa_shape", "only registered slot QA identities may be provisioned");
}

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

const PER_PAGE = 200;
const MAX_PAGES = 50;

/** Walk the WHOLE directory. A single page would make "absent" mean "absent from page one". */
async function findAll(email) {
    const matches = [];
    let scanned = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
        const list = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE }).catch((e) => ({ error: e }));
        if (list?.error) fail("directory_read_failed", list.error.message);
        const users = list?.data?.users || [];
        scanned += users.length;
        for (const u of users) {
            if (String(u.email || "").toLowerCase() === email.toLowerCase()) matches.push(u);
        }
        if (users.length < PER_PAGE) break;
    }
    return { matches, scanned };
}

const before = await findAll(identity);
if (before.matches.length > 0) {
    // Idempotent: already provisioned, nothing mutated.
    process.stdout.write(`${JSON.stringify({
        ok: true,
        result: "already_exists",
        mutated: false,
        occurrences: before.matches.length,
        directory_entries_scanned: before.scanned,
        managed_by: "alloy",
        slot: Number(slot),
    })}\n`);
    process.exit(0);
}

/*
 * A password is required by the provider, never by a person.
 *
 * It is generated here, handed straight to the create call, and goes out of scope immediately. It is
 * never printed, returned, logged or written down, and nobody — operator or agent — is expected to
 * know it. The ordinary session comes from the magic-link restore, which needs no password at all.
 */
const throwaway = randomBytes(48).toString("base64url");
const created = await admin.auth.admin.createUser({
    email: identity,
    password: throwaway,
    email_confirm: true,
    app_metadata: { managed_by: "alloy", purpose: "qa", environment: "staging", non_production: true, slot: Number(slot) },
    user_metadata: { managed_by: "alloy", qa_only: true, registered_slot: Number(slot), registered_lane: lane },
}).catch((e) => ({ error: e }));
if (created?.error) fail("create_failed", created.error.message);

// Prove the post-condition rather than assume it: exactly one account for this address.
const after = await findAll(identity);
if (after.matches.length !== 1) {
    fail("post_condition_failed", `expected exactly one account, found ${after.matches.length}`);
}

process.stdout.write(`${JSON.stringify({
    ok: true,
    result: "created",
    mutated: true,
    occurrences: after.matches.length,
    directory_entries_scanned: after.scanned,
    email_confirmed: true,
    email_sent: false,
    password_exposed: false,
    managed_by: "alloy",
    slot: Number(slot),
})}\n`);
