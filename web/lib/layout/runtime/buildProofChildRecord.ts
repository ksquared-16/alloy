/**
 * Sample child proof record for runtime plan rendering.
 *
 * Durable child attributes on child.*; parents, household, and locations via
 * relationship handles — never flat classroom/site fields on the child record.
 */

import type { ProofRuntimeRecord } from "./proofRecordContext";
import { CHILD_COMPUTE_KEYS } from "./childRelationRegistry";

export function buildProofChildRecord(overrides: Partial<ProofRuntimeRecord> = {}): ProofRuntimeRecord {
    const base: ProofRuntimeRecord = {
        id: "proof-child-001",
        display_name: "Riley Brooks",
        "child.name": "Riley Brooks",
        "child.date_of_birth": "2024-03-15",
        "child.age_band": "Infant",

        _computed: {
            [CHILD_COMPUTE_KEYS.enrollment_status]: "Enrolled",
            [CHILD_COMPUTE_KEYS.program_category]: "Infant Care",
        },

        _relations: {
            household_customer: {
                handle: "Johnson Household",
                entityType: "customer",
                fields: { household_name: "Johnson Household" },
            },
            household_address: {
                handle: "142 Oak Street, Austin, TX 78701",
                entityType: "location",
                fields: { formatted_address: "142 Oak Street, Austin, TX 78701" },
            },
            primary_contact: {
                handle: "Jamie Johnson",
                entityType: "person",
                fields: {
                    primary_contact_name: "Jamie Johnson",
                    primary_phone: "(555) 234-8901",
                    primary_email: "jamie.j@example.com",
                },
            },
            enrollment_site_location: {
                handle: "Sunshine Early Learning — Main Campus",
                entityType: "location",
                fields: { label: "Sunshine Early Learning — Main Campus" },
            },
            enrollment_classroom_location: {
                handle: "Infant Room A",
                entityType: "location",
                fields: { label: "Infant Room A" },
            },
            enrollment_room_location: {
                handle: "Crib Bay 3",
                entityType: "location",
                fields: { label: "Crib Bay 3" },
            },
        },

        parents: [
            {
                id: "parent-1",
                "person.primary_contact_name": "Jamie Johnson",
                "person.primary_phone": "(555) 234-8901",
                "person.primary_email": "jamie.j@example.com",
                "person.household_role": "Primary guardian",
            },
            {
                id: "parent-2",
                "person.primary_contact_name": "Taylor Johnson",
                "person.primary_phone": "(555) 234-8902",
                "person.primary_email": "taylor.j@example.com",
                "person.household_role": "Secondary guardian",
            },
        ],
    };

    return {
        ...base,
        ...overrides,
        _relations: { ...base._relations, ...overrides._relations },
        _computed: { ...base._computed, ...overrides._computed },
    };
}
