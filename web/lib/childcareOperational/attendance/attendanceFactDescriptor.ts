/**
 * Attendance Operational Fact descriptor — the REFERENCE conformer for the D2
 * contract. `child_attendance_events` (+ attendanceService/attendanceEvents) is the
 * fact stream every future stream conforms to; this descriptor declares how it
 * satisfies the Operational Fact contract. No behavior change to attendance — this
 * is a declarative descriptor, asserted by attendanceFactConformance.test.ts.
 *
 * Keep aligned with:
 *   supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql (storage),
 *   web/lib/childcareOperational/attendance/attendanceEvents.ts (emitted events).
 */

import type { OperationalFactStreamDescriptor } from "@/lib/operationalFacts/factContract";
import {
    ATTENDANCE_EVENT_CORRECTED_EVENT,
    ATTENDANCE_EVENT_RECORDED_EVENT,
    ATTENDANCE_EVENT_REVERSED_EVENT,
} from "@/lib/childcareOperational/attendance/attendanceEvents";

export const ATTENDANCE_FACT_DESCRIPTOR: OperationalFactStreamDescriptor = {
    tableName: "child_attendance_events",
    subjectColumn: "customer_member_id",
    orgColumn: "org_id",
    entryTypeColumn: "entry_type",
    correctsColumn: "corrects_event_id",
    effectiveTimeColumn: "service_date",
    recordedTimeColumn: "created_at",
    appendOnly: true,
    emittedEventTypes: {
        original: ATTENDANCE_EVENT_RECORDED_EVENT,
        correction: ATTENDANCE_EVENT_CORRECTED_EVENT,
        reversal: ATTENDANCE_EVENT_REVERSED_EVENT,
    },
    // Domain-specific keys the emitted event MUST carry (the universal correction
    // keys schema_version/entry_type/corrects_event_id are asserted by the harness).
    eventPayloadRequiredKeys: [
        "customer_member_id", // durable subject reference
        "enrollment_agreement_id",
        "site_location_id",
        "event_kind",
        "service_date", // effective (org-local) day
        "event_at", // recorded instant
    ],
    schemaVersionSource: "event",
};
