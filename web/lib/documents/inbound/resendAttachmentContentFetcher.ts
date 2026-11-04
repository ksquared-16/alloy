/**
 * D10 — `AttachmentContentFetcher` over Resend's PUBLISHED per-attachment contract. NOT enabled in production: it is
 * composed with the organization's binding credential in `lib/communications/email/inboundAttachmentRetrieval.ts`, behind
 * `INBOUND_EMAIL_ATTACHMENT_RETRIEVAL_ENABLED`, which defaults OFF — so every attachment stays held.
 *
 * THE CONTRACT (public documentation only; no account, mailbox or API call was used to establish it):
 *   1. `GET https://api.resend.com/emails/receiving/{email_id}/attachments/{id}`, `Authorization: Bearer <key>` →
 *      `{ object: "attachment", id, filename, size, content_type, content_disposition, content_id,
 *         download_url: "https://inbound-cdn.resend.com/…", expires_at }`
 *      (resend.com/docs/api-reference/emails/retrieve-received-email-attachment).
 *   2. `download_url` is a signed URL valid for one hour; past `expires_at`, ask step 1 again
 *      (resend.com/docs/dashboard/receiving/attachments).
 * This is ONE attachment's bytes, not the raw message: the no-raw-MIME policy (`raw.download_url` is never fetched)
 * is unchanged.
 *
 * WHAT THE DOCUMENTATION DOES NOT SAY, AND HOW THIS FAILS CLOSED ON IT:
 *   - whether the download needs credentials → none are sent; the key goes to api.resend.com only;
 *   - error codes → 429 / 5xx retryable, everything else permanent, as for the received-email call;
 *   - size limits → our own cap (`PUBLIC_UPLOAD_MAX_FILE_BYTES`), checked on the declared size, the Content-Length
 *     and the bytes actually read;
 *   - redirects → refused on both requests (the examples follow them; that is not adopted without live proof).
 *
 * BINDING. Ownership is established before this runs (`createWs11AttachmentStorage.retrieve`: this organization's
 * inbound message, listing this attachment, under its own binding). Here the provider's answer must name the same
 * attachment id, and the download host must be exactly the provider's CDN over HTTPS — nothing else is ever fetched.
 *
 * SECRECY. A result carries bytes or a short reason code. Never the key, the signed URL or a response body.
 */
import { PUBLIC_UPLOAD_MAX_FILE_BYTES } from "@/lib/documents/publicUploadGuard";
import type { AttachmentContentFetcher, AttachmentContentResult } from "@/lib/documents/inbound/ws11AttachmentStorage";

const RESEND_API_BASE = "https://api.resend.com";
export const RESEND_ATTACHMENT_DOWNLOAD_HOST = "inbound-cdn.resend.com";
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const permanent = (reason: string): AttachmentContentResult => ({ ok: false, retryable: false, reason });
const retryable = (reason: string): AttachmentContentResult => ({ ok: false, retryable: true, reason });

/** Only `https://inbound-cdn.resend.com/…`, with no credentials and no non-default port. */
export function isTrustedResendDownloadUrl(raw: unknown): raw is string {
    if (typeof raw !== "string") return false;
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return false;
    }
    return u.protocol === "https:" && u.hostname === RESEND_ATTACHMENT_DOWNLOAD_HOST && u.port === "" && !u.username && !u.password;
}

function statusFailure(prefix: string, status: number): AttachmentContentResult {
    if (status >= 300 && status < 400) return permanent(`${prefix}_redirect_refused`);
    if (status === 429 || status >= 500) return retryable(`${prefix}_${status}`);
    return permanent(`${prefix}_${status}`);
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | "too_large"> {
    const reader = res.body?.getReader();
    if (!reader) {
        const buf = new Uint8Array(await res.arrayBuffer());
        return buf.byteLength > maxBytes ? "too_large" : buf;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            return "too_large";
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.byteLength;
    }
    return out;
}

/** One attachment's bytes, by the two documented requests, under one deadline. */
export async function fetchResendAttachmentContent(params: {
    emailId: string;
    attachmentId: string;
    apiKey: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
    now?: () => Date;
}): Promise<AttachmentContentResult> {
    const emailId = params.emailId.trim();
    const attachmentId = params.attachmentId.trim();
    if (!PROVIDER_ID.test(emailId) || !PROVIDER_ID.test(attachmentId)) return permanent("invalid_provider_id");
    if (!params.apiKey.trim()) return retryable("missing_api_key");

    const maxBytes = params.maxBytes ?? PUBLIC_UPLOAD_MAX_FILE_BYTES;
    const doFetch = params.fetchImpl ?? fetch;
    const now = params.now ?? (() => new Date());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 30_000);

    try {
        // 1 — the attachment's metadata and a fresh signed URL. The key is sent here and only here.
        const meta = await doFetch(
            `${RESEND_API_BASE}/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
            { method: "GET", headers: { Authorization: `Bearer ${params.apiKey.trim()}` }, redirect: "manual", signal: controller.signal },
        );
        if (!meta.ok) return statusFailure("provider", meta.status);
        let body: Record<string, unknown>;
        try {
            const parsed = (await meta.json()) as unknown;
            if (!parsed || typeof parsed !== "object") return permanent("unparseable_response");
            body = parsed as Record<string, unknown>;
        } catch {
            return permanent("unparseable_response");
        }
        if (body.object !== "attachment" || body.id !== attachmentId) return permanent("attachment_mismatch");
        const declaredSize = typeof body.size === "number" && Number.isFinite(body.size) ? body.size : null;
        if (declaredSize !== null && declaredSize > maxBytes) return permanent("too_large");
        if (!isTrustedResendDownloadUrl(body.download_url)) return permanent("download_url_untrusted");
        const expiresAt = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : NaN;
        if (Number.isFinite(expiresAt) && expiresAt <= now().getTime()) return retryable("download_url_expired");

        // 2 — the bytes, from the provider's CDN only, with NO credentials.
        const dl = await doFetch(body.download_url, { method: "GET", redirect: "manual", signal: controller.signal });
        if (!dl.ok) {
            // A signed URL that lapsed in flight: a fresh one comes from step 1 on the next attempt.
            if (dl.status === 403 || dl.status === 410) return retryable(`download_${dl.status}`);
            return statusFailure("download", dl.status);
        }
        const length = Number(dl.headers.get("content-length"));
        if (Number.isFinite(length) && length > maxBytes) {
            await dl.body?.cancel().catch(() => undefined);
            return permanent("too_large");
        }
        const bytes = await readCapped(dl, maxBytes);
        if (bytes === "too_large") return permanent("too_large");
        // A truncated transfer is not the attachment; the next attempt fetches it again.
        if (declaredSize !== null && bytes.byteLength !== declaredSize) return retryable("size_mismatch");
        return { ok: true, bytes };
    } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        return retryable(aborted ? "timeout" : "network_error");
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The `AttachmentContentFetcher` port: the organization's own credential, resolved from the message's provider
 * binding by the injected resolver (Communications' `resolveInboundRetrievalCredential` path), never the environment
 * and never passed in by the caller. Composed by `makeInboundAttachmentContentFetcher`; off unless the flag is on.
 */
export function makeResendAttachmentContentFetcher(deps: {
    resolveApiKey: (args: { orgId: string; providerBindingId: string | null }) => Promise<{ ok: true; apiKey: string } | { ok: false; reason: string }>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
    now?: () => Date;
}): AttachmentContentFetcher {
    return async ({ orgId, providerMessageId, providerBindingId, attachmentId }) => {
        const credential = await deps.resolveApiKey({ orgId, providerBindingId }).catch(() => ({ ok: false as const, reason: "credential_unavailable" }));
        // Configuration the operator can still fix: retryable, and the reason never names the secret.
        if (!credential.ok) return retryable("credential_unavailable");
        return fetchResendAttachmentContent({
            emailId: providerMessageId,
            attachmentId,
            apiKey: credential.apiKey,
            fetchImpl: deps.fetchImpl,
            timeoutMs: deps.timeoutMs,
            maxBytes: deps.maxBytes,
            now: deps.now,
        });
    };
}
