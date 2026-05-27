#!/usr/bin/env npx tsx
/**
 * IC-5.6 — Enrollment lead opportunity proof gate.
 * Verifies guardian-only enrollment lead form creates a real opportunity and operator-facing copy.
 *
 * Prerequisite:
 *   cd web && npx tsx --tsconfig tsconfig.json scripts/prepareDemoChildcareEnrollmentLeadIntakeTest.ts
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json scripts/qaEnrollmentLeadOpportunityProof.ts
 *
 * Optional:
 *   APP_BASE=http://localhost:3000 npx tsx ...
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN,
    DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
    DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
    DEMO_CHILDCARE_ORG_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import { buildIntakeCasePresentationRows } from "@/lib/forms/intakeCasePresentation";
import { buildIntakeQuickReviewViewModel } from "@/lib/forms/intakeQuickReviewPresentation";
import { intakeCaseMatchesWorkspaceFilter } from "@/lib/forms/intakeWorkspaceFilters";
import { ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY } from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const APP_BASE = (process.env.APP_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = "http://localhost:3000";
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assert(condition: boolean, message: string, errors: string[]) {
    if (!condition) errors.push(message);
}

function buildLeadPayload(email: string, phone: string) {
    return {
        values: {
            guardian_full_name: "Jordan Enrollment Lead",
            guardian_email: email,
            guardian_phone: phone,
            child_first_name: "Riley",
            notes: "IC-5.6 enrollment lead proof",
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
    if (!id || !UUID_RE.test(id)) throw new Error(`invalid submission id: ${id}`);
    return id;
}

async function publicSubmit(token: string, submissionId: string, email: string, phone: string) {
    const res = await fetch(
        `${APP_BASE}/api/public/forms/${encodeURIComponent(token)}/submissions/${encodeURIComponent(submissionId)}/submit`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: ORIGIN },
            body: JSON.stringify({ payload: buildLeadPayload(email, phone) }),
        }
    );
    const json = (await res.json()) as { data?: Record<string, unknown>; error?: string };
    if (!res.ok) throw new Error(`submit failed (${res.status}): ${json.error ?? JSON.stringify(json)}`);
    return json.data ?? {};
}

async function loadSubmission(supabase: ReturnType<typeof createAdminClient>, id: string) {
    const { data, error } = await supabase
        .from("form_submissions")
        .select(
            "id,status,form_definition_id,submitted_at,created_at,person_id,customer_id,customer_member_id,opportunity_id,payload"
        )
        .eq("id", id)
        .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "submission not found");
    return data;
}

async function loadWorkflowEvents(supabase: ReturnType<typeof createAdminClient>, submissionId: string) {
    const { data, error } = await supabase
        .from("workflow_events")
        .select("id,event_type,occurred_at,payload,entity_id")
        .eq("org_id", DEMO_CHILDCARE_ORG_ID)
        .order("occurred_at", { ascending: false })
        .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).filter((row) => {
        const payload = row.payload as Record<string, unknown> | null;
        return payload?.form_submission_id === submissionId || row.entity_id === submissionId;
    });
}

function submissionToInboxRow(row: Awaited<ReturnType<typeof loadSubmission>>): SubmissionInboxRow {
    return {
        id: row.id,
        status: row.status,
        created_at: row.created_at,
        submitted_at: row.submitted_at,
        form_definition_id: row.form_definition_id,
        person_id: row.person_id,
        customer_id: row.customer_id,
        customer_member_id: row.customer_member_id,
        opportunity_id: row.opportunity_id,
        payload: row.payload as SubmissionInboxRow["payload"],
    };
}

async function main() {
    const notes: string[] = [];
    const errors: string[] = [];
    const supabase = createAdminClient();
    const email = `ic56-lead-proof-${Date.now()}@example.com`;
    const phone = `602557${String(Date.now()).slice(-4)}`;
    const token = DEMO_CHILDCARE_ENROLLMENT_LEAD_EMBED_TOKEN;

    const { data: form } = await supabase
        .from("form_definitions")
        .select("id,name")
        .eq("org_id", DEMO_CHILDCARE_ORG_ID)
        .eq("key", ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY)
        .maybeSingle();
    assert(!!form?.id, "Enrollment Lead — Demo form exists (run prepare script first)", errors);
    if (!form?.id) {
        console.error(JSON.stringify({ pass: false, errors }, null, 2));
        process.exit(1);
    }

    const { data: link } = await supabase
        .from("form_public_links")
        .select("id,metadata")
        .eq("org_id", DEMO_CHILDCARE_ORG_ID)
        .eq("form_definition_id", form.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    assert(!!link?.id, "active public link exists", errors);

    if (link?.id) {
        await supabase
            .from("form_public_links")
            .update({ metadata: { ...(link.metadata as Record<string, unknown>), ...DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA } })
            .eq("id", link.id);
    }

    notes.push(`formId: ${form.id}`);
    notes.push(`formName: ${form.name}`);
    notes.push(`embed: ${APP_BASE}/forms/embed/${token}`);

    const submissionId = await publicCreateDraft(token);
    await publicSubmit(token, submissionId, email, phone);
    const row = await loadSubmission(supabase, submissionId);
    const meta = (row.payload as { meta?: Record<string, unknown> })?.meta ?? {};

    notes.push(`submissionId: ${submissionId}`);
    notes.push(`email: ${email}`);

    assert(row.status === "submitted", "public submit succeeded", errors);
    assert(!!row.opportunity_id, "opportunity created", errors);
    assert(!row.customer_member_id, "no child/customer member auto-created", errors);
    assert(meta.intake_needs_review === false, "intake_needs_review false", errors);
    assert(meta.intake_auto_operationalized === true, "intake_auto_operationalized true", errors);

    const { data: opportunity } = await supabase
        .from("opportunities")
        .select("id,status_key,work_unit_id,source,location_id")
        .eq("id", row.opportunity_id!)
        .maybeSingle();
    assert(!!opportunity?.id, "opportunity row exists", errors);
    assert(opportunity?.status_key === "new", `status_key new (got ${opportunity?.status_key})`, errors);
    assert(
        opportunity?.work_unit_id === DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
        "routed to enrollment work unit",
        errors
    );
    notes.push(`opportunityId: ${row.opportunity_id}`);

    const events = await loadWorkflowEvents(supabase, submissionId);
    const eventTypes = events.map((e) => e.event_type);
    for (const expected of ["form_submitted", "intake_case_created", "intake_case_operationalized"]) {
        assert(eventTypes.includes(expected), `workflow event ${expected}`, errors);
    }
    notes.push(`workflowEvents: ${eventTypes.join(", ")}`);

    const inboxRow = submissionToInboxRow(row);
    const cases = buildIntakeCasePresentationRows({
        submissions: [inboxRow],
        formsById: { [form.id]: form.name ?? "Enrollment Lead — Demo" },
    });
    assert(cases.length === 1, "one intake case row", errors);
    const intakeCase = cases[0]!;
    assert(intakeCase.subtitle.toLowerCase().includes("lead"), `case subtitle mentions lead (${intakeCase.subtitle})`, errors);
    assert(intakeCaseMatchesWorkspaceFilter(intakeCase, "recent"), "in recent workload filter", errors);
    notes.push(`intakeCaseSubtitle: ${intakeCase.subtitle}`);
    notes.push(`caseKey: ${intakeCase.case_key}`);

    const quickReview = buildIntakeQuickReviewViewModel({
        row: inboxRow,
        formName: form.name ?? "Enrollment Lead — Demo",
        submittedAtLabel: row.submitted_at ?? row.created_at,
    });
    assert(
        (quickReview.intakeSummary.operationalLine ?? "").toLowerCase().includes("lead"),
        "quick review operational line mentions lead",
        errors
    );
    assert(!!intakeCase.opportunity_id, "intake case carries opportunity_id for open path", errors);
    notes.push(`quickReviewOperationalLine: ${quickReview.intakeSummary.operationalLine}`);

    const pass = errors.length === 0;
    console.log(
        JSON.stringify(
            {
                pass,
                opportunityId: row.opportunity_id,
                submissionId,
                notes,
                errors,
            },
            null,
            2
        )
    );
    process.exit(pass ? 0 : 1);
}

main().catch((e) => {
    console.error("[qa-enrollment-lead-proof] failed:", e);
    process.exit(1);
});
