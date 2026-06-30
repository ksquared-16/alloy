import { describe, expect, it } from "vitest";

import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { isOperationalTruthCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    FOCUS_PANEL_CARD_CAPABILITIES,
    cardCapabilities,
    cardSupports,
    cardSupportsProfileImage,
    supportedLifecycleStates,
    validateCardCapabilities,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLifecycle";

describe("Universal Card Lifecycle + Capability Matrix", () => {
    it("declares capabilities for every card key (exhaustive matrix)", () => {
        for (const key of FOCUS_PANEL_CARD_KEYS) {
            expect(FOCUS_PANEL_CARD_CAPABILITIES[key]).toBeDefined();
            expect(FOCUS_PANEL_CARD_CAPABILITIES[key].supportsSummary).toBe(true);
        }
    });

    it("matches the brief's expectations for the reference + diagnostic cards", () => {
        const household = cardCapabilities("household");
        expect(household).toMatchObject({
            supportsSummary: true,
            supportsFocus: true,
            supportsInlineEdit: true,
            supportsExpanded: true,
            supportsWorkspace: false,
            supportsProfileImage: true,
        });
        expect(household.editableEvidenceGroups).toContain("primary_contact");
        expect(household.expansionEvidenceGroups).toContain("addresses");

        const child = cardCapabilities("children");
        expect(child).toMatchObject({
            supportsFocus: true,
            supportsInlineEdit: true,
            supportsExpanded: true,
            supportsWorkspace: false,
            supportsProfileImage: true,
        });
        expect(child.expansionEvidenceGroups).toContain("schedule_history");

        // Readiness: summary + expanded only, never focus/edit, no photo.
        expect(cardCapabilities("readiness_kpi")).toMatchObject({
            supportsSummary: true,
            supportsFocus: false,
            supportsInlineEdit: false,
            supportsExpanded: true,
            supportsProfileImage: false,
        });
        // Current Work: summary + expanded, no focus/edit, no workspace yet.
        expect(cardCapabilities("current_work")).toMatchObject({
            supportsFocus: false,
            supportsInlineEdit: false,
            supportsExpanded: true,
            supportsWorkspace: false,
        });
    });

    it("cardSupports maps lifecycle states to capability flags", () => {
        expect(cardSupports("household", "edit")).toBe(true);
        expect(cardSupports("readiness_kpi", "edit")).toBe(false);
        expect(cardSupports("readiness_kpi", "expanded")).toBe(true);
        expect(supportedLifecycleStates("household")).toEqual(["summary", "focus", "edit", "expanded"]);
        expect(supportedLifecycleStates("readiness_kpi")).toEqual(["summary", "expanded"]);
    });

    it("profile images only where identity matters (not diagnostic/metric cards)", () => {
        expect(cardSupportsProfileImage("household")).toBe(true);
        expect(cardSupportsProfileImage("children")).toBe(true);
        for (const key of ["readiness_kpi", "current_work", "timeline", "tasks"] as const) {
            expect(cardSupportsProfileImage(key)).toBe(false);
        }
    });

    it("the whole matrix is internally consistent (no contradictions)", () => {
        const allIssues = FOCUS_PANEL_CARD_KEYS.flatMap((key) => validateCardCapabilities(key));
        expect(allIssues).toEqual([]);
    });

    it("only operational truth cards can inline-edit, and edit implies focus", () => {
        for (const key of FOCUS_PANEL_CARD_KEYS) {
            const caps = cardCapabilities(key);
            if (caps.supportsInlineEdit) {
                expect(isOperationalTruthCard(key)).toBe(true);
                expect(caps.supportsFocus).toBe(true);
            }
        }
    });

    it("flags an inconsistent profile (edit without focus)", () => {
        const broken = { ...cardCapabilities("household"), supportsFocus: false };
        expect(validateCardCapabilities("household", broken).length).toBeGreaterThan(0);
    });
});
