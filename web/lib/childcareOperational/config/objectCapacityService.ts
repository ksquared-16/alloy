/**
 * Executes one ordinary object-level capacity Save.
 *
 * This is a composer, not a second capacity authority. Every write below goes
 * through the same `configRuleAuthoringService` entry points that Operational
 * Rules uses, so effective dating, version closure, lineage metadata, audit
 * columns and the change emission are identical whichever surface the operator
 * came from. What this module adds is the decision — which of those operations
 * one typed number means — and that decision is made by a pure planner that can
 * be tested without a database.
 *
 * Provenance: every rule authored here is marked `authored_via: "object_editor"`
 * so a later reader can tell a number a director typed on a classroom from one
 * an administrator composed in the rule console. The two are the same kind of
 * fact; they are not the same kind of act.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    createCapacityRule,
    createCapacityRuleVersion,
    retireCapacityRule,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import type { ChildcareCapacityRuleRow } from "@/lib/childcareOperational/config/configRuleTypes";
import {
    planOrdinaryCapacityWrite,
    type OrdinaryCapacityPlan,
} from "@/lib/locations/objectCapacity";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";

export const OBJECT_CAPACITY_PROVENANCE = "object_editor";

export type SetObjectCapacityInput = {
    orgId: string;
    roomLocationId: string;
    role: CanonicalUnitRole | null;
    /** Whole seats, or null when the operator cleared the field. */
    capacity: number | null;
    /** The organization's calendar day — never a UTC-derived date. */
    todayYmd: string;
    /** Every capacity rule in the org; the planner narrows to this object. */
    rules: readonly ChildcareCapacityRuleRow[];
    actorUserId?: string | null;
};

export type SetObjectCapacityResult = {
    /** What the plan decided, for the caller to report honestly. */
    action: OrdinaryCapacityPlan["action"];
    rule: ChildcareCapacityRuleRow | null;
    /** The rule this Save closed, when it closed one. */
    closedRuleId: string | null;
};

export async function setObjectCapacity(
    supabase: SupabaseClient,
    input: SetObjectCapacityInput
): Promise<SetObjectCapacityResult> {
    const plan = planOrdinaryCapacityWrite({
        rules: input.rules,
        roomLocationId: input.roomLocationId,
        role: input.role,
        capacity: input.capacity,
        todayYmd: input.todayYmd,
    });

    const metadata = { authored_via: OBJECT_CAPACITY_PROVENANCE };

    switch (plan.action) {
        case "noop":
            return { action: "noop", rule: null, closedRuleId: null };

        case "create": {
            const rule = await createCapacityRule(supabase, {
                orgId: input.orgId,
                scopeType: "room",
                roomLocationId: input.roomLocationId,
                capacityKind: plan.kind,
                capacity: plan.capacity,
                effectiveStart: plan.effectiveStart,
                metadata,
                actorUserId: input.actorUserId,
            });
            return { action: "create", rule, closedRuleId: null };
        }

        case "version": {
            const result = await createCapacityRuleVersion(supabase, {
                orgId: input.orgId,
                priorId: plan.priorId,
                effectiveStart: plan.effectiveStart,
                capacity: plan.capacity,
                capacityKind: plan.kind,
                actorUserId: input.actorUserId,
            });
            return { action: "version", rule: result.row, closedRuleId: result.priorId };
        }

        case "replace_same_day": {
            // Retire first. If the create then fails the room is left with the
            // value it already had, closed today — a recoverable state the
            // operator can see. Creating first would leave two open rules of one
            // kind if the retire failed, which the resolver would have to break
            // a tie over.
            await retireCapacityRule(supabase, {
                orgId: input.orgId,
                id: plan.retireId,
                effectiveEnd: plan.effectiveStart,
                actorUserId: input.actorUserId,
            });
            const rule = await createCapacityRule(supabase, {
                orgId: input.orgId,
                scopeType: "room",
                roomLocationId: input.roomLocationId,
                capacityKind: plan.kind,
                capacity: plan.capacity,
                effectiveStart: plan.effectiveStart,
                metadata: { ...metadata, replaced_same_day_rule_id: plan.retireId },
                actorUserId: input.actorUserId,
            });
            return { action: "replace_same_day", rule, closedRuleId: plan.retireId };
        }

        case "retire": {
            const rule = await retireCapacityRule(supabase, {
                orgId: input.orgId,
                id: plan.id,
                effectiveEnd: plan.effectiveEnd,
                actorUserId: input.actorUserId,
            });
            return { action: "retire", rule, closedRuleId: plan.id };
        }
    }
}
