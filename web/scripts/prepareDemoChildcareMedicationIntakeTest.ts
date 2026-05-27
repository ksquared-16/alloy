#!/usr/bin/env npx tsx
/**
 * Prepare Demo Childcare Co medication intake test link (Forms Runtime Test 2D).
 * Patches public link metadata with Demo org IDs; creates center location if missing.
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json scripts/prepareDemoChildcareMedicationIntakeTest.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { DEMO_CHILDCARE_ORG_ID } from "@/lib/forms/intakeRuntimeTestFixtures";
import {
    MEDICATION_AUTHORIZATION_DEMO_FORM_KEY,
    MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN,
} from "@/lib/forms/seeds/medicationAuthorizationDemo";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG = DEMO_CHILDCARE_ORG_ID;
const ENROLLMENT_DEPT_ID = "04958a78-32ca-4091-bcd3-4bbaef3fee4b";
const ENROLLMENT_WORK_UNIT_ID = "5ba90557-876d-4450-9c28-36beac6e83be";
const CHILDCARE_VERTICAL_ID = "1000d719-2248-4816-8ff6-cbdeee8e91ce";

/** Org-scoped plaintext when canonical hash is owned elsewhere. */
const PLAINTEXT_TOKEN = `${MEDICATION_AUTHORIZATION_DEMO_PUBLIC_TOKEN}__org_${ORG}`;

const INTAKE_METADATA = {
    lead_capture: true,
    intake: true,
    mode: "intake",
    auto_create_person: true,
    auto_create_customer: true,
    auto_create_customer_member: true,
    auto_create_opportunity: true,
    default_vertical_id: CHILDCARE_VERTICAL_ID,
    default_department_id: ENROLLMENT_DEPT_ID,
    default_work_unit_id: ENROLLMENT_WORK_UNIT_ID,
    default_opportunity_status_key: "new",
    review_mode: "confidence",
    auto_operationalize: true,
    embed_mode: true,
    intake_opportunity_source: "embed",
    runtime_test: "forms_2d_demo_childcare",
} as const;

async function ensureCenterLocation(orgId: string): Promise<string> {
    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("locations")
        .select("id,label,location_type")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .eq("is_active", true)
        .order("created_at")
        .limit(1)
        .maybeSingle();

    if (existing?.id) {
        console.log("[2d] using existing center location:", existing.id, existing.label);
        return existing.id;
    }

    const { data: inserted, error } = await supabase
        .from("locations")
        .insert({
            org_id: orgId,
            label: "Demo Childcare Center",
            location_type: "site",
            is_active: true,
            metadata: { seed: "forms_runtime_test_2d", demo: true },
        })
        .select("id")
        .single();

    if (error || !inserted?.id) {
        throw new Error(`center location insert failed: ${error?.message ?? "no id"}`);
    }

    console.log("[2d] created center location:", inserted.id);
    return inserted.id;
}

async function validateOrgOwnership(supabase: ReturnType<typeof createAdminClient>) {
    const checks: { label: string; table: string; id: string; orgField?: string }[] = [
        { label: "enrollment department", table: "departments", id: ENROLLMENT_DEPT_ID },
        { label: "enrollment work unit", table: "work_units", id: ENROLLMENT_WORK_UNIT_ID },
    ];

    for (const c of checks) {
        const { data, error } = await supabase.from(c.table).select("id,org_id").eq("id", c.id).maybeSingle();
        if (error || !data) throw new Error(`${c.label} missing: ${c.id}`);
        if (data.org_id !== ORG) {
            throw new Error(`${c.label} ${c.id} belongs to org ${data.org_id}, not Demo Childcare Co`);
        }
    }

    const { data: vertical } = await supabase.from("verticals").select("id,slug,is_active").eq("id", CHILDCARE_VERTICAL_ID).maybeSingle();
    if (!vertical?.is_active) throw new Error("childcare vertical not active");
}

async function main() {
    const supabase = createAdminClient();

    const { data: org } = await supabase.from("orgs").select("id,name").eq("id", ORG).maybeSingle();
    if (!org) throw new Error(`Demo Childcare Co org not found: ${ORG}`);

    console.log("[2d] org:", org.name, ORG);
    await validateOrgOwnership(supabase);

    const centerLocationId = await ensureCenterLocation(ORG);

    const { data: form } = await supabase
        .from("form_definitions")
        .select("id,key,name")
        .eq("org_id", ORG)
        .eq("key", MEDICATION_AUTHORIZATION_DEMO_FORM_KEY)
        .maybeSingle();

    if (!form?.id) {
        throw new Error(
            "Medication Authorization — Demo not found in Demo Childcare Co. Run seedMedicationAuthorizationDemoForOrg.ts first."
        );
    }

    const { hashFormLinkToken } = await import("@/lib/public/forms/tokenHash");
    const tokenHash = hashFormLinkToken(PLAINTEXT_TOKEN);

    const { data: link } = await supabase
        .from("form_public_links")
        .select("id,metadata,form_definition_id,pinned_form_definition_version_id")
        .eq("token_hash", tokenHash)
        .maybeSingle();

    if (!link?.id) {
        throw new Error(
            `Public link not found for token hash. Run: DEMO_RESET_ORG_ID=${ORG} npx tsx scripts/seedMedicationAuthorizationDemoForOrg.ts`
        );
    }
    if (link.form_definition_id !== form.id) {
        throw new Error(`Link ${link.id} points to wrong form ${link.form_definition_id}`);
    }

    const finalMetadata = {
        ...(typeof link.metadata === "object" && link.metadata ? (link.metadata as Record<string, unknown>) : {}),
        ...INTAKE_METADATA,
        default_location_id: centerLocationId,
        demo: true,
        seed: "medication_authorization_demo",
        runtime_test_prepared_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
        .from("form_public_links")
        .update({
            metadata: finalMetadata,
            is_active: true,
            allowed_embed_origins: ["http://localhost:3000", "http://127.0.0.1:3000"],
        })
        .eq("id", link.id);

    if (upErr) throw new Error(`link metadata update failed: ${upErr.message}`);

    const embedUrl = `http://localhost:3000/forms/embed/${PLAINTEXT_TOKEN}`;

    console.log("\n=== Forms Runtime Test 2D — READY ===\n");
    console.log(JSON.stringify(
        {
            orgId: ORG,
            orgName: org.name,
            formId: form.id,
            formName: form.name,
            publicLinkId: link.id,
            plaintextToken: PLAINTEXT_TOKEN,
            embedUrl,
            pinnedVersionId: link.pinned_form_definition_version_id,
            finalMetadata,
            expectedFirstSubmit: {
                workloadPill: "Needs Review",
                narrative:
                    "New inquiry created — review required (child member auto-created; IC-4 blocks auto-operationalize)",
                intake_auto_operationalized: false,
                intake_needs_review: true,
                intake_review_reasons: ["new_person_created", "child_member_auto_created"],
                workflowEvent: "intake_case_review_required",
                opportunity: {
                    vertical_id: CHILDCARE_VERTICAL_ID,
                    location_id: centerLocationId,
                    work_unit_id: ENROLLMENT_WORK_UNIT_ID,
                    department_id: ENROLLMENT_DEPT_ID,
                    status_key: "new",
                    source: "embed",
                },
            },
            expectedLeadOnlyAutoOpSubmit: {
                note: "Gate patches link with auto_create_customer_member: false for IC-4 auto-op proof",
                metadata: {
                    ...INTAKE_METADATA,
                    auto_create_customer_member: false,
                    runtime_test: "forms_2d_demo_childcare_lead_only_auto_op",
                },
                workloadPill: "Recent (auto_operationalized)",
                intake_auto_operationalized: true,
                intake_needs_review: false,
                workflowEvent: "intake_case_operationalized",
            },
            expectedSecondSubmit: {
                workloadPill: "Recent",
                narrative: "Existing opportunity matched by guardian email",
                intake_opportunity_match: "attached_existing",
            },
            verifyAt: "/adminV2/forms",
        },
        null,
        2
    ));
}

main().catch((e) => {
    console.error("[2d] failed:", e);
    process.exit(1);
});
