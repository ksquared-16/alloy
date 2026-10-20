/**
 * ── W7-F029: WHAT THE CLICKED ROW ALREADY KNOWS ───────────────────────────────────────────────
 *
 * Measured on deployed 2d7f1747: the shell appeared in ~56 ms and the charge's own label only after
 * ~1.6 s, because Charge Details rendered a skeleton until the full projection (~35 serialized
 * reads) returned. The row the operator clicked already carries the charge's identity, amount,
 * state, period and dates — from the same read models — so those paint at once. Everything the
 * row cannot know (history, payments, accounting, funding) arrives with the authoritative read,
 * which then REPLACES the seed wholesale: the seed is never merged into, or preferred over, the
 * projection, so a charge that changed since the list was read is shown as it is now.
 */
export type ChargeDetailSeed = {
    label: string;
    /** Stored status (draft/posted/void/…) or the ledger lifecycle (scheduled/reversed). */
    status: string;
    awaiting?: { key: string; label: string; explanation: string; postsOn?: string | null } | null;
    householdName?: string | null;
    childName?: string | null;
    /** Already formatted by the surface that read it. */
    amountLabel?: string | null;
    serviceDate?: string | null;
    billingPeriodLabel?: string | null;
    invoiceDate?: string | null;
    dueDate?: string | null;
    postedAt?: string | null;
    responsibleParty?: string | null;
};
