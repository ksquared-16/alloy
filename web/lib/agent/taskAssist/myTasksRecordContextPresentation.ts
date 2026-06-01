import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import { applyEntityLabelToOperatorCopy } from "@/lib/admin/resolveEntityDisplayLabel";
import type { MyTasksPresentationLabels } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanLabel(value: string | null | undefined): string | null {
    const s = (value ?? "").trim();
    if (!s || UUID_RE.test(s)) return null;
    return s;
}

export function resolveMyTasksEntityLabel(task: MyTasksTaskRow, entityLabels: EntityLabelsMap): string {
    const raw = cleanLabel(task.entity_label);
    if (!raw) return "Linked record";
    const rewritten = applyEntityLabelToOperatorCopy(raw, entityLabels);
    if (/\binquiry\b/i.test(rewritten)) {
        return rewritten.replace(/\binquiry\b/gi, "").replace(/\s+/g, " ").trim() || "Linked record";
    }
    return rewritten;
}

export function myTasksTaskHasLinkedRecord(task: MyTasksTaskRow): boolean {
    const entityId = (task.entity_id ?? "").trim();
    return task.entity_type === "opportunities" && Boolean(entityId);
}

export type MyTasksRecordContextLines = {
    entityTypeLabel: string;
    entityLabel: string;
    householdLabel: string | null;
    guardianFieldLabel: string;
    contactLabel: string | null;
    statusLabel: string | null;
    childrenLabels: string[];
    childFieldLabel: string | null;
    childrenDisplay: string | null;
    showContextBlock: boolean;
};

export function buildMyTasksRecordContextLines(
    task: MyTasksTaskRow,
    presentation: MyTasksPresentationLabels,
    entityLabels: EntityLabelsMap
): MyTasksRecordContextLines {
    const entityLabel = resolveMyTasksEntityLabel(task, entityLabels);
    const householdLabel = cleanLabel(task.household_label);
    const contactLabel = cleanLabel(task.contact_label);
    const rawStatus = cleanLabel(task.status_label);
    const statusLabel = rawStatus ? applyEntityLabelToOperatorCopy(rawStatus, entityLabels) : null;

    const childrenLabels = (task.children_labels ?? [])
        .map((c) => cleanLabel(c))
        .filter(Boolean) as string[];

    const childFieldLabel = childrenLabels.length > 0 ? presentation.childFieldLabel(childrenLabels.length) : null;
    const childrenDisplay = childrenLabels.length > 0 ? childrenLabels.join(", ") : null;

    return {
        entityTypeLabel: presentation.opportunityEntitySingular,
        entityLabel,
        householdLabel,
        guardianFieldLabel: presentation.guardianFieldLabel,
        contactLabel,
        statusLabel,
        childrenLabels,
        childFieldLabel,
        childrenDisplay,
        showContextBlock: myTasksTaskHasLinkedRecord(task),
    };
}
