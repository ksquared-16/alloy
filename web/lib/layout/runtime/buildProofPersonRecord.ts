/**
 * Sample person proof record for runtime plan rendering.
 *
 * Demonstrates household, children, and primary child relationships without
 * exposing raw table names or opaque ids to operators.
 */

import type { ProofRuntimeRecord } from "./proofRecordContext";
import { stampLayoutRuntimeActiveRecordContext } from "./layoutRuntimeRelatedListActiveRecord";

export function buildProofPersonRecord(overrides: Partial<ProofRuntimeRecord> = {}): ProofRuntimeRecord {
    const base: ProofRuntimeRecord = {
        id: "proof-person-001",
        first_name: "Jamie",
        last_name: "Johnson",
        "person.first_name": "Jamie",
        "person.last_name": "Johnson",
        "person.email": "jamie.j@example.com",
        "person.phone": "(555) 234-8901",
        "location.household_address": "142 Oak Street, Austin, TX 78701",
        "location.household_address_line1": "142 Oak Street",
        "location.household_address_city": "Austin",
        "location.household_address_state": "TX",
        "location.household_address_postal_code": "78701",

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
            primary_child: {
                handle: "Riley Brooks",
                entityType: "child",
                fields: {
                    name: "Riley Brooks",
                    date_of_birth: "2024-03-15",
                },
            },
        },

        household_children: [
            {
                id: "child-1",
                "child.name": "Riley Brooks",
                "child.date_of_birth": "2024-03-15",
                "child.age_band": "Infant",
                "child.status_key": "Active",
            },
            {
                id: "child-2",
                "child.name": "Sam Johnson",
                "child.date_of_birth": "2022-08-01",
                "child.age_band": "Toddler",
                "child.status_key": "Active",
            },
        ],
    };

    return stampLayoutRuntimeActiveRecordContext(
        {
            ...base,
            ...overrides,
            _relations: { ...base._relations, ...overrides._relations },
        },
        {
            anchorEntity: "person",
            entityId: String(overrides.id ?? base.id),
        },
    );
}
