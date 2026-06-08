#!/usr/bin/env npx tsx
/**
 * Dev/demo cleanup for Forms / Enrollment QA gate artifacts.
 *
 * Removes (or archives) opportunities and related rows created by:
 *   - qaEnrollmentLeadOpportunityProof.ts
 *   - qaEnrollmentIntakeLifecycleCoherence.ts
 *
 * Usage (from `web/`):
 *
 *   # Dry-run — list matching rows (default)
 *   npx tsx scripts/cleanupFormsQaArtifacts.ts --org-id <ORG_UUID>
 *
 *   # Destructive cleanup
 *   npx tsx scripts/cleanupFormsQaArtifacts.ts --org-id <ORG_UUID> --confirm
 *
 *   # Archive to lost instead of hard delete
 *   npx tsx scripts/cleanupFormsQaArtifacts.ts --org-id <ORG_UUID> --confirm --archive-only
 *
 * Refuses when VERCEL_ENV=production.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { cleanupFormsQaArtifacts } from "@/lib/forms/cleanupFormsQaArtifacts";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseArgs(argv: string[]) {
    let orgId: string | null = null;
    const orgIdx = argv.indexOf("--org-id");
    if (orgIdx >= 0) {
        const v = argv[orgIdx + 1]?.trim();
        if (v && UUID_RE.test(v)) orgId = v;
    }
    for (const arg of argv) {
        if (arg.startsWith("--org-id=")) {
            const v = arg.slice("--org-id=".length).trim();
            if (UUID_RE.test(v)) orgId = v;
        }
    }
    return {
        orgId,
        confirm: argv.includes("--confirm"),
        archiveOnly: argv.includes("--archive-only"),
    };
}

async function main() {
    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run Forms QA cleanup in production (VERCEL_ENV=production).");
        process.exit(1);
    }

    const { orgId, confirm, archiveOnly } = parseArgs(process.argv.slice(2));
    if (!orgId) {
        console.error("Usage: npx tsx scripts/cleanupFormsQaArtifacts.ts --org-id <ORG_UUID> [--confirm] [--archive-only]");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const result = await cleanupFormsQaArtifacts(supabase, { orgId, confirm, archiveOnly });

    console.log(
        JSON.stringify(
            {
                dryRun: result.dryRun,
                orgId,
                plan: {
                    submissionIds: result.plan.submissionIds,
                    opportunityIds: result.plan.opportunityIds,
                    personIds: result.plan.personIds,
                    customerIds: result.plan.customerIds,
                    workflowEventIds: result.plan.workflowEventIds,
                    opportunities: result.plan.opportunities,
                    submissions: result.plan.submissions,
                },
                deleted: result.deleted,
                hint:
                    result.dryRun ?
                        "Dry-run only. Re-run with --confirm to remove QA artifacts."
                    :   "Cleanup complete.",
            },
            null,
            2
        )
    );

    process.exit(0);
}

main().catch((e) => {
    console.error("[cleanup-forms-qa-artifacts] failed:", e);
    process.exit(1);
});
