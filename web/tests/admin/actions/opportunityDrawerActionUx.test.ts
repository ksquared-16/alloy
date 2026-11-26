import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    dispatchOpportunityDrawerOperationalTasksRefresh,
    isTourSurfaceActionKey,
} from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { resolveOpportunityRegistryActionSuccessMessage } from "@/lib/admin/actions/resolveOpportunityRegistryActionFeedbackMessage";
import { patchOpportunityDrawerVmDisplayRecord } from "@/lib/adminV2/viewModel/drawer/vmRuntime/patchOpportunityDrawerVmDisplayRecord";
import { patchOpportunityDrawerRecordAfterTourBooking } from "@/lib/admin/opportunityDrawerTourBookingRefresh";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("opportunity drawer action UX hardening", () => {

    it("header controls render registry action feedback banner", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain("OpportunityDrawerRegistryActionFeedbackBanner");
        expect(controls).toContain("registryActionFeedback");
    });

    it("VM header actions handle applyRegistry failures and suppress modal-open success toasts", () => {
        const hook = read("lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmHeaderActions.ts");
        expect(hook).toContain("action_preflight");
        expect(hook).toContain('action.action_type === "open_form"');
        expect(hook).toContain('actionKey === "change_lead_location"');
        expect(hook).toContain("dispatchOpportunityDrawerScopedUpdate");
    });

    it("VM registry modals patch tour record and keep feedback in modals", () => {
        const modals = read("lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx");
        expect(modals).toContain("patchOpportunityDrawerRecordAfterTourBooking");
        expect(modals).toContain("dispatchOpportunityDrawerScopedUpdate");
        expect(modals).toContain("/api/admin/tours/bookings");
        expect(modals).not.toContain("reportExecuteSuccess");
        expect(modals).not.toContain('showSuccess("Task created."');
    });

    it("action modals use inline ActionModalStatusMessage", () => {
        const createWork = read("components/admin/opportunity/OpportunityRecordCreateWorkModal.tsx");
        const scheduleTour = read("components/admin/opportunity/tours/OpportunityTourScheduleActionModal.tsx");
        const scheduleForm = read("components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx");
        expect(createWork).toContain("ActionModalStatusMessage");
        expect(createWork).toContain('setSuccessMessage("Task created.")');
        expect(scheduleTour).toContain("ActionModalStatusMessage");
        expect(scheduleForm).toContain("ActionModalStatusMessage");
    });

    it("Actions menu exposes hover/active/disabled affordances", () => {
        const menu = read("components/admin/opportunity/OpportunityDrawerHeaderActionsMenu.tsx");
        expect(menu).toContain("active:bg-alloy-blue");
        expect(menu).toContain("disabledReason");
        expect(menu).toContain("menuDisabledReason");
    });

    it("targeted refresh helpers scope operational tasks and tour surfaces", () => {
        expect(isTourSurfaceActionKey("schedule_tour")).toBe(true);
        expect(isTourSurfaceActionKey("add_note")).toBe(false);
        expect(typeof dispatchOpportunityDrawerOperationalTasksRefresh).toBe("function");
    });

    it("VM record patch updates tour metadata without full reload", () => {
        const vm = minimalSettledOpportunityDrawerViewModel();
        const prev = vm.above_fold.record;
        const next = patchOpportunityDrawerRecordAfterTourBooking(prev, {
            start_at: "2026-06-15T15:00:00.000Z",
            timezone: "America/New_York",
            status_key: "confirmed",
            booking_id: "bk-1",
            mirror_override: { tour_date: "2026-06-15", tour_time: "11:00" },
        });
        const patched = patchOpportunityDrawerVmDisplayRecord(vm, next);
        expect(patched.above_fold.record.metadata).toMatchObject({
            tour_date: "2026-06-15",
            tour_time: "11:00",
        });
        expect(patched.summaries.active_tour_bookings.length).toBeGreaterThan(0);
    });

    it("success messages are stable for common registry actions", () => {
        expect(
            resolveOpportunityRegistryActionSuccessMessage({ key: "schedule_tour", label: "Schedule tour" })
        ).toBe("Tour scheduled.");
        expect(
            resolveOpportunityRegistryActionSuccessMessage(
                { key: "workflow_action", label: "Run workflow" },
                { kind: "start_workflow", workflow_run_id: "run-abcdef12" }
            )
        ).toContain("Workflow run completed");
    });
});
