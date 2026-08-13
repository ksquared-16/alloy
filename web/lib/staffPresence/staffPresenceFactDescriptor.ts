/**
 * Staff presence Operational Fact descriptor.
 *
 * `child_attendance_events` is the REFERENCE conformer; this stream declares how
 * it satisfies the same D2 contract. Asserted by
 * web/tests/operationalFacts/staffPresenceFactConformance.test.ts using the same
 * harness that asserts attendance — not a staff-specific conformance framework.
 *
 * Keep aligned with:
 *   supabase/migrations/20260812090000_staff_presence_facts_v1.sql (storage)
 *   web/lib/staffPresence/staffPresenceEvents.ts (emitted events)
 */

import type { OperationalFactStreamDescriptor } from "@/lib/operationalFacts/factContract";
import {
    STAFF_PRESENCE_EVENT_CORRECTED_EVENT,
    STAFF_PRESENCE_EVENT_RECORDED_EVENT,
    STAFF_PRESENCE_EVENT_REVERSED_EVENT,
} from "@/lib/staffPresence/staffPresenceEvents";

export const STAFF_PRESENCE_FACT_DESCRIPTOR: OperationalFactStreamDescriptor = {
    tableName: "staff_presence_events",
    // The durable subject is the canonical human — identity is referenced, never copied.
    subjectColumn: "person_id",
    orgColumn: "org_id",
    entryTypeColumn: "entry_type",
    correctsColumn: "corrects_event_id",
    effectiveTimeColumn: "service_date",
    recordedTimeColumn: "created_at",
    appendOnly: true,
    emittedEventTypes: {
        original: STAFF_PRESENCE_EVENT_RECORDED_EVENT,
        correction: STAFF_PRESENCE_EVENT_CORRECTED_EVENT,
        reversal: STAFF_PRESENCE_EVENT_REVERSED_EVENT,
    },
    eventPayloadRequiredKeys: [
        "person_id", // durable subject reference
        "employment_id", // the employment that made them staff that day
        "site_location_id",
        "event_kind",
        "service_date", // effective (org-local) day
        "event_at", // recorded instant
    ],
    schemaVersionSource: "event",
};
