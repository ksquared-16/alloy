/**
 * Measure-strategy resolver for Room Utilization.
 * Uses existing oi-org-calc observe — no second evaluator.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRoomUtilizationActions } from "@/lib/operationalQuestions/actions";
import { ROOM_UTILIZATION_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";
import type {
    AnswerOperationalQuestionContext,
    OperationalAnswer,
    OperationalQuestionDefinition,
} from "@/lib/operationalQuestions/types";
import {
    evaluateOiOrgCalcHealth,
    parseOiOrgCalcHistory,
    parseOiOrgCalcMeasurements,
    type OiOrgCalcMeasurement,
} from "@/lib/metrics/oiOrgCalcMeasurements";
import { formatOiOrgCalcTargetLabel, oiOrgCalcTargetForRateRange } from "@/lib/metrics/oiOrgCalcTargetFormat";
import { loadOrgMetadata, observeOiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcObserve";

export function findRoomUtilizationMeasurement(
    measurements: OiOrgCalcMeasurement[],
): OiOrgCalcMeasurement | null {
    const active = measurements.filter((m) => m.status === "active");
    return active.find((m) => m.question_key === ROOM_UTILIZATION_QUESTION_KEY) ?? null;
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

function goalFromMeasurement(measurement: OiOrgCalcMeasurement): OperationalAnswer["goal"] {
    const range = oiOrgCalcTargetForRateRange(measurement.target);
    if (!range) return null;
    return {
        kind: "rate_range",
        min: range.min,
        max: range.max,
        label: formatOiOrgCalcTargetLabel(range, "percent"),
    };
}

function presentationForAnswer(answer: Omit<OperationalAnswer, "presentation_lines" | "actions">): string[] {
    const lines: string[] = [];
    const subject = answer.subject.room_label ?? "This room";
    const date = answer.effective_date ?? "the selected date";

    if (answer.status === "configuration_required") {
        lines.push("Room Utilization is not being measured yet.");
        lines.push("I can help set it up with a healthy utilization range.");
        return lines;
    }
    if (answer.status === "invalid_context") {
        lines.push(answer.availability_reason ?? "I need a room and a date to answer that.");
        return lines;
    }
    if (answer.status === "not_available") {
        lines.push(`Room utilization is not available for ${subject} on ${date}.`);
        if (answer.availability_reason) lines.push(answer.availability_reason);
        lines.push("I can take you to review capacity or enrolled children.");
        return lines;
    }
    if (answer.status === "answered" && answer.value != null) {
        const pct = Math.round(answer.value * 10) / 10;
        lines.push(`${subject} is ${pct}% full on ${date}.`);
        if (answer.goal?.kind === "rate_range") {
            if (answer.health === "on_goal") {
                lines.push(`That is on goal (healthy between ${answer.goal.min}% and ${answer.goal.max}%).`);
            } else if (answer.health === "below_goal") {
                lines.push(`That is below the healthy range (${answer.goal.min}%–${answer.goal.max}%).`);
            } else if (answer.health === "above_goal") {
                lines.push(`That is above the healthy range (${answer.goal.min}%–${answer.goal.max}%).`);
            }
        } else if (answer.health === "no_goal") {
            lines.push("No healthy range is set for this measurement yet.");
        }
        if (answer.source_summary) lines.push(`Calculated using: ${answer.source_summary}.`);
        lines.push("Would you like to review the room, children, or capacity?");
        return lines;
    }
    lines.push("I couldn’t answer that right now.");
    return lines;
}

export async function answerRoomUtilization(
    supabase: SupabaseClient,
    question: OperationalQuestionDefinition,
    ctx: AnswerOperationalQuestionContext,
): Promise<OperationalAnswer> {
    const metadata = await loadOrgMetadata(supabase, ctx.orgId);
    const measurements = parseOiOrgCalcMeasurements(metadata);
    const measurement = findRoomUtilizationMeasurement(measurements);

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
            availability_reason: "Room Utilization is not being measured yet.",
            goal: null,
            health: null,
            source_summary: null,
            version_summary: null,
            explanation_summary: [],
            history_available: false,
            measurement_id: null,
        };
        const actions = buildRoomUtilizationActions({
            question,
            status: "configuration_required",
            measurementId: null,
            roomId: ctx.roomId ?? null,
        });
        return { ...base, actions, presentation_lines: presentationForAnswer(base) };
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
            unit: "percent" as const,
            subject: { room_id: roomId || null, room_label: ctx.roomLabel ?? null },
            effective_date: effectiveAt || null,
            answered_at: null,
            availability: "unknown" as const,
            availability_reason: !roomId
                ? "Choose a room to check utilization."
                : "Choose a date to check utilization.",
            goal: goalFromMeasurement(measurement),
            health: null,
            source_summary: "Active enrolled children ÷ effective capacity × 100",
            version_summary: `Version ${measurement.source.version_number}`,
            explanation_summary: [],
            history_available: parseOiOrgCalcHistory(metadata, measurement.id).length > 0,
            measurement_id: measurement.id,
        };
        const actions = buildRoomUtilizationActions({
            question,
            status: "invalid_context",
            measurementId: measurement.id,
            roomId: roomId || null,
        });
        return { ...base, actions, presentation_lines: presentationForAnswer(base) };
    }

    const result = await observeOiOrgCalcMeasurement(supabase, {
        orgId: ctx.orgId,
        measurementId: measurement.id,
        roomId,
        roomLabel: ctx.roomLabel ?? null,
        effectiveAt,
        persistHistory: ctx.persistHistory !== false,
    });

    const health = healthLabel(result.health);
    const available = result.observation.availability === "resolved" && result.observation.value != null;
    const history = parseOiOrgCalcHistory(await loadOrgMetadata(supabase, ctx.orgId), measurement.id);

    const base = {
        question_key: question.key,
        question_title: question.title,
        strategy: question.answer_strategy,
        status: (available ? "answered" : "not_available") as OperationalAnswer["status"],
        value: available ? result.observation.value : null,
        unit: "percent" as const,
        subject: {
            room_id: roomId,
            room_label: result.observation.room_label ?? ctx.roomLabel ?? null,
        },
        effective_date: effectiveAt,
        answered_at: result.observation.evaluated_at,
        availability: (available ? "available" : "not_available") as OperationalAnswer["availability"],
        availability_reason: available ? null : (result.observation.unavailable_reason ?? "Not available"),
        goal: goalFromMeasurement(measurement),
        health,
        source_summary: "Active enrolled children ÷ effective capacity × 100",
        version_summary: `Version ${measurement.source.version_number}`,
        explanation_summary: result.observation.explanation_summary ?? [],
        history_available: history.length > 0,
        measurement_id: measurement.id,
    };

    const actions = buildRoomUtilizationActions({
        question,
        status: base.status,
        measurementId: measurement.id,
        roomId,
    });

    return { ...base, actions, presentation_lines: presentationForAnswer(base) };
}
