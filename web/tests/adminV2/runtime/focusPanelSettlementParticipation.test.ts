/**
 * VISIBLE READINESS IS READY MODELS ∩ PLACED CARDS.
 *
 * At settlement the chain reported `ready_count: 26` while the panel rendered 8 cells. The drawer VM
 * legitimately builds canonical models for consumers that are not this surface, so "how many models
 * are ready" and "how many cards the operator can see are ready" are different questions — and the
 * measurement was answering the first while claiming the second.
 *
 * The correction lives at the measurement boundary, not in any producer. Asking a producer "am I
 * placed on this Focus Panel?" would contaminate data ownership with surface participation; the grid
 * already holds both truths, so it reports what it placed and the chain intersects.
 *
 * Nothing here names a card. Participation is supplied the way the grid supplies it — resolved cell
 * type keys — and the assertions are written against that set, never against a fixed count.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    markFocusPanelWorkModeModel,
    setFocusPanelCardParticipation,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardReadinessTiming";
import { cardSuccessor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

/** A settled model whose ready set is exactly `ready`. Only the marked fields are read. */
function settled(subjectId: string, ready: readonly FocusPanelCardKey[]): FocusPanelWorkModeModel {
    return {
        source: "drawer_vm",
        subject: { id: subjectId },
        cardReadiness: new Map(ready.map((k) => [k, "ready" as const])),
    } as unknown as FocusPanelWorkModeModel;
}

/** Run the chain and capture what it emitted (`emitPerf` logs through `console.warn`). */
function emissions(model: FocusPanelWorkModeModel): Array<Record<string, unknown>> {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls: unknown[][];
    try {
        markFocusPanelWorkModeModel(model);
    } finally {
        calls = warn.mock.calls.map((c) => [...c]);
        warn.mockRestore();
    }
    return calls
        .map((c) => c[1] as Record<string, unknown> | undefined)
        .filter((p): p is Record<string, unknown> => !!p);
}

const readyCards = (e: Array<Record<string, unknown>>) =>
    e.filter((p) => p.event === "card_ready").map((p) => p.card_key as string);
const settlementCount = (e: Array<Record<string, unknown>>) =>
    e.find((p) => p.event === "settlement")?.ready_count;

let n = 0;
/** A fresh subject per case — the chain is per-subject, so cases must not share one. */
const subject = () => `subject-participation-${++n}`;

describe("settlement readiness counts placed cards only", () => {
    beforeEach(() => {
        n += 100;
    });

    it("A — a ready model with no resolved cell neither counts nor emits", () => {
        const s = subject();
        // The panel placed `household`; the VM also readied a card this composition does not show.
        setFocusPanelCardParticipation(s, ["household"]);
        const e = emissions(settled(s, ["household", "documents"]));
        expect(readyCards(e)).toEqual(["household"]);
        expect(readyCards(e)).not.toContain("documents");
        expect(settlementCount(e)).toBe(1);
    });

    it("B — a placed card whose model is ready counts exactly once", () => {
        const s = subject();
        const placed: FocusPanelCardKey[] = ["household", "children", "attendance"];
        setFocusPanelCardParticipation(s, placed);
        const e = emissions(settled(s, placed));
        expect(readyCards(e).sort()).toEqual([...placed].sort());
        expect(settlementCount(e)).toBe(placed.length);
    });

    it("C — a placed card that is not ready does not count as ready", () => {
        const s = subject();
        setFocusPanelCardParticipation(s, ["household", "financials"]);
        // `financials` is placed but its truth has not arrived: it must read as pending, not ready.
        const e = emissions(settled(s, ["household"]));
        expect(readyCards(e)).toEqual(["household"]);
        expect(settlementCount(e)).toBe(1);
    });

    it("D — a globally superseded predecessor never counts, even beside its placed successor", () => {
        const s = subject();
        expect(cardSuccessor("current_work")).toBe("business_process");
        setFocusPanelCardParticipation(s, ["business_process", "household"]);
        const e = emissions(settled(s, ["current_work", "business_process", "household"]));
        expect(readyCards(e)).not.toContain("current_work");
        expect(readyCards(e).sort()).toEqual(["business_process", "household"]);
        expect(settlementCount(e)).toBe(2);
    });

    it("E — a grain-scoped supersession is not globally eliminated", () => {
        const s = subject();
        // Employment yields to Staff on `person` only, so on a case it is a real, countable card.
        expect(cardSuccessor("employment")).toBeNull();
        expect(cardSuccessor("employment", "person")).toBe("staff");
        setFocusPanelCardParticipation(s, ["employment"]);
        const e = emissions(settled(s, ["employment"]));
        expect(readyCards(e)).toEqual(["employment"]);
    });

    it("F — many canonical models, only the composition's cards are visibly ready", () => {
        const s = subject();
        // The shape that produced the defect: far more ready models than placed cells.
        const placed: FocusPanelCardKey[] = ["business_process", "household", "children"];
        const extras: FocusPanelCardKey[] = [
            "attention", "current_mission", "readiness_kpi", "health", "tour_summary",
            "required_information", "milestones", "communications", "documents", "timeline", "notes",
        ];
        setFocusPanelCardParticipation(s, placed);
        const e = emissions(settled(s, [...placed, ...extras]));
        expect(settlementCount(e)).toBe(placed.length);
        for (const extra of extras) expect(readyCards(e)).not.toContain(extra);
    });

    it("participation is pinned to its subject, so grid-before-body ordering cannot leak", () => {
        // The grid resolves the NEXT subject's composition before the body marks it (child effects
        // run first). A previous subject's participation must never filter the new one.
        const older = subject();
        setFocusPanelCardParticipation(older, ["household"]);
        const newer = subject();
        setFocusPanelCardParticipation(newer, ["business_process", "financials"]);
        const e = emissions(settled(newer, ["business_process", "financials"]));
        expect(readyCards(e).sort()).toEqual(["business_process", "financials"]);
        expect(settlementCount(e)).toBe(2);
    });

    it("unknown participation reports the previous behaviour rather than silence", () => {
        // Not treated as "nothing is placed": trading over-reporting for silence is the worse error.
        const s = subject();
        setFocusPanelCardParticipation("some-other-subject", ["household"]);
        const e = emissions(settled(s, ["household", "children"]));
        expect(readyCards(e).sort()).toEqual(["children", "household"]);
    });
});
