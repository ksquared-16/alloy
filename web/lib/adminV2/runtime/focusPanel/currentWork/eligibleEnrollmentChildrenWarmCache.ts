/**
 * Eligible enrollment-children — the ONE owner of that request, for every caller.
 *
 * Operator intent (What's Next hover / visible action) warms the eligible-child list; on open the
 * subject selector renders synchronously from the warm value and re-verifies in the background.
 * Same contract as tour / form-delivery / communications warm caches: TTL + in-flight de-dup,
 * failures never cached, browser-only.
 *
 * ── S8-3: WHY THIS MODULE ALSO OWNS THE FOREGROUND LOAD ──
 *
 * Slice 8 measured `eligible-enrollment-children` twice on one command open; Slice 9 attributed it.
 * There were two callers for one logical answer: this warm cache, and `CurrentWorkSubjectSelectorPanel`,
 * which peeked the cache and — on a miss — issued its OWN raw fetch. A miss is the normal case in the
 * race that matters: intent warms, the operator clicks before the warm settles, the peek finds nothing
 * (the value lands only on resolution), and the panel starts a second, equivalent backend operation.
 *
 * The panel did not do that out of carelessness. It needs MORE than this cache used to return: the
 * envelope's `error.message` for an operator-facing failure, distinguishable from "no eligible child",
 * distinguishable from a transport failure. The old warm result collapsed every failure to `null`, so
 * joining it would have thrown that away — which is exactly why this repair waited.
 *
 * So the owner now returns the AUTHORITATIVE OUTCOME and keeps presentation out of it:
 *
 *   { ok: true,  value }                      — the answer, including "none" with its message
 *   { ok: false, failure, code, message }     — the refusal, with the envelope's own words
 *
 * `prefetchEligibleEnrollmentChildren` stays exactly as it was, a `value | null` projection over the
 * same operation, so warm callers that only ever wanted "did it warm?" learn nothing about command
 * panel semantics.
 *
 * ── WHAT IS AND IS NOT CACHED ──
 *
 * A success is held for the TTL and is what `peek` serves. A failure is NOT held: the entry is dropped
 * on resolution, so the next legitimate attempt retries instead of replaying a refusal — and a refusal
 * is never recorded as a successful empty result. While a request is in flight, every caller joins the
 * same promise; that is the whole of the S8-3 repair.
 *
 * ── REQUEST IDENTITY ──
 *
 * The key is the family opportunity id, which is the only parameter that changes this answer (the route
 * takes no others; org comes from the session). Endpoint-path equality is not request identity — Slice 9
 * — so the map is keyed by that id and nothing coalesces across subjects.
 */
import { speculativeFetch } from "@/lib/adminV2/runtime/speculation/speculativeFetch";

export type WarmEligibleEnrollmentChild = { id: string; label: string };

export type WarmEligibleEnrollmentChildren = {
    status: "none" | "single" | "multiple" | "ready";
    message: string | null;
    subjects: WarmEligibleEnrollmentChild[];
};

/**
 * The authoritative result of one eligible-children request.
 *
 * `failure: "api"` is the server answering with `{ ok: false, error }` (or a non-2xx envelope) — its
 * `message` is operator-safe and the panel shows it. `failure: "transport"` is the request never
 * producing an envelope at all; there is no server sentence to show, so `message` is null and the
 * caller supplies its own copy.
 */
export type EligibleEnrollmentChildrenOutcome =
    | { ok: true; value: WarmEligibleEnrollmentChildren }
    | { ok: false; failure: "api" | "transport"; code: string | null; message: string | null };

const WARM_TTL_MS = 45_000;

type Entry = {
    promise: Promise<EligibleEnrollmentChildrenOutcome>;
    value: WarmEligibleEnrollmentChildren | null;
    startedAt: number;
};

const cache = new Map<string, Entry>();

function isFresh(entry: Entry, now: number): boolean {
    return now - entry.startedAt < WARM_TTL_MS;
}

async function fetchEligible(opportunityId: string): Promise<EligibleEnrollmentChildrenOutcome> {
    let res: Response;
    try {
        res = await speculativeFetch(
            `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/eligible-enrollment-children`,
            { credentials: "include" },
        );
    } catch {
        return { ok: false, failure: "transport", code: null, message: null };
    }
    const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: {
            status?: string;
            message?: string | null;
            subjects?: WarmEligibleEnrollmentChild[];
        };
        error?: { code?: string; message?: string };
    } | null;
    // A body that never parsed is not the server refusing — nothing was said.
    if (!json) return { ok: false, failure: "transport", code: null, message: null };
    if (!res.ok || json.ok === false) {
        return {
            ok: false,
            failure: "api",
            code: json.error?.code?.trim() || null,
            message: json.error?.message?.trim() || null,
        };
    }
    const subjects = Array.isArray(json.data?.subjects) ? json.data!.subjects! : [];
    const statusRaw = String(json.data?.status ?? "").trim();
    const status: WarmEligibleEnrollmentChildren["status"] =
        statusRaw === "none" || statusRaw === "single" || statusRaw === "multiple"
            ? statusRaw
            : subjects.length === 0
              ? "none"
              : "ready";
    return {
        ok: true,
        value: { status, message: json.data?.message?.trim() || null, subjects },
    };
}

/**
 * THE canonical eligible-children request. Intent prewarm and the command panel both come here, so a
 * panel that opens while a warm is in flight joins that operation instead of starting a second one.
 */
export function loadEligibleEnrollmentChildren(
    opportunityId: string | null | undefined,
    now: number = Date.now(),
): Promise<EligibleEnrollmentChildrenOutcome> {
    const oid = String(opportunityId ?? "").trim();
    if (!oid) {
        return Promise.resolve({
            ok: false,
            failure: "transport",
            code: "NO_SUBJECT",
            message: null,
        });
    }
    const existing = cache.get(oid);
    if (existing && isFresh(existing, now)) return existing.promise;
    const startedAt = now;
    const promise = fetchEligible(oid)
        .then((outcome) => {
            const entry = cache.get(oid);
            if (entry && entry.promise === promise) {
                // Successes are held for the TTL; refusals are dropped so the next attempt retries.
                if (outcome.ok) entry.value = outcome.value;
                else cache.delete(oid);
            }
            return outcome;
        })
        .catch((): EligibleEnrollmentChildrenOutcome => {
            cache.delete(oid);
            return { ok: false, failure: "transport", code: null, message: null };
        });
    cache.set(oid, { promise, value: null, startedAt });
    return promise;
}

/**
 * Warm eligible children for a family record on intent. Deduped + TTL'd. Best-effort.
 *
 * Compatibility projection over `loadEligibleEnrollmentChildren`: a warm caller only ever asked
 * whether there is a value, so a refusal still reads as `null` here.
 */
export function prefetchEligibleEnrollmentChildren(
    opportunityId: string | null | undefined,
    now: number = Date.now(),
): Promise<WarmEligibleEnrollmentChildren | null> | null {
    if (typeof window === "undefined") return null;
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return null;
    return loadEligibleEnrollmentChildren(oid, now).then((outcome) =>
        outcome.ok ? outcome.value : null,
    );
}

/** Synchronous peek for first paint inside the subject selector. */
export function peekEligibleEnrollmentChildren(
    opportunityId: string | null | undefined,
    now: number = Date.now(),
): WarmEligibleEnrollmentChildren | null {
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return null;
    const entry = cache.get(oid);
    if (!entry || !isFresh(entry, now) || !entry.value) return null;
    return entry.value;
}

/** Drop warm entry after a successful waitlist commit so the next open re-resolves. */
export function invalidateEligibleEnrollmentChildren(opportunityId: string | null | undefined): void {
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return;
    cache.delete(oid);
}

/** Test-only. */
export function clearEligibleEnrollmentChildrenWarmCacheForTests(): void {
    cache.clear();
}
