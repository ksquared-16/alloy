import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { buildFormDraftForCaseSafe, type FormDraftStageTiming } from "@/lib/pos/processingCase/formDraft/buildFormDraftForCaseSafe";
import { dbRecordFormDraftDetection } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";

export const dynamic = "force-dynamic";

/**
 * Bounded server-side cap for one detection run. Native-text + layout extraction completes in
 * seconds; a run that exceeds this is a reliability defect, not acceptable latency. We stop
 * waiting, record a durable failure the operator can retry, and never let the request hang.
 * (The old path had no cap — a slow/looping extraction pinned the request for minutes.)
 */
const DETECT_TIMEOUT_MS = 60_000;

class DetectTimeout extends Error {
    constructor() {
        super("detect_timeout");
    }
}

/**
 * POST /api/admin/processing/cases/[caseId]/form-draft — POS-FP12/FP15 (Workflow A).
 *
 * "Create form from document": recreate the case's primary document structure as a draft Alloy
 * form and store it on the case (`metadata.form_draft_preview`). PREVIEW ONLY — no form_definition,
 * nothing published, no records change. Org-scoped.
 *
 * Reliability (FP15): bounded timeout + per-stage timings + a durable detection record so a
 * hung/failed run is a visible, retryable state instead of an endless spinner. Idempotent —
 * retrying re-runs detection and overwrites the draft.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();
    const stages: FormDraftStageTiming[] = [];
    const startedAt = Date.now();

    try {
        // Case must exist and belong to the org.
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        // Race the pipeline against a hard timeout AND the client's abort signal (navigation/cancel),
        // so the request never outlives either. The pipeline itself never throws (best-effort).
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new DetectTimeout()), DETECT_TIMEOUT_MS);
        });
        const abort = new Promise<never>((_, reject) => {
            const sig = request.signal;
            if (sig?.aborted) reject(new DOMException("aborted", "AbortError"));
            sig?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });

        const pipeline = buildFormDraftForCaseSafe(
            supabase,
            { orgId: ctx.orgId, caseId },
            { onStage: (t) => stages.push(t) }
        );

        const draft = await Promise.race([pipeline, timeout, abort]).finally(() => timer && clearTimeout(timer));

        if (!draft) {
            await dbRecordFormDraftDetection(supabase, {
                orgId: ctx.orgId,
                caseId,
                record: { status: "error", stages, total_ms: Date.now() - startedAt, reason: "no_document_source", at: new Date().toISOString() },
            });
            return jsonError("Could not create a form draft — this case has no document source.", 422);
        }

        await dbRecordFormDraftDetection(supabase, {
            orgId: ctx.orgId,
            caseId,
            record: { status: "ok", stages, total_ms: Date.now() - startedAt, at: new Date().toISOString() },
        });
        return jsonData({ caseId, form_draft_preview: draft, detection: { stages, total_ms: Date.now() - startedAt } });
    } catch (e) {
        const isTimeout = e instanceof DetectTimeout;
        const isAbort = e instanceof DOMException && e.name === "AbortError";
        // Record a durable, retryable failure state (unless the CLIENT cancelled — then there is no defect).
        if (!isAbort) {
            await dbRecordFormDraftDetection(supabase, {
                orgId: ctx.orgId,
                caseId,
                record: {
                    status: isTimeout ? "timeout" : "error",
                    stages,
                    total_ms: Date.now() - startedAt,
                    reason: e instanceof Error ? e.message : "detect_failed",
                    at: new Date().toISOString(),
                },
            }).catch(() => {});
        }
        if (isAbort) return jsonError("Detection cancelled.", 499);
        if (isTimeout) {
            return NextResponse.json(
                { error: "Reading this document took too long and was stopped. You can try again.", detection: { status: "timeout", stages } },
                { status: 504 }
            );
        }
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create form draft", detection: { status: "error", stages } },
            { status: 500 }
        );
    }
}
