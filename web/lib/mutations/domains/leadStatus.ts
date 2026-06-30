/**
 * Lead Status domain handler.
 *
 * Canonical field: opportunities.status_key
 * Subject type:    opportunity
 *
 * This handler ONLY reads and writes opportunities.status_key.
 * It never touches opportunity_customer_members, persons, or customers.
 */

import type { DomainHandler } from "@/lib/mutations/domainRegistry";
import type { MutationDomain } from "@/lib/mutations/types";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";

export const LEAD_STATUS_DOMAIN: MutationDomain = {
    key: "lead_status",
    label: "Lead Status",
    subjectType: "opportunity",
    canonicalField: "opportunities.status_key",
};

export const leadStatusHandler: DomainHandler = {
    domain: LEAD_STATUS_DOMAIN,
    entityType: "opportunities",

    async resolve(ctx, intent) {
        const { data: row, error } = await ctx.supabase
            .from("opportunities")
            .select("status_key")
            .eq("id", intent.subjectId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();

        if (error || !row) {
            return { error: "Record not found" };
        }

        const currentState = String((row as { status_key?: unknown }).status_key ?? "").trim();

        const defs = await fetchEffectiveStatusDefinitions(
            ctx.supabase,
            ctx.orgId,
            "opportunities",
            { activeOnly: true }
        );
        const availableTargets = defs
            .filter((d) => d.status_key !== currentState)
            .map((d) => String(d.status_key ?? "").trim())
            .filter(Boolean);

        return { currentState, availableTargets };
    },

    async commit(ctx, intent, resolved, warnings) {
        const { data: rpcResult, error: rpcError } = await ctx.supabase.rpc(
            "execute_lead_status_mutation",
            {
                p_org_id: ctx.orgId,
                p_opportunity_id: intent.subjectId,
                p_new_status_key: intent.targetState,
                p_operator_id: intent.operatorId ?? null,
                p_origin: intent.origin,
                p_context_payload: intent.contextPayload ?? {},
            }
        );

        if (rpcError) {
            const msg = rpcError.message ?? "";
            if (msg.includes("opportunity_not_found")) {
                return { status: "blocked", commandKey: intent.commandKey, domain: intent.domain, subjectId: intent.subjectId, blockedReason: "Record not found.", blockedCode: "not_found" };
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

        // Post-commit: fan-out to existing workflow_events spine (non-fatal).
        try {
            await emitStatusChangedEvent({
                supabase: ctx.supabase,
                orgId: ctx.orgId,
                entityType: "opportunities",
                entityId: intent.subjectId,
                oldStatusKey: resolved.currentState,
                newStatusKey: intent.targetState,
                actorUserId: intent.operatorId,
            });
        } catch (e) {
            console.warn("[leadStatusHandler] emitStatusChangedEvent post-commit failed", e);
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
