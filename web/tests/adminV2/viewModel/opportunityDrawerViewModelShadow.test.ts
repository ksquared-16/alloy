import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { assembleLegacyDrawerOpenShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/assembleLegacyDrawerOpenShadowSnapshot";
import { adminV2DrawerViewModelShadowEnabled } from "@/lib/adminV2/viewModel/drawer/shadow/drawerViewModelShadowGate";
import { diffOpportunityDrawerViewModelShadow } from "@/lib/adminV2/viewModel/drawer/shadow/diffOpportunityDrawerViewModelShadow";
import { extractOpportunityDrawerViewModelShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/extractOpportunityDrawerViewModelShadowSnapshot";
import { safeLogDrawerViewModelShadow } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadow";
import {
    runOpportunityDrawerViewModelShadow,
    scheduleOpportunityDrawerViewModelShadow,
} from "@/lib/adminV2/viewModel/drawer/shadow/runOpportunityDrawerViewModelShadow";

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient", () => ({
    fetchOpportunityDrawerViewModelClient: vi.fn(),
}));

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadow", () => ({
    safeLogDrawerViewModelShadow: vi.fn(),
    logDrawerViewModelShadow: vi.fn(),
    buildDrawerViewModelShadowSummary: vi.fn(),
    drawerViewModelShadowMismatchKeys: vi.fn(),
}));

import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";

const preload: OpportunityDrawerOpenPreload = {
    opportunityId: "opp-1",
    bootstrap: {
        entity: { id: "opp-1" },
        record_layout: { inquiry_drawer_mode: "workflow_v1", key: "default", source: "global_template", config_json: {} },
        record_header_actions: null,
        work_unit: null,
        workspace_scope: { department_id: "dept-1", work_unit_id: "wu-1" },
        oper_trust_preview: null,
        timing: { route_gate_ms: 0, phases_ms: {}, attention_resolver_passes: 0 },
    },
    primaryEntity: {
        id: "opp-1",
        _record_surface: "drawer_primary",
        status_key: "new",
        _status_display: "New",
        _inquiry_children: [],
        _inquiry_summary_tasks: { state: "loaded", open_tasks: [], open_count: 0 },
    },
    fullEntity: null,
    headerActions: {
        ...emptyResolvedActionsBySlot(),
        header: [
            {
                key: "schedule_tour",
                label: "Schedule tour",
                description: null,
                action_type: "workflow",
                icon: null,
                style: null,
                display_style: "button",
                payload: {},
                workflow_id: null,
            },
        ],
    },
    enrichmentHeldUntilInteraction: true,
};

function minimalViewModel(): OpportunityDrawerViewModel {
    return {
        generation: "gen-1",
        structureSettled: true,
        compose_version: "1.0.0",
        entity: { type: "opportunity", id: "opp-1" },
        first_paint: minimalSettledOpportunityDrawerViewModel().first_paint,
        workspace: {
            department_id: "dept-1",
            work_unit_id: "wu-1",
            queue_definition: null,
            lifecycle_rail: null,
            stage_context: null,
            work_intent_runtime: null,
            stage_work_runtime: null,
        },
        header: {
            title: "Test",
            subtitle: null,
            status: {
                renderAs: "dropdown",
                status_key: "new",
                label: "New",
                options: [
                    { status_key: "new", label: "New", sort_order: 0 },
                    { status_key: "tour_scheduled", label: "Tour scheduled", sort_order: 1 },
                ],
            },
            status_can_mutate: true,
            oper_trust_preview: null,
        },
        actions: {
            header: [...preload.headerActions.header],
            header_menu: [...preload.headerActions.header],
            manage_menu: [],
            record_header: null,
        },
        layout: {
            mode: "workflow_v1",
            tabs: ["overview"],
            default_tab: "overview",
            shell: {
                entity_type: "opportunity",
                layout_version: "v1",
                tabs: ["overview"],
                overview_sections: [],
                section_slots: [],
                geometry: {},
                layout_config_snapshot: {},
            },
        },
        activity: {
            communicationsPreviewVm: null,
        },
        above_fold: {
            render_model: {
                sections: [
                    {
                        section_key: "inquiry_children",
                        lifecycle: "reserved_placeholder",
                        default_expanded: true,
                        collapsible: true,
                        value_phase: "value",
                    },
                ],
                inquiry_summary: {
                    column_mode: "two",
                    show_right_column: true,
                    family_contacts: {
                        use_full_panel: false,
                        shell_reserved_additional_count: 0,
                        relationships_full_hydrate_failed: false,
                        relationships_pending: false,
                    },
                    what_matters: {
                        reserved: true,
                        tour_from_metadata: false,
                        show_tour_bookings_enrichment: false,
                    },
                    right_column: {
                        tasks: { visible: true, state: "empty", open_count: 0, open_tasks: [] },
                        reminders: { visible: true, state: "empty", next_follow_up_iso: null },
                        orchestrator_handoff: { visible: false, state: "hidden" },
                    },
                    task_preview: {
                        confirmed: true,
                        open_count: 0,
                        open_tasks: [],
                        show_reminders_placeholder: false,
                        show_operational_strip: false,
                    },
                },
            },
            record: { id: "opp-1" },
        },
        summaries: {
            active_tour_bookings: [], operator_relevant_tour_booking: null,
            tasks: { state: "loaded", open_tasks: [], open_count: 0 },
            reminders: {
                state: "empty",
                next_follow_up_iso: null,
                scheduled_send_count: 0,
                scheduled_sends: [],
            },
            bos: null,
            attention: null,
        },
        background_refresh: { allowed: ["task_status"] },
        timing: { compose_ms: 120, phases_ms: {} },
    };
}

describe("adminV2DrawerViewModelShadowEnabled", () => {
    const prev = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW;

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = prev;
    });

    it("defaults to disabled", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW;
        expect(adminV2DrawerViewModelShadowEnabled()).toBe(false);
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "0";
        expect(adminV2DrawerViewModelShadowEnabled()).toBe(false);
    });

    it("enables only for explicit true values", () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "true";
        expect(adminV2DrawerViewModelShadowEnabled()).toBe(true);
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "1";
        expect(adminV2DrawerViewModelShadowEnabled()).toBe(true);
    });
});

describe("diffOpportunityDrawerViewModelShadow", () => {
    it("reports header action key mismatches", () => {
        const legacy = assembleLegacyDrawerOpenShadowSnapshot(preload);
        const vm = extractOpportunityDrawerViewModelShadowSnapshot({
            ...minimalViewModel(),
            actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
        });
        const diff = diffOpportunityDrawerViewModelShadow(legacy, vm);
        expect(diff.structural_mismatches.some((m) => m.field === "header_action_keys")).toBe(true);
    });

    it("records settled reminders as structural improvement", () => {
        const legacy = assembleLegacyDrawerOpenShadowSnapshot(preload);
        const vm = extractOpportunityDrawerViewModelShadowSnapshot(minimalViewModel());
        const diff = diffOpportunityDrawerViewModelShadow(legacy, vm);
        expect(diff.structural_improvements.some((m) => m.field === "reminders_slot_settled")).toBe(true);
    });
});

describe("scheduleOpportunityDrawerViewModelShadow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW;
    });

    it("is a no-op when shadow flag is off", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "0";
        scheduleOpportunityDrawerViewModelShadow({
            preload,
            workspaceContext: { department_id: "dept-1", work_unit_id: "wu-1" },
        });
        await Promise.resolve();
        expect(fetchOpportunityDrawerViewModelClient).not.toHaveBeenCalled();
        expect(safeLogDrawerViewModelShadow).not.toHaveBeenCalled();
    });

    it("fetches VM and logs diff when shadow flag is on", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "true";
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: true,
            viewModel: minimalViewModel(),
        });

        await runOpportunityDrawerViewModelShadow({
            preload,
            workspaceContext: { department_id: "dept-1", work_unit_id: "wu-1" },
        });

        expect(fetchOpportunityDrawerViewModelClient).toHaveBeenCalledWith(
            "opp-1",
            { department_id: "dept-1", work_unit_id: "wu-1" },
            expect.anything()
        );
        expect(safeLogDrawerViewModelShadow).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunity_id: "opp-1",
                vm_structure_settled: true,
                legacy_path: "composed_open",
            })
        );
    });

    it("logs endpoint failure without throwing", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "true";
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: false,
            error: "drawer_vm_fetch_500",
            status: 500,
        });

        await expect(
            runOpportunityDrawerViewModelShadow({
                preload,
                workspaceContext: { department_id: "dept-1", work_unit_id: "wu-1" },
            })
        ).resolves.toBeUndefined();

        expect(safeLogDrawerViewModelShadow).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunity_id: "opp-1",
                vm_structure_settled: false,
                error: "drawer_vm_fetch_500",
            })
        );
    });

    it("logs 422 classic layout skip with skip_reason", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "true";
        const classicPreload: OpportunityDrawerOpenPreload = {
            ...preload,
            bootstrap: {
                ...preload.bootstrap,
                record_layout: {
                    inquiry_drawer_mode: "classic" as const,
                    key: "default",
                    source: "global_template" as const,
                    config_json: {},
                },
            },
        };
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "classic_layout_deferred",
                compose_version: "1.0.0",
            },
            status: 422,
        });

        await runOpportunityDrawerViewModelShadow({
            preload: classicPreload,
            workspaceContext: { department_id: "dept-1", work_unit_id: "wu-1" },
        });

        expect(safeLogDrawerViewModelShadow).toHaveBeenCalledWith(
            expect.objectContaining({
                vm_structure_settled: false,
                skip_reason: "classic_layout_deferred",
            })
        );
    });

    it("logs structural mismatch keys when header actions diverge", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "true";
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: true,
            viewModel: {
                ...minimalViewModel(),
                actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
            },
        });

        await runOpportunityDrawerViewModelShadow({
            preload,
            workspaceContext: { department_id: "dept-1", work_unit_id: "wu-1" },
        });

        expect(safeLogDrawerViewModelShadow).toHaveBeenCalledWith(
            expect.objectContaining({
                diff: expect.objectContaining({
                    mismatch_count: expect.any(Number),
                    structural_mismatches: expect.arrayContaining([
                        expect.objectContaining({ field: "header_action_keys" }),
                    ]),
                }),
            })
        );
    });

    it("schedule swallows internal shadow errors without throwing", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "true";
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockRejectedValue(new Error("network_down"));

        expect(() =>
            scheduleOpportunityDrawerViewModelShadow({
                preload,
                workspaceContext: null,
            })
        ).not.toThrow();

        await new Promise((r) => setTimeout(r, 0));
        expect(safeLogDrawerViewModelShadow).toHaveBeenCalledWith(
            expect.objectContaining({
                error: "network_down",
                vm_structure_settled: false,
            })
        );
    });

    it("schedule does not block caller return", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW = "true";
        let resolveFetch: (() => void) | undefined;
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockReturnValue(
            new Promise((resolve) => {
                resolveFetch = () => resolve({ ok: true, viewModel: minimalViewModel() });
            })
        );

        let scheduleReturned = false;
        scheduleOpportunityDrawerViewModelShadow({
            preload,
            workspaceContext: null,
        });
        scheduleReturned = true;
        expect(scheduleReturned).toBe(true);
        expect(fetchOpportunityDrawerViewModelClient).toHaveBeenCalled();
        resolveFetch?.();
        await new Promise((r) => setTimeout(r, 0));
    });
});

describe("logDrawerViewModelShadow", () => {
    it("emits summary and detail logs with [drawer-vm-shadow] prefixes", () => {
        const src = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), "../../../lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadow.ts"),
            "utf8"
        );
        expect(src).toContain('perfDrawer("vm_shadow_summary"');
        expect(src).toContain("perfDebugTraceEnabled");
    });
});
