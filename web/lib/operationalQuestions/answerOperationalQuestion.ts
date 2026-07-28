import type { SupabaseClient } from "@supabase/supabase-js";
import {
    FUTURE_ROOM_CAPACITY_QUESTION_KEY,
    getOperationalQuestion,
} from "@/lib/operationalQuestions/catalog";
import { answerFutureRoomCapacity } from "@/lib/operationalQuestions/answerFutureRoomCapacity";
import type {
    AnswerOperationalQuestionContext,
    OperationalAnswer,
    OperationalQuestionDefinition,
} from "@/lib/operationalQuestions/types";

export { FUTURE_ROOM_CAPACITY_QUESTION_KEY };

/**
 * Shared strategy dispatch — UI and BOS must call this (or the HTTP wrapper).
 * Does not calculate capacity; Measure strategy uses existing observation services.
 */
export async function answerOperationalQuestion(
    supabase: SupabaseClient,
    questionKey: string,
    ctx: AnswerOperationalQuestionContext,
): Promise<OperationalAnswer> {
    const question = getOperationalQuestion(questionKey);
    if (!question) {
        return {
            question_key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
            question_title: "Unknown question",
            strategy: "measure",
            status: "invalid_context",
            value: null,
            unit: null,
            subject: { room_id: ctx.roomId ?? null, room_label: ctx.roomLabel ?? null },
            effective_date: ctx.effectiveAt ?? null,
            answered_at: null,
            availability: "unknown",
            availability_reason: "That operational question isn’t available.",
            goal: null,
            health: null,
            source_summary: null,
            version_summary: null,
            explanation_summary: [],
            history_available: false,
            measurement_id: null,
            actions: [],
            presentation_lines: ["That operational question isn’t available yet."],
        };
    }

    if (question.answer_strategy === "measure" && question.key === FUTURE_ROOM_CAPACITY_QUESTION_KEY) {
        return answerFutureRoomCapacity(supabase, question, ctx);
    }

    return {
        question_key: question.key,
        question_title: question.title,
        strategy: question.answer_strategy,
        status: "invalid_context",
        value: null,
        unit: null,
        subject: { room_id: null, room_label: null },
        effective_date: null,
        answered_at: null,
        availability: "unknown",
        availability_reason: "This answer strategy is not implemented in the proving slice.",
        goal: null,
        health: null,
        source_summary: null,
        version_summary: null,
        explanation_summary: [],
        history_available: false,
        measurement_id: null,
        actions: [],
        presentation_lines: ["This question isn’t available in the proving slice yet."],
    };
}

export type { OperationalQuestionDefinition };
