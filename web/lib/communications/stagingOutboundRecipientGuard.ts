/**
 * Staging outbound recipient guard (ALY-14) — the last check before a provider call.
 *
 * Staging shares people-shaped data with real families and staff, and holds real
 * provider credentials. A staging runtime may therefore deliver email and SMS ONLY
 * to controlled test recipients or to an explicit owner allowlist. Every provider
 * call site (`api.resend.com/emails`, Twilio) asks this module immediately before
 * the request, so no caller upstream — composer, workflow, scheduled send, legacy
 * adapter — can route around it.
 *
 * Environment is decided fail-closed toward safety: ANY staging signal restricts.
 * Production (no staging signal) is unchanged and this module returns ok.
 *
 * The Python dispatcher carries the same contract:
 * backend/app/integrations/staging_outbound_guard.py — keep the two in step.
 */

/** @see docs/platform/governance/deployment-and-environments.md — identity is the project ref. */
export const ALLOY_STAGING_SUPABASE_PROJECT_REF = "ikaxilmwmrmbagoidedu";

export const STAGING_EMAIL_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST";
export const STAGING_SMS_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_SMS_ALLOWLIST";

export const STAGING_RECIPIENT_REFUSED = "staging_recipient_not_allowlisted";

/** RFC 2606 / 6761 reserved names: never deliverable to a person. */
const RESERVED_EMAIL_DOMAINS = new Set(["example.com", "example.net", "example.org"]);
const RESERVED_EMAIL_TLDS = [".test", ".example", ".invalid", ".localhost"];
/** Resend's documented sandbox inboxes; `+label` variants route to the same sink. */
const RESEND_TEST_LOCAL_PARTS = new Set(["delivered", "bounced", "complained", "suppressed"]);

type Env = Record<string, string | undefined>;

export type OutboundChannel = "email" | "sms";

export type RecipientGuardResult =
    | { ok: true; restricted: boolean }
    | { ok: false; code: typeof STAGING_RECIPIENT_REFUSED; detail: string };

function projectRefFromUrl(raw: string | undefined): string | null {
    const value = String(raw ?? "").trim();
    if (!value) return null;
    try {
        const host = new URL(value).hostname.toLowerCase();
        const m = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
        return m ? m[1] : null;
    } catch {
        return null;
    }
}

/** True when this runtime is staging (or a preview of it). Any one signal suffices. */
export function isStagingOutboundRuntime(env: Env = process.env): boolean {
    const labels = [env.NEXT_PUBLIC_APP_ENV, env.APP_ENV, env.ALLOY_ENVIRONMENT].map((v) =>
        String(v ?? "").trim().toLowerCase()
    );
    if (labels.includes("staging")) return true;
    if (String(env.VERCEL_ENV ?? "").trim().toLowerCase() === "preview") return true;
    const refs = [projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL), projectRefFromUrl(env.SUPABASE_URL)];
    return refs.includes(ALLOY_STAGING_SUPABASE_PROJECT_REF);
}

export function normalizeEmailAddress(raw: string): string {
    const value = String(raw ?? "").trim();
    // `Name <addr@host>` — judge the address, not the display name.
    const angle = /<([^<>]+)>\s*$/.exec(value);
    return (angle ? angle[1] : value).trim().toLowerCase();
}

/** Digits only, with a bare 10-digit NANP number read as +1. */
export function normalizePhoneDigits(raw: string): string {
    const digits = String(raw ?? "").replace(/\D/g, "");
    return digits.length === 10 ? `1${digits}` : digits;
}

export function isControlledTestEmail(raw: string): boolean {
    const addr = normalizeEmailAddress(raw);
    const at = addr.lastIndexOf("@");
    if (at <= 0 || at === addr.length - 1) return false;
    const local = addr.slice(0, at);
    const domain = addr.slice(at + 1);
    if (RESERVED_EMAIL_DOMAINS.has(domain)) return true;
    if (RESERVED_EMAIL_TLDS.some((tld) => domain.endsWith(tld))) return true;
    if (domain === "resend.dev") return RESEND_TEST_LOCAL_PARTS.has(local.split("+")[0]);
    return false;
}

/** NANP fictional range +1 NPA 555-0100…0199: reserved, never assigned to a subscriber. */
export function isControlledTestPhone(raw: string): boolean {
    return /^1[2-9]\d{2}55501\d{2}$/.test(normalizePhoneDigits(raw));
}

function allowlist(env: Env, name: string): string[] {
    return String(env[name] ?? "")
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Exact addresses only — a domain wildcard could admit real people. */
export function isOwnerAllowlistedEmail(raw: string, env: Env = process.env): boolean {
    const addr = normalizeEmailAddress(raw);
    if (!addr.includes("@")) return false;
    return allowlist(env, STAGING_EMAIL_ALLOWLIST_ENV).some((entry) => normalizeEmailAddress(entry) === addr);
}

export function isOwnerAllowlistedPhone(raw: string, env: Env = process.env): boolean {
    const digits = normalizePhoneDigits(raw);
    if (digits.length < 8) return false;
    return allowlist(env, STAGING_SMS_ALLOWLIST_ENV).some((entry) => normalizePhoneDigits(entry) === digits);
}

function maskRecipient(channel: OutboundChannel, raw: string): string {
    if (channel === "sms") return `…${normalizePhoneDigits(raw).slice(-4)}`;
    const addr = normalizeEmailAddress(raw);
    const at = addr.lastIndexOf("@");
    return at > 0 ? `${addr[0]}…@${addr.slice(at + 1)}` : "…";
}

/**
 * Judge every recipient of one provider call. In staging, all must be controlled
 * test recipients or owner-allowlisted; one stranger refuses the whole send.
 */
export function guardOutboundRecipients(
    channel: OutboundChannel,
    recipients: readonly string[],
    env: Env = process.env
): RecipientGuardResult {
    if (!isStagingOutboundRuntime(env)) return { ok: true, restricted: false };
    const list = recipients.map((r) => String(r ?? "").trim());
    if (list.length === 0 || list.some((r) => !r)) {
        return { ok: false, code: STAGING_RECIPIENT_REFUSED, detail: `staging ${channel}: empty recipient` };
    }
    for (const r of list) {
        const allowed =
            channel === "email"
                ? isControlledTestEmail(r) || isOwnerAllowlistedEmail(r, env)
                : isControlledTestPhone(r) || isOwnerAllowlistedPhone(r, env);
        if (!allowed) {
            return {
                ok: false,
                code: STAGING_RECIPIENT_REFUSED,
                detail: `staging ${channel}: ${maskRecipient(channel, r)} is not a test recipient or on ${
                    channel === "email" ? STAGING_EMAIL_ALLOWLIST_ENV : STAGING_SMS_ALLOWLIST_ENV
                }`,
            };
        }
    }
    return { ok: true, restricted: true };
}
