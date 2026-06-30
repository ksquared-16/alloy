#!/usr/bin/env npx tsx
/**
 * Suppress legacy child enrollment status `new_inquiry` for a single org.
 *
 * Product language is "Lead", not "Inquiry". A brand-new lead's child has no enrollment outcome yet,
 * and the OCM status domain defines no "lead" disposition — so child `outcome_status_key = new_inquiry`
 * is invalid and humanizes to "New Inquiry". This sets those legacy child rows to NULL (badge
 * suppressed). It also relabels the org's `new_inquiry` status definitions to "New Lead" so the
 * OPPORTUNITY (case) status never reads "Inquiry".
 *
 * It is SAFE BY DEFAULT: dry-run unless `EXECUTE=1` is set. It does NOT mutate any opportunity
 * status_key (the opportunity continues to use the legacy `new_inquiry` key, accepted by the queue).
 *
 * Env:
 *   ORG_ID=uuid   (required — e.g. 93667019-bd28-49b5-a688-acc9bb1e0a19)
 *   EXECUTE=1     (apply writes; omit for a dry-run that only reports counts)
 *
 * Run from repo `web/`:
 *   ORG_ID=<uuid> npm run dev:suppress:child-new-inquiry            # dry-run (default)
 *   ORG_ID=<uuid> EXECUTE=1 npm run dev:suppress:child-new-inquiry  # apply
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

async function main(): Promise<void> {
    const orgId = (process.env.ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID is required (e.g. 93667019-bd28-49b5-a688-acc9bb1e0a19)");
        process.exit(1);
    }
    const execute = process.env.EXECUTE === "1" || process.env.EXECUTE === "true";
    const sb = createAdminClient();
    console.log(`[child-new-inquiry] org=${orgId} mode=${execute ? "EXECUTE" : "DRY-RUN"}`);

    // Identify legacy child rows + opportunity rows (the latter are NOT mutated — reported only).
    const ocm = await sb
        .from("opportunity_customer_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("outcome_status_key", "new_inquiry");
    if (ocm.error) throw new Error(`count OCM: ${ocm.error.message}`);
    const opp = await sb
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status_key", "new_inquiry");
    if (opp.error) throw new Error(`count opportunities: ${opp.error.message}`);

    console.log(`[child-new-inquiry] OCM child rows on 'new_inquiry' -> NULL: ${ocm.count ?? 0}`);
    console.log(`[child-new-inquiry] opportunities on 'new_inquiry' (left as-is, legacy key): ${opp.count ?? 0}`);

    const { data: defs } = await sb
        .from("status_definitions")
        .select("entity_type,status_key,status_label")
        .eq("org_id", orgId)
        .eq("status_key", "new_inquiry");
    console.log("[child-new-inquiry] new_inquiry status_definitions:", JSON.stringify(defs ?? []));

    if (!execute) {
        console.log("[child-new-inquiry] DRY-RUN — no writes. Re-run with EXECUTE=1 to apply.");
        return;
    }

    // 1) Suppress legacy child enrollment status (no disposition until enrollment starts).
    if ((ocm.count ?? 0) > 0) {
        const { error } = await sb
            .from("opportunity_customer_members")
            .update({ outcome_status_key: null })
            .eq("org_id", orgId)
            .eq("outcome_status_key", "new_inquiry");
        if (error) throw new Error(`update OCM: ${error.message}`);
        console.log(`[child-new-inquiry] set ${ocm.count} OCM child rows outcome_status_key -> NULL`);
    }

    // 2) Relabel `new_inquiry` definitions to "New Lead" (no key change; opportunity untouched).
    const { error: relabelErr } = await sb
        .from("status_definitions")
        .update({ status_label: "New Lead" })
        .eq("org_id", orgId)
        .eq("status_key", "new_inquiry")
        .in("entity_type", ["opportunities", "opportunity_customer_members"])
        .neq("status_label", "New Lead");
    if (relabelErr) throw new Error(`relabel defs: ${relabelErr.message}`);
    console.log("[child-new-inquiry] relabeled new_inquiry definitions -> 'New Lead' (where needed)");

    // 3) Verify.
    const after = await sb
        .from("opportunity_customer_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("outcome_status_key", "new_inquiry");
    console.log(`[child-new-inquiry] DONE. Remaining OCM 'new_inquiry': ${after.count ?? 0}`);
}

main().catch((e) => {
    console.error("[child-new-inquiry] FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
});
