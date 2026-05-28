#!/usr/bin/env npx tsx
/**
 * Enrollment intake lifecycle coherence gate.
 * Extends enrollment lead proof with activity merge + intake source API checks.
 *
 * Prerequisite:
 *   cd web && npx tsx scripts/prepareDemoChildcareEnrollmentLeadIntakeTest.ts
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json scripts/qaEnrollmentIntakeLifecycleCoherence.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { loadOpportunityActivityEvents } from "@/lib/admin/loadOpportunityRelatedActivityEvents";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import { buildOpportunityIntakeSourceViewModel } from "@/lib/forms/opportunityIntakeSourcePresentation";
import {
    DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN,
    DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
    DEMO_CHILDCARE_ORG_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import { ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY } from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const APP_BASE = (process.env.APP_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = "http://localhost:3000";

function assert(condition: boolean, message: string, errors: string[]) {
    if (!condition) errors.push(message);
}

function buildLeadPayload(email: string, phone: string) {
    return {
        values: {
            guardian_full_name: "Jordan Lifecycle Coherence",
            guardian_email: email,
            guardian_phone: phone,
            child_first_name: "Riley",
            notes: "Enrollment lifecycle coherence gate",
        },
        meta: {},
    };
}

async function publicCreateDraft(token: string): Promise<string> {
    const res = await fetch(`${APP_BASE}/api/public/forms/${encodeURIComponent(token)}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ payload: { values: {}, meta: {} } }),
    });
    const json = (await res.json()) as { data?: { id?: string }; error?: string };
    if (!res.ok) throw new Error(`create draft failed (${res.status}): ${json.error ?? JSON.stringify(json)}`);
    const id = json.data?.id;
    if (!id) throw new Error("invalid submission id");
    return id;
}

async function publicSubmit(token: string, submissionId: string, email: string, phone: string) {
    const res = await fetch(
        `${APP_BASE}/api/public/forms/${encodeURIComponent(token)}/submissions/${encodeURIComponent(submissionId)}/submit`,
        { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ payload: buildLeadPayload(email, phone) }) }
    );
    const json = (await res.json()) as { data?: Record<string, unknown>; error?: string };
    if (!res.ok) throw new Error(`submit failed (${res.status}): ${json.error ?? JSON.stringify(json)}`);
}

async function main() {
    const errors: string[] = [];
    const notes: string[] = [];
    const supabase = createAdminClient();
    const email = `lifecycle-coherence-${Date.now()}@example.com`;
    const phone = `602558${String(Date.now()).slice(-4)}`;
    const token = DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN;

    const { data: form } = await supabase
        .from("form_definitions")
        .select("id,name")
        .eq("org_id", DEMO_CHILDCARE_ORG_ID)
        .eq("key", ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY)
        .maybeSingle();
    assert(!!form?.id, "Enrollment Lead form exists", errors);

    const { data: link } = await supabase
        .from("form_public_links")
        .select("id,metadata")
        .eq("org_id", DEMO_CHILDCARE_ORG_ID)
        .eq("form_definition_id", form!.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

    if (link?.id) {
        await supabase
            .from("form_public_links")
            .update({ metadata: { ...(link.metadata as Record<string, unknown>), ...DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA } })
            .eq("id", link.id);
    }

    const submissionId = await publicCreateDraft(token);
    await publicSubmit(token, submissionId, email, phone);

    const { data: submission } = await supabase
        .from("form_submissions")
        .select("id,opportunity_id,payload,form_definition_id,submitted_at,status")
        .eq("id", submissionId)
        .maybeSingle();

    assert(!!submission?.opportunity_id, "opportunity linked to submission", errors);
    const opportunityId = submission!.opportunity_id!;

    const intakeVm = buildOpportunityIntakeSourceViewModel({
        submission_id: submission!.id,
        form_definition_id: submission!.form_definition_id,
        form_name: form!.name ?? "Enrollment Lead — Demo",
        submitted_at: submission!.submitted_at,
        status: submission!.status,
        payload: submission!.payload,
    });
    assert(intakeVm?.autoOperationalized === true, "intake source VM auto-operationalized", errors);
    assert(
        (intakeVm?.sourceLine ?? "").includes("Enrollment Lead"),
        "intake source names form",
        errors
    );
    assert(
        (intakeVm?.nextStepLine ?? "").toLowerCase().includes("continue enrollment"),
        "intake source next step mentions continue enrollment",
        errors
    );

    const meta = (submission!.payload as { meta?: Record<string, unknown> })?.meta ?? {};
    assert(
        typeof meta.intake_routing_work_unit_id === "string" && meta.intake_routing_work_unit_id.length > 0,
        "submission meta stamps routing work unit",
        errors
    );

    const activity = await loadOpportunityActivityEvents({
        supabase,
        orgId: DEMO_CHILDCARE_ORG_ID,
        opportunityId,
        limit: 50,
    });
    const types = activity.map((e) => e.event_type);
    assert(types.includes("form_submitted"), "opportunity activity includes form_submitted", errors);
    assert(types.includes("intake_case_operationalized"), "opportunity activity includes intake_case_operationalized", errors);

    const formSubmitted = activity.find((e) => e.event_type === "form_submitted");
    if (formSubmitted) {
        const formatted = formatOpportunityActivityTimelineEvent({
            event_type: formSubmitted.event_type,
            payload: formSubmitted.payload ?? {},
        });
        assert(
            formatted.title.toLowerCase().includes("form submitted"),
            "activity title operator-friendly",
            errors
        );
        assert(!!formatted.detail, "activity detail present for form submit", errors);
    }

    notes.push(`opportunityId: ${opportunityId}`);
    notes.push(`submissionId: ${submissionId}`);
    notes.push(`activityTypes: ${types.join(", ")}`);

    const pass = errors.length === 0;
    console.log(JSON.stringify({ pass, notes, errors }, null, 2));
    process.exit(pass ? 0 : 1);
}

main().catch((e) => {
    console.error("[qa-enrollment-lifecycle-coherence] failed:", e);
    process.exit(1);
});
