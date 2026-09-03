#!/usr/bin/env npx tsx
/**
 * REAL ENROLLMENT V1 — certification driver entry point.
 *
 * The boundary the toolkit runner invokes. Domain logic lives in lib/certification/; this file only
 * resolves the org and prints the report. Credentials are injected into this process by the toolkit
 * and never written to the worktree.
 *
 *   npm run dev:certify:enrollment-e2e
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { formatDriverReport, runEnrollmentCertification } from "@/lib/certification/enrollmentE2eDriver";
import { REAL_ENROLLMENT_V1_PHASES } from "@/lib/certification/enrollmentE2ePhases";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main(): Promise<void> {
    const supabase = createAdminClient();

    const explicit = process.env.ALLOY_CERT_ORG_ID?.trim();
    let orgId = explicit ?? "";
    if (!orgId) {
        const { data, error } = await supabase.from("orgs").select("id").order("created_at").limit(2);
        if (error) throw new Error(`orgs lookup failed: ${error.message}`);
        if (!data?.length) throw new Error("no orgs in this database");
        // Several orgs with no explicit choice is a refusal, not a pick: certifying against a tenant
        // nobody named is how a certification run becomes an incident.
        if (data.length > 1) throw new Error("several orgs present — pass --org rather than guessing");
        orgId = (data[0] as { id: string }).id;
    }

    const result = await runEnrollmentCertification(
        { supabase, orgId, actorUserId: null, facts: {} },
        REAL_ENROLLMENT_V1_PHASES,
    );

    console.log(formatDriverReport(result));

    /*
     * Exit non-zero unless every phase passed. Unimplemented phases keep the run red on purpose: the
     * suite must not be able to report success while steps it never ran are outstanding.
     */
    process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
    console.error(`enrollment certification driver failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
});
