import { describe, expect, it, vi } from "vitest";

import {
    detectOpportunityStatusDoubleCommit,
    logDrawerVmStatusDiagnostic,
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
        const info = vi.spyOn(console, "info").mockImplementation(() => {});
        detectOpportunityStatusDoubleCommit({
            opportunityId: "opp-1",
            vmContractComplete: true,
            hadMountedControl: true,
            showingSkeleton: true,
            statusKey: "new",
        });
        expect(info).toHaveBeenCalledWith(
            "[drawer_vm_status_double_commit_detected]",
            expect.objectContaining({ opportunity_id: "opp-1" })
        );
        info.mockRestore();
    });

    it("emits vm_seed diagnostic tag", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => {});
        logDrawerVmStatusDiagnostic("vm_seed", { opportunity_id: "opp-1" });
        expect(info).toHaveBeenCalledWith("[drawer_vm_status_vm_seed]", expect.objectContaining({ opportunity_id: "opp-1" }));
        info.mockRestore();
    });
});

describe("AdminEntityDrawer opportunity VM status wiring", () => {
    it("pins VM status, blocks bootstrap seed, and renders VM status control marker", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("opportunityDrawerVmStatusPinRef");
        expect(drawer).toContain("pinOpportunityDrawerVmStatusFromViewModel");
        expect(drawer).toContain("shouldBlockNonVmStatusWrite");
        expect(drawer).toContain("data-opportunity-drawer-vm-status-control");
        expect(drawer).toContain("hardCutoverOpportunity");
    });
});
