import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DRAWER_BACK_TO_LEAD_OPEN_SOURCE } from "@/contexts/AdminDrawerContext";
import { DRAWER_LINK_OPEN_FAILED_MESSAGE } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import {
    drawerLinkPendingKeyForChildFromOpportunity,
    drawerLinkPendingKeyForPersonFromOpportunity,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import { warmRelatedDrawerGraph } from "@/lib/adminV2/viewModel/drawer/vmRuntime/warmRelatedDrawerGraph";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("drawerLinkedGraphNavigation", () => {
    it("person and child pending keys use distinct VM cache surfaces", () => {
        const ws = { work_unit_id: "wu-1", department_id: "dept-1" };
        const personKey = drawerLinkPendingKeyForPersonFromOpportunity({
            personId: "person-1",
            opportunityId: "opp-1",
            opportunityWorkspaceContext: ws,
        });
        const childKey = drawerLinkPendingKeyForChildFromOpportunity({
            personId: "child-1",
            opportunityId: "opp-1",
            opportunityWorkspaceContext: ws,
        });
        expect(personKey).toContain("person-1");
        expect(childKey).toContain("child-1");
        expect(personKey).not.toBe(childKey);
    });

    it("AdminDrawerContext exposes drawer link pending and back-to-lead restore", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("drawerLinkPendingKey");
        expect(ctx).toContain("model_swap_prepare_error");
        expect(ctx).toContain("DRAWER_BACK_TO_LEAD_OPEN_SOURCE");
        expect(ctx).toContain("model_swap_cache_hit");
        expect(ctx).toContain("failDrawerModelSwap");
        expect(ctx).toContain("goBackToLead");
        expect(ctx).toContain("beginDrawerLinkPendingIfCold");
        expect(ctx).toContain("back_to_lead_cache_hit");
    });

    it("useOpportunityDrawerVmPayload skips cold fetch when displayVm already matches drawer", () => {
        const src = read("lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload.ts");
        expect(src).toContain(
            "if (displayVm && String(displayVm.entity.id) === String(drawer.id)) return"
        );
    });

    it("EditablePersonContactCard shows inline Opening pending state", () => {
        const src = read("components/admin/opportunity/EditablePersonContactCard.tsx");
        expect(src).toContain("data-drawer-link-pending");
        expect(src).toContain("Opening…");
        expect(src).toContain("drawerLinkPending");
    });

    it("OpportunityInquiryChildrenSection warms child VM on pointer intent", () => {
        const src = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(src).toContain("prepareDrawerViewModelDeduped");
        expect(src).toContain("PERSON_DRAWER_CHILD_OPEN_SOURCE");
        expect(src).toContain("isPending={isPending}");
    });

    it("VmPersonStatusControl marks unset status without fake label", () => {
        const src = read("components/admin/vmDrawer/VmPersonStatusControl.tsx");
        expect(src).toContain('data-vm-status-unset');
        expect(src).not.toContain('"Active"');
    });

    it("PersonsDrawerVmRuntime uses VM header status only", () => {
        const src = read("components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx");
        expect(src).toContain("displayVm?.header.status_label");
        expect(src).not.toContain("_status_display");
    });

    it("warmRelatedDrawerGraph logs graph warm diagnostics", () => {
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
        warmRelatedDrawerGraph({
            drawer: {
                type: "opportunities",
                id: "opp-1",
                opportunityWorkspaceContext: { work_unit_id: "wu", department_id: "dept" },
            },
            entityType: "opportunities",
            record: { id: "opp-1", _inquiry_children: [] },
            runtime: "opportunity",
            previousDrawer: null,
            stack: [],
        });
        expect(infoSpy.mock.calls.some((c) => String(c[0]).includes("related_graph_warm_start"))).toBe(
            true
        );
        infoSpy.mockRestore();
    });

    it("exports stable drawer link failure copy", () => {
        expect(DRAWER_LINK_OPEN_FAILED_MESSAGE).toContain("Try again");
        expect(DRAWER_BACK_TO_LEAD_OPEN_SOURCE).toBe("drawer_back_to_lead");
    });

    it("queue row VM warm module logs warm lifecycle", () => {
        const src = read("lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm.ts");
        expect(src).toContain("queue_row_vm_warm_start");
        expect(src).toContain("warmVisibleQueueRowOpportunityVms");
    });

    it("WorkUnit queue block supports row-level Opening pending", () => {
        const src = read("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(src).toContain("queueRowOpenPendingOpportunityId");
        expect(src).toContain("Opening…");
        expect(src).toContain("warmQueueRowOpportunityVm");
    });
});
