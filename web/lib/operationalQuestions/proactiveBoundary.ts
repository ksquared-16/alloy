/**
 * Narrow proactive BOS boundary for Measure-strategy health.
 * Proving slice: contract + helper only — BOS must not poll capacity independently.
 */

import type { OiOrgCalcHealth } from "@/lib/metrics/oiOrgCalcMeasurements";
import { FUTURE_ROOM_CAPACITY_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";

export type MeasurementHealthAttentionEvent = {
    type: "measurement_health_attention";
    question_key: typeof FUTURE_ROOM_CAPACITY_QUESTION_KEY;
    measurement_id: string;
    health: Extract<OiOrgCalcHealth, "below_goal">;
    room_id: string | null;
    room_label: string | null;
    effective_at: string | null;
    value: number | null;
    goal_value: number | null;
    eligible_for_bos_surfacing: true;
};

/** Only below_goal is eligible for proactive BOS surfacing in this slice. */
export function buildMeasurementHealthAttentionEvent(args: {
    measurementId: string;
    health: OiOrgCalcHealth;
    roomId?: string | null;
    roomLabel?: string | null;
    effectiveAt?: string | null;
    value?: number | null;
    goalValue?: number | null;
}): MeasurementHealthAttentionEvent | null {
    if (args.health !== "below_goal") return null;
    return {
        type: "measurement_health_attention",
        question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
        measurement_id: args.measurementId,
        health: "below_goal",
        room_id: args.roomId ?? null,
        room_label: args.roomLabel ?? null,
        effective_at: args.effectiveAt ?? null,
        value: args.value ?? null,
        goal_value: args.goalValue ?? null,
        eligible_for_bos_surfacing: true,
    };
}
