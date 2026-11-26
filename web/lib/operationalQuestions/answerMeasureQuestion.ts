/**
 * Generic Measure-strategy answer for question_key-bound org-calc measurements.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildFutureRoomCapacityActions,
    buildRoomUtilizationActions,
} from "@/lib/operationalQuestions/actions";
import type {
    AnswerOperationalQuestionContext,
    OperationalAnswer,
    OperationalQuestionDefinition,
    OperationalQuestionKey,
} from "@/lib/operationalQuestions/types";
import {
    evaluateOiOrgCalcHealth,
    parseOiOrgCalcHistory,
    parseOiOrgCalcMeasurements,
    type OiOrgCalcMeasurement,
} from "@/lib/metrics/oiOrgCalcMeasurements";
import {
    formatOiOrgCalcTargetLabel,
    oiOrgCalcTargetForCountMin,
    oiOrgCalcTargetForRateRange,
} from "@/lib/metrics/oiOrgCalcTargetFormat";
import { loadOrgMetadata, observeOiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcObserve";

export function findMeasurementByQuestionKey(
    measurements: OiOrgCalcMeasurement[],
    questionKey: OperationalQuestionKey,
): OiOrgCalcMeasurement | null {
    return measurements.find((m) => m.status === "active" && m.question_key === questionKey) ?? null;
}

function healthLabel(
    h: ReturnType<typeof evaluateOiOrgCalcHealth>,
): NonNullable<OperationalAnswer["health"]> {
    if (h === "on_goal") return "on_goal";
    if (h === "below_goal") return "below_goal";
    if (h === "above_goal") return "above_goal";
    if (h === "no_target") return "no_goal";
    return "not_available";
}

function goalFromMeasurement(
    measurement: OiOrgCalcMeasurement,
): OperationalAnswer["goal"] {
    const range = oiOrgCalcTargetForRateRange(measurement.target);
    if (range) {
        return {
            kind: "rate_range",
            min: range.min,
            max: range.max,
            label: formatOiOrgCalcTargetLabel(range, "percent"),
        };
    }
    const min = oiOrgCalcTargetForCountMin(measurement.target);
    if (min) {
        return {
            kind: "count_min",
            value: min.value,
            label: formatOiOrgCalcTargetLabel(min, measurement.unit === "children" ? "seats" : measurement.unit),
        };
    }
    return null;
}

export async function answerMeasureQuestionByKey(
    supabase: SupabaseClient,
    question: OperationalQuestionDefinition,
    ctx: AnswerOperationalQuestionContext,
): Promise<OperationalAnswer> {
    const metadata = await loadOrgMetadata(supabase, ctx.orgId);
    const measurements = parseOiOrgCalcMeasurements(metadata);
    const measurement = findMeasurementByQuestionKey(measurements, question.key);

    const buildActions = (status: OperationalAnswer["status"], measurementId: string | null) => {
        if (question.key === "future_room_capacity") {
            return buildFutureRoomCapacityActions({
                question,
                status,
                measurementId,
                roomId: ctx.roomId ?? null,
            });
        }
        return buildRoomUtilizationActions({
            question,
            status,
            measurementId,
            roomId: ctx.roomId ?? null,
        });
    };

    if (!measurement) {
        const base = {
            question_key: question.key,
            question_title: question.title,
            strategy: question.answer_strategy,
            status: "configuration_required" as const,
            value: null,
            unit: null,
            subject: { room_id: ctx.roomId ?? null, room_label: ctx.roomLabel ?? null },
            effective_date: ctx.effectiveAt ?? null,
            answered_at: null,
            availability: "unknown" as const,
            availability_reason: `${question.title} is not being measured yet.`,
            goal: null,
            health: null,
            source_summary: null,
            version_summary: null,
            explanation_summary: [],
            history_available: false,
            measurement_id: null,
        };
        return {
            ...base,
            actions: buildActions("configuration_required", null),
            presentation_lines: [
                `${question.title} is not being measured yet.`,
                "I can help set it up using the shared Operational Intelligence configure path.",
            ],
        };
    }

    const roomId = ctx.roomId?.trim() ?? "";
    const effectiveAt = ctx.effectiveAt?.trim() ?? "";
    if (!roomId || !effectiveAt) {
        const base = {
            question_key: question.key,
            question_title: question.title,
            strategy: question.answer_strategy,
            status: "invalid_context" as const,
            value: null,
            unit: question.unit,
            subject: { room_id: roomId || null, room_label: ctx.roomLabel ?? null },
            effective_date: effectiveAt || null,
            answered_at: null,
            availability: "unknown" as const,
            availability_reason: !roomId ? "Choose a room." : "Choose a date.",
            goal: goalFromMeasurement(measurement),
            health: null,
            source_summary: measurement.description ?? measurement.source.calculation_name,
            version_summary: `Version ${measurement.source.version_number}`,
            explanation_summary: [],
            history_available: parseOiOrgCalcHistory(metadata, measurement.id).length > 0,
            measurement_id: measurement.id,
        };
        return {
            ...base,
            actions: buildActions("invalid_context", measurement.id),
            presentation_lines: [base.availability_reason],
        };
    }

    const result = await observeOiOrgCalcMeasurement(supabase, {
        orgId: ctx.orgId,
        measurementId: measurement.id,
        roomId,
        roomLabel: ctx.roomLabel ?? null,
        effectiveAt,
        persistHistory: ctx.persistHistory !== false,
    });

    const available = result.observation.availability === "resolved" && result.observation.value != null;
    const history = parseOiOrgCalcHistory(await loadOrgMetadata(supabase, ctx.orgId), measurement.id);
    const unitLabel =
        question.unit === "percent" ? "%"
        : question.unit === "children" ? " equivalent children"
        : " seats";

    const base = {
        question_key: question.key,
        question_title: question.title,
        strategy: question.answer_strategy,
        status: (available ? "answered" : "not_available") as OperationalAnswer["status"],
        value: available ? result.observation.value : null,
        unit: question.unit,
        subject: {
            room_id: roomId,
            room_label: result.observation.room_label ?? ctx.roomLabel ?? null,
        },
        effective_date: effectiveAt,
        answered_at: result.observation.evaluated_at,
        availability: (available ? "available" : "not_available") as OperationalAnswer["availability"],
        availability_reason: available ? null : (result.observation.unavailable_reason ?? "Not available"),
        goal: goalFromMeasurement(measurement),
        health: healthLabel(result.health),
        source_summary: measurement.description ?? measurement.source.calculation_name,
        version_summary: `Version ${measurement.source.version_number}`,
        explanation_summary: result.observation.explanation_summary ?? [],
        history_available: history.length > 0,
        measurement_id: measurement.id,
    };

    const presentation_lines =
        available && base.value != null ?
            [
                `${base.subject.room_label ?? "This room"}: ${
                    question.unit === "percent" ?
                        `${Math.round(base.value * 10) / 10}%`
                    :   `${base.value}${unitLabel}`
                } on ${effectiveAt}.`,
            ]
        :   [base.availability_reason ?? "Not available."];

    return {
        ...base,
        actions: buildActions(base.status, measurement.id),
        presentation_lines,
    };
}
