/**
 * Preview correlation token (P4.S1).
 *
 * HMAC-SHA256 over a compact claims set (Node crypto — same primitive family as
 * existing Twilio webhook verification). No jose/JWT dependency; no DB storage.
 *
 * Token does not embed the full impact preview payload.
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export type DestructivePreviewTokenClaims = {
    previewId: string;
    capabilityKey: string;
    subjectType: string;
    subjectId: string;
    orgId: string;
    impactClass: string;
    confirmation: string;
    /** Domain/version fingerprint for stale detection (opaque string). */
    version: string;
    /** Unix epoch seconds. */
    exp: number;
    /** Unix epoch seconds. */
    iat: number;
};

export type DestructivePreviewTokenIssueInput = {
    capabilityKey: string;
    subjectType: string;
    subjectId: string;
    orgId: string;
    impactClass: string;
    confirmation: string;
    version: string;
    /** TTL seconds from now. */
    ttlSeconds: number;
    previewId?: string;
    nowMs?: number;
};

function resolveSigningSecret(): string {
    const fromEnv =
        process.env.COMMAND_DESTRUCTIVE_PREVIEW_SECRET?.trim() ||
        process.env.INTERNAL_CRON_TOKEN?.trim();
    if (fromEnv) return fromEnv;
    if (process.env.NODE_ENV === "production") {
        throw new Error(
            "[destructivePreviewToken] COMMAND_DESTRUCTIVE_PREVIEW_SECRET (or INTERNAL_CRON_TOKEN) is required in production"
        );
    }
    // Non-production fallback for local/test only — never ship as a production secret.
    return "alloy-destructive-preview-dev-only";
}

function b64url(buf: Buffer | string): string {
    const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
    return b
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function fromB64url(s: string): Buffer {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return Buffer.from(b64, "base64");
}

function signBody(body: string, secret: string): string {
    return b64url(createHmac("sha256", secret).update(body, "utf8").digest());
}

function safeEqualB64url(a: string, b: string): boolean {
    try {
        const ba = fromB64url(a);
        const bb = fromB64url(b);
        if (ba.length !== bb.length) return false;
        return timingSafeEqual(ba, bb);
    } catch {
        return false;
    }
}

/** Issue a server-generated preview correlation token. */
export function issueDestructivePreviewToken(
    input: DestructivePreviewTokenIssueInput
): { previewId: string; token: string; claims: DestructivePreviewTokenClaims } {
    const nowMs = input.nowMs ?? Date.now();
    const iat = Math.floor(nowMs / 1000);
    const ttl = Math.max(1, Math.floor(input.ttlSeconds));
    const claims: DestructivePreviewTokenClaims = {
        previewId: (input.previewId ?? randomUUID()).trim(),
        capabilityKey: input.capabilityKey.trim(),
        subjectType: input.subjectType.trim(),
        subjectId: input.subjectId.trim(),
        orgId: input.orgId.trim(),
        impactClass: input.impactClass.trim(),
        confirmation: input.confirmation.trim(),
        version: input.version.trim(),
        exp: iat + ttl,
        iat,
    };
    const body = b64url(JSON.stringify(claims));
    const sig = signBody(body, resolveSigningSecret());
    return { previewId: claims.previewId, token: `${body}.${sig}`, claims };
}

export type DestructivePreviewTokenValidation =
    | { ok: true; claims: DestructivePreviewTokenClaims }
    | {
          ok: false;
          code:
              | "malformed"
              | "bad_signature"
              | "expired"
              | "claim_mismatch"
              | "org_mismatch";
          message: string;
      };

export function validateDestructivePreviewToken(input: {
    token: string;
    expected: {
        capabilityKey: string;
        subjectType: string;
        subjectId: string;
        orgId: string;
        impactClass?: string;
        confirmation?: string;
        version?: string;
    };
    nowMs?: number;
}): DestructivePreviewTokenValidation {
    const raw = (input.token ?? "").trim();
    const parts = raw.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { ok: false, code: "malformed", message: "Preview token is malformed." };
    }
    const [body, sig] = parts;
    const expectedSig = signBody(body, resolveSigningSecret());
    if (!safeEqualB64url(sig, expectedSig)) {
        return { ok: false, code: "bad_signature", message: "Preview token signature is invalid." };
    }

    let claims: DestructivePreviewTokenClaims;
    try {
        claims = JSON.parse(fromB64url(body).toString("utf8")) as DestructivePreviewTokenClaims;
    } catch {
        return { ok: false, code: "malformed", message: "Preview token claims are invalid." };
    }

    const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
    if (!claims.exp || nowSec > claims.exp) {
        return { ok: false, code: "expired", message: "Preview has expired. Generate a new preview." };
    }

    if (claims.orgId !== input.expected.orgId.trim()) {
        return { ok: false, code: "org_mismatch", message: "Preview organization does not match." };
    }
    if (claims.capabilityKey !== input.expected.capabilityKey.trim()) {
        return { ok: false, code: "claim_mismatch", message: "Preview capability does not match." };
    }
    if (
        claims.subjectType !== input.expected.subjectType.trim() ||
        claims.subjectId !== input.expected.subjectId.trim()
    ) {
        return { ok: false, code: "claim_mismatch", message: "Preview subject does not match." };
    }
    if (
        input.expected.impactClass != null &&
        claims.impactClass !== input.expected.impactClass.trim()
    ) {
        return { ok: false, code: "claim_mismatch", message: "Preview impact class does not match." };
    }
    if (
        input.expected.confirmation != null &&
        claims.confirmation !== input.expected.confirmation.trim()
    ) {
        return {
            ok: false,
            code: "claim_mismatch",
            message: "Preview confirmation policy does not match.",
        };
    }
    if (input.expected.version != null && claims.version !== input.expected.version.trim()) {
        return {
            ok: false,
            code: "claim_mismatch",
            message: "Preview is stale. Generate a new preview.",
        };
    }

    return { ok: true, claims };
}

/**
 * Preview tokens are correlation artifacts — not idempotency keys.
 * Documented for callers; no shared idempotency store is implied.
 */
export const DESTRUCTIVE_PREVIEW_TOKEN_IS_NOT_IDEMPOTENCY_KEY = true as const;
