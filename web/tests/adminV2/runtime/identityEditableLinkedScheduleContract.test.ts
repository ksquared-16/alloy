/**
 * Identity Editable / Linked / compact-schedule contract — Surface Builder → runtime.
 */

import { describe, expect, it, vi } from "vitest";
import {
    navigateIdentityFieldLink,
    resolveIdentityFieldLinkContract,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import { identityFieldVisibilityOptionsForBuilder } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldEditContract";
import {
    buildIdentityInlineChildSavePatch,
    isIdentityFieldInlineSaveSupported,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityInlineChildSave";
import { projectCompactScheduleForIdentity } from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import { createEmptyFocusPanelCardLinkNavState } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinkNavigation";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";

describe("identity Editable / Linked / schedule compact", () => {
    it("offers Linked (not Editable) for enrollment schedule fields in Builder", () => {
        expect(identityFieldVisibilityOptionsForBuilder("inquiry_child.schedule_type")).toEqual([
            "linked",
            "read-only",
            "hidden",
        ]);
        expect(identityFieldVisibilityOptionsForBuilder("child.date_of_birth")).toEqual([
            "editable",
            "read-only",
            "hidden",
        ]);
        expect(resolveIdentityFieldLinkContract("child.schedule").canOfferLinked).toBe(true);
        expect(resolveIdentityFieldLinkContract("child.schedule").destinationCard).toBe("scheduling");
    });

    it("builds a real DOB identity patch for inline Editable save", () => {
        expect(isIdentityFieldInlineSaveSupported("child.date_of_birth")).toBe(true);
        const row = {
            id: "child-1",
            customer_member_id: "cm-1",
            person_id: "p-1",
            display_name: "Blake",
            first_name: "Blake",
            last_name: "Wenc",
            dob: "2022-01-15",
        } as InquiryChildRow;
        const patch = buildIdentityInlineChildSavePatch({
            fieldRef: "child.date_of_birth",
            value: "2021-06-01",
            row,
            identityBaseline: { first_name: "Blake", last_name: "Wenc", dob: "2022-01-15" },
        });
        expect(patch?.identityPatch.dob).toBe("2021-06-01");
    });

    it("navigates Linked fields through Card Link history to Scheduling", () => {
        const requestFocus = vi.fn();
        const coordination = {
            focusTargets: new Set(["children", "scheduling"]),
            requestFocus,
            request: null,
        } as unknown as FocusPanelCoordination;
        const result = navigateIdentityFieldLink({
            coordination,
            fromCard: "children",
            fieldRef: "inquiry_child.schedule_type",
            destinationFocus: "child-1",
            sourceFocus: "child-1",
            nav: createEmptyFocusPanelCardLinkNavState(),
        });
        expect(result.ok).toBe(true);
        expect(result.nav.activeCard).toBe("scheduling");
        expect(requestFocus).toHaveBeenCalledWith(
            "scheduling",
            "child-1",
            { card: "children", focus: "child-1" },
        );
    });

    it("projects compact schedule with Room · Monday–Friday · from date (shared projector)", () => {
        const scheduling = {
            status: "scheduled",
            child: { siteName: "North Campus" },
            current: {
                scheduleType: "full_day",
                scheduleTypeLabel: "Full Day",
                effectiveFrom: "2026-08-01",
                effectiveTo: null,
                openEnded: true,
                assignments: [
                    {
                        room: { name: "Preschool A" },
                        weekdays: [1, 2, 3, 4, 5],
                        arriveTime: "08:00",
                        departTime: "17:00",
                    },
                ],
            },
            proposed: null,
        } as unknown as ChildScheduling;
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.roomLabel).toBe("Preschool A");
        expect(compact.daysLabel).toBe("Monday–Friday");
        expect(compact.hoursLabel).toMatch(/8:00/);
        expect(compact.compactLine).toBe("Preschool A · Monday–Friday · from Aug 1, 2026");
        expect(compact.scheduleLabel).toBe(compact.compactLine);
        expect(compact.compactLine).not.toContain("open-ended");
        expect(compact.compactLine).not.toContain("Full Day");
    });
});
