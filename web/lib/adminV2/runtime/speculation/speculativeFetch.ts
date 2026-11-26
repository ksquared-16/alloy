/**
 * The request primitive for speculative work: hover, focus, visibility, prefetch, warming.
 *
 * SPECULATION MAY PREPARE. OPERATOR INTENT MAY MUTATE.
 *
 * Warming exists to make a capability open instantly, and it runs on events the operator never
 * chose: crossing an action row with the pointer, tabbing past a button, or simply having the
 * surface become visible — `warmCurrentWorkCapabilitiesForActions` warms every executable action
 * as soon as What's Next renders. None of those is a decision, so none of them may leave a mark.
 *
 * Measured on staging: the Send Tour Invitation warmer POSTed the registered-action execute
 * endpoint with `confirmation: { confirmed: true }` and a fresh `crypto.randomUUID()` idempotency
 * key per call. Every pass of the pointer minted a durable tour invitation AND its public booking
 * tokens — externally resolvable URLs a parent could act on — and the random key defeated the
 * server's own replay dedupe, so they accumulated. The drafts were read as QA litter and then as a
 * dispatch defect; they were neither. They were the design working as written.
 *
 * A denylist of known-bad action keys would not have caught it, because nothing declared that
 * warmer as mutating. This does: the speculative path cannot express a mutation at all. A warmer
 * that needs to POST is not a warmer — it is an action, and it belongs behind operator intent.
 *
 * Deliberately not a wrapper that "downgrades" the request: a caller asking to mutate has made a
 * design error, and silently turning it into a GET would produce a confusing 405 far from the
 * cause. It refuses, loudly enough to fail a test and quietly enough never to break a page —
 * warming is best-effort by contract, so the rejected promise is caught by the caller as any other
 * warm failure would be.
 */

/** Requests a speculative path is allowed to make. Reads only. */
const SPECULATION_SAFE_METHODS = new Set(["GET", "HEAD"]);

export class SpeculativeMutationError extends Error {
    readonly method: string;
    readonly url: string;
    constructor(method: string, url: string) {
        super(
            `Speculative fetch refused: ${method} ${url}. `
            + "Hover, focus and prefetch may read, resolve, cache and precompute, but must not create "
            + "durable business state. Move this behind an explicit operator action.",
        );
        this.name = "SpeculativeMutationError";
        this.method = method;
        this.url = url;
    }
}

/**
 * Fetch on behalf of a speculative interaction.
 *
 * Same signature as `fetch`, minus the ability to mutate. `credentials: "include"` is the default
 * because every warm path here is an authenticated same-origin read and each was passing it
 * explicitly.
 */
export function speculativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = String(init?.method ?? "GET").toUpperCase();
    if (!SPECULATION_SAFE_METHODS.has(method)) {
        const url =
            typeof input === "string" ? input
            : input instanceof URL ? input.toString()
            : String((input as Request).url ?? "");
        return Promise.reject(new SpeculativeMutationError(method, url));
    }
    return fetch(input, { credentials: "include", ...init, method });
}
