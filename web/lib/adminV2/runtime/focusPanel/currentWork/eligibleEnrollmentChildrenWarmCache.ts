/**
 * Eligible enrollment-children WARM cache — makes Move to Waitlist open with subjects already
 * in hand (no "Loading eligible children…" gate when warm).
 *
 * Operator intent (What's Next hover / visible action) warms the eligible-child list; on open the
 * subject selector renders synchronously and re-verifies in the background. Same contract as tour /
 * form-delivery / communications warm caches: TTL + in-flight de-dup, errors never cached, browser-only.
 */

export type WarmEligibleEnrollmentChild = { id: string; label: string };

export type WarmEligibleEnrollmentChildren = {
    status: "none" | "single" | "multiple" | "ready";
    message: string | null;
    subjects: WarmEligibleEnrollmentChild[];
};

const WARM_TTL_MS = 45_000;

type Entry = {
    promise: Promise<WarmEligibleEnrollmentChildren | null>;
    value: WarmEligibleEnrollmentChildren | null;
    startedAt: number;
};

const cache = new Map<string, Entry>();

function isFresh(entry: Entry, now: number): boolean {
    return now - entry.startedAt < WARM_TTL_MS;
}

async function fetchEligible(opportunityId: string): Promise<WarmEligibleEnrollmentChildren | null> {
    const res = await fetch(
        `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/eligible-enrollment-children`,
        { credentials: "include" },
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: {
            status?: string;
            message?: string | null;
            subjects?: WarmEligibleEnrollmentChild[];
        };
    };
    if (json.ok === false) return null;
    const subjects = Array.isArray(json.data?.subjects) ? json.data!.subjects! : [];
    const statusRaw = String(json.data?.status ?? "").trim();
    const status: WarmEligibleEnrollmentChildren["status"] =
        statusRaw === "none" || statusRaw === "single" || statusRaw === "multiple"
            ? statusRaw
            : subjects.length === 0
              ? "none"
              : "ready";
    return {
        status,
        message: json.data?.message?.trim() || null,
        subjects,
    };
}

/** Warm eligible children for a family record on intent. Deduped + TTL'd. Best-effort. */
export function prefetchEligibleEnrollmentChildren(
    opportunityId: string | null | undefined,
    now: number = Date.now(),
): Promise<WarmEligibleEnrollmentChildren | null> | null {
    if (typeof window === "undefined") return null;
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return null;
    const existing = cache.get(oid);
    if (existing && isFresh(existing, now)) return existing.promise;
    const startedAt = now;
    const promise = fetchEligible(oid)
        .then((value) => {
            const entry = cache.get(oid);
            if (entry && entry.promise === promise) {
                entry.value = value;
            }
            return value;
        })
        .catch(() => {
            cache.delete(oid);
            return null;
        });
    cache.set(oid, { promise, value: null, startedAt });
    return promise;
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
