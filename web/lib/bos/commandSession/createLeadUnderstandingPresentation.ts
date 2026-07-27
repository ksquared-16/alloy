/**
 * Presentation-only helpers for Create Lead command understanding cards.
 * Does not change parse or draft semantics.
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { BosCommandDraft, BosCommandPreview } from "@/lib/bos/commandSession/types";
import {
    resolveCreateLeadCommitSelectionFromDraft,
    summarizeCommitChildren,
    summarizeCommitParents,
} from "@/lib/bos/commandSession/createLeadRepeaterDraft";

export type UnderstandingGroup = {
    key: string;
    title: string;
    rows: Array<{ label: string; value: string; note?: string }>;
};

const SECTION_TITLE: Record<string, string> = {
    person: "Family",
    child: "Children",
    context: "Placement & preferences",
};

export function operationalSectionTitle(sectionKey: string, fallbackLabel: string): string {
    return SECTION_TITLE[sectionKey] ?? fallbackLabel;
}

export function buildUnderstandingGroups(input: {
    draft: BosCommandDraft;
    gatherFields: readonly ActionWorkspaceGatherField[];
}): UnderstandingGroup[] {
    const selection = resolveCreateLeadCommitSelectionFromDraft(input.draft);
    const parents = summarizeCommitParents(selection).filter(
        (line) => line && line !== "Parent / guardian"
    );
    const children = summarizeCommitChildren(selection).filter((line) => line && line !== "Child");
    const groups: UnderstandingGroup[] = [];

    if (parents.length) {
        groups.push({
            key: "person",
            title: "Family",
            rows: parents.map((value, i) => ({
                label: parents.length > 1 ? `Parent ${i + 1}` : "Parent / guardian",
                value,
            })),
        });
    }

    if (children.length) {
        groups.push({
            key: "child",
            title: "Children",
            rows: children.map((value, i) => ({
                label: children.length > 1 ? `Child ${i + 1}` : "Child",
                value,
            })),
        });
    }

    const fieldMeta = new Map(input.gatherFields.map((f) => [f.payload_key, f]));
    const bySection = new Map<string, UnderstandingGroup>();

    for (const entry of input.draft.values) {
        const display = String(entry.value ?? "").trim();
        if (!display) continue;
        const meta = fieldMeta.get(entry.fieldKey);
        const sectionKey = meta?.section ?? "context";
        // Prefer repeater summaries for person/child when present.
        if ((sectionKey === "person" && parents.length) || (sectionKey === "child" && children.length)) {
            continue;
        }
        const title = operationalSectionTitle(sectionKey, meta?.section_label ?? "Details");
        let group = bySection.get(sectionKey);
        if (!group) {
            group = { key: sectionKey, title, rows: [] };
            bySection.set(sectionKey, group);
        }
        const note =
            entry.evidence.find((e) => e.note)?.note ??
            (entry.state === "inferred"
                ? "Suggested"
                : entry.state === "parsed_from_source"
                  ? "From your note"
                  : entry.state === "operator_entered" || entry.state === "confirmed"
                    ? "Entered by you"
                    : undefined);
        group.rows.push({
            label: meta?.field_label ?? entry.fieldKey.replace(/_/g, " "),
            value: display,
            note,
        });
    }

    const order = ["person", "child", "context"];
    for (const key of order) {
        if (groups.some((g) => g.key === key)) continue;
        const g = bySection.get(key);
        if (g?.rows.length) groups.push(g);
    }
    for (const [key, g] of bySection) {
        if (!order.includes(key) && g.rows.length && !groups.some((x) => x.key === key)) {
            groups.push(g);
        }
    }

    return groups;
}

export function buildReviewGroups(input: {
    draft: BosCommandDraft;
    gatherFields: readonly ActionWorkspaceGatherField[];
    preview: BosCommandPreview | null;
}): UnderstandingGroup[] {
    const base = buildUnderstandingGroups({
        draft: input.draft,
        gatherFields: input.gatherFields,
    });
    const extras: UnderstandingGroup["rows"] = [];
    if (input.preview?.householdSummary) {
        extras.push({ label: "Household", value: input.preview.householdSummary });
    }
    for (const line of input.preview?.sideEffects ?? []) {
        extras.push({ label: "After confirm", value: line });
    }
    if (extras.length) {
        base.push({ key: "outcome", title: "What happens next", rows: extras });
    }
    if (input.preview?.warnings?.length) {
        base.push({
            key: "unresolved",
            title: "Still unresolved",
            rows: input.preview.warnings.map((w) => ({ label: "Note", value: w })),
        });
    }
    return base;
}

export const CREATE_LEAD_PASTE_EXAMPLES = [
    "Parent email or phone",
    "Call notes",
    "Website lead",
    "Voice transcript",
    "Meeting notes",
] as const;
