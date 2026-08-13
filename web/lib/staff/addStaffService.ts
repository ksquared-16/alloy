/**
 * Add Staff — the one identity-safe path from "a human works here" to canonical
 * employment.
 *
 * Order is the whole point:
 *
 *     resolve identity  →  link or (explicitly) create Person  →  create Employment
 *
 * `POST /api/admin/persons` is deliberately NOT used. That route inserts a
 * person with no duplicate detection at all, so making it the Add Staff
 * authority would guarantee a second Jane Wilson. The gate below is what makes
 * creation safe; the insert itself is the trivial part.
 *
 * What this service never does, by construction: create an auth user, send an
 * invitation, assign a role, grant a permission, or touch any access-scope
 * table. Employment is not access.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { EmploymentServiceError } from "@/lib/employment/employmentErrors";
import { saveEmploymentConfiguredFacts } from "@/lib/employment/employmentConfiguredFacts";
import { createEmployment } from "@/lib/employment/employmentService";
import type { EmploymentRow } from "@/lib/employment/employmentTypes";
import {
    resolveStaffPersonCandidates,
    type StaffPersonCandidate,
} from "@/lib/staff/resolveStaffPersonCandidates";

export type AddStaffInput = {
    orgId: string;
    /** Chosen existing person. When set, no identity is created and no resolver override is needed. */
    personId?: string | null;

    /** Identity for the resolver / creation path. Ignored when personId is set. */
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;

    /** Explicit operator override: create a new Person despite candidates. */
    createNewPerson?: boolean;
    /** Required with createNewPerson when the resolver surfaced candidates. */
    createNewReason?: string | null;

    // Employment facts
    startDate: string;
    positionId?: string | null;
    employmentType?: string | null;
    primaryLocationId?: string | null;
    externalEmployeeId?: string | null;
    /** Configured (tenant/vertical) staff facts, keyed by field_key. */
    configuredFacts?: Record<string, unknown>;

    actorUserId?: string | null;
    todayYmd: string;
};

export type AddStaffResult = {
    personId: string;
    employment: EmploymentRow;
    /** How identity was settled — surfaced so the operator sees what happened. */
    identityOutcome: "linked_existing" | "created_new";
};

/** Raised when the operator must resolve identity before anything is written. */
export class StaffIdentityChoiceRequiredError extends EmploymentServiceError {
    readonly candidates: StaffPersonCandidate[];

    constructor(candidates: StaffPersonCandidate[]) {
        super(
            "conflict",
            "This person may already exist in Alloy. Select the existing person, or explicitly choose to create a new one.",
            { candidates }
        );
        this.name = "StaffIdentityChoiceRequiredError";
        this.candidates = candidates;
    }
}

function trimOrNull(value: unknown): string | null {
    const s = value != null ? String(value).trim() : "";
    return s || null;
}

async function linkExistingPerson(
    supabase: SupabaseClient,
    orgId: string,
    personId: string
): Promise<string> {
    const { data, error } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    if (error) throw new EmploymentServiceError("db_error", error.message);
    if (!data) throw new EmploymentServiceError("not_found", "Selected person not found in this organization");
    return (data as { id: string }).id;
}

async function createPersonAfterGate(
    supabase: SupabaseClient,
    orgId: string,
    input: AddStaffInput
): Promise<string> {
    const firstName = trimOrNull(input.firstName);
    const lastName = trimOrNull(input.lastName);
    if (!firstName || !lastName) {
        throw new EmploymentServiceError(
            "invalid_input",
            "first_name and last_name are required to create a new person"
        );
    }
    const fullName = `${firstName} ${lastName}`;

    const { data, error } = await supabase
        .from("persons")
        .insert({
            org_id: orgId,
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            email: trimOrNull(input.email),
            phone: trimOrNull(input.phone),
            external_source: "staff_add",
        })
        .select("id")
        .single();
    if (error) throw new EmploymentServiceError("db_error", error.message);
    return (data as { id: string }).id;
}

export async function addStaff(
    supabase: SupabaseClient,
    input: AddStaffInput
): Promise<AddStaffResult> {
    const orgId = trimOrNull(input.orgId);
    if (!orgId) throw new EmploymentServiceError("invalid_input", "orgId is required");

    let personId: string;
    let identityOutcome: AddStaffResult["identityOutcome"];

    const chosen = trimOrNull(input.personId);
    if (chosen) {
        // Operator selected an existing person. No resolver override needed and
        // no identity is created — this is the parent-becomes-employee and the
        // rehire path.
        personId = await linkExistingPerson(supabase, orgId, chosen);
        identityOutcome = "linked_existing";
    } else {
        const resolution = await resolveStaffPersonCandidates(supabase, orgId, {
            firstName: trimOrNull(input.firstName) ?? "",
            lastName: trimOrNull(input.lastName) ?? "",
            email: input.email ?? null,
            phone: input.phone ?? null,
        });

        if (resolution.decision === "operator_choice_required") {
            const override = input.createNewPerson === true && Boolean(trimOrNull(input.createNewReason));
            if (!override) {
                // Nothing has been written at this point. The operator resolves,
                // then calls again with person_id or an explicit override.
                throw new StaffIdentityChoiceRequiredError(resolution.candidates);
            }
        }

        personId = await createPersonAfterGate(supabase, orgId, input);
        identityOutcome = "created_new";
    }

    const employment = await createEmployment(supabase, {
        orgId,
        personId,
        startDate: input.startDate,
        positionId: input.positionId ?? null,
        employmentType: input.employmentType ?? null,
        primaryLocationId: input.primaryLocationId ?? null,
        externalEmployeeId: input.externalEmployeeId ?? null,
        sourceKey: "staff_add",
        actorUserId: input.actorUserId ?? null,
        todayYmd: input.todayYmd,
    });

    if (input.configuredFacts && Object.keys(input.configuredFacts).length > 0) {
        await saveEmploymentConfiguredFacts(supabase, orgId, employment.id, input.configuredFacts);
    }

    return { personId, employment, identityOutcome };
}
