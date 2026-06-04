import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { opportunityDrawerComposedRevealReady } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient", () => ({
    fetchOpportunityDrawerViewModelClient: vi.fn(),
}));

import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";

function settledVm(): OpportunityDrawerViewModel {
    return {
        generation: "gen-1",
        structureSettled: true,
        compose_version: "1.0.0",
        entity: { type: "opportunity", id: "opp-1" },
        workspace: { department_id: "dept-1", work_unit_id: "wu-1" },
        header: {
            title: "Opp",
            subtitle: null,
            status: { renderAs: "readonly_pill", label: "New" },
            oper_trust_preview: null,
        },
        actions: { header: [] },
        layout: {
            mode: "workflow_v1",
            tabs: ["overview"],
            default_tab: "overview",
            shell: {
                entity_type: "opportunity",
                layout_version: "default",
                tabs: ["overview"],
                overview_sections: [],
                section_slots: [],
                geometry: {},
                layout_config_snapshot: { inquiry_drawer_mode: "workflow_v1", overview_section_order: [] },
            },
        },
        above_fold: {
            render_model: {
                sections: [
                    {
                        section_key: "inquiry_summary",
                        lifecycle: "immediate",
                        default_expanded: true,
                        collapsible: false,
                        value_phase: "value",
                    },
                ],
            },
            record: {
                id: "opp-1",
                status_key: "new",
                _identity: {
                    household: { label: "Test Household" },
                    primary_person: { label: "Parent" },
                    primary_contact: { label: "Parent" },
                },
                _inquiry_children: [],
            },
        },
        summaries: {
            tasks: { state: "loaded", open_count: 0, open_tasks: [] },
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        background_refresh: { allowed: [] },
        timing: { compose_ms: 22, phases_ms: {} },
    };
}

describe("loadOpportunityDrawerViaViewModel", () => {
    const prevVm = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;

    beforeEach(() => {
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockReset();
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = prevVm;
    });

    it("returns cutover_disabled when flag off", async () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
        const result = await loadOpportunityDrawerViaViewModel("opp-1", null);
        expect(result).toEqual({ ok: false, reason: "cutover_disabled" });
        expect(fetchOpportunityDrawerViewModelClient).not.toHaveBeenCalled();
    });

    it("returns skipped on classic 422", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "true";
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: false,
            skipped: {
                structureSettled: false,
                reason: "classic_layout_deferred",
                compose_version: "1.0.0",
            },
            status: 422,
        });
        const result = await loadOpportunityDrawerViaViewModel("opp-1", null);
        expect(result).toEqual({ ok: false, reason: "skipped", skip_reason: "classic_layout_deferred" });
    });

    it("returns fetch_failed on network error status", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "true";
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({
            ok: false,
            error: "drawer_vm_fetch_500",
            status: 500,
        });
        const result = await loadOpportunityDrawerViaViewModel("opp-1", null);
        expect(result).toEqual({ ok: false, reason: "fetch_failed" });
    });

    it("returns settled preload when VM succeeds", async () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "true";
        const vm = settledVm();
        vi.mocked(fetchOpportunityDrawerViewModelClient).mockResolvedValue({ ok: true, viewModel: vm });
        const result = await loadOpportunityDrawerViaViewModel("opp-1", {
            department_id: "dept-1",
            work_unit_id: "wu-1",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.preload.openPath).toBe("view_model");
            expect(result.compose_ms).toBe(22);
            expect(opportunityDrawerComposedRevealReady(result.preload)).toBe(true);
        }
    });
});
