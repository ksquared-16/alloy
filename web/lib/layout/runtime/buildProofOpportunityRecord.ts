/**
 * Sample opportunity proof record for runtime plan rendering (Phase 2).
 *
 * Demonstrates relation handles, computed projections, and enrollment-child
 * repeater rows without exposing raw table names or opaque ids to operators.
 */

import type { ProofRuntimeRecord } from "./proofRecordContext";
import { OPPORTUNITY_COMPUTE_KEYS } from "./opportunityRelationRegistry";

/** Canonical sample record for opportunity drawer runtime proof + tests. */
export function buildProofOpportunityRecord(overrides: Partial<ProofRuntimeRecord> = {}): ProofRuntimeRecord {
    const base: ProofRuntimeRecord = {
        id: "proof-opp-001",
        name: "Johnson Family — Infant Enrollment",
        status_key: "qualified",
        _status_display: "Qualified",
        source: "Website",
        job_date: "2026-09-01",
        customer_notes: "Prefers morning schedule.",
        _customer_name: "Jamie Johnson",

        // Base-field namespaced refs (lead default layout)
        "opportunity.status_key": "qualified",
        "opportunity.source": "Website",
        "opportunity.channel": "Organic",
        "opportunity.job_date": "2026-09-01",
        "opportunity.customer_notes": "Prefers morning schedule.",

        _relations: {
            primary_contact: {
                handle: "Jamie Johnson",
                entityType: "person",
                fields: {
                    primary_contact_name: "Jamie Johnson",
                    primary_phone: "(555) 234-8901",
                    primary_email: "jamie.j@example.com",
                    is_employee: false,
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
            household_address: {
                handle: "142 Oak Street, Austin, TX 78701",
                entityType: "location",
                fields: { formatted_address: "142 Oak Street, Austin, TX 78701" },
            },
        },

        _computed: {
            [OPPORTUNITY_COMPUTE_KEYS.program_category]: "Infant Care",
            [OPPORTUNITY_COMPUTE_KEYS.placement_priority]: "Standard",
        },

        enrollment_children: [
            {
                id: "enroll-child-1",
                "child.name": "Riley Brooks",
                "inquiry_child.start_date": "2026-09-01",
                "inquiry_child.location_id": "Sunshine — Main Campus",
                "inquiry_child.program_room_cohort_key": "Infant AM",
                "inquiry_child.outcome_status_key": "Active inquiry",
            },
            {
                id: "enroll-child-2",
                "child.name": "Sam Johnson",
                "inquiry_child.start_date": "2027-01-15",
                "inquiry_child.location_id": "Sunshine — Main Campus",
                "inquiry_child.program_room_cohort_key": "Toddler PM",
                "inquiry_child.outcome_status_key": "Waitlisted",
            },
        ],

        children: [],
        tasks: [
            { label: "Follow up on tour", due: "2026-06-10" },
        ],
        reminders: [],
    };

    return { ...base, ...overrides, _relations: { ...base._relations, ...overrides._relations }, _computed: { ...base._computed, ...overrides._computed } };
}

/** Merge real opportunity API record fields into proof shape (best-effort). */
export function mergeApiRecordIntoProofRecord(apiRecord: Record<string, unknown>): ProofRuntimeRecord {
    const sample = buildProofOpportunityRecord();
    return {
        ...sample,
        ...apiRecord,
        _relations: {
            ...sample._relations,
            primary_contact: {
                handle: String(apiRecord["person.primary_contact_name"] ?? sample._relations!.primary_contact!.handle),
                entityType: "person",
                fields: {
                    primary_contact_name: apiRecord["person.primary_contact_name"] ?? sample._relations!.primary_contact!.fields!.primary_contact_name,
                    primary_phone: apiRecord["person.primary_phone"] ?? sample._relations!.primary_contact!.fields!.primary_phone,
                    primary_email: apiRecord["person.primary_email"] ?? sample._relations!.primary_contact!.fields!.primary_email,
                    is_employee: sample._relations!.primary_contact!.fields!.is_employee,
                },
            },
        },
        _computed: sample._computed,
        enrollment_children: sample.enrollment_children,
    };
}
