import { describe, expect, it } from "vitest";

import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { cardAppliesToGrain, cardTitle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { focusPanelDefaultCompositionForGrain } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { canViewHealth } from "@/lib/health/healthAccess";

describe("§14 — Surface placement and Health permission are independent", () => {
    it("is placed at CHILD grain and nowhere else — placement follows the subject", () => {
        // Configuration chooses placement; permission chooses access. Health is placed where the
        // record of attention IS a child, and deliberately not on grains that have no single health
        // subject — at case grain the card refuses rather than guessing, which the published Surface
        // (v134) demonstrates in the real panel.
        expect(FOCUS_PANEL_CARD_KEYS).toContain("health_safety");
        // The child-WITH-FAMILY composition: a child reached through an Enrollment lens, where the
        // family settlement is authoritative. The DURABLE child composition is deliberately one card
        // and health facts require an enrolment, so it is not placed there.
        expect(
            focusPanelDefaultCompositionForGrain("child", { familySettlement: true } as never).map((e) => e.key),
        ).toContain("health_safety");
        expect(focusPanelDefaultCompositionForGrain("child").map((e) => e.key)).not.toContain("health_safety");
        for (const grain of ["opportunity", "person", "household"] as const) {
            const placed = focusPanelDefaultCompositionForGrain(grain).map((e) => e.key);
            expect(placed, `health_safety must not be code-placed on ${grain}`).not.toContain("health_safety");
        }
    });

    it("is child grain only — a case panel of several children has no single health subject", () => {
        expect(cardAppliesToGrain("health_safety", "child")).toBe(true);
        expect(cardAppliesToGrain("health_safety", "opportunity")).toBe(false);
        expect(cardAppliesToGrain("health_safety", "household")).toBe(false);
        expect(cardAppliesToGrain("health_safety", "person")).toBe(false);
    });

    it("does not disturb the existing `health` key, which is a different product concept", () => {
        // `health` means ENROLLMENT HEALTH — a pipeline metric with a chip and a tone. Superseding or
        // renaming it would have fed medical facts to every existing consumer of that key.
        expect(FOCUS_PANEL_CARD_KEYS).toContain("health");
        expect(cardTitle("health")).toBe("Enrollment Health");
        expect(cardTitle("health_safety")).toBe("Health & Safety");
    });

    it("placement cannot grant access — the permission answer ignores the Surface entirely", () => {
        // Surface configuration is not consulted by the access decision, and cannot be: the boundary
        // takes only the caller's grants.
        const opsOnSurface = { permissionKeys: ["ops.customers.read", "scheduling.read"] };
        expect(canViewHealth(opsOnSurface)).toBe(false);
        expect(canViewHealth({ permissionKeys: ["health.view"] })).toBe(true);
    });
});
