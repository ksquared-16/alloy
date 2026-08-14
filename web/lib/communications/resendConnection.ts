/**
 * Connecting an organization's own Resend account.
 *
 * WHY VERIFICATION IS NOT OPTIONAL. Writing a key to the vault proves only that a
 * string was stored. Reporting "Connected" on that basis would repeat the defect
 * this whole area exists to remove — configuration claiming a readiness the runtime
 * cannot honour. So the key is exercised against Resend BEFORE the connection is
 * called connected, and a key that does not work is reported as invalid rather than
 * stored and forgotten.
 *
 * WHY LISTING DOMAINS. It is the narrowest call that proves the credential is
 * real: authenticated, read-only, and incapable of sending anything. Resend has no
 * dedicated "verify key" endpoint, so a harmless authenticated GET is the honest
 * substitute. It also returns exactly what the sending half needs — which domains
 * this account has verified — so one call answers "is the key good?" and "can this
 * account send from that domain?".
 *
 * WHY CERTIFICATION CANNOT REACH THE NETWORK. Certification holds no provider
 * credentials by design, and that absence is what guarantees a certification run
 * cannot send. Verification therefore takes an injected `fetch`, and in a
 * certification run the caller supplies one that answers locally. There is no code
 * path where `ALLOY_CERTIFICATION=1` produces a request to api.resend.com.
 */

/** Where a connection attempt ended up. Each maps to one operator-facing state. */
export type ResendVerification =
    /** The key works. `verifiedDomains` is what the account can send from today. */
    | { outcome: "ok"; verifiedDomains: string[] }
    /** Resend rejected the credential — 401/403. The operator must supply another. */
    | { outcome: "invalid_credential" }
    /** Resend could not be reached, or answered in a way we cannot interpret. NOT
     *  the operator's fault, and explicitly not "invalid" — telling someone their
     *  key is wrong when the provider is down sends them to replace a good key. */
    | { outcome: "unavailable"; detail: string }
    /**
     * This environment refuses to contact Resend at all, so no real key can be
     * verified here.
     *
     * Reported separately because saying "Resend did not accept that API key"
     * would be FALSE — Alloy never asked Resend. A director pasting a valid
     * production key into a certification build was told their key was rejected,
     * which sent them looking for a problem with the key.
     */
    | { outcome: "certification_only" };

export const RESEND_DOMAINS_ENDPOINT = "https://api.resend.com/domains";

/**
 * The certification credential.
 *
 * Structurally incapable of reaching Resend: `verifyResendApiKey` answers it from
 * the certification verifier, and it is only accepted when `ALLOY_CERTIFICATION=1`.
 * It is not a fake key — it is the absence of one, named.
 */
export const CERTIFICATION_RESEND_KEY = "certification-synthetic-resend-key";

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}>;

function certificationEnabled(env: Record<string, string | undefined>): boolean {
    return String(env.ALLOY_CERTIFICATION ?? "").trim() === "1";
}

/**
 * A verifier for certification runs. Accepts exactly one synthetic key and
 * refuses every other, so both the success and the failure path are provable
 * without a credential that could send.
 */
export function certificationVerifier(apiKey: string): ResendVerification {
    if (apiKey.trim() === CERTIFICATION_RESEND_KEY) {
        return { outcome: "ok", verifiedDomains: ["northwind-cert.invalid"] };
    }
    // NOT `invalid_credential`: nothing was asked of Resend, so nothing was
    // rejected. Claiming otherwise blames a key that may be perfectly good.
    return { outcome: "certification_only" };
}

/**
 * Exercise a Resend API key. Never sends; never logs the key.
 */
export async function verifyResendApiKey(
    apiKey: string,
    options?: { env?: Record<string, string | undefined>; fetchImpl?: FetchLike },
): Promise<ResendVerification> {
    const key = (apiKey ?? "").trim();
    if (!key) return { outcome: "invalid_credential" };

    const env = options?.env ?? {};
    if (certificationEnabled(env)) return certificationVerifier(key);

    const doFetch = options?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!doFetch) return { outcome: "unavailable", detail: "No HTTP client available." };

    let res: Awaited<ReturnType<FetchLike>>;
    try {
        res = await doFetch(RESEND_DOMAINS_ENDPOINT, {
            method: "GET",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        });
    } catch {
        // The thrown error can carry the request, and the request carries the key.
        // Never propagate it.
        return { outcome: "unavailable", detail: "Could not reach Resend." };
    }

    if (res.status === 401 || res.status === 403) return { outcome: "invalid_credential" };
    if (!res.ok) return { outcome: "unavailable", detail: `Resend answered ${res.status}.` };

    let body: unknown;
    try {
        body = await res.json();
    } catch {
        return { outcome: "unavailable", detail: "Resend returned an unreadable response." };
    }

    return { outcome: "ok", verifiedDomains: extractVerifiedDomains(body) };
}

/**
 * Pull verified sending domains out of a domains response.
 *
 * Tolerant of shape by design: this drives a hint ("your domain is verified"), and
 * a hint that throws on an unexpected payload would fail a connection that is
 * actually fine. An empty list means "we could not tell", never "not verified" —
 * the sending half already reports domain verification as an honest unknown.
 */
export function extractVerifiedDomains(body: unknown): string[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { data?: unknown })?.data)
          ? ((body as { data: unknown[] }).data)
          : [];
    const out: string[] = [];
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const name = String((row as { name?: unknown }).name ?? "").trim();
        const status = String((row as { status?: unknown }).status ?? "").trim().toLowerCase();
        if (name && status === "verified") out.push(name);
    }
    return out;
}
