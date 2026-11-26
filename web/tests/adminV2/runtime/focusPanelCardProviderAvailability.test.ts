import { describe, expect, it } from "vitest";

import {
    cardRequiresProvider,
    isCardCapabilityAvailable,
    isCardProviderUnavailable,
    providerRequiringCardKeys,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardProviders";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { buildFocusPanelCardSection } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import { buildChildrenCardModel } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";

/**
 * Provider availability — a card requiring authoritative facts with NO registered provider is
 * provider-unavailable → excluded from production participation. It may never occupy a production card
 * slot, and (per the platform LAW) must never emit a business conclusion from missing wiring.
 * See `docs/runtime/CARD-READINESS-LIFECYCLE.md`.
 */

function docWith(sections: LayoutSection[]): LayoutDoc {
    return {
        formatVersion: 1,
        surface: "focus-panel-summary",
        entityType: "opportunity",
        sections,
        metadata: { focusPanelMode: "summary" },
    } as unknown as LayoutDoc;
}

describe("Focus Panel card provider availability", () => {
    it("milestones is provider-unavailable (no adapter registered); household is available", () => {
        expect(cardRequiresProvider("milestones")).toBe(true);
        expect(isCardCapabilityAvailable("milestones")).toBe(false);
        expect(isCardProviderUnavailable("milestones")).toBe(true);

        // A card with no provider requirement composes from the always-resolved context.
        expect(cardRequiresProvider("household")).toBe(false);
        expect(isCardCapabilityAvailable("household")).toBe(true);
        expect(isCardProviderUnavailable("household")).toBe(false);
    });

    it("the capability gate forces a provider-unavailable card to HIDDEN — even when authored visible", () => {
        const doc = docWith([
            buildFocusPanelCardSection({ key: "household", span: 1, density: "standard", tier: "reference", gridRow: 0, visibility: "visible" }),
            // Milestones authored VISIBLE by the tenant — the gate must still exclude it.
            buildFocusPanelCardSection({ key: "milestones", span: 1, density: "compact", tier: "context", gridRow: 1, visibility: "visible" }),
        ]);

        const inputs = deriveFocusPanelSummaryCompositionInputs(doc);

        // The gate overrides authored visibility for the unavailable capability, and only that one.
        expect(inputs.visibilityByCardKey.get("milestones")).toBe("hidden");
        expect(inputs.visibilityByCardKey.get("household")).toBe("visible");

        // It occupies NO production slot: not in cellResolution, not a linked (navigable) destination.
        const cellTypeKeys = [...inputs.cellResolution.values()].map((r) => r.typeKey);
        expect(cellTypeKeys).not.toContain("milestones");
        expect(cellTypeKeys).toContain("household");
        expect(inputs.linkedCardKeys).not.toContain("milestones");

        // …and never appears in the resolved grid / compose set.
        const gridKeys = inputs.gridRows.flatMap((r) => r.cells.map((c) => c.key));
        expect(gridKeys.some((k) => k.includes("milestones"))).toBe(false);
        expect(inputs.composeCards.map((c) => c.typeKey)).not.toContain("milestones");
    });

    it("COMPLETENESS: no provider-unavailable card survives to any production participation slot", () => {
        // Author every provider-requiring card as visible; the composition must still exclude the unavailable ones.
        const sections = providerRequiringCardKeys().map((key, i) =>
            buildFocusPanelCardSection({ key, span: 1, density: "compact", tier: "context", gridRow: i, visibility: "visible" }),
        );
        const inputs = deriveFocusPanelSummaryCompositionInputs(docWith(sections));
        for (const key of providerRequiringCardKeys()) {
            if (!isCardProviderUnavailable(key)) continue;
            expect(inputs.visibilityByCardKey.get(key)).toBe("hidden");
            expect([...inputs.cellResolution.values()].map((r) => r.typeKey)).not.toContain(key);
            expect(inputs.linkedCardKeys).not.toContain(key);
            expect(inputs.composeCards.map((c) => c.typeKey)).not.toContain(key);
        }
    });
});

describe("Children AUTHORITATIVE empty vs unavailable capability (the LAW distinction)", () => {
    // Children HAS a wired provider (household/CRM enrichment resolves the roster; browser-proven with
    // 6 subjects showing distinct real children). Its empty state is therefore an AUTHORITATIVE function
    // of the resolved roster — not a missing-wiring fallback like Milestones. This is the in-code
    // childless fixture: the org currently has no childless lead, so we prove the provider's empty
    // mapping is deterministic and authoritative.
    it("empty resolved roster -> authoritative 'No children linked' (not a fabricated verdict)", () => {
        const emptyModel = buildChildrenCardModel({ _inquiry_children: [] });
        expect(emptyModel.insight).toBe("No children linked");

        const missingModel = buildChildrenCardModel({}); // no key at all -> same authoritative empty
        expect(missingModel.insight).toBe("No children linked");
    });

    it("populated resolved roster -> the roster is shown (proves the state is a function of the input)", () => {
        const model = buildChildrenCardModel({
            _inquiry_children: [
                { id: "child-1", person_id: "p1", customer_member_id: "cm1", ocm_id: "ocm1", display_name: "Ava Wenc", outcome_status_key: "new", age: "3" },
            ],
        });
        expect(model.insight).not.toBe("No children linked");
        expect(model.insight).toMatch(/child/i);
    });

    it("children is provider-AVAILABLE (a resolved roster is authoritative) — unlike milestones", () => {
        expect(isCardCapabilityAvailable("children")).toBe(true);
        expect(isCardProviderUnavailable("children")).toBe(false);
        // Contrast: milestones has no provider, so its empty is never authoritative and it is excluded.
        expect(isCardProviderUnavailable("milestones")).toBe(true);
    });
});
