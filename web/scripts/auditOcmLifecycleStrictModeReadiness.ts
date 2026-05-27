#!/usr/bin/env npx tsx
/**
 * Audit OCM lifecycle gaps + placement candidate integrity before strict eligibility (Card 12).
 *
 * Env:
 *   ORG_ID=uuid              (required)
 *   OUTPUT=json|csv          (default json)
 *
 * Run from repo `web/`:
 *   ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/auditOcmLifecycleStrictModeReadiness.ts
 *   ORG_ID=<uuid> OUTPUT=csv npx tsx --tsconfig tsconfig.json scripts/auditOcmLifecycleStrictModeReadiness.ts
 *
 * Read-only — no mutations. Does not enable ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runOcmLifecycleStrictModeAudit } from "@/lib/opportunities/runOcmLifecycleStrictModeAudit";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function toCsvRow(values: (string | number | boolean | null | undefined)[]): string {
    return values
        .map((v) => {
            if (v == null) return "";
            const s = String(v);
            if (s.includes(",") || s.includes('"') || s.includes("\n")) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        })
        .join(",");
}

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID or DEV_QUEUE_ORG_ID is required");
        process.exit(1);
    }

    const output = (process.env.OUTPUT ?? "json").trim().toLowerCase();
    const supabase = createAdminClient();
    const audit = await runOcmLifecycleStrictModeAudit(supabase, orgId);

    if (output === "csv") {
        console.log(toCsvRow(["section", "key", "value"]));
        console.log(toCsvRow(["summary", "strict_mode_ready", audit.strict_mode_ready]));
        for (const line of audit.strict_mode_blocker_summary) {
            console.log(toCsvRow(["blocker", "message", line]));
        }
        for (const [k, v] of Object.entries(audit.counts)) {
            if (typeof v === "object" && v != null) continue;
            console.log(toCsvRow(["count", k, v]));
        }
        for (const [k, v] of Object.entries(audit.counts.recommendations_by_kind)) {
            console.log(toCsvRow(["recommendation_kind", k, v]));
        }
        for (const [k, v] of Object.entries(audit.counts.candidate_by_category)) {
            console.log(toCsvRow(["candidate_category", k, v]));
        }
        console.log(toCsvRow(["recommendation", "header", ""]));
        console.log(
            toCsvRow([
                "ocm_id",
                "opportunity_id",
                "kind",
                "suggested_outcome_status_key",
                "opportunity_status_key",
                "reason",
            ])
        );
        for (const rec of audit.recommendations) {
            console.log(
                toCsvRow([
                    rec.ocm_id,
                    rec.opportunity_id,
                    rec.kind,
                    rec.suggested_outcome_status_key,
                    rec.opportunity_status_key,
                    rec.reason,
                ])
            );
        }
        console.log(toCsvRow(["candidate_integrity", "header", ""]));
        console.log(
            toCsvRow([
                "candidate_id",
                "opportunity_id",
                "category",
                "child_outcome_status_key",
                "reason",
            ])
        );
        for (const row of audit.candidate_integrity) {
            console.log(
                toCsvRow([
                    row.candidate_id,
                    row.opportunity_id,
                    row.category,
                    row.child_outcome_status_key,
                    row.reason,
                ])
            );
        }
        return;
    }

    console.log(
        JSON.stringify(
            {
                org_id: audit.org_id,
                strict_mode_ready: audit.strict_mode_ready,
                strict_mode_blocker_summary: audit.strict_mode_blocker_summary,
                counts: audit.counts,
                recommendations: audit.recommendations,
                candidate_integrity: audit.candidate_integrity,
                opportunity_conflicts: audit.opportunity_conflicts,
            },
            null,
            2
        )
    );

    if (!audit.strict_mode_ready) process.exit(2);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
