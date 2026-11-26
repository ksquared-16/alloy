/**
 * Server helper: resolve BOS Future Room Capacity turn using shared question dispatch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { answerOperationalQuestion } from "@/lib/operationalQuestions/answerOperationalQuestion";
import {
    defaultEffectiveDateForRelativeMonth,
    type FutureRoomCapacityBosIntent,
} from "@/lib/operationalQuestions/bos/parseFutureRoomCapacityIntent";
import type { OperationalAnswer } from "@/lib/operationalQuestions/types";
import { FUTURE_ROOM_CAPACITY_QUESTION_KEY } from "@/lib/operationalQuestions/catalog";
import { configureFutureRoomCapacityMeasurement } from "@/lib/operationalQuestions/configureFutureRoomCapacity";
import {
    loadFutureRoomCapacityRecentHistory,
    rebindFutureRoomCapacityToNewerPublishedVersion,
    updateFutureRoomCapacityGoal,
} from "@/lib/operationalQuestions/updateFutureRoomCapacity";
import { productTypeById } from "@/lib/organizationCalculations/productCatalog";

export type BosOperationalQuestionTurn = {
    intent: FutureRoomCapacityBosIntent;
    answer: OperationalAnswer | null;
    clarify: string | null;
    transcript_lines: string[];
};

async function resolveRoomIdByHint(
    supabase: SupabaseClient,
    orgId: string,
    hint: string | null,
): Promise<{ roomId: string | null; roomLabel: string | null; candidates: string[] }> {
    if (!hint?.trim()) return { roomId: null, roomLabel: null, candidates: [] };
    const { data, error } = await supabase
        .from("locations")
        .select("id, label, location_type, org_id")
        .eq("org_id", orgId)
        .ilike("label", `%${hint.trim()}%`)
        .limit(8);
    if (error) throw new Error(error.message);
    const units = (data ?? []).filter(
        (r) => String(r.location_type ?? "").toLowerCase() === "unit" || !r.location_type,
    );
    const rows = units.length > 0 ? units : (data ?? []);
    if (rows.length === 0) return { roomId: null, roomLabel: null, candidates: [] };
    if (rows.length === 1) {
        return {
            roomId: String(rows[0]!.id),
            roomLabel: String(rows[0]!.label ?? hint),
            candidates: [],
        };
    }
    const exact = rows.find((r) => String(r.label ?? "").toLowerCase() === hint.trim().toLowerCase());
    if (exact) {
        return { roomId: String(exact.id), roomLabel: String(exact.label ?? hint), candidates: [] };
    }
    return {
        roomId: null,
        roomLabel: null,
        candidates: rows.map((r) => String(r.label ?? r.id)),
    };
}

export async function runFutureRoomCapacityBosTurn(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string; intent: FutureRoomCapacityBosIntent },
): Promise<BosOperationalQuestionTurn> {
    const { intent } = args;
    if (intent.kind === "none") {
        return { intent, answer: null, clarify: null, transcript_lines: [] };
    }

    if (intent.kind === "configure") {
        if (!intent.product_type_id) {
            return {
                intent,
                answer: null,
                clarify: null,
                transcript_lines: [
                    "Future Room Capacity is not being measured yet — or you asked to set it up.",
                    "How should Alloy determine capacity?",
                    "Lowest of physical and licensed seats, or operational seats when available?",
                    "You can also add a minimum goal, like “lowest of physical and licensed with a goal of 16 seats.”",
                ],
            };
        }
        const product = productTypeById(intent.product_type_id);
        const result = await configureFutureRoomCapacityMeasurement(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            name: intent.name ?? "Future Room Capacity",
            productTypeId: intent.product_type_id,
            targetMinSeats: intent.target_min_seats,
            entryPoint: "bos",
            reuseExisting: true,
        });
        const goalLine =
            intent.target_min_seats != null ?
                `Minimum goal set to ${intent.target_min_seats} seats.`
            :   "No minimum goal yet — say “change the minimum goal to 18 seats” anytime.";
        return {
            intent,
            answer: null,
            clarify: null,
            transcript_lines: [
                "Future Room Capacity is now measuring.",
                `How this is measured: ${product?.title ?? "selected capacity meaning"}.`,
                goalLine,
                "Ask something like “How many seats will Bears have next month?” to try it.",
                `Measurement ready (${result.measurement.name}).`,
            ],
        };
    }

    if (intent.kind === "change_goal") {
        if (intent.goal_seats == null) {
            return {
                intent,
                answer: null,
                clarify: "What minimum seat goal should Alloy warn you about?",
                transcript_lines: ["What minimum seat goal should Alloy warn you about?"],
            };
        }
        const updated = await updateFutureRoomCapacityGoal(supabase, {
            orgId: args.orgId,
            targetMinSeats: intent.goal_seats,
        });
        return {
            intent,
            answer: null,
            clarify: null,
            transcript_lines: [
                `Minimum goal is now ${intent.goal_seats} seats for Future Room Capacity.`,
                "That uses the same goal as Operational Intelligence.",
                updated.target?.kind === "count_min" ?
                    `Saved goal: ${updated.target.value} seats.`
                :   "Goal cleared.",
            ],
        };
    }

    if (intent.kind === "review_history") {
        const history = await loadFutureRoomCapacityRecentHistory(supabase, { orgId: args.orgId });
        return {
            intent,
            answer: null,
            clarify: null,
            transcript_lines: history.lines,
        };
    }

    if (intent.kind === "use_newer_source_version") {
        const updated = await rebindFutureRoomCapacityToNewerPublishedVersion(supabase, {
            orgId: args.orgId,
        });
        return {
            intent,
            answer: null,
            clarify: null,
            transcript_lines: [
                "Updated to use the newer definition.",
                `Now using version ${updated.source.version_number} of how this is measured.`,
                "Future answers will use this definition until you choose another.",
            ],
        };
    }

    const roomHint =
        intent.kind === "answer" || intent.kind === "explain_unavailable" ? intent.room_hint : null;
    const resolved = await resolveRoomIdByHint(supabase, args.orgId, roomHint);

    if (roomHint && !resolved.roomId) {
        const clarify =
            resolved.candidates.length > 0
                ? `Which room did you mean: ${resolved.candidates.slice(0, 5).join(", ")}?`
                : `I couldn’t find a room matching “${roomHint}”. Which room should I use?`;
        return { intent, answer: null, clarify, transcript_lines: [clarify] };
    }

    let effectiveAt: string | null = null;
    if (intent.kind === "answer") {
        effectiveAt =
            intent.effective_at
            ?? (intent.relative_month ? defaultEffectiveDateForRelativeMonth() : null);
        if (!effectiveAt) {
            return {
                intent,
                answer: null,
                clarify: "Which date should I use for future capacity?",
                transcript_lines: ["Which date should I use for future capacity?"],
            };
        }
    } else if (intent.kind === "explain_unavailable") {
        effectiveAt = defaultEffectiveDateForRelativeMonth();
    }

    if (!resolved.roomId || !effectiveAt) {
        return {
            intent,
            answer: null,
            clarify: "I need a room and a date to answer Future Room Capacity.",
            transcript_lines: ["I need a room and a date to answer Future Room Capacity."],
        };
    }

    const answer = await answerOperationalQuestion(supabase, FUTURE_ROOM_CAPACITY_QUESTION_KEY, {
        orgId: args.orgId,
        roomId: resolved.roomId,
        roomLabel: resolved.roomLabel,
        effectiveAt,
        entryPoint: "bos",
    });

    return {
        intent,
        answer,
        clarify: null,
        transcript_lines: answer.presentation_lines,
    };
}
