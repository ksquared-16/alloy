/**
 * THE DURABLE RECORD ADDRESS — one builder, one parser, one vocabulary.
 *
 * `/workspace/record/{person|child}/{id}` is the canonical address of a record attended
 * subject-first. It lives under the operator workspace base because a durable record is still
 * operator attention — it is simply attention that no queue happens to hold.
 *
 * ── WHY AN ADDRESS AT ALL ──
 *
 * `useWorkUnitEntryGesture`'s lesson is that a route is SEED-ONLY for a queue surface: navigating
 * there instead of moving attention renders nothing. A durable record is the opposite case — it has
 * no queue page to be a member of, so the address IS the intent, which is the one situation the
 * attention doctrine already allows a URL to establish attention (Art 2.4, cold entry).
 *
 * Components never build this string. They state intent through `useOperatorRecordFocus` and the
 * adapter owns the destination — the same rule that keeps every operational caller from growing its
 * own routing logic.
 */

/** The grains that have a durable destination today. Mirrors the composers that exist. */
export type DurableSubjectType = "person" | "child";

export const DURABLE_RECORD_BASE = "/workspace/record" as const;

export function isDurableSubjectType(value: string): value is DurableSubjectType {
    const v = value.trim().toLowerCase();
    return v === "person" || v === "child";
}

/**
 * Map an attention subject type to its durable destination grain.
 *
 * `opportunity` returns null on purpose: a case HAS an operational home, and sending it to a durable
 * surface would route around the queue it belongs to.
 */
export function durableSubjectTypeFor(subjectType: string): DurableSubjectType | null {
    const v = subjectType.trim().toLowerCase();
    if (v === "person" || v === "persons") return "person";
    if (v === "child" || v === "customer_members") return "child";
    return null;
}

export function durableRecordHref(
    subjectType: DurableSubjectType,
    subjectId: string,
    cardKey?: string | null,
    /**
     * The business context the host should open on, when the caller expressed a preference.
     *
     * Rides the address for the same reason the card does: a cold load must land where the gesture
     * meant. It is a PREFERENCE — an address naming a context the record does not hold resolves the
     * default instead of failing, because a stale bookmark must not break a record.
     */
    contextKey?: string | null,
): string {
    const base = `${DURABLE_RECORD_BASE}/${subjectType}/${encodeURIComponent(subjectId.trim())}`;
    const params = new URLSearchParams();
    const card = (cardKey ?? "").trim();
    if (card) params.set("card", card);
    const context = (contextKey ?? "").trim();
    if (context) params.set("context", context);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
}
