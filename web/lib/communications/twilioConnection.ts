/**
 * Connecting an organization's own Twilio account.
 *
 * WHY NOT TWILIO CONNECT. Connect would avoid storing a customer secret at all —
 * Alloy would hold only an `AccountSid` and authenticate with its own token. It
 * was the preferred design and it is not used, for one specific unresolved
 * reason: Twilio signs inbound webhooks with "your account's auth token", and the
 * public documentation does not say whether that means Alloy's token or the
 * Connect SUBACCOUNT's. Alloy's inbound SMS path validates that signature and
 * fails closed. If the subaccount's token signs, Connect cannot support inbound
 * SMS at all — and inbound is not optional here.
 *
 * Rather than guess at a security boundary, this uses the organization-owned
 * credential authority that already exists. If the Connect question is later
 * answered, this file is the seam that would change; nothing else needs to.
 *
 * SECRET vs CONFIGURATION. The auth token is a secret and goes to the vault. The
 * Account SID and Messaging Service SID are NOT secrets — they are identifiers
 * that appear in Twilio's own console and in webhook payloads — so they live in
 * ordinary configuration where an administrator can read and correct them. Hiding
 * a non-secret behind a write-once field would make the connection unmanageable
 * for no security gain.
 */

export type TwilioVerification =
    | { outcome: "ok"; accountLabel: string | null }
    | { outcome: "invalid_credential" }
    | { outcome: "unavailable"; detail: string }
    | { outcome: "certification_only" };

/**
 * The narrowest call that proves a credential: fetch the account itself.
 * Read-only, and incapable of sending a message.
 */
export function twilioAccountEndpoint(accountSid: string): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`;
}

/** Mirrors the Resend certification credential — resolves to nothing real. */
export const CERTIFICATION_TWILIO_SID = "ACcertification0000000000000000000";
export const CERTIFICATION_TWILIO_TOKEN = "certification-synthetic-twilio-auth-token";

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}>;

function certificationEnabled(env: Record<string, string | undefined>): boolean {
    return String(env.ALLOY_CERTIFICATION ?? "").trim() === "1";
}

export function certificationTwilioVerifier(accountSid: string, authToken: string): TwilioVerification {
    if (accountSid.trim() === CERTIFICATION_TWILIO_SID && authToken.trim() === CERTIFICATION_TWILIO_TOKEN) {
        return { outcome: "ok", accountLabel: "Certification Twilio (cannot send)" };
    }
    // NOT `invalid_credential`: Twilio was never asked, so nothing was rejected.
    return { outcome: "certification_only" };
}

/** An Account SID is `AC` + 32 hex. Checked before any request, so a typo never
 *  becomes a network call carrying a secret. */
export function looksLikeAccountSid(value: string): boolean {
    return /^AC[0-9a-zA-Z]{32}$/.test(value.trim());
}

export async function verifyTwilioCredentials(
    accountSid: string,
    authToken: string,
    options?: { env?: Record<string, string | undefined>; fetchImpl?: FetchLike },
): Promise<TwilioVerification> {
    const sid = (accountSid ?? "").trim();
    const token = (authToken ?? "").trim();
    if (!sid || !token) return { outcome: "invalid_credential" };
    if (!looksLikeAccountSid(sid)) return { outcome: "invalid_credential" };

    const env = options?.env ?? {};
    if (certificationEnabled(env)) return certificationTwilioVerifier(sid, token);

    const doFetch = options?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!doFetch) return { outcome: "unavailable", detail: "No HTTP client available." };

    let res: Awaited<ReturnType<FetchLike>>;
    try {
        res = await doFetch(twilioAccountEndpoint(sid), {
            method: "GET",
            headers: {
                // Basic auth is Twilio's scheme for this endpoint.
                Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            },
        });
    } catch {
        // The thrown error carries the request, and the request carries the token.
        return { outcome: "unavailable", detail: "Could not reach Twilio." };
    }

    if (res.status === 401 || res.status === 403) return { outcome: "invalid_credential" };
    if (!res.ok) return { outcome: "unavailable", detail: `Twilio answered ${res.status}.` };

    let body: unknown;
    try {
        body = await res.json();
    } catch {
        return { outcome: "unavailable", detail: "Twilio returned an unreadable response." };
    }

    const label = body && typeof body === "object" ? String((body as { friendly_name?: unknown }).friendly_name ?? "").trim() : "";
    return { outcome: "ok", accountLabel: label || null };
}
