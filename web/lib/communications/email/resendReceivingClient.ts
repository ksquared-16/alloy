/**
 * The second half of Resend's inbound contract: fetching what the webhook omits.
 *
 * `email.received` carries metadata only. The body and the RFC headers that make
 * threading possible come from `GET /emails/receiving/{id}` — so this call is
 * mandatory, not an enrichment.
 *
 * Failure is modelled as a first-class outcome rather than an exception, and
 * distinguishes RETRYABLE from PERMANENT. That distinction decides whether the
 * webhook is acknowledged (Resend stops redelivering) or refused (Resend retries
 * into a receipt that is already waiting) — getting it wrong either loses a
 * parent's email or redelivers one forever.
 */

const RESEND_API_BASE = "https://api.resend.com";

export type ResendRetrievalResult =
    | { ok: true; payload: unknown }
    /** Worth another attempt: network, timeout, 429, or a provider 5xx. */
    | { ok: false; retryable: true; reason: string }
    /** Will never succeed: unknown id, revoked key, malformed request. */
    | { ok: false; retryable: false; reason: string };

export type ResendReceivingFetcher = (emailId: string) => Promise<ResendRetrievalResult>;

/**
 * Fetch a received email's full content.
 *
 * The API key is read by the caller from the binding's `secret_ref` (falling back
 * to the environment), matching how outbound resolves it — this function never
 * reaches for configuration itself, so it stays testable and cannot silently use
 * a different credential than the send path.
 */
export async function fetchReceivedEmail(params: {
    emailId: string;
    apiKey: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}): Promise<ResendRetrievalResult> {
    const id = params.emailId.trim();
    if (!id) return { ok: false, retryable: false, reason: "missing_email_id" };
    if (!params.apiKey.trim()) {
        // Configuration, not a provider problem — retrying cannot fix it, but the
        // message must not be discarded either. The caller leaves the receipt
        // pending so it can be picked up once the key is configured.
        return { ok: false, retryable: true, reason: "missing_api_key" };
    }

    const doFetch = params.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 15_000);

    try {
        const res = await doFetch(`${RESEND_API_BASE}/emails/receiving/${encodeURIComponent(id)}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${params.apiKey.trim()}` },
            signal: controller.signal,
        });

        if (res.ok) {
            try {
                return { ok: true, payload: await res.json() };
            } catch {
                // A 200 whose body will not parse is not going to parse next time.
                return { ok: false, retryable: false, reason: "unparseable_response" };
            }
        }

        // 404 is permanent for a given id; 401/403 mean the credential is wrong.
        // 429 and 5xx are the provider asking to be asked again.
        if (res.status === 429 || res.status >= 500) {
            return { ok: false, retryable: true, reason: `provider_${res.status}` };
        }
        return { ok: false, retryable: false, reason: `provider_${res.status}` };
    } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        return { ok: false, retryable: true, reason: aborted ? "timeout" : "network_error" };
    } finally {
        clearTimeout(timer);
    }
}
