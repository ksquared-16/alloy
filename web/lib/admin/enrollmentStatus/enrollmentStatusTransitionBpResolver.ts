/**
 * Resolve allowed Change Enrollment Status destinations from Business Process config.
 *
 * Sources (priority order):
 * 1. Current stage `stage_operating_plan_v1.outcomes` + matching `outcome_rules`
 * 2. Process `tracks_v1.split_rules` parking-lot targets (e.g. waitlist from decision)
 * 3. Globally configured parking-lot stages (waitlist) when present on active process
 * 4. Fallback to defaultEnrollmentStatusDestinations when BP has no usable rules
 */

import type {
    EnrollmentStatusDestinationKey,
    EnrollmentStatusTransitionDestinationOption,
    EnrollmentStatusTransitionGrain,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    defaultEnrollmentStatusDestinations,
    enrollmentStatusDestinationLabel,
    resolveEnrollmentStatusTargetKey,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionDestinations";
import { resolveStatusProcessStageAssignment } from "@/lib/businessProcesses/resolveStatusProcessStageAssignment";
import {
    legacyCanonicalProcessStageForStatusKey,
    legacyGranularProcessStageForStatusKey,
} from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import {
    activeLifecycleProcess,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    outcomeRulesForKey,
    type StageOperatingPlanV1,
    type StageOutcomeRuleTargetV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { canonicalOperatorStageForStatusKey } from "@/lib/lifecycle/enrollmentOperatorStage";

export type BpEnrollmentTransitionSource = "stage_outcome" | "parking_lot" | "split_rule" | "default";

export type BpResolvedEnrollmentDestination = EnrollmentStatusTransitionDestinationOption & {
    outcomeKey?: string;
    builderStageKey?: string;
    bpSource: BpEnrollmentTransitionSource;
    requiresTourBypass?: boolean;
    ruleKey?: string;
};

export type ResolveBpEnrollmentDestinationsInput = {
    departmentMetadata: Record<string, unknown> | null | undefined;
    currentStatusKey: string | null;
    statusMetadata?: Record<string, unknown> | null;
    grain: EnrollmentStatusTransitionGrain;
    /** Explicit builder stage when known (queue row / drawer focus). */
    builderStageKey?: string | null;
};

export type ResolveBpEnrollmentDestinationsResult = {
    destinations: BpResolvedEnrollmentDestination[];
    currentBuilderStageKey: string | null;
    destinationSource: "bp" | "default_fallback";
    processKey: string | null;
};

const PARKING_LOT_BUILDER_STAGE_KEYS = new Set(["waitlist"]);
const TERMINAL_BUILDER_STAGE_KEYS = new Set(["closed", "closed_lost", "closed_withdrawn", "withdrawn", "enrolled"]);
const PRE_TOUR_BUILDER_STAGE_KEYS = new Set([
    "lead",
    "new_lead",
    "contacting",
    "qualification",
    "tour",
    "tour_scheduled",
]);

const TOUR_COMPLETE_STATUS_KEYS = new Set([
    "tour_completed",
    "decision_pending",
    "waitlisted",
    "waitlist_paused",
    "offer_pending",
    "enrolling",
    "enrolled",
]);

const STAGE_KEY_ALIASES: Record<string, string> = {
    decision_pending: "decision",
    tour_scheduled: "tour",
    tour_completed: "tour",
    tour_requested: "tour",
    new_lead: "lead",
    contacting: "lead",
};

function trimOrNull(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeBuilderStageKey(stage: string | null, stageKeys: readonly string[]): string | null {
    if (!stage) return null;
    if (stageKeys.includes(stage)) return stage;
    const aliased = STAGE_KEY_ALIASES[stage];
    if (aliased && stageKeys.includes(aliased)) return aliased;
    return null;
}


function configuredStageKeys(
    departmentMetadata: Record<string, unknown> | null | undefined,
): string[] {
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata ?? {});
    const process = activeLifecycleProcess(builder);
    if (!process) return [];
    return process.stages.filter((s) => s.is_active !== false).map((s) => s.key);
}

export function resolveBuilderStageKeyForStatus(input: {
    departmentMetadata: Record<string, unknown> | null | undefined;
    statusKey: string | null;
    statusMetadata?: Record<string, unknown> | null;
    explicitBuilderStageKey?: string | null;
}): string | null {
    const explicit = trimOrNull(input.explicitBuilderStageKey);
    if (explicit) return explicit;

    const statusKey = trimOrNull(input.statusKey);
    if (!statusKey) return null;

    const stageKeys = configuredStageKeys(input.departmentMetadata);
    const assigned = resolveStatusProcessStageAssignment(
        statusKey,
        input.statusMetadata ?? null,
        stageKeys,
    );
    const normalized =
        normalizeBuilderStageKey(assigned.stage, stageKeys) ??
        normalizeBuilderStageKey(legacyGranularProcessStageForStatusKey(statusKey), stageKeys) ??
        normalizeBuilderStageKey(legacyCanonicalProcessStageForStatusKey(statusKey), stageKeys) ??
        normalizeBuilderStageKey(
            canonicalOperatorStageForStatusKey(statusKey),
            stageKeys,
        );

    if (normalized) return normalized;

    return null;
}

function mapBuilderStageToDestinationKey(stageKey: string): EnrollmentStatusDestinationKey | null {
    const s = stageKey.trim();
    if (s === "waitlist") return "waitlist";
    if (s === "enrolled") return "enrolled";
    if (s === "enrolling" || s === "enrollment" || s === "offered_spot" || s === "future_start") {
        return "enrollment";
    }
    if (s === "closed_withdrawn" || s === "withdrawn" || s === "closed_lost" || s === "closed") {
        return "closed_withdrawn";
    }
    if (s === "lead" || s === "new_lead" || s === "contacting") return "lead";
    if (s === "qualification") return "qualification";
    if (s === "tour" || s === "tour_scheduled" || s === "tour_completed" || s === "decision_pending" || s === "decision") {
        return "tour";
    }
    return null;
}

function mapDispositionToDestinationKey(dispositionKey: string): EnrollmentStatusDestinationKey | null {
    const d = dispositionKey.trim();
    if (d === "waitlisted" || d === "waitlist_paused" || d === "offer_pending") return "waitlist";
    if (d === "enrolled") return "enrolled";
    if (d === "enrolling" || d === "registration_pending" || d === "start_date_scheduled") return "enrollment";
    if (
        d === "family_withdrew" ||
        d === "withdrawn" ||
        d === "not_moving_forward" ||
        d === "not_enrolling" ||
        d === "aged_out"
    ) {
        return "closed_withdrawn";
    }
    if (d === "new_inquiry") return "lead";
    if (d === "qualified") return "qualification";
    if (d === "tour_scheduled" || d === "tour_completed") return "tour";
    return null;
}

function targetStatusFromRuleTargets(
    targets: StageOutcomeRuleTargetV1[],
    grain: EnrollmentStatusTransitionGrain,
): { destinationKey: EnrollmentStatusDestinationKey | null; statusKey: string | null; builderStageKey: string | null } {
    let disposition: string | null = null;
    let caseStatus: string | null = null;
    let builderStage: string | null = null;

    for (const t of targets) {
        if (t.kind === "update_child_enrollment_status" && t.disposition_key) {
            disposition = t.disposition_key.trim();
        }
        if (t.kind === "update_family_case_status" && t.status_key) {
            caseStatus = t.status_key.trim();
        }
        if (t.kind === "move_to_stage" && t.stage_key) {
            builderStage = t.stage_key.trim();
        }
    }

    if (grain !== "case") {
        if (builderStage) {
            const stageDest = mapBuilderStageToDestinationKey(builderStage);
            if (stageDest) {
                return {
                    destinationKey: stageDest,
                    statusKey: disposition ?? resolveEnrollmentStatusTargetKey(stageDest, grain),
                    builderStageKey: builderStage,
                };
            }
        }
        if (disposition) {
            return {
                destinationKey: mapDispositionToDestinationKey(disposition),
                statusKey: disposition,
                builderStageKey: builderStage,
            };
        }
    }
    if (caseStatus && grain === "case") {
        const dest = mapDispositionToDestinationKey(caseStatus) ?? mapBuilderStageToDestinationKey(caseStatus);
        return { destinationKey: dest, statusKey: caseStatus, builderStageKey: builderStage };
    }
    if (builderStage) {
        return {
            destinationKey: mapBuilderStageToDestinationKey(builderStage),
            statusKey: null,
            builderStageKey: builderStage,
        };
    }
    return { destinationKey: null, statusKey: null, builderStageKey: null };
}

function destinationsFromOperatingPlan(
    plan: StageOperatingPlanV1,
    grain: EnrollmentStatusTransitionGrain,
    currentStatusKey: string | null,
): BpResolvedEnrollmentDestination[] {
    const current = currentStatusKey?.trim() ?? "";
    const out: BpResolvedEnrollmentDestination[] = [];
    const seen = new Set<string>();

    for (const outcome of plan.outcomes) {
        const rules = outcomeRulesForKey(plan, outcome.outcome_key);
        for (const rule of rules) {
            const mapped = targetStatusFromRuleTargets(rule.targets, grain);
            if (!mapped.destinationKey) continue;

            const defaultStatusKey =
                mapped.statusKey ??
                (mapped.builderStageKey
                    ? resolveEnrollmentStatusTargetKey(mapped.destinationKey, grain)
                    : resolveEnrollmentStatusTargetKey(mapped.destinationKey, grain));

            if (!defaultStatusKey || defaultStatusKey === current) continue;

            const dedupeKey = `${mapped.destinationKey}:${defaultStatusKey}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            out.push({
                destinationKey: mapped.destinationKey,
                label: outcome.label.trim() || enrollmentStatusDestinationLabel(mapped.destinationKey),
                defaultStatusKey,
                entityType: grain === "case" ? "opportunities" : "opportunity_customer_members",
                outcomeKey: outcome.outcome_key,
                builderStageKey: mapped.builderStageKey ?? undefined,
                bpSource: "stage_outcome",
                ruleKey: rule.rule_key,
                requiresTourBypass: false,
            });
        }
    }

    return out;
}

function splitRuleDestinations(
    process: LifecycleBuilderProcessRecord,
    currentBuilderStageKey: string,
    grain: EnrollmentStatusTransitionGrain,
    currentStatusKey: string | null,
): BpResolvedEnrollmentDestination[] {
    const tracks = process.tracks_v1;
    if (!tracks?.split_rules?.length) return [];

    const current = currentStatusKey?.trim() ?? "";
    const out: BpResolvedEnrollmentDestination[] = [];

    for (const rule of tracks.split_rules) {
        const fromStage = trimOrNull(rule.from_stage_key);
        if (!fromStage || fromStage !== currentBuilderStageKey) continue;

        for (const outcome of rule.per_subject_outcomes ?? []) {
            const targetStage = trimOrNull(outcome.target_stage_key);
            if (!targetStage) continue;

            const destinationKey = mapBuilderStageToDestinationKey(targetStage);
            if (!destinationKey) continue;

            const defaultStatusKey = resolveEnrollmentStatusTargetKey(destinationKey, grain);
            if (defaultStatusKey === current) continue;

            out.push({
                destinationKey,
                label: outcome.label?.trim() || enrollmentStatusDestinationLabel(destinationKey),
                defaultStatusKey,
                entityType: grain === "case" ? "opportunities" : "opportunity_customer_members",
                outcomeKey: outcome.outcome_key,
                builderStageKey: targetStage,
                bpSource: "split_rule",
                parkingLot: PARKING_LOT_BUILDER_STAGE_KEYS.has(targetStage),
                requiresTourBypass: false,
            });
        }
    }

    return out;
}

function parkingLotWaitlistDestination(
    process: LifecycleBuilderProcessRecord,
    currentBuilderStageKey: string,
    grain: EnrollmentStatusTransitionGrain,
    currentStatusKey: string | null,
    existing: BpResolvedEnrollmentDestination[],
): BpResolvedEnrollmentDestination | null {
    if (TERMINAL_BUILDER_STAGE_KEYS.has(currentBuilderStageKey)) return null;
    if (currentBuilderStageKey === "waitlist") return null;

    const hasWaitlistStage = process.stages.some((s) => s.key === "waitlist" && s.is_active !== false);
    if (!hasWaitlistStage) return null;

    if (existing.some((d) => d.destinationKey === "waitlist")) return null;

    const current = currentStatusKey?.trim() ?? "";
    const defaultStatusKey = resolveEnrollmentStatusTargetKey("waitlist", grain);
    if (defaultStatusKey === current) return null;

    const requiresTourBypass =
        PRE_TOUR_BUILDER_STAGE_KEYS.has(currentBuilderStageKey) &&
        !TOUR_COMPLETE_STATUS_KEYS.has(current);

    return {
        destinationKey: "waitlist",
        label: enrollmentStatusDestinationLabel("waitlist"),
        defaultStatusKey,
        entityType: grain === "case" ? "opportunities" : "opportunity_customer_members",
        builderStageKey: "waitlist",
        bpSource: "parking_lot",
        parkingLot: true,
        requiresTourBypass,
    };
}

function dedupeDestinations(rows: BpResolvedEnrollmentDestination[]): BpResolvedEnrollmentDestination[] {
    const out: BpResolvedEnrollmentDestination[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const key = `${row.destinationKey}:${row.defaultStatusKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

/** Resolve BP-configured destinations for Change Enrollment Status modal. */
export function resolveBpEnrollmentStatusDestinations(
    input: ResolveBpEnrollmentDestinationsInput,
): ResolveBpEnrollmentDestinationsResult {
    const grain = input.grain;
    const departmentMetadata = input.departmentMetadata ?? {};
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const processKey = process?.key ?? null;

    const currentBuilderStageKey = resolveBuilderStageKeyForStatus({
        departmentMetadata,
        statusKey: input.currentStatusKey,
        statusMetadata: input.statusMetadata,
        explicitBuilderStageKey: input.builderStageKey,
    });

    if (!process || process.key !== ENROLLMENT_PROCESS_KEY || !currentBuilderStageKey) {
        const operatorStage = input.currentStatusKey
            ? canonicalOperatorStageForStatusKey(input.currentStatusKey)
            : null;
        return {
            destinations: defaultEnrollmentStatusDestinations({
                grain,
                currentOperatorStage: operatorStage,
                currentStatusKey: input.currentStatusKey,
            }).map((d) => ({ ...d, bpSource: "default" as const })),
            currentBuilderStageKey,
            destinationSource: "default_fallback",
            processKey,
        };
    }

    const { plan } = resolveEffectiveStageOperatingPlan({
        departmentMetadata,
        builderStageKey: currentBuilderStageKey,
    });

    const fromPlan = plan ? destinationsFromOperatingPlan(plan, grain, input.currentStatusKey) : [];
    const fromSplit = splitRuleDestinations(
        process,
        currentBuilderStageKey,
        grain,
        input.currentStatusKey,
    );

    let combined = dedupeDestinations([...fromPlan, ...fromSplit]);

    const parkingLot = parkingLotWaitlistDestination(
        process,
        currentBuilderStageKey,
        grain,
        input.currentStatusKey,
        combined,
    );
    if (parkingLot) combined = [...combined, parkingLot];

    if (!combined.length) {
        const operatorStage = input.currentStatusKey
            ? canonicalOperatorStageForStatusKey(input.currentStatusKey)
            : null;
        return {
            destinations: defaultEnrollmentStatusDestinations({
                grain,
                currentOperatorStage: operatorStage,
                currentStatusKey: input.currentStatusKey,
            }).map((d) => ({ ...d, bpSource: "default" as const })),
            currentBuilderStageKey,
            destinationSource: "default_fallback",
            processKey,
        };
    }

    return {
        destinations: combined,
        currentBuilderStageKey,
        destinationSource: "bp",
        processKey,
    };
}

export function findBpDestinationOption(
    destinations: BpResolvedEnrollmentDestination[],
    destinationKey: EnrollmentStatusDestinationKey,
    targetStatusKey?: string | null,
): BpResolvedEnrollmentDestination | null {
    const key = destinationKey.trim();
    const status = targetStatusKey?.trim();
    return (
        destinations.find(
            (d) =>
                d.destinationKey === key &&
                (!status || d.defaultStatusKey === status),
        ) ??
        destinations.find((d) => d.destinationKey === key) ??
        null
    );
}

export function tourBypassRequiredForDestination(
    destination: BpResolvedEnrollmentDestination | null,
    input: {
        destinationKey: EnrollmentStatusDestinationKey;
        currentCaseStatusKey: string | null;
        currentChildStatusKey: string | null;
    },
): boolean {
    if (destination?.requiresTourBypass != null) return destination.requiresTourBypass;

    if (input.destinationKey !== "waitlist") return false;
    const caseStatus = input.currentCaseStatusKey?.trim() ?? "";
    const childStatus = input.currentChildStatusKey?.trim() ?? "";
    if (TOUR_COMPLETE_STATUS_KEYS.has(caseStatus) || TOUR_COMPLETE_STATUS_KEYS.has(childStatus)) {
        return false;
    }
    const originStage = canonicalOperatorStageForStatusKey(childStatus || caseStatus);
    if (!originStage) return true;
    return originStage === "lead" || originStage === "qualification" || originStage === "tour";
}

export { PARKING_LOT_BUILDER_STAGE_KEYS };
