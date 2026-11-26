import { describe, expect, it } from "vitest";

import { resolveWorkUnitSelectedSubject } from "@/lib/presentation/runtime/workUnitPillSwitching";

/**
 * Canonical Work Unit selected-subject resolution. Proves the precedence
 * (url → retained → strategy → first_row → empty) and the IMPOSSIBLE-STATE invariant: a populated
 * view never resolves to a null subject. This is the ONE resolver the committed model, the readiness
 * gate, and the auto-open effect all consume.
 */

const ROWS = ["rec-1", "rec-2", "rec-3"];

function resolve(overrides: Partial<Parameters<typeof resolveWorkUnitSelectedSubject>[0]> = {}) {
    return resolveWorkUnitSelectedSubject({
        routeRecordId: null,
        rowRecordIds: ROWS,
        retainedRecordId: null,
        forceAutoOpen: false,
        queueSettled: true,
        ...overrides,
    });
}

describe("resolveWorkUnitSelectedSubject — precedence", () => {
    it("cold populated route (no url, no retained) → first visible row", () => {
        expect(resolve()).toEqual({ selectedRecordId: "rec-1", source: "first_row" });
    });

    it("cached rows already available before mount → first row (deterministic, not empty)", () => {
        expect(resolve({ queueSettled: true, rowRecordIds: ROWS })).toEqual({
            selectedRecordId: "rec-1",
            source: "first_row",
        });
    });

    it("retained selection still present in rows → retained (return-navigation restore)", () => {
        expect(resolve({ retainedRecordId: "rec-2" })).toEqual({ selectedRecordId: "rec-2", source: "retained" });
    });

    it("out-of-view pin after stage move keeps Focus Panel subject without auto-nav", () => {
        expect(
            resolve({
                retainedRecordId: "rec-gone",
                outOfViewPinnedRecordId: "rec-gone",
                rowRecordIds: ["rec-1", "rec-2"],
            }),
        ).toEqual({ selectedRecordId: "rec-gone", source: "retained_out_of_view" });
    });

    it("explicit deep-linked record in the route → url (wins over retained + first row)", () => {
        expect(resolve({ routeRecordId: "rec-3", retainedRecordId: "rec-2" })).toEqual({
            selectedRecordId: "rec-3",
            source: "url",
        });
    });

    it("in-page pill force-switch ignores a stale URL and lands on the new lane's subject", () => {
        // Operator switched pills in-page: the deep-link URL no longer pins selection → first row.
        expect(resolve({ routeRecordId: "rec-old", forceAutoOpen: true })).toEqual({
            selectedRecordId: "rec-1",
            source: "first_row",
        });
    });

    it("invalid retained record (not in current rows) falls through to the first row", () => {
        expect(resolve({ retainedRecordId: "rec-deleted" })).toEqual({
            selectedRecordId: "rec-1",
            source: "first_row",
        });
    });

    it("selected row removed by mutation → next valid row, never blank", () => {
        // Retained rec-2 was removed; the remaining rows resolve to their first entry.
        expect(resolve({ retainedRecordId: "rec-2", rowRecordIds: ["rec-1", "rec-3"] })).toEqual({
            selectedRecordId: "rec-1",
            source: "first_row",
        });
    });

    it("authoritative empty view (settled, zero rows) → empty/null", () => {
        expect(resolve({ rowRecordIds: [], queueSettled: true })).toEqual({
            selectedRecordId: null,
            source: "empty",
        });
    });

    it("a deep link to a record outside the current rows still selects it (url)", () => {
        expect(resolve({ routeRecordId: "rec-external", rowRecordIds: ROWS })).toEqual({
            selectedRecordId: "rec-external",
            source: "url",
        });
    });
});

describe("resolveWorkUnitSelectedSubject — impossible-state invariant", () => {
    it("whenever rows exist, the resolved subject is never null", () => {
        const rowSets = [["a"], ["a", "b"], ROWS, Array.from({ length: 50 }, (_, i) => `r${i}`)];
        for (const rows of rowSets) {
            for (const retained of [null, "a", "missing", rows[rows.length - 1]!]) {
                for (const routeRecordId of [null, "deep-link"]) {
                    for (const forceAutoOpen of [false, true]) {
                        const r = resolveWorkUnitSelectedSubject({
                            routeRecordId,
                            rowRecordIds: rows,
                            retainedRecordId: retained,
                            forceAutoOpen,
                            queueSettled: true,
                        });
                        expect(r.selectedRecordId, `rows=${rows.length} retained=${retained}`).not.toBeNull();
                        expect(r.source).not.toBe("empty");
                    }
                }
            }
        }
    });

    it("only a genuinely empty row set yields a null subject", () => {
        expect(resolve({ rowRecordIds: [] }).selectedRecordId).toBeNull();
        expect(resolve({ rowRecordIds: [], routeRecordId: "x" }).selectedRecordId).toBe("x"); // url still pins
    });
});

describe("resolveWorkUnitSelectedSubject — per-view isolation (A→B→A, WV switch)", () => {
    it("retained record is honored only when it matches the current view's rows", () => {
        // Simulate WU A (rows A) with retained recA, then WU B (rows B, retained recA is stale) → first row of B,
        // then back to A (rows A, retained recA valid) → recA restored. The per-view retained id is the caller's
        // responsibility (the runtime peeks by workViewId); the resolver honors it only if present in rows.
        const viewA = resolveWorkUnitSelectedSubject({
            routeRecordId: null,
            rowRecordIds: ["recA-1", "recA-2"],
            retainedRecordId: "recA-2",
            forceAutoOpen: false,
            queueSettled: true,
        });
        expect(viewA).toEqual({ selectedRecordId: "recA-2", source: "retained" });

        const viewB = resolveWorkUnitSelectedSubject({
            routeRecordId: null,
            rowRecordIds: ["recB-1", "recB-2"],
            retainedRecordId: "recA-2", // stale for view B
            forceAutoOpen: false,
            queueSettled: true,
        });
        expect(viewB).toEqual({ selectedRecordId: "recB-1", source: "first_row" });

        const backToA = resolveWorkUnitSelectedSubject({
            routeRecordId: null,
            rowRecordIds: ["recA-1", "recA-2"],
            retainedRecordId: "recA-2",
            forceAutoOpen: false,
            queueSettled: true,
        });
        expect(backToA).toEqual({ selectedRecordId: "recA-2", source: "retained" });
    });
});
