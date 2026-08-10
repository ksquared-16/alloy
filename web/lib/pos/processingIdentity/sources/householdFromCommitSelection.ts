/**
 * Rebuild a minimal IntakeHouseholdCandidate from a Create Lead commit selection
 * when the full household graph was not serialized in the payload.
 */

import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function personFromRecord(
    record: CreateLeadCommitSelection["parents"][0] | CreateLeadCommitSelection["children"][0],
    role: IntakePersonCandidate["role"],
): IntakePersonCandidate {
    const genderRaw = trim(record.extra_payload_values?.gender ?? "");
    const gender = genderRaw === "female" || genderRaw === "male" ? genderRaw : null;
    return {
        candidate_id: record.candidate_id,
        role,
        first_name: trim(record.first_name) || null,
        last_name: trim(record.last_name) || null,
        emails: trim(record.email) ? [trim(record.email)] : [],
        phones: trim(record.phone) ? [trim(record.phone)] : [],
        dob: record.dob,
        age_years: null,
        calculated_age: null,
        gender,
        program_interest: record.program_interest,
        source_fact_ids: record.source_fact_ids ?? [],
        confidence: record.validation_state === "valid" ? "high" : "medium",
        validation_state: record.validation_state,
    };
}

export function householdFromCommitSelection(
    selection: CreateLeadCommitSelection,
    opts: { householdId?: string; locationId?: string | null } = {},
): IntakeHouseholdCandidate {
    const householdId = opts.householdId ?? `household:create_lead:${selection.parents[0]?.candidate_id ?? "unknown"}`;
    const parents = selection.parents.map((p) => personFromRecord(p, "parent"));
    const children = selection.children.map((c) => personFromRecord(c, "child"));
    return {
        household_id: householdId,
        parents_guardians: parents,
        parents: [],
        children,
        household_contacts: [],
        address: null,
        location:
            opts.locationId ?
                {
                    label: "location",
                    resolved_value: opts.locationId,
                    resolved_label: null,
                    source_fact_ids: [],
                    confidence: "high",
                    validation_state: "valid",
                }
            :   null,
        source: "create_lead",
        notes: null,
        program_interest: children[0]?.program_interest ?? null,
        start_date: null,
        relationships: [],
        unassigned_fact_ids: [],
        unmapped_facts: [],
        review_warnings: [],
    };
}

/** Minimal household from legacy flat Create Lead gather fields (single parent + optional child). */
export function householdFromFlatCreateLeadMerged(
    merged: Record<string, unknown>,
    opts: { locationId?: string | null } = {},
): IntakeHouseholdCandidate | null {
    const firstName = trim(merged.first_name);
    const lastName = trim(merged.last_name);
    if (!firstName || !lastName) return null;
    const email = trim(merged.email) || null;
    const phone = trim(merged.phone) || null;
    const childFirst = trim(merged.child_first_name);
    const childLast = trim(merged.child_last_name);
    const childDob = trim(merged.child_date_of_birth) || trim(merged.child_dob) || null;
    const parents: IntakePersonCandidate[] = [
        {
            candidate_id: "parent:primary",
            role: "parent",
            first_name: firstName,
            last_name: lastName,
            emails: email ? [email] : [],
            phones: phone ? [phone] : [],
            dob: null,
            age_years: null,
            calculated_age: null,
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
        },
    ];
    const children: IntakePersonCandidate[] = [];
    if (childFirst || childLast) {
        children.push({
            candidate_id: "child:primary",
            role: "child",
            first_name: childFirst || null,
            last_name: childLast || null,
            emails: [],
            phones: [],
            dob: childDob,
            age_years: null,
            calculated_age: null,
            program_interest: trim(merged.child_program) || null,
            source_fact_ids: [],
            confidence: childDob ? "high" : "medium",
            validation_state: childDob ? "valid" : "unknown",
        });
    }
    return {
        household_id: `household:create_lead:flat:${firstName}:${lastName}`,
        parents_guardians: parents,
        parents: [],
        children,
        household_contacts: [],
        address: null,
        location:
            opts.locationId ?
                {
                    label: "location",
                    resolved_value: opts.locationId,
                    resolved_label: null,
                    source_fact_ids: [],
                    confidence: "high",
                    validation_state: "valid",
                }
            :   null,
        source: "create_lead",
        notes: null,
        program_interest: trim(merged.child_program) || null,
        start_date: trim(merged.child_start_date) || null,
        relationships: [],
        unassigned_fact_ids: [],
        unmapped_facts: [],
        review_warnings: [],
    };
}
