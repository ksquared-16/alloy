/**
 * Staff qualifications — the server-authoritative service.
 *
 * Every decision lives in `staffQualificationModel`; this file only fetches rows
 * and hands them to it. That split is deliberate: the model is the part that
 * must be provable, and it stays testable without a database.
 *
 * RENEWAL SUPERSEDES, IT DOES NOT OVERWRITE. Renewing inserts a new row pointing
 * at the old one, so "what did we believe in March" survives. Nothing here
 * mutates a held qualification's dates to represent a renewal.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    resolveEffectiveQualificationRequirements,
    resolveRequirementSatisfaction,
    qualificationStanding,
    daysUntilExpiry,
    type QualificationRequirementRow,
    type QualificationWorkContext,
    type StaffQualificationRow,
} from "@/lib/staffQualifications/staffQualificationModel";

export class StaffQualificationError extends Error {
    readonly code: "not_found" | "conflict" | "invalid_input" | "db_error";
    constructor(code: StaffQualificationError["code"], message: string) {
        super(message);
        this.name = "StaffQualificationError";
        this.code = code;
    }
}

const QUALIFICATION_COLUMNS =
    "id, org_id, employment_id, qualification_type_id, issued_on, expires_on, " +
    "verification_state, verified_at, supersedes_qualification_id, revoked_at";

const trim = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return s === "" ? null : s;
};

/** Qualification vocabulary for one org. */
export async function listQualificationTypes(
    supabase: SupabaseClient,
    orgId: string,
    options: { includeInactive?: boolean } = {},
) {
    let q = supabase
        .from("staff_qualification_types")
        .select("id, key, label, description, category, expiration_expected, default_validity_days, evidence_required_default, is_active, sort_order")
        .eq("org_id", orgId);
    if (!options.includeInactive) q = q.eq("is_active", true);
    const { data, error } = await q.order("sort_order").order("label");
    if (error) throw new StaffQualificationError("db_error", error.message);
    return data ?? [];
}

/** Every qualification held by one employment, newest first, with evidence counts. */
export async function listQualificationsForEmployment(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
    asOf: string,
) {
    const { data, error } = await supabase
        .from("staff_qualifications")
        .select(QUALIFICATION_COLUMNS)
        .eq("org_id", orgId)
        .eq("employment_id", employmentId)
        .order("expires_on", { ascending: false, nullsFirst: false });
    if (error) throw new StaffQualificationError("db_error", error.message);
    // The generated Supabase types do not yet know these tables, so the cast
    // goes through unknown. The SHAPE is guaranteed by QUALIFICATION_COLUMNS.
    const rows = (data ?? []) as unknown as StaffQualificationRow[];

    const evidence = new Map<string, number>();
    if (rows.length > 0) {
        const { data: ev } = await supabase
            .from("staff_qualification_evidence")
            .select("staff_qualification_id")
            .eq("org_id", orgId)
            .in("staff_qualification_id", rows.map((r) => r.id));
        for (const e of (ev ?? []) as { staff_qualification_id: string }[]) {
            evidence.set(e.staff_qualification_id, (evidence.get(e.staff_qualification_id) ?? 0) + 1);
        }
    }

    return rows.map((row) => ({
        ...row,
        standing: qualificationStanding(row, asOf),
        days_until_expiry: daysUntilExpiry(row.expires_on, asOf),
        evidence_count: evidence.get(row.id) ?? 0,
    }));
}

/** Requirement policy rows for one org. Resolution happens in the model. */
export async function listQualificationRequirements(
    supabase: SupabaseClient,
    orgId: string,
): Promise<QualificationRequirementRow[]> {
    const { data, error } = await supabase
        .from("staff_qualification_requirements")
        .select("id, org_id, qualification_type_id, scope_type, scope_id, requirement_level, evidence_required, effective_start, effective_end, is_active")
        .eq("org_id", orgId);
    if (error) throw new StaffQualificationError("db_error", error.message);
    return (data ?? []) as unknown as QualificationRequirementRow[];
}

/**
 * The composed answer for a work context: what is required, why, and what
 * satisfies it. This is the projection the later Readiness slice consumes — it
 * returns gaps with reasons, and persists nothing.
 */
export async function resolveQualificationStateForWorkContext(
    supabase: SupabaseClient,
    orgId: string,
    ctx: QualificationWorkContext,
) {
    const [requirementRows, held] = await Promise.all([
        listQualificationRequirements(supabase, orgId),
        listQualificationsForEmployment(supabase, orgId, ctx.employmentId, ctx.asOf),
    ]);
    const requirements = resolveEffectiveQualificationRequirements(requirementRows, ctx);
    const evidenceCounts = new Map(held.map((h) => [h.id, h.evidence_count]));
    const satisfaction = resolveRequirementSatisfaction(
        requirements,
        held as unknown as StaffQualificationRow[],
        ctx,
        evidenceCounts,
    );
    return { held, requirements, satisfaction };
}

export type RecordQualificationInput = {
    orgId: string;
    employmentId: string;
    qualificationTypeId: string;
    issuedOn?: string | null;
    expiresOn?: string | null;
    /** Renewal: the row this one replaces. History is kept, never overwritten. */
    supersedesQualificationId?: string | null;
    actorUserId?: string | null;
};

/** Record a held qualification. Renewal passes `supersedesQualificationId`. */
export async function recordQualification(
    supabase: SupabaseClient,
    input: RecordQualificationInput,
) {
    const orgId = trim(input.orgId);
    const employmentId = trim(input.employmentId);
    const typeId = trim(input.qualificationTypeId);
    if (!orgId || !employmentId || !typeId) {
        throw new StaffQualificationError("invalid_input", "Organization, employment and qualification type are required.");
    }
    // The employment must belong to this organization — the grain is not taken on trust.
    const { data: emp } = await supabase
        .from("employments").select("id").eq("id", employmentId).eq("org_id", orgId).maybeSingle();
    if (!emp) throw new StaffQualificationError("not_found", "That employment does not belong to this organization.");

    const { data, error } = await supabase
        .from("staff_qualifications")
        .insert({
            org_id: orgId,
            employment_id: employmentId,
            qualification_type_id: typeId,
            issued_on: trim(input.issuedOn),
            expires_on: trim(input.expiresOn),
            supersedes_qualification_id: trim(input.supersedesQualificationId),
            created_by: trim(input.actorUserId),
            updated_by: trim(input.actorUserId),
        })
        .select(QUALIFICATION_COLUMNS)
        .single();
    if (error) throw new StaffQualificationError("db_error", error.message);
    return data as unknown as StaffQualificationRow;
}

/** Verification is an operator judgement, recorded with who and when. */
export async function verifyQualification(
    supabase: SupabaseClient,
    orgId: string,
    qualificationId: string,
    state: "verified" | "rejected",
    actorUserId: string | null,
) {
    const { data, error } = await supabase
        .from("staff_qualifications")
        .update({
            verification_state: state,
            verified_at: new Date().toISOString(),
            verified_by: trim(actorUserId),
            updated_by: trim(actorUserId),
            updated_at: new Date().toISOString(),
        })
        .eq("id", qualificationId)
        .eq("org_id", orgId)
        .select(QUALIFICATION_COLUMNS)
        .single();
    if (error) throw new StaffQualificationError("db_error", error.message);
    return data as unknown as StaffQualificationRow;
}

/** Attach EXISTING evidence. The artifact stays where it already lives. */
export async function attachQualificationEvidence(
    supabase: SupabaseClient,
    orgId: string,
    qualificationId: string,
    documentId: string,
    formSubmissionId: string | null,
    actorUserId: string | null,
) {
    const { error } = await supabase.from("staff_qualification_evidence").insert({
        org_id: orgId,
        staff_qualification_id: qualificationId,
        document_id: documentId,
        form_submission_id: trim(formSubmissionId),
        created_by: trim(actorUserId),
    });
    if (error) throw new StaffQualificationError(/duplicate key/i.test(error.message) ? "conflict" : "db_error", error.message);
}
