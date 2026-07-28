/**
 * Typed Question Catalog — Measure strategies with canonical inputs only.
 */

import { CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF } from "@/lib/admin/canonicalAdminRoutes";
import type { OperationalQuestionDefinition, OperationalQuestionKey } from "@/lib/operationalQuestions/types";

export const FUTURE_ROOM_CAPACITY_QUESTION_KEY = "future_room_capacity" as const;
export const ROOM_UTILIZATION_QUESTION_KEY = "room_utilization" as const;
export const ROOM_UTILIZATION_FTE_QUESTION_KEY = "room_utilization_fte" as const;
export const EQUIVALENT_CHILD_COUNT_QUESTION_KEY = "equivalent_child_count" as const;

const SHARED_ACTIONS = [
    "view_room",
    "review_history",
    "change_goal",
    "manage_measurement",
    "explain_answer",
    "use_newer_source_version",
] as const;

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
        goal_kind: "count_min",
        primary_actions: SHARED_ACTIONS,
    },
    {
        key: ROOM_UTILIZATION_QUESTION_KEY,
        title: "Room Utilization",
        question: "How full is this room compared with the seats it can use?",
        description:
            "Occupied seats (active children expected in the room) as a percentage of effective capacity.",
        category: "Capacity",
        answer_strategy: "measure",
        required_context: ["organization", "room", "effective_date"],
        unit: "percent",
        owner: "operational_intelligence",
        ui_route: `${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?question=room_utilization`,
        bos_capability_key: "operational_question_room_utilization",
        goal_kind: "rate_range",
        primary_actions: [
            "view_room",
            "review_children",
            "review_capacity",
            ...SHARED_ACTIONS.filter((a) => a !== "view_room"),
        ],
    },
    {
        key: ROOM_UTILIZATION_FTE_QUESTION_KEY,
        title: "Room Utilization (FTE)",
        question: "How full is this room using full-time equivalent children?",
        description:
            "Full-time equivalent children (weighted by days/week) as a percentage of effective capacity.",
        category: "Capacity",
        answer_strategy: "measure",
        required_context: ["organization", "room", "effective_date"],
        unit: "percent",
        owner: "operational_intelligence",
        ui_route: `${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?question=room_utilization_fte`,
        bos_capability_key: "operational_question_room_utilization_fte",
        goal_kind: "rate_range",
        primary_actions: [
            "view_room",
            "review_children",
            "review_capacity",
            ...SHARED_ACTIONS.filter((a) => a !== "view_room"),
        ],
    },
    {
        key: EQUIVALENT_CHILD_COUNT_QUESTION_KEY,
        title: "Equivalent Child Count",
        question: "How many equivalent children are expected in this room?",
        description:
            "Reusable weighted population count for the room on a selected date (proves populations outside utilization).",
        category: "Population",
        answer_strategy: "measure",
        required_context: ["organization", "room", "effective_date"],
        unit: "children",
        owner: "operational_intelligence",
        ui_route: `${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?question=equivalent_child_count`,
        bos_capability_key: "operational_question_equivalent_child_count",
        goal_kind: "count_min",
        primary_actions: ["view_room", "review_children", ...SHARED_ACTIONS.filter((a) => a !== "view_room")],
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

export function listOperationalQuestionsByCategory(
    category: OperationalQuestionDefinition["category"],
): readonly OperationalQuestionDefinition[] {
    return OPERATIONAL_QUESTION_CATALOG.filter((q) => q.category === category);
}
