/**
 * Minting and retiring the secret an external application authenticates with.
 *
 * ── THE SECRET IS RETURNED ONCE AND THEN DOES NOT EXIST ──
 *
 * `issueCredential` is the only place a plaintext secret is ever in memory, and
 * it hands it back exactly once. What persists is a SHA-256 digest, and the
 * resolver SELECTS BY that digest rather than comparing it in process — the same
 * shape `kioskDeviceAuthority` and the public form/tour links use. There is no
 * per-byte comparison anywhere in this path to time, and no code path that can
 * return a secret to anyone afterwards, including an administrator.
 *
 * ── WHY SHA-256 AND NOT BCRYPT ──
 *
 * A slow KDF exists to make brute force expensive against LOW-ENTROPY human
 * secrets. This secret is 256 bits from a CSPRNG; there is no dictionary to run
 * and no meaningful search space to slow down. A slow hash on the authentication
 * path would buy nothing and cost latency on every external request.
 *
 * ── ROTATION HAS AN OVERLAP, AND THE OVERLAP HAS A DEADLINE ──
 *
 * `attendance_kiosk_devices` rotates with NO overlap, and its own header states
 * the condition that would justify one: "a fleet that cannot be reconfigured at
 * once — and none of that exists yet." An external partner IS that fleet; they
 * cannot redeploy in the instant Alloy rotates. So a second secret is permitted,
 * and it is bounded by an explicit expiry, enforced in the database by
 * `ck_cred_secondary_requires_expiry`, so it can never quietly become a
 * permanent second credential.
 */

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Public, non-secret, safe to log, and NOT sufficient to authenticate. */
const CLIENT_ID_PREFIX = "alloy_app_";
/**
 * A recognisable prefix so secret-scanning tools can spot one in a commit or a
 * log. It is part of the hashed material — the whole presented string is the
 * secret, not the part after the prefix.
 */
const SECRET_PREFIX = "alloy_sk_";

/** 256 bits. See the header for why this is not run through a slow KDF. */
const SECRET_BYTES = 32;

export function hashCredentialSecret(plaintext: string): string {
    return createHash("sha256").update(String(plaintext).trim(), "utf8").digest("hex");
}

function newClientId(): string {
    return CLIENT_ID_PREFIX + randomBytes(12).toString("hex");
}

function newSecret(): string {
    return SECRET_PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
}

export type IssuedCredential = {
    credentialId: string;
    clientId: string;
    /** The ONLY time this value exists. Not recoverable afterwards. */
    clientSecret: string;
};

/**
 * Issue a credential against an existing installation.
 *
 * Server-side only, and deliberately not an HTTP endpoint in this slice: proving
 * the trust model does not require a self-service issuance surface, and shipping
 * one before the operator product exists would mean shipping an unreviewed way
 * to mint machine authority.
 */
export async function issueCredential(
    supabase: SupabaseClient,
    params: { installationId: string; label: string; createdBy?: string | null; expiresAt?: string | null },
): Promise<{ ok: true; issued: IssuedCredential } | { ok: false; reason: string }> {
    const clientId = newClientId();
    const secret = newSecret();

    const { data, error } = await supabase
        .from("app_credentials")
        .insert({
            installation_id: params.installationId,
            client_id: clientId,
            label: params.label,
            secret_hash: hashCredentialSecret(secret),
            secret_last_four: secret.slice(-4),
            status: "active",
            expires_at: params.expiresAt ?? null,
            created_by: params.createdBy ?? null,
        })
        .select("id")
        .maybeSingle();

    if (error || !data) return { ok: false, reason: error?.message ?? "insert_failed" };
    return { ok: true, issued: { credentialId: (data as { id: string }).id, clientId, clientSecret: secret } };
}

/**
 * Add a bounded second secret so a partner can cut over without downtime.
 *
 * The outgoing secret keeps working until `secondaryExpiresAt`. Both are live
 * until then, which is the entire point and also the risk — which is why the
 * deadline is required by a database constraint rather than by this function
 * remembering to set it.
 */
export async function rotateCredential(
    supabase: SupabaseClient,
    params: { credentialId: string; overlapUntil: string },
): Promise<{ ok: true; issued: { clientSecret: string } } | { ok: false; reason: string }> {
    const next = newSecret();

    // The NEW secret becomes primary and the OUTGOING one moves to the bounded
    // secondary slot. Done the other way round, letting the overlap lapse would
    // retire the secret the partner had just deployed.
    const { data: current, error: readErr } = await supabase
        .from("app_credentials")
        .select("secret_hash, status")
        .eq("id", params.credentialId)
        .maybeSingle();

    if (readErr || !current) return { ok: false, reason: readErr?.message ?? "credential_not_found" };
    if ((current as { status: string }).status !== "active") return { ok: false, reason: "credential_not_active" };

    const { error } = await supabase
        .from("app_credentials")
        .update({
            secret_hash: hashCredentialSecret(next),
            secret_hash_secondary: (current as { secret_hash: string }).secret_hash,
            secondary_expires_at: params.overlapUntil,
            secret_last_four: next.slice(-4),
            rotated_at: new Date().toISOString(),
        })
        .eq("id", params.credentialId);

    if (error) return { ok: false, reason: error.message };
    return { ok: true, issued: { clientSecret: next } };
}

/**
 * Revoke. Both secrets stop resolving in the same statement — a revocation that
 * cleared only the primary would leave the overlap secret live, which is the
 * failure mode `kioskCredentialRotation` names: "rotation" that quietly means
 * "add another valid secret".
 */
export async function revokeCredential(
    supabase: SupabaseClient,
    params: { credentialId: string; revokedBy?: string | null },
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const { error } = await supabase
        .from("app_credentials")
        .update({
            status: "revoked",
            revoked_at: new Date().toISOString(),
            revoked_by: params.revokedBy ?? null,
            secret_hash_secondary: null,
            secondary_expires_at: null,
        })
        .eq("id", params.credentialId);

    if (error) return { ok: false, reason: error.message };
    return { ok: true };
}
