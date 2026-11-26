/**
 * The bearer token behind an unsubscribe link.
 *
 * ---------------------------------------------------------------------------
 * WHAT A TOKEN IS ALLOWED TO AUTHORIZE
 * ---------------------------------------------------------------------------
 *
 * Exactly one preference mutation, on one Person, in one organization, for one category
 * that the token itself names. Everything the route needs is signed; nothing the route
 * needs is taken from the request. A recipient who edits the URL does not get a different
 * outcome — they get a rejection, because the claims are inside the signature.
 *
 * That is why `category` is a CLAIM and not a query parameter. A token minted for
 * marketing must not be replayable against routine email by changing a string in the URL;
 * the audit demanded "token cannot switch categories", and the only way to guarantee that
 * is to make the category part of what was signed.
 *
 * ---------------------------------------------------------------------------
 * WHY HMAC RATHER THAN A STORED TOKEN ROW
 * ---------------------------------------------------------------------------
 *
 * Mirrors `lib/platform/commands/runtime/destructive/destructivePreviewToken.ts` — the
 * pattern this platform already uses for bounded, expiring, unauthenticated capability:
 * Node crypto, compact claims, constant-time comparison, no database round trip. A stored
 * token table would be a second preference-adjacent store, and the instruction is explicit
 * that there must not be one.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT IN THE URL
 * ---------------------------------------------------------------------------
 *
 * No email address, no name, no message body, no signing secret. Person and org ids ARE
 * present inside the payload — they are opaque UUIDs, they are what the mutation must
 * address, and they are already visible to the recipient in no other form. What matters is
 * that they cannot be CHANGED: altering either invalidates the signature.
 *
 * `v` and `exp` are explicit so a rotation or a policy change can invalidate every
 * outstanding link without hunting for them. An expired link is not an error the recipient
 * caused, and the route says so rather than blaming them.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Categories a recipient may act on themselves. See `unsubscribeCategoryPolicy`. */
export type UnsubscribableCategory = "email_marketing" | "email_operational";

export type UnsubscribeTokenClaims = {
    /** Person whose preference this mutates. */
    p: string;
    /** Organization that owns the Person. */
    o: string;
    /** The single category this token may change. */
    c: UnsubscribableCategory;
    /** Token format/policy version. Bump to invalidate every outstanding link. */
    v: number;
    /** Unix epoch seconds. */
    exp: number;
    /** Unix epoch seconds. */
    iat: number;
};

/** Current token version. Bump on any claim-shape or policy change. */
export const UNSUBSCRIBE_TOKEN_VERSION = 1;

/**
 * A year.
 *
 * Deliberately long. An unsubscribe link lives in a mailbox for as long as the mail does,
 * and a recipient who finds a six-month-old newsletter and wants out should get out — being
 * told "this link expired, contact your school" is precisely the friction that makes people
 * mark mail as spam instead. Expiry exists so links are not eternal, not to police the
 * recipient.
 */
export const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60;

export type UnsubscribeTokenVerification =
    | { ok: true; claims: UnsubscribeTokenClaims }
    | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "unsupported_version" };

function signingSecret(env: NodeJS.ProcessEnv = process.env): string {
    const secret =
        env.COMMUNICATION_UNSUBSCRIBE_SECRET?.trim() ||
        env.COMMAND_DESTRUCTIVE_PREVIEW_SECRET?.trim() ||
        env.INTERNAL_CRON_TOKEN?.trim();
    if (secret) return secret;
    if (env.NODE_ENV === "production") {
        // Refusing to mint is correct: a token signed with a guessable fallback is worse
        // than an email with no unsubscribe link, because it looks trustworthy.
        throw new Error(
            "[unsubscribeToken] COMMUNICATION_UNSUBSCRIBE_SECRET (or an existing platform secret) is required in production",
        );
    }
    return "unsubscribe-development-secret";
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(payload: string, env?: NodeJS.ProcessEnv): string {
    return b64url(createHmac("sha256", signingSecret(env)).update(payload).digest());
}

export function issueUnsubscribeToken(input: {
    personId: string;
    orgId: string;
    category: UnsubscribableCategory;
    nowMs?: number;
    ttlSeconds?: number;
    env?: NodeJS.ProcessEnv;
}): string {
    const iat = Math.floor((input.nowMs ?? Date.now()) / 1000);
    const claims: UnsubscribeTokenClaims = {
        p: input.personId,
        o: input.orgId,
        c: input.category,
        v: UNSUBSCRIBE_TOKEN_VERSION,
        iat,
        exp: iat + (input.ttlSeconds ?? UNSUBSCRIBE_TOKEN_TTL_SECONDS),
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    return `${payload}.${sign(payload, input.env)}`;
}

/**
 * Verify and decode. Every failure is a named reason, never a thrown exception.
 *
 * The signature is checked BEFORE expiry, and with a constant-time comparison. Checking
 * expiry first would let an attacker distinguish "well-formed but old" from "forged" by
 * timing the two responses, and neither the recipient nor the log needs that distinction.
 */
export function verifyUnsubscribeToken(
    token: string | null | undefined,
    options: { nowMs?: number; env?: NodeJS.ProcessEnv } = {},
): UnsubscribeTokenVerification {
    const raw = String(token ?? "").trim();
    const dot = raw.indexOf(".");
    if (dot <= 0 || dot === raw.length - 1) return { ok: false, reason: "malformed" };

    const payload = raw.slice(0, dot);
    const provided = raw.slice(dot + 1);
    const expected = sign(payload, options.env);

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

    let claims: UnsubscribeTokenClaims;
    try {
        claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UnsubscribeTokenClaims;
    } catch {
        return { ok: false, reason: "malformed" };
    }

    if (
        !claims ||
        typeof claims.p !== "string" ||
        typeof claims.o !== "string" ||
        typeof claims.exp !== "number" ||
        (claims.c !== "email_marketing" && claims.c !== "email_operational")
    ) {
        return { ok: false, reason: "malformed" };
    }
    if (claims.v !== UNSUBSCRIBE_TOKEN_VERSION) return { ok: false, reason: "unsupported_version" };

    const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
    if (claims.exp <= now) return { ok: false, reason: "expired" };

    return { ok: true, claims };
}

/**
 * Which categories a recipient may unsubscribe from themselves, and why.
 *
 * `email_marketing` — yes. Standards and decency both require it, and the evaluator
 *   already blocks marketing without an opt-in, so a recipient opting out is expressing
 *   the same thing the platform defaults to.
 *
 * `email_operational` — yes, and category-scoped. Routine email is genuinely non-essential
 *   day-to-day traffic, and a recipient who wants it to stop has a legitimate interest the
 *   evaluator already honours. Scoping it explicitly is what keeps "stop the newsletters"
 *   from silently becoming "stop everything".
 *
 * `email_transactional` — NO, and no link is ever offered for it. It is opt-out exempt, so
 *   an unsubscribe control would either lie about what it does or quietly do nothing.
 *   Presenting a mechanism that cannot work is worse than presenting none: it teaches a
 *   recipient that asking was pointless.
 */
export function isRecipientUnsubscribable(category: string): category is UnsubscribableCategory {
    return category === "email_marketing" || category === "email_operational";
}
