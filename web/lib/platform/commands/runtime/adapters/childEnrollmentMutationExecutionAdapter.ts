/**
 * Child Enrollment Mutation Runtime adapter (P2.S2).
 *
 * Delegates exactly once to `executeMutation` for status-key commands — never calls the enrollment
 * domain handler, RPCs, or OCM columns directly from this file. Domain derives from capability/
 * registry truth.
 *
 * `waitlist_child` converges onto the Outcome Runtime path (disposition + stage + work
 * reconciliation) so it does not double-write status/stage beside outcome rules.
 *
 * Target-state strategies (from domain readiness keys + semantic command meaning):
 * - update_child_enrollment_status → supplied target_state / status_key
 * - waitlist_child → fixed "waitlisted" via outcome progression (not Mutation Runtime commit)
 * - enroll_child → fixed "enrolled" (client conflict ignored)
 *
 * Subject grain: opportunity_customer_member (OCM id). Not child person id.
 */

import { resolveDomainForCommand } from "@/lib/mutations/domainRegistry";
import { executeMutation } from "@/lib/mutations/runtime";
import type {
    DecisionIntent,
    MutationOrigin,
    MutationResult,
} from "@/lib/mutations/types";
import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import type {
    CommandExecutionSubject,
    InvocationDelegationGuard,
} from "@/lib/platform/commands/runtime/commandExecutionTypes";
import { isChildEnrollmentMutationFacadeSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { isDestructiveOrReplacementCapability } from "@/lib/platform/commands/runtime/destructive";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { CommandSnapshot } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyChildWaitlistViaOutcomeRuntime,
    resolveChildWaitlistSubjectFromOcm,
} from "@/lib/lifecycle/applyChildWaitlistViaOutcomeRuntime";
import { resolveEligibleEnrollmentChildrenForOpportunity } from "@/lib/lifecycle/resolveEligibleEnrollmentChildrenForOpportunity";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";

/** Canonical waitlist outcome — matches enrollment readiness rules / status defs. */
export const CHILD_ENROLLMENT_WAITLIST_TARGET_STATE = "waitlisted" as const;
/** Canonical enrolled outcome — matches enrollment readiness rules / status defs. */
export const CHILD_ENROLLMENT_ENROLLED_TARGET_STATE = "enrolled" as const;

export type ChildEnrollmentMutationExecutionDeps = {
    executeMutation?: typeof executeMutation;
};

export type ChildEnrollmentMutationExecutionInput = {
    snapshot: CommandSnapshot;
    capability: PlatformCapabilityDefinition;
    commandKey: string;
    invocation: CommandInvocationRequest;
    executionSubject: CommandExecutionSubject;
    mode: "preview" | "execute";
    overrideReason?: string;
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
    guard: InvocationDelegationGuard;
    deps?: ChildEnrollmentMutationExecutionDeps;
};

export type ChildEnrollmentMutationExecutionOutput = {
    mutationResult: MutationResult;
    delegated: true;
    domainKey: "enrollment_status";
    decisionIntent: DecisionIntent;
    targetStateStrategy: "supplied" | "fixed_waitlist" | "fixed_enrolled";
};

function mapOrigin(origin: CommandInvocationRequest["origin"]): MutationOrigin {
    if (origin === "bos" || origin === "operator") return "operator";
    if (origin === "automation") return "automation";
    if (origin === "api") return "api";
    return "system";
}

function readSuppliedTargetState(inputValues: Record<string, unknown> | undefined): string {
    if (!inputValues) return "";
    for (const c of [
        inputValues.target_state,
        inputValues.status_key,
        inputValues.targetState,
        inputValues.statusKey,
    ]) {
        if (typeof c === "string" && c.trim()) return c.trim();
    }
    return "";
}

/**
 * Resolve target state for Child Enrollment facade commands.
 * Fixed semantic commands ignore conflicting client target_state.
 */
export function resolveChildEnrollmentTargetState(input: {
    commandKey: string;
    inputValues?: Record<string, unknown>;
}): { targetState: string; strategy: ChildEnrollmentMutationExecutionOutput["targetStateStrategy"] } | { error: string } {
    const key = input.commandKey.trim();
    if (key === "waitlist_child") {
        return {
            targetState: CHILD_ENROLLMENT_WAITLIST_TARGET_STATE,
            strategy: "fixed_waitlist",
        };
    }
    if (key === "enroll_child") {
        return {
            targetState: CHILD_ENROLLMENT_ENROLLED_TARGET_STATE,
            strategy: "fixed_enrolled",
        };
    }
    if (key === "update_child_enrollment_status") {
        const supplied = readSuppliedTargetState(input.inputValues);
        if (!supplied) {
            return { error: "target_state is required." };
        }
        return { targetState: supplied, strategy: "supplied" };
    }
    return { error: `Unsupported Child Enrollment command "${key}".` };
}

export function isOpportunityCustomerMemberSubjectType(entityType: string): boolean {
    const t = entityType.trim().toLowerCase();
    return (
        t === "opportunity_customer_member" ||
        t === "opportunity_customer_members" ||
        t === "ocm"
    );
}

export function isOpportunityFamilySubjectType(entityType: string): boolean {
    const t = entityType.trim().toLowerCase();
    return t === "opportunity" || t === "opportunities" || t === "case";
}

/**
 * Family Focus Panel posts opportunity as the subject. For waitlist_child, resolve the
 * related OCM: exactly one → auto; zero/many → fail closed (never invent / never pick first).
 */
export async function resolveWaitlistChildExecutionSubject(input: {
    supabase: SupabaseClient;
    orgId: string;
    executionSubject: CommandExecutionSubject;
    inputValues?: Record<string, unknown>;
}): Promise<
    | { ok: true; executionSubject: CommandExecutionSubject }
    | { ok: false; code: "needs_subject" | "no_eligible_child"; message: string }
> {
    if (isOpportunityCustomerMemberSubjectType(input.executionSubject.entityType)) {
        return { ok: true, executionSubject: input.executionSubject };
    }

    const fromPayload = resolveChildEnrollmentSubjectId({
        executionSubject: { entityType: "opportunity_customer_member", entityId: "" },
        inputValues: input.inputValues,
    });
    if (fromPayload) {
        return {
            ok: true,
            executionSubject: {
                entityType: "opportunity_customer_member",
                entityId: fromPayload,
            },
        };
    }

    if (!isOpportunityFamilySubjectType(input.executionSubject.entityType)) {
        return {
            ok: false,
            code: "needs_subject",
            message: `Child Enrollment requires a child participation subject (got "${input.executionSubject.entityType}").`,
        };
    }

    const classified = await resolveEligibleEnrollmentChildrenForOpportunity({
        supabase: input.supabase,
        orgId: input.orgId,
        opportunityId: input.executionSubject.entityId,
    });

    if (classified.status === "single") {
        return {
            ok: true,
            executionSubject: {
                entityType: "opportunity_customer_member",
                entityId: classified.subject.id,
            },
        };
    }

    if (classified.status === "multiple") {
        return { ok: false, code: "needs_subject", message: classified.message };
    }

    return { ok: false, code: "no_eligible_child", message: classified.message };
}

/**
 * Build DecisionIntent for Child Enrollment — domain from registry, not client.
 */
export function buildChildEnrollmentDecisionIntent(input: {
    commandKey: string;
    subjectId: string;
    subjectType: string;
    targetState: string;
    contextPayload?: Record<string, unknown>;
    operatorId?: string | null;
    origin: CommandInvocationRequest["origin"];
    overrideReason?: string;
}): DecisionIntent {
    const domain = resolveDomainForCommand(input.commandKey);
    if (!domain || domain.key !== "enrollment_status") {
        throw new Error(
            `[commandRuntime] Child Enrollment adapter refused non-enrollment_status domain for "${input.commandKey}"`
        );
    }
    return {
        commandKey: input.commandKey,
        subjectId: input.subjectId,
        subjectType: input.subjectType.trim() || domain.subjectType,
        domain: domain.key,
        targetState: input.targetState,
        contextPayload: input.contextPayload,
        operatorId: input.operatorId ?? undefined,
        origin: mapOrigin(input.origin),
        overrideReason: input.overrideReason,
    };
}

/**
 * Resolve OCM subject id from route subject. Does not invent child→OCM resolution.
 */
export function resolveChildEnrollmentSubjectId(input: {
    executionSubject: CommandExecutionSubject;
    inputValues?: Record<string, unknown>;
}): string {
    const fromEntity = input.executionSubject.entityId.trim();
    if (fromEntity) return fromEntity;
    const payload = input.inputValues ?? {};
    for (const key of ["enrollment_id", "opportunity_customer_member_id", "ocm_id"]) {
        const v = payload[key];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}

export async function executeChildEnrollmentMutationViaAdapter(
    input: ChildEnrollmentMutationExecutionInput
): Promise<ChildEnrollmentMutationExecutionOutput> {
    if (input.snapshot.executionDestination.owner !== "mutation_runtime") {
        throw new Error(
            "[commandRuntime] Child Enrollment adapter refused non-mutation_runtime destination"
        );
    }
    if (input.capability.executionOwner !== "mutation_runtime") {
        throw new Error(
            "[commandRuntime] Child Enrollment adapter refused capability owner mismatch"
        );
    }
    if (!isChildEnrollmentMutationFacadeSupported(input.capability.canonicalCommandKey)) {
        throw new Error(
            `[commandRuntime] Child Enrollment adapter refused unsupported key "${input.commandKey}"`
        );
    }
    if (isDestructiveOrReplacementCapability(input.capability.canonicalCommandKey)) {
        throw new Error(
            "[commandRuntime] Child Enrollment adapter refused destructive/replacement capability"
        );
    }

    const canonical = input.capability.canonicalCommandKey;
    if (
        canonical !== "update_child_enrollment_status" &&
        canonical !== "waitlist_child" &&
        canonical !== "enroll_child"
    ) {
        throw new Error(
            `[commandRuntime] Child Enrollment adapter refused canonical "${canonical}"`
        );
    }

    let executionSubject = input.executionSubject;
    if (canonical === "waitlist_child") {
        const remapped = await resolveWaitlistChildExecutionSubject({
            supabase: input.supabase,
            orgId: input.orgId,
            executionSubject: input.executionSubject,
            inputValues: input.invocation.inputValues,
        });
        if (!remapped.ok) {
            throw new Error(`[commandRuntime] ${remapped.message}`);
        }
        executionSubject = remapped.executionSubject;
    } else if (!isOpportunityCustomerMemberSubjectType(executionSubject.entityType)) {
        throw new Error(
            `[commandRuntime] Child Enrollment adapter requires opportunity_customer_member subject (got "${executionSubject.entityType}")`
        );
    }

    const targetResolved = resolveChildEnrollmentTargetState({
        commandKey: canonical,
        inputValues: input.invocation.inputValues,
    });
    if ("error" in targetResolved) {
        throw new Error(`[commandRuntime] ${targetResolved.error}`);
    }

    const subjectId = resolveChildEnrollmentSubjectId({
        executionSubject,
        inputValues: input.invocation.inputValues,
    });
    if (!subjectId) {
        throw new Error("[commandRuntime] Child Enrollment adapter requires subject id");
    }

    input.guard.markDelegated();

    const intent = buildChildEnrollmentDecisionIntent({
        commandKey: canonical,
        subjectId,
        subjectType: "opportunity_customer_member",
        targetState: targetResolved.targetState,
        contextPayload: input.invocation.inputValues,
        operatorId: input.userId,
        origin: input.invocation.origin,
        overrideReason: input.overrideReason,
    });

    // waitlist_child → Outcome Runtime (disposition + stage + work). Avoids double-writing
    // OCM status via Mutation Runtime while outcomes also own stage movement.
    if (canonical === "waitlist_child") {
        if (input.mode === "preview") {
            const previewResult: MutationResult = {
                status: "previewed",
                preview: {
                    commandKey: canonical,
                    domain: "enrollment_status",
                    subjectId,
                    subjectType: "opportunity_customer_member",
                    previousState: "",
                    targetState: CHILD_ENROLLMENT_WAITLIST_TARGET_STATE,
                    warnings: [],
                    readinessGaps: [],
                    sideEffects: [
                        {
                            kind: "automation",
                            description: "Move child to Waitlist via outcome progression (status + stage)",
                        },
                    ],
                },
            };
            return {
                mutationResult: previewResult,
                delegated: true,
                domainKey: "enrollment_status",
                decisionIntent: intent,
                targetStateStrategy: targetResolved.strategy,
            };
        }

        const resolved = await resolveChildWaitlistSubjectFromOcm({
            supabase: input.supabase,
            orgId: input.orgId,
            opportunityCustomerMemberId: subjectId,
        });
        if ("error" in resolved) {
            throw new Error(`[commandRuntime] ${resolved.error}`);
        }

        let departmentId = input.departmentId?.trim() || null;
        if (!departmentId) {
            departmentId = await resolveEnrollmentDepartmentForOpportunity({
                supabase: input.supabase,
                orgId: input.orgId,
                opportunityId: resolved.opportunity_id,
            });
        }
        if (!departmentId) {
            throw new Error("[commandRuntime] Waitlist progression requires enrollment department");
        }

        const progression = await applyChildWaitlistViaOutcomeRuntime({
            supabase: input.supabase,
            orgId: input.orgId,
            userId: input.userId ?? "",
            departmentId,
            opportunityId: resolved.opportunity_id,
            customerMemberId: resolved.customer_member_id,
            opportunityCustomerMemberId: resolved.opportunity_customer_member_id,
        });
        if (!progression.ok) {
            const blocked: MutationResult = {
                status: "blocked",
                commandKey: canonical,
                domain: "enrollment_status",
                subjectId,
                blockedReason: progression.error,
                blockedCode: "waitlist_outcome_progression_failed",
            };
            return {
                mutationResult: blocked,
                delegated: true,
                domainKey: "enrollment_status",
                decisionIntent: intent,
                targetStateStrategy: targetResolved.strategy,
            };
        }

        const committed: MutationResult = {
            status: "committed",
            mutationId: `waitlist-outcome:${resolved.customer_member_id}`,
            commandKey: canonical,
            domain: "enrollment_status",
            subjectId,
            subjectType: "opportunity_customer_member",
            previousState: "",
            newState: CHILD_ENROLLMENT_WAITLIST_TARGET_STATE,
            warnings: progression.degraded
                ? [{ code: "degraded_side_effect", message: progression.degraded, severity: "warn" }]
                : [],
            sideEffects: [
                {
                    kind: "automation",
                    description: "Child Waitlist outcome progression (disposition + stage)",
                },
            ],
            committedAt: new Date().toISOString(),
        };
        return {
            mutationResult: committed,
            delegated: true,
            domainKey: "enrollment_status",
            decisionIntent: intent,
            targetStateStrategy: targetResolved.strategy,
        };
    }

    const run = input.deps?.executeMutation ?? executeMutation;
    const mutationResult = await run(
        {
            supabase: input.supabase,
            orgId: input.orgId,
            departmentId: input.departmentId ?? null,
            workUnitId: input.workUnitId ?? null,
        },
        intent,
        { previewOnly: input.mode === "preview" }
    );

    return {
        mutationResult,
        delegated: true,
        domainKey: "enrollment_status",
        decisionIntent: intent,
        targetStateStrategy: targetResolved.strategy,
    };
}
