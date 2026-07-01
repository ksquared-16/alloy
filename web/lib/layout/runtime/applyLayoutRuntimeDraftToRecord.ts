/**
 * Merge layout-runtime edit draft onto a proof record for optimistic Save All.
 */

import {
    applyRoleContactPersonPatchToOpportunityRecord,
    buildLayoutRuntimePersonContactPatch,
    isLayoutRuntimePersonFieldRefKey,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import {
    LAYOUT_RUNTIME_CHILD_EDITABLE_REF_KEYS,
    isLayoutRuntimeChildIdentityRefKey,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import {
    LAYOUT_RUNTIME_OPPORTUNITY_NATIVE_EDITABLE_REF_KEYS,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { writeLayoutRuntimeRepeaterFieldRaw } from "@/lib/layout/runtime/writeLayoutRuntimeRepeaterFieldRaw";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function composeDraftKey(refKey: string, rowKey?: string): string {
    return rowKey ? `${rowKey}::${refKey}` : refKey;
}

function applyPersonContactDraft(
    record: ProofRuntimeRecord,
    baseline: Record<string, string>,
    draft: Record<string, string>,
): ProofRuntimeRecord {
    const refKeys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
    let next: ProofRuntimeRecord = { ...record };
    let changed = false;

    for (const refKey of refKeys) {
        if (!isLayoutRuntimePersonFieldRefKey(refKey)) continue;
        const base = (baseline[refKey] ?? "").trim();
        const value = (draft[refKey] ?? "").trim();
        if (base === value) continue;
        changed = true;
        const patch = buildLayoutRuntimePersonContactPatch({ [refKey]: base }, { [refKey]: value });
        applyRoleContactPersonPatchToOpportunityRecord(next, refKey, patch);
        if (value) next[refKey] = value;
    }

    return changed ? next : record;
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
    const displayCompanions = [
        "child.location",
        "child.program",
        "child.room",
        "child.schedule",
        "child.status",
    ] as const;

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
            for (const companion of displayCompanions) {
                const key = composeDraftKey(companion, rowKey);
                if ((draft[key] ?? "") === (baseline[key] ?? "")) continue;
                const label = (draft[key] ?? "").trim();
                if (label) rowNext[companion] = label;
            }
            const statusKey = String(rowNext["inquiry_child.outcome_status_key"] ?? rowNext.outcome_status_key ?? "").trim();
            if (statusKey && !String(rowNext["child.status"] ?? "").trim()) {
                const statusLabel = formatLayoutRuntimeStatusLabel(statusKey, {
                    refKey: "inquiry_child.outcome_status_key",
                    renderHint: "status",
                });
                if (statusLabel) rowNext["child.status"] = statusLabel;
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
