/**
 * Recombining two concurrent attaches must produce exactly what the serial composition produced.
 * The reference for every case below is `tours(epp(rows))` — the shape this replaced.
 */
import { describe, expect, it } from "vitest";
import { mergeIndependentRowAttachments } from "@/lib/queues/mergeIndependentRowAttachments";

type Row = Record<string, unknown>;
const base: Row[] = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
const epp = (rows: Row[]) => rows.map((r) => ({ ...r, _epp: `s-${r.id}` }));
const tours = (rows: Row[]) => rows.map((r) => ({ ...r, _tour: `t-${r.id}`, has_tour: true }));

describe("merging two independent attaches", () => {
    it("equals the serial composition it replaced", () => {
        const serial = tours(epp(base));
        const merged = mergeIndependentRowAttachments(base, epp(base), tours(base));
        expect(merged).toEqual(serial);
    });

    it("keeps BOTH attaches' fields — the whole point", () => {
        const merged = mergeIndependentRowAttachments(base, epp(base), tours(base));
        expect(merged[0]).toMatchObject({ id: "a", n: 1, _epp: "s-a", _tour: "t-a", has_tour: true });
    });

    it("a secondary that returned its input unchanged overlays nothing", () => {
        // Both owners return the INPUT rows when they cannot read; that must not erase the primary.
        const merged = mergeIndependentRowAttachments(base, epp(base), base);
        expect(merged).toEqual(epp(base));
    });

    it("a failed PRIMARY still receives the secondary's fields", () => {
        const merged = mergeIndependentRowAttachments(base, base, tours(base));
        expect(merged).toEqual(tours(base));
    });

    it("a secondary that legitimately writes a FALSY value still overlays it", () => {
        // `Object.is` against the base, not truthiness: has_tour=false is an answer, not an absence.
        const falsy = base.map((r) => ({ ...r, has_tour: false }));
        const merged = mergeIndependentRowAttachments(base, epp(base), falsy);
        expect(merged[0].has_tour).toBe(false);
        expect(merged[0]._epp).toBe("s-a");
    });

    it("a secondary that OVERWRITES a base field wins over the base, not over nothing", () => {
        const rewrites = base.map((r) => ({ ...r, n: 99 }));
        const merged = mergeIndependentRowAttachments(base, epp(base), rewrites);
        expect(merged[0].n).toBe(99);
        expect(merged[0]._epp).toBe("s-a");
    });

    it("REFUSES to zip mismatched lengths, falling back to the secondary", () => {
        const short = [tours(base)[0]];
        expect(mergeIndependentRowAttachments(base, epp(base), short)).toEqual(short);
        expect(mergeIndependentRowAttachments(base, [epp(base)[0]], tours(base))).toEqual(tours(base));
    });

    it("preserves row order", () => {
        const merged = mergeIndependentRowAttachments(base, epp(base), tours(base));
        expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
    });

    it("an empty population merges to empty", () => {
        expect(mergeIndependentRowAttachments([], [], [])).toEqual([]);
    });
});
