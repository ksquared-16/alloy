/**
 * Sample child proof record for runtime plan rendering.
 */

import type { ProofRuntimeRecord } from "./proofRecordContext";

export function buildProofChildRecord(overrides: Partial<ProofRuntimeRecord> = {}): ProofRuntimeRecord {
    const base: ProofRuntimeRecord = {
        id: "proof-child-001",
        "child.id": "proof-child-001",
        "child.name": "Riley Brooks",
        "child.date_of_birth": "2024-03-15",
        "child.age_band": "Infant",
        "child.status": "Active",
        "inquiry_child.program": "Infant Full Day",
        "inquiry_child.desired_program_type": "Infant",
        "inquiry_child.desired_schedule_type": "Full day",
        "inquiry_child.desired_start_date": "2026-09-01",
        "inquiry_child.outcome_status_key": "waitlisted",
        "customer.household_name": "Johnson Household",
        family_adults: [
            {
                id: "adult-1",
                person_id: "proof-person-001",
                "person.id": "proof-person-001",
                "person.primary_contact_name": "Jamie Johnson",
                "person.household_role": "Primary contact",
                "person.primary_phone": "(555) 234-8901",
                "person.primary_email": "jamie.j@example.com",
            },
        ],
        _relations: {
            household_customer: {
                handle: "Johnson Household",
                entityType: "customer",
                fields: { household_name: "Johnson Household" },
            },
        },
        follow_up_notes: "Parent requested tour for September start.",
        documents: [{ label: "Immunization record", status: "missing" }],
    };

    return {
        ...base,
        ...overrides,
        _relations: { ...base._relations, ...overrides._relations },
    };
}
