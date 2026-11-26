/**
 * GRAIN-SCOPED CARD SUPERSESSION — `employment → staff`, on the person grain ONLY.
 *
 * The first supersession (`current_work → business_process`) was global. This one must not be: on a
 * durable PERSON the Employment presentation is superseded by Staff, while on a CASE the Employment
 * chip answers a different question ("does anyone on this household work here?") and must not move.
 * These tests hold both halves, because a mechanism that only proved the person half would silently
 * rewrite every family panel.
 */

import { describe, expect, it } from "vitest";

import {
    normalizeFocusPanelCardKey,
    supersededCardSuccessor,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import {
    cardAppliesToGrain,
    cardSuccessor,
    resolveCardIdentity,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { derivePersonFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/derivePersonFocusPanelCards";
import { NULL_EMPLOYMENT_SIGNAL } from "@/lib/adminV2/runtime/operationalContext/types";

/** A stored placement list resolved for one surface grain. */
function resolvePlacement(stored: readonly string[], grain: "opportunity" | "person"): string[] {
    const out: string[] = [];
    for (const raw of stored) {
        const key = normalizeFocusPanelCardKey(raw, { grain });
        if (key && !out.includes(key)) out.push(key);
    }
    return out;
}

describe("employment → staff, person grain only", () => {
    it("1 — existing PERSON-grain employment placement resolves to staff", () => {
        expect(normalizeFocusPanelCardKey("employment", { grain: "person" })).toBe("staff");
        expect(resolvePlacement(["employment"], "person")).toEqual(["staff"]);
    });

    it("2 — existing CASE-grain employment stays employment", () => {
        expect(normalizeFocusPanelCardKey("employment", { grain: "opportunity" })).toBe("employment");
        expect(resolvePlacement(["employment"], "opportunity")).toEqual(["employment"]);
        // And a caller that cannot state a grain must not receive the person answer.
        expect(normalizeFocusPanelCardKey("employment")).toBe("employment");
        expect(cardSuccessor("employment")).toBeNull();
    });

    it("3 — explicit person-grain staff resolves once, to itself", () => {
        expect(normalizeFocusPanelCardKey("staff", { grain: "person" })).toBe("staff");
        expect(resolvePlacement(["staff"], "person")).toEqual(["staff"]);
    });

    it("4 — a person config holding BOTH forms deduplicates to one Staff card", () => {
        expect(resolvePlacement(["employment", "staff"], "person")).toEqual(["staff"]);
        expect(resolvePlacement(["staff", "employment"], "person")).toEqual(["staff"]);
    });

    it("5 — ordering and placement are preserved", () => {
        expect(resolvePlacement(["household", "employment", "scheduling"], "person")).toEqual([
            "household",
            "staff",
            "scheduling",
        ]);
        // The case surface is untouched, in the same position.
        expect(resolvePlacement(["household", "employment", "scheduling"], "opportunity")).toEqual([
            "household",
            "employment",
            "scheduling",
        ]);
    });

    it("6 — scheduling is separately placed and entirely unaffected", () => {
        expect(cardSuccessor("scheduling", "person")).toBeNull();
        expect(normalizeFocusPanelCardKey("scheduling", { grain: "person" })).toBe("scheduling");
        expect(cardAppliesToGrain("scheduling", "person")).toBe(true);
        // Staff did not absorb the scheduling question.
        expect(resolvePlacement(["employment", "scheduling"], "person")).toEqual(["staff", "scheduling"]);
    });

    it("7 — no tenant edit is required: the grain declarations make exactly one card compose", () => {
        expect(cardAppliesToGrain("staff", "person")).toBe(true);
        expect(cardAppliesToGrain("employment", "person")).toBe(false);
        expect(cardAppliesToGrain("employment", "opportunity")).toBe(true);
        expect(cardAppliesToGrain("staff", "opportunity")).toBe(false);

        const composed = [...derivePersonFocusPanelCards({ employment: NULL_EMPLOYMENT_SIGNAL }).keys()];
        expect(composed).toContain("staff");
        expect(composed).not.toContain("employment");
    });

    it("the global supersession still applies on every grain, unchanged", () => {
        for (const grain of ["opportunity", "person"] as const) {
            expect(normalizeFocusPanelCardKey("current_work", { grain })).toBe("business_process");
        }
        expect(normalizeFocusPanelCardKey("current_work")).toBe("business_process");
    });

    it("resolveCardIdentity is total — an unsuperseded key resolves to itself", () => {
        expect(resolveCardIdentity("household", "person")).toBe("household");
        expect(resolveCardIdentity("staff", "person")).toBe("staff");
        expect(supersededCardSuccessor("household", "person")).toBeNull();
    });
});
