/**
 * Measure-strategy resolver for Future Room Capacity.
 * Uses existing oi-org-calc observe — no second evaluator.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { capacityRecipeFromProductTypeLabel } from "@/lib/adminV2/settings/operationalIntelligence/oiCapacityRecipeCopy";
import { buildFutureRoomCapacityActions } from "@/lib/operationalQuestions/actions";
import { FUTURE_ROOM_CAPACITY_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";
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
import { oiOrgCalcTargetForCountMin } from "@/lib/metrics/oiOrgCalcTargetFormat";
import { loadOrgMetadata, observeOiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcObserve";

/** Find the org’s active measurement for Future Room Capacity. */
export function findFutureRoomCapacityMeasurement(
    measurements: OiOrgCalcMeasurement[],
): OiOrgCalcMeasurement | null {
    const active = measurements.filter((m) => m.status === "active");
    const byKey = active.find((m) => m.question_key === FUTURE_ROOM_CAPACITY_QUESTION_KEY);
    if (byKey) return byKey;
    return active.find((m) => m.key.startsWith("org.future_capacity.")) ?? null;
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

function countMinGoal(measurement: OiOrgCalcMeasurement): OperationalAnswer["goal"] {
    const target = oiOrgCalcTargetForCountMin(measurement.target);
    if (!target) return null;
    return {
        kind: "count_min",
        value: target.value,
        label: `Warn below ${target.value} seats`,
    };
}

function presentationForAnswer(answer: Omit<OperationalAnswer, "presentation_lines" | "actions">): string[] {
    const lines: string[] = [];
    const subject = answer.subject.room_label ?? "This room";
    const date = answer.effective_date ?? "the selected date";

    if (answer.status === "configuration_required") {
        lines.push("Future Room Capacity is not being measured yet.");
        lines.push("I can help set it up. First, how should Alloy determine capacity?");
        return lines;
    }
    if (answer.status === "invalid_context") {
        lines.push(answer.availability_reason ?? "I need a room and a date to answer that.");
        return lines;
    }
    if (answer.status === "not_available") {
        lines.push(
            `Future room capacity is not available for ${subject} because required capacity information isn’t configured.`,
        );
        if (answer.availability_reason) lines.push(answer.availability_reason);
        lines.push("I can take you to the room setup or explain what information is missing.");
        return lines;
    }
    if (answer.status === "answered" && answer.value != null) {
        lines.push(`${subject} is expected to have ${answer.value} seats available on ${date}.`);
        if (answer.health === "on_goal" && answer.goal?.kind === "count_min") {
            lines.push(`That is on goal. Your minimum is ${answer.goal.value} seats.`);
        } else if (answer.health === "below_goal" && answer.goal?.kind === "count_min") {
            lines.push(`That is below goal. Your minimum is ${answer.goal.value} seats.`);
        } else if (answer.health === "no_goal") {
            lines.push("No goal is set for this measurement yet.");
        }
        if (answer.source_summary) {
            lines.push(`Calculated using: ${answer.source_summary}.`);
        }
        lines.push("Would you like to review the room or see recent history?");
        return lines;
    }
    lines.push("I couldn’t answer that right now.");
    return lines;
}

export async function answerFutureRoomCapacity(
    supabase: SupabaseClient,
    question: OperationalQuestionDefinition,
    ctx: AnswerOperationalQuestionContext,
): Promise<OperationalAnswer> {
    const metadata = await loadOrgMetadata(supabase, ctx.orgId);
    const measurements = parseOiOrgCalcMeasurements(metadata);
    const measurement = findFutureRoomCapacityMeasurement(measurements);

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
            availability_reason: "Future Room Capacity is not being measured yet.",
            goal: null,
            health: null,
            source_summary: null,
            version_summary: null,
            explanation_summary: [],
            history_available: false,
            measurement_id: null,
        };
        const actions = buildFutureRoomCapacityActions({
            question,
            status: "configuration_required",
            measurementId: null,
            roomId: ctx.roomId ?? null,
        });
        return {
            ...base,
            actions,
            presentation_lines: presentationForAnswer(base),
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
            unit: "seats" as const,
            subject: { room_id: roomId || null, room_label: ctx.roomLabel ?? null },
            effective_date: effectiveAt || null,
            answered_at: null,
            availability: "unknown" as const,
            availability_reason: !roomId
                ? "Choose a room to check future capacity."
                : "Choose a date to check future capacity.",
            goal: countMinGoal(measurement),
            health: null,
            source_summary: capacityRecipeFromProductTypeLabel(
                measurement.description ?? measurement.source.calculation_name,
            ).sourceLine,
            version_summary: `Version ${measurement.source.version_number}`,
            explanation_summary: [],
            history_available: parseOiOrgCalcHistory(metadata, measurement.id).length > 0,
            measurement_id: measurement.id,
        };
        const actions = buildFutureRoomCapacityActions({
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
    const recipe = capacityRecipeFromProductTypeLabel(
        measurement.description ?? measurement.source.calculation_name,
    );
    const available = result.observation.availability === "resolved" && result.observation.value != null;
    const history = parseOiOrgCalcHistory(
        await loadOrgMetadata(supabase, ctx.orgId),
        measurement.id,
    );

    const base = {
        question_key: question.key,
        question_title: question.title,
        strategy: question.answer_strategy,
        status: (available ? "answered" : "not_available") as OperationalAnswer["status"],
        value: available ? result.observation.value : null,
        unit: "seats" as const,
        subject: {
            room_id: roomId,
            room_label: result.observation.room_label ?? ctx.roomLabel ?? null,
        },
        effective_date: effectiveAt,
        answered_at: result.observation.evaluated_at,
        availability: (available ? "available" : "not_available") as OperationalAnswer["availability"],
        availability_reason: available ? null : (result.observation.unavailable_reason ?? "Not available"),
        goal: countMinGoal(measurement),
        health,
        source_summary: recipe.sourceLine,
        version_summary: `Version ${measurement.source.version_number}`,
        explanation_summary: result.observation.explanation_summary ?? [],
        history_available: history.length > 0,
        measurement_id: measurement.id,
    };

    const actions = buildFutureRoomCapacityActions({
        question,
        status: base.status,
        measurementId: measurement.id,
        roomId,
    });

    return { ...base, actions, presentation_lines: presentationForAnswer(base) };
}
