import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import {
    adminFieldEntityPluralLabel,
    adminFieldEntitySingularLabel,
} from "@/lib/admin/adminFieldEntityDisplayLabel";
import { applyEntityLabelToOperatorCopy } from "@/lib/admin/resolveEntityDisplayLabel";
import { formatOperationalTaskSourceLabel } from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import { normalizeOperationalTaskTitleDisplay } from "@/lib/agent/taskAssist/normalizeOperationalTaskTitleDisplay";

/** Operator-facing field labels for My Tasks cards (tenant-configured where available). */
export type MyTasksPresentationLabels = {
    opportunityEntitySingular: string;
    guardianFieldLabel: string;
    childFieldLabel: (count: number) => string;
};

const GUARDIAN_ROLE_KEYS = ["guardian", "parent", "primary_contact", "primary"] as const;

/** Fallback when org role-type config is unavailable. */
export function myTasksGuardianFieldLabelFallback(): string {
    return "Guardian";
}

export function resolveMyTasksGuardianFieldLabelFromRoleTypes(
    roleTypes: { key: string; label: string | null }[] | null | undefined
): string {
    if (!roleTypes?.length) return myTasksGuardianFieldLabelFallback();
    for (const key of GUARDIAN_ROLE_KEYS) {
        const hit = roleTypes.find((r) => r.key.trim().toLowerCase() === key);
        const label = hit?.label?.trim();
        if (label) return label;
    }
    return myTasksGuardianFieldLabelFallback();
}

export function resolveMyTasksChildFieldLabel(labels: EntityLabelsMap, count: number): string {
    const raw =
        count === 1 ?
            adminFieldEntitySingularLabel(labels, "inquiry_child")
        :   adminFieldEntityPluralLabel(labels, "inquiry_child");
    // Platform default embeds "inquiry"; prefer neutral Child/Children in My Tasks cards.
    if (/\binquiry\b/i.test(raw)) {
        return count === 1 ? "Child" : "Children";
    }
    return applyEntityLabelToOperatorCopy(raw, labels);
}

export function buildMyTasksPresentationLabels(
    labels: EntityLabelsMap,
    guardianFieldLabel?: string | null
): MyTasksPresentationLabels {
    const opportunityEntitySingular = applyEntityLabelToOperatorCopy(
        adminFieldEntitySingularLabel(labels, "opportunity"),
        labels
    );
    return {
        opportunityEntitySingular,
        guardianFieldLabel: guardianFieldLabel?.trim() || myTasksGuardianFieldLabelFallback(),
        childFieldLabel: (count) => resolveMyTasksChildFieldLabel(labels, count),
    };
}

export function applyEntityLabelToMyTasksCopy(text: string, labels: EntityLabelsMap): string {
    return applyEntityLabelToOperatorCopy(text, labels);
}

/** Client-side search across visible task row presentation fields. */
export function myTasksRowMatchesSearch(
    task: {
        title: string;
        source: string;
        entity_label?: string | null;
        household_label?: string | null;
        contact_label?: string | null;
        status_label?: string | null;
        children_labels?: string[] | null;
    },
    query: string,
    labels: EntityLabelsMap
): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const parts = [
        task.title,
        normalizeOperationalTaskTitleDisplay(task.title),
        task.entity_label,
        task.household_label,
        task.contact_label,
        task.status_label,
        formatOperationalTaskSourceLabel(task.source),
        ...(task.children_labels ?? []),
        applyEntityLabelToOperatorCopy(task.status_label ?? "", labels),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return parts.includes(q) || q.split(/\s+/).every((token) => parts.includes(token));
}
