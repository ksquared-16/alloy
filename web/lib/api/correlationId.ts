/**
 * Correlation id propagation for the Alloy API response contract.
 *
 * Every helper-produced response carries a correlation id in both the JSON body
 * (`correlation_id`) and the `x-correlation-id` response header. Callers may pass
 * an incoming request so an upstream id is propagated end-to-end; otherwise a new
 * id is generated.
 *
 * @see docs/api/api-response-contract.md
 */

export const CORRELATION_ID_HEADER = "x-correlation-id";

/** Source from which an incoming correlation id may be read. */
export type CorrelationIdSource =
    | Headers
    | Request
    | { headers?: Headers | Record<string, string | undefined> | null }
    | null
    | undefined;

/** Generate a fresh correlation id (UUID where available, otherwise a stable fallback). */
export function generateCorrelationId(): string {
    const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoRef?.randomUUID) {
        try {
            return cryptoRef.randomUUID();
        } catch {
            /* fall through to fallback */
        }
    }
    return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function headersFrom(source: CorrelationIdSource): Headers | Record<string, string | undefined> | null {
    if (!source) return null;
    if (source instanceof Headers) return source;
    const maybe = source as { headers?: Headers | Record<string, string | undefined> | null };
    if (maybe.headers) return maybe.headers;
    return null;
}

/** Read an incoming correlation id from a request/headers, or null when absent/blank. */
export function readIncomingCorrelationId(source: CorrelationIdSource): string | null {
    const headers = headersFrom(source);
    if (!headers) return null;
    let raw: string | undefined | null = null;
    if (headers instanceof Headers) {
        raw = headers.get(CORRELATION_ID_HEADER);
    } else {
        raw = headers[CORRELATION_ID_HEADER] ?? headers[CORRELATION_ID_HEADER.toUpperCase()] ?? null;
    }
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed ? trimmed : null;
}

/**
 * Resolve the correlation id to attach to a response: an explicit value, then an
 * incoming request header, then a freshly generated id. Helper responses always
 * carry one (the contract rule is "present").
 */
export function resolveCorrelationId(source?: CorrelationIdSource, explicit?: string | null): string {
    const fromExplicit = typeof explicit === "string" ? explicit.trim() : "";
    if (fromExplicit) return fromExplicit;
    return readIncomingCorrelationId(source) ?? generateCorrelationId();
}
