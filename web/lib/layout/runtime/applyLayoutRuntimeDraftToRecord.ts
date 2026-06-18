/**
 * Merge layout-runtime edit draft onto a proof record for optimistic Save All.
 */

import { applyPersonPatchToOpportunityHydration } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import {
    isLayoutRuntimePersonContactRefKey,
    buildLayoutRuntimePersonContactPatch,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import {
    LAYOUT_RUNTIME_CHILD_EDITABLE_REF_KEYS,
    isLayoutRuntimeChildIdentityRefKey,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import {
    LAYOUT_RUNTIME_OPPORTUNITY_NATIVE_EDITABLE_REF_KEYS,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { writeLayoutRuntimeRepeaterFieldRaw } from "@/lib/layout/runtime/writeLayoutRuntimeRepeaterFieldRaw";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function composeDraftKey(refKey: string, rowKey?: string): string {
    return rowKey ? `${rowKey}::${refKey}` : refKey;
}

function applyPersonContactDraft(
    record: ProofRuntimeRecord,
    baseline: Record<string, string>,
    draft: Record<string, string>,
): ProofRuntimeRecord {
    const personPatch = buildLayoutRuntimePersonContactPatch(baseline, draft);
    if (Object.keys(personPatch).length === 0) return record;

    const next: ProofRuntimeRecord = { ...record };
    applyPersonPatchToOpportunityHydration(next, personPatch);
    for (const refKey of Object.keys(baseline)) {
        if (!isLayoutRuntimePersonContactRefKey(refKey)) continue;
        const value = (draft[refKey] ?? "").trim();
        if (value) next[refKey] = value;
    }
    return next;
}

function applyOpportunityNativeDraft(
    record: ProofRuntimeRecord,
    baseline: Record<string, string>,
    draft: Record<string, string>,
): ProofRuntimeRecord {
    const next: ProofRuntimeRecord = { ...record };
    for (const refKey of LAYOUT_RUNTIME_OPPORTUNITY_NATIVE_EDITABLE_REF_KEYS) {
        if ((draft[refKey] ?? "") === (baseline[refKey] ?? "")) continue;
        const value = (draft[refKey] ?? "").trim();
        next[refKey] = value;
        if (refKey === "opportunity.location_id") {
            next.location_id = value || null;
            next._location_id = value || null;
            const label = (draft["opportunity.location"] ?? "").trim();
            if (label) {
                next["opportunity.location"] = label;
                next._location_label = label;
                next._location_name = label;
            } else if (!value) {
                next["opportunity.location"] = "";
                next._location_label = "";
                next._location_name = "";
            }
        }
    }
    return next;
}

function applyChildRepeaterDraft(
    record: ProofRuntimeRecord,
    rowKeys: string[],
    rows: ProofRuntimeRecord[],
    baseline: Record<string, string>,
    draft: Record<string, string>,
): ProofRuntimeRecord {
    const next: ProofRuntimeRecord = { ...record };
    const sources = ["children", "enrollment_children"] as const;

    for (const source of sources) {
        const raw = record[source];
        if (!Array.isArray(raw)) continue;
        const patched = raw.map((row, index) => {
            if (!row || typeof row !== "object") return row;
            const rowKey = rowKeys[index];
            if (!rowKey || rows[index] !== row) return row;
            let rowNext = { ...(row as ProofRuntimeRecord) };
            for (const refKey of LAYOUT_RUNTIME_CHILD_EDITABLE_REF_KEYS) {
                const key = composeDraftKey(refKey, rowKey);
                if ((draft[key] ?? "") === (baseline[key] ?? "")) continue;
                rowNext = writeLayoutRuntimeRepeaterFieldRaw(rowNext, refKey, draft[key] ?? "");
            }
            if (isLayoutRuntimeChildIdentityRefKey("child.first_name")) {
                const first = String(rowNext["child.first_name"] ?? rowNext.first_name ?? "").trim();
                const last = String(rowNext["child.last_name"] ?? rowNext.last_name ?? "").trim();
                const full = [first, last].filter(Boolean).join(" ").trim();
                if (full) {
                    rowNext["child.full_name"] = full;
                    rowNext.display_name = full;
                }
            }
            return rowNext;
        });
        next[source] = patched;
    }
    return next;
}

export function applyLayoutRuntimeDraftToRecord(input: {
    record: ProofRuntimeRecord;
    baseline: Record<string, string>;
    draft: Record<string, string>;
    rowKeys: string[];
    rows: ProofRuntimeRecord[];
}): ProofRuntimeRecord {
    let next = applyPersonContactDraft(input.record, input.baseline, input.draft);
    next = applyOpportunityNativeDraft(next, input.baseline, input.draft);
    next = applyChildRepeaterDraft(next, input.rowKeys, input.rows, input.baseline, input.draft);
    return next;
}
