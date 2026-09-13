/**
 * Thread 8, Slice F — Attendance may point at money. It may never compute it.
 *
 * Thread 7 put financial consequence behind a chain that ends in canonical
 * Financials. The way a module like this breaks that is never a second billing
 * engine; it is a number shown "just for display" that later disagrees with the
 * ledger. So the load-bearing assertions here are about what is ABSENT: no
 * amount, no rate, no total, and no query that could fetch one.
 *
 * The second property is silence. A child whose attendance had no financial
 * consequence must produce no sentence at all — a quiet context line that appears
 * on every record stops being read, and then stops being noticed when it matters.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    consequenceStatusLabel,
    consequenceSummarySentence,
    loadAttendanceConsequenceContext,
    ATTENDANCE_CONSUMPTION_FAMILY,
} from "@/lib/childcareOperational/attendance/attendanceConsequenceContext";

const ORG = "org-1";
const CHILD = "child-1";

function supa(rows: unknown[]) {
    const filters: Record<string, unknown> = {};
    let selected = "";
    const api = {
        select(cols: string) {
            selected = cols;
            return api;
        },
        eq(col: string, val: unknown) {
            filters[col] = val;
            return api;
        },
        gte: () => api,
        lte: () => api,
        then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
            return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
    };
    return {
        client: { from: vi.fn(() => api) } as unknown as SupabaseClient,
        filters,
        selected: () => selected,
    };
}

describe("loadAttendanceConsequenceContext — reads status, never money", () => {
    it("selects only the status column", async () => {
        const s = supa([]);
        await loadAttendanceConsequenceContext(s.client, ORG, CHILD);
        expect(s.selected()).toBe("status");
    });

    it("scopes to attendance-sourced consumption for this child in this org", async () => {
        const s = supa([]);
        await loadAttendanceConsequenceContext(s.client, ORG, CHILD);
        expect(s.filters.org_id).toBe(ORG);
        expect(s.filters.source_family).toBe(ATTENDANCE_CONSUMPTION_FAMILY);
        expect(s.filters.subject_id).toBe(CHILD);
    });

    it("returns no monetary field of any kind", async () => {
        const s = supa([{ status: "resolved" }]);
        const ctx = await loadAttendanceConsequenceContext(s.client, ORG, CHILD);
        const serialized = JSON.stringify(ctx).toLowerCase();
        for (const word of ["amount", "cents", "total", "price", "rate", "value", "currency"]) {
            expect(serialized).not.toContain(word);
        }
    });
});

describe("loadAttendanceConsequenceContext — counting", () => {
    it("counts each known state", async () => {
        const s = supa([
            { status: "recorded" },
            { status: "recorded" },
            { status: "resolved" },
            { status: "no_obligation" },
            { status: "superseded" },
        ]);
        const ctx = await loadAttendanceConsequenceContext(s.client, ORG, CHILD);
        expect(ctx.counts).toEqual({ recorded: 2, resolved: 1, no_obligation: 1, superseded: 1 });
        expect(ctx.hasUnresolved).toBe(true);
    });

    it("counts an unrecognised status nowhere rather than into a known bucket", async () => {
        // Folding it into `no_obligation` would say "nothing follows" about
        // something the product does not understand.
        const s = supa([{ status: "invented_state" }]);
        const ctx = await loadAttendanceConsequenceContext(s.client, ORG, CHILD);
        expect(ctx.counts).toEqual({ recorded: 0, resolved: 0, no_obligation: 0, superseded: 0 });
        expect(ctx.hasAnyConsequence).toBe(false);
    });

    it("always offers a way into Financials rather than answering the money itself", async () => {
        const s = supa([{ status: "recorded" }]);
        const ctx = await loadAttendanceConsequenceContext(s.client, ORG, CHILD);
        expect(ctx.financialsHref).toBe("/adminV2/financials");
    });
});

describe("consequenceSummarySentence — silence is the common case", () => {
    const ctx = (over: Partial<Record<string, number>> = {}) => ({
        childCustomerMemberId: CHILD,
        counts: { recorded: 0, resolved: 0, no_obligation: 0, superseded: 0, ...over } as never,
        hasAnyConsequence: Object.values(over).some((v) => (v ?? 0) > 0),
        hasUnresolved: (over.recorded ?? 0) > 0,
        financialsHref: "/adminV2/financials",
    });

    it("says nothing when nothing followed", () => {
        expect(consequenceSummarySentence(ctx())).toBeNull();
    });

    it("says nothing when the only outcome was that billing is unaffected", () => {
        // "No effect on billing" is true and not worth a line on every record.
        expect(consequenceSummarySentence(ctx({ no_obligation: 3 }))).toBeNull();
    });

    it("speaks up when something is waiting on a decision", () => {
        expect(consequenceSummarySentence(ctx({ recorded: 1 }))).toContain("waiting");
        expect(consequenceSummarySentence(ctx({ recorded: 2 }))).toContain("2 attendance days");
    });

    it("never puts a number in the sentence that could be mistaken for money", () => {
        const sentence = consequenceSummarySentence(ctx({ recorded: 4 })) ?? "";
        expect(sentence).not.toMatch(/[$£€]/);
    });
});

describe("operator language", () => {
    it("never shows a raw status key", () => {
        for (const s of ["recorded", "resolved", "no_obligation", "superseded"] as const) {
            expect(consequenceStatusLabel(s)).not.toContain(s);
        }
    });
});
