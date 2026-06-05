import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";
import { resolveOpportunityVmStatusLabel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusLabel";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("resolveOpportunityVmStatusLabel", () => {
    it("uses VM header status when drawer id matches entity", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-1" },
            header: {
                status: { renderAs: "readonly_pill", label: "Tour scheduled" },
            },
        });
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: vm,
                queueSeedStatusLabel: "Waitlist",
            })
        ).toBe("Tour scheduled");
    });

    it("falls back to queue seed when VM not yet applied for target id", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-other" },
            header: { status: { renderAs: "readonly_pill", label: "Other" } },
        });
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: vm,
                queueSeedStatusLabel: "New lead",
            })
        ).toBe("New lead");
    });

    it("returns null when hidden and no seed", () => {
        const vm = minimalSettledOpportunityDrawerViewModel({
            entity: { type: "opportunity", id: "opp-1" },
            header: { status: { renderAs: "hidden" } },
        });
        expect(
            resolveOpportunityVmStatusLabel({
                drawerId: "opp-1",
                displayVm: vm,
            })
        ).toBeNull();
    });
});

describe("Opportunity VM status — no flicker contract", () => {
    it("VmReadonlyStatusPill is pure markup without hooks or async", () => {
        const pill = read("components/admin/vmDrawer/VmReadonlyStatusPill.tsx");
        expect(pill).not.toContain("useState");
        expect(pill).not.toContain("useEffect");
        expect(pill).not.toContain("useMemo");
        expect(pill).not.toContain("<select");
        expect(pill).not.toContain("status-options");
        expect(pill).toContain("data-vm-readonly-status-pill");
    });

    it("OpportunityDrawerVmRuntime uses progressive status without statusBadge or prefetch fetch", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("VmProgressiveStatusDropdown");
        expect(runtime).toContain("resolveOpportunityVmStatusLabel");
        expect(runtime).toContain("data-drawer-vm-status-rail");
        expect(runtime).not.toContain("VmOpportunityStatusControl");
        expect(runtime).not.toContain("statusBadge");
        expect(runtime).not.toContain("holdPriorPayload");
        expect(runtime).not.toContain("status-options");
    });

    it("status renders below title; actions stay in headerTitleRight", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("data-opportunity-drawer-header-status-below-title");
        expect(runtime).toContain("data-opportunity-drawer-header-title-right");
        expect(runtime).not.toMatch(
            /headerTitleRight[\s\S]*VmProgressiveStatusDropdown/
        );
    });

    it("VmOpportunityStatusControl is not imported by VM opportunity runtime", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).not.toContain('from "@/components/admin/vmDrawer/VmOpportunityStatusControl"');
    });
});
