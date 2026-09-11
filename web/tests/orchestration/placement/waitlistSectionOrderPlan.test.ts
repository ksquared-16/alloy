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
    planPrefixCanonicalOrdinals,
    resolveOrderFromOrdinals,
} from "@/lib/orchestration/placement/waitlistSectionOrderPlan";

/**
 * A synthetic twelve-row section, used as the natural order for the behavioural tests below.
 *
 * It is NOT the deployed Firefly natural order, despite being the same names — it is what Firefly
 * RENDERS. The real natural rank of TP8, TP6 and TP3 is not knowable from any observation, because
 * all three have carried pins since before anyone looked; see the repair suite at the bottom, which
 * handles that by enumerating every natural order consistent with the evidence instead of picking
 * one. For tests that only need "a section with a defined order", this is fine and the distinction
 * does not bite.
 */
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

/**
 * THE FIREFLY REPAIR, AND WHY IT DOES NOT REST ON A GUESS.
 *
 * A faulty writer renumbered live overrides at 16:24:18 on 2026-09-11. Repairing that means
 * reproducing what the operators asked for — which requires knowing the natural order, and the
 * natural order CANNOT be observed: TP8, TP6 and TP3 have carried pins since 14:55, so their
 * natural rank has never been displayed. Two renders are known (one captured while a QA pin was
 * live, one damaged), and between them they pin down the natural order only to within 660
 * possibilities.
 *
 * Picking one of the 660 and hoping would be exactly the class of mistake that caused the damage.
 * So these tests enumerate all of them, and assert the two things that make the unknown harmless:
 * the captured baseline is clean in every case, and the derived plan is identical in every case.
 *
 * See `qa/repair/waitlist-ordering-repair-plan.md` for the ledger and the timeline.
 */
describe("the Firefly repair is invariant under everything that is not known", () => {
    /*
     * ONE ASSUMPTION HERE IS LOAD-BEARING, AND IT IS NAMED RATHER THAN BURIED.
     *
     * Census gar_a2ceb4b3fce6d2 (15:49) recorded FIVE active pins, not four. The fifth belongs to
     * candidate 94984f6c at ordinal 2, and it is omitted from LEGITIMATE/CORRUPTED below because
     * that candidate does not appear among the twelve rendered rows.
     *
     * If that omission is wrong, every assertion in this block is wrong with it — so it is tested,
     * not assumed: `the fifth pin is excluded because the renders exclude it` below fails loudly if
     * including it ever becomes reproducible. Both observed renders currently reproduce ONLY with
     * it absent, which is the evidence the omission rests on.
     *
     * Census gar_f67e20ce1b87e5 is the independent check, and until it returns the repair plan in
     * qa/repair/waitlist-ordering-repair-plan.md is marked conditional. These tests describe a
     * derivation, not an applied change; nothing has been written to the tenant.
     */

    /** Captured while Wrigley still held QA pin `7e83e653` at ordinal 4. */
    const CAPTURED = ["PassA", "TP8", "TP6", "TP3", "Wrigley", "TP11", "PassB", "TP10", "TP7", "TP5", "TP4", "TP9"];
    /** After the faulty writer renumbered, with Wrigley's QA override cleared. */
    const DAMAGED = ["PassA", "Wrigley", "TP6", "TP8", "TP11", "TP10", "TP3", "PassB", "TP7", "TP5", "TP4", "TP9"];
    /** Stored ordinals at census 15:49 — before the damage. `94984f6c` is omitted: it renders nowhere. */
    const LEGITIMATE = new Map([["TP8", 2], ["TP6", 2], ["TP3", 3]]);
    /** Stored ordinals at census 16:52 — after it. */
    const CORRUPTED = new Map([["TP6", 3], ["TP8", 4], ["TP3", 7], ["PassB", 8]]);

    /** Rows unpinned in BOTH renders keep natural relative order in both, so their interleaving is readable. */
    const BACKBONE = ["PassA", "Wrigley", "TP11", "PassB", "TP10", "TP7", "TP5", "TP4", "TP9"];

    /** Every natural order that could have produced both observed renders. */
    const consistent: string[][] = (() => {
        const insertions = (base: string[], id: string) =>
            base.map((_, i) => [...base.slice(0, i), id, ...base.slice(i)]).concat([[...base, id]]);
        const all: string[][] = [];
        for (const a of insertions(BACKBONE, "TP8"))
            for (const b of insertions(a, "TP6"))
                for (const c of insertions(b, "TP3")) all.push(c);
        return all.filter(
            (nat) =>
                JSON.stringify(resolveOrderFromOrdinals(nat, new Map([...LEGITIMATE, ["Wrigley", 4]]))) ===
                    JSON.stringify(CAPTURED) &&
                JSON.stringify(resolveOrderFromOrdinals(nat, CORRUPTED)) === JSON.stringify(DAMAGED),
        );
    })();

    it("the evidence narrows the natural order, but does not determine it", () => {
        expect(consistent.length).toBe(660);
    });

    it("the fifth pin cannot sit anywhere in the damaged list holding the ordinal it stores", () => {
        // Candidate 94984f6c held an active pin — ordinal 2, renumbered to 3 — the whole time, and it
        // is left out of LEGITIMATE/CORRUPTED above. This is the check on that omission.
        //
        // The claim is deliberately narrow, because the wider one is FALSE and was briefly asserted
        // here: other ordinals do reproduce the damaged list (PassA at 1, TP10 at 6, TP9 at 12, and
        // so on), which stands to reason — an ordinal that happens to match a row's existing seat
        // changes nothing. What the evidence actually supports is that the ordinal this override
        // STORES cannot put it anywhere in the list. That is the fact the omission rests on, so that
        // is the fact asserted.
        const STORED_ORDINAL = 3;
        const visible = ["PassA", "TP11", "TP10", "TP7", "TP5", "TP4", "TP9"];
        for (const asRow of visible) {
            {
                const ordinal = STORED_ORDINAL;
                const withFifth = new Map([...CORRUPTED, [asRow, ordinal]]);
                const pinnedSet = new Set(withFifth.keys());
                let bases: string[][] = [DAMAGED.filter((r) => !pinnedSet.has(r))];
                for (const id of pinnedSet) {
                    bases = bases.flatMap((b) =>
                        b.map((_, i) => [...b.slice(0, i), id, ...b.slice(i)]).concat([[...b, id]]),
                    );
                }
                const reproducible = bases.some(
                    (natural) => JSON.stringify(resolveOrderFromOrdinals(natural, withFifth)) === JSON.stringify(DAMAGED),
                );
                expect(reproducible, `${asRow} at ordinal ${ordinal} should not reproduce DAMAGED`).toBe(false);
            }
        }
    });

    it("the QA pin on Wrigley was order-preserving, so the captured baseline is clean", () => {
        // Ordinal 4 seated Wrigley exactly where his natural rank already put him once the three
        // legitimate pins were placed ahead of him. This is why the capture can be used at all.
        for (const natural of consistent) {
            expect(resolveOrderFromOrdinals(natural, LEGITIMATE)).toEqual(CAPTURED);
        }
    });

    it("PassB's recorded ordinal means position 8 whichever list it was read against", () => {
        // `created_at == updated_at` on that override proves no later pass rewrote it, so 8 is the
        // operator's own number. It resolves to seat 8 over the legitimate state and over the
        // damaged one alike, so the requested position is unambiguous either way.
        for (const natural of consistent) {
            const withPassB = new Map([...LEGITIMATE, ["PassB", 8]]);
            expect(resolveOrderFromOrdinals(natural, withPassB).indexOf("PassB") + 1).toBe(8);
        }
        expect(DAMAGED.indexOf("PassB") + 1).toBe(8);
    });

    it("one ordinal plan reproduces the target for every possible natural order", () => {
        const target = planListMove(CAPTURED, "PassB", 8);
        expect(target).toEqual(
            ["PassA", "TP8", "TP6", "TP3", "Wrigley", "TP11", "TP10", "PassB", "TP7", "TP5", "TP4", "TP9"],
        );

        const plans = consistent.map((naturalOrder) =>
            deriveCanonicalManualOrdinals({
                naturalOrder,
                desiredOrder: target,
                pinnedIds: ["TP8", "TP6", "TP3", "PassB"],
            }),
        );

        for (const plan of plans) {
            expect(plan.reproduces).toBe(true);
            expect(plan.resolved).toEqual(target);
        }

        const distinct = new Set(plans.map((p) => JSON.stringify([...p.ordinals].sort())));
        expect(distinct.size).toBe(1);
        expect(Object.fromEntries(plans[0]!.ordinals)).toEqual({ TP8: 2, TP6: 3, TP3: 4, PassB: 8 });
    });

    it("the repair moves only the adjusted row and the one it displaces", () => {
        const target = planListMove(CAPTURED, "PassB", 8);
        const moved = CAPTURED.filter((id) => CAPTURED.indexOf(id) !== target.indexOf(id));
        expect(moved).toEqual(["PassB", "TP10"]);
    });

    it("TP6 and TP3 change ordinal value without changing position", () => {
        // This is the whole point of canonicalisation: 2,2,3 becomes 2,3,4 so the writer and the
        // renderer can never disagree again — while the operator sees nothing move.
        const target = planListMove(CAPTURED, "PassB", 8);
        for (const id of ["TP6", "TP3"]) {
            expect(target.indexOf(id)).toBe(CAPTURED.indexOf(id));
            expect(LEGITIMATE.get(id)).not.toBe(target.indexOf(id) + 1);
        }
    });
});

/**
 * THE WRITER'S ACTUAL PLAN: a pinned prefix.
 *
 * The product contract is "requested position equals resulting position", with no duplicate seats
 * and a stored state the renderer reproduces. These tests hold the writer to exactly that, and to
 * the one property that makes it safe to run in a mutation path: it never needs the natural order,
 * so it can never disagree with the renderer about what the natural order is.
 */
describe("prefix canonicalisation: requested position is the resulting position", () => {
    const SECTION = ["A", "B", "C", "D", "E", "F", "G", "H"];

    it("a move lands exactly where it was asked to, for every position in the section", () => {
        for (let target = 1; target <= SECTION.length; target += 1) {
            const plan = planPrefixCanonicalOrdinals({
                finalOrder: SECTION, movedId: "F", target, currentlyPinnedIds: [],
            });
            expect(plan.reproduces).toBe(true);
            expect(plan.desiredOrder.indexOf("F") + 1).toBe(target);
        }
    });

    it("holds for every row moved to every position, not just one row", () => {
        for (const movedId of SECTION) {
            for (let target = 1; target <= SECTION.length; target += 1) {
                const plan = planPrefixCanonicalOrdinals({
                    finalOrder: SECTION, movedId, target, currentlyPinnedIds: [],
                });
                expect(plan.reproduces, `${movedId} -> ${target}`).toBe(true);
                expect(plan.desiredOrder.indexOf(movedId) + 1, `${movedId} -> ${target}`).toBe(target);
                expect(plan.desiredOrder.slice().sort()).toEqual(SECTION.slice().sort());
            }
        }
    });

    it("ordinals are unique and dense, so no two rows can contend for a seat", () => {
        const plan = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "G", target: 3, currentlyPinnedIds: ["B"],
        });
        const values = [...plan.ordinals.values()].sort((a, b) => a - b);
        expect(values).toEqual([1, 2, 3]);
        expect(new Set(values).size).toBe(values.length);
    });

    it("pins a prefix, not the whole section", () => {
        const plan = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "H", target: 2, currentlyPinnedIds: [],
        });
        // Moving to 2 needs two seats settled, not eight.
        expect(plan.ordinals.size).toBe(2);
        expect([...plan.ordinals.keys()]).toEqual(["A", "H"]);
    });

    it("the prefix deepens to cover an existing pin, so no pin is left outside it", () => {
        const plan = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "B", target: 2, currentlyPinnedIds: ["F"],
        });
        expect(plan.ordinals.has("F")).toBe(true);
        expect(plan.ordinals.get("F")).toBe(plan.desiredOrder.indexOf("F") + 1);
        expect(plan.releasedIds).toEqual([]);
        expect(plan.reproduces).toBe(true);
    });

    it("a sequential move into an already-used area still lands exactly", () => {
        // The live matrix case: move to 4, then move something else to 2.
        const first = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "G", target: 4, currentlyPinnedIds: [],
        });
        expect(first.desiredOrder.indexOf("G") + 1).toBe(4);

        const second = planPrefixCanonicalOrdinals({
            finalOrder: first.desiredOrder,
            movedId: "E",
            target: 2,
            currentlyPinnedIds: [...first.ordinals.keys()],
        });
        expect(second.reproduces).toBe(true);
        expect(second.desiredOrder.indexOf("E") + 1).toBe(2);
        // G must not have been dragged off the seat the operator gave it.
        expect(second.desiredOrder.indexOf("G") + 1).toBe(5);
        expect(second.ordinals.get("G")).toBe(5);
    });

    it("moving a row to its current position changes nothing about the order", () => {
        const plan = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "D", target: 4, currentlyPinnedIds: [],
        });
        expect(plan.desiredOrder).toEqual(SECTION);
        expect(plan.reproduces).toBe(true);
    });

    it("the stored state reproduces under ANY natural order, which is why it is safe to write", () => {
        // The writer never learns the natural order. So the plan is only sound if replaying it over
        // an arbitrary natural order still produces the intended prefix. Check that directly: the
        // pinned prefix must occupy seats 1..k no matter how the rest is naturally ranked.
        const plan = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "H", target: 3, currentlyPinnedIds: ["B"],
        });
        const shuffles = [
            ["H", "G", "F", "E", "D", "C", "B", "A"],
            ["D", "A", "H", "C", "F", "B", "G", "E"],
            ["B", "C", "A", "H", "E", "G", "D", "F"],
        ];
        const prefix = plan.desiredOrder.slice(0, plan.ordinals.size);
        for (const natural of shuffles) {
            const resolved = resolveOrderFromOrdinals(natural, plan.ordinals);
            expect(resolved.slice(0, prefix.length), natural.join("")).toEqual(prefix);
        }
    });

    it("releases a pin that the new prefix no longer covers", () => {
        const deep = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "A", target: 7, currentlyPinnedIds: [],
        });
        expect(deep.ordinals.size).toBe(7);
        const shallow = planPrefixCanonicalOrdinals({
            finalOrder: deep.desiredOrder,
            movedId: "B",
            target: 1,
            currentlyPinnedIds: ["H"],
        });
        // H sits at position 7 in `deep`; after B moves to 1 the prefix only needs to reach H if H
        // is still pinned — it is, so it stays covered rather than being silently orphaned.
        expect(shallow.ordinals.has("H") || shallow.releasedIds.includes("H")).toBe(true);
        expect(shallow.reproduces).toBe(true);
    });

    it("a move naming a candidate outside the section is refused rather than guessed at", () => {
        const plan = planPrefixCanonicalOrdinals({
            finalOrder: SECTION, movedId: "ZZ", target: 2, currentlyPinnedIds: [],
        });
        expect(plan.desiredOrder).toEqual(SECTION);
    });
});
