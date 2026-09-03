import { describe, expect, it } from "vitest";

import {
    buildOpportunityFirstViewportPlan,
    OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES,
    resolveTourSlotDisplaySource,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstViewportContract";
import {
    buildOpportunityDrawerFirstPaintContract,
    opportunityDrawerFirstPaintContractValid,
    opportunityDrawerViewModelFirstPaintSettled,
    statusDefsFromViewModelStatusControl,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint";
import { tourBookingsFromOpportunityDrawerVm } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstPaintClient";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";

describe("opportunityDrawerViewModelFirstViewport", () => {
    it("declares settled first_paint with viewport slots and dependencies", () => {
        const vm = minimalSettledOpportunityDrawerViewModel();
        expect(opportunityDrawerViewModelFirstPaintSettled(vm)).toBe(true);
        expect(opportunityDrawerFirstPaintContractValid(vm)).toBe(true);
        expect(vm.first_paint.viewport_slots).toContain("lead_summary");
        expect(vm.first_paint.viewport_slots).toContain("tasks_summary");
        expect(vm.first_paint.dependencies.some((d) => d.key === "tour_bookings")).toBe(true);
    });

    it("includes queue_definition and tour bookings in dependency data", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                department_id: "dept-1",
                work_unit_id: "wu-1",
                queue_definition: {
                    version: 1,
                    buckets: [{ key: "new", label: "New", status_keys: ["new"] }],
                } as never,
                lifecycle_rail: null,
                stage_context: null,
                work_intent_runtime: null,
                stage_work_runtime: null,
            },
            first_paint: {
                settled: true,
                viewport_slots: [
                    "header",
                    "status",
                    "location",
                    "actions",
                    "tabs",
                    "lifecycle_rail",
                    "lead_summary",
                    "tour_slot",
                    "tasks_summary",
                    "reminders_summary",
                ],
                dependencies: [
                    {
                        key: "tour_bookings",
                        disposition: "first_paint_required",
                        status: "ready",
                        satisfied_by: "server_fetch",
                    },
                    {
                        key: "queue_definition",
                        disposition: "first_paint_required",
                        status: "ready",
                        satisfied_by: "record_metadata",
                    },
                ],
                data: {
                    tour_bookings: [
                        {
                            id: "tb-1",
                            org_id: "org-1",
                            opportunity_id: "opp-1",
                            status_key: "scheduled",
                            start_at: "2026-06-05T15:00:00.000Z",
                        },
                    ],
                },
                deferred: [],
                background: [],
            },
        });
        expect(tourBookingsFromOpportunityDrawerVm(vm)).toHaveLength(1);
        expect(vm.workspace.queue_definition).not.toBeNull();
    });

    it("maps preload with queue_definition and paint record task/reminder seeds", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            summaries: {
                active_tour_bookings: [],
                operator_relevant_tour_booking: null,
                tasks: {
                    state: "loaded",
                    open_count: 1,
                    open_tasks: [
                        {
                            id: "task-1",
                            title: "Call family",
                            due_at: "2026-06-04T12:00:00.000Z",
                            status: "open",
                            source: "task_assist",
                        },
                    ],
                },
                reminders: {
                    state: "ready",
                    next_follow_up_iso: "2026-06-06T09:00:00.000Z",
                    scheduled_send_count: 1,
                    scheduled_sends: [
                        {
                            id: "send-1",
                            scheduled_for: "2026-06-06T09:00:00.000Z",
                            status: "pending",
                            channel: "sms",
                        },
                    ],
                },
                bos: null,
                attention: null,
            },
        });
        const preload = buildOpportunityDrawerOpenPreloadFromViewModel(vm);
        expect(preload.bootstrap.work_unit?.queue_definition).toBe(vm.workspace.queue_definition);
        expect(preload.primaryEntity._inquiry_summary_tasks).toEqual(vm.summaries.tasks);
        expect(preload.primaryEntity.next_follow_up_at).toBe("2026-06-06T09:00:00.000Z");
        expect(preload.primaryEntity._inquiry_summary_scheduled_sends).toHaveLength(1);
    });

    it("resolves tour slot display source from dependency data", () => {
        expect(
            resolveTourSlotDisplaySource({ metadata: { tour_date: "2026-06-05" } }, [{ id: "b1" } as never])
        ).toBe("bookings");
        expect(resolveTourSlotDisplaySource({ metadata: { tour_date: "2026-06-05" } }, [])).toBe("metadata");
    });

    it("maps status dropdown options from VM header.status", () => {
        const defs = statusDefsFromViewModelStatusControl({
            renderAs: "dropdown",
            status_key: "new",
            label: "New",
            options: [
                { status_key: "new", label: "New", sort_order: 0 },
                { status_key: "tour_scheduled", label: "Tour scheduled", sort_order: 1 },
            ],
        });
        expect(defs).toHaveLength(2);
        expect(defs[1]?.status_key).toBe("tour_scheduled");
    });

    it("first viewport contract lists current dependencies including tour_bookings", () => {
        expect(OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES).toContain("tour_bookings");
        expect(OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES).toContain("scheduled_sends");
    });

    it("buildOpportunityFirstViewportPlan adds lifecycle_rail when queue_definition present", () => {
        const shell = minimalSettledOpportunityDrawerViewModel().layout.shell;
        const plan = buildOpportunityFirstViewportPlan({
            shell,
            task_assist_enabled: true,
            queue_definition_present: true,
        });
        expect(plan.viewport_slots).toContain("lifecycle_rail");
        expect(plan.dependencies).toContain("queue_definition");
    });

    it("buildOpportunityDrawerFirstPaintContract marks settled when dependencies ready", () => {
        const contract = buildOpportunityDrawerFirstPaintContract({
            viewport_slots: ["header", "tour_slot"],
            dependencies: [
                {
                    key: "tour_bookings",
                    disposition: "first_paint_required",
                    status: "empty",
                    satisfied_by: "server_fetch",
                },
            ],
            data: { tour_bookings: [] },
        });
        expect(contract.settled).toBe(true);
    });
});
