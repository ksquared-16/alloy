import { opportunityDrawerHeaderActionsReady } from "@/lib/admin/drawer/drawerFirstPaintReadiness";
import {
    evaluateDrawerSectionPlan,
    type AdminV2DrawerSectionContract,
} from "@/lib/adminV2/runtime/contract/drawerSectionContract";
import { drawerSectionRegistryForSurface } from "@/lib/adminV2/runtime/contract/registry";
import {
    adminV2DrawerCanRevealActiveTab,
    adminV2DrawerHeaderActionsTabIndependent,
    adminV2DrawerTabsPremountWhenSurfaceReady,
} from "@/lib/adminV2/runtime/contract/drawerTabsContract";
import type {
    AdminV2DrawerRuntimePlan,
    ComposeAdminV2DrawerRuntimeInput,
    DrawerSectionRenderContext,
} from "@/lib/adminV2/runtime/contract/types";

function buildSectionContext(input: ComposeAdminV2DrawerRuntimeInput): DrawerSectionRenderContext | null {
    if (!input.record || !input.drawerId || input.drawerId === "new") return null;
    return {
        record: input.record,
        bodyHydrated: input.bodyHydrated,
        typedSnapshot: input.typedSnapshot,
        fullHydrateReady: input.fullHydrateReady,
        drawerId: input.drawerId,
    };
}

function evaluateRegistry(
    registry: readonly AdminV2DrawerSectionContract[],
    ctx: DrawerSectionRenderContext
): Pick<
    AdminV2DrawerRuntimePlan,
    "sectionsToRender" | "sectionsReserved" | "sectionsBlocking"
> {
    const sectionsToRender: string[] = [];
    const sectionsReserved: string[] = [];
    const sectionsBlocking: string[] = [];

    for (const contract of registry) {
        const decision = evaluateDrawerSectionPlan(contract, ctx);
        if (decision === "render") sectionsToRender.push(contract.sectionKey);
        else if (decision === "reserve") sectionsReserved.push(contract.sectionKey);
        else if (decision === "block") sectionsBlocking.push(contract.sectionKey);
    }

    return { sectionsToRender, sectionsReserved, sectionsBlocking };
}

/**
 * Composer-owned drawer runtime — sections must not invent independent first-paint behavior.
 */
export function composeAdminV2DrawerRuntime(
    input: ComposeAdminV2DrawerRuntimeInput
): AdminV2DrawerRuntimePlan {
    const empty: AdminV2DrawerRuntimePlan = {
        canRevealDrawerFrame: false,
        canRevealHeaderActions: false,
        canRevealActiveTab: false,
        sectionsToRender: [],
        sectionsReserved: [],
        sectionsBlocking: [],
        backgroundHydrateNeeded: input.needsBackgroundHydrate,
    };

    if (input.error || !input.drawerId || input.drawerId === "new") {
        return empty;
    }

    const ctx = buildSectionContext(input);
    if (!ctx) return empty;

    const registry = drawerSectionRegistryForSurface(input.surface);
    const sectionPlan = evaluateRegistry(registry, ctx);

    const frameContractOk =
        input.frameReady &&
        (input.surface !== "opportunity" ||
            (input.primaryContractReady &&
                (!input.inquiryWorkflow || input.presentationReady || input.typedSnapshot)));

    const aboveFoldBlocking = sectionPlan.sectionsBlocking.filter((key) => {
        const c = registry.find((r) => r.sectionKey === key);
        return c?.blocksFirstPaint && !c.belowFoldLazy;
    });

    const aboveFoldReserved = sectionPlan.sectionsReserved.filter((key) => {
        const c = registry.find((r) => r.sectionKey === key);
        return c?.blocksFirstPaint && !c.belowFoldLazy;
    });

    const canRevealDrawerFrame =
        frameContractOk &&
        aboveFoldBlocking.length === 0 &&
        aboveFoldReserved.length === 0 &&
        sectionPlan.sectionsToRender.length > 0;

    const drawerSurfaceReady = canRevealDrawerFrame;

    const headerActionsTabIndependent = adminV2DrawerHeaderActionsTabIndependent({
        inquiryWorkflow: input.inquiryWorkflow,
    });

    const headerActionsReady = opportunityDrawerHeaderActionsReady({
        frame_ready: input.frameReady,
        header_actions_resolved: input.headerActionsResolved,
        header_actions_loading: input.headerActionsLoading,
        expect_registry: input.headerActionsExpectRegistry,
    });

    const canRevealHeaderActions =
        drawerSurfaceReady &&
        headerActionsReady &&
        (headerActionsTabIndependent ||
            input.belowFoldRevealed ||
            input.typedSnapshot ||
            input.headerActionsResolved);

    const canRevealActiveTab = adminV2DrawerCanRevealActiveTab({
        inquiryWorkflow: input.inquiryWorkflow,
        drawerSurfaceReady,
        activeTab: input.activeTab,
    });

    adminV2DrawerTabsPremountWhenSurfaceReady({
        inquiryWorkflow: input.inquiryWorkflow,
        drawerSurfaceReady,
        activeTab: input.activeTab,
    });

    return {
        canRevealDrawerFrame,
        canRevealHeaderActions,
        canRevealActiveTab,
        ...sectionPlan,
        backgroundHydrateNeeded: input.needsBackgroundHydrate,
    };
}
