/**
 * BUSINESS PROCESS CARD IDENTITY — the five compatibility proofs for `current_work → business_process`.
 *
 * The supersession is of CARD IDENTITY, not of the Current Work platform concept: `current_work`
 * stays a canonical data owner that the Business Process card consumes. These tests hold that line
 * from both sides — the card must normalize away, and the concept must survive.
 */

import { describe, expect, it } from "vitest";

import {
    FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY,
    FOCUS_PANEL_CARD_CATALOG,
    FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
    normalizeFocusPanelCardKey,
    supersededCardSuccessor,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { cardTitle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";

/** What a stored tenant Surface configuration looks like, reduced to the part that matters. */
function resolveConfiguredCards(stored: readonly string[]): string[] {
    const out: string[] = [];
    for (const raw of stored) {
        const key = normalizeFocusPanelCardKey(raw);
        if (!key) continue;
        if (!out.includes(key)) out.push(key); // dedupe preserves FIRST placement
    }
    return out;
}

describe("business_process card identity", () => {
    it("1 — existing `current_work` Surface configuration resolves to `business_process`", () => {
        expect(normalizeFocusPanelCardKey("current_work")).toBe(FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY);
        // Every legacy spelling and the operator label land on the same successor.
        for (const legacy of ["whats_next", "whats-next", "current-work", "Current Work", "What's Next"]) {
            expect(normalizeFocusPanelCardKey(legacy)).toBe(FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY);
        }
    });

    it("2 — explicit `business_process` resolves once, to itself", () => {
        expect(normalizeFocusPanelCardKey("business_process")).toBe(FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY);
        expect(resolveConfiguredCards(["business_process"])).toEqual(["business_process"]);
    });

    it("3 — a configuration holding BOTH legacy and canonical forms deduplicates to one card", () => {
        expect(resolveConfiguredCards(["current_work", "business_process"])).toEqual(["business_process"]);
        expect(resolveConfiguredCards(["business_process", "current_work"])).toEqual(["business_process"]);
        expect(resolveConfiguredCards(["whats_next", "current_work", "business_process"])).toEqual([
            "business_process",
        ]);
    });

    it("3b — dedupe keeps the card at its EXISTING placement and moves nothing else", () => {
        // The one replaced card occupies the placement the legacy key already held.
        expect(resolveConfiguredCards(["household", "current_work", "children"])).toEqual([
            "household",
            "business_process",
            "children",
        ]);
    });

    it("4 — Current Work truth remains available: the key is NOT deleted from the runtime union", () => {
        // The concept survives. Only its CARD presentation is superseded.
        expect((FOCUS_PANEL_CARD_KEYS as readonly string[])).toContain(FOCUS_PANEL_WHATS_NEXT_CARD_KEY);
        expect(cardTitle(FOCUS_PANEL_WHATS_NEXT_CARD_KEY)).toBeTruthy();
    });

    it("5 — the never-both invariant: the catalog offers this identity exactly once", () => {
        const offered = FOCUS_PANEL_CARD_CATALOG.filter(
            (e) =>
                e.cardKey === FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY ||
                e.cardKey === FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
        );
        expect(offered).toHaveLength(1);
        expect(offered[0]!.cardKey).toBe(FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY);

        // And no configuration, however written, can yield both keys at once.
        expect(resolveConfiguredCards(["current_work", "whats_next", "business_process"])).not.toContain(
            FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
        );
    });

    it("5b — supersession outranks exact match, which is the whole mechanism", () => {
        // `current_work` is still a union member; an exact-match-first lookup would return it
        // unchanged and the successor would never be reached. Ordering is load bearing.
        expect((FOCUS_PANEL_CARD_KEYS as readonly string[])).toContain("current_work");
        expect(supersededCardSuccessor("current_work")).toBe(FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY);
        expect(supersededCardSuccessor("business_process")).toBeNull();
        expect(supersededCardSuccessor("household")).toBeNull();
    });

    it("no card disappears: a superseded key always names a REGISTERED successor", () => {
        expect((FOCUS_PANEL_CARD_KEYS as readonly string[])).toContain(
            FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY,
        );
        expect(cardTitle(FOCUS_PANEL_BUSINESS_PROCESS_CARD_KEY)).toBeTruthy();
    });
});
