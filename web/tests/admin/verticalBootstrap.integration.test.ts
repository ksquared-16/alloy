/**
 * Real apply against Supabase — requires:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERTICAL_BOOTSTRAP_INTEGRATION_ORG_ID
 * Run (from web/): VERTICAL_BOOTSTRAP_INTEGRATION_ORG_ID=<org-uuid> npm test -- tests/admin/verticalBootstrap.integration.test.ts
 */
import { describe, expect, it } from "vitest";
import { applyVerticalBootstrap } from "@/lib/admin/verticalBootstrap/applyVerticalBootstrap";
import { CHILDCARE_VERTICAL_BOOTSTRAP_V1 } from "@/lib/admin/verticalBootstrap/childcareBootstrapV1";
import { previewVerticalBootstrap } from "@/lib/admin/verticalBootstrap/previewVerticalBootstrap";
import { createAdminClient } from "@/lib/supabaseAdmin";

const orgId = process.env.VERTICAL_BOOTSTRAP_INTEGRATION_ORG_ID;
const hasEnv =
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    Boolean(orgId && orgId.length > 10);

describe.skipIf(!hasEnv)("vertical bootstrap — childcare apply (integration)", () => {
    it("preview echoes onboarding_context", async () => {
        const supabase = createAdminClient();
        const pre = await previewVerticalBootstrap(supabase, orgId!, CHILDCARE_VERTICAL_BOOTSTRAP_V1);
        expect(pre.ok).toBe(true);
        expect(pre.onboarding_context?.industry_key).toBe("childcare");
        expect(pre.onboarding_context?.terminology?.opportunity).toBe("Family inquiry");
    });

    it("applies childcare structurally and leaves rows queryable", async () => {
        const supabase = createAdminClient();
        const applied = await applyVerticalBootstrap(supabase, orgId!, CHILDCARE_VERTICAL_BOOTSTRAP_V1);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;

        const { data: dept, error: dErr } = await supabase
            .from("departments")
            .select("id, key")
            .eq("org_id", orgId!)
            .eq("key", "enrollment")
            .maybeSingle();
        expect(dErr).toBeNull();
        expect(dept).toBeTruthy();

        const { data: statuses, error: sErr } = await supabase
            .from("status_definitions")
            .select("status_key")
            .eq("org_id", orgId!)
            .eq("entity_type", "opportunity")
            .in("status_key", ["new", "needs_a_quote", "quoted", "booked"]);
        expect(sErr).toBeNull();
        expect((statuses ?? []).length).toBeGreaterThanOrEqual(4);

        const deptId = (dept as { id: string }).id;
        const { data: wus, error: wErr } = await supabase
            .from("work_units")
            .select("key")
            .eq("org_id", orgId!)
            .eq("department_id", deptId)
            .in("key", ["pipeline_overview", "early_inquiries", "quoting", "priced_followup"]);
        expect(wErr).toBeNull();
        expect((wus ?? []).length).toBe(4);
    });
});
