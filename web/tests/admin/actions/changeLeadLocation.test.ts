import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    CHANGE_LEAD_LOCATION_ACTION_KEY,
    listInheritingInquiryChildren,
} from "@/lib/admin/actions/changeLeadLocationContract";
import { resolveChangeLeadLocationActionFromResolvedAction } from "@/lib/admin/actions/changeLeadLocationActionClient";
import { buildOpportunityDrawerHeaderMenuActions } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ApplyRegistryResolvedActionHost } from "@/lib/admin/actions/applyRegistryResolvedActionClient";

vi.mock("@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit", () => ({
    patchOpportunityNativeFromLayoutDrawer: vi.fn().mockResolvedValue({ ok: true }),
    syncOpportunityLocationDisplayLabel: vi.fn((record, locationId, locationLabel) => ({
        ...record,
        location_id: locationId,
        _location_label: locationLabel,
    })),
}));

vi.mock("@/lib/admin/drawer/inquiryChildFieldEdit", () => ({
    patchOpportunityCustomerMemberFromInquiryChild: vi.fn().mockResolvedValue(undefined),
}));

import { submitChangeLeadLocation } from "@/lib/admin/actions/submitChangeLeadLocation";
import { patchOpportunityNativeFromLayoutDrawer } from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { patchOpportunityCustomerMemberFromInquiryChild } from "@/lib/admin/drawer/inquiryChildFieldEdit";

describe("change_lead_location", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("lists only children without owned location_id as inheriting", () => {
        const inheriting = listInheritingInquiryChildren([
            { id: "a", location_id: "site-south" },
            { id: "b", location_id: null },
            { id: "c", location_id: "  " },
        ]);
        expect(inheriting.map((r) => r.id)).toEqual(["b", "c"]);
    });

    it("ensures Manage menu always includes Change lead location", () => {
        const menu = buildOpportunityDrawerHeaderMenuActions(emptyResolvedActionsBySlot(), false);
        expect(menu.some((a) => a.key === CHANGE_LEAD_LOCATION_ACTION_KEY)).toBe(true);
    });

    it("does not duplicate when already placed", () => {
        const slots = emptyResolvedActionsBySlot();
        slots.secondary = [
            {
                key: CHANGE_LEAD_LOCATION_ACTION_KEY,
                label: "Change lead location",
                description: null,
                action_type: "ui_intent",
                icon: null,
                style: null,
                display_style: "outline",
                payload: {},
                workflow_id: null,
            },
        ];
        const menu = buildOpportunityDrawerHeaderMenuActions(slots, false);
        expect(menu.filter((a) => a.key === CHANGE_LEAD_LOCATION_ACTION_KEY)).toHaveLength(1);
    });

    it("opens host modal from Manage click", async () => {
        const openChangeLeadLocation = vi.fn();
        const host = {
            router: { push: vi.fn(), refresh: vi.fn() },
            openDrawer: vi.fn(),
            openChangeLeadLocation,
            entityId: "opp-1",
            context: { surface: "record_header" },
        } as unknown as ApplyRegistryResolvedActionHost;

        const result = await applyRegistryResolvedActionClient(
            {
                key: CHANGE_LEAD_LOCATION_ACTION_KEY,
                label: "Change lead location",
                description: null,
                action_type: "ui_intent",
                icon: null,
                style: null,
                display_style: "outline",
                payload: { form_key: "change_lead_location" },
                workflow_id: null,
            },
            host,
        );
        expect(result.ok).toBe(true);
        expect(openChangeLeadLocation).toHaveBeenCalledWith({ opportunityId: "opp-1" });
        expect(resolveChangeLeadLocationActionFromResolvedAction({
            key: CHANGE_LEAD_LOCATION_ACTION_KEY,
            label: "Change lead location",
            description: null,
            action_type: "ui_intent",
            icon: null,
            style: null,
            display_style: "outline",
            payload: {},
            workflow_id: null,
        })).toBe(true);
    });

    it("patches lead location and optional inheriting children", async () => {
        const result = await submitChangeLeadLocation({
            opportunityId: "opp-1",
            locationId: "site-north",
            locationLabel: "North",
            applyToInheritingChildren: true,
            inquiryChildren: [
                { id: "ocm-south", location_id: "site-south" },
                { id: "ocm-inherit", location_id: null },
            ],
            record: { id: "opp-1", location_id: "site-old" },
        });
        expect(result.ok).toBe(true);
        expect(result.updatedChildCount).toBe(1);
        expect(patchOpportunityNativeFromLayoutDrawer).toHaveBeenCalledWith({
            opportunityId: "opp-1",
            body: { location_id: "site-north" },
        });
        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledWith("ocm-inherit", {
            location_id: "site-north",
        });
        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledTimes(1);
    });
});
