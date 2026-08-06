/**
 * Apply operator Create Lead commit-selection decisions to durable processing_resolutions (D4).
 *
 * Adapters may not bypass the identity-review gate: when a durable subject already
 * has plausible candidates, stamping create_new without an explicit override is refused
 * (decision remains review_required / needs_review).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateLeadCommitSelection, CreateLeadCommitRecord } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { linkedPersonIdFromCommitRecord } from "@/lib/intake/resolve/applyResolutionToCommitSelection";
import {
    adapterMayNotBypassEligibility,
    isPlausibleCandidate,
} from "../operator/identityResolutionEligibility";
import type { IdentityCandidate } from "@/lib/identity";
import {
    recordOperatorDecisionLifecycle,
    type IdentityLineageDeps,
} from "../trustAdapter/identityLineageService";

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
        /**
         * Trust supersession lineage (Phase 1.6). Defaults ON in production.
         * This adapter is the SECOND path that stamps `decided_by = "operator"`,
         * so it goes through the same canonical lineage service rather than
         * leaving its corrections ungoverned.
         */
        trustLineage?: false | IdentityLineageDeps;
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

        const { data: existing } = await supabase
            .from("processing_resolutions")
            .select("id, candidates, provisional, decision_action")
            .eq("org_id", input.orgId)
            .eq("case_id", input.caseId)
            .eq("subject_ref", u.subjectRef)
            .is("superseded_by", null)
            .maybeSingle();

        const candidates = ((existing as { candidates?: IdentityCandidate[] } | null)?.candidates ?? []).filter(
            isPlausibleCandidate,
        );

        let action = u.action;
        let selectedId = u.selectedId;
        if (action === "create_new") {
            const gate = adapterMayNotBypassEligibility({
                decisionAction: "create_new",
                decidedBy: "operator",
                candidates,
                provisional: {},
            });
            // Without a durable create-new override reason, downgrade to review_required.
            if (!gate.ok || candidates.length > 0) {
                action = "review_required";
                selectedId = candidates[0]?.recordId ?? selectedId;
            }
        }

        await supabase
            .from("processing_resolutions")
            .update({
                decision_action: action,
                selected_candidate_id: selectedId,
                decided_by: "operator",
                operator_id: input.operatorId,
            })
            .eq("org_id", input.orgId)
            .eq("case_id", input.caseId)
            .eq("subject_ref", u.subjectRef);

        // The decision is durable. Record its lifecycle consequence through the
        // ONE canonical lineage service — never by constructing an observation
        // here. Non-blocking: it cannot fail this commit selection.
        const resolutionId = (existing as { id?: string } | null)?.id;
        if (input.trustLineage !== false && resolutionId) {
            await recordOperatorDecisionLifecycle(supabase, {
                orgId: input.orgId,
                caseId: input.caseId,
                resolutionId,
                actorId: input.operatorId,
                deps: typeof input.trustLineage === "object" ? input.trustLineage : undefined,
            });
        }
    }
}
