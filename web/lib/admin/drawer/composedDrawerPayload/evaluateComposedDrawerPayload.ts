import { composeAdminV2DrawerRuntime } from "@/lib/adminV2/runtime/contract/drawerComposerPolicy";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import {
    evaluateDrawerSectionPlan,
    type AdminV2DrawerSectionContract,
} from "@/lib/adminV2/runtime/contract/drawerSectionContract";
import { drawerSectionRegistryForSurface } from "@/lib/adminV2/runtime/contract/registry";
import type { DrawerSectionRenderContext } from "@/lib/adminV2/runtime/contract/types";
import {
    requiredOpportunityDrawerPayloadSectionKeys,
    requiredPersonDrawerPayloadSectionKeys,
} from "@/lib/admin/drawer/composedDrawerPayload/sectionRequirements";
import type {
    ComposedDrawerPayloadEvaluation,
    ComposedDrawerPreparingCopy,
    ComposedOpportunityDrawerPayloadContext,
    ComposedPersonDrawerPayloadContext,
} from "@/lib/admin/drawer/composedDrawerPayload/types";

function evaluateRegistrySections(
    registry: readonly AdminV2DrawerSectionContract[],
    requiredKeys: readonly string[],
    ctx: DrawerSectionRenderContext
): ComposedDrawerPayloadEvaluation {
    const missing: string[] = [];
    const blockingSections: string[] = [];

    for (const key of requiredKeys) {
        const contract = registry.find((entry) => entry.sectionKey === key);
        if (!contract) continue;
        const decision = evaluateDrawerSectionPlan(contract, ctx);
        if (decision === "render") continue;
        blockingSections.push(key);
        missing.push(key);
    }

    return {
        ready: missing.length === 0,
        missing,
        blockingSections,
    };
}

export function evaluateComposedPersonDrawerPayload(
    args: ComposedPersonDrawerPayloadContext
): ComposedDrawerPayloadEvaluation {
    const requiredKeys = requiredPersonDrawerPayloadSectionKeys({
        surface: args.surface,
        operatingSections: args.operatingSections,
        overviewSectionKeys: args.overviewSectionKeys,
    });
    const registry = drawerSectionRegistryForSurface(args.surface);
    const ctx: DrawerSectionRenderContext = {
        record: args.record,
        drawerId: args.drawerId,
        bodyHydrated: args.bodyHydrated,
        typedSnapshot: false,
        fullHydrateReady: args.bodyHydrated,
        childChromeHint: args.childChromeHint ?? null,
    };
    return evaluateRegistrySections(registry, requiredKeys, ctx);
}

export function evaluateComposedOpportunityDrawerPayload(
    args: ComposedOpportunityDrawerPayloadContext
): ComposedDrawerPayloadEvaluation {
    const requiredKeys = requiredOpportunityDrawerPayloadSectionKeys(args.inquiryChildrenSectionVisible);
    const registry = drawerSectionRegistryForSurface("opportunity");
    const ctx: DrawerSectionRenderContext = {
        record: args.record,
        drawerId: args.drawerId,
        bodyHydrated: args.bodyHydrated,
        typedSnapshot: false,
        // fullHydrateReady is the full-surface sentinel — deliberately separate from bodyHydrated
        // so that BOS/right-panel sections can wait for the complete record, not just the primary.
        fullHydrateReady: args.fullHydrateReady,
    };
    const sectionEval = evaluateRegistrySections(registry, requiredKeys, ctx);
    const missing = [...sectionEval.missing];
    if (!args.headerActionsReady) missing.push("header_actions");
    return {
        ready: missing.length === 0,
        missing,
        blockingSections: sectionEval.blockingSections,
    };
}

/** Single reveal gate for person operating drawers — payload must be complete. */
export function personDrawerComposedPayloadReady(args: ComposedPersonDrawerPayloadContext): boolean {
    return evaluateComposedPersonDrawerPayload(args).ready;
}

export function opportunityDrawerComposedPayloadReady(args: ComposedOpportunityDrawerPayloadContext): boolean {
    return evaluateComposedOpportunityDrawerPayload(args).ready;
}

export function composedDrawerPreparingCopy(kind: "opportunity" | "parent" | "child"): ComposedDrawerPreparingCopy {
    switch (kind) {
        case "opportunity":
            return { title: "Preparing lead", description: "Preparing lead…" };
        case "parent":
            return { title: "Preparing parent profile", description: "Preparing parent profile…" };
        case "child":
            return { title: "Preparing child profile", description: "Preparing child profile…" };
    }
}

/** Opportunity composer plan for header/actions/tab chrome — must align with payload readiness. */
export function composeOpportunityDrawerRuntimeFromPayload(args: {
    drawerId: string;
    record: Record<string, unknown>;
    activeTab: DrawerTabKey;
    bodyHydrated: boolean;
    frameReady: boolean;
    headerActionsResolved: boolean;
    headerActionsLoading: boolean;
    headerActionsExpectRegistry: boolean;
    inquiryWorkflow: boolean;
    belowFoldRevealed: boolean;
    presentationReady: boolean;
    primaryContractReady: boolean;
    needsBackgroundHydrate: boolean;
    error: string | null;
}) {
    return composeAdminV2DrawerRuntime({
        entityType: "opportunities",
        surface: "opportunity",
        drawerId: args.drawerId,
        activeTab: args.activeTab,
        record: args.record,
        error: args.error,
        typedSnapshot: false,
        bodyHydrated: args.bodyHydrated,
        fullHydrateReady: args.bodyHydrated,
        frameReady: args.frameReady,
        headerActionsResolved: args.headerActionsResolved,
        headerActionsLoading: args.headerActionsLoading,
        headerActionsExpectRegistry: args.headerActionsExpectRegistry,
        inquiryWorkflow: args.inquiryWorkflow,
        belowFoldRevealed: args.belowFoldRevealed,
        presentationReady: args.presentationReady,
        primaryContractReady: args.primaryContractReady,
        needsBackgroundHydrate: args.needsBackgroundHydrate,
    });
}
