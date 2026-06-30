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

// Status keys that require placement (location + program) before commitment.
const PLACEMENT_REQUIRED_STATUS_KEYS = new Set(["enrolled", "approved", "waitlisted"]);

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

        if (!PLACEMENT_REQUIRED_STATUS_KEYS.has(intent.targetState)) {
            return gaps;
        }

        // Load OCM record to check placement fields
        const { data: row } = await ctx.supabase
            .from("opportunity_customer_members")
            .select("desired_start_date, location_id")
            .eq("id", intent.subjectId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();

        if (!row) return gaps;

        const ocm = row as { desired_start_date?: string | null; location_id?: string | null };

        if (!ocm.desired_start_date) {
            gaps.push({
                code: "missing_desired_start_date",
                message: "Desired start date is required before moving to this status.",
                severity: "warn",
            });
        }
        if (!ocm.location_id) {
            gaps.push({
                code: "missing_location",
                message: "A location must be set before moving to this status.",
                severity: "warn",
            });
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
