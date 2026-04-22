#!/usr/bin/env npx tsx
/**
 * One-command childcare tenant spin-up (internal dev).
 * Run from `web/`: `npm run dev:tenant:childcare`
 *
 * @see docs/DEV_TENANT_SPINUP.md
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { spinChildcareTenantFlow } from "@/lib/dev/spinChildcareTenantFlow";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main() {
    const adminUserId = process.env.DEV_SPINUP_ADMIN_USER_ID?.trim() || process.env.TENANT_E2E_ADMIN_USER_ID?.trim();
    if (!adminUserId) {
        console.error("Set DEV_SPINUP_ADMIN_USER_ID (or TENANT_E2E_ADMIN_USER_ID) to an auth.users UUID.");
        process.exit(1);
    }

    if (process.env.DEV_TENANT_SPINUP_ENABLED !== "true") {
        console.warn("Warning: DEV_TENANT_SPINUP_ENABLED is not 'true' (create-org API also checks this). Spin-up uses service role only.");
    }

    const supabase = createAdminClient();
    const name = process.env.DEV_SPINUP_ORG_NAME?.trim() || `Dev Childcare ${new Date().toISOString()}`;

    console.log("Spinning up childcare tenant…");
    const result = await spinChildcareTenantFlow(supabase, {
        name,
        industry_key: "childcare",
        admin_user_id: adminUserId,
        configPrompt: "We run a childcare center",
    });

    if (!result.ok) {
        const phase = "phase" in result && result.phase ? ` [${result.phase}]` : "";
        console.error(`Failed${phase}:`, result.error);
        process.exit(1);
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

    console.log("\n--- Done ---");
    console.log("org_id:       ", result.org_id);
    console.log("slug:         ", result.slug);
    console.log("org name:     ", name);
    console.log("bootstrap:    ", JSON.stringify(result.bootstrap.summary, null, 2));
    console.log("seed summary: ", JSON.stringify(result.seed.summary, null, 2));
    console.log("\nOpen in browser (log in as the admin user linked to this org):");
    console.log(`  ${baseUrl}/admin`);
    console.log(`  ${baseUrl}/admin/departments`);
    console.log("\nOrg id for API / debugging:", result.org_id);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
