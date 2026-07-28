import { describe, expect, it } from "vitest";

import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import {
    buildMilestonesCardModel,
    deriveOpportunityFocusPanelPresentation,
} from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildFocusPanelCardSection } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import { readSummaryCardOrder } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import {
    ENROLLMENT_DEFAULT_LINKED_CARD_KEYS,
    ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS,
    findHiddenCardLinkReferences,
    formatHiddenCardLinkWarning,
    normalizeFocusPanelCardVisibility,
    partitionSummaryCardsByVisibility,
    setSummaryCardVisibility,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import { publishedLayoutReadingOrder } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Focus Panel card visibility model", () => {
    it("normalizes missing/invalid visibility to visible", () => {
        expect(normalizeFocusPanelCardVisibility(undefined)).toBe("visible");
        expect(normalizeFocusPanelCardVisibility("linked")).toBe("linked");
        expect(normalizeFocusPanelCardVisibility("hidden")).toBe("hidden");
        expect(normalizeFocusPanelCardVisibility("nope")).toBe("visible");
    });

    it("Enrollment default has Visible + Linked composition", () => {
        const order = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const { visible, linked, hidden } = partitionSummaryCardsByVisibility(order);
        expect(visible.map((e) => e.key)).toEqual([...ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS]);
        expect(linked.map((e) => e.key)).toEqual([...ENROLLMENT_DEFAULT_LINKED_CARD_KEYS]);
        expect(hidden).toHaveLength(0);
    });

    it("runtime initial composition includes Visible only; Linked stay navigable", () => {
        const inputs = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const laidOut = publishedLayoutReadingOrder(inputs.publishedLayout!);
        expect(laidOut).toEqual(expect.arrayContaining([...ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS]));
        for (const linked of ENROLLMENT_DEFAULT_LINKED_CARD_KEYS) {
            expect(laidOut).not.toContain(linked);
        }
        expect(inputs.linkedCardKeys).toEqual([...ENROLLMENT_DEFAULT_LINKED_CARD_KEYS]);
        expect(inputs.visibilityByCardKey.get("scheduling")).toBe("visible");
        expect(inputs.cellResolution.has("scheduling")).toBe(true);
    });

    it("moving Visible ↔ Linked preserves card identity", () => {
        const order = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const after = setSummaryCardVisibility(order, "scheduling", "linked");
        expect(after.find((e) => e.key === "scheduling")?.visibility).toBe("linked");
        expect(after.find((e) => e.key === "scheduling")?.instanceId).toBe("scheduling");
        const back = setSummaryCardVisibility(after, "scheduling", "visible");
        expect(back.find((e) => e.key === "scheduling")?.visibility).toBe("visible");
    });

    it("Assignments (scheduling) is Visible in the default published layout", () => {
        const order = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const inputs = deriveFocusPanelSummaryCompositionInputs(
            FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
        );
        expect(inputs.publishedLayout).not.toBeNull();
        const keys = publishedLayoutReadingOrder(inputs.publishedLayout!);
        expect(keys).toContain("scheduling");
        expect(partitionSummaryCardsByVisibility(order).visible.map((e) => e.key)).toContain(
            "scheduling",
        );
        expect(partitionSummaryCardsByVisibility(order).linked.map((e) => e.key)).not.toContain(
            "scheduling",
        );
    });

    it("honors Assignments Linked authorship — Linked stays off initial settle", () => {
        const order = setSummaryCardVisibility(
            readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC),
            "scheduling",
            "linked",
        );
        // Keep default published layout geometry; visibility filter must drop Linked cards.
        const linkedDoc = {
            ...FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
            sections: order.map((meta) => buildFocusPanelCardSection(meta)),
        };
        const inputs = deriveFocusPanelSummaryCompositionInputs(linkedDoc);
        expect(inputs.visibilityByCardKey.get("scheduling")).toBe("linked");
        expect(inputs.linkedCardKeys).toContain("scheduling");
        expect(publishedLayoutReadingOrder(inputs.publishedLayout!)).not.toContain("scheduling");
        // Linked cards remain resolvable for overlay open / link destinations.
        expect(inputs.cellResolution.has("scheduling")).toBe(true);
    });

    it("Milestones is enrollment Linked default and composer-capable (model + renderer)", () => {
        expect(ENROLLMENT_DEFAULT_LINKED_CARD_KEYS).toContain("milestones");
        expect(focusPanelCardCatalogLabel("milestones")).toBe("Milestones");
        const order = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        expect(order.find((e) => e.key === "milestones")?.visibility).toBe("linked");

        const model = buildMilestonesCardModel({});
        expect(model.key).toBe("milestones");
        expect(model.visible).toBe(true);
        expect(model.title).toBe("Milestones");
        expect(model.insight).toBe("No milestones yet");

        // Builder/runtime presentation map must include Milestones (not a ghost catalog entry).
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: minimalSettledOpportunityDrawerViewModel(),
            record: {},
            title: "Demo",
            perspective: null,
            statusLabel: null,
        });
        expect(cards.has("milestones")).toBe(true);
        expect(cards.get("milestones")!.title).toBe("Milestones");

        const renderer = readFileSync(
            resolve(__dirname, "../../../components/admin/focusPanel/FocusPanelCardRenderer.tsx"),
            "utf8",
        );
        expect(renderer).toContain('model.key === "milestones"');
        expect(renderer).toContain("MilestonesCard");
        const cardSrc = readFileSync(
            resolve(__dirname, "../../../components/admin/focusPanel/cards/MilestonesCard.tsx"),
            "utf8",
        );
        expect(cardSrc).toContain('data-milestones-card="true"');
        expect(cardSrc).toContain("No milestones yet");
    });

    it("warns when a Hidden card is still referenced by Linked fields", () => {
        const refs = findHiddenCardLinkReferences({
            links: [
                {
                    id: "1",
                    fromCard: "children",
                    toCard: "scheduling",
                    fromFieldKey: "Schedule",
                },
            ],
            visibilityByCardKey: new Map([["scheduling", "hidden"]]),
        });
        expect(refs).toHaveLength(1);
        expect(formatHiddenCardLinkWarning(refs)).toContain("Children → Schedule");
        expect(formatHiddenCardLinkWarning(refs)).toContain("Move to Linked");
    });
});
