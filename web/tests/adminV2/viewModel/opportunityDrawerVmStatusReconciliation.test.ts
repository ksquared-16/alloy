import { describe, expect, it, vi } from "vitest";

import {
    detectOpportunityStatusDoubleCommit,
    logDrawerVmStatusDiagnostic,
    opportunityDrawerVmStatusAuthoritative,
    opportunityDrawerVmStatusContractComplete,
    pinOpportunityDrawerVmStatusFromViewModel,
    reconcileStatusDefsWithVmPin,
    shouldBlockNonVmStatusWrite,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmStatusReconciliation";

describe("opportunityDrawerVmStatusReconciliation", () => {
    it("pins dropdown status defs from VM header.status", () => {
        const pin = pinOpportunityDrawerVmStatusFromViewModel("opp-1", {
            renderAs: "dropdown",
            status_key: "new",
            label: "New",
            options: [
                { status_key: "new", label: "New", sort_order: 0 },
                { status_key: "contacted", label: "Contacted", sort_order: 1 },
            ],
        });
        expect(pin).not.toBeNull();
        expect(pin!.statusKey).toBe("new");
        expect(pin!.statusDefs).toHaveLength(2);
        expect(opportunityDrawerVmStatusContractComplete(pin)).toBe(true);
    });

    it("blocks non-VM status writes under hard cutover when pin is active", () => {
        const pin = pinOpportunityDrawerVmStatusFromViewModel("opp-1", {
            renderAs: "dropdown",
            status_key: "new",
            label: "New",
            options: [{ status_key: "new", label: "New", sort_order: 0 }],
        });
        expect(
            shouldBlockNonVmStatusWrite({
                hardCutover: true,
                pin,
                opportunityId: "opp-1",
            })
        ).toBe(true);
        expect(
            shouldBlockNonVmStatusWrite({
                hardCutover: true,
                pin,
                opportunityId: "opp-2",
            })
        ).toBe(false);
    });

    it("rejects single-option seed and empty incoming defs when VM pin exists", () => {
        const pin = pinOpportunityDrawerVmStatusFromViewModel("opp-1", {
            renderAs: "dropdown",
            status_key: "new",
            label: "New",
            options: [
                { status_key: "new", label: "New", sort_order: 0 },
                { status_key: "contacted", label: "Contacted", sort_order: 1 },
            ],
        })!;

        const emptyBlocked = reconcileStatusDefsWithVmPin(pin, [], "status_options_api");
        expect(emptyBlocked.blocked).toBe(true);
        expect(emptyBlocked.defs).toHaveLength(2);

        const singleSeedBlocked = reconcileStatusDefsWithVmPin(
            pin,
            [{ status_key: "new", status_label: "New", sort_order: 0, is_active: true }],
            "bootstrap_seed"
        );
        expect(singleSeedBlocked.blocked).toBe(true);
        expect(singleSeedBlocked.defs).toHaveLength(2);
    });

    it("logs double commit when mounted control returns to skeleton", () => {
        vi.stubEnv("ADMIN_PERF_TRACE", "1");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        detectOpportunityStatusDoubleCommit({
            opportunityId: "opp-1",
            vmContractComplete: true,
            hadMountedControl: true,
            showingSkeleton: true,
            statusKey: "new",
        });
        expect(warn).toHaveBeenCalledWith(
            "[perf:drawer]",
            expect.objectContaining({ entity_id: "opp-1", phase: "status_vm" })
        );
        warn.mockRestore();
        vi.unstubAllEnvs();
    });

    it("emits vm_seed diagnostic tag", () => {
        vi.stubEnv("ADMIN_PERF_TRACE", "1");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        logDrawerVmStatusDiagnostic("vm_seed", { opportunity_id: "opp-1" });
        expect(warn).toHaveBeenCalledWith(
            "[perf:drawer]",
            expect.objectContaining({ entity_id: "opp-1" })
        );
        warn.mockRestore();
        vi.unstubAllEnvs();
    });

    it("treats VM status as authoritative when first paint settled or pin complete", () => {
        const pin = pinOpportunityDrawerVmStatusFromViewModel("opp-1", {
            renderAs: "dropdown",
            status_key: "new",
            label: "New",
            options: [{ status_key: "new", label: "New", sort_order: 0 }],
        });
        expect(
            opportunityDrawerVmStatusAuthoritative({
                hardCutover: true,
                pin,
                opportunityId: "opp-1",
                vmFirstPaintSettled: true,
                vmOpenRefMatches: false,
            })
        ).toBe(true);
        expect(
            opportunityDrawerVmStatusAuthoritative({
                hardCutover: true,
                pin,
                opportunityId: "opp-1",
                vmFirstPaintSettled: false,
                vmOpenRefMatches: true,
            })
        ).toBe(true);
        expect(
            opportunityDrawerVmStatusAuthoritative({
                hardCutover: false,
                pin,
                opportunityId: "opp-1",
                vmFirstPaintSettled: true,
                vmOpenRefMatches: true,
            })
        ).toBe(false);
    });
});
