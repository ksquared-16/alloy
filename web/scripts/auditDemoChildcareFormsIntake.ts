#!/usr/bin/env npx tsx
/**
 * Audit Demo Childcare Co for Forms Runtime Test 2D intake setup.
 * Usage: cd web && npx tsx --tsconfig tsconfig.json scripts/auditDemoChildcareFormsIntake.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { DEMO_CHILDCARE_ORG_ID } from "@/lib/forms/intakeRuntimeTestFixtures";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG = DEMO_CHILDCARE_ORG_ID;

async function main() {
    const supabase = createAdminClient();

    const { data: org } = await supabase.from("orgs").select("id,name,slug").eq("id", ORG).maybeSingle();
    console.log("\n=== ORG ===");
    console.log(JSON.stringify(org, null, 2));

    const { data: forms } = await supabase
        .from("form_definitions")
        .select("id,key,name,is_active,metadata,created_at")
        .eq("org_id", ORG)
        .order("name");
    console.log("\n=== FORMS ===");
    console.log("count:", forms?.length ?? 0);
    for (const f of forms ?? []) {
        console.log(`  ${f.id} | ${f.key} | ${f.name} | active=${f.is_active}`);
    }

    const medForm = forms?.find((f) => f.key === MEDICATION_AUTHORIZATION_DEMO_FORM_KEY);
    console.log("\n=== MEDICATION DEMO FORM ===");
    console.log(medForm ? `EXISTS: ${medForm.id}` : "NOT FOUND");

    if (medForm) {
        const { data: versions } = await supabase
            .from("form_definition_versions")
            .select("id,version_number,status,published_at")
            .eq("form_definition_id", medForm.id)
            .order("version_number");
        console.log("versions:", versions);

        const { data: links } = await supabase
            .from("form_public_links")
            .select("id,token_prefix,is_active,allowed_embed_origins,metadata,pinned_form_definition_version_id,created_at")
            .eq("org_id", ORG)
            .eq("form_definition_id", medForm.id);
        console.log("\n=== PUBLIC LINKS (medication demo) ===");
        console.log(JSON.stringify(links, null, 2));
    }

    const { data: allLinks } = await supabase
        .from("form_public_links")
        .select("id,form_definition_id,token_prefix,is_active,metadata")
        .eq("org_id", ORG);
    console.log("\n=== ALL PUBLIC LINKS ===");
    console.log("count:", allLinks?.length ?? 0);

    const { data: locations } = await supabase
        .from("locations")
        .select("id,label,location_type,is_active,metadata")
        .eq("org_id", ORG)
        .order("label");
    console.log("\n=== LOCATIONS ===");
    for (const l of locations ?? []) {
        console.log(`  ${l.id} | ${l.label} | type=${l.location_type} | active=${l.is_active}`);
    }

    const { data: sites } = await supabase
        .from("sites")
        .select("id,name,is_active,location_id")
        .eq("org_id", ORG)
        .order("name");
    console.log("\n=== SITES ===");
    for (const s of sites ?? []) {
        console.log(`  ${s.id} | ${s.name} | location=${s.location_id}`);
    }

    const { data: departments } = await supabase
        .from("departments")
        .select("id,name,key,is_active,metadata")
        .eq("org_id", ORG)
        .order("name");
    console.log("\n=== DEPARTMENTS ===");
    for (const d of departments ?? []) {
        console.log(`  ${d.id} | ${d.key ?? "—"} | ${d.name} | active=${d.is_active}`);
    }

    const { data: workUnits } = await supabase
        .from("work_units")
        .select("id,name,key,department_id,site_id,is_active,metadata")
        .eq("org_id", ORG)
        .order("name");
    console.log("\n=== WORK UNITS ===");
    for (const w of workUnits ?? []) {
        console.log(`  ${w.id} | ${w.key ?? "—"} | ${w.name} | dept=${w.department_id} | site=${w.site_id}`);
    }

    const { data: enrollmentWu } = await supabase
        .from("work_units")
        .select("*")
        .eq("id", "5ba90557-876d-4450-9c28-36beac6e83be")
        .maybeSingle();
    console.log("\n=== EXPECTED ENROLLMENT WORK UNIT ===");
    console.log(JSON.stringify(enrollmentWu, null, 2));

    const { data: childcareVertical } = await supabase
        .from("verticals")
        .select("id,slug,name")
        .eq("slug", "childcare")
        .eq("is_active", true)
        .maybeSingle();
    console.log("\n=== CHILDCARE VERTICAL ===");
    console.log(JSON.stringify(childcareVertical, null, 2));

    const { hashFormLinkToken } = await import("@/lib/public/forms/tokenHash");
    const { MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN } = await import("@/lib/forms/seeds/medicationAuthorizationDemo");
    const tokenCandidates = [
        MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN,
        `${MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN}__org_${ORG}`,
    ];
    console.log("\n=== TOKEN HASH PROBE ===");
    for (const plaintext of tokenCandidates) {
        const hash = hashFormLinkToken(plaintext);
        const { data: link } = await supabase
            .from("form_public_links")
            .select("id,org_id,token_prefix,metadata")
            .eq("token_hash", hash)
            .maybeSingle();
        console.log(`  plaintext: ${plaintext}`);
        console.log(`  match: ${link ? `YES link=${link.id}` : "no"}`);
    }

    const { data: verticals } = await supabase
        .from("verticals")
        .select("id,slug,name,is_active")
        .order("slug");
    console.log("\n=== VERTICALS (global) ===");
    for (const v of verticals ?? []) {
        console.log(`  ${v.id} | ${v.slug} | ${v.name} | active=${v.is_active}`);
    }

    const { data: oppStatuses } = await supabase
        .from("opportunity_statuses")
        .select("id,key,label,is_active")
        .eq("org_id", ORG)
        .order("sort_order");
    console.log("\n=== OPPORTUNITY STATUSES ===");
    for (const s of oppStatuses ?? []) {
        console.log(`  ${s.id} | ${s.key} | ${s.label}`);
    }

    const { data: recentSubs } = await supabase
        .from("form_submissions")
        .select("id,form_definition_id,status,submitted_at,opportunity_id")
        .eq("org_id", ORG)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(5);
    console.log("\n=== RECENT SUBMISSIONS ===");
    for (const s of recentSubs ?? []) {
        console.log(`  ${s.id} | ${s.submitted_at?.slice(0, 10)} | opp=${s.opportunity_id ?? "—"}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
