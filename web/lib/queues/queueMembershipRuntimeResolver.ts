/**
 * Phase C — resolve queue_membership_v1 for runtime routing (metadata-driven).
 *
 * Prefer work unit metadata; fall back to builder stage blob; never throw on invalid data.
 * Active when department has tracks_v1; legacy child-grain env path only without tracks.
 */

import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    slugifyLifecycleKey,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    lifecycleStageWorkUnitKey,
    primaryQueueKeyForLifecycleStage,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { parseQueueMembershipV1, type QueueMembershipCountUnit, type QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { resolveQueueMembershipForStage } from "@/lib/businessProcesses/resolveQueueMembership";
import {
    enrollmentPipelineQueueKeyAliases,
    enrollmentQueueMembershipLegacyFallback,
} from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import { resolveEffectiveLocationScopeSource } from "@/lib/queues/queueMembershipLocationScope";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import type { NormalizedQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";
import { buildChildTrackLaneFromMembership } from "@/lib/businessProcesses/resolveChildTrackLaneFromMembership";
import { isEnrollmentNewLeadsQueueKey } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import {
    resolveOcmEnrollmentTrackLaneContext,
    type OcmEnrollmentTrackLaneContext,
} from "@/lib/queues/ocmEnrollmentTrackQueueBuilder";
import {
    resolveEnrollmentOffersChildGrainContext,
    type EnrollmentOffersChildGrainContext,
} from "@/lib/queues/childGrainEnrollmentQueue";
import {
    resolveWaitlistCandidateGrainContext,
    type WaitlistCandidateGrainContext,
} from "@/lib/queues/candidateGrainWaitlistQueue";
import {
    isBuilderMembershipLaneAllowed,
    isQueueMembershipFromBuilderEnabled,
} from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";

export type QueueMembershipRoutingSource = "builder" | "child_grain_flag" | "legacy";

export type OpportunityQueueLaneRouting = {
    routingSource: QueueMembershipRoutingSource;
    builderMembership: QueueMembershipV1 | null;
    ocmTrackLaneCtx: OcmEnrollmentTrackLaneContext | null;
    waitlistGrainCtx: WaitlistCandidateGrainContext | null;
    enrollmentChildGrainCtx: EnrollmentOffersChildGrainContext | null;
    /** Present when routingSource is builder — safe summary metadata. */
    countUnit?: QueueMembershipCountUnit;
    locationScopeSource?: QueueMembershipV1["location_scope_source"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function readMembershipFromContainer(container: unknown): {
    parsed: QueueMembershipV1 | null;
    hasExplicit: boolean;
} {
    if (!isRecord(container)) return { parsed: null, hasExplicit: false };
    const raw = container[QUEUE_MEMBERSHIP_METADATA_KEY];
    if (raw === undefined) return { parsed: null, hasExplicit: false };
    return { parsed: parseQueueMembershipV1(raw), hasExplicit: true };
}

function findBuilderStageContext(
    departmentMetadata: unknown,
    stageKey: string,
): { stageRaw: Record<string, unknown>; processKey: string; stageLabel: string } | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const activeId = builder.active_process_id;
    const activeProcesses = builder.processes.filter((p) => p.is_active);
    const searchOrder = activeId
        ? [
              activeProcesses.find((p) => p.id === activeId),
              ...activeProcesses.filter((p) => p.id !== activeId),
          ].filter((p): p is NonNullable<typeof p> => Boolean(p))
        : activeProcesses;

    for (const process of searchOrder) {
        for (const stage of process.stages) {
            if (!stage.is_active || stage.key !== stageKey.trim()) continue;
            return {
                stageRaw: stage as unknown as Record<string, unknown>,
                processKey: process.key,
                stageLabel: (stage.label ?? stage.key).trim() || stage.key,
            };
        }
    }
    return null;
}

/** Load membership for a work unit — WU metadata first, then builder stage explicit config. */
export function resolveQueueMembershipForWorkUnitRuntime(params: {
    workUnitMetadata: unknown;
    departmentMetadata: unknown;
}): QueueMembershipV1 | null {
    const fromWorkUnit = readMembershipFromContainer(params.workUnitMetadata);
    if (fromWorkUnit.hasExplicit) return fromWorkUnit.parsed;

    const stageKey = stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata);
    if (stageKey) {
        const ctx = findBuilderStageContext(params.departmentMetadata, stageKey);
        if (ctx) {
            const fromStage = resolveQueueMembershipForStage(ctx.stageRaw, stageKey);
            if (fromStage) return fromStage;
            return enrollmentQueueMembershipLegacyFallback(stageKey, ctx.processKey);
        }
        return enrollmentQueueMembershipLegacyFallback(stageKey, "");
    }

    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    for (const process of builder.processes.filter((p) => p.is_active)) {
        for (const stage of process.stages) {
            if (stage.queue_membership_v1) return stage.queue_membership_v1;
        }
    }
    return null;
}

/** Whether membership applies to the executable queue key for this lane. */
export function membershipAppliesToExecutableQueueKey(
    membership: QueueMembershipV1,
    executableQueueKey: string,
): boolean {
    const key = executableQueueKey.trim();
    if (!key) return false;

    const explicitBuilderKey = membership.queue_builder_key?.trim();
    if (explicitBuilderKey && explicitBuilderKey === key) return true;

    const aliases = enrollmentPipelineQueueKeyAliases(membership.lifecycle_key, membership.stage_key);
    if (aliases.includes(key)) return true;

    if (key === membership.stage_key) return true;

    const lifecycleKey = primaryQueueKeyForLifecycleStage(membership.stage_key);
    if (key === lifecycleKey) return true;

    if (key === lifecycleStageWorkUnitKey(membership.stage_key)) return true;

    const slugKey = `lifecycle_${slugifyLifecycleKey(membership.stage_key)}`;
    if (key === slugKey) return true;

    if (membership.subject_type === "child") {
        const aliases = enrollmentPipelineQueueKeyAliases(membership.lifecycle_key, membership.stage_key);
        if (aliases.includes(key)) return true;
    }

    return false;
}

function buildOcmLaneFromMembership(
    executableQueueKey: string,
    membership: QueueMembershipV1,
    stageLabel?: string | null,
): OcmEnrollmentTrackLaneContext | null {
    if (!membershipAppliesToExecutableQueueKey(membership, executableQueueKey)) return null;
    if (isEnrollmentNewLeadsQueueKey(executableQueueKey)) return null;
    if (membership.subject_type === "case") return null;
    return buildChildTrackLaneFromMembership({
        executableQueueKey,
        membership,
        stageLabel,
    });
}

function dispositionKeysForMembership(membership: QueueMembershipV1): string[] | undefined {
    const keys = membership.included_disposition_keys.map((k) => k.trim()).filter(Boolean);
    return keys.length ? keys : undefined;
}

function buildWaitlistLaneFromMembership(
    normalized: NormalizedQueueDefinitionDocument | null | undefined,
    executableQueueKey: string,
    membership: QueueMembershipV1,
): WaitlistCandidateGrainContext | null {
    if (membership.subject_type !== "candidate") return null;
    if (!membershipAppliesToExecutableQueueKey(membership, executableQueueKey)) return null;

    const base = resolveWaitlistCandidateGrainContext({
        normalized,
        executableQueueKey,
    });
    if (!base) return null;

    const dispositionKeys = dispositionKeysForMembership(membership);
    const placementScope = membership.placement_scope;
    let candidate_statuses = base.filters.candidate_statuses;
    if (placementScope === "active_only") {
        candidate_statuses = ["active"];
    } else if (placementScope === "active_and_paused") {
        candidate_statuses = ["active", "paused"];
    }

    return {
        ...base,
        filters: {
            ...base.filters,
            candidate_statuses,
            child_lifecycle_statuses: dispositionKeys ?? base.filters.child_lifecycle_statuses,
        },
        countUnit: membership.count_unit,
        membershipSource: "builder",
        locationScopeSource: resolveEffectiveLocationScopeSource(membership),
    };
}

function resolveChildGrainFlagLanes(params: {
    normalized: NormalizedQueueDefinitionDocument | null | undefined;
    executableQueueKey: string;
}): Pick<
    OpportunityQueueLaneRouting,
    "ocmTrackLaneCtx" | "waitlistGrainCtx" | "enrollmentChildGrainCtx"
> {
    const ocmTrackLaneCtx = resolveOcmEnrollmentTrackLaneContext({
        executableQueueKey: params.executableQueueKey,
    });
    const waitlistGrainCtx = resolveWaitlistCandidateGrainContext({
        normalized: params.normalized,
        executableQueueKey: params.executableQueueKey,
    });
    const enrollmentChildGrainCtx = resolveEnrollmentOffersChildGrainContext({
        normalized: params.normalized,
        executableQueueKey: params.executableQueueKey,
    });
    return { ocmTrackLaneCtx, waitlistGrainCtx, enrollmentChildGrainCtx };
}

/**
 * Resolve opportunity lane routing with precedence:
 * 1. tracks_v1 + valid queue_membership_v1 for queue key (builder)
 * 2. Legacy child-grain env path (tenants without tracks_v1 only)
 * 3. Legacy case-grain compat paths
 */
export function resolveOpportunityQueueLaneRouting(params: {
    normalized: NormalizedQueueDefinitionDocument | null | undefined;
    executableQueueKey: string;
    workUnitMetadata: unknown;
    departmentMetadata: unknown;
}): OpportunityQueueLaneRouting {
    const executableQueueKey = params.executableQueueKey.trim();
    const empty: OpportunityQueueLaneRouting = {
        routingSource: "legacy",
        builderMembership: null,
        ocmTrackLaneCtx: null,
        waitlistGrainCtx: null,
        enrollmentChildGrainCtx: null,
    };

    if (!executableQueueKey) return empty;

    if (isQueueMembershipFromBuilderEnabled(params.departmentMetadata)) {
        try {
            const membership = resolveQueueMembershipForWorkUnitRuntime({
                workUnitMetadata: params.workUnitMetadata,
                departmentMetadata: params.departmentMetadata,
            });
            if (
                membership &&
                membershipAppliesToExecutableQueueKey(membership, executableQueueKey) &&
                isBuilderMembershipLaneAllowed(membership)
            ) {
                const stageLabel =
                    stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata) ?
                        findBuilderStageContext(
                            params.departmentMetadata,
                            stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata)!,
                        )?.stageLabel ?? null
                    :   null;
                const ocmTrackLaneCtx = buildOcmLaneFromMembership(
                    executableQueueKey,
                    membership,
                    stageLabel,
                );
                if (ocmTrackLaneCtx) {
                    return {
                        routingSource: "builder",
                        builderMembership: membership,
                        ocmTrackLaneCtx,
                        waitlistGrainCtx: null,
                        enrollmentChildGrainCtx: null,
                        countUnit: membership.count_unit,
                        locationScopeSource: membership.location_scope_source ?? undefined,
                    };
                }

                const waitlistGrainCtx = buildWaitlistLaneFromMembership(
                    params.normalized,
                    executableQueueKey,
                    membership,
                );
                if (waitlistGrainCtx) {
                    return {
                        routingSource: "builder",
                        builderMembership: membership,
                        ocmTrackLaneCtx: null,
                        waitlistGrainCtx,
                        enrollmentChildGrainCtx: null,
                        countUnit: membership.count_unit,
                        locationScopeSource: membership.location_scope_source ?? undefined,
                    };
                }

                if (membership.subject_type === "case") {
                    return {
                        routingSource: "builder",
                        builderMembership: membership,
                        ocmTrackLaneCtx: null,
                        waitlistGrainCtx: null,
                        enrollmentChildGrainCtx: null,
                        countUnit: membership.count_unit,
                        locationScopeSource: membership.location_scope_source ?? undefined,
                    };
                }
            }
        } catch {
            // Never throw on invalid metadata — fall through to legacy when tracks configured.
        }
        return empty;
    }

    const childGrain = resolveChildGrainFlagLanes({
        normalized: params.normalized,
        executableQueueKey,
    });
    const hasChildGrain =
        childGrain.ocmTrackLaneCtx != null ||
        childGrain.waitlistGrainCtx != null ||
        childGrain.enrollmentChildGrainCtx != null;

    return {
        routingSource: hasChildGrain ? "child_grain_flag" : "legacy",
        builderMembership: null,
        ...childGrain,
    };
}

export type QueueMembershipRoutingLogMeta = {
    routing_source: QueueMembershipRoutingSource;
    queue_key: string;
    stage_key?: string;
    subject_type?: string;
    count_unit?: QueueMembershipCountUnit;
};

export function queueMembershipRoutingLogMeta(
    routing: OpportunityQueueLaneRouting,
    executableQueueKey: string,
): QueueMembershipRoutingLogMeta | null {
    if (routing.routingSource === "legacy" && !routing.builderMembership) {
        return { routing_source: routing.routingSource, queue_key: executableQueueKey };
    }
    const membership = routing.builderMembership;
    if (!membership) {
        return { routing_source: routing.routingSource, queue_key: executableQueueKey };
    }
    return {
        routing_source: routing.routingSource,
        queue_key: executableQueueKey,
        stage_key: membership.stage_key,
        subject_type: membership.subject_type,
        count_unit: membership.count_unit,
    };
}
