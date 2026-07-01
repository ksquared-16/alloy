import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPACITY_KINDS } from "@/lib/childcareOperational/config/configRuleTypes";

const migrationPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260628120000_childcare_config_rules_phase1.sql"
);

describe("childcare config rules Phase 1 migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("creates all first-class config rule tables", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.childcare_capacity_rules");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.childcare_ratio_rules");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.childcare_ratio_rule_tiers");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.childcare_operating_windows");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.childcare_schedule_rules");
    });

    it("defines the capacity kinds aligned with TS constants", () => {
        for (const kind of CAPACITY_KINDS) {
            expect(sql).toContain(`'${kind}'::text`);
        }
    });

    it("enforces the shared org->site->program->room scope shape", () => {
        expect(sql).toContain("scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])");
        expect(sql).toContain("childcare_capacity_rules_scope_shape");
        expect(sql).toContain("childcare_ratio_rules_scope_shape");
        expect(sql).toContain("childcare_operating_windows_scope_shape");
        expect(sql).toContain("childcare_schedule_rules_scope_shape");
    });

    it("validates scope refs via a shared trigger function", () => {
        expect(sql).toContain("validate_childcare_config_scope");
        expect(sql).toContain("location_type site");
        expect(sql).toContain("location_type unit");
    });

    it("supports tiered ratio thresholds with a uniqueness guard", () => {
        expect(sql).toContain("max_children integer NOT NULL");
        expect(sql).toContain("required_staff integer NOT NULL");
        expect(sql).toContain("childcare_ratio_rule_tiers_unique_threshold UNIQUE (ratio_rule_id, max_children)");
    });

    it("enables RLS and config-posture policies on every table", () => {
        for (const tbl of [
            "childcare_capacity_rules",
            "childcare_ratio_rules",
            "childcare_ratio_rule_tiers",
            "childcare_operating_windows",
            "childcare_schedule_rules",
        ]) {
            expect(sql).toContain(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY`);
        }
        // policies are emitted via format(); single quotes are doubled in source.
        expect(sql).toContain(
            "public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text, ''manager''::text])"
        );
        expect(sql).toContain("TO service_role");
    });

    it("does NOT create any expectation system-of-record table (expectations are derived)", () => {
        expect(sql).not.toMatch(/CREATE TABLE[^;]*expected/i);
        expect(sql).not.toMatch(/CREATE TABLE[^;]*occupancy/i);
        expect(sql).not.toMatch(/CREATE TABLE[^;]*attendance/i);
    });

    it("does NOT leak into off-limits job-vertical / forbidden tables", () => {
        expect(sql).not.toContain("job_id");
        expect(sql).not.toContain("public.jobs");
        expect(sql).not.toContain("public.schedules");
        expect(sql).not.toContain("public.assignments");
        expect(sql).not.toContain("public.recurrence_plans");
        expect(sql).not.toContain("public.customer_subscriptions");
        expect(sql).not.toContain("public.placement_candidates");
        expect(sql).not.toContain("public.pricing_");
        expect(sql).not.toContain("inquiry_child");
    });
});
