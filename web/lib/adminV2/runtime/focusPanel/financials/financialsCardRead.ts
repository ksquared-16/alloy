import { createInFlightCoalescer } from "@/lib/adminV2/runtime/focusPanel/financials/coalesceInFlight";
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

/**
 * THE ONE READ OF AN ACCOUNT'S FINANCIAL TRUTH, AND THE ONLY PLACE IT IS ASKED FOR.
 *
 * ── WHY THIS MOVED OUT OF THE CARD ──
 *
 * The coalescer that guarantees "one operation, one request" lived on a ref INSIDE the card. In the
 * Focus Panel that is enough: one card instance asks twice — the idle prewarm, then the click — and
 * the second joins the first.
 *
 * In the Accounts workspace it cannot be. The card is keyed by account, so selecting a different
 * household MOUNTS A NEW INSTANCE with a new ref and an empty slot. There was no shared ownership
 * for a prewarm to hand anything to, which is why the workspace never received the read-ahead its
 * Details guard assumes — measured at ~1,196 ms from click to a usable Details surface, all of it
 * one request that started at the click.
 *
 * ── AND WHY IT RETURNS THE MODEL ──
 *
 * The coalescer returns the FIRST caller's promise; a later caller's own work never runs. A
 * prewarm that returned `void` would therefore leave the card awaiting a promise that resolves to
 * nothing, having never called its own `setVm` — the read would be free and the card would still
 * be empty. The coalesced operation is the FETCH, and its value is the model, so whoever joins it
 * receives the same answer and applies it themselves.
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is not a cache, and the distinction is the line a performance repair on a money surface may
 * not cross. One slot, keyed by the composed query, CLEARED THE INSTANT THE OPERATION SETTLES. It
 * holds no financial truth between operations, survives no navigation, and answers nothing once the
 * work has finished. A mutation therefore has nothing to invalidate: the next read starts fresh
 * work, which is the existing re-read doctrine unchanged.
 *
 * Authorization is unchanged and unweakened. Every request still goes to the canonical route and is
 * authorized there, at request time. No verdict is stored, carried, or replayed: joining an
 * in-flight request is joining a request that the route is authorizing right now, for this same
 * browser session and this same account.
 */
const coalescer = createInFlightCoalescer<FinancialsCardVM | null>();

/**
 * The query the canonical card route is asked with.
 *
 * Composed HERE so the prewarm and the card cannot drift into two spellings of the same account —
 * two spellings are two keys, and two keys are the duplicate request this file exists to prevent.
 */
export function financialsCardQuery(args: {
    customerId?: string | null;
    customerMemberId?: string | null;
}): string | null {
    const customerId = args.customerId?.trim() || null;
    if (customerId) return `customer_id=${encodeURIComponent(customerId)}`;
    const memberId = args.customerMemberId?.trim() || null;
    if (memberId) return `customer_member_id=${encodeURIComponent(memberId)}`;
    return null;
}

/** Read the account's canonical model, or join the read already in the air for that same account. */
export function readFinancialsCardVm(query: string): Promise<FinancialsCardVM | null> {
    return coalescer.run(query, async () => {
        const res = await fetch(`/api/admin/financials/card?${query}`, { credentials: "include" });
        const json = (await res.json()) as { ok?: boolean; vm?: FinancialsCardVM };
        return json?.ok && json.vm ? json.vm : null;
    });
}

/**
 * Start that read before anyone asks for it. Sanctioned idle prefetch — never a reveal gate.
 *
 * Speculative, so it is best-effort in both directions: it never throws into the caller, and a
 * failure latches nothing. The slot clears on settle exactly as a consumed read does, so a failed
 * prediction leaves the explicit load to start fresh work under the normal contract rather than
 * inheriting a poisoned result.
 *
 * It reads and does nothing else. It cannot change the selection, commit truth, or make an account
 * authoritative before the click — it returns nothing at all to its caller.
 */
export function prewarmFinancialsCard(query: string | null): void {
    if (!query) return;
    void readFinancialsCardVm(query).catch(() => undefined);
}

/** Which account's read is in the air right now. Diagnostics and tests only. */
export function financialsCardReadInFlight(): string | null {
    return coalescer.inFlightKey();
}
