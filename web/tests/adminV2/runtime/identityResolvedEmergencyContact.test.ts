import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    buildEmergencyContactResolutionHousehold,
    emergencyContactDraftReadyForResolution,
} from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/buildEmergencyContactResolutionHousehold";

const ROOT = join(process.cwd());

describe("identity-resolved Add Emergency Contact", () => {
    it("builds intake household for canonical resolution (no local fuzzy matcher)", () => {
        const household = buildEmergencyContactResolutionHousehold({
            first_name: "Kristi",
            last_name: "Kurzman",
            email: "kristikurzman@gmail.com",
            phone: "4805416328",
        });
        expect(household.parents_guardians[0]?.emails).toEqual(["kristikurzman@gmail.com"]);
        expect(household.source).toBe("focus_panel_emergency_contact");
    });

    it("requires identity signal before resolution", () => {
        expect(
            emergencyContactDraftReadyForResolution({
                first_name: "",
                last_name: "",
                email: "",
                phone: "",
            }),
        ).toBe(false);
        expect(
            emergencyContactDraftReadyForResolution({
                first_name: "Kristi",
                last_name: "Kurzman",
                email: "k@x.com",
                phone: "",
            }),
        ).toBe(true);
    });

    it("RelationshipActionGuidedModal routes EC to identity-resolved surface", () => {
        const src = readFileSync(join(ROOT, "components/layout/RelationshipActionGuidedModal.tsx"), "utf8");
        expect(src).toContain("IdentityResolvedEmergencyContactModal");
        expect(src).toContain('actionKey === "add_emergency_contact"');
        expect(src).toContain("RelationshipActionGuidedWizard");
    });

    it("EC modal has no four-step wizard or raw table names", () => {
        const src = readFileSync(
            join(ROOT, "components/admin/focusPanel/emergencyContacts/IdentityResolvedEmergencyContactModal.tsx"),
            "utf8",
        );
        expect(src).not.toContain("WizardStep");
        expect(src).not.toContain("customer_persons");
        expect(src).not.toContain("Tables:");
        expect(src).toContain("fetchIntakeRecordResolution");
        expect(src).toContain("Create new person");
        expect(src).toContain("All children");
        expect(src).toContain("alloy-os-bend-pine");
        // Must not show generic This child when no child selected — chip only when anchor exists
        expect(src).toContain("hasAnchorChild && anchorChildName");
    });

    it("Household openAddEmergencyContact defaults to all children scope", () => {
        const src = readFileSync(join(ROOT, "lib/adminV2/runtime/focusPanel/focusPanelMutation.ts"), "utf8");
        expect(src).toContain('scope: "all_children_in_household"');
        expect(src).toContain("initial_proposal");
    });

    it("modal hosts forward initial_proposal", () => {
        const work = readFileSync(join(ROOT, "lib/adminV2/workUnit/useWorkUnitRegistryModals.tsx"), "utf8");
        const drawer = readFileSync(
            join(ROOT, "lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx"),
            "utf8",
        );
        expect(work).toContain("initialProposal={relationshipState.initialProposal}");
        expect(drawer).toContain("initialProposal={relationshipActionState.initialProposal}");
    });
});
