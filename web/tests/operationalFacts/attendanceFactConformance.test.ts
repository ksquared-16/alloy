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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
    assertFactStreamConforms,
    type FactStreamProbes,
} from "@/lib/operationalFacts/factConformance";
import { ATTENDANCE_FACT_DESCRIPTOR } from "@/lib/childcareOperational/attendance/attendanceFactDescriptor";
import { ATTENDANCE_ENTRY_TYPES } from "@/lib/childcareOperational/attendance/attendanceVocabulary";
import type { OperationalFactEventEnvelope } from "@/lib/operationalFacts/factContract";

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

const MIGRATION_PATH = join(
    __dirname,
    "../../../supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql",
);

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
    let migrationSql = "";
    let probes: FactStreamProbes;

    beforeAll(async () => {
        migrationSql = readFileSync(MIGRATION_PATH, "utf8");

        // Storage-half observations proven against the migration DDL.
        const appendOnlyTrigger =
            /prevent_child_attendance_events_mutation/.test(migrationSql) &&
            /BEFORE UPDATE OR DELETE ON public\.child_attendance_events/.test(migrationSql);
        const entryTypeCheck = /child_attendance_events_entry_type_check/.test(migrationSql);
        const correctsSelfFk =
            /corrects_event_id uuid REFERENCES public\.child_attendance_events/.test(migrationSql);
        const noSelfRef = /child_attendance_events_no_self_reference/.test(migrationSql);
        const orgSelectPolicy = /child_attendance_events_select_org/.test(migrationSql);
        // No updated_at column (append-only): the DDL comment says created_* only.
        const hasUpdatedAt = /\bupdated_at\b/.test(migrationSql);

        probes = {
            attemptMutation: (op) => ({
                rejected: appendOnlyTrigger,
                message: `${op} blocked by prevent_child_attendance_events_mutation`,
            }),
            entryTypeVocabulary: entryTypeCheck ? ATTENDANCE_ENTRY_TYPES : [],
            correctsSelfReference: correctsSelfFk,
            noSelfReferenceGuard: noSelfRef,
            orgScopedRls: orgSelectPolicy,
            hasUpdatedAt,
            hasSchemaVersionColumn: /\bschema_version\b/.test(migrationSql), // false — carried on the event
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

    it("proves the storage half from the real migration DDL", () => {
        expect(migrationSql).toContain("child_attendance_events is append-only");
        expect(migrationSql).toContain("child_attendance_events_no_self_reference");
        // Append-only stream has no updated_at column.
        expect(/\bupdated_at\b/.test(migrationSql)).toBe(false);
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
