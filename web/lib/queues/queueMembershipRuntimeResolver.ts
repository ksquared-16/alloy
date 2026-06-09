/**
 * Phase C — resolve queue_membership_v1 for runtime routing (behind flag).
 *
 * Prefer work unit metadata; fall back to builder stage blob; never throw on invalid data.
 */

import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    slugifyLifecycleKey,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    lifecycleStageWorkUnitKey,
    primaryQueueKeyForLifecycleStage,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    defaultQueueMembershipForEnrollmentStage,
    parseQueueMembershipV1,
    resolveQueueMembershipForStage,
    type QueueMembershipCountUnit,
    type QueueMembershipV1,
} from "@/lib/lifecycle/queueMembershipV1";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import type { NormalizedQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";
import {
    enrollmentOperatorStageLabel,
    resolveOcmEnrollmentTrackStageForQueueKey,
    type OcmEnrollmentTrackStage,
} from "@/lib/queues/ocmEnrollmentTrackStageKeys";
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
import { isQueueMembershipFromBuilderEnabled } from "@/lib/queues/queueMembershipFromBuilderFeatureFlag";

export type QueueMembershipRoutingSource = "builder" | "child_grain_flag" | "legacy";

export type OpportunityQueueLaneRouting = {
    routingSource: QueueMembershipRoutingSource;
    builderMembership: QueueMembershipV1 | null;
    ocmTrackLaneCtx: OcmEnrollmentTrackLaneContext | null;
    waitlistGrainCtx: WaitlistCandidateGrainContext | null;
    enrollmentChildGrainCtx: EnrollmentOffersChildGrainContext | null;
};

const STAGE_PIPELINE_QUEUE_KEYS: Record<string, readonly string[]> = {
    lead: ["leads", "new_leads", "new_inquiries", "lead", "new_lead"],
    qualification: ["qualification"],
    tour: ["tours", "tours_follow_up"],
    waitlist: ["waitlist"],
    enrollment: ["enrollment_offers"],
    enrolled: ["enrollment_completed"],
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

function findEnrollmentStageRaw(
    departmentMetadata: unknown,
    stageKey: string,
): Record<string, unknown> | null {
    if (!isRecord(departmentMetadata)) return null;
    const builderRaw = departmentMetadata[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return null;

    for (const processRaw of builderRaw.processes) {
        if (!isRecord(processRaw)) continue;
        if (String(processRaw.key ?? "").trim() !== ENROLLMENT_PROCESS_KEY) continue;
        if (processRaw.is_active === false) continue;
        const stages = Array.isArray(processRaw.stages) ? processRaw.stages : [];
        for (const stageRaw of stages) {
            if (!isRecord(stageRaw)) continue;
            if (String(stageRaw.key ?? "").trim() === stageKey.trim()) {
                return stageRaw;
            }
        }
    }
    return null;
}

/** Load membership for a work unit — WU metadata first, then builder stage, then enrollment defaults. */
export function resolveQueueMembershipForWorkUnitRuntime(params: {
    workUnitMetadata: unknown;
    departmentMetadata: unknown;
}): QueueMembershipV1 | null {
    const fromWorkUnit = readMembershipFromContainer(params.workUnitMetadata);
    if (fromWorkUnit.hasExplicit) return fromWorkUnit.parsed;

    const stageKey = stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata);
    if (stageKey) {
        const stageRaw = findEnrollmentStageRaw(params.departmentMetadata, stageKey);
        if (stageRaw) {
            const fromStage = resolveQueueMembershipForStage(stageRaw, stageKey);
            if (fromStage) return fromStage;
        }
        return defaultQueueMembershipForEnrollmentStage(stageKey);
    }

    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = builder.processes.find((p) => p.key === ENROLLMENT_PROCESS_KEY && p.is_active);
    if (!process) return null;
    for (const stage of process.stages) {
        const membership = stage.queue_membership_v1;
        if (membership) return membership;
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

    const aliases = STAGE_PIPELINE_QUEUE_KEYS[membership.stage_key] ?? [];
    if (aliases.includes(key)) return true;

    if (key === membership.stage_key) return true;

    const lifecycleKey = primaryQueueKeyForLifecycleStage(membership.stage_key);
    if (key === lifecycleKey) return true;

    if (key === lifecycleStageWorkUnitKey(membership.stage_key)) return true;

    const slugKey = `lifecycle_${slugifyLifecycleKey(membership.stage_key)}`;
    if (key === slugKey) return true;

    const ocmStage = resolveOcmEnrollmentTrackStageForQueueKey(key);
    if (ocmStage) {
        const membershipOcmStage = ocmEnrollmentTrackStageFromMembershipStageKey(membership.stage_key);
        return membershipOcmStage === ocmStage && membership.subject_type === "child";
    }

    return false;
}

export function ocmEnrollmentTrackStageFromMembershipStageKey(stageKey: string): OcmEnrollmentTrackStage | null {
    const key = stageKey.trim();
    if (key === "tour") return "tour";
    if (key === "enrollment") return "enrolling";
    if (key === "enrolled") return "enrolled";
    return null;
}

function dispositionKeysForMembership(membership: QueueMembershipV1): string[] | undefined {
    const keys = membership.included_disposition_keys.map((k) => k.trim()).filter(Boolean);
    return keys.length ? keys : undefined;
}

function buildOcmLaneFromMembership(
    executableQueueKey: string,
    membership: QueueMembershipV1,
): OcmEnrollmentTrackLaneContext | null {
    if (membership.subject_type !== "child") return null;
    if (!membershipAppliesToExecutableQueueKey(membership, executableQueueKey)) return null;

    const stage = ocmEnrollmentTrackStageFromMembershipStageKey(membership.stage_key);
    if (!stage) return null;

    return {
        enabled: true,
        queueKey: executableQueueKey.trim(),
        stage,
        stageLabel: enrollmentOperatorStageLabel(stage),
        dispositionKeys: dispositionKeysForMembership(membership),
        countUnit: membership.count_unit,
        membershipSource: "builder",
    };
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
    return {
        ...base,
        filters: {
            ...base.filters,
            child_lifecycle_statuses: dispositionKeys ?? base.filters.child_lifecycle_statuses,
        },
        countUnit: membership.count_unit,
        membershipSource: "builder",
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
 * 1. Builder flag + valid membership for queue key
 * 2. ALLOY_QUEUE_CHILD_GRAIN_LANES
 * 3. Legacy (case-grain compat paths)
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

    if (isQueueMembershipFromBuilderEnabled()) {
        try {
            const membership = resolveQueueMembershipForWorkUnitRuntime({
                workUnitMetadata: params.workUnitMetadata,
                departmentMetadata: params.departmentMetadata,
            });
            if (membership && membershipAppliesToExecutableQueueKey(membership, executableQueueKey)) {
                const ocmTrackLaneCtx = buildOcmLaneFromMembership(executableQueueKey, membership);
                if (ocmTrackLaneCtx) {
                    return {
                        routingSource: "builder",
                        builderMembership: membership,
                        ocmTrackLaneCtx,
                        waitlistGrainCtx: null,
                        enrollmentChildGrainCtx: null,
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
                    };
                }

                if (membership.subject_type === "case") {
                    return {
                        routingSource: "builder",
                        builderMembership: membership,
                        ocmTrackLaneCtx: null,
                        waitlistGrainCtx: null,
                        enrollmentChildGrainCtx: null,
                    };
                }
            }
        } catch {
            // Never throw on invalid metadata — fall through to child-grain / legacy.
        }
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
