/**
 * Apply operator Create Lead commit-selection decisions to durable processing_resolutions (D4).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateLeadCommitSelection, CreateLeadCommitRecord } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { linkedPersonIdFromCommitRecord } from "@/lib/intake/resolve/applyResolutionToCommitSelection";

function decisionForRecord(record: CreateLeadCommitRecord): { action: string; selectedId: string | null } | null {
    if (!record.include_in_commit) return null;
    const res = record.resolution;
    if (!res) return { action: "create_new", selectedId: null };
    if (res.state === "conflict" || res.action === "reject") {
        return { action: "reject", selectedId: null };
    }
    if (res.action === "link_existing") {
        return { action: "link_existing", selectedId: linkedPersonIdFromCommitRecord(record) };
    }
    if (res.action === "review_required") {
        return { action: "review_required", selectedId: linkedPersonIdFromCommitRecord(record) };
    }
    if (res.action === "create_new" || res.state === "new") {
        return { action: "create_new", selectedId: null };
    }
    return { action: res.action ?? "create_new", selectedId: linkedPersonIdFromCommitRecord(record) };
}

/** Persist operator overlay decisions onto resolution rows for this case. */
export async function applyCommitSelectionToResolutions(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        selection: CreateLeadCommitSelection;
        operatorId: string;
    },
): Promise<void> {
    const updates: { subjectRef: string; action: string; selectedId: string | null }[] = [];

    for (const parent of input.selection.parents) {
        const d = decisionForRecord(parent);
        if (d) updates.push({ subjectRef: parent.candidate_id, ...d });
    }
    for (const child of input.selection.children) {
        const d = decisionForRecord(child);
        if (d) updates.push({ subjectRef: child.candidate_id, ...d });
    }

    if (input.selection.household_resolution?.action === "link_existing") {
        updates.push({
            subjectRef: input.selection.parents[0]?.candidate_id?.replace(/^parent:/, "household:") ?? "",
            action: "link_existing",
            selectedId: input.selection.household_resolution.linked_customer_id ?? null,
        });
    }

    for (const u of updates) {
        if (!u.subjectRef) continue;
        await supabase
            .from("processing_resolutions")
            .update({
                decision_action: u.action,
                selected_candidate_id: u.selectedId,
                decided_by: "operator",
                operator_id: input.operatorId,
            })
            .eq("org_id", input.orgId)
            .eq("case_id", input.caseId)
            .eq("subject_ref", u.subjectRef);
    }
}
