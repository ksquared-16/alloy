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

// ---------------------------------------------------------------------------
// Configuration authoring — server-authoritative, org-scoped
// ---------------------------------------------------------------------------

export type UpsertQualificationTypeInput = {
    orgId: string;
    id?: string | null;
    key?: string | null;
    label: string;
    description?: string | null;
    category?: string | null;
    expirationExpected?: boolean;
    defaultValidityDays?: number | null;
    evidenceRequiredDefault?: boolean;
    isActive?: boolean;
};

/** Create or amend a qualification type. The KEY is immutable once set. */
export async function upsertQualificationType(
    supabase: SupabaseClient,
    input: UpsertQualificationTypeInput,
) {
    const orgId = trim(input.orgId);
    const label = trim(input.label);
    if (!orgId || !label) {
        throw new StaffQualificationError("invalid_input", "A qualification type needs a label.");
    }
    const patch: Record<string, unknown> = {
        label,
        description: trim(input.description),
        category: trim(input.category),
        updated_at: new Date().toISOString(),
    };
    if (input.expirationExpected !== undefined) patch.expiration_expected = !!input.expirationExpected;
    if (input.evidenceRequiredDefault !== undefined) patch.evidence_required_default = !!input.evidenceRequiredDefault;
    if (input.isActive !== undefined) patch.is_active = !!input.isActive;
    if (input.defaultValidityDays !== undefined) {
        const n = Number(input.defaultValidityDays);
        if (input.defaultValidityDays !== null && (!Number.isFinite(n) || n <= 0)) {
            throw new StaffQualificationError("invalid_input", "Default validity must be a positive number of days.");
        }
        patch.default_validity_days = input.defaultValidityDays === null ? null : n;
    }

    if (trim(input.id)) {
        const { data, error } = await supabase
            .from("staff_qualification_types")
            .update(patch)
            .eq("id", trim(input.id))
            .eq("org_id", orgId)
            .select("id")
            .single();
        if (error) throw new StaffQualificationError("db_error", error.message);
        return data as unknown as { id: string };
    }

    // A new type derives its key from the label when the operator did not supply
    // one. The key is the stable identity configuration is authored against; the
    // label is presentation and a tenant may rename it.
    const key = trim(input.key) ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 63);
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) {
        throw new StaffQualificationError("invalid_input", "That label cannot be turned into a key; supply one explicitly.");
    }
    const { data, error } = await supabase
        .from("staff_qualification_types")
        .insert({ org_id: orgId, key, ...patch })
        .select("id")
        .single();
    if (error) {
        throw new StaffQualificationError(
            /duplicate key/i.test(error.message) ? "conflict" : "db_error",
            /duplicate key/i.test(error.message)
                ? "A qualification type with that key already exists in this organization."
                : error.message,
        );
    }
    return data as unknown as { id: string };
}

export type UpsertQualificationRequirementInput = {
    orgId: string;
    id?: string | null;
    qualificationTypeId: string;
    scopeType: "organization" | "position" | "site" | "assignment_type";
    scopeId?: string | null;
    requirementLevel: string;
    evidenceRequired?: boolean;
    effectiveStart?: string | null;
    effectiveEnd?: string | null;
    isActive?: boolean;
};

const REQUIREMENT_LEVELS = ["off", "suggested", "recommended", "required", "enforced"];

/**
 * Create or amend a requirement contribution.
 *
 * The scope TARGET is verified to belong to this organization. That check is not
 * decoration: a requirement naming another tenant's site would silently never
 * apply, which is worse than an error because it looks configured.
 */
export async function upsertQualificationRequirement(
    supabase: SupabaseClient,
    input: UpsertQualificationRequirementInput,
) {
    const orgId = trim(input.orgId);
    const typeId = trim(input.qualificationTypeId);
    if (!orgId || !typeId) {
        throw new StaffQualificationError("invalid_input", "A requirement needs an organization and a qualification type.");
    }
    if (!REQUIREMENT_LEVELS.includes(input.requirementLevel)) {
        throw new StaffQualificationError("invalid_input", `Requirement level must be one of: ${REQUIREMENT_LEVELS.join(", ")}.`);
    }
    const scopeType = input.scopeType;
    const scopeId = trim(input.scopeId);
    if (scopeType === "organization" && scopeId) {
        throw new StaffQualificationError("invalid_input", "An organization-wide requirement does not name a target.");
    }
    if (scopeType !== "organization" && !scopeId) {
        throw new StaffQualificationError("invalid_input", "That scope needs a target.");
    }

    // The type must be ours.
    const { data: type } = await supabase
        .from("staff_qualification_types").select("id").eq("id", typeId).eq("org_id", orgId).maybeSingle();
    if (!type) throw new StaffQualificationError("not_found", "That qualification type does not belong to this organization.");

    // And so must the target.
    if (scopeId) {
        const table =
            scopeType === "position" ? "employment_positions"
            : scopeType === "site" ? "locations"
            : "operational_assignment_types";
        const { data: target } = await supabase.from(table).select("id").eq("id", scopeId).eq("org_id", orgId).maybeSingle();
        if (!target) {
            throw new StaffQualificationError("not_found", "That requirement target does not belong to this organization.");
        }
    }

    const row: Record<string, unknown> = {
        org_id: orgId,
        qualification_type_id: typeId,
        scope_type: scopeType,
        scope_id: scopeId,
        requirement_level: input.requirementLevel,
        evidence_required: !!input.evidenceRequired,
        effective_start: trim(input.effectiveStart),
        effective_end: trim(input.effectiveEnd),
        updated_at: new Date().toISOString(),
    };
    if (input.isActive !== undefined) row.is_active = !!input.isActive;

    if (trim(input.id)) {
        const { data, error } = await supabase
            .from("staff_qualification_requirements").update(row)
            .eq("id", trim(input.id)).eq("org_id", orgId).select("id").single();
        if (error) throw new StaffQualificationError("db_error", error.message);
        return data as unknown as { id: string };
    }
    const { data, error } = await supabase
        .from("staff_qualification_requirements").insert(row).select("id").single();
    if (error) {
        throw new StaffQualificationError(
            /duplicate key/i.test(error.message) ? "conflict" : "db_error",
            /duplicate key/i.test(error.message)
                ? "That qualification already has a requirement at this scope. Edit the existing one."
                : error.message,
        );
    }
    return data as unknown as { id: string };
}
