"use client";

import { useEffect } from "react";

import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import {
    buildOpportunityOperationalContext,
    type OpportunityQueuePreviewSeed,
} from "@/lib/adminV2/bos/activeOperationalContext";

/** Seeds opportunity drawer operational context for BOS (VM + legacy parity). */
export function useBosOpportunityDrawerContextSeed(args: {
    drawerId: string | null;
    overviewData: Record<string, unknown> | null | undefined;
    queuePreviewSeed: OpportunityQueuePreviewSeed | null | undefined;
    opportunitySingular: string;
    opportunityBootstrapAppliedId?: string | null;
}) {
    const globalAssistant = useGlobalAssistantOptional();

    useEffect(() => {
        if (!globalAssistant) return;

        if (!args.drawerId || args.drawerId === "new") {
            globalAssistant.setAssistantContext(null);
            return;
        }

        globalAssistant.setSurfaceOperationalLabel(null);

        const sourceSurface =
            args.opportunityBootstrapAppliedId === args.drawerId ? ("opportunity_drawer" as const)
            : args.queuePreviewSeed ? ("queue" as const)
            : ("opportunity_drawer" as const);

        globalAssistant.setAssistantContext(
            buildOpportunityOperationalContext({
                entityId: args.drawerId,
                overviewData: args.overviewData,
                queuePreviewSeed:
                    args.opportunityBootstrapAppliedId === args.drawerId ?
                        null
                    :   (args.queuePreviewSeed ?? null),
                opportunitySingular: args.opportunitySingular,
                sourceSurface,
            })
        );

        return () => {
            globalAssistant.setAssistantContext(null);
        };
    }, [
        globalAssistant,
        args.drawerId,
        args.queuePreviewSeed,
        args.opportunityBootstrapAppliedId,
        args.overviewData,
        args.opportunitySingular,
    ]);
}

/** Seeds person/child drawer display context for BOS rail chip. */
export function useBosPersonDrawerContextSeed(args: {
    drawerId: string | null;
    displayName: string | null | undefined;
    isChild: boolean;
}) {
    const globalAssistant = useGlobalAssistantOptional();

    useEffect(() => {
        if (!globalAssistant) return;

        if (!args.drawerId || args.drawerId === "new") {
            globalAssistant.setSurfaceOperationalLabel(null);
            return;
        }

        const name = args.displayName?.trim() || (args.isChild ? "Child" : "Person");
        const prefix = args.isChild ? "Child" : "Person";
        globalAssistant.setSurfaceOperationalLabel(`${prefix} — ${name}`);

        return () => {
            globalAssistant.setSurfaceOperationalLabel(null);
        };
    }, [globalAssistant, args.drawerId, args.displayName, args.isChild]);
}
