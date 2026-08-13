/**
 * Staff presence conforms to the SAME D2 Operational Fact contract as the
 * reference conformer (`child_attendance_events`).
 *
 * Deliberately reuses the existing harness and the existing schema-scan
 * primitives — a staff-specific conformance framework would be a second
 * definition of "conforming", which is exactly what the contract exists to
 * prevent.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

import {
    assertFactStreamConforms,
    type FactStreamProbes,
} from "@/lib/operationalFacts/factConformance";
import type { OperationalFactEventEnvelope } from "@/lib/operationalFacts/factContract";
import { STAFF_PRESENCE_FACT_DESCRIPTOR } from "@/lib/staffPresence/staffPresenceFactDescriptor";
import { STAFF_PRESENCE_ENTRY_TYPES } from "@/lib/staffPresence/staffPresenceVocabulary";
import {
    appendOnlyTriggerPresent,
    createBlockColumnNames,
    hasUpdatedAtColumn,
    namedCheckConstraintPresent,
    policyPresent,
    readMigrationsOrderedTouching,
    selfRefFkPresent,
    stripSqlComments,
} from "../operationalLedger/ledgerSchemaScan";

const TABLE = "staff_presence_events";

const emitted: Record<string, unknown>[] = [];
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn(async (envelope: Record<string, unknown>) => {
        emitted.push(envelope);
        return "evt-1";
    }),
}));

// Imported AFTER the mock so the emitter uses the mocked emitEvent.
import { emitStaffPresenceEvent } from "@/lib/staffPresence/staffPresenceEvents";

async function captureEnvelope(
    entryType: "original" | "correction" | "reversal"
): Promise<OperationalFactEventEnvelope> {
    emitted.length = 0;
    await emitStaffPresenceEvent({
        orgId: "org-1",
        presenceEventId: "sp-1",
        personId: "person-1",
        employmentId: "emp-1",
        siteLocationId: "site-1",
        eventKind: "check_out",
        entryType,
        correctsEventId: entryType === "original" ? null : "sp-0",
        serviceDate: "2026-08-17",
        eventAt: "2026-08-17T22:18:00Z",
        actorType: "operator",
        sourceType: "operator_action",
    });
    return emitted[0] as unknown as OperationalFactEventEnvelope;
}

describe("staff presence fact stream conformance", () => {
    let migrationFiles: string[] = [];
    let probes: FactStreamProbes;

    beforeAll(async () => {
        // Cumulative history, not one file — a LATER migration that weakens the
        // invariants must flip these facts and fail conformance.
        const { concatenated, files } = readMigrationsOrderedTouching(TABLE);
        migrationFiles = files;
        const sql = stripSqlComments(concatenated);

        probes = {
            attemptMutation: (op) => ({
                rejected: appendOnlyTriggerPresent(sql, "trg_prevent_staff_presence_events_mutation"),
                message: `${op} blocked by prevent_staff_presence_events_mutation`,
            }),
            entryTypeVocabulary: namedCheckConstraintPresent(sql, "staff_presence_events_entry_type_check")
                ? STAFF_PRESENCE_ENTRY_TYPES
                : [],
            correctsSelfReference: selfRefFkPresent(sql, TABLE, "corrects_event_id"),
            noSelfReferenceGuard: namedCheckConstraintPresent(sql, "staff_presence_events_no_self_reference"),
            orgScopedRls: policyPresent(sql, "staff_presence_events_select_org"),
            hasUpdatedAt: hasUpdatedAtColumn(sql, TABLE),
            hasSchemaVersionColumn: false, // carried on the event envelope, like attendance
            emittedEvents: {
                original: await captureEnvelope("original"),
                correction: await captureEnvelope("correction"),
                reversal: await captureEnvelope("reversal"),
            },
        };
    });

    it("conforms on BOTH the storage and consumer-facing halves", async () => {
        const report = await assertFactStreamConforms(STAFF_PRESENCE_FACT_DESCRIPTOR, probes);
        const failed = report.checks.filter((c) => !c.passed);
        expect(failed, `failed checks: ${JSON.stringify(failed, null, 2)}`).toHaveLength(0);
        expect(report.conforms).toBe(true);
    });

    it("proves the storage half from the CUMULATIVE migration history", () => {
        expect(migrationFiles.length).toBeGreaterThan(0);
        const sql = stripSqlComments(readMigrationsOrderedTouching(TABLE).concatenated);
        expect(appendOnlyTriggerPresent(sql, "trg_prevent_staff_presence_events_mutation")).toBe(true);
        expect(namedCheckConstraintPresent(sql, "staff_presence_events_no_self_reference")).toBe(true);
        expect(namedCheckConstraintPresent(sql, "staff_presence_events_entry_type_check")).toBe(true);
        expect(selfRefFkPresent(sql, TABLE, "corrects_event_id")).toBe(true);
        // Append-only streams must never gain an updated_at.
        expect(hasUpdatedAtColumn(sql, TABLE)).toBe(false);
    });

    it("emits a DISTINCT event type per entry type, each carrying correction identity", async () => {
        const report = await assertFactStreamConforms(STAFF_PRESENCE_FACT_DESCRIPTOR, probes);
        expect(report.checks.find((c) => c.property === "distinct_event_types")?.passed).toBe(true);
        for (const et of ["original", "correction", "reversal"] as const) {
            const env = probes.emittedEvents[et];
            expect(env.payload.schema_version).toBe(1);
            expect(env.payload.entry_type).toBe(et);
            expect("corrects_event_id" in env.payload).toBe(true);
            expect(env.payload.person_id).toBe("person-1");
            expect(env.payload.employment_id).toBe("emp-1");
            expect(env.payload.service_date).toBe("2026-08-17");
            expect(env.org_id).toBe("org-1");
        }
    });

    it("does NOT copy identity fields onto the fact", () => {
        for (const et of ["original", "correction", "reversal"] as const) {
            const p = probes.emittedEvents[et].payload as Record<string, unknown>;
            for (const identityKey of ["first_name", "last_name", "full_name", "email", "phone"]) {
                expect(identityKey in p).toBe(false);
            }
        }
    });

    it("carries no payroll COLUMN — presence is not timekeeping", () => {
        // Scan the column list, never the prose: the table's own COMMENT says
        // "not payroll ... no wages", and a text scan would fail on the very
        // sentence that states the boundary.
        const sql = stripSqlComments(readMigrationsOrderedTouching(TABLE).concatenated);
        const columns = createBlockColumnNames(sql, TABLE).map((c) => c.toLowerCase());
        expect(columns.length).toBeGreaterThan(0);
        for (const forbidden of ["overtime", "wage", "pay_rate", "compensable", "break_minutes", "hours_worked"]) {
            expect(columns.some((c) => c.includes(forbidden))).toBe(false);
        }
    });
});
