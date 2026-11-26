/**
 * Group publication errors by the configuration area an operator would go and fix.
 *
 * Twenty equally-weighted messages with internal paths is not a list of twenty problems — in the
 * certification tenant it was three. Eleven were one stamping defect, three were one missing status
 * mapping, and six were one grain-handoff decision. Presented flat, the operator cannot see that,
 * and the natural response is to start editing twenty things.
 *
 * Grouping never hides anything: every error stays, and its exact code and path stay with it.
 *
 * Pure. No I/O.
 */

import type { ConfigurationError } from "@/lib/businessProcesses/configuration/configurationDiagnostics";

export type PublicationErrorArea = "stage_movement" | "statuses" | "commands_and_actions" | "structure" | "other";

export type PublicationErrorGroup = {
    area: PublicationErrorArea;
    /** What an operator would call this area. */
    label: string;
    errors: ConfigurationError[];
};

const AREA_LABELS: Record<PublicationErrorArea, string> = {
    stage_movement: "Stage movement",
    statuses: "Statuses",
    commands_and_actions: "Commands & actions",
    structure: "Process structure",
    other: "Other",
};

/** Order is the order an operator should work in: structure, then movement, then the rest. */
const AREA_ORDER: PublicationErrorArea[] = ["structure", "stage_movement", "statuses", "commands_and_actions", "other"];

/**
 * Which area an error belongs to.
 *
 * Keyed on the error CODE where one exists, because a code is a contract; message text is copy and
 * would re-group itself the next time someone reworded it. `stage_operating_contract` is the one
 * code that spans areas — it carries both grain and status problems — so that single case reads the
 * message, and only that case.
 */
export function areaForPublicationError(error: Pick<ConfigurationError, "code" | "message">): PublicationErrorArea {
    switch (error.code) {
        case "process_command_set_incomplete":
            return "commands_and_actions";
        case "process_entry_stage_unresolvable":
        case "process_entry_intent_unknown":
        case "dangling_stage_reference":
            return "stage_movement";
        case "no_active_process":
        case "duplicate_stage_key":
        case "process_has_no_stages":
        case "configuration_unreadable":
            return "structure";
        case "stage_operating_contract":
            return /status/i.test(error.message) ? "statuses" : "stage_movement";
        default:
            return "other";
    }
}

export function groupPublicationErrors(errors: readonly ConfigurationError[]): PublicationErrorGroup[] {
    const byArea = new Map<PublicationErrorArea, ConfigurationError[]>();
    for (const error of errors) {
        const area = areaForPublicationError(error);
        const list = byArea.get(area) ?? [];
        list.push(error);
        byArea.set(area, list);
    }
    return AREA_ORDER.flatMap((area) => {
        const list = byArea.get(area);
        return list?.length ? [{ area, label: AREA_LABELS[area], errors: list }] : [];
    });
}

/** The headline: how many AREAS need attention, not how many messages exist. */
export function summarizePublicationErrors(errors: readonly ConfigurationError[]): string {
    const groups = groupPublicationErrors(errors);
    if (!groups.length) return "Ready to publish.";
    return `${groups.length} configuration ${groups.length === 1 ? "area needs" : "areas need"} attention`;
}
