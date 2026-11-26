/**
 * D6 — who may waive a document requirement, and the subject/clearance checks every requirement route shares.
 *
 * WAIVE / REVOKE: `processing.documents.manage` — the Documents administrative authority (admin-only by default) that
 * already governs the Studio, never `documents.write`, which `ops` holds everywhere. A waiver is a policy decision
 * about a requirement, not a document operation. No new catalog key is minted: that is a Director decision (W-11), and
 * the Enrollment precedent (`enrollment.requirement_exception.manage`) is Enrollment's own stage-exception key, which
 * a Documents waiver must not borrow.
 *
 * On top of the capability, a waiver needs:
 *   - the subject inside the actor's department/site scope (else 404, indistinguishable from absent);
 *   - clearance for the requirement's document class (a medical requirement is waived only by someone who may see
 *     medical documents), else 403 SENSITIVE_REQUIREMENT.
 * The database independently refuses ineligible policy, wrong grain, unresolved or foreign subjects and missing
 * reasons.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { requireProcessingCapability } from "@/lib/access/processingAuthority";
import { assertEntityDrawerRecordReadable, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { documentSubjectInActorScope } from "@/lib/documents/assertDocumentAccess";
import { legacyEntityTypeForSubject } from "@/lib/documents/documentSubjects";
import type { RequirementSubjectType } from "@/lib/documents/requirements/documentRequirementPolicy";

export const DOCUMENT_REQUIREMENT_WAIVE = "processing.documents.manage" as const;

export function requireRequirementWaiver(ctx: { permissionKeys?: readonly string[] | null }): NextResponse | null {
    return requireProcessingCapability(ctx, DOCUMENT_REQUIREMENT_WAIVE);
}

const TABLE_FOR: Record<RequirementSubjectType, string> = {
    household: "customers",
    person: "persons",
    child: "customer_members",
    opportunity: "opportunities",
};

/**
 * May this actor act on document requirements of this subject? The record must be one the actor may open AND inside
 * the actor's DOCUMENT scope — the same predicate readiness and work apply to subjects — so a waiver can never be
 * granted for a subject whose readiness the actor cannot see (children, households and people need an unrestricted
 * scope, fail closed, as in D2/D4). Fails closed without a scope.
 */
export async function requirementSubjectReadable(
    supabase: SupabaseClient,
    orgId: string,
    scope: AdminAccessScopeDimensions | null,
    subject: { subject_type: string; subject_id: string },
): Promise<boolean> {
    if (!scope) return false;
    const table = TABLE_FOR[subject.subject_type as RequirementSubjectType];
    if (!table) return false;
    const inDocumentScope = await documentSubjectInActorScope(supabase, orgId, scope, {
        entityType: legacyEntityTypeForSubject(subject.subject_type as RequirementSubjectType),
        entityId: subject.subject_id,
    });
    if (!inDocumentScope) return false;
    return assertEntityDrawerRecordReadable(supabase, orgId, scope, table, subject.subject_id);
}

export const SENSITIVE_REQUIREMENT = {
    body: { ok: false, error: "This requirement concerns documents you are not cleared to see.", code: "SENSITIVE_REQUIREMENT" },
    status: 403,
} as const;
