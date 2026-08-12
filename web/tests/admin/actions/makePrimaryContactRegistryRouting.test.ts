import { describe, expect, it, vi } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import {
    enrichResolvedActionsWithCanonical,
    resolveLayoutBuilderAvailableActions,
} from "@/lib/admin/actions/canonicalActionAvailability";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import {
    MAKE_PRIMARY_CONTACT_BUILDER_UNAVAILABLE_MESSAGE,
    MAKE_PRIMARY_CONTACT_REQUIRES_CONTACT_TARGET_MESSAGE,
    stripMakePrimaryContactFromResolvedActionsBySlot,
} from "@/lib/admin/actions/makePrimaryContactAction";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    resolveMakePrimaryContactActionContext,
    shouldShowMakePrimaryContactAction,
} from "@/lib/layout/runtime/layoutRuntimeMakePrimaryContactAction";
import { HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE } from "@/lib/admin/person/householdPrimaryContact";

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
        { person_id: "person-kelly", role_type: "primary_contact", name: "Kelly Mitchell" },
        { person_id: "person-kevin", role_type: "guardian", name: "Kevin Mitchell" },
    ],
};

function makePrimaryContactAction(): ResolvedActionForClient {
    return {
        key: "make_primary_contact",
        label: "Make Primary Contact",
        description: null,
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };
}

describe("make_primary_contact registry routing (Option A)", () => {
    it("layout contact row still resolves context for non-primary contact", () => {
        const ctx = resolveMakePrimaryContactActionContext({
            anchorRecord: baseOpportunityRecord,
            rowRecord: { person_id: "person-kevin", "person.display_name": "Kevin Mitchell" },
        });
        expect(shouldShowMakePrimaryContactAction({ context: ctx, canMutate: true })).toBe(true);
    });

    it("layout primary row hides action", () => {
        const ctx = resolveMakePrimaryContactActionContext({
            anchorRecord: baseOpportunityRecord,
            rowRecord: { person_id: "person-kelly", "person.display_name": "Kelly Mitchell" },
        });
        expect(shouldShowMakePrimaryContactAction({ context: ctx, canMutate: true })).toBe(false);
    });

    it("strips make_primary_contact from generic registry surfaces", () => {
        const actions = {
            primary: [makePrimaryContactAction()],
            secondary: [],
            overflow: [],
            header: [],
            right_rail: [makePrimaryContactAction()],
            row_inline: [],
        };
        const header = stripMakePrimaryContactFromResolvedActionsBySlot(actions, "record_header");
        expect(header.primary).toHaveLength(0);
        expect(header.right_rail).toHaveLength(0);

        const rail = stripMakePrimaryContactFromResolvedActionsBySlot(actions, "right_rail");
        expect(rail.right_rail).toHaveLength(0);
    });

    it("enrichResolvedActionsWithCanonical hides header placement", () => {
        const rows = enrichResolvedActionsWithCanonical({
            resolvedKeys: ["make_primary_contact"],
            placement: "drawer_header_actions",
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.available).toBe(false);
        expect(rows[0]?.unavailableMessage).toBe(MAKE_PRIMARY_CONTACT_BUILDER_UNAVAILABLE_MESSAGE);
    });

    it("builder allows contact_block context only", () => {
        const contactBlock = resolveLayoutBuilderAvailableActions({
            surfaceKey: "opportunity_drawer",
            context: "contact_block",
        });
        expect(
            contactBlock.some((row) => row.actionKey === "make_primary_contact" && row.available),
        ).toBe(true);

        const sectionRow = resolveLayoutBuilderAvailableActions({
            surfaceKey: "opportunity_drawer",
            context: "section_row",
        });
        expect(sectionRow.some((row) => row.actionKey === "make_primary_contact")).toBe(false);
    });

    it("canonical definition excludes generic placements", () => {
        const def = canonicalActionDefinition("make_primary_contact");
        expect(def?.allowedPlacements).toEqual([
            "drawer_contact_block",
            "drawer_related_list_row",
            "drawer_repeater_row",
        ]);
        expect(def?.allowedPlacements).not.toContain("drawer_header_actions");
        expect(def?.allowedPlacements).not.toContain("bos_rail");
    });

    it("applyRegistryResolvedActionClient rejects without contact target", async () => {
        const openMakePrimaryContact = vi.fn();
        const out = await applyRegistryResolvedActionClient(makePrimaryContactAction(), {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openMakePrimaryContact,
            entityId: "opp-1",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(false);
        if (!out.ok) {
            expect(out.error).toBe(MAKE_PRIMARY_CONTACT_REQUIRES_CONTACT_TARGET_MESSAGE);
        }
        expect(openMakePrimaryContact).not.toHaveBeenCalled();
    });

    it("applyRegistryResolvedActionClient routes when target person is supplied", async () => {
        const openMakePrimaryContact = vi.fn();
        const out = await applyRegistryResolvedActionClient(makePrimaryContactAction(), {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openMakePrimaryContact,
            entityId: "opp-1",
            makePrimaryContactTargetPersonId: "person-kevin",
            context: { surface: "record_header" },
        });
        expect(out.ok).toBe(true);
        expect(openMakePrimaryContact).toHaveBeenCalledWith({
            opportunityId: "opp-1",
            targetPersonId: "person-kevin",
        });
    });
});
