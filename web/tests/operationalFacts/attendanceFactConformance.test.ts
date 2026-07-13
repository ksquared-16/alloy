/**
 * D2 conformance — the attendance fact stream is the asserted REFERENCE conformer.
 *
 * Storage half is proven against the real migration DDL (append-only trigger,
 * entry_type CHECK, corrects self-FK + no-self-reference CHECK, org-scoped RLS,
 * no updated_at). Consumer-facing half is proven by capturing what the real
 * `emitAttendanceEvent` hands to `emitEvent` for each entry type (distinct event
 * types + payload completeness). A final "teeth" test proves the harness FAILS an
 * invalid descriptor/probe.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import {
    assertFactStreamConforms,
    type FactStreamProbes,
} from "@/lib/operationalFacts/factConformance";
import { ATTENDANCE_FACT_DESCRIPTOR } from "@/lib/childcareOperational/attendance/attendanceFactDescriptor";
import { ATTENDANCE_ENTRY_TYPES } from "@/lib/childcareOperational/attendance/attendanceVocabulary";
import type { OperationalFactEventEnvelope } from "@/lib/operationalFacts/factContract";
import { readAttendanceMigrationsOrdered, scanAttendanceSchema } from "./attendanceSchemaScan";

// Capture the envelope handed to emitEvent instead of writing workflow_events.
const emitted: Record<string, unknown>[] = [];
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn(async (envelope: Record<string, unknown>) => {
        emitted.push(envelope);
        return "evt-1";
    }),
}));

// Imported AFTER the mock so emitAttendanceEvent uses the mocked emitEvent.
import { emitAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceEvents";

async function captureEnvelope(entryType: "original" | "correction" | "reversal"): Promise<OperationalFactEventEnvelope> {
    emitted.length = 0;
    await emitAttendanceEvent({
        orgId: "org-1",
        attendanceEventId: "att-1",
        enrollmentAgreementId: "agr-1",
        customerMemberId: "mem-1",
        siteLocationId: "site-1",
        eventKind: "check_out",
        entryType,
        correctsEventId: entryType === "original" ? null : "att-0",
        serviceDate: "2026-06-18",
        eventAt: "2026-06-18T22:18:00Z",
        actorType: "staff",
        sourceType: "operator_action",
    });
    return emitted[0] as unknown as OperationalFactEventEnvelope;
}

describe("D2 — attendance fact stream conformance (reference conformer)", () => {
    let attendanceMigrationFiles: string[] = [];
    let probes: FactStreamProbes;

    beforeAll(async () => {
        // Storage-half observations resolved against the CUMULATIVE migration history
        // (every migration touching child_attendance_events, chronological), not a
        // single frozen file — so a LATER migration that weakens the invariants (drops
        // the append-only trigger, adds updated_at) flips these facts and fails
        // conformance. (Audit F3.)
        const { concatenated, files } = readAttendanceMigrationsOrdered();
        attendanceMigrationFiles = files;
        const facts = scanAttendanceSchema(concatenated);

        probes = {
            attemptMutation: (op) => ({
                rejected: facts.appendOnlyTrigger,
                message: `${op} blocked by prevent_child_attendance_events_mutation`,
            }),
            entryTypeVocabulary: facts.entryTypeCheck ? ATTENDANCE_ENTRY_TYPES : [],
            correctsSelfReference: facts.correctsSelfFk,
            noSelfReferenceGuard: facts.noSelfRef,
            orgScopedRls: facts.orgSelectPolicy,
            hasUpdatedAt: facts.hasUpdatedAt,
            hasSchemaVersionColumn: false, // attendance carries schema_version on the event envelope
            emittedEvents: {
                original: await captureEnvelope("original"),
                correction: await captureEnvelope("correction"),
                reversal: await captureEnvelope("reversal"),
            },
        };
    });

    it("conforms on BOTH the storage and consumer-facing halves", async () => {
        const report = await assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes);
        const failed = report.checks.filter((c) => !c.passed);
        expect(failed, `failed checks: ${JSON.stringify(failed, null, 2)}`).toHaveLength(0);
        expect(report.conforms).toBe(true);
    });

    it("proves the storage half from the CUMULATIVE migration history (not one file)", () => {
        expect(attendanceMigrationFiles.length).toBeGreaterThan(0);
        const facts = scanAttendanceSchema(readAttendanceMigrationsOrdered().concatenated);
        expect(facts.appendOnlyTrigger).toBe(true);
        expect(facts.noSelfRef).toBe(true);
        expect(facts.entryTypeCheck).toBe(true);
        expect(facts.correctsSelfFk).toBe(true);
        // Append-only stream must have NO updated_at column anywhere in its history.
        expect(facts.hasUpdatedAt).toBe(false);
    });

    it("emits a DISTINCT event type per entry type, each with correction identity", async () => {
        const report = await assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes);
        const distinct = report.checks.find((c) => c.property === "distinct_event_types");
        expect(distinct?.passed).toBe(true);
        for (const et of ["original", "correction", "reversal"] as const) {
            const env = probes.emittedEvents[et];
            expect(env.payload.schema_version).toBe(1);
            expect(env.payload.entry_type).toBe(et);
            expect("corrects_event_id" in env.payload).toBe(true);
            expect(env.payload.customer_member_id).toBe("mem-1");
            expect(env.payload.service_date).toBe("2026-06-18");
            expect(env.org_id).toBe("org-1");
        }
    });

    it("flags the missing per-fact schema_version column as a WARNING, not a failure", async () => {
        const report = await assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes);
        expect(report.conforms).toBe(true);
        expect(report.warnings.some((w) => w.includes("schema_version"))).toBe(true);
    });
});

describe("D2 — the harness has teeth (rejects a non-conforming stream)", () => {
    const baseEnvelope = (entryType: string): OperationalFactEventEnvelope => ({
        org_id: "org-1",
        event_type: `attendance_event_${entryType}`,
        entity_type: "child_attendance_events",
        entity_id: "att-1",
        action_type: "record_attendance",
        payload: {
            schema_version: 1,
            entry_type: entryType as OperationalFactEventEnvelope["payload"]["entry_type"],
            corrects_event_id: null,
            customer_member_id: "mem-1",
            enrollment_agreement_id: "agr-1",
            site_location_id: "site-1",
            event_kind: "check_out",
            service_date: "2026-06-18",
            event_at: "2026-06-18T22:18:00Z",
        },
    });

    function goodProbes(): FactStreamProbes {
        return {
            attemptMutation: () => ({ rejected: true }),
            entryTypeVocabulary: ["original", "correction", "reversal"],
            correctsSelfReference: true,
            noSelfReferenceGuard: true,
            orgScopedRls: true,
            hasUpdatedAt: false,
            hasSchemaVersionColumn: false,
            emittedEvents: {
                original: { ...baseEnvelope("recorded"), event_type: "attendance_event_recorded" },
                correction: { ...baseEnvelope("corrected"), event_type: "attendance_event_corrected", payload: { ...baseEnvelope("corrected").payload, entry_type: "correction" } },
                reversal: { ...baseEnvelope("reversed"), event_type: "attendance_event_reversed", payload: { ...baseEnvelope("reversed").payload, entry_type: "reversal" } },
            },
        };
    }

    it("fails append_only when a mutation is NOT rejected", async () => {
        const probes = goodProbes();
        probes.attemptMutation = () => ({ rejected: false });
        const report = await assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes);
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "append_only")?.passed).toBe(false);
    });

    it("fails no_updated_at when the stream is mutable", async () => {
        const probes = goodProbes();
        probes.hasUpdatedAt = true;
        const report = await assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes);
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "no_updated_at")?.passed).toBe(false);
    });

    it("fails event_payload_completeness when the payload omits correction identity", async () => {
        const probes = goodProbes();
        const stripped = baseEnvelope("corrected");
        delete (stripped.payload as Record<string, unknown>).corrects_event_id;
        (stripped.payload as Record<string, unknown>).entry_type = "correction";
        stripped.event_type = "attendance_event_corrected";
        probes.emittedEvents.correction = stripped;
        const report = await assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes);
        expect(report.conforms).toBe(false);
        expect(
            report.checks.find((c) => c.property === "event_payload_completeness:correction")?.passed,
        ).toBe(false);
    });

    it("fails distinct_event_types when two entry types collide", async () => {
        const probes = goodProbes();
        probes.emittedEvents.correction = { ...probes.emittedEvents.correction, event_type: "attendance_event_recorded" };
        const report = await assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes);
        expect(report.conforms).toBe(false);
        expect(report.checks.find((c) => c.property === "distinct_event_types")?.passed).toBe(false);
    });
});

describe("F3 — cumulative-schema drift detection (a LATER migration that weakens attendance is caught)", () => {
    // A faithful stand-in for the real p2 migration's invariant-creating statements.
    const baseMigration = `-- 20260629120000_childcare_attendance_facts_p2.sql
        CREATE TABLE public.child_attendance_events (
            id uuid PRIMARY KEY,
            corrects_event_id uuid REFERENCES public.child_attendance_events (id) ON DELETE RESTRICT,
            CONSTRAINT child_attendance_events_entry_type_check CHECK (entry_type = ANY (ARRAY['original','correction','reversal'])),
            CONSTRAINT child_attendance_events_no_self_reference CHECK (corrects_event_id <> id)
        );
        CREATE POLICY child_attendance_events_select_org ON public.child_attendance_events FOR SELECT USING (true);
        DROP TRIGGER IF EXISTS trg_prevent_child_attendance_events_mutation ON public.child_attendance_events;
        CREATE TRIGGER trg_prevent_child_attendance_events_mutation
            BEFORE UPDATE OR DELETE ON public.child_attendance_events FOR EACH ROW EXECUTE FUNCTION public.prevent_child_attendance_events_mutation();`;

    it("the current cumulative history is clean (baseline)", () => {
        const facts = scanAttendanceSchema(baseMigration);
        expect(facts.appendOnlyTrigger).toBe(true);
        expect(facts.hasUpdatedAt).toBe(false);
        expect(facts.noSelfRef).toBe(true);
    });

    it("detects a LATER migration that DROPS the append-only trigger", () => {
        const drift = `${baseMigration}
        -- 20260901000000_oops_make_attendance_mutable.sql
        DROP TRIGGER trg_prevent_child_attendance_events_mutation ON public.child_attendance_events;`;
        const facts = scanAttendanceSchema(drift);
        expect(facts.appendOnlyTrigger).toBe(false);
        // and conformance therefore fails
        const probes: FactStreamProbes = {
            attemptMutation: (op) => ({ rejected: facts.appendOnlyTrigger, message: op }),
            entryTypeVocabulary: facts.entryTypeCheck ? ["original", "correction", "reversal"] : [],
            correctsSelfReference: facts.correctsSelfFk,
            noSelfReferenceGuard: facts.noSelfRef,
            orgScopedRls: facts.orgSelectPolicy,
            hasUpdatedAt: facts.hasUpdatedAt,
            hasSchemaVersionColumn: false,
            emittedEvents: {
                original: { org_id: "o", event_type: "attendance_event_recorded", entity_type: "t", entity_id: "e", action_type: "a", payload: { schema_version: 1, entry_type: "original", corrects_event_id: null, customer_member_id: "m", service_date: "d" } },
                correction: { org_id: "o", event_type: "attendance_event_corrected", entity_type: "t", entity_id: "e", action_type: "a", payload: { schema_version: 1, entry_type: "correction", corrects_event_id: null, customer_member_id: "m", service_date: "d" } },
                reversal: { org_id: "o", event_type: "attendance_event_reversed", entity_type: "t", entity_id: "e", action_type: "a", payload: { schema_version: 1, entry_type: "reversal", corrects_event_id: null, customer_member_id: "m", service_date: "d" } },
            },
        };
        return assertFactStreamConforms(ATTENDANCE_FACT_DESCRIPTOR, probes).then((report) => {
            expect(report.conforms).toBe(false);
            expect(report.checks.find((c) => c.property === "append_only")?.passed).toBe(false);
        });
    });

    it("detects a LATER migration that ADDS updated_at (makes the stream mutable)", () => {
        const drift = `${baseMigration}
        -- 20260901000000_oops_add_updated_at.sql
        ALTER TABLE public.child_attendance_events ADD COLUMN updated_at timestamptz;`;
        const facts = scanAttendanceSchema(drift);
        expect(facts.hasUpdatedAt).toBe(true);
    });

    it("a same-migration DROP-then-CREATE (re-create) is NOT drift", () => {
        // The base itself uses DROP TRIGGER IF EXISTS ... ; CREATE TRIGGER ... — must read as present.
        expect(scanAttendanceSchema(baseMigration).appendOnlyTrigger).toBe(true);
    });
});
