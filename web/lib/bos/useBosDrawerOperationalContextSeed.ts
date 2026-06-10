"use client";

import { useEffect, useMemo } from "react";

import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import {
    buildOpportunityOperationalContext,
    type OpportunityQueuePreviewSeed,
} from "@/lib/adminV2/bos/activeOperationalContext";

function overviewIdentityKey(overviewData: Record<string, unknown> | null | undefined): string {
    if (!overviewData || typeof overviewData !== "object") return "";
    const ident = (overviewData._identity as Record<string, unknown> | null) ?? null;
    const household =
        ident && typeof ident.household === "object" ?
            (ident.household as Record<string, unknown>)
        :   null;
    return [
        household && typeof household.label === "string" ? household.label.trim() : "",
        typeof overviewData._customer_name === "string" ? overviewData._customer_name.trim() : "",
        typeof overviewData._primary_contact_name === "string" ? overviewData._primary_contact_name.trim() : "",
        typeof overviewData._contact_name === "string" ? overviewData._contact_name.trim() : "",
        typeof overviewData.name === "string" ? overviewData.name.trim() : "",
    ].join("|");
}

function queuePreviewSeedKey(seed: OpportunityQueuePreviewSeed | null | undefined): string {
    if (!seed) return "";
    return [
        seed.title?.trim() ?? "",
        seed.subtitle?.trim() ?? "",
        seed.recordNumberHint?.trim() ?? "",
    ].join("|");
}

/** Seeds opportunity drawer operational context for BOS (VM + legacy parity). */
export function useBosOpportunityDrawerContextSeed(args: {
    drawerId: string | null;
    overviewData: Record<string, unknown> | null | undefined;
    queuePreviewSeed: OpportunityQueuePreviewSeed | null | undefined;
    opportunitySingular: string;
    opportunityBootstrapAppliedId?: string | null;
}) {
    const globalAssistant = useGlobalAssistantOptional();
    const setAssistantContext = globalAssistant?.setAssistantContext;
    const setSurfaceOperationalLabel = globalAssistant?.setSurfaceOperationalLabel;

    const bootstrapApplied = args.opportunityBootstrapAppliedId === args.drawerId;
    const queueSeedForContext = bootstrapApplied ? null : (args.queuePreviewSeed ?? null);
    const overviewKey = overviewIdentityKey(args.overviewData);
    const queueSeedKey = queuePreviewSeedKey(queueSeedForContext);
    const hasQueuePreviewSeed = Boolean(args.queuePreviewSeed);

    const operationalContext = useMemo(() => {
        if (!args.drawerId || args.drawerId === "new") return null;

        const sourceSurface =
            bootstrapApplied ? ("opportunity_drawer" as const)
            : hasQueuePreviewSeed ? ("queue" as const)
            : ("opportunity_drawer" as const);

        return buildOpportunityOperationalContext({
            entityId: args.drawerId,
            overviewData: args.overviewData,
            queuePreviewSeed: queueSeedForContext,
            opportunitySingular: args.opportunitySingular,
            sourceSurface,
        });
    }, [
        args.drawerId,
        args.opportunitySingular,
        bootstrapApplied,
        hasQueuePreviewSeed,
        overviewKey,
        queueSeedKey,
    ]);

    useEffect(() => {
        if (!setAssistantContext || !setSurfaceOperationalLabel) return;

        if (!operationalContext) {
            setAssistantContext(null);
            return;
        }

        setSurfaceOperationalLabel(null);
        setAssistantContext(operationalContext);
    }, [operationalContext, setAssistantContext, setSurfaceOperationalLabel]);

    useEffect(() => {
        return () => {
            setAssistantContext?.(null);
        };
    }, [args.drawerId, setAssistantContext]);
}

/** Seeds person/child drawer display context for BOS rail chip. */
export function useBosPersonDrawerContextSeed(args: {
    drawerId: string | null;
    displayName: string | null | undefined;
    isChild: boolean;
}) {
    const globalAssistant = useGlobalAssistantOptional();
    const setSurfaceOperationalLabel = globalAssistant?.setSurfaceOperationalLabel;

    const surfaceLabel = useMemo(() => {
        if (!args.drawerId || args.drawerId === "new") return null;
        const name = args.displayName?.trim() || (args.isChild ? "Child" : "Person");
        const prefix = args.isChild ? "Child" : "Person";
        return `${prefix} — ${name}`;
    }, [args.displayName, args.drawerId, args.isChild]);

    useEffect(() => {
        if (!setSurfaceOperationalLabel) return;
        setSurfaceOperationalLabel(surfaceLabel);
    }, [setSurfaceOperationalLabel, surfaceLabel]);

    useEffect(() => {
        return () => {
            setSurfaceOperationalLabel?.(null);
        };
    }, [args.drawerId, setSurfaceOperationalLabel]);
}
