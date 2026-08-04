import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Household card — Make primary wiring", () => {
    it("uses canonical confirm modal + mutation seam (not a client-only toggle)", () => {
        const card = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/cards/HouseholdCard.tsx"),
            "utf8",
        );
        expect(card).toContain("LeadHouseholdPrimaryContactConfirmModal");
        expect(card).toContain("makeHouseholdPrimaryContact");
        expect(card).toContain("data-household-make-primary-contact");
        expect(card).toContain("householdShowsPrimaryContactControl");
        expect(card).toContain("alloy-os-household__primary-badge");
    });

    it("Focus Panel mutation delegates to patchHouseholdPrimaryContact + record refresh", () => {
        const mutation = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelMutation.ts"),
            "utf8",
        );
        expect(mutation).toContain("makeHouseholdPrimaryContact");
        expect(mutation).toContain("patchHouseholdPrimaryContact");
        expect(mutation).toContain("applyLeadPrimaryContactToOpportunityRecord");
        expect(mutation).toContain("dispatchOpportunityDrawerRecordPatch");
    });
});
