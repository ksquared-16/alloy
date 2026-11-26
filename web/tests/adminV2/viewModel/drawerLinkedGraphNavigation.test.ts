import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DRAWER_BACK_TO_LEAD_OPEN_SOURCE } from "@/contexts/AdminDrawerContext";
import { DRAWER_LINK_OPEN_FAILED_MESSAGE } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import {
    drawerLinkPendingKeyForChildFromOpportunity,
    drawerLinkPendingKeyForInquiryChildRow,
    drawerLinkPendingKeyForPersonFromOpportunity,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import {
    buildRestoredOpportunityDrawerState,
    restoredOpportunityDrawerOpenSource,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/restoreOpportunityDrawerSession";
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

    it("inquiry child pending key includes openSeed so open path clears pending", () => {
        const ws = { work_unit_id: "wu-1", department_id: "dept-1" };
        const rowKey = drawerLinkPendingKeyForInquiryChildRow({
            opportunityRecord: { id: "opp-1" },
            row: { person_id: "child-1", customer_member_id: "cm-1" },
            opportunityId: "opp-1",
            opportunityWorkspaceContext: ws,
        });
        const childKey = drawerLinkPendingKeyForChildFromOpportunity({
            personId: "child-1",
            opportunityId: "opp-1",
            opportunityWorkspaceContext: ws,
            openSeed: {
                personId: "child-1",
                opportunity_id: "opp-1",
            },
        });
        expect(rowKey).toBeTruthy();
        expect(childKey).toContain("child-1");
        expect(rowKey).toBe(childKey);
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
        expect(ctx).toContain("buildRestoredOpportunityDrawerState");
        expect(ctx).toContain("scheduleOpportunityDrawerGraphRewarmAfterRestore");
        expect(ctx).toContain("setDrawerLinkPendingKey(null)");
    });

    it("back-to-lead restore reactivates opportunity with workspace context and graph rewarm", () => {
        const ws = { work_unit_id: "wu-1", department_id: "dept-1" };
        const lead = {
            type: "opportunities" as const,
            id: "opp-1",
            openSource: "queue_row",
            opportunityWorkspaceContext: ws,
            opportunityQueuePreviewSeed: null,
            opportunityQueueNavigator: null,
        };
        expect(restoredOpportunityDrawerOpenSource(lead)).toBe("queue_row");
        expect(
            restoredOpportunityDrawerOpenSource({
                ...lead,
                openSource: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
            })
        ).toBeNull();
        const restored = buildRestoredOpportunityDrawerState(lead, null);
        expect(restored.type).toBe("opportunities");
        expect(restored.id).toBe("opp-1");
        expect(restored.openSource).toBe("queue_row");
        expect(restored.opportunityWorkspaceContext).toEqual(ws);
        expect(restored.personDrawerOpenSeed).toBeNull();

        const restoreModule = read(
            "lib/adminV2/viewModel/drawer/vmRuntime/restoreOpportunityDrawerSession.ts"
        );
        expect(restoreModule).toContain("scheduleWarmRelatedDrawerTargetsAfterVmApply");
    });

    it("EditablePersonContactCard shows inline Opening pending state", () => {
        const src = read("components/admin/opportunity/EditablePersonContactCard.tsx");
        expect(src).toContain("data-drawer-link-pending");
        expect(src).toContain("Opening…");
        expect(src).toContain("drawerLinkPending");
    });

    it("OpportunityInquiryChildrenSection uses inquiry child pending key with openSeed", () => {
        const src = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(src).toContain("prepareDrawerViewModelDeduped");
        expect(src).toContain("PERSON_DRAWER_CHILD_OPEN_SOURCE");
        expect(src).toContain("drawerLinkPendingKeyForInquiryChildRow");
        expect(src).toContain("isPending={isPending}");
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

    it("drawer runtime debug proof is gated behind debug flag only", () => {
        const debug = read("lib/adminV2/drawer/drawerRuntimeDebug.ts");
        expect(debug).toContain("NEXT_PUBLIC_ADMINV2_DRAWER_RUNTIME_DEBUG");
        expect(debug).not.toContain("NODE_ENV !== \"production\"");
        const drawer = read("components/admin/Drawer.tsx");
        expect(drawer).not.toMatch(/<DrawerRuntimeDebugBadge/);
        expect(drawer).not.toMatch(/import DrawerRuntimeDebugBadge/);
        expect(drawer).not.toContain("runtimeDebug");
        const opp = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(opp).not.toContain("lifecycleRailDevDebug");
        expect(opp).not.toContain("runtimeDebug={");
        const router = read("components/admin/AdminEntityDrawer.tsx");
        expect(router).not.toContain("AdminEntityDrawerLegacy");
        expect(router).not.toContain("runtimeDebug={");
    });

    it("model swap clears pending unconditionally and re-applies when drawer is stale", () => {
        const ctx = read("contexts/AdminDrawerContext.tsx");
        expect(ctx).toContain("drawerAlreadyOnTarget");
        expect(ctx).toContain("setDrawerLinkPendingKey(null)");
        expect(ctx).toContain("child_model_swap_commit");
    });

});
