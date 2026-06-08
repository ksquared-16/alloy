/**
 * Full tenant spin-up integration test (no UI).
 *
 * Required env (set in shell or .env.local when running vitest):
 *   TENANT_E2E_ENABLED=true
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TENANT_E2E_ADMIN_USER_ID=<auth.users UUID> — user receiving admin role on the new org
 *
 * Creates a fresh org per run (name includes timestamp) to avoid cross-run collisions.
 * Safe to skip in CI when env is missing.
 */

import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { CHILDCARE_DEMO_SEED_PACKAGE } from "@/lib/dev/seedChildcareDemo";
import { spinChildcareTenantFlow } from "@/lib/dev/spinChildcareTenantFlow";

const enabled =
    process.env.TENANT_E2E_ENABLED === "true" &&
    Boolean(process.env.SUPABASE_URL?.trim()) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) &&
    Boolean(process.env.TENANT_E2E_ADMIN_USER_ID?.trim());

describe.skipIf(!enabled)("tenant spin-up end-to-end (childcare)", () => {
    it("creates org, applies generated config, seeds demo, and matches expected DB shape", async () => {
        const adminUserId = process.env.TENANT_E2E_ADMIN_USER_ID!.trim();
        const supabase = createAdminClient();

        const name = `E2E Tenant ${new Date().toISOString()}`;
        const result = await spinChildcareTenantFlow(supabase, {
            name,
            industry_key: "childcare",
            admin_user_id: adminUserId,
            configPrompt: "We run a childcare center",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const { org_id: orgId } = result;
        expect(result.tenant_payload.structural_config.vertical_key).toBe("childcare");

        const { data: orgRow, error: orgErr } = await supabase.from("orgs").select("id, name, slug").eq("id", orgId).single();
        expect(orgErr).toBeNull();
        expect(orgRow).toBeTruthy();
        expect((orgRow as { name: string }).name).toBe(name);

        const { data: enrollment } = await supabase
            .from("departments")
            .select("id, key")
            .eq("org_id", orgId)
            .eq("key", "enrollment")
            .maybeSingle();
        expect(enrollment).toBeTruthy();

        const { count: wuCount } = await supabase
            .from("work_units")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId);
        expect((wuCount ?? 0) >= 4).toBe(true);

        const { data: statuses } = await supabase
            .from("status_definitions")
            .select("status_key")
            .eq("org_id", orgId)
            .eq("entity_type", "opportunity");
        expect((statuses ?? []).length).toBeGreaterThanOrEqual(6);

        const { data: opps } = await supabase
            .from("opportunities")
            .select("quote_total, status_key, metadata")
            .eq("org_id", orgId)
            .contains("metadata", { demo_seed_package: CHILDCARE_DEMO_SEED_PACKAGE });

        expect((opps ?? []).length).toBeGreaterThanOrEqual(8);

        const priced = (opps ?? []).filter((o) => {
            const q = (o as { quote_total?: unknown }).quote_total;
            return q != null && Number(q) > 0;
        });
        const unpriced = (opps ?? []).filter((o) => {
            const q = (o as { quote_total?: unknown }).quote_total;
            return q == null || Number(q) === 0;
        });
        expect(priced.length).toBeGreaterThanOrEqual(1);
        expect(unpriced.length).toBeGreaterThanOrEqual(1);
    }, 180_000);
});
