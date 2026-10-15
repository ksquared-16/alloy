import { NextRequest, NextResponse } from "next/server";
import { emitEvent } from "@/lib/emitEvent";
import { summarizeLeadCommitRecords } from "@/lib/pos/leadCommitRecords";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbCompleteProcessingCaseWithResult } from "@/lib/pos/processingCase/processingCaseDb";
import { runMinimalDestinationHandoff } from "@/lib/pos/processingCase/approveHandoff";
import {
    commitApprovedLeadForCase,
} from "@/lib/pos/processingIdentity/operator";
import { operatorErrorResponse, resolveOperatorRoute } from "@/lib/pos/processingIdentity/operator/operatorRouteContext";
import { PROCESSING_OPERATE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { persistIntakePersonAddressFieldValues } from "@/lib/pos/processingIdentity/operator/persistIntakePersonAddress";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { fetchDepartmentMetadataForWorkUnit } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { resolveCreateLeadWorkViewForHandoff } from "@/lib/platform/commands/createLead/resolveCreateLeadWorkViewForHandoff";

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
            const denied = requireProcessingCapability(resolved.ctx, PROCESSING_OPERATE);
            if (denied) return denied;
            try {
                const { attempt } = await commitApprovedLeadForCase(resolved.deps, { caseId: resolved.caseId });
                if (attempt.outcome !== "committed") {
                    // Partial / failed / preflight-rejected — leave the case open; the executor
                    // has already recorded the exception. Surface it rather than completing.
                    return jsonData({ caseId, status: row.status, attempt, blocked: true });
                }

                const committedRecord = (...commandKeys: string[]): string | null =>
                    attempt.operations.find((o) => commandKeys.includes(o.commandKey) && o.status === "committed")
                        ?.recordId ?? null;
                const leadId = committedRecord("create_lead") ?? committedRecord("update_lead");

                // The canonical lead as committed — the same row BOS → Create Lead hands off from. Its
                // owner (work unit), stage and status decide the Work View the record lands in; its person
                // and household are the records the operator can open, whether they were created here or
                // an existing family was linked.
                const { data: leadRowData } = leadId
                    ? await supabase
                          .from("opportunities")
                          .select("id, customer_id, primary_person_id, work_unit_id, status_key, stage_key")
                          .eq("org_id", ctx.orgId)
                          .eq("id", leadId)
                          .maybeSingle()
                    : { data: null };
                const leadRow = leadRowData as {
                    customer_id?: string | null;
                    primary_person_id?: string | null;
                    work_unit_id?: string | null;
                    status_key?: string | null;
                    stage_key?: string | null;
                } | null;

                // Created vs reused, per record, from the PLANNED kind of each committed operation.
                const { records, createdRecords, matchedExisting } = summarizeLeadCommitRecords(attempt.operations, leadRow);
                const personId = createdRecords.person ? records.person : null;

                // Phase 1 — populate the committed Person's canonical address (incl. ZIP) through the
                // canonical field system. ZIP is identity, not intake: this reuses the same writer as the
                // manual Create-Lead path. Never blocks the commit.
                //
                // The address goes onto the person the lead actually belongs to — the newly created
                // person, or (on a LINK decision, where there is no create_person op) the existing
                // person the lead was linked to, read back from the committed opportunity's
                // primary_person_id. Without this fallback, linking an existing parent silently dropped
                // the submitted ZIP.
                const addressPersonId: string | null = personId ?? leadRow?.primary_person_id ?? null;
                if (addressPersonId) {
                    try {
                        await persistIntakePersonAddressFieldValues(supabase, {
                            orgId: ctx.orgId,
                            personId: addressPersonId,
                            caseMetadata: row.metadata ?? null,
                        });
                    } catch {
                        /* canonical-field population is best-effort — the lead is already committed */
                    }
                }
                // WHERE THE OPERATOR GOES NEXT — the Work View BOS → Create Lead hands off to, resolved the
                // same way from the same lead. Best-effort: the commit has already succeeded.
                const workUnitId = leadRow?.work_unit_id?.trim() || null;
                const statusKey = leadRow?.status_key?.trim() || null;
                const stageKey = leadRow?.stage_key?.trim() || "lead";
                let workViewId: string | null = null;
                let workViewRouteKey: string | null = null;
                if (workUnitId) {
                    try {
                        const departmentMetadata = await fetchDepartmentMetadataForWorkUnit(supabase, ctx.orgId, workUnitId);
                        const handoff = resolveCreateLeadWorkViewForHandoff({ departmentMetadata, statusKey, stageKey });
                        workViewId = handoff?.workViewId ?? null;
                        workViewRouteKey = handoff?.workViewRouteKey ?? null;
                    } catch {
                        /* routing enrichment is best-effort */
                    }
                }

                const operationalResult = {
                    kind: "lead",
                    recordType: "opportunity",
                    recordId: leadId,
                    // `created` is the LEAD. Whether the family was new or an existing one was linked is
                    // stated per record — a matched family must never read as created.
                    created: createdRecords.lead,
                    records,
                    createdRecords,
                    matchedExisting,
                    handoff: { workUnitId, workViewId, workViewRouteKey, statusKey, stageKey },
                    attemptId: attempt.attemptId,
                };

                await dbCompleteProcessingCaseWithResult(supabase, { orgId: ctx.orgId, caseId, result: operationalResult });

                // The same `action_executed` activity BOS → Create Lead records on the lead, carrying where
                // this one came from: the public form submission and the Processing case that accepted it.
                if (leadId && createdRecords.lead) {
                    try {
                        const meta = row.metadata ?? {};
                        await emitEvent({
                            org_id: ctx.orgId,
                            event_type: "action_executed",
                            entity_type: "opportunities",
                            entity_id: leadId,
                            payload: {
                                action_key: "create_lead",
                                actor_user_id: ctx.userId ?? null,
                                source: "public_form",
                                processing_case_id: caseId,
                                form_submission_id: typeof meta.form_submission_id === "string" ? meta.form_submission_id : null,
                                form_definition_id: typeof meta.form_definition_id === "string" ? meta.form_definition_id : null,
                                matched_existing: operationalResult.matchedExisting,
                            },
                        });
                    } catch {
                        /* activity is best-effort — the lead is already committed */
                    }
                }
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
