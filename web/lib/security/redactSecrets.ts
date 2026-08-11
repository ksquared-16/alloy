/**
 * Redact authentication material from diagnostic text.
 *
 * Written because a real leak happened: while diagnosing a failing Playwright
 * request, the framework printed its "Call log" — which includes request headers
 * — and a live Supabase session cookie landed in a transcript. Nothing in the
 * test code logged it; Playwright did, on failure, by design.
 *
 * The goal is to keep diagnostics USEFUL. A failure log that says only
 * `[REDACTED]` everywhere is as bad as no log, so each rule keeps the shape of
 * what it removed — the header name, the cookie name, the token prefix — and
 * removes only the secret value.
 *
 * Pure and synchronous so it can sit in a reporter hot path.
 */

/** Cookie names whose values are authentication material. */
const AUTH_COOKIE_NAME = /(sb-[a-z0-9-]+-auth-token(?:\.\d+)?|supabase-auth-token|sb-access-token|sb-refresh-token)/i;

const RULES: ReadonlyArray<{ pattern: RegExp; replace: (m: RegExpMatchArray) => string }> = [
    // `Cookie: a=b; sb-xxx-auth-token=VALUE; c=d` — redact only auth cookie values.
    {
        pattern: new RegExp(`(${AUTH_COOKIE_NAME.source})=([^;,\\s]+)`, "gi"),
        replace: (m) => `${m[1]}=[REDACTED ${m[3].length} chars]`,
    },
    // Whole Cookie / Set-Cookie header, when it still carries anything else.
    {
        pattern: /^(\s*-?\s*(?:set-)?cookie:\s*)(.+)$/gim,
        replace: (m) => `${m[1]}[REDACTED cookie header]`,
    },
    // Authorization: Bearer <jwt> / Basic <b64>
    {
        pattern: /^(\s*-?\s*authorization:\s*)(\S+)(\s+\S+)?$/gim,
        replace: (m) => `${m[1]}${m[2]}${m[3] ? " [REDACTED]" : ""}`,
    },
    // Bare JWTs anywhere (header.payload.signature), incl. base64- prefixed cookies.
    {
        pattern: /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
        replace: () => "[REDACTED jwt]",
    },
    // `base64-eyJ...` — the shape @supabase/ssr writes into a cookie.
    {
        pattern: /\bbase64-ey[A-Za-z0-9_+/=-]{16,}/g,
        replace: () => "[REDACTED session]",
    },
    // Supabase keys and generic secrets in env-ish or JSON form.
    {
        // Key may be bare (`ANON_KEY=…`) or JSON-quoted (`"access_token":"…"`),
        // so the closing quote of the KEY has to be allowed before the separator.
        pattern: /\b((?:SERVICE_ROLE_KEY|ANON_KEY|SUPABASE_[A-Z_]*KEY|access_token|refresh_token|api[_-]?key|password)["']?\s*[=:]\s*)["']?([^"'\s,}]+)["']?/gi,
        replace: (m) => `${m[1]}[REDACTED]`,
    },
];

/**
 * Remove authentication material from a string.
 *
 * Returns the input unchanged when there is nothing to redact, so callers can
 * cheaply keep original references.
 */
export function redactSecrets(input: string): string {
    if (!input) return input;
    let out = input;
    for (const rule of RULES) {
        out = out.replace(rule.pattern, (...args) => {
            const groups = args.slice(0, -2) as unknown as RegExpMatchArray;
            return rule.replace(groups);
        });
    }
    return out;
}

/** True when the text still contains something that looks like auth material. */
export function containsSecret(input: string): boolean {
    if (!input) return false;
    return (
        /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(input) ||
        /\bbase64-ey[A-Za-z0-9_+/=-]{16,}/.test(input) ||
        new RegExp(`${AUTH_COOKIE_NAME.source}=[^;,\\s]+`, "i").test(input)
    );
}

/** Deep-redact a value for structured logging. Arrays and plain objects only. */
export function redactSecretsDeep<T>(value: T): T {
    if (typeof value === "string") return redactSecrets(value) as unknown as T;
    if (Array.isArray(value)) return value.map((v) => redactSecretsDeep(v)) as unknown as T;
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = redactSecretsDeep(v);
        }
        return out as unknown as T;
    }
    return value;
}
