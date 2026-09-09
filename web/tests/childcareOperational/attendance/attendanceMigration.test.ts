import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    ATTENDANCE_ACTOR_TYPES,
    ATTENDANCE_EVENT_KINDS,
    ATTENDANCE_SOURCE_TYPES,
} from "@/lib/childcareOperational/attendance/attendanceVocabulary";

const migrationPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql"
);

/**
 * Capture hardening (Thread 2) re-issued the source_type CHECK to admit the
 * channels future producers need, so the vocabulary is no longer expressible
 * from the P2 file alone. The effective contract is P2 plus every later
 * migration that touches it — scanning only the first would assert a schema
 * that has not been the live one since.
 */
const captureHardeningPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260909160000_attendance_capture_hardening.sql"
);

describe("childcare attendance facts P2 migration", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const effectiveSql = sql + "\n" + readFileSync(captureHardeningPath, "utf8");

    it("creates the single append-only attendance fact table", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.child_attendance_events");
    });

    it("is append-only: created_* only, no updated_* columns", () => {
        expect(sql).toContain("created_at timestamptz NOT NULL DEFAULT now()");
        expect(sql).not.toContain("updated_at");
        expect(sql).not.toContain("updated_by");
    });

    it("blocks UPDATE/DELETE via a prevent-mutation trigger", () => {
        expect(sql).toContain("prevent_child_attendance_events_mutation");
        expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.child_attendance_events");
        expect(sql).toContain("append-only");
    });

    it("models corrections/reversals by reference, not mutation", () => {
        expect(sql).toContain("corrects_event_id uuid REFERENCES public.child_attendance_events (id)");
        expect(sql).toContain("child_attendance_events_entry_link_shape");
    });

    it("references the committed enrollment foundation", () => {
        expect(sql).toContain("REFERENCES public.child_enrollment_agreements (id)");
        expect(sql).toContain("REFERENCES public.customer_members (id)");
        expect(sql).toContain("REFERENCES public.locations (id)");
    });

    it("encodes the event-kind / actor / source vocabularies from TS", () => {
        for (const k of ATTENDANCE_EVENT_KINDS) expect(sql).toContain(`'${k}'::text`);
        for (const a of ATTENDANCE_ACTOR_TYPES) expect(sql).toContain(`'${a}'::text`);
        // Source channels span both migrations — see effectiveSql above.
        for (const s of ATTENDANCE_SOURCE_TYPES) expect(effectiveSql).toContain(`'${s}'::text`);
    });

    it("keeps durable idempotency in the database, not in a caller", () => {
        const hardening = readFileSync(captureHardeningPath, "utf8");
        // Partial unique index: dedupe only where a key is present, so facts
        // authored without one are never collapsed into each other.
        expect(hardening).toContain("uq_child_attendance_events_org_idempotency");
        expect(hardening).toContain("WHERE idempotency_key IS NOT NULL");
        // Race-free: insert first and re-read on conflict, never check-then-insert.
        expect(hardening).toContain("ON CONFLICT (org_id, idempotency_key)");
        expect(hardening).toContain("DO NOTHING");
        expect(hardening).toContain("attendance_idempotency_conflict");
    });

    it("models room transfer as a fact distinct from placement supersede", () => {
        expect(sql).toContain("from_room_location_id");
        expect(sql).toContain("to_room_location_id");
        expect(sql).toContain("child_attendance_events_transfer_rooms");
    });

    it("enables RLS with operational posture and service_role policy", () => {
        expect(sql).toContain("ALTER TABLE public.child_attendance_events ENABLE ROW LEVEL SECURITY");
        expect(sql).toContain("child_attendance_events_select_org");
        expect(sql).toContain("child_attendance_events_insert_crm");
        expect(sql).toContain("child_attendance_events_service_all");
        expect(sql).toContain("GRANT SELECT, INSERT ON TABLE public.child_attendance_events TO authenticated");
    });

    it("does not persist expectation system-of-record tables (L3 stays derived)", () => {
        expect(sql).not.toContain("expected_attendance");
        expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS public.childcare_expectations");
    });

    it("does not leak job-vertical / proposal tables", () => {
        expect(sql).not.toContain("job_id");
        expect(sql).not.toContain("opportunity_customer_members");
        expect(sql).not.toContain("inquiry_child");
        expect(sql).not.toContain("public.jobs");
    });
});
