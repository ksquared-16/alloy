/**
 * D7 — the document review lifecycle and validity dates, through their governed database functions.
 *
 *   review     pending → accepted | rejected (a rejection needs a reason). A version already decided is RE-REVIEWED —
 *              accepted ↔ rejected, or reopened to pending — only by an actor with re-review authority
 *              (`processing.documents.manage`, the Documents administrative authority that also governs waivers and the
 *              Studio), and always with a reason. `documents.write` alone takes a version's FIRST decision.
 *   validity   effective / expiration dates of the current version (`documents.write`); the review is untouched.
 *
 * Every decision and every date change is a row of `document_version_review_events` (append-only, D7 migration), so
 * the record keeps every reviewer, decision and reason — not only the latest. The functions refuse an unavailable
 * (quarantined, deleted, restricted, superseded) document and any version but the current one, whatever the caller
 * checked first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isIsoDate } from "@/lib/documents/validity/documentValidity";

/** Re-review authority. Not a new catalog key (W-11): the Documents administrative authority. */
export const DOCUMENT_REREVIEW_PERMISSION = "processing.documents.manage" as const;

export function actorMayRereview(ctx: { permissionKeys?: readonly string[] | null }): boolean {
    return (ctx.permissionKeys ?? []).includes(DOCUMENT_REREVIEW_PERMISSION);
}

export type ReviewDecision = "accepted" | "rejected" | "pending";
export type ReviewEvent = {
    id: string;
    document_id: string;
    version_id: string;
    kind: "review" | "validity";
    decision: "accepted" | "rejected" | "reopened" | null;
    previous_review_status: string | null;
    reason: string | null;
    effective_on: string | null;
    expires_on: string | null;
    previous_effective_on: string | null;
    previous_expires_on: string | null;
    actor: string | null;
    created_at: string;
};
export const REVIEW_EVENT_COLUMNS =
    "id, document_id, version_id, kind, decision, previous_review_status, reason, effective_on, expires_on, previous_effective_on, previous_expires_on, actor, created_at";

export type ReviewWriteResult<T> = { ok: true; value: T } | { ok: false; code: string; status: number };

const REFUSALS: Array<[RegExp, string, number]> = [
    [/document_review_already_decided/, "REREVIEW_REQUIRED", 409],
    [/document_review_reason_required/, "REASON_REQUIRED", 400],
    [/document_review_already_pending/, "ALREADY_PENDING", 409],
    [/document_review_not_current_version/, "NOT_CURRENT_VERSION", 409],
    [/document_review_document_unavailable/, "DOCUMENT_UNAVAILABLE", 409],
    [/document_review_document_not_found/, "NOT_FOUND", 404],
    [/document_review_decision_invalid/, "BAD_REQUEST", 400],
    [/document_validity_range_inverted/, "VALIDITY_RANGE_INVERTED", 400],
];

function refusal(error: { message?: string } | null | undefined): { ok: false; code: string; status: number } {
    const message = error?.message ?? "";
    for (const [re, code, status] of REFUSALS) if (re.test(message)) return { ok: false, code, status };
    return { ok: false, code: "REVIEW_FAILED", status: 500 };
}

export async function reviewDocumentVersion(
    supabase: SupabaseClient,
    input: { orgId: string; documentId: string; versionId: string; decision: ReviewDecision; reason: string | null; actorUserId: string; rereview: boolean },
): Promise<ReviewWriteResult<{ event_id: string; review_status: string; previous_review_status: string | null; rereview: boolean }>> {
    const { data, error } = await supabase.rpc("document_review_version", {
        p_org_id: input.orgId,
        p_document_id: input.documentId,
        p_version_id: input.versionId,
        p_decision: input.decision,
        p_reason: input.reason,
        p_actor: input.actorUserId,
        p_rereview: input.rereview,
    });
    if (error) return refusal(error);
    return { ok: true, value: data as { event_id: string; review_status: string; previous_review_status: string | null; rereview: boolean } };
}

export async function setDocumentVersionValidity(
    supabase: SupabaseClient,
    input: { orgId: string; documentId: string; versionId: string; effectiveOn: string | null; expiresOn: string | null; reason: string | null; actorUserId: string },
): Promise<ReviewWriteResult<{ changed: boolean; effective_on: string | null; expires_on: string | null }>> {
    if ((input.effectiveOn && !isIsoDate(input.effectiveOn)) || (input.expiresOn && !isIsoDate(input.expiresOn))) return { ok: false, code: "BAD_DATE", status: 400 };
    if (input.effectiveOn && input.expiresOn && input.expiresOn < input.effectiveOn) return { ok: false, code: "VALIDITY_RANGE_INVERTED", status: 400 };
    const { data, error } = await supabase.rpc("document_set_version_validity", {
        p_org_id: input.orgId,
        p_document_id: input.documentId,
        p_version_id: input.versionId,
        p_effective_on: input.effectiveOn,
        p_expires_on: input.expiresOn,
        p_reason: input.reason,
        p_actor: input.actorUserId,
    });
    if (error) return refusal(error);
    return { ok: true, value: data as { changed: boolean; effective_on: string | null; expires_on: string | null } };
}

/** A document's review and validity history, oldest first. Null when it could not be read. */
export async function listReviewEvents(supabase: SupabaseClient, orgId: string, documentId: string): Promise<ReviewEvent[] | null> {
    const { data, error } = await supabase
        .from("document_version_review_events")
        .select(REVIEW_EVENT_COLUMNS)
        .eq("org_id", orgId)
        .eq("document_id", documentId)
        .order("created_at", { ascending: true });
    if (error) return null;
    return (data ?? []) as ReviewEvent[];
}
