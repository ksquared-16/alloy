/**
 * Assert canonical DB state for Phase 7 E2E fixture rows.
 *
 * Usage (after seed apply):
 *   cd web && npx tsx scripts/runCanonicalE2eDbAssertions.ts --opportunity-id=<uuid>
 */

import { createClient } from "@supabase/supabase-js";
import {
    validateCustomerMemberRowGrain,
    validateOcmRowGrain,
    validateOpportunityWritePayload,
} from "@/lib/fields/canonicalE2eValidators";

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Missing ${name}`);
    return v;
}

function arg(name: string): string | null {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : null;
}

async function main() {
    const opportunityId = arg("opportunity-id");
    if (!opportunityId) throw new Error("Provide --opportunity-id=<uuid>");

    const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
    });

    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, org_id, status_key, customer_id, primary_person_id, metadata")
        .eq("id", opportunityId)
        .maybeSingle();
    if (oppErr || !opp) throw new Error(oppErr?.message ?? "opportunity not found");

    const oppRow = opp as Record<string, unknown>;
    const oppIssues = validateOpportunityWritePayload(oppRow);
    if (!oppRow.status_key) oppIssues.push({ code: "missing_status_key", message: "status_key required" });

    const { data: ocms } = await supabase
        .from("opportunity_customer_members")
        .select("id, outcome_status_key, desired_start_date, customer_member_id, first_name, last_name, dob")
        .eq("opportunity_id", opportunityId);

    const ocmIssues = (ocms ?? []).flatMap((row) =>
        validateOcmRowGrain(row as Record<string, unknown>)
    );

    const memberIds = [...new Set((ocms ?? []).map((r) => (r as { customer_member_id?: string }).customer_member_id).filter(Boolean))];
    let cmIssues: ReturnType<typeof validateCustomerMemberRowGrain> = [];
    if (memberIds.length) {
        const { data: members } = await supabase
            .from("customer_members")
            .select("id, first_name, last_name, dob, location_id, desired_start_date")
            .in("id", memberIds as string[]);
        cmIssues = (members ?? []).flatMap((row) => validateCustomerMemberRowGrain(row as Record<string, unknown>));
    }

    const all = [...oppIssues, ...ocmIssues, ...cmIssues];
    if (all.length) {
        console.error("Canonical DB assertion failures:", all);
        process.exit(1);
    }

    console.log("OK — canonical DB assertions passed for opportunity", opportunityId);
    console.log({
        status_key: oppRow.status_key,
        ocm_count: ocms?.length ?? 0,
        customer_member_ids: memberIds,
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
