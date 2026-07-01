import { describe, expect, it } from "vitest";
import { buildChildEnrollmentStatusControlVm } from "@/lib/adminV2/viewModel/drawer/opportunity/buildChildEnrollmentStatusControlVm";

describe("buildChildEnrollmentStatusControlVm", () => {
    const statusDefs = [
        {
            id: "1",
            org_id: "org",
            industry_key: null,
            entity_type: "opportunity_customer_members",
            status_key: "waitlisted",
            status_label: "Waitlisted",
            sort_order: 1,
            is_active: true,
            is_system: false,
            metadata: { enrollment_operator_stage: "waitlist" },
        },
        {
            id: "2",
            org_id: "org",
            industry_key: null,
            entity_type: "opportunity_customer_members",
            status_key: "enrolling",
            status_label: "Enrolling",
            sort_order: 2,
            is_active: true,
            is_system: false,
            metadata: { enrollment_operator_stage: "enrolling" },
        },
        {
            id: "3",
            org_id: "org",
            industry_key: null,
            entity_type: "opportunity_customer_members",
            status_key: "enrolled",
            status_label: "Enrolled",
            sort_order: 3,
            is_active: true,
            is_system: false,
            metadata: { enrollment_operator_stage: "enrolled" },
        },
    ];

    const configuredStages = [
        { id: "f1", key: "decision", label: "Decision", sort_order: 0, is_active: true, track_key: "family_track" },
        { id: "c1", key: "waitlist", label: "Waitlist", sort_order: 1, is_active: true, track_key: "child_track" },
        { id: "c2", key: "enrolling", label: "Enrolling", sort_order: 2, is_active: true, track_key: "child_track" },
        { id: "c3", key: "enrolled", label: "Enrolled", sort_order: 3, is_active: true, track_key: "child_track" },
    ];

    it("builds progressive menu for child-track stages only", () => {
        const vm = buildChildEnrollmentStatusControlVm({
            currentStatusKey: "waitlisted",
            statusDefs,
            configuredStages,
        });
        expect(vm.renderAs).toBe("dropdown");
        if (vm.renderAs !== "dropdown") return;
        expect(vm.progressive_menu?.some((item) => item.kind === "status" && item.status_key === "waitlisted")).toBe(
            true
        );
        expect(vm.progressive_menu?.some((item) => item.kind === "stage_heading" && item.stage_key === "enrolling")).toBe(
            true
        );
        expect(vm.progressive_menu?.some((item) => item.kind === "stage_heading" && item.stage_key === "decision")).toBe(
            false
        );
    });
});
