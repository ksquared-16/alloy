/**
 * Form-delivery WARM cache — makes the "Send form" capability open instantly with its configured
 * forms, eligible recipients, and related subjects already in hand (no "Loading…" gate).
 *
 * Operator intent (What's Next showing the action / hover) warms the three inputs the delivery
 * surface needs; on open the surface renders them synchronously and re-verifies in the background.
 * Same contract as the tour + communication warm caches: TTL + in-flight de-dup, errors never
 * cached, browser-only. The forms list is org-level but is bundled per record for one warm entry.
 */

export type FormDeliveryFormOption = { id: string; name: string };
export type FormDeliveryRecipientOption = {
    person_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
};
export type FormDeliverySubjectOption = { id: string; label: string; entity_type: string };

export type WarmFormDelivery = {
    forms: FormDeliveryFormOption[];
    recipients: FormDeliveryRecipientOption[];
    subjects: FormDeliverySubjectOption[];
};

const WARM_TTL_MS = 45_000;

type Entry = { promise: Promise<WarmFormDelivery | null>; value: WarmFormDelivery | null; startedAt: number };

const cache = new Map<string, Entry>();

function isFresh(entry: Entry, now: number): boolean {
    return now - entry.startedAt < WARM_TTL_MS;
}

async function fetchForms(): Promise<FormDeliveryFormOption[]> {
    const res = await fetch("/api/admin/forms", { credentials: "include" });
    if (!res.ok) return [];
    // /api/admin/forms answers { data: FormRow[] } — an array directly under `data`. The old
    // `data.forms` read never matched, so the warm cache pre-seeded an empty form list.
    type FormRow = { id: string; name: string; is_active?: boolean };
    const j = (await res.json().catch(() => ({}))) as {
        forms?: FormRow[];
        data?: FormRow[] | { forms?: FormRow[] };
    };
    const rawForms: FormRow[] = j.forms ?? (Array.isArray(j.data) ? j.data : j.data?.forms) ?? [];
    return rawForms.filter((f) => f.is_active !== false).map((f) => ({ id: f.id, name: f.name }));
}

async function fetchRecipients(opportunityId: string): Promise<FormDeliveryRecipientOption[]> {
    const res = await fetch(
        `/api/admin/communications/drawer-recipients?entity_type=opportunities&entity_id=${encodeURIComponent(opportunityId)}`,
        { credentials: "include" },
    );
    if (!res.ok) return [];
    const j = (await res.json().catch(() => ({}))) as { recipients?: FormDeliveryRecipientOption[] };
    return j.recipients ?? [];
}

async function fetchSubjects(opportunityId: string): Promise<FormDeliverySubjectOption[]> {
    const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/delivery-subjects`, {
        credentials: "include",
    });
    if (!res.ok) return [];
    const j = (await res.json().catch(() => ({}))) as {
        subjects?: FormDeliverySubjectOption[];
        data?: { subjects?: FormDeliverySubjectOption[] };
    };
    return j.subjects ?? j.data?.subjects ?? [];
}

/**
 * The ONE place form-delivery inputs are loaded.
 *
 * Warming on intent and loading on open are the same operation with different motives, so
 * they share this seam rather than each owning a copy of the three fetches. Returning the
 * existing entry is what makes that safe: an open that follows a completed warm resolves
 * from cache with no request at all, and an open that races an in-flight warm joins that
 * promise instead of doubling every request.
 *
 * The surface previously peeked the cache to paint, then re-ran all three fetches itself in
 * a hand-copied duplicate of the functions above — so a warm hit cost 3 redundant requests
 * and a warm race cost 6 requests for 3 resources.
 *
 * Freshness is the TTL plus explicit invalidation after a delivery. Deduped, best-effort,
 * non-throwing for callers that ignore the result.
 */
export function loadFormDelivery(
    opportunityId: string | null | undefined,
    now: number = Date.now(),
): Promise<WarmFormDelivery | null> | null {
    if (typeof window === "undefined") return null;
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return null;
    const existing = cache.get(oid);
    if (existing && isFresh(existing, now)) return existing.promise;

    const promise = (async (): Promise<WarmFormDelivery> => {
        const [forms, recipients, subjects] = await Promise.all([
            fetchForms(),
            fetchRecipients(oid),
            fetchSubjects(oid),
        ]);
        const value: WarmFormDelivery = { forms, recipients, subjects };
        const entry = cache.get(oid);
        if (entry) entry.value = value;
        return value;
    })().catch((err) => {
        if (cache.get(oid)?.promise === promise) cache.delete(oid);
        throw err;
    });

    cache.set(oid, { promise, value: null, startedAt: now });
    void promise.catch(() => {});
    return promise;
}

/**
 * Warm the inputs on operator intent (What's Next showing the action, or hover).
 * The same seam as {@link loadFormDelivery}; the name records why it was called.
 */
export const prefetchFormDelivery = loadFormDelivery;

/** Peek the warm form-delivery inputs WITHOUT consuming — the surface renders synchronously on open. */
export function peekWarmFormDelivery(
    opportunityId: string | null | undefined,
    now: number = Date.now(),
): WarmFormDelivery | null {
    const oid = String(opportunityId ?? "").trim();
    if (!oid) return null;
    const entry = cache.get(oid);
    if (!entry || !entry.value || !isFresh(entry, now)) return null;
    return entry.value;
}

/** Invalidate after a delivery so the next open re-verifies. */
export function invalidateWarmFormDelivery(opportunityId: string): void {
    cache.delete(opportunityId);
}

/** @internal test seam */
export function clearWarmFormDeliveryForTests(): void {
    cache.clear();
}
