#!/usr/bin/env npx tsx
/**
 * IC-5.5 — Browser/UI validation gate for Intake Case Operational Model sprint.
 * Exercises public submit + data/workload/event layers against Demo Childcare Co.
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json scripts/qaIntakeCaseOperationalModelGate.ts
 *
 * Optional:
 *   APP_BASE=http://localhost:3000 npx tsx ...
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    DEMO_CHILDCARE_LEAD_ONLY_AUTO_OP_LINK_METADATA,
    DEMO_CHILDCARE_MED_EMBED_TOKEN,
    DEMO_CHILDCARE_MED_FORM_ID,
    DEMO_CHILDCARE_MED_LINK_ID,
    DEMO_CHILDCARE_ORG_ID,
    DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import {
    buildIntakeCasePresentationRows,
} from "@/lib/forms/intakeCasePresentation";
import { buildIntakeQuickReviewViewModel } from "@/lib/forms/intakeQuickReviewPresentation";
import {
    intakeCaseMatchesWorkspaceFilter,
} from "@/lib/forms/intakeWorkspaceFilters";
import { resolveSubmissionInboxLane } from "@/lib/forms/submissionInboxPresentation";
import { mergeOutcomeConfigIntoLinkMetadata } from "@/lib/forms/outcomeConfigEditor";
import { buildFormOutcomeConfigViewModel } from "@/lib/forms/outcomeConfigPresentation";
import { locationLabelsFromRows, workUnitLabelsFromRows } from "@/lib/forms/outcomeConfigLabelCatalog";
import { MEDICATION_DEMO_ROUTE_ITEM_KEYS, MEDICATION_DEMO_SCHEDULE_ITEM_KEYS } from "@/lib/forms/seeds/medicationAuthorizationDemo";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const APP_BASE = (process.env.APP_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = "http://localhost:3000";
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FlowResult = {
    flow: string;
    pass: boolean;
    notes: string[];
    errors: string[];
};

const results: FlowResult[] = [];

function record(flow: string, pass: boolean, notes: string[], errors: string[] = []) {
    results.push({ flow, pass, notes, errors });
}

function assert(condition: boolean, message: string, errors: string[]) {
    if (!condition) errors.push(message);
}

function buildMedicationPayload(email: string, phone: string) {
    return {
        values: {
            child_first_name: "Riley",
            child_last_name: "IC55",
            child_dob: "2022-03-15",
            guardian_full_name: "Jordan IC55",
            guardian_email: email,
            guardian_phone: phone,
            needs_special_instructions: false,
            authorization_acknowledgement: true,
        },
        groups: {
            medications: [
                {
                    instance_key: `ic55-${Date.now()}`,
                    values: {
                        med_name: "Demo Med",
                        dose_strength: "10mg",
                        schedule: "twice_daily",
                        route: ["oral"],
                    },
                },
            ],
        },
        signatures: {
            signature_guardian: {
                kind: "typed",
                typed_full_name: "Jordan IC55",
                acknowledged_at: new Date().toISOString(),
            },
        },
    };
}

const OPTION_VALUES = {
    schedule: [...MEDICATION_DEMO_SCHEDULE_ITEM_KEYS],
    route: [...MEDICATION_DEMO_ROUTE_ITEM_KEYS],
};

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
            body: JSON.stringify({
                payload: buildMedicationPayload(email, phone),
                option_values_by_field_id: OPTION_VALUES,
            }),
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

async function buildGateLabelCatalog(
    supabase: ReturnType<typeof createAdminClient>,
    linkMetadata: Record<string, unknown>
) {
    const locationId = String(linkMetadata.default_location_id ?? "");
    const workUnitId = String(linkMetadata.default_work_unit_id ?? "");
    const deptId = String(linkMetadata.default_department_id ?? "");
    const verticalId = String(linkMetadata.default_vertical_id ?? "");
    const statusKey = String(linkMetadata.default_opportunity_status_key ?? "");

    const [locRes, wuRes, deptRes, vertRes] = await Promise.all([
        locationId ?
            supabase.from("locations").select("id,label,address1,city,postal_code").eq("id", locationId)
        :   Promise.resolve({ data: [], error: null }),
        workUnitId ?
            supabase.from("work_units").select("id,name,department_id").eq("id", workUnitId)
        :   Promise.resolve({ data: [], error: null }),
        deptId ? supabase.from("departments").select("id,name").eq("id", deptId) : Promise.resolve({ data: [], error: null }),
        verticalId ?
            supabase.from("verticals").select("id,name,slug").eq("id", verticalId)
        :   Promise.resolve({ data: [], error: null }),
    ]);

    const deptName =
        typeof (deptRes.data?.[0] as { name?: string } | undefined)?.name === "string" ?
            ((deptRes.data?.[0] as { name: string }).name ?? "")
        :   "";
    const vertRow = vertRes.data?.[0] as { name?: string; slug?: string } | undefined;
    const verticalLabel = vertRow?.name?.trim() || vertRow?.slug?.trim() || "";

    return {
        locations: locationLabelsFromRows(
            (locRes.data ?? []) as { id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null }[]
        ),
        workUnits: workUnitLabelsFromRows(
            (wuRes.data ?? []) as { id: string; name?: string | null; department_id?: string | null }[],
            deptName ? { [deptId]: deptName } : {}
        ),
        departments: deptName && deptId ? { [deptId]: deptName } : {},
        verticals: verticalId && verticalLabel ? { [verticalId]: verticalLabel } : {},
        opportunityStatusKeys: statusKey ? { [statusKey]: statusKey === "new" ? "New inquiry" : statusKey } : {},
    };
}

async function flowA(supabase: ReturnType<typeof createAdminClient>) {
    const notes: string[] = [];
    const errors: string[] = [];

    const { data: form } = await supabase
        .from("form_definitions")
        .select("id,name,metadata")
        .eq("id", DEMO_CHILDCARE_MED_FORM_ID)
        .maybeSingle();
    assert(!!form, "medication form exists", errors);

    const { data: links } = await supabase
        .from("form_public_links")
        .select("id,is_active,created_at,metadata")
        .eq("org_id", DEMO_CHILDCARE_ORG_ID)
        .eq("form_definition_id", DEMO_CHILDCARE_MED_FORM_ID);
    assert((links?.length ?? 0) > 0, "public links exist", errors);

    const linkRows = (links ?? []).map((l) => ({
        id: l.id,
        is_active: l.is_active === true,
        created_at: l.created_at ?? "",
        metadata: (l.metadata ?? {}) as Record<string, unknown>,
    }));

    const testLinkMeta = (linkRows.find((l) => l.id === DEMO_CHILDCARE_MED_LINK_ID)?.metadata ??
        {}) as Record<string, unknown>;
    const catalog = await buildGateLabelCatalog(supabase, testLinkMeta);

    const vm = buildFormOutcomeConfigViewModel({
        formMetadata: (form?.metadata ?? {}) as Record<string, unknown>,
        links: linkRows,
        formKey: "medication_authorization_demo",
        documentGenerationConfigured: true,
        labelCatalog: catalog,
    });

    notes.push(`form detail route: /adminV2/forms/${DEMO_CHILDCARE_MED_FORM_ID}`);
    notes.push(`active links: ${linkRows.filter((l) => l.is_active).length}`);
    notes.push(`multipleActiveConfigs: ${vm.multipleActiveConfigs}`);

    const routingSection = vm.sections.find((s) => s.id === "routing");
    const routingValues = (routingSection?.items ?? []).map((i) => i.value).join(" ");
    assert(!UUID_RE.test(routingValues), "routing section should not show raw UUIDs", errors);
    const catalogLocationLabel = Object.values(catalog.locations)[0] ?? "";
    const catalogWorkUnitLabel = Object.values(catalog.workUnits)[0] ?? "";
    assert(
        catalogLocationLabel.length > 0 || catalogWorkUnitLabel.length > 0,
        "routing label catalog resolves operator names for test link",
        errors
    );
    notes.push(`catalog location: ${catalogLocationLabel || "(none)"}`);
    notes.push(`catalog work unit: ${catalogWorkUnitLabel || "(none)"}`);

    if (vm.multipleActiveConfigs) {
        assert(!!vm.varianceNote, "variance note present for multiple links", errors);
        notes.push(`varianceNote: ${vm.varianceNote}`);
    }

    const targetLink = linkRows.find((l) => l.id === DEMO_CHILDCARE_MED_LINK_ID);
    assert(!!targetLink, "demo test link exists", errors);
    const merged = mergeOutcomeConfigIntoLinkMetadata(targetLink!.metadata, {
        leadCaptureEnabled: true,
        autoCreateOpportunity: true,
        autoOperationalize: true,
        reviewMode: "confidence",
        reviewRequired: false,
        locationId: String(targetLink!.metadata.default_location_id ?? ""),
        workUnitId: String(targetLink!.metadata.default_work_unit_id ?? ""),
        departmentId: String(targetLink!.metadata.default_department_id ?? ""),
        verticalId: String(targetLink!.metadata.default_vertical_id ?? ""),
        statusKey: String(targetLink!.metadata.default_opportunity_status_key ?? "new"),
        source: (() => {
            const raw = String(targetLink!.metadata.intake_opportunity_source ?? "embed").trim();
            return raw === "public_form" || raw === "embed" ? raw : "embed";
        })(),
    });
    assert(merged.runtime_test === "forms_2d_demo_childcare", "unknown metadata key runtime_test preserved", errors);
    assert(merged.review_mode === "confidence", "edit merge writes review_mode", errors);

    notes.push("Flow A data layer: outcome panel labels + merge logic validated (browser edit/save requires manual login)");

    record("Flow A — Form detail outcome config (data layer)", errors.length === 0, notes, errors);
}

async function flowB(supabase: ReturnType<typeof createAdminClient>, token: string) {
    const notes: string[] = [];
    const errors: string[] = [];
    const email = `ic55-med-review-${Date.now()}@example.com`;
    const phone = `602555${String(Date.now()).slice(-4)}`;

    await supabase
        .from("form_public_links")
        .update({ metadata: { ...DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA, runtime_test: "forms_2d_demo_childcare" } })
        .eq("id", DEMO_CHILDCARE_MED_LINK_ID);

    const submissionId = await publicCreateDraft(token);
    await publicSubmit(token, submissionId, email, phone);
    const row = await loadSubmission(supabase, submissionId);
    const meta = (row.payload as { meta?: Record<string, unknown> })?.meta ?? {};
    const reviewDecision = (meta.intake_review_decision ?? {}) as { reasons?: string[] };

    notes.push(`embed: ${APP_BASE}/forms/embed/${token}`);
    notes.push(`submissionId: ${submissionId}`);
    notes.push(`email: ${email}`);

    assert(row.status === "submitted", "public submit succeeded", errors);
    assert(!!row.opportunity_id, "opportunity created", errors);
    assert(!!row.customer_member_id, "child/customer member created", errors);
    assert(meta.intake_needs_review === true, "intake_needs_review true", errors);
    assert(meta.intake_auto_operationalized === false, "intake_auto_operationalized false", errors);
    assert(
        (reviewDecision.reasons ?? []).includes("child_member_auto_created"),
        "reasons include child_member_auto_created",
        errors
    );
    assert(
        (reviewDecision.reasons ?? []).includes("new_person_created"),
        "reasons include new_person_created",
        errors
    );

    const inboxRow = submissionToInboxRow(row);
    const cases = buildIntakeCasePresentationRows({
        submissions: [inboxRow],
        formsById: { [DEMO_CHILDCARE_MED_FORM_ID]: "Medication Authorization — Demo" },
    });
    assert(cases.length === 1, "one intake case row", errors);
    const intakeCase = cases[0]!;
    assert(intakeCase.status_bucket === "review_required", `case bucket review_required (got ${intakeCase.status_bucket})`, errors);
    assert(intakeCaseMatchesWorkspaceFilter(intakeCase, "needs_review"), "in needs_review filter", errors);
    assert(!intakeCaseMatchesWorkspaceFilter(intakeCase, "recent"), "not in recent filter", errors);

    const quickReview = buildIntakeQuickReviewViewModel({
        row: inboxRow,
        formName: "Medication Authorization — Demo",
        submittedAtLabel: row.submitted_at ?? row.created_at,
    });
    assert(quickReview.needsAction.clearMessage === null, "quick review shows needs action", errors);
    assert(
        quickReview.needsAction.items.some((i) => i.includes("Review required")),
        "quick review mentions review required",
        errors
    );

    notes.push(`case_key: ${intakeCase.case_key}`);
    notes.push(`status_bucket: ${intakeCase.status_bucket}`);
    notes.push(`review reasons: ${(reviewDecision.reasons ?? []).join(", ")}`);

    record("Flow B — Demo medication first submit (review-required)", errors.length === 0, notes, errors);
    return { submissionId, email, phone, opportunityId: row.opportunity_id as string, inboxRow };
}

async function flowB2LeadOnlyAutoOp(supabase: ReturnType<typeof createAdminClient>, token: string) {
    const notes: string[] = [];
    const errors: string[] = [];
    const email = `ic55-lead-auto-${Date.now()}@example.com`;
    const phone = `602556${String(Date.now()).slice(-4)}`;

    const { data: linkBefore } = await supabase
        .from("form_public_links")
        .select("metadata")
        .eq("id", DEMO_CHILDCARE_MED_LINK_ID)
        .maybeSingle();
    const priorMeta = (linkBefore?.metadata ?? {}) as Record<string, unknown>;

    await supabase
        .from("form_public_links")
        .update({
            metadata: {
                ...priorMeta,
                ...DEMO_CHILDCARE_LEAD_ONLY_AUTO_OP_LINK_METADATA,
                default_location_id: priorMeta.default_location_id,
            },
        })
        .eq("id", DEMO_CHILDCARE_MED_LINK_ID);

    try {
        const submissionId = await publicCreateDraft(token);
        await publicSubmit(token, submissionId, email, phone);
        const row = await loadSubmission(supabase, submissionId);
        const meta = (row.payload as { meta?: Record<string, unknown> })?.meta ?? {};

        notes.push(`submissionId: ${submissionId}`);
        notes.push(`email: ${email}`);
        notes.push(`phone: ${phone}`);
        notes.push("link metadata: auto_create_customer_member false");

        assert(row.status === "submitted", "public submit succeeded", errors);
        assert(!!row.opportunity_id, "opportunity created", errors);
        assert(meta.intake_needs_review === false, "intake_needs_review false", errors);
        assert(meta.intake_auto_operationalized === true, "intake_auto_operationalized true", errors);

        const inboxRow = submissionToInboxRow(row);
        const cases = buildIntakeCasePresentationRows({
            submissions: [inboxRow],
            formsById: { [DEMO_CHILDCARE_MED_FORM_ID]: "Medication Authorization — Demo" },
        });
        const intakeCase = cases[0]!;
        assert(
            intakeCase.status_bucket === "auto_operationalized" || intakeCase.status_bucket === "recent",
            `case bucket recent/auto (got ${intakeCase.status_bucket})`,
            errors
        );
        assert(intakeCaseMatchesWorkspaceFilter(intakeCase, "recent"), "in recent filter", errors);

        const quickReview = buildIntakeQuickReviewViewModel({
            row: inboxRow,
            formName: "Medication Authorization — Demo",
            submittedAtLabel: row.submitted_at ?? row.created_at,
        });
        assert(quickReview.needsAction.clearMessage === "No manual review required.", "quick review clear", errors);

        notes.push(`status_bucket: ${intakeCase.status_bucket}`);

        record("Flow B2 — Lead-only auto-operationalized intake", errors.length === 0, notes, errors);
        return { submissionId, email, phone, opportunityId: row.opportunity_id as string, inboxRow };
    } finally {
        await supabase.from("form_public_links").update({ metadata: priorMeta }).eq("id", DEMO_CHILDCARE_MED_LINK_ID);
    }
}

async function flowC(supabase: ReturnType<typeof createAdminClient>, token: string) {
    const notes: string[] = [];
    const errors: string[] = [];

    const { data: linkBefore } = await supabase
        .from("form_public_links")
        .select("metadata")
        .eq("id", DEMO_CHILDCARE_MED_LINK_ID)
        .maybeSingle();
    const priorMeta = (linkBefore?.metadata ?? {}) as Record<string, unknown>;

    const { review_mode: _dropReviewMode, auto_operationalize: _dropAutoOp, ...intakeBase } =
        DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA;
    const legacyMeta = {
        ...priorMeta,
        ...intakeBase,
        review_required: true,
        auto_operationalize: false,
        runtime_test: "forms_2d_demo_childcare",
        ic55_legacy_test_at: new Date().toISOString(),
    };

    await supabase.from("form_public_links").update({ metadata: legacyMeta }).eq("id", DEMO_CHILDCARE_MED_LINK_ID);

    try {
        const email = `ic55-review-${Date.now()}@example.com`;
        const phone = `602557${String(Date.now()).slice(-4)}`;
        const submissionId = await publicCreateDraft(token);
        await publicSubmit(token, submissionId, email, phone);
        const row = await loadSubmission(supabase, submissionId);
        const meta = (row.payload as { meta?: Record<string, unknown> })?.meta ?? {};

        notes.push(`submissionId: ${submissionId}`);
        assert(row.status === "submitted", "public submit succeeded", errors);
        assert(meta.intake_needs_review === true, "intake_needs_review true", errors);
        assert(!!meta.intake_review_reason || !!meta.intake_review_decision, "review reason/decision present", errors);

        const inboxRow = submissionToInboxRow(row);
        const cases = buildIntakeCasePresentationRows({ submissions: [inboxRow] });
        const intakeCase = cases[0]!;
        assert(intakeCaseMatchesWorkspaceFilter(intakeCase, "needs_review"), "in needs_review filter", errors);

        const quickReview = buildIntakeQuickReviewViewModel({
            row: inboxRow,
            formName: "Medication Authorization — Demo",
            submittedAtLabel: row.submitted_at ?? row.created_at,
        });
        assert(quickReview.needsAction.items.length > 0, "quick review shows needs action", errors);
        assert(
            quickReview.needsAction.items.some((i) => i.includes("Review required")),
            "quick review mentions review required",
            errors
        );

        notes.push(`status_bucket: ${intakeCase.status_bucket}`);
        notes.push(`needsAction: ${quickReview.needsAction.items.join("; ")}`);
    } finally {
        await supabase.from("form_public_links").update({ metadata: priorMeta }).eq("id", DEMO_CHILDCARE_MED_LINK_ID);
        notes.push("restored link metadata after legacy test");
    }

    record("Flow C — Review-required intake", errors.length === 0, notes, errors);
}

async function flowD(
    supabase: ReturnType<typeof createAdminClient>,
    token: string,
    prior: { email: string; phone: string; opportunityId: string; inboxRow: SubmissionInboxRow }
) {
    const notes: string[] = [];
    const errors: string[] = [];

    await supabase
        .from("form_public_links")
        .update({ metadata: { ...DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA, runtime_test: "forms_2d_demo_childcare" } })
        .eq("id", DEMO_CHILDCARE_MED_LINK_ID);

    const submissionId = await publicCreateDraft(token);
    await publicSubmit(token, submissionId, prior.email, prior.phone);
    const row = await loadSubmission(supabase, submissionId);
    const meta = (row.payload as { meta?: Record<string, unknown> })?.meta ?? {};
    const secondInboxRow = submissionToInboxRow(row);

    notes.push(`second submissionId: ${submissionId}`);
    assert(row.opportunity_id === prior.opportunityId, "attached to same opportunity", errors);
    assert(
        meta.intake_opportunity_match === "attached_existing" || meta.intake_resolution_path === "matched_email",
        "duplicate attach metadata",
        errors
    );
    assert(meta.intake_needs_review === false, "attach submission not review-required", errors);
    assert(resolveSubmissionInboxLane(secondInboxRow) === "recentlySubmitted", "attach submission in recent lane", errors);

    const groupedCases = buildIntakeCasePresentationRows({
        submissions: [prior.inboxRow, secondInboxRow],
        formsById: { [DEMO_CHILDCARE_MED_FORM_ID]: "Medication Authorization — Demo" },
    });

    assert(groupedCases.length === 1, "single grouped case row for opportunity", errors);
    assert(groupedCases[0]!.submission_count === 2, "submission_count is 2 for this run", errors);
    assert(
        intakeCaseMatchesWorkspaceFilter(groupedCases[0]!, "needs_review"),
        "grouped case stays needs_review until first submission cleared (expected)",
        errors
    );

    notes.push(`case_key: ${groupedCases[0]!.case_key}`);
    notes.push(`attach lane: ${resolveSubmissionInboxLane(secondInboxRow)}`);
    notes.push(`grouped status_bucket: ${groupedCases[0]!.status_bucket}`);

    record("Flow D — Duplicate attach intake", errors.length === 0, notes, errors);
    return submissionId;
}

async function flowE(
    supabase: ReturnType<typeof createAdminClient>,
    submissionId: string,
    label: string,
    expectedIntakeEvent: string
) {
    const notes: string[] = [];
    const errors: string[] = [];

    const events = await loadWorkflowEvents(supabase, submissionId);
    const types = events.map((e) => e.event_type);
    notes.push(`events for submission: ${types.join(", ") || "(none)"}`);

    assert(types.includes("form_submitted"), "form_submitted emitted", errors);
    assert(types.includes(expectedIntakeEvent), `intake event ${expectedIntakeEvent}`, errors);

    const sample = events.find((e) => e.event_type === expectedIntakeEvent);
    const payload = (sample?.payload ?? {}) as Record<string, unknown>;
    assert(typeof payload.case_key === "string", "payload.case_key", errors);
    assert(typeof payload.case_anchor_type === "string", "payload.case_anchor_type", errors);
    assert(payload.form_submission_id === submissionId, "payload.form_submission_id", errors);

    notes.push(`intake event: ${expectedIntakeEvent}`);
    notes.push(`case_key: ${payload.case_key}`);

    record(`Flow E — Workflow events (${label})`, errors.length === 0, notes, errors);
}

async function main() {
    const supabase = createAdminClient();
    const token = DEMO_CHILDCARE_MED_EMBED_TOKEN;

    console.log("\n=== IC-5.5 Intake Case Operational Model Gate ===\n");
    console.log("org:", DEMO_CHILDCARE_ORG_ID);
    console.log("form:", DEMO_CHILDCARE_MED_FORM_ID);
    console.log("link:", DEMO_CHILDCARE_MED_LINK_ID);
    console.log("app:", APP_BASE);

    const health = await fetch(`${APP_BASE}/`).then((r) => r.status).catch(() => 0);
    if (health !== 200) {
        console.error("Local app not reachable at", APP_BASE, "— start `npm run dev` first.");
        process.exit(1);
    }

    await flowA(supabase);
    const flowBResult = await flowB(supabase, token);
    const flowB2Result = await flowB2LeadOnlyAutoOp(supabase, token);
    await flowC(supabase, token);
    await flowD(supabase, token, flowBResult);
    await flowE(supabase, flowBResult.submissionId, "med review-required", "intake_case_review_required");
    await flowE(supabase, flowB2Result.submissionId, "lead-only auto-op", "intake_case_operationalized");

    console.log("\n=== RESULTS ===\n");
    for (const r of results) {
        console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.flow}`);
        for (const n of r.notes) console.log(`  · ${n}`);
        for (const e of r.errors) console.log(`  ✗ ${e}`);
    }

    const passCount = results.filter((r) => r.pass).length;
    console.log(`\n${passCount}/${results.length} flows passed`);

    console.log("\n=== MANUAL BROWSER CHECKLIST (requires Demo Childcare Co login) ===");
    console.log(`1. /adminV2/forms/${DEMO_CHILDCARE_MED_FORM_ID} — Operational Outcome panel after Publish`);
    console.log("2. Edit outcome → save → read-only summary refresh");
    console.log(`3. /adminV2/forms — intake workspace Recent / Needs review pills + Quick review modal`);
    console.log(`4. ${APP_BASE}/forms/embed/${token} — visual embed smoke`);

    process.exit(passCount === results.length ? 0 : 1);
}

main().catch((e) => {
    console.error("[ic-5.5] gate failed:", e);
    process.exit(1);
});
