import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES,
    CHILD_ENROLLMENT_AGREEMENT_STATUSES,
    CHILD_PLACEMENT_OPERATIONAL_STATUSES,
    CHILD_PLACEMENT_STATUSES,
    SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";

const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260625120000_childcare_operational_enrollment_slice1.sql"
);

describe("childcare operational enrollment slice 1 migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("creates all four operational tables", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.child_enrollment_agreements");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.child_placements");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.schedule_patterns");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.schedule_assignments");
    });

    it("defines agreement status check aligned with doctrine", () => {
        for (const status of CHILD_ENROLLMENT_AGREEMENT_STATUSES) {
            expect(sql).toContain(`'${status}'::text`);
        }
        expect(sql).not.toContain("'withdrawn'::text");
    });

    it("defines placement and schedule assignment status checks aligned with doctrine", () => {
        for (const status of CHILD_PLACEMENT_STATUSES) {
            expect(sql).toContain(`'${status}'::text`);
        }
        expect(sql).toContain("superseded");
    });

    it("enforces one operational agreement per child per site (not global)", () => {
        expect(sql).toContain("ux_child_enrollment_agreements_one_operational_per_member_site");
        expect(sql).toMatch(
            /ux_child_enrollment_agreements_one_operational_per_member_site[\s\S]*?customer_member_id,\s*site_location_id/
        );
        for (const status of CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES) {
            expect(sql).toContain(`'${status}'::text`);
        }
        expect(sql).not.toMatch(
            /ux_child_enrollment_agreements[\s\S]*?UNIQUE\s*\(\s*org_id,\s*customer_member_id\s*\)[\s\S]*?WHERE/
        );
    });

    it("enforces one operational placement and schedule assignment per agreement", () => {
        expect(sql).toContain("ux_child_placements_one_operational_per_agreement");
        expect(sql).toContain("ux_schedule_assignments_one_operational_per_agreement");
        for (const status of CHILD_PLACEMENT_OPERATIONAL_STATUSES) {
            expect(sql).toContain(`'${status}'::text`);
        }
        for (const status of SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES) {
            expect(sql).toContain(`'${status}'::text`);
        }
    });

    it("allows nullable opportunity provenance for manual/import/re-enrollment", () => {
        expect(sql).toMatch(
            /opportunity_id uuid REFERENCES public\.opportunities \(id\) ON DELETE SET NULL/
        );
        expect(sql).toMatch(
            /opportunity_customer_member_id uuid REFERENCES public\.opportunity_customer_members \(id\) ON DELETE SET NULL/
        );
        expect(sql).toContain("Nullable for manual/import/re-enrollment paths");
    });

    it("requires customer_member_id and site_location_id on agreements", () => {
        expect(sql).toMatch(/customer_member_id uuid NOT NULL REFERENCES public\.customer_members/);
        expect(sql).toMatch(/site_location_id uuid NOT NULL REFERENCES public\.locations/);
    });

    it("adds org consistency trigger functions", () => {
        expect(sql).toContain("validate_child_enrollment_agreements_consistency");
        expect(sql).toContain("validate_child_placements_consistency");
        expect(sql).toContain("validate_schedule_patterns_consistency");
        expect(sql).toContain("validate_schedule_assignments_consistency");
        expect(sql).toContain("validate_schedule_patterns_weekdays");
    });

    it("validates site and room location types in triggers", () => {
        expect(sql).toContain("location_type site");
        expect(sql).toContain("location_type unit");
    });

    it("enables RLS on all four tables", () => {
        expect(sql).toContain("ALTER TABLE public.child_enrollment_agreements ENABLE ROW LEVEL SECURITY");
        expect(sql).toContain("ALTER TABLE public.child_placements ENABLE ROW LEVEL SECURITY");
        expect(sql).toContain("ALTER TABLE public.schedule_patterns ENABLE ROW LEVEL SECURITY");
        expect(sql).toContain("ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY");
    });

    it("adds operational and config RLS policies", () => {
        expect(sql).toContain("child_enrollment_agreements_select_org");
        expect(sql).toContain("child_enrollment_agreements_mutate_crm");
        expect(sql).toContain("child_placements_select_org");
        expect(sql).toContain("schedule_patterns_select_org");
        expect(sql).toContain("schedule_patterns_insert_org");
        expect(sql).toContain("schedule_assignments_mutate_crm");
    });

    it("does not seed schedule patterns or touch job schedules", () => {
        expect(sql).not.toContain("INSERT INTO public.schedule_patterns");
        expect(sql).not.toContain("public.schedules");
    });

    it("documents placements domain table name child_placements", () => {
        expect(sql).toContain("child_placements");
        expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS public.placements");
    });
});

describe("enrollmentOperationalStatus constants", () => {
    it("matches migration operational status sets", () => {
        expect(CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES).toEqual([
            "pending_start",
            "active",
            "ending",
        ]);
        expect(CHILD_PLACEMENT_OPERATIONAL_STATUSES).toEqual(["planned", "active", "ending"]);
        expect(SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES).toEqual(["planned", "active", "ending"]);
    });
});
