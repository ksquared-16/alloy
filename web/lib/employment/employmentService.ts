/**
 * Employment service — the one code owner for employment reads and writes.
 *
 * Every mutation goes through here; nothing writes `employments` directly and no
 * client writes the table at all (RLS restricts it to operator roles, and the
 * registered actions are the only sanctioned callers).
 *
 * Boundaries this service holds:
 *  - Identity stays on `persons`. Employment stores a reference, never a copy.
 *  - Employment is NOT access. Nothing here touches auth.users, user_roles,
 *    user_access_profiles, user_site_access or user_department_access.
 *  - History is preserved: ending closes the window; re-hire is a new row.
 *  - Time-bound room/site staffing belongs to `schedule_assignments`. This
 *    service owns only stable employment-level location semantics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    assertValidIsoDate,
    compareIsoDates,
} from "@/lib/childcareOperational/effectiveDating";
import { EmploymentServiceError } from "@/lib/employment/employmentErrors";
import {
    EMPLOYMENT_SELECT_COLUMNS,
    isEmploymentType,
    isOpenEmploymentStatus,
    resolveEmploymentStatusForDates,
    type EmploymentPositionRow,
    type EmploymentRow,
} from "@/lib/employment/employmentTypes";

function trimOrNull(value: unknown): string | null {
    const s = value != null ? String(value).trim() : "";
    return s || null;
}

function requireId(value: unknown, field: string): string {
    const s = trimOrNull(value);
    if (!s) throw new EmploymentServiceError("invalid_input", `${field} is required`);
    return s;
}

/** Postgres raised one of our trigger invariants — surface it as a conflict, not a 500. */
function rethrowDbError(message: string): never {
    const invariant =
        /Overlapping open employment|must belong to the employing organization|archived person|must be a site|same organization and person/i.test(
            message
        );
    throw new EmploymentServiceError(invariant ? "conflict" : "db_error", message);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every employment period for a person in one org, newest window first. */
export async function listEmploymentsForPerson(
    supabase: SupabaseClient,
    orgId: string,
    personId: string
): Promise<EmploymentRow[]> {
    const { data, error } = await supabase
        .from("employments")
        .select(EMPLOYMENT_SELECT_COLUMNS)
        .eq("org_id", requireId(orgId, "orgId"))
        .eq("person_id", requireId(personId, "personId"))
        .order("start_date", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) rethrowDbError(error.message);
    return (data ?? []) as EmploymentRow[];
}

/**
 * The employment period a person currently holds in this org, or null.
 * "Current" means a non-terminal status — the open relationship, regardless of
 * whether a future start date has arrived yet.
 */
export async function getCurrentEmployment(
    supabase: SupabaseClient,
    orgId: string,
    personId: string
): Promise<EmploymentRow | null> {
    const rows = await listEmploymentsForPerson(supabase, orgId, personId);
    return rows.find((r) => isOpenEmploymentStatus(r.employment_status)) ?? null;
}

export async function getEmploymentById(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string
): Promise<EmploymentRow> {
    const { data, error } = await supabase
        .from("employments")
        .select(EMPLOYMENT_SELECT_COLUMNS)
        .eq("org_id", requireId(orgId, "orgId"))
        .eq("id", requireId(employmentId, "employmentId"))
        .maybeSingle();
    if (error) rethrowDbError(error.message);
    if (!data) throw new EmploymentServiceError("not_found", "Employment not found");
    return data as EmploymentRow;
}

/**
 * Is this person active staff for this org on `onDate`?
 *
 * Delegates to `public.person_is_employed_on` so the answer is identical to the
 * one the schedule_assignments trigger enforces. Two implementations of this
 * question would drift, and the drift would be an eligibility bug.
 */
export async function isPersonEmployedOn(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
    onDate: string
): Promise<boolean> {
    assertValidIsoDate(onDate, "onDate");
    const { data, error } = await supabase.rpc("person_is_employed_on", {
        p_org_id: requireId(orgId, "orgId"),
        p_person_id: requireId(personId, "personId"),
        p_on_date: onDate,
    });
    if (error) rethrowDbError(error.message);
    return data === true;
}

export async function listEmploymentPositions(
    supabase: SupabaseClient,
    orgId: string,
    options?: { activeOnly?: boolean }
): Promise<EmploymentPositionRow[]> {
    let q = supabase
        .from("employment_positions")
        .select("id, org_id, key, label, description, is_active, sort_order")
        .eq("org_id", requireId(orgId, "orgId"));
    if (options?.activeOnly !== false) q = q.eq("is_active", true);
    const { data, error } = await q.order("sort_order").order("label");
    if (error) rethrowDbError(error.message);
    return (data ?? []) as EmploymentPositionRow[];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type CreateEmploymentInput = {
    orgId: string;
    personId: string;
    startDate: string;
    endDate?: string | null;
    positionId?: string | null;
    employmentType?: string | null;
    primaryLocationId?: string | null;
    externalEmployeeId?: string | null;
    supersedesEmploymentId?: string | null;
    metadata?: Record<string, unknown>;
    sourceKey?: string;
    actorUserId?: string | null;
    todayYmd: string;
};

export async function createEmployment(
    supabase: SupabaseClient,
    input: CreateEmploymentInput
): Promise<EmploymentRow> {
    const orgId = requireId(input.orgId, "orgId");
    const personId = requireId(input.personId, "personId");
    assertValidIsoDate(input.startDate, "startDate");
    const endDate = trimOrNull(input.endDate);
    if (endDate) {
        assertValidIsoDate(endDate, "endDate");
        if (compareIsoDates(endDate, input.startDate) < 0) {
            throw new EmploymentServiceError("invalid_input", "endDate must be on or after startDate");
        }
    }

    const employmentType = trimOrNull(input.employmentType);
    if (employmentType && !isEmploymentType(employmentType)) {
        throw new EmploymentServiceError("invalid_input", `Unknown employment_type "${employmentType}"`);
    }

    // The person must exist in this org before employment can reference them.
    // The trigger enforces it too; checking here turns a raw 23514 into a
    // useful operator message.
    const { data: person, error: personErr } = await supabase
        .from("persons")
        .select("id, archived_at")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    if (personErr) rethrowDbError(personErr.message);
    if (!person) {
        throw new EmploymentServiceError("not_found", "Person not found in this organization");
    }

    const existing = await getCurrentEmployment(supabase, orgId, personId);
    if (existing) {
        throw new EmploymentServiceError(
            "conflict",
            "This person already holds an open employment relationship in this organization. End it before starting a new one.",
            { employment_id: existing.id, start_date: existing.start_date }
        );
    }

    const { data, error } = await supabase
        .from("employments")
        .insert({
            org_id: orgId,
            person_id: personId,
            employment_status: resolveEmploymentStatusForDates(input.startDate, endDate, input.todayYmd),
            employment_type: employmentType,
            position_id: trimOrNull(input.positionId),
            primary_location_id: trimOrNull(input.primaryLocationId),
            external_employee_id: trimOrNull(input.externalEmployeeId),
            start_date: input.startDate,
            end_date: endDate,
            supersedes_employment_id: trimOrNull(input.supersedesEmploymentId),
            metadata: input.metadata ?? {},
            source_key: trimOrNull(input.sourceKey) ?? "operator",
            created_by: trimOrNull(input.actorUserId),
            updated_by: trimOrNull(input.actorUserId),
        })
        .select(EMPLOYMENT_SELECT_COLUMNS)
        .single();
    if (error) rethrowDbError(error.message);
    return data as EmploymentRow;
}

export type UpdateEmploymentInput = {
    orgId: string;
    employmentId: string;
    positionId?: string | null;
    employmentType?: string | null;
    primaryLocationId?: string | null;
    externalEmployeeId?: string | null;
    startDate?: string;
    actorUserId?: string | null;
    todayYmd: string;
};

/**
 * Amend an open employment's metadata. Deliberately narrow: it cannot end an
 * employment (use `endEmployment`) and cannot move a person between orgs.
 */
export async function updateEmployment(
    supabase: SupabaseClient,
    input: UpdateEmploymentInput
): Promise<EmploymentRow> {
    const orgId = requireId(input.orgId, "orgId");
    const current = await getEmploymentById(supabase, orgId, input.employmentId);

    if (!isOpenEmploymentStatus(current.employment_status)) {
        throw new EmploymentServiceError(
            "invalid_state",
            "Ended employment is history and cannot be amended. Start a new employment instead."
        );
    }

    const patch: Record<string, unknown> = { updated_by: trimOrNull(input.actorUserId) };

    if (input.positionId !== undefined) patch.position_id = trimOrNull(input.positionId);
    if (input.primaryLocationId !== undefined) {
        patch.primary_location_id = trimOrNull(input.primaryLocationId);
    }
    if (input.externalEmployeeId !== undefined) {
        patch.external_employee_id = trimOrNull(input.externalEmployeeId);
    }
    if (input.employmentType !== undefined) {
        const t = trimOrNull(input.employmentType);
        if (t && !isEmploymentType(t)) {
            throw new EmploymentServiceError("invalid_input", `Unknown employment_type "${t}"`);
        }
        patch.employment_type = t;
    }
    if (input.startDate !== undefined) {
        assertValidIsoDate(input.startDate, "startDate");
        if (current.end_date && compareIsoDates(current.end_date, input.startDate) < 0) {
            throw new EmploymentServiceError("invalid_input", "startDate must be on or before endDate");
        }
        patch.start_date = input.startDate;
        patch.employment_status = resolveEmploymentStatusForDates(
            input.startDate,
            current.end_date,
            input.todayYmd
        );
    }

    const { data, error } = await supabase
        .from("employments")
        .update(patch)
        .eq("org_id", orgId)
        .eq("id", current.id)
        .select(EMPLOYMENT_SELECT_COLUMNS)
        .single();
    if (error) rethrowDbError(error.message);
    return data as EmploymentRow;
}

export type EndEmploymentInput = {
    orgId: string;
    employmentId: string;
    endDate: string;
    endReasonKey?: string | null;
    actorUserId?: string | null;
    todayYmd: string;
};

/**
 * Close the employment window. History-preserving by construction: the row keeps
 * its id, its start date and every fact it was authored with — only `end_date`,
 * `employment_status` and `end_reason_key` change. Nothing is deleted, and the
 * table carries no DELETE policy.
 */
export async function endEmployment(
    supabase: SupabaseClient,
    input: EndEmploymentInput
): Promise<EmploymentRow> {
    const orgId = requireId(input.orgId, "orgId");
    assertValidIsoDate(input.endDate, "endDate");
    const current = await getEmploymentById(supabase, orgId, input.employmentId);

    if (!isOpenEmploymentStatus(current.employment_status)) {
        throw new EmploymentServiceError("invalid_state", "Employment has already ended");
    }
    if (compareIsoDates(input.endDate, current.start_date) < 0) {
        throw new EmploymentServiceError(
            "invalid_input",
            "endDate must be on or after the employment start date"
        );
    }

    const status = compareIsoDates(input.endDate, input.todayYmd) < 0 ? "ended" : "ending";

    const { data, error } = await supabase
        .from("employments")
        .update({
            employment_status: status,
            end_date: input.endDate,
            end_reason_key: trimOrNull(input.endReasonKey),
            updated_by: trimOrNull(input.actorUserId),
        })
        .eq("org_id", orgId)
        .eq("id", current.id)
        .select(EMPLOYMENT_SELECT_COLUMNS)
        .single();
    if (error) rethrowDbError(error.message);
    return data as EmploymentRow;
}
