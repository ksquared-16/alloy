import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { opportunityDrawerComposedRevealReady } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient", () => ({
    fetchOpportunityDrawerViewModelClient: vi.fn(),
}));

import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";

import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";

function settledVm() {
    return minimalSettledOpportunityDrawerViewModel({
        generation: "gen-1",
        actions: { header: [] },
        header: {
            title: "Opp",
            subtitle: null,
            status: { renderAs: "readonly_pill", label: "New" },
            oper_trust_preview: null,
        },
    });
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
            expect(result.compose_ms).toBe(40);
            expect(opportunityDrawerComposedRevealReady(result.preload)).toBe(true);
        }
    });
});
