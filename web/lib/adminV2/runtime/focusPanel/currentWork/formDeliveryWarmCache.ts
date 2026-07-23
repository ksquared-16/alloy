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
    const j = (await res.json().catch(() => ({}))) as {
        forms?: Array<{ id: string; name: string; is_active?: boolean }>;
        data?: { forms?: Array<{ id: string; name: string; is_active?: boolean }> };
    };
    return (j.forms ?? j.data?.forms ?? [])
        .filter((f) => f.is_active !== false)
        .map((f) => ({ id: f.id, name: f.name }));
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

/** Warm the form-delivery inputs for a record on intent. Deduped + TTL'd. Best-effort, non-throwing. */
export function prefetchFormDelivery(
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
