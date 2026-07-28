/**
 * Typed Question Catalog — Future Room Capacity proving slice only.
 * Platform-owned; not org-authored.
 */

import { CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF } from "@/lib/admin/canonicalAdminRoutes";
import type { OperationalQuestionDefinition, OperationalQuestionKey } from "@/lib/operationalQuestions/types";

export const FUTURE_ROOM_CAPACITY_QUESTION_KEY = "future_room_capacity" as const;

export const OPERATIONAL_QUESTION_CATALOG: readonly OperationalQuestionDefinition[] = [
    {
        key: FUTURE_ROOM_CAPACITY_QUESTION_KEY,
        title: "Future Room Capacity",
        question: "How many seats will this room have on a future date?",
        description:
            "Measure how many seats a room is expected to have on a future date, using your organization’s capacity definition.",
        category: "Capacity",
        answer_strategy: "measure",
        required_context: ["organization", "room", "effective_date"],
        unit: "seats",
        owner: "operational_intelligence",
        ui_route: `${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?question=future_room_capacity`,
        bos_capability_key: "operational_question_future_room_capacity",
        primary_actions: [
            "view_room",
            "review_history",
            "change_goal",
            "manage_measurement",
            "explain_answer",
            "use_newer_source_version",
        ],
    },
] as const;

export function getOperationalQuestion(
    key: string | null | undefined,
): OperationalQuestionDefinition | null {
    if (!key) return null;
    return OPERATIONAL_QUESTION_CATALOG.find((q) => q.key === key) ?? null;
}

export function listOperationalQuestions(): readonly OperationalQuestionDefinition[] {
    return OPERATIONAL_QUESTION_CATALOG;
}

export function isOperationalQuestionKey(key: string): key is OperationalQuestionKey {
    return OPERATIONAL_QUESTION_CATALOG.some((q) => q.key === key);
}
