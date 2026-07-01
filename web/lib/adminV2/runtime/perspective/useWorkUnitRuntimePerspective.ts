"use client";

import { useEffect, useMemo } from "react";

import { deriveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import {
    deriveOperationalViewsFromQueueDefinition,
    deriveRuntimePerspectiveWithOperationalViews,
} from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import { resolveOperationalViewsForWorkUnit } from "@/lib/adminV2/runtime/perspective/resolveStageOperationalViews";
import { setActiveRuntimePerspective } from "@/lib/adminV2/runtime/perspective/RuntimePerspectiveContext";
import type { PerspectiveConfigV1Stored } from "@/lib/lifecycle/perspectiveConfigV1";

export type WorkUnitRuntimePerspectiveInput = {
    workUnitId: string | null;
    workUnit: { queue_definition?: unknown; metadata?: unknown } | null;
    departmentMetadata: unknown;
    selectedQueueKey: string | null;
    attentionBucketKey: string | null;
    workViewPerspectivesEnabled: boolean;
};

/**
 * Canonical owner of the Work Unit's runtime perspective derivation + publication.
 *
 * The compat page used to resolve the operational views and derive + publish the runtime perspective
 * inline (a memo + two effects pushing to the global RuntimePerspectiveContext store). That
 * derivation lives here now: the page supplies its queue selection and work-unit/department
 * metadata, and this hook owns resolving operational views, deriving the perspective for the active
 * lane, and publishing it to the store (and clearing it on work-unit change). It returns the
 * resolved operational views so the page's pill/header layout memos can read them — the page is a
 * consumer of perspective, not its owner.
 *
 * Drawer/Focus Panel layout context is intentionally NOT handled here: those components read
 * prop-drilled layout IDs (workViewRuntimeContext → opportunityWorkspaceContext), not the global
 * perspective store, so this transfer does not touch them.
 */
export function useWorkUnitRuntimePerspective(
    input: WorkUnitRuntimePerspectiveInput,
): { stageOperationalViews: PerspectiveConfigV1Stored[] } {
    const {
        workUnitId,
        workUnit,
        departmentMetadata,
        selectedQueueKey,
        attentionBucketKey,
        workViewPerspectivesEnabled,
    } = input;

    const stageOperationalViews = useMemo(() => {
        if (!workViewPerspectivesEnabled) return [];
        const fromConfig =
            departmentMetadata != null ?
                resolveOperationalViewsForWorkUnit({
                    departmentMetadata,
                    workUnitMetadata: workUnit?.metadata,
                    queueDefinition: workUnit?.queue_definition,
                })
            :   [];
        if (fromConfig.length) return fromConfig;
        return deriveOperationalViewsFromQueueDefinition(workUnit?.queue_definition);
    }, [workViewPerspectivesEnabled, departmentMetadata, workUnit?.metadata, workUnit?.queue_definition]);

    useEffect(() => {
        const wuId = workUnitId?.trim();
        if (!wuId || !workUnit) {
            setActiveRuntimePerspective(null);
            return;
        }
        const deriveParams = {
            workUnitId: wuId,
            queueDefinition: workUnit.queue_definition,
            activeQueueKey: selectedQueueKey,
            attentionBucketKey: attentionBucketKey || null,
            source: "pill" as const,
        };
        setActiveRuntimePerspective(
            workViewPerspectivesEnabled && stageOperationalViews.length ?
                deriveRuntimePerspectiveWithOperationalViews({
                    ...deriveParams,
                    operationalViews: stageOperationalViews,
                })
            :   deriveRuntimePerspective(deriveParams),
        );
    }, [workUnitId, workUnit, selectedQueueKey, attentionBucketKey, stageOperationalViews]);

    useEffect(() => {
        return () => setActiveRuntimePerspective(null);
    }, [workUnitId]);

    return { stageOperationalViews };
}
