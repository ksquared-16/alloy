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
    person: "Person",
    child: "Child",
    /** Opportunity/context owns Lead-stage context fields. */
    context: "Lead",
    opportunity: "Lead",
    household: "Household",
};

function isStaleSectionLabel(label: string): boolean {
    return (
        /^placement/i.test(label) ||
        /preferences/i.test(label) ||
        /^context$/i.test(label) ||
        /^parent\s*\/\s*guardian$/i.test(label) ||
        /^opportunity$/i.test(label)
    );
}

const PERSON_IDENTITY_KEYS = new Set(["first_name", "last_name", "email", "phone"]);
const CHILD_IDENTITY_KEYS = new Set([
    "child_first_name",
    "child_last_name",
    "child_date_of_birth",
    "child_dob",
    "child_age",
]);

export function operationalSectionTitle(sectionKey: string, fallbackLabel: string): string {
    const cleaned = fallbackLabel.trim();
    // Prefer configured / projected labels when they are not stale role/placement copy.
    if (cleaned && !isStaleSectionLabel(cleaned)) {
        if (sectionKey === "context" || sectionKey === "opportunity") return cleaned;
        if (sectionKey === "person" || sectionKey === "child") return cleaned;
    }
    return SECTION_TITLE[sectionKey] ?? cleaned;
}

function resolveDisplayValue(
    fieldKey: string,
    raw: string,
    optionLabels?: ReadonlyMap<string, string>
): string {
    return optionLabels?.get(`${fieldKey}:${raw}`) ?? optionLabels?.get(raw) ?? raw;
}

function sectionKeyForField(fieldKey: string, metaSection?: string): string {
    if (PERSON_IDENTITY_KEYS.has(fieldKey)) return "person";
    if (CHILD_IDENTITY_KEYS.has(fieldKey)) return "child";
    if (metaSection === "context" || metaSection === "opportunity") return "opportunity";
    return metaSection ?? "opportunity";
}

export function buildUnderstandingGroups(input: {
    draft: BosCommandDraft;
    gatherFields: readonly ActionWorkspaceGatherField[];
    optionLabels?: ReadonlyMap<string, string>;
}): UnderstandingGroup[] {
    const selection = resolveCreateLeadCommitSelectionFromDraft(input.draft);
    const parents = summarizeCommitParents(selection).filter(
        (line) => line && line !== "Primary" && line !== "Additional"
    );
    const children = summarizeCommitChildren(selection).filter(
        (line) => line && line !== "Child" && line !== "Additional"
    );
    const groups: UnderstandingGroup[] = [];

    if (parents.length) {
        groups.push({
            key: "person",
            title: "Person",
            rows: parents.map((value, i) => ({
                label: i === 0 ? "Primary" : "Additional",
                value,
            })),
        });
    }

    if (children.length) {
        groups.push({
            key: "child",
            title: "Child",
            rows: children.map((value, i) => ({
                label: i === 0 ? "Child" : "Additional",
                value,
            })),
        });
    }

    const fieldMeta = new Map(input.gatherFields.map((f) => [f.payload_key, f]));
    const bySection = new Map<string, UnderstandingGroup>();

    for (const entry of input.draft.values) {
        const displayRaw = String(entry.value ?? "").trim();
        if (!displayRaw) continue;
        const meta = fieldMeta.get(entry.fieldKey);
        const sectionKey = sectionKeyForField(entry.fieldKey, meta?.section);
        if (
            (PERSON_IDENTITY_KEYS.has(entry.fieldKey) && parents.length) ||
            (CHILD_IDENTITY_KEYS.has(entry.fieldKey) && children.length)
        ) {
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
            value: resolveDisplayValue(entry.fieldKey, displayRaw, input.optionLabels),
            note,
        });
    }

    const order = ["person", "child", "opportunity", "context", "household"];
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
    optionLabels?: ReadonlyMap<string, string>;
}): UnderstandingGroup[] {
    const base = buildUnderstandingGroups({
        draft: input.draft,
        gatherFields: input.gatherFields,
        optionLabels: input.optionLabels,
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
