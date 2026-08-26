#!/usr/bin/env node
/**
 * Trusted-host QA session minting. Runs INSIDE the trusted boundary; the agent only starts it.
 *
 * Mints a single-use magic link for one registered slot QA identity, redeems it immediately, and
 * writes the resulting Playwright storage state to the slot's state path at 0600. It prints
 * METADATA ONLY. No link, token, session or cookie is ever printed, logged, returned or passed as
 * an argument — the identity and slot arrive by argv, and the privileged keys are read here, from
 * the trusted env source, and never leave this process.
 *
 * Why a magic link rather than a password: the operator should not know or manage a password for a
 * machine identity, and a rotated password would have to exist somewhere for someone. A magic-link
 * token is single-use, expires on its own, and is redeemed in the same process that minted it, so
 * there is no window in which a reusable credential exists at rest.
 *
 * COOKIE SHAPE IS NOT HAND-ROLLED. The encoding and the chunking both come from `@supabase/ssr`'s
 * own utils, which is the module the running app decodes with. Two things make that non-optional:
 * the library uses base64URL (unpadded, `-`/`_`), which differs from standard base64 for most
 * payloads — measured at 188 of 200 random samples — and a session longer than one chunk must be
 * split into `name.0`, `name.1`. A near-miss on either produces a cookie the app silently ignores,
 * which presents as "storage has a session but no authenticated identity is reported" — precisely
 * the failure this branch exists to end.
 *
 * Dependencies resolve from the `web` workspace, which is the only place they exist: there is no
 * node_modules at the toolkit or repository root, so a bare import here would fail to resolve.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { resolveCanonicalRepoRoot } from "./lib/vacilando/trusted-host-action-registry.mjs";

function fail(code, detail) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: code, detail: detail ? String(detail).slice(0, 300) : null })}\n`);
    process.exit(1);
}

/*
 * The repo root is RESOLVED, not derived from this file's location.
 *
 * `alloy-toolkit install` flattens `scripts/local-dev/*` to the toolkit root, so once installed
 * `../..` from here is `~/.local/share/alloy` — which has no `web/`. Deriving the path worked in the
 * worktree and would have failed only when run from the installed toolkit, i.e. after the operator
 * had already approved the restore. `resolveCanonicalRepoRoot` consults the canonical-root env vars
 * and confirms `web/package.json` actually exists before returning.
 */
const REPO_ROOT = resolveCanonicalRepoRoot();
const webRequire = createRequire(join(REPO_ROOT, "web", "package.json"));

let createClient;
let stringToBase64URL;
let createChunks;
try {
    ({ createClient } = webRequire("@supabase/supabase-js"));
    ({ stringToBase64URL, createChunks } = webRequire("@supabase/ssr/dist/main/utils"));
} catch (e) {
    fail("dependencies_unresolved", e?.message);
}

const argv = process.argv.slice(2);
const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

const identity = arg("identity");
const storagePath = arg("storage");
const envSource = arg("env-source");
const baseUrl = arg("base-url");
if (!identity || !storagePath || !envSource || !baseUrl) fail("bad_arguments", "identity, storage, env-source and base-url are required");

// The real resolved target is known here, so this is a boundary that must refuse a non-loopback or
// production target. Refusing later would be refusing after the link already existed.
try {
    const h = new URL(baseUrl).hostname;
    if (!["127.0.0.1", "localhost", "::1"].includes(h)) fail("not_loopback_base", h);
} catch {
    fail("not_loopback_base", "unparseable base url");
}

/** Read the trusted env file directly; values stay in this process and are never echoed. */
function readTrustedEnv(path) {
    let text;
    try {
        text = readFileSync(path, "utf8");
    } catch (e) {
        return fail("trusted_env_unreadable", e?.message);
    }
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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceRoleKey || !anonKey) fail("trusted_env_incomplete", "missing supabase url, service role key or anon key");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

// The address comes from the slot registry, and is checked against the auth directory so a bootstrap
// can only ever restore an account that already exists. This never creates a user.
const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 }).catch((e) => ({ error: e }));
if (list?.error) fail("directory_read_failed", list.error.message);
const user = (list?.data?.users || []).find((u) => String(u.email || "").toLowerCase() === identity.toLowerCase());
if (!user) fail("identity_not_registered", "no such account in the auth directory");

const link = await admin.auth.admin.generateLink({ type: "magiclink", email: identity }).catch((e) => ({ error: e }));
if (link?.error) fail("mint_failed", link.error.message);
const tokenHash = link?.data?.properties?.hashed_token;
if (!tokenHash) fail("mint_failed", "no token issued");

// Redeemed immediately, in this process, so the artifact never rests anywhere.
const otp = await anon.auth.verifyOtp({ type: "email", token_hash: tokenHash }).catch((e) => ({ error: e }));
if (otp?.error) fail("redeem_failed", otp.error.message);
const session = otp?.data?.session;
if (!session) fail("redeem_failed", "no session established");

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const encoded = `base64-${stringToBase64URL(JSON.stringify(session))}`;
// The library decides whether this is one cookie or several; we do not guess a threshold.
const parts = createChunks(cookieName, encoded);
const expires = session.expires_at ? Number(session.expires_at) : -1;
const cookiesFor = (domain) => parts.map((p) => ({
    name: p.name, value: p.value, domain, path: "/",
    expires, httpOnly: false, secure: false, sameSite: "Lax",
}));

try {
    mkdirSync(dirname(storagePath), { recursive: true, mode: 0o700 });
    writeFileSync(
        storagePath,
        JSON.stringify({ cookies: [...cookiesFor("localhost"), ...cookiesFor("127.0.0.1")], origins: [] }),
        { mode: 0o600 },
    );
    chmodSync(storagePath, 0o600);
} catch (e) {
    fail("storage_write_failed", e?.message);
}

// Metadata only. Nothing in this shape can carry a secret.
process.stdout.write(`${JSON.stringify({
    ok: true,
    identity_matched: true,
    mechanism: "single_use_magiclink",
    password_involved: false,
    cookie_domains: ["localhost", "127.0.0.1"],
    cookie_parts: parts.length,
    storage_mode: "0600",
    expires_at: session.expires_at ? new Date(Number(session.expires_at) * 1000).toISOString() : null,
})}\n`);
