/**
 * Sample drawer record for Layout Config preview — mirrors lead drawer default fields.
 */

import type { ProofRuntimeRecord } from "./proofRecordContext";

/** Rich sample record for settings drawer preview (no live VM fetch). */
export const LAYOUT_DRAWER_PREVIEW_RECORD: ProofRuntimeRecord = {
    id: "preview-opportunity",
    name: "Nguyen Household",
    last_name: "Nguyen",
    status_key: "qualified",
    _status_display: "Qualified",
    "opportunity.status_key": "Qualified",
    "opportunity.location": "North Campus",
    "opportunity.tour_date": "2026-06-12",
    "opportunity.tour_status": "Scheduled",
    "opportunity.source": "Website",
    "opportunity.channel": "Organic",
    "opportunity.campaign": "Spring 2026",
    "person.primary_contact_name": "Jordan Nguyen",
    "person.primary_phone": "(555) 010-2244",
    "person.primary_email": "jordan@example.com",
    "person.role": "Primary Guardian",
    "person.relationship": "Mother",
    "person.secondary_contact_name": "Sam Nguyen",
    "opportunity.primary_person_id": "preview-person-jordan",
    _opportunity_persons: [
        {
            person_id: "preview-person-jordan",
            name: "Jordan Nguyen",
            role_type: "primary_contact",
            role: "Primary Guardian",
            phone: "(555) 010-2244",
            email: "jordan@example.com",
        },
        {
            person_id: "preview-person-sam",
            name: "Sam Nguyen",
            role_type: "guardian",
            role: "Guardian",
            phone: "(555) 010-7788",
            email: "sam@example.com",
        },
    ],
    _attention: "Tour Jun 12 — confirm details",
    children: [
        {
            id: "c1",
            "child.name": "Avery Johnson",
            "child.first_name": "Avery",
            "child.last_name": "Johnson",
            "child.age": "4",
            "child.age_band": "4",
            "child.dob_age": "4y",
            "child.desired_start_date": "Aug 19",
            "inquiry_child.desired_start_date": "2026-08-19",
            "child.location": "North Campus",
            "child.program": "Preschool",
            "inquiry_child.desired_program_type": "Preschool",
            "child.room": "Room A",
            "child.schedule": "Full time",
            "child.status": "Qualified",
        },
        {
            id: "c2",
            "child.name": "Bryce Johnson",
            "child.first_name": "Bryce",
            "child.last_name": "Johnson",
            "child.age": "2",
            "child.age_band": "2",
            "child.dob_age": "2y",
            "child.desired_start_date": "Sep 2026",
            "inquiry_child.desired_start_date": "2026-09-01",
            "child.location": "North Campus",
            "child.program": "Toddler",
            "inquiry_child.desired_program_type": "Toddler",
            "child.room": "Room B",
            "child.schedule": "Part time",
            "child.status": "On waitlist",
        },
    ],
    enrollment_children: [],
    tasks: [{ label: "Follow up on tour", due: "Tomorrow" }],
    reminders: [{ label: "Send welcome packet", when: "Jun 14" }],
    _relations: {
        primary_contact: {
            handle: "Jordan Nguyen",
            entityType: "person",
            fields: {
                primary_contact_name: "Jordan Nguyen",
                primary_phone: "(555) 010-2244",
                primary_email: "jordan@example.com",
            },
        },
        household: { id: "preview-household", name: "Nguyen Household" },
    },
};

/** Sparse record for parity tests — configured fields render with placeholders. */
export const LAYOUT_DRAWER_SPARSE_RECORD: ProofRuntimeRecord = {
    id: "sparse-opportunity",
    name: "Test Household",
    last_name: "Test",
    status_key: "",
    children: [],
    enrollment_children: [],
    tasks: [],
    reminders: [],
};
