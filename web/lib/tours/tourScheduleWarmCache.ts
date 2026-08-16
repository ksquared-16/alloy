/**
 * Tour scheduling WARM cache — makes "Schedule tour" open instantaneously with availability already
 * on screen, no "Checking tour bookings…" gate and no slot skeleton.
 *
 * Operator intent (hover / focus of the Schedule-tour affordance, or the focused What's Next surface
 * opening) warms three things for a work unit: its active tour bookings (the duplicate-guard input),
 * the availability slots for the initial window, and the approval rules. When the operator then opens
 * the capability, the panel renders those warm values synchronously and re-verifies freshness in the
 * background — the canonical warm-open contract, applied to a non-enrollment capability.
 *
 * Correctness: cached values are the SAME payloads the panel would fetch (identical URLs), bounded by
 * a short TTL and de-duplicated in-flight so intent + click never double-fetch. Errors are never
 * cached. Zero server coupling — this is browser-only.
 */
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import {
    TOUR_SLOT_PAGE_DAYS,
    tourSlotWindowBoundsUtc,
} from "@/lib/tours/availability/tourSlotWindowPagination";
import { logCurrentWorkInit } from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";

const WARM_TTL_MS = 45_000;

export type TourApprovalRule = { approval_required: boolean };

export type WarmTourSchedule = {
    activeBookings: TourBookingRow[];
    slots: AvailableTourSlot[];
    rulesById: Record<string, TourApprovalRule>;
    /** UTC window the slots cover (page 0). */
    windowFromIso: string;
    windowToIso: string;
};

type Entry = { promise: Promise<WarmTourSchedule | null>; value: WarmTourSchedule | null; startedAt: number };

const cache = new Map<string, Entry>();

/** Cache key — one warm entry per (opportunity, location). */
function keyFor(opportunityId: string, locationId: string): string {
    return `${opportunityId}::${locationId}`;
}

function isFresh(entry: Entry, now: number): boolean {
    return now - entry.startedAt < WARM_TTL_MS;
}

async function fetchActiveBookings(opportunityId: string): Promise<TourBookingRow[]> {
    const res = await fetch(`/api/admin/tours/opportunities/${encodeURIComponent(opportunityId)}/bookings`, {
        credentials: "include",
    });
    if (!res.ok) throw new Error(`bookings HTTP ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { active_bookings?: TourBookingRow[] };
    return j.active_bookings ?? [];
}

async function fetchSlots(locationId: string, fromIso: string, toIso: string): Promise<AvailableTourSlot[]> {
    const qs = new URLSearchParams({ location_id: locationId, from: fromIso, to: toIso });
    const res = await fetch(`/api/admin/tours/slots?${qs.toString()}`, { credentials: "include" });
    if (!res.ok) throw new Error(`slots HTTP ${res.status}`);
    const j = (await res.json()) as { slots?: AvailableTourSlot[] };
    return j.slots ?? [];
}

async function fetchRules(locationId: string): Promise<Record<string, TourApprovalRule>> {
    const res = await fetch(`/api/admin/tours/availability-rules?location_id=${encodeURIComponent(locationId)}`, {
        credentials: "include",
    });
    if (!res.ok) return {};
    const j = (await res.json()) as { rules?: { id: string; approval_required: boolean }[] };
    const map: Record<string, TourApprovalRule> = {};
    for (const r of j.rules ?? []) map[r.id] = { approval_required: Boolean(r.approval_required) };
    return map;
}

/**
 * Warm the tour schedule for a work unit on intent. Deduped + TTL'd (one in-flight fetch per
 * opportunity+location, re-warmed only after the TTL lapses). Best-effort and non-throwing. Returns
 * the in-flight/warm promise so callers can chain, or null when there is no location to schedule at.
 */
export function prefetchTourSchedule(
    opportunityId: string | null | undefined,
    locationId: string | null | undefined,
    now: number = Date.now(),
): Promise<WarmTourSchedule | null> | null {
    if (typeof window === "undefined") return null;
    const oid = String(opportunityId ?? "").trim();
    const loc = String(locationId ?? "").trim();
    if (!oid || !loc) return null;
    const key = keyFor(oid, loc);
    const existing = cache.get(key);
    if (existing && isFresh(existing, now)) {
        logCurrentWorkInit("tour.prefetch.reuse", { subjectId: oid, cacheKey: key, cache: "hit" });
        return existing.promise;
    }
    logCurrentWorkInit("tour.prefetch.start", { subjectId: oid, cacheKey: key, cache: "miss", preloadSource: "live" });

    const { from, to } = tourSlotWindowBoundsUtc(0, TOUR_SLOT_PAGE_DAYS);
    const windowFromIso = from.toISOString();
    const windowToIso = to.toISOString();

    const promise = (async (): Promise<WarmTourSchedule> => {
        const [activeBookings, slots, rulesById] = await Promise.all([
            fetchActiveBookings(oid).catch(() => [] as TourBookingRow[]),
            fetchSlots(loc, windowFromIso, windowToIso),
            fetchRules(loc),
        ]);
        const value: WarmTourSchedule = { activeBookings, slots, rulesById, windowFromIso, windowToIso };
        const entry = cache.get(key);
        if (entry) entry.value = value;
        logCurrentWorkInit("tour.prefetch.ready", {
            subjectId: oid,
            cacheKey: key,
            cache: "live",
            note: `${slots.length} slots · ${activeBookings.length} bookings`,
        });
        return value;
    })().catch((err) => {
        // Never cache a failure — drop the entry so the panel fetches fresh.
        if (cache.get(key)?.promise === promise) cache.delete(key);
        throw err;
    });

    cache.set(key, { promise, value: null, startedAt: now });
    void promise.catch(() => {});
    return promise;
}

/**
 * Peek the warm tour schedule WITHOUT consuming it — the panel renders this synchronously on open and
 * still re-verifies in the background. Returns null on a cold/stale/errored entry.
 */
export function peekWarmTourSchedule(
    opportunityId: string | null | undefined,
    locationId: string | null | undefined,
    now: number = Date.now(),
): WarmTourSchedule | null {
    const oid = String(opportunityId ?? "").trim();
    const loc = String(locationId ?? "").trim();
    if (!oid || !loc) return null;
    const entry = cache.get(keyFor(oid, loc));
    const hit = Boolean(entry && entry.value && isFresh(entry, now));
    logCurrentWorkInit("tour.peek", {
        subjectId: oid,
        cacheKey: keyFor(oid, loc),
        cache: hit ? "hit" : "miss",
        note: entry ? (entry.value ? "value ready" : "in-flight, not ready") : "no entry",
    });
    if (!hit) return null;
    return entry!.value;
}

/**
 * Does the warm entry already hold the EXACT slots query the panel is about to issue?
 *
 * The panel peeked this cache to paint synchronously and then re-fetched slots and approval
 * rules unconditionally — the same duplicate shape the form-delivery surface had. It could not
 * simply reuse the warm value, because its query is not always the warmed one: a reschedule
 * adds `exclude_booking_id`, and paging past page 0 moves the window.
 *
 * So the cache answers that question instead of the panel guessing. The warm entry is usable
 * only for the window it actually covers, and only when nothing is excluded; anything else is a
 * genuinely different query and must be fetched.
 */
export function peekWarmTourScheduleForQuery(
    opportunityId: string | null | undefined,
    locationId: string | null | undefined,
    query: { windowFrom: Date; windowTo: Date; excludeBookingId?: string | null },
    now: number = Date.now(),
): WarmTourSchedule | null {
    const warm = peekWarmTourSchedule(opportunityId, locationId, now);
    if (!warm) return null;
    if (query.excludeBookingId) return null;
    if (warm.windowFromIso !== query.windowFrom.toISOString()) return null;
    if (warm.windowToIso !== query.windowTo.toISOString()) return null;
    return warm;
}

/** Invalidate the warm entry after a booking mutation so the next open re-verifies. */
export function invalidateWarmTourSchedule(opportunityId: string, locationId: string): void {
    cache.delete(keyFor(opportunityId, locationId));
}

/** @internal test seam */
export function clearWarmTourScheduleForTests(): void {
    cache.clear();
}
