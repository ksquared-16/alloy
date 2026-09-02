/**
 * RUNTIME LAW — a dormant catalog capability must not silently consume commit-critical work.
 *
 * A card may occupy a commit-critical spec only if it:
 *   1. participates in the resolved surface composition, or
 *   2. gates another participating model, or
 *   3. is required by another active runtime consumer.
 *
 * `readiness_kpi` satisfies none of the three today: it is in the catalog (a tenant may publish it)
 * but placed by no composition, no card's build depends on it, and its only non-render consumer is
 * commit telemetry — which is the harm, not a justification (see below). It is therefore built for
 * every committed subject and then discarded by the renderer.
 *
 * This test does NOT change that. Kelly's instruction is explicit: do not delete it, do not place it,
 * preserve the scaffold. Participation-gating the producer would require threading the resolved
 * composition into it — which is the `placement` registry concern, deliberately CLOSED pending the
 * Child second surface. So the bounded, zero-risk correction available now is to make the dormancy
 * **declared instead of accidental**: the allowlist below is the one place a dormant commit-critical
 * card may be admitted, and any NEW card that becomes dormant commit-critical work fails here loudly.
 *
 * The allowlist lives in the test, not in runtime code, so this carries no runtime behaviour change.
 *
 * KNOWN LIMIT OF THIS TEST — learned the hard way. It checks participation against the DEFAULT
 * composition, which is the only composition available statically. A TENANT-PUBLISHED composition can
 * exclude a card that the default includes, making that card dormant at runtime for that tenant while
 * this test stays green. That is exactly what happened with `scheduling`: it participates in the
 * default composition (so this test passed) but Firefly's published doc resolves to four cards without
 * it, so promoting it to commit-critical spent work that tenant never used. The promotion was reverted.
 * Treat a green result here as necessary, not sufficient — per-tenant dormancy needs the resolved
 * composition, which is not available at the commit-composer boundary.
 */

import { describe, expect, it } from "vitest";

import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { cardSuccessor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Dormant commit-critical cards, each with the reason it is admitted despite not participating.
 * Adding an entry is a deliberate architectural act — justify it here or place the card.
 */
const DECLARED_DORMANT_COMMIT_CRITICAL: Readonly<Record<string, string>> = {
    readiness_kpi:
        "In the catalog and publishable by a tenant, but in no default composition. Its build is a " +
        "pure synchronous derivation (no I/O), so the cost is negligible; the real consequence is " +
        "that commit telemetry counts it as a ready card the operator never sees. Participation " +
        "gating is blocked on the CLOSED `placement` concern and is bound to the Child second surface.",
};

describe("commit-critical cards must participate, or declare their dormancy", () => {
    const placed = new Set<FocusPanelCardKey>(
        FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((entry) => entry.key),
    );

    it("every commit-critical spec either participates in the default composition or is declared dormant", () => {
        const undeclared = COMMIT_CRITICAL_CARD_SPECS
            .map((spec) => spec.key)
            .filter((key) => !placed.has(key) && !(key in DECLARED_DORMANT_COMMIT_CRITICAL));

        expect(
            undeclared,
            `These cards consume commit-critical work but participate in no composition. Either place ` +
                `them, remove their commit-critical spec, or declare them in ` +
                `DECLARED_DORMANT_COMMIT_CRITICAL with a reason: ${undeclared.join(", ")}`,
        ).toEqual([]);
    });

    it("readiness_kpi is the only declared-dormant card, and it is genuinely unplaced", () => {
        expect(Object.keys(DECLARED_DORMANT_COMMIT_CRITICAL)).toEqual(["readiness_kpi"]);
        expect(placed.has("readiness_kpi")).toBe(false);
        expect(COMMIT_CRITICAL_CARD_SPECS.some((spec) => spec.key === "readiness_kpi")).toBe(true);
    });

    it("a declared-dormant entry must be retired once the card is actually placed", () => {
        // The allowlist is a debt register, not a parking space: if a composition ever places one of
        // these, the entry has to go, or it will hide the next genuinely-dormant card.
        const placedButStillDeclaredDormant = Object.keys(DECLARED_DORMANT_COMMIT_CRITICAL).filter(
            (key) => placed.has(key as FocusPanelCardKey),
        );
        expect(placedButStillDeclaredDormant).toEqual([]);
    });

    /**
     * PLACED IN THIS LIST IS NOT THE SAME AS RENDERED BY A CELL — the second known limit.
     *
     * `placed` is the RAW default composition. The runtime resolves every cell through
     * `normalizeFocusPanelCardKey`, where supersession outranks exact match, so `current_work` is
     * rewritten to `business_process` before a cell exists and NO composition can render it. It is
     * named here because the composition names it, not because an operator sees it.
     *
     * That gap is pinned by `focusPanelSupersededCardReadiness.test.ts`, which asks the question
     * this file cannot: does a cell resolve to this identity once the runtime has normalized it?
     */
    it("the three commit-critical cards are named by the default composition", () => {
        for (const key of ["current_work", "household", "children"] as const) {
            expect(COMMIT_CRITICAL_CARD_SPECS.some((spec) => spec.key === key)).toBe(true);
            expect(placed.has(key)).toBe(true);
        }
    });

    it("and of those, `current_work` is named under an identity the runtime has retired", () => {
        // Stated explicitly so this file cannot be read as evidence that the card renders.
        expect(cardSuccessor("current_work")).toBe("business_process");
        expect(cardSuccessor("household")).toBeNull();
        expect(cardSuccessor("children")).toBeNull();
    });
});
