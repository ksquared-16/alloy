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
 * ── THE ENVIRONMENT IS DECLARED, AND ONLY "production" IS UNRESTRICTED ──
 *
 * `ALLOY_ENVIRONMENT` names the runtime: `staging` or `production`. Anything else —
 * missing, empty, `development`, a typo — restricts exactly like staging, because the
 * failure we are guarding against is a runtime nobody labelled sending to a parent.
 * `production` is believed only when nothing else says staging: the staging project
 * ref, a `staging` app label, or `VERCEL_ENV=preview` (staging is a Vercel preview
 * build) override it and restrict.
 *
 * The Python dispatcher carries the same contract:
 * backend/app/integrations/staging_outbound_guard.py — keep the two in step.
 */

/** @see docs/platform/governance/deployment-and-environments.md — identity is the project ref. */
export const ALLOY_STAGING_SUPABASE_PROJECT_REF = "ikaxilmwmrmbagoidedu";

export const STAGING_EMAIL_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST";
export const STAGING_SMS_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_SMS_ALLOWLIST";

export const STAGING_RECIPIENT_REFUSED = "staging_recipient_not_allowlisted";

export const ALLOY_ENVIRONMENT_ENV = "ALLOY_ENVIRONMENT";
export const ALLOY_ENVIRONMENT_STAGING = "staging";
export const ALLOY_ENVIRONMENT_PRODUCTION = "production";

/** RFC 2606 / 6761 reserved names: never deliverable to a person. */
const RESERVED_EMAIL_DOMAINS = new Set(["example.com", "example.net", "example.org"]);
const RESERVED_EMAIL_TLDS = [".test", ".example", ".invalid", ".localhost"];
/** Resend's documented sandbox inboxes; `+label` variants route to the same sink. */
const RESEND_TEST_LOCAL_PARTS = new Set(["delivered", "bounced", "complained", "suppressed"]);

type Env = Record<string, string | undefined>;

export type OutboundChannel = "email" | "sms";

/**
 * `live` — explicitly production, no staging signal: unrestricted.
 * `staging` — explicitly staging, or production contradicted by a staging signal.
 * `unidentified` — ALLOY_ENVIRONMENT missing or unknown: restricted like staging.
 */
export type OutboundEnvironmentMode = "live" | "staging" | "unidentified";

export type OutboundEnvironment = { mode: OutboundEnvironmentMode; restricted: boolean; reason: string };

export type RecipientGuardResult =
    | { ok: true; restricted: boolean; mode: OutboundEnvironmentMode }
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

function stagingSignal(env: Env): string | null {
    for (const name of ["NEXT_PUBLIC_APP_ENV", "APP_ENV"] as const) {
        if (String(env[name] ?? "").trim().toLowerCase() === "staging") return `${name}=staging`;
    }
    if (String(env.VERCEL_ENV ?? "").trim().toLowerCase() === "preview") return "VERCEL_ENV=preview";
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"] as const) {
        if (projectRefFromUrl(env[name]) === ALLOY_STAGING_SUPABASE_PROJECT_REF) return `${name} is the staging project`;
    }
    return null;
}

/** Which outbound regime this runtime is in. Fail-closed: only an uncontradicted `production` is live. */
export function resolveOutboundEnvironment(env: Env = process.env): OutboundEnvironment {
    const label = String(env[ALLOY_ENVIRONMENT_ENV] ?? "").trim().toLowerCase();
    if (label === ALLOY_ENVIRONMENT_STAGING) {
        return { mode: "staging", restricted: true, reason: `${ALLOY_ENVIRONMENT_ENV}=staging` };
    }
    if (label === ALLOY_ENVIRONMENT_PRODUCTION) {
        const contradiction = stagingSignal(env);
        if (contradiction) {
            return {
                mode: "staging",
                restricted: true,
                reason: `${ALLOY_ENVIRONMENT_ENV}=production contradicted by ${contradiction}`,
            };
        }
        return { mode: "live", restricted: false, reason: `${ALLOY_ENVIRONMENT_ENV}=production` };
    }
    return {
        mode: "unidentified",
        restricted: true,
        reason: label ? `${ALLOY_ENVIRONMENT_ENV}=${label} is not a known environment` : `${ALLOY_ENVIRONMENT_ENV} is not set`,
    };
}

/** True unless this runtime is explicitly, uncontradictedly production. */
export function isOutboundRestricted(env: Env = process.env): boolean {
    return resolveOutboundEnvironment(env).restricted;
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
 * Judge every recipient of one provider call. Unless the runtime is explicitly
 * production, all must be controlled test recipients or owner-allowlisted; one
 * stranger refuses the whole send.
 */
export function guardOutboundRecipients(
    channel: OutboundChannel,
    recipients: readonly string[],
    env: Env = process.env
): RecipientGuardResult {
    const environment = resolveOutboundEnvironment(env);
    if (!environment.restricted) return { ok: true, restricted: false, mode: environment.mode };
    const scope = `${environment.mode} ${channel} (${environment.reason})`;
    const list = recipients.map((r) => String(r ?? "").trim());
    if (list.length === 0 || list.some((r) => !r)) {
        return { ok: false, code: STAGING_RECIPIENT_REFUSED, detail: `${scope}: empty recipient` };
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
                detail: `${scope}: ${maskRecipient(channel, r)} is not a test recipient or on ${
                    channel === "email" ? STAGING_EMAIL_ALLOWLIST_ENV : STAGING_SMS_ALLOWLIST_ENV
                }`,
            };
        }
    }
    return { ok: true, restricted: true, mode: environment.mode };
}
