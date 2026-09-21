/**
 * THE SERVICE IS WHERE THE GRAIN AND THE VALIDATION ARE ENFORCED.
 *
 * The resolver is pure and already proven. What these cover is the part a payload
 * can lie about: that the employment belongs to the caller's organization, that
 * times and dates are real, that two windows on one day cannot overlap, and that
 * changing a pattern SUPERSEDES the old one rather than erasing it.
 */
import { describe, expect, it, vi } from "vitest";

import {
    addAvailabilityException,
    cancelAvailabilityException,
    isValidYmd,
    normalizeTime,
    setRecurringAvailability,
    StaffAvailabilityError,
} from "@/lib/staffAvailability/staffAvailabilityService";

/** A Supabase stand-in that records what it was asked to do. */
function fakeDb(opts: { employmentFound?: boolean } = {}) {
    const calls: { table: string; op: string; payload?: unknown }[] = [];
    const api: Record<string, unknown> = {};
    let current = "";
    Object.assign(api, {
        calls,
        from(table: string) { current = table; return api; },
        select() { return api; },
        eq() { return api; },
        is() { return api; },
        lt() { return api; },
        order() { return api; },
        update(payload: unknown) { calls.push({ table: current, op: "update", payload }); return api; },
        insert(payload: unknown) { calls.push({ table: current, op: "insert", payload }); return api; },
        maybeSingle: async () => ({
            data: opts.employmentFound === false ? null : { id: "emp-1" }, error: null,
        }),
        single: async () => ({ data: { id: "row-1", org_id: "org-1" }, error: null }),
        then: undefined,
    });
    // `await supabase.from(...).update(...)...` resolves to { error } — the update
    // path awaits the builder itself.
    (api as { then?: unknown }).then = (res: (v: unknown) => void) => res({ data: [{ id: "row-1" }], error: null });
    return api as never;
}

describe("input normalisation", () => {
    it("accepts HH:MM and HH:MM:SS, refuses anything else", () => {
        expect(normalizeTime("07:30")).toBe("07:30:00");
        expect(normalizeTime("07:30:15")).toBe("07:30:15");
        expect(normalizeTime("7:30")).toBeNull();
        expect(normalizeTime("24:00")).toBeNull();
        expect(normalizeTime("07:60")).toBeNull();
        expect(normalizeTime("")).toBeNull();
    });

    it("validates real calendar dates, not merely the shape", () => {
        expect(isValidYmd("2026-09-28")).toBe(true);
        // Shape-only validation would accept this; it is not a real day.
        expect(isValidYmd("2026-02-30")).toBe(false);
        expect(isValidYmd("2026-13-01")).toBe(false);
        expect(isValidYmd("26-09-28")).toBe(false);
    });
});

describe("setting the recurring pattern", () => {
    const base = {
        orgId: "org-1", employmentId: "emp-1", effectiveStart: "2026-10-01",
        windows: [{ weekday: 1, startTime: "07:30", endTime: "16:30" }],
    };

    it("refuses an employment from another organization", async () => {
        await expect(setRecurringAvailability(fakeDb({ employmentFound: false }), base))
            .rejects.toMatchObject({ code: "not_found" });
    });

    it("refuses a window that ends before it starts", async () => {
        await expect(setRecurringAvailability(fakeDb(), {
            ...base, windows: [{ weekday: 1, startTime: "16:30", endTime: "07:30" }],
        })).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("refuses a weekday outside 0-6", async () => {
        await expect(setRecurringAvailability(fakeDb(), {
            ...base, windows: [{ weekday: 7, startTime: "07:30", endTime: "16:30" }],
        })).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("refuses overlapping windows on the same day, but allows a split", async () => {
        await expect(setRecurringAvailability(fakeDb(), {
            ...base,
            windows: [
                { weekday: 1, startTime: "07:00", endTime: "12:00" },
                { weekday: 1, startTime: "11:00", endTime: "15:00" },
            ],
        })).rejects.toMatchObject({ code: "conflict" });

        // Touching but not overlapping is a legitimate split.
        await expect(setRecurringAvailability(fakeDb(), {
            ...base,
            windows: [
                { weekday: 1, startTime: "07:00", endTime: "11:00" },
                { weekday: 1, startTime: "14:00", endTime: "18:00" },
            ],
        })).resolves.toBeTruthy();
    });

    it("refuses an end date before the start date", async () => {
        await expect(setRecurringAvailability(fakeDb(), {
            ...base, effectiveEnd: "2026-09-01",
        })).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("SUPERSEDES the open pattern by end-dating it the day before", async () => {
        const db = fakeDb();
        await setRecurringAvailability(db, base);
        const closed = (db as unknown as { calls: { table: string; op: string; payload: Record<string, unknown> }[] })
            .calls.find((c) => c.op === "update" && c.table === "staff_availability_windows");
        expect(closed, "the previous pattern must be end-dated, not deleted").toBeTruthy();
        // 2026-10-01 begins, so what came before ends 2026-09-30 — inclusive, so the
        // old pattern still covers its last day.
        expect(closed!.payload.effective_end).toBe("2026-09-30");
    });

    it("an empty week is allowed and closes the pattern without inserting rows", async () => {
        const db = fakeDb();
        const res = await setRecurringAvailability(db, { ...base, windows: [] });
        expect(res.windows).toEqual([]);
        const inserts = (db as unknown as { calls: { op: string }[] }).calls.filter((c) => c.op === "insert");
        expect(inserts).toHaveLength(0);
    });
});

describe("exceptions", () => {
    const base = { orgId: "org-1", employmentId: "emp-1", date: "2026-09-28" } as const;

    it("an available exception without times is refused", async () => {
        await expect(addAvailabilityException(fakeDb(), { ...base, kind: "available" }))
            .rejects.toMatchObject({ code: "invalid_input" });
    });

    it("an unavailable exception needs no times", async () => {
        await expect(addAvailabilityException(fakeDb(), { ...base, kind: "unavailable" }))
            .resolves.toBeTruthy();
    });

    it("refuses an invalid date and a foreign employment", async () => {
        await expect(addAvailabilityException(fakeDb(), { ...base, date: "2026-02-30", kind: "unavailable" }))
            .rejects.toMatchObject({ code: "invalid_input" });
        await expect(addAvailabilityException(fakeDb({ employmentFound: false }), { ...base, kind: "unavailable" }))
            .rejects.toMatchObject({ code: "not_found" });
    });

    it("cancelling DEACTIVATES rather than deletes", async () => {
        const db = fakeDb();
        await cancelAvailabilityException(db, "org-1", "exc-1", "u1");
        const call = (db as unknown as { calls: { op: string; payload: Record<string, unknown> }[] })
            .calls.find((c) => c.op === "update");
        // The record that someone was marked unavailable is part of why a schedule
        // looked the way it did; erasing it would make that unknowable.
        expect(call!.payload.is_active).toBe(false);
    });
});

describe("the error type is domain-shaped", () => {
    it("carries a code callers can map to a status", () => {
        const e = new StaffAvailabilityError("conflict", "overlap");
        expect(e.code).toBe("conflict");
        expect(e).toBeInstanceOf(Error);
    });
});
