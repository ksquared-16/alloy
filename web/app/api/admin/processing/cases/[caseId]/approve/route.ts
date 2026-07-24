import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbCompleteProcessingCaseWithResult } from "@/lib/pos/processingCase/processingCaseDb";
import { runMinimalDestinationHandoff } from "@/lib/pos/processingCase/approveHandoff";
import {
    commitApprovedLeadForCase,
    operatorErrorResponse,
    resolveOperatorRoute,
} from "@/lib/pos/processingIdentity/operator";
import { persistIntakePersonAddressFieldValues } from "@/lib/pos/processingIdentity/operator/persistIntakePersonAddress";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/approve
 *
 * Approving a Processing Case commits its recommendation and flips the case to
 * `completed`. Idempotent: an already-completed/archived case returns its prior
 * result without re-writing.
 *
 * For a **form_submission** (lead intake) case, approval runs the *complete*
 * identity commit — build → approve → execute — producing the full record set
 * (household + child + person + link + lead + enrollment participation), so a
 * committed public lead is immediately enrollable. Review gates are inherited from
 * the identity services: a plausible existing-record match throws
 * `identity_review_required` and does NOT auto-commit (the operator resolves it in
 * the identity review panel), preserving duplicate prevention.
 *
 * For any other source, approval performs the minimal destination handoff (records
 * own truth — see approveHandoff).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();

    try {
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id, status, case_type, metadata")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        const row = caseRow as { status: string; case_type?: string | null; metadata?: Record<string, unknown> };
        if (row.status === "completed" || row.status === "archived") {
            return jsonData({
                caseId,
                status: row.status,
                operationalResult: row.metadata?.operational_result ?? null,
                alreadyDone: true,
            });
        }

        // Lead intake: run the complete identity commit (full lead → enrollment participation).
        if (row.case_type === "form_submission") {
            const resolved = await resolveOperatorRoute(caseId);
            if (resolved instanceof NextResponse) return resolved;
            try {
                const { attempt } = await commitApprovedLeadForCase(resolved.deps, { caseId: resolved.caseId });
                if (attempt.outcome !== "committed") {
                    // Partial / failed / preflight-rejected — leave the case open; the executor
                    // has already recorded the exception. Surface it rather than completing.
                    return jsonData({ caseId, status: row.status, attempt, blocked: true });
                }

                const committedRecord = (commandKey: string): string | null =>
                    attempt.operations.find((o) => o.commandKey === commandKey && o.status === "committed")?.recordId ??
                    null;
                const leadId = committedRecord("create_lead");
                const personId = committedRecord("create_person");

                // Phase 1 — populate the committed Person's canonical address (incl. ZIP) through the
                // canonical field system. ZIP is identity, not intake: this reuses the same writer as the
                // manual Create-Lead path. Never blocks the commit.
                if (personId) {
                    try {
                        await persistIntakePersonAddressFieldValues(supabase, {
                            orgId: ctx.orgId,
                            personId,
                            caseMetadata: row.metadata ?? null,
                        });
                    } catch {
                        /* canonical-field population is best-effort — the lead is already committed */
                    }
                }
                const operationalResult = {
                    kind: "lead",
                    recordType: "opportunity",
                    recordId: leadId,
                    created: true,
                    records: {
                        household: committedRecord("create_household"),
                        child: committedRecord("create_child"),
                        person: committedRecord("create_person"),
                        lead: leadId,
                        participation: committedRecord("create_process_participation"),
                    },
                    attemptId: attempt.attemptId,
                };

                await dbCompleteProcessingCaseWithResult(supabase, { orgId: ctx.orgId, caseId, result: operationalResult });
                return jsonData({ caseId, status: "completed", operationalResult, attempt });
            } catch (e) {
                // identity_review_required (plausible match needs an operator decision), stale
                // plan, unauthorized, etc. — surface with the operator error mapping.
                return operatorErrorResponse(e);
            }
        }

        // Non-form source: minimal destination handoff.
        const { data: src, error: srcErr } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", ctx.orgId)
            .eq("processing_case_id", caseId)
            .eq("role", "primary")
            .maybeSingle();
        if (srcErr) throw new Error(srcErr.message);

        const source = (src as { source_kind: string; source_id: string } | null) ?? null;
        const operationalResult = await runMinimalDestinationHandoff(supabase, ctx.orgId, source);

        // FP7: a case whose form lacks the required mapping (no person.email binding,
        // or the bound field was empty) must NOT silently complete. Leave it open so an
        // operator can fix the mapping and re-approve.
        if (operationalResult.kind === "needs_mapping") {
            return jsonData({ caseId, status: row.status, operationalResult, blocked: true });
        }

        await dbCompleteProcessingCaseWithResult(supabase, { orgId: ctx.orgId, caseId, result: operationalResult });
        return jsonData({ caseId, status: "completed", operationalResult });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to approve processing case" },
            { status: 500 }
        );
    }
}
