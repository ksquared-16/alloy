/**
 * REJECT — A REAL PROCESSING DISPOSITION, NOT A SILENT DISAPPEARANCE.
 *
 * Approve is the only outcome that invokes the Commit Engine (decisionOutcomes.ts); this is the other
 * terminal answer an operator can give an intake: "do not create". It:
 *   - creates nothing canonical — no household, person, child, lead or participation;
 *   - closes the case as `completed` with `metadata.disposition = { outcome: "rejected", reason_code,
 *     reason_label, note, actor_id, at }` and an `operational_result` of kind "rejected", so the case
 *     leaves Incoming and is found in Completed, labelled Rejected, with its evidence intact;
 *   - is compare-and-set on the case still being open — a case approved (or rejected) in the meantime
 *     is never re-closed, and approve treats a completed case as already done, so a rejected intake
 *     cannot be approved later;
 *   - writes a `processing_case_rejected` workflow event.
 * The submission itself (payload snapshot, intake meta, facts) is never touched: it is the evidence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidReasonCode, resolveOutcomeReasons } from "@/lib/pos/decisionOutcomes";

export const PROCESSING_REJECTED_EVENT = "processing_case_rejected";
const OPEN_STATUSES = ["received", "processing", "needs_review", "needs_resolution", "ready"] as const;

export type ProcessingRejection = {
    outcome: "rejected";
    reason_code: string;
    reason_label: string;
    note: string | null;
    actor_id: string | null;
    at: string;
};

export type RejectProcessingCaseResult =
    | { ok: true; caseId: string; disposition: ProcessingRejection; alreadyRejected: boolean }
    | { ok: false; status: number; code: string; message: string };

export async function rejectProcessingCase(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        caseId: string;
        reasonCode: string;
        note?: string | null;
        actorId: string | null;
        now?: Date;
        emit?: (event: { org_id: string; event_type: string; entity_type: string; entity_id: string; action_type: string; occurred_at: string; payload: Record<string, unknown> }) => Promise<unknown>;
    },
): Promise<RejectProcessingCaseResult> {
    const reasonCode = (input.reasonCode ?? "").trim();
    if (!isValidReasonCode("rejected", reasonCode)) {
        return { ok: false, status: 400, code: "reason_required", message: "Choose why this intake is rejected." };
    }
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 1000) : null;
    if (reasonCode === "other" && !note) {
        return { ok: false, status: 400, code: "note_required", message: "Say why when the reason is Other." };
    }

    const { data: row, error: readError } = await supabase
        .from("processing_cases")
        .select("id, status, metadata")
        .eq("org_id", input.orgId)
        .eq("id", input.caseId)
        .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) return { ok: false, status: 404, code: "not_found", message: "Case not found." };
    const current = row as { status: string; metadata?: Record<string, unknown> | null };
    const existing = (current.metadata?.disposition ?? null) as ProcessingRejection | null;
    if (existing?.outcome === "rejected") {
        return { ok: true, caseId: input.caseId, disposition: existing, alreadyRejected: true };
    }
    if (!(OPEN_STATUSES as readonly string[]).includes(current.status)) {
        return { ok: false, status: 409, code: "case_closed", message: "This case is already closed; it cannot be rejected." };
    }

    const at = (input.now ?? new Date()).toISOString();
    const disposition: ProcessingRejection = {
        outcome: "rejected",
        reason_code: reasonCode,
        reason_label: resolveOutcomeReasons("rejected").find((r) => r.code === reasonCode)?.label ?? reasonCode,
        note,
        actor_id: input.actorId,
        at,
    };
    const metadata = {
        ...(current.metadata ?? {}),
        disposition,
        operational_result: { kind: "rejected", note: `Rejected — ${disposition.reason_label}`, recorded_at: at },
    };
    const { data: updated, error } = await supabase
        .from("processing_cases")
        .update({ status: "completed", status_changed_at: at, metadata })
        .eq("org_id", input.orgId)
        .eq("id", input.caseId)
        .in("status", [...OPEN_STATUSES])
        .select("id");
    if (error) throw new Error(error.message);
    if (!Array.isArray(updated) || updated.length !== 1) {
        return { ok: false, status: 409, code: "case_closed", message: "This case was closed in the meantime." };
    }
    if (input.emit) {
        await input.emit({
            org_id: input.orgId,
            event_type: PROCESSING_REJECTED_EVENT,
            entity_type: "processing_case",
            entity_id: input.caseId,
            action_type: "processing_reject",
            occurred_at: at,
            payload: { processing_case_id: input.caseId, reason_code: reasonCode, note, operator_id: input.actorId },
        }).catch((e) => console.warn("[processing reject] event failed", e instanceof Error ? e.message : e));
    }
    return { ok: true, caseId: input.caseId, disposition, alreadyRejected: false };
}
