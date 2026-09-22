/**
 * Executes one ordinary object-level staffing-ratio Save.
 *
 * A composer, exactly like `objectCapacityService` — every write goes through
 * the same `configRuleAuthoringService` entry points the rule console uses, so
 * effective dating, version closure, tier replacement, lineage metadata, audit
 * columns and validation are identical whichever surface the operator came
 * from. What this adds is the decision, and that decision is made by a pure
 * planner testable without a database.
 *
 * Rules authored here carry `authored_via: "object_editor"`, so a later reader
 * can tell a ratio a director set on a classroom from one an administrator
 * composed in the rule console.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    createRatioRule,
    createRatioRuleVersion,
    retireRatioRule,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import type {
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";
import {
    planObjectRatioWrite,
    type ObjectRatioPlan,
    type RatioTierValue,
} from "@/lib/locations/objectRatio";

export const OBJECT_RATIO_PROVENANCE = "object_editor";

export type SetObjectRatioInput = {
    orgId: string;
    roomLocationId: string;
    /** Whole tiers, or an empty list when the operator cleared the ratio. */
    tiers: readonly RatioTierValue[];
    /** The organization's calendar day — never a UTC-derived date. */
    todayYmd: string;
    rules: readonly ChildcareRatioRuleRow[];
    tierRows: readonly ChildcareRatioRuleTierRow[];
    actorUserId?: string | null;
};

export type SetObjectRatioResult = {
    action: ObjectRatioPlan["action"];
    ruleId: string | null;
    closedRuleId: string | null;
};

/** The canonical authoring service's tier shape. */
const toTierInput = (tiers: readonly RatioTierValue[]) =>
    tiers.map((t, i) => ({
        maxChildren: t.maxChildren,
        requiredStaff: t.requiredStaff,
        sortOrder: (i + 1) * 100,
    }));

export async function setObjectRatio(
    supabase: SupabaseClient,
    input: SetObjectRatioInput
): Promise<SetObjectRatioResult> {
    const plan = planObjectRatioWrite({
        rules: input.rules,
        tierRows: input.tierRows,
        roomLocationId: input.roomLocationId,
        tiers: input.tiers,
        todayYmd: input.todayYmd,
    });

    const metadata = { authored_via: OBJECT_RATIO_PROVENANCE };

    switch (plan.action) {
        case "noop":
            return { action: "noop", ruleId: null, closedRuleId: null };

        case "create": {
            const { rule } = await createRatioRule(supabase, {
                orgId: input.orgId,
                scopeType: "room",
                roomLocationId: input.roomLocationId,
                tiers: toTierInput(plan.tiers),
                effectiveStart: plan.effectiveStart,
                metadata,
                actorUserId: input.actorUserId,
            });
            return { action: "create", ruleId: rule.id, closedRuleId: null };
        }

        case "version": {
            const result = await createRatioRuleVersion(supabase, {
                orgId: input.orgId,
                priorId: plan.priorId,
                effectiveStart: plan.effectiveStart,
                tiers: toTierInput(plan.tiers),
                actorUserId: input.actorUserId,
            });
            return { action: "version", ruleId: result.row.id, closedRuleId: result.priorId };
        }

        case "replace_same_day": {
            // Retire first: a failed create then leaves the space with the ratio
            // it already had, closed today — a state the operator can see and
            // redo. Creating first would leave two open rules for one space.
            await retireRatioRule(supabase, {
                orgId: input.orgId,
                id: plan.retireId,
                effectiveEnd: plan.effectiveStart,
                actorUserId: input.actorUserId,
            });
            const { rule } = await createRatioRule(supabase, {
                orgId: input.orgId,
                scopeType: "room",
                roomLocationId: input.roomLocationId,
                tiers: toTierInput(plan.tiers),
                effectiveStart: plan.effectiveStart,
                metadata: { ...metadata, replaced_same_day_rule_id: plan.retireId },
                actorUserId: input.actorUserId,
            });
            return { action: "replace_same_day", ruleId: rule.id, closedRuleId: plan.retireId };
        }

        case "retire": {
            const rule = await retireRatioRule(supabase, {
                orgId: input.orgId,
                id: plan.id,
                effectiveEnd: plan.effectiveEnd,
                actorUserId: input.actorUserId,
            });
            return { action: "retire", ruleId: rule.id, closedRuleId: plan.id };
        }
    }
}
