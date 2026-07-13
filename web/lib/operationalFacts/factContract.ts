/**
 * Operational Fact Contract (D2) — the domain-neutral specification an Operational
 * Fact stream must satisfy. This is a CONTRACT (invariants + interface + a
 * conformance test in factConformance.ts), NOT a base class and NOT a shared
 * table. Per-domain authoritative fact stores conform to it (D3); they are never
 * replaced by a universal `operational_facts` table.
 *
 * `child_attendance_events` (+ attendanceService/attendanceEvents) is the asserted
 * REFERENCE conformer — see attendanceFactDescriptor.ts. Wave 4 staff-presence
 * facts add their own descriptor + a one-line conformance test.
 *
 * Doctrine: docs/platform/operational-truth-flow-doctrine.md (L4),
 *           RFC operational-expansion-phase1-architecture-rfc.md (D2/D3).
 */

/**
 * The single shared correction-identity union. The consumption Fact DTO
 * (`OperationalFactDto.entryType`) and the attendance vocabulary
 * (`AttendanceEntryType`) both align to this exact union.
 */
export type OperationalFactEntryType = "original" | "correction" | "reversal";

export const OPERATIONAL_FACT_ENTRY_TYPES: readonly OperationalFactEntryType[] = [
    "original",
    "correction",
    "reversal",
] as const;

/** Where a fact stream's payload schema version is carried. */
export type SchemaVersionSource = "event" | "column";

/**
 * A declarative descriptor a domain supplies to describe its authoritative fact
 * stream. The conformance harness reads it (with runtime probes) to assert the
 * stream satisfies the Operational Fact contract.
 */
export interface OperationalFactStreamDescriptor {
    /** The authoritative fact table (per-domain; never a universal facts table). */
    tableName: string;
    /** The durable business-subject reference column (NOT the fact-row id). */
    subjectColumn: string;
    /** The org-scope column (org_id NOT NULL + org-scoped RLS). */
    orgColumn: string;
    /** The entry-type column (`original|correction|reversal`). */
    entryTypeColumn: string;
    /** The self-referential "corrects" column (correction/reversal → prior fact id). */
    correctsColumn: string;
    /** The business/effective-time column (org-local day where relevant). */
    effectiveTimeColumn: string;
    /** The immutable append-time column. */
    recordedTimeColumn: string;
    /** Facts are immutable, append-only, corrected-by-reference. Always true. */
    appendOnly: true;
    /** The distinct emitted event type per entry type (D2 requires distinctness). */
    emittedEventTypes: {
        original: string;
        correction: string;
        reversal: string;
    };
    /**
     * Domain-specific payload keys the emitted event MUST carry (in addition to the
     * universal correction-identity keys asserted by the harness: schema_version,
     * entry_type, corrects_event_id).
     */
    eventPayloadRequiredKeys: string[];
    /** Where the payload schema version lives (attendance = 'event' envelope). */
    schemaVersionSource: SchemaVersionSource;
}

/**
 * The required shape of the event an Operational Fact stream emits when a fact is
 * recorded / corrected / reversed. Events COMMUNICATE fact lifecycle (D3); they are
 * never the authoritative fact store, and never carry billing-authoritative detail.
 */
export interface OperationalFactEventEnvelope {
    org_id: string;
    event_type: string;
    entity_type: string;
    entity_id: string;
    action_type: string;
    payload: {
        schema_version: number;
        entry_type: OperationalFactEntryType;
        corrects_event_id: string | null;
        [key: string]: unknown;
    };
}

/** The universal payload keys every conforming fact event must carry. */
export const OPERATIONAL_FACT_REQUIRED_PAYLOAD_KEYS = [
    "schema_version",
    "entry_type",
    "corrects_event_id",
] as const;
