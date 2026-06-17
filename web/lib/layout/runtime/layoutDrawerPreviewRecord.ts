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
    "person.secondary_contact_name": "Sam Nguyen",
    "opportunity.primary_person_id": "preview-person-jordan",
    _opportunity_persons: [
        {
            person_id: "preview-person-jordan",
            name: "Jordan Nguyen",
            role_type: "primary_contact",
            phone: "(555) 010-2244",
            email: "jordan@example.com",
        },
        {
            person_id: "preview-person-sam",
            name: "Sam Nguyen",
            role_type: "guardian",
            phone: "(555) 010-7788",
            email: "sam@example.com",
        },
    ],
    _attention: "Tour Jun 12 — confirm details",
    children: [
        {
            id: "c1",
            "child.name": "Avery",
            "child.dob_age": "3y",
            "child.desired_start_date": "Aug 2026",
            "child.location": "North Campus",
            "child.program": "Preschool",
            "child.room": "Room A",
            "child.schedule": "Full time",
            "child.status": "Qualified",
        },
        {
            id: "c2",
            "child.name": "Bryce",
            "child.dob_age": "1y",
            "child.desired_start_date": "Sep 2026",
            "child.location": "North Campus",
            "child.program": "Infant",
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
