/**
 * Enrollment Status domain handler.
 *
 * Canonical field: opportunity_customer_members.outcome_status_key
 * Subject type:    opportunity_customer_member
 *
 * This handler ONLY reads and writes opportunity_customer_members.outcome_status_key.
 * It NEVER writes opportunities.status_key, persons.status_key, or customers.status_key.
 */

import type { DomainHandler } from "@/lib/mutations/domainRegistry";
import type { MutationDomain, EvaluationWarning } from "@/lib/mutations/types";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

/**
 * Enrollment readiness rules — applied during evaluateReadiness before commit.
 *
 * TEMPORARY: these rules are hardcoded for the initial Slice 2 proof.
 * Configuration ownership: these should move to a DB table (e.g. enrollment_readiness_rules
 * or status_transition_requirements) so operators can define which target statuses require
 * which fields. The shape here makes the future migration obvious.
 *
 * Future model:
 *   placement_required_statuses → org-configured set of status_keys
 *   required_fields             → per-status list of OCM field_keys + human labels
 */
type EnrollmentReadinessRule = {
    /** Human-readable label for this rule group, used in error messages */
    label: string;
    /** Status keys that trigger this rule set (exact match against targetState) */
    targetStatusKeys: string[];
    /** OCM fields that must be non-null before transitioning to any of the target statuses */
    requiredFields: Array<{
        field: keyof { start_date: unknown; location_id: unknown };
        missingCode: string;
        missingMessage: string;
    }>;
};

const ENROLLMENT_READINESS_RULES: EnrollmentReadinessRule[] = [
    {
        label: "Placement confirmation",
        // These status keys represent confirmed or near-confirmed placement decisions.
        // A start date and location are prerequisites before marking a child into these states.
        // To add or remove status keys: update this array. This is not yet DB-driven.
        targetStatusKeys: ["enrolled", "approved", "waitlisted"],
        requiredFields: [
            {
                field: "start_date",
                missingCode: "missing_start_date",
                missingMessage: "Desired start date is required before moving to this status.",
            },
            {
                field: "location_id",
                missingCode: "missing_location",
                missingMessage: "A location must be set before moving to this status.",
            },
        ],
    },
];

/** Canonical command key for child enrollment status mutations. Import this instead of using the string literal. */
export const UPDATE_CHILD_ENROLLMENT_STATUS_COMMAND_KEY = "update_child_enrollment_status";
/** Semantic command key for waitlisting a child. Routes to the same enrollment status domain. */
export const WAITLIST_CHILD_COMMAND_KEY = "waitlist_child";
/** Semantic command key for enrolling a child. Routes to the same enrollment status domain. */
export const ENROLL_CHILD_COMMAND_KEY = "enroll_child";

export const ENROLLMENT_STATUS_DOMAIN: MutationDomain = {
    key: "enrollment_status",
    label: "Enrollment Status",
    subjectType: "opportunity_customer_member",
    canonicalField: "opportunity_customer_members.outcome_status_key",
};

export const enrollmentStatusHandler: DomainHandler = {
    domain: ENROLLMENT_STATUS_DOMAIN,
    entityType: "opportunity_customer_members",

    async resolve(ctx, intent) {
        const { data: row, error } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("outcome_status_key, opportunity_id")
            .eq("id", intent.subjectId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();

        if (error || !row) {
            return { error: "Child enrollment record not found" };
        }

        const currentState = String((row as { outcome_status_key?: unknown }).outcome_status_key ?? "").trim();

        const defs = await fetchEffectiveStatusDefinitions(
            ctx.supabase,
            ctx.orgId,
            "opportunity_customer_members",
            { activeOnly: true }
        );
        const availableTargets = defs
            .filter((d) => d.status_key !== currentState)
            .map((d) => String(d.status_key ?? "").trim())
            .filter(Boolean);

        return { currentState, availableTargets };
    },

    async evaluateReadiness(ctx, intent, _resolved) {
        const gaps: EvaluationWarning[] = [];

        // Find the first rule whose targetStatusKeys includes the intended target state
        const matchingRule = ENROLLMENT_READINESS_RULES.find((r) =>
            r.targetStatusKeys.includes(intent.targetState)
        );
        if (!matchingRule) return gaps;

        const fieldNames = matchingRule.requiredFields.map((f) => f.field).join(", ");
        const { data: row } = await ctx.supabase
            .from("opportunity_customer_members")
            .select(fieldNames)
            .eq("id", intent.subjectId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();

        if (!row) return gaps;

        const ocm = row as unknown as Record<string, unknown>;
        for (const requirement of matchingRule.requiredFields) {
            if (!ocm[requirement.field]) {
                gaps.push({
                    code: requirement.missingCode,
                    message: requirement.missingMessage,
                    severity: "warn",
                });
            }
        }

        return gaps;
    },

    async commit(ctx, intent, resolved, warnings) {
        const { data: rpcResult, error: rpcError } = await ctx.supabase.rpc(
            "execute_enrollment_status_mutation",
            {
                p_org_id: ctx.orgId,
                p_ocm_id: intent.subjectId,
                p_new_status_key: intent.targetState,
                p_operator_id: intent.operatorId ?? null,
                p_origin: intent.origin,
                p_context_payload: intent.contextPayload ?? {},
            }
        );

        if (rpcError) {
            const msg = rpcError.message ?? "";
            if (msg.includes("ocm_not_found")) {
                return { status: "blocked", commandKey: intent.commandKey, domain: intent.domain, subjectId: intent.subjectId, blockedReason: "Child enrollment record not found.", blockedCode: "not_found" };
            }
            if (msg.includes("no_state_change")) {
                return { status: "blocked", commandKey: intent.commandKey, domain: intent.domain, subjectId: intent.subjectId, blockedReason: "No state change.", blockedCode: "no_state_change" };
            }
            return { status: "blocked", commandKey: intent.commandKey, domain: intent.domain, subjectId: intent.subjectId, blockedReason: rpcError.message, blockedCode: "commit_error" };
        }

        const rpc = rpcResult as { ok?: boolean; mutation_id?: string; previous_state?: string; new_state?: string } | null;
        if (!rpc?.ok) {
            return { status: "blocked", commandKey: intent.commandKey, domain: intent.domain, subjectId: intent.subjectId, blockedReason: "Commit failed.", blockedCode: "commit_error" };
        }

        return {
            status: "committed",
            mutationId: String(rpc.mutation_id ?? ""),
            commandKey: intent.commandKey,
            domain: intent.domain,
            subjectId: intent.subjectId,
            subjectType: intent.subjectType,
            previousState: resolved.currentState,
            newState: intent.targetState,
            warnings,
            sideEffects: [],
            committedAt: new Date().toISOString(),
        };
    },
};
