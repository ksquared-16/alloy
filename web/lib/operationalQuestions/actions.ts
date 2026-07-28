/**
 * Canonical actions for Operational Question answers — shared by UI and BOS.
 */

import { CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF } from "@/lib/admin/canonicalAdminRoutes";
import type {
    OperationalAnswerStatus,
    OperationalQuestionAction,
    OperationalQuestionActionKey,
    OperationalQuestionDefinition,
} from "@/lib/operationalQuestions/types";

function action(
    key: OperationalQuestionActionKey,
    label: string,
    href: string | null,
): OperationalQuestionAction {
    return { key, label, href };
}

export function buildFutureRoomCapacityActions(args: {
    question: OperationalQuestionDefinition;
    status: OperationalAnswerStatus;
    measurementId: string | null;
    roomId: string | null;
    hasNewerVersion?: boolean;
}): OperationalQuestionAction[] {
    const { question, status, measurementId, roomId, hasNewerVersion } = args;
    const base = `${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?question=${question.key}`;

    if (status === "configuration_required") {
        return [
            action("start_measuring", "Start measuring", `${base}&add=1`),
            action("continue_setup", "Set up Future Room Capacity", `${base}&add=1`),
        ];
    }

    if (status === "invalid_context" || status === "unauthorized") {
        return [];
    }

    const out: OperationalQuestionAction[] = [];
    if (roomId) {
        out.push(action("view_room", "View room", `/locations?focus=${encodeURIComponent(roomId)}`));
    }
    if (measurementId) {
        out.push(
            action(
                "review_history",
                "Review history",
                `${base}&orgMeasurement=${measurementId}&region=history`,
            ),
        );
        out.push(
            action("change_goal", "Change goal", `${base}&orgMeasurement=${measurementId}&region=goal`),
        );
        out.push(
            action(
                "manage_measurement",
                "Manage how this is measured",
                `${base}&orgMeasurement=${measurementId}&region=source`,
            ),
        );
    }
    out.push(action("explain_answer", "Explain this answer", null));
    if (hasNewerVersion && measurementId) {
        out.push(
            action(
                "use_newer_source_version",
                "Use the newer definition",
                `${base}&orgMeasurement=${measurementId}&region=source`,
            ),
        );
    }
    return out;
}

export function buildRoomUtilizationActions(args: {
    question: OperationalQuestionDefinition;
    status: OperationalAnswerStatus;
    measurementId: string | null;
    roomId: string | null;
    hasNewerVersion?: boolean;
}): OperationalQuestionAction[] {
    const { question, status, measurementId, roomId, hasNewerVersion } = args;
    const base = `${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?question=${question.key}`;

    if (status === "configuration_required") {
        return [
            action("start_measuring", "Start measuring", `${base}&add=1`),
            action("continue_setup", "Set up Room Utilization", `${base}&add=1`),
        ];
    }

    if (status === "invalid_context" || status === "unauthorized") {
        return [];
    }

    const out: OperationalQuestionAction[] = [];
    if (roomId) {
        out.push(action("view_room", "View room", `/locations?focus=${encodeURIComponent(roomId)}`));
        out.push(
            action(
                "review_children",
                "Review children",
                `/locations?focus=${encodeURIComponent(roomId)}&panel=children`,
            ),
        );
        out.push(
            action(
                "review_capacity",
                "Review capacity",
                `/locations?focus=${encodeURIComponent(roomId)}&panel=capacity`,
            ),
        );
    }
    if (measurementId) {
        out.push(
            action(
                "review_history",
                "Review history",
                `${base}&orgMeasurement=${measurementId}&region=history`,
            ),
        );
        out.push(
            action("change_goal", "Change goal", `${base}&orgMeasurement=${measurementId}&region=goal`),
        );
        out.push(
            action(
                "manage_measurement",
                "Manage how this is measured",
                `${base}&orgMeasurement=${measurementId}&region=source`,
            ),
        );
    }
    out.push(action("explain_answer", "Explain this answer", null));
    if (hasNewerVersion && measurementId) {
        out.push(
            action(
                "use_newer_source_version",
                "Use the newer definition",
                `${base}&orgMeasurement=${measurementId}&region=source`,
            ),
        );
    }
    return out;
}
