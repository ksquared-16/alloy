import { describe, expect, it } from "vitest";
import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    isOperationalTruthCard,
    isWorkOwningCard,
    isFocusElevatingCard,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import { FOCUS_PANEL_CARDS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";

/**
 * Registry design-law — LIFECYCLE concern (concern 2) parity lock.
 *
 * The canvas-elevation ownership (`isOperationalTruthCard` / `isWorkOwningCard`) migrated from the two
 * central membership sets (`OPERATIONAL_TRUTH_CARDS` / `WORK_OWNING_CARDS`) into per-card registry
 * flags (`ownsOperationalTruth` / `ownsWorkCompletion`). These assert the migration is BEHAVIOR-
 * IDENTICAL 1:1 for every card key, and that adding a lifecycle-owning card is now ONE registry entry
 * (no central-set edit) — the extension-model guarantee.
 */

// The exact membership the central sets declared before the migration (the frozen ground truth).
const EXPECTED_OPERATIONAL_TRUTH = new Set([
    "household",
    "children",
    "billing_preview",
    "scheduling",
    "documents",
    "communications",
]);
// `business_process` is the canonical successor to the `current_work` CARD and renders the same
// work-completion presentation, so it owns work completion for the same reason its predecessor
// does. The predecessor stays declared because it remains reachable as a data identity.
const EXPECTED_WORK_OWNING = new Set(["current_work", "business_process"]);

describe("Focus Panel lifecycle concern — registry parity (concern 2)", () => {
    it("isOperationalTruthCard matches the pre-migration OPERATIONAL_TRUTH_CARDS set for every key", () => {
        for (const key of FOCUS_PANEL_CARD_KEYS) {
            expect(isOperationalTruthCard(key)).toBe(EXPECTED_OPERATIONAL_TRUTH.has(key));
        }
    });

    it("isWorkOwningCard matches the pre-migration WORK_OWNING_CARDS set for every key", () => {
        for (const key of FOCUS_PANEL_CARD_KEYS) {
            expect(isWorkOwningCard(key)).toBe(EXPECTED_WORK_OWNING.has(key));
        }
    });

    it("isFocusElevatingCard = truth ∪ work-owning (unchanged composition)", () => {
        for (const key of FOCUS_PANEL_CARD_KEYS) {
            const expected = EXPECTED_OPERATIONAL_TRUTH.has(key) || EXPECTED_WORK_OWNING.has(key);
            expect(isFocusElevatingCard(key)).toBe(expected);
        }
    });

    it("every truth-owning card is declared in the registry (no central-set edit needed to add one)", () => {
        const declaredTruth = new Set(
            FOCUS_PANEL_CARDS.filter((c) => c.ownsOperationalTruth === true).map((c) => c.key),
        );
        expect(declaredTruth).toEqual(EXPECTED_OPERATIONAL_TRUTH);
    });

    it("every work-owning card is declared in the registry", () => {
        const declaredWork = new Set(
            FOCUS_PANEL_CARDS.filter((c) => c.ownsWorkCompletion === true).map((c) => c.key),
        );
        expect(declaredWork).toEqual(EXPECTED_WORK_OWNING);
    });
});
