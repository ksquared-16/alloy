/**
 * THE RENDERER AND THE WRITER MUST AGREE ON WHAT THE LIST IS.
 *
 * These tests hold the planner that makes that true, and the first of them is the one the abandoned
 * implementation would have failed. That writer renumbered legacy duplicate ordinals using
 * `created_at` while the renderer broke ties by natural rank, so normalizing a section silently
 * rearranged director adjustments nobody had touched — measured live as TP8 2→4, TP3 4→7,
 * TP11 6→5, TP10 8→6.
 */
import { describe, expect, it } from "vitest";
import {
    deriveCanonicalManualOrdinals,
    planListMove,
    resolveOrderFromOrdinals,
} from "@/lib/orchestration/placement/waitlistSectionOrderPlan";

/** The deployed Infant section, natural rank order. */
const NATURAL = ["PassA", "TP8", "TP6", "TP3", "Wrigley", "TP11", "PassB", "TP10", "TP7", "TP5", "TP4", "TP9"];

/** Plan a move and return the order it actually reproduces. */
function move(args: {
    natural?: readonly string[];
    ordinals: Record<string, number>;
    movedId: string;
    target: number;
}) {
    const natural = args.natural ?? NATURAL;
    const current = resolveOrderFromOrdinals(natural, new Map(Object.entries(args.ordinals)));
    const desired = planListMove(current, args.movedId, args.target);
    const plan = deriveCanonicalManualOrdinals({
        naturalOrder: natural,
        desiredOrder: desired,
        pinnedIds: [...Object.keys(args.ordinals), args.movedId],
    });
    return { current, desired, plan };
}

describe("normalizing a section preserves every order nobody asked to change", () => {
    // Three rivals on ordinal 2 and one on 3 — the state a census found on the deployed org.
    const LEGACY = { TP8: 2, TP6: 2, TP3: 2, TP11: 3 };

    it("the renderer's view of the legacy state is the baseline the writer must keep", () => {
        const current = resolveOrderFromOrdinals(NATURAL, new Map(Object.entries(LEGACY)));
        expect(current).toEqual([
            "PassA", "TP8", "TP6", "TP3", "TP11",
            "Wrigley", "PassB", "TP10", "TP7", "TP5", "TP4", "TP9",
        ]);
    });

    it("moving one candidate changes ONLY what that move implies", () => {
        const { current, desired, plan } = move({ ordinals: LEGACY, movedId: "Wrigley", target: 4 });
        expect(plan.reproduces).toBe(true);
        expect(plan.resolved).toEqual(desired);
        expect(plan.resolved[3]).toBe("Wrigley"); // requested 4, resulting 4

        // Everyone else keeps the relative order the renderer was already showing.
        const withoutMoved = (list: readonly string[]) => list.filter((id) => id !== "Wrigley");
        expect(withoutMoved(plan.resolved)).toEqual(withoutMoved(current));
    });

    it("canonical ordinals are unique, so nothing can contend for a seat", () => {
        const { plan } = move({ ordinals: LEGACY, movedId: "Wrigley", target: 4 });
        const values = [...plan.ordinals.values()];
        expect(new Set(values).size).toBe(values.length);
    });

    it("no created_at style tie-break can reorder the section", () => {
        // The planner is handed the renderer's order and never re-derives one, so a different
        // arrival order for the same ordinals cannot change the result.
        const a = move({ ordinals: { TP8: 2, TP6: 2, TP3: 2, TP11: 3 }, movedId: "Wrigley", target: 4 });
        const b = move({ ordinals: { TP3: 2, TP6: 2, TP8: 2, TP11: 3 }, movedId: "Wrigley", target: 4 });
        expect(b.plan.resolved).toEqual(a.plan.resolved);
    });
});

describe("a move lands exactly where it was requested", () => {
    it("every target 1..N is exact", () => {
        for (let target = 1; target <= NATURAL.length; target += 1) {
            const { plan, desired } = move({ ordinals: {}, movedId: "Wrigley", target });
            expect(plan.reproduces, `target ${target}`).toBe(true);
            expect(plan.resolved.indexOf("Wrigley") + 1, `target ${target}`).toBe(target);
            expect(plan.resolved).toEqual(desired);
        }
    });

    it("the worked example composes: E to 2, then D to 1", () => {
        const natural = ["A", "B", "C", "D", "E"];
        const first = move({ natural, ordinals: {}, movedId: "E", target: 2 });
        expect(first.plan.resolved).toEqual(["A", "E", "B", "C", "D"]);

        const second = move({
            natural,
            ordinals: Object.fromEntries(first.plan.ordinals),
            movedId: "D",
            target: 1,
        });
        expect(second.plan.resolved).toEqual(["D", "A", "E", "B", "C"]);
        expect(second.plan.reproduces).toBe(true);
    });

    it("cold reconstruction from the persisted ordinals reproduces the same order", () => {
        const natural = ["A", "B", "C", "D", "E"];
        const { plan } = move({ natural, ordinals: { E: 2 }, movedId: "D", target: 1 });
        expect(resolveOrderFromOrdinals(natural, plan.ordinals)).toEqual(plan.resolved);
    });

    it("moving to the current position is a no-op", () => {
        const { current, plan } = move({ ordinals: { TP8: 2 }, movedId: "TP8", target: 2 });
        expect(plan.resolved).toEqual(current);
    });

    it("boundaries: 1 to N and N to 1", () => {
        expect(move({ ordinals: {}, movedId: "PassA", target: 12 }).plan.resolved.at(-1)).toBe("PassA");
        expect(move({ ordinals: {}, movedId: "TP9", target: 1 }).plan.resolved[0]).toBe("TP9");
    });
});

describe("membership changes keep the list dense and the manual intent intact", () => {
    it("a candidate leaving compacts the order with no gaps", () => {
        const { plan } = move({ ordinals: {}, movedId: "Wrigley", target: 3 });
        const smaller = NATURAL.filter((id) => id !== "TP7");
        const resolved = resolveOrderFromOrdinals(smaller, plan.ordinals);
        expect(resolved).toHaveLength(11);
        expect(new Set(resolved).size).toBe(11);
        expect(resolved.indexOf("Wrigley") + 1).toBe(3);
    });

    it("a candidate joining high naturally does not defeat an explicit move", () => {
        const { plan } = move({ ordinals: {}, movedId: "Wrigley", target: 2 });
        const bigger = ["StaffB", ...NATURAL];
        const resolved = resolveOrderFromOrdinals(bigger, plan.ordinals);
        expect(resolved.indexOf("Wrigley") + 1).toBe(2);
        expect(resolved).toHaveLength(13);
    });
});
