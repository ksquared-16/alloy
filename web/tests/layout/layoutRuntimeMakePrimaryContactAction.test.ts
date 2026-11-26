import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    MAKE_PRIMARY_CONTACT_ACTION_KEY,
    MAKE_PRIMARY_CONTACT_ACTION_LABEL,
} from "@/lib/admin/actions/makePrimaryContactAction";
import { applyLeadPrimaryContactToOpportunityRecord } from "@/lib/admin/person/applyLeadPrimaryContactToOpportunityRecord";
import {
    customerPersonRowIsHouseholdPrimaryContact,
    HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
} from "@/lib/admin/person/householdPrimaryContact";
import { isAllowedLayoutEditorActionKey } from "@/lib/layout/layoutEditorActionButton";
import {
    resolveMakePrimaryContactActionContext,
    shouldShowMakePrimaryContactAction,
} from "@/lib/layout/runtime/layoutRuntimeMakePrimaryContactAction";
import { visibilityConditionForRule } from "@/lib/layout/layoutEditorVisibilityRules";
import { LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS } from "@/lib/layout/layoutEditorContactRoles";

const baseOpportunityRecord = {
    id: "opp-1",
    customer_id: "cust-1",
    primary_person_id: "person-kelly",
    _customer_persons: [
        {
            customer_id: "cust-1",
            person_id: "person-kelly",
            role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
            is_primary: true,
        },
        {
            customer_id: "cust-1",
            person_id: "person-kevin",
            role_type: "guardian",
            is_primary: false,
        },
    ],
    _household_adult_links: [
        {
            customer_id: "cust-1",
            person_id: "person-kelly",
            display_name: "Kelly Mitchell",
            role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
            is_primary: true,
            is_household_primary_contact: true,
        },
        {
            customer_id: "cust-1",
            person_id: "person-kevin",
            display_name: "Kevin Mitchell",
            role_type: "guardian",
            is_primary: false,
            is_household_primary_contact: false,
        },
    ],
    _opportunity_persons: [
        {
            person_id: "person-kelly",
            role_type: "primary_contact",
            name: "Kelly Mitchell",
        },
        {
            person_id: "person-kevin",
            role_type: "guardian",
            name: "Kevin Mitchell",
        },
    ],
};

describe("make_primary_contact framework action", () => {
    it("registers make_primary_contact in layout editor action keys", () => {
        expect(MAKE_PRIMARY_CONTACT_ACTION_KEY).toBe("make_primary_contact");
        expect(MAKE_PRIMARY_CONTACT_ACTION_LABEL).toBe("Make Primary Contact");
        expect(isAllowedLayoutEditorActionKey("make_primary_contact")).toBe(true);
    });

    it("resolves action context for a non-primary related-list row", () => {
        const ctx = resolveMakePrimaryContactActionContext({
            anchorRecord: baseOpportunityRecord,
            rowRecord: {
                person_id: "person-kevin",
                "person.display_name": "Kevin Mitchell",
            },
        });
        expect(ctx?.targetPersonId).toBe("person-kevin");
        expect(ctx?.currentPrimaryPersonId).toBe("person-kelly");
        expect(ctx?.currentPrimaryPersonName).toBe("Kelly Mitchell");
        expect(ctx?.scopeLabels).toContain("Household account");
    });

    it("shows action for secondary contact and hides for current primary", () => {
        const secondaryCtx = resolveMakePrimaryContactActionContext({
            anchorRecord: baseOpportunityRecord,
            rowRecord: { person_id: "person-kevin", "person.display_name": "Kevin Mitchell" },
        });
        expect(
            shouldShowMakePrimaryContactAction({ context: secondaryCtx, canMutate: true }),
        ).toBe(true);

        const primaryCtx = resolveMakePrimaryContactActionContext({
            anchorRecord: baseOpportunityRecord,
            rowRecord: { person_id: "person-kelly", "person.display_name": "Kelly Mitchell" },
        });
        expect(
            shouldShowMakePrimaryContactAction({ context: primaryCtx, canMutate: true }),
        ).toBe(false);
    });

    it("requires confirmation modal with current and new primary labels", () => {
        const modal = readFileSync(
            join(process.cwd(), "components/layout/lead/LeadHouseholdPrimaryContactConfirmModal.tsx"),
            "utf8",
        );
        expect(modal).toContain("currentPrimaryName");
        expect(modal).toContain("scopeLabels");
        expect(modal).toContain("Current");
        expect(modal).toContain("New primary");
        expect(modal).toContain("ActionModalOverlayShell");
        expect(modal).toContain("bg-alloy-bend-pine");
        expect(modal).not.toContain("bg-alloy-blue");
    });

    it("promotes secondary contact and keeps old primary linked", () => {
        const next = applyLeadPrimaryContactToOpportunityRecord(baseOpportunityRecord, "cust-1", "person-kevin");
        expect(next.primary_person_id).toBe("person-kevin");

        const cpRows = next._customer_persons as {
            person_id?: string;
            is_primary?: boolean;
            role_type?: string;
        }[];
        const primaryRows = cpRows.filter((row) =>
            customerPersonRowIsHouseholdPrimaryContact({
                role_type: row.role_type,
                is_primary: row.is_primary,
            }),
        );
        expect(primaryRows).toHaveLength(1);
        expect(primaryRows[0]?.person_id).toBe("person-kevin");
        expect(cpRows.find((row) => row.person_id === "person-kelly")).toBeTruthy();
    });

    it("wires EB runtime action button to patchLeadHouseholdPrimaryContact", () => {
        const runtime = readFileSync(
            join(process.cwd(), "components/layout/LayoutRuntimeMakePrimaryContactActionButton.tsx"),
            "utf8",
        );
        expect(runtime).toContain("patchLeadHouseholdPrimaryContact");
        expect(runtime).toContain("LeadHouseholdPrimaryContactConfirmModal");
        expect(runtime).toContain("MAKE_PRIMARY_CONTACT_ACTION_KEY");

        const planView = readFileSync(
            join(process.cwd(), "components/layout/LayoutRuntimeRelationshipActionButton.tsx"),
            "utf8",
        );
        expect(planView).toContain("LayoutRuntimeMakePrimaryContactActionButton");
        expect(planView).toContain("isMakePrimaryContactActionKey");
    });

    it("maps show_when_not_primary visibility to contact block overlay path", () => {
        const condition = visibilityConditionForRule("show_when_not_primary", "_action_button");
        expect(condition?.path).toBe(LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.isNotPrimary);
    });

    it("blocks person.is_primary from inline edit", () => {
        const editability = readFileSync(
            join(process.cwd(), "lib/layout/runtime/layoutRuntimeFieldEditability.ts"),
            "utf8",
        );
        expect(editability).toContain("person.is_primary_contact");
        expect(editability).toContain("person.is_primary");
    });

    it("PATCH route emits household.primary_contact_changed workflow event", () => {
        const route = readFileSync(
            join(
                process.cwd(),
                "app/api/admin/customers/[id]/household-primary-contact/route.ts",
            ),
            "utf8",
        );
        expect(route).toContain("emitHouseholdPrimaryContactChangedEvent");
        expect(route).toContain("previous_primary_person_id");
    });
});
