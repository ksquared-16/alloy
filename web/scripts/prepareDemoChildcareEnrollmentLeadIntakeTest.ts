#!/usr/bin/env npx tsx
/**
 * Prepare Demo Childcare Co enrollment lead capture test (IC-5.6).
 * Upserts guardian-only demo form + public link with lead-capture intake metadata.
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json scripts/prepareDemoChildcareEnrollmentLeadIntakeTest.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    DEMO_CHILDCARE_ORG_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import {
    buildDemoEnrollmentLeadIntakeLinkMetadata,
} from "@/lib/forms/resolveDemoEnrollmentLeadTestContext";
import {
    ENROLLMENT_LEAD_CAPTURE_DEMO_DEFINITION_METADATA,
    ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY,
    ENROLLMENT_LEAD_CAPTURE_DEMO_OPERATOR_CONTEXT,
    ENROLLMENT_LEAD_CAPTURE_DEMO_PUBLIC_TOKEN,
    ENROLLMENT_LEAD_CAPTURE_DEMO_SCHEMA,
    ENROLLMENT_LEAD_CAPTURE_DEMO_VERSION_METADATA,
} from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";
import { validateFormSchema } from "@/lib/forms/schema";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG = DEMO_CHILDCARE_ORG_ID;
const PLAINTEXT_TOKEN = `${ENROLLMENT_LEAD_CAPTURE_DEMO_PUBLIC_TOKEN}__org_${ORG}`;

function jsonClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

async function ensureCenterLocation(orgId: string): Promise<string> {
    const supabase = createAdminClient();
    const { data: existing } = await supabase
        .from("locations")
        .select("id,label")
        .eq("org_id", orgId)
        .eq("location_type", "site")
        .eq("is_active", true)
        .order("created_at")
        .limit(1)
        .maybeSingle();
    if (existing?.id) return existing.id;

    const { data: inserted, error } = await supabase
        .from("locations")
        .insert({
            org_id: orgId,
            label: "Demo Childcare Center",
            location_type: "site",
            is_active: true,
            metadata: { seed: "enrollment_lead_proof" },
        })
        .select("id")
        .single();
    if (error || !inserted?.id) throw new Error(`center location insert failed: ${error?.message ?? "no id"}`);
    return inserted.id;
}

async function upsertForm(orgId: string): Promise<string> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_definitions")
        .upsert(
            {
                org_id: orgId,
                key: ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY,
                name: "Enrollment Lead — Demo",
                description: "Guardian-only enrollment lead capture — proves forms create real opportunities.",
                kind: "center",
                is_active: true,
                metadata: {
                    ...jsonClone(ENROLLMENT_LEAD_CAPTURE_DEMO_DEFINITION_METADATA),
                    operator_context: jsonClone(ENROLLMENT_LEAD_CAPTURE_DEMO_OPERATOR_CONTEXT),
                },
            },
            { onConflict: "org_id,key" }
        )
        .select("id")
        .single();
    if (error || !data?.id) throw new Error(`form_definitions upsert: ${error?.message ?? "no id"}`);
    return data.id;
}

async function ensurePublishedVersion(orgId: string, formId: string): Promise<string> {
    const supabase = createAdminClient();
    const schema = jsonClone(ENROLLMENT_LEAD_CAPTURE_DEMO_SCHEMA);
    validateFormSchema(schema);

    const { data: existing, error: exErr } = await supabase
        .from("form_definition_versions")
        .select("id,status,schema_json,version_number")
        .eq("form_definition_id", formId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (exErr) throw new Error(`version lookup: ${exErr.message}`);

    if (existing?.id && existing.status === "published") {
        try {
            validateFormSchema(existing.schema_json);
            return existing.id;
        } catch {
            console.warn("[enrollment-lead-proof] published schema invalid — creating version 2");
        }
    }

    const nextVersion = (existing?.version_number ?? 0) + 1;
    const { data: inserted, error: insErr } = await supabase
        .from("form_definition_versions")
        .insert({
            form_definition_id: formId,
            org_id: orgId,
            version_number: nextVersion,
            status: "published",
            schema_json: schema,
            pdf_mapping_json: null,
            published_at: new Date().toISOString(),
            published_by_user_id: null,
            metadata: jsonClone(ENROLLMENT_LEAD_CAPTURE_DEMO_VERSION_METADATA),
        })
        .select("id")
        .single();
    if (insErr || !inserted?.id) throw new Error(`version insert: ${insErr?.message ?? "no id"}`);
    return inserted.id;
}

async function ensurePublicLink(orgId: string, formId: string, versionId: string, locationId: string) {
    const supabase = createAdminClient();
    const tokenHash = hashFormLinkToken(PLAINTEXT_TOKEN);

    const { data: existing } = await supabase
        .from("form_public_links")
        .select("id,metadata")
        .eq("token_hash", tokenHash)
        .maybeSingle();

    const metadata = {
        label: "Enrollment Lead — Demo embed",
        demo: true,
        seed: "enrollment_lead_capture_demo",
        ...(await buildDemoEnrollmentLeadIntakeLinkMetadata(supabase, orgId)),
        default_location_id: locationId,
    };

    if (existing?.id) {
        const { error: upErr } = await supabase
            .from("form_public_links")
            .update({
                metadata,
                is_active: true,
                form_definition_id: formId,
                pinned_form_definition_version_id: versionId,
                allowed_embed_origins: ["http://localhost:3000", "http://127.0.0.1:3000"],
            })
            .eq("id", existing.id);
        if (upErr) throw new Error(`link update failed: ${upErr.message}`);
        return existing.id;
    }

    const { data: inserted, error: insErr } = await supabase
        .from("form_public_links")
        .insert({
            org_id: orgId,
            token_hash: tokenHash,
            token_prefix: "demo_lead",
            form_definition_id: formId,
            pinned_form_definition_version_id: versionId,
            is_active: true,
            allowed_embed_origins: ["http://localhost:3000", "http://127.0.0.1:3000"],
            metadata,
        })
        .select("id")
        .single();
    if (insErr || !inserted?.id) throw new Error(`link insert failed: ${insErr?.message ?? "no id"}`);
    return inserted.id;
}

async function main() {
    const supabase = createAdminClient();
    const { data: org } = await supabase.from("orgs").select("id,name").eq("id", ORG).maybeSingle();
    if (!org) throw new Error(`Demo Childcare Co org not found: ${ORG}`);

    const locationId = await ensureCenterLocation(ORG);
    const formId = await upsertForm(ORG);
    const versionId = await ensurePublishedVersion(ORG, formId);
    const linkId = await ensurePublicLink(ORG, formId, versionId, locationId);

    console.log("\n=== IC-5.6 Enrollment Lead Proof — READY ===\n");
    console.log(
        JSON.stringify(
            {
                orgId: ORG,
                orgName: org.name,
                formId,
                formKey: ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY,
                publicLinkId: linkId,
                plaintextToken: PLAINTEXT_TOKEN,
                embedUrl: `http://localhost:3000/forms/embed/${PLAINTEXT_TOKEN}`,
                expectedFirstSubmit: {
                    workloadPill: "Recent (auto_operationalized)",
                    intakeCaseSubtitle: "New lead created",
                    quickReviewOperationalLine: "New lead created",
                    intake_auto_operationalized: true,
                    intake_needs_review: false,
                    workflowEvents: ["form_submitted", "intake_case_created", "intake_case_operationalized"],
                    note: "Does NOT auto-create child/customer member — clean enrollment lead proof path",
                },
                verifyAt: ["/adminV2/forms", `/adminV2/workspace/dept/.../work-unit/...`],
                gateScript: "npx tsx --tsconfig tsconfig.json scripts/qaEnrollmentLeadOpportunityProof.ts",
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error("[enrollment-lead-proof] failed:", e);
    process.exit(1);
});
