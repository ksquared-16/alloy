import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    CHANGE_LEAD_LOCATION_ACTION_KEY,
    listInheritingInquiryChildren,
    resolveInquiryChildOcmId,
} from "@/lib/admin/actions/changeLeadLocationContract";
import { resolveChangeLeadLocationActionFromResolvedAction } from "@/lib/admin/actions/changeLeadLocationActionClient";
import { buildOpportunityDrawerHeaderMenuActions } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ApplyRegistryResolvedActionHost } from "@/lib/admin/actions/applyRegistryResolvedActionClient";

vi.mock("@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit", () => ({
    syncOpportunityLocationDisplayLabel: vi.fn((record, locationId, locationLabel) => ({
        ...record,
        location_id: locationId,
        _location_label: locationLabel,
    })),
}));

vi.mock("@/lib/admin/drawer/inquiryChildFieldEdit", () => ({
    patchOpportunityCustomerMemberFromInquiryChild: vi.fn().mockResolvedValue(undefined),
    patchChildParticipation: vi.fn().mockResolvedValue(undefined),
}));

import { submitChangeLeadLocation } from "@/lib/admin/actions/submitChangeLeadLocation";
import {
    patchChildParticipation,
    patchOpportunityCustomerMemberFromInquiryChild,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";

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
            focusRecord: vi.fn(),
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

    it("patches lead location via dedicated route and optional inheriting children", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, location_id: "site-north" }),
        });
        const result = await submitChangeLeadLocation({
            opportunityId: "opp-1",
            locationId: "site-north",
            locationLabel: "North",
            applyToInheritingChildren: true,
            inquiryChildren: [
                { id: "ocm-south", customer_member_id: "cm-south", location_id: "site-south" },
                { id: "ocm-inherit", customer_member_id: "cm-inherit", location_id: null },
            ],
            record: { id: "opp-1", location_id: "site-old" },
            fetchFn,
        });
        expect(result.ok).toBe(true);
        expect(result.updatedChildCount).toBe(1);
        expect(fetchFn).toHaveBeenCalledWith(
            "/api/admin/opportunities/opp-1/lead-location",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ location_id: "site-north" }),
            }),
        );
        expect(patchChildParticipation).toHaveBeenCalledWith({
            customerMemberId: "cm-inherit",
            opportunityId: "opp-1",
            patch: { location_id: "site-north" },
            fetchFn,
        });
        expect(patchOpportunityCustomerMemberFromInquiryChild).not.toHaveBeenCalled();
    });

    it("does not PATCH unlinked synthetic child ids as opportunity_customer_members", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, location_id: "site-north" }),
        });
        expect(resolveInquiryChildOcmId({ id: "unlinked:cm-1", ocm_id: null })).toBeNull();

        const result = await submitChangeLeadLocation({
            opportunityId: "opp-1",
            locationId: "site-north",
            locationLabel: "North",
            applyToInheritingChildren: true,
            inquiryChildren: [
                {
                    id: "unlinked:cm-ember",
                    customer_member_id: "cm-ember",
                    ocm_id: null,
                    location_id: null,
                },
            ],
            fetchFn,
        });
        expect(result.ok).toBe(true);
        expect(result.updatedChildCount).toBe(1);
        expect(patchChildParticipation).toHaveBeenCalledWith({
            customerMemberId: "cm-ember",
            opportunityId: "opp-1",
            patch: { location_id: "site-north" },
            fetchFn,
        });
        expect(patchOpportunityCustomerMemberFromInquiryChild).not.toHaveBeenCalled();
    });

    it("falls back to OCM PATCH when customer_member_id is absent", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, location_id: "site-north" }),
        });
        const result = await submitChangeLeadLocation({
            opportunityId: "opp-1",
            locationId: "site-north",
            locationLabel: "North",
            applyToInheritingChildren: true,
            inquiryChildren: [{ id: "ocm-inherit", location_id: null }],
            fetchFn,
        });
        expect(result.ok).toBe(true);
        expect(result.updatedChildCount).toBe(1);
        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledWith("ocm-inherit", {
            location_id: "site-north",
        });
        expect(patchChildParticipation).not.toHaveBeenCalled();
    });

    it("surfaces lead-location API errors without drawer field-policy wording", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ error: "Location not found" }),
        });
        await expect(
            submitChangeLeadLocation({
                opportunityId: "opp-1",
                locationId: "missing-site",
                locationLabel: "Missing",
                applyToInheritingChildren: false,
                inquiryChildren: [],
                fetchFn,
            }),
        ).rejects.toThrow("Location not found");
    });
});
