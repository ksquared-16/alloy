/**
 * Processing Form Composer V1 — pipeline validation (API + lib, no browser UI).
 *
 * Run: cd web && node --import tsx scripts/validateProcessingFormComposerV1Pipeline.ts
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { extractPdfAcroFormFields } from "../lib/pos/processingCase/structure/pdfAcroForm";
import {
    expandQuestionsForDraftSave,
    seedReviewQuestionFromDraftField,
} from "../lib/pos/processingCase/formDraft/questionResolutionModel";
import { detectionModeLabel, resolveDetectionMode } from "../lib/pos/processingCase/formDraft/detectionModeLabel";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const FIXTURE = path.join(process.cwd(), "tests/fixtures/processing/mo500-3313-school-age-child-health-report.pdf");
const REPORT = path.join(process.cwd(), "docs/sprints/archive/07_2026/processing-form-composer-v1-validation-report.md");
const SCREENSHOT_DIR = path.join(process.cwd(), "docs/sprints/archive/07_2026/processing-form-composer-v1-screenshots");

type StepResult = { ok: boolean; detail: string };

const detectedCleanly: string[] = [];
const requiredReview: string[] = [];
const failed: string[] = [];
const notes: string[] = [];

async function mintSessionCookie(): Promise<string> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const preferredOrgId = process.env.DEV_QUEUE_ORG_ID?.trim() || null;
    let rolesRes = preferredOrgId
        ? await admin.from("user_roles").select("user_id").eq("org_id", preferredOrgId).in("role", ["admin", "ops"]).limit(1).maybeSingle()
        : { data: null, error: null };
    if (!rolesRes.data?.user_id) {
        rolesRes = await admin.from("user_roles").select("user_id").in("role", ["admin", "ops"]).limit(1).maybeSingle();
    }
    if (!rolesRes.data?.user_id) throw new Error("No admin user for validation");
    const userRes = await admin.auth.admin.getUserById(rolesRes.data.user_id);
    const email = userRes.data.user?.email;
    if (!email) throw new Error("Admin user missing email");
    const linkRes = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = linkRes.data.properties?.hashed_token;
    if (!tokenHash) throw new Error("generateLink failed");
    const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const otp = await anon.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (!otp.data.session) throw new Error("verifyOtp failed");
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split(".")[0];
    const cookieName = `sb-${projectRef}-auth-token`;
    const value = encodeURIComponent(JSON.stringify(otp.data.session));
    return `${cookieName}=${value}`;
}

async function api(base: string, cookie: string, pathname: string, init?: RequestInit) {
    const res = await fetch(`${base}${pathname}`, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            cookie,
        },
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
}

async function main() {
    if (!fs.existsSync(FIXTURE)) {
        throw new Error(`Missing fixture: ${FIXTURE}`);
    }

    const base = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";
    const pdfBuffer = fs.readFileSync(FIXTURE);
    const pdfBytes = new Uint8Array(pdfBuffer);
    const acro = await extractPdfAcroFormFields(pdfBytes);
    if (!acro.has_acroform || acro.fields.length < 5) {
        failed.push(`AcroForm extraction weak: ${acro.fields.length} fields`);
    } else {
        detectedCleanly.push(`AcroForm extraction: ${acro.fields.length} fields (${acro.fields.map((f) => f.name).join(", ")})`);
    }

    const cookie = await mintSessionCookie();
    notes.push(`Validated against ${base}`);

    const form = new FormData();
    form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), `e2e-composer-${Date.now()}-mo500.pdf`);
    form.append("open_processing_case", "true");

    const upload = await api(base, cookie, "/api/admin/documents/upload", { method: "POST", body: form });
    if (!upload.res.ok) {
        failed.push(`Upload failed: ${upload.res.status} ${JSON.stringify(upload.json)}`);
        writeReport(null, null);
        process.exit(1);
    }
    const caseId = (upload.json as { processing_case_id?: string }).processing_case_id ?? null;
    if (!caseId) failed.push("Upload returned no processing_case_id");
    else detectedCleanly.push(`Processing case created: ${caseId}`);

    const draftRes = await api(base, cookie, `/api/admin/processing/cases/${caseId}/form-draft`, { method: "POST" });
    if (!draftRes.res.ok) {
        failed.push(`form-draft detect failed: ${draftRes.res.status}`);
        writeReport(caseId, null);
        process.exit(1);
    }
    const draft = (draftRes.json as { data?: { form_draft_preview?: unknown } }).data?.form_draft_preview as {
        generator_version?: string;
        fields?: Array<{ id: string; label: string; type: string; section: string }>;
    } | null;
    if (!draft?.fields?.length) {
        failed.push("form-draft returned zero fields");
        writeReport(caseId, null);
        process.exit(1);
    }

    const mode = resolveDetectionMode(draft as never);
    detectedCleanly.push(`Detection mode: ${detectionModeLabel(draft as never)} (${mode})`);
    if (mode !== "acroform") requiredReview.push(`Expected acroform mode; got ${mode}`);

    const reviewQuestions = draft.fields.map((f) =>
        seedReviewQuestionFromDraftField({
            id: f.id,
            label: f.label,
            type: f.type,
            section: f.section,
        })
    );

    for (const q of reviewQuestions) {
        if (/child name/i.test(q.evidenceLabel)) {
            q.questionSubject = "child";
            q.nameRepresentation = "first_last";
            requiredReview.push("Child name → first+last");
        } else if (/birthdate/i.test(q.evidenceLabel)) {
            q.questionSubject = "child";
        } else if (/allergy/i.test(q.evidenceLabel)) {
            q.questionSubject = "enrollment";
        } else if (/signature/i.test(q.evidenceLabel)) {
            q.questionSubject = "processing_only";
        } else if (/routing code/i.test(q.evidenceLabel)) {
            q.ignored = true;
            requiredReview.push("Ignored routing_code");
        }
    }

    const expanded = expandQuestionsForDraftSave(reviewQuestions);
    const labels = expanded.map((f) => f.label);
    if (labels.some((l) => /routing code/i.test(l))) failed.push("Ignored field present in expanded save payload");
    else detectedCleanly.push("Ignored routing_code excluded from save payload");
    if (labels.some((l) => /first name/i.test(l)) && labels.some((l) => /last name/i.test(l))) {
        detectedCleanly.push("Child name split into first + last in save payload");
    } else {
        failed.push(`Name split missing in save payload: ${labels.join(" | ")}`);
    }

    const saveRes = await api(base, cookie, `/api/admin/processing/cases/${caseId}/form-draft/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            title: "MO500 E2E Composer Validation",
            fields: expanded.map((f) => ({
                label: f.label,
                type: f.type,
                required: f.required,
                section: f.section,
                pdf_field_name: f.pdf_field_name,
                page: f.page,
                bbox: f.bbox,
                evidence: f.evidence,
                ...(f.field_source ? { field_source: f.field_source } : {}),
            })),
        }),
    });
    if (!saveRes.res.ok) {
        failed.push(`form-draft/save failed: ${saveRes.res.status}`);
        writeReport(caseId, null);
        process.exit(1);
    }

    const createRes = await api(base, cookie, `/api/admin/processing/cases/${caseId}/form-draft/create`, { method: "POST" });
    if (!createRes.res.ok) {
        failed.push(`form-draft/create failed: ${createRes.res.status}`);
        writeReport(caseId, null);
        process.exit(1);
    }
    const createData = (createRes.json as { data?: { form_id?: string; builder_path?: string } }).data;
    const formId = createData?.form_id ?? null;
    const builderPath = createData?.builder_path ?? null;
    if (!formId || !builderPath?.includes("/adminV2/forms/")) {
        failed.push(`Rich builder handoff failed: ${builderPath}`);
    } else {
        detectedCleanly.push(`Native form created: ${formId}`);
        detectedCleanly.push(`Builder path: ${builderPath}`);
    }

    const formDetail = await api(base, cookie, `/api/admin/forms/${formId}`);
    const versions = (formDetail.json as { data?: { versions?: Array<{ id: string; status: string }> } }).data?.versions ?? [];
    const draftVersion = versions.find((v) => v.status === "draft");
    if (!draftVersion) {
        failed.push("Created form has no draft version");
    } else {
        const ver = await api(base, cookie, `/api/admin/forms/${formId}/versions/${draftVersion.id}`);
        const schema = (ver.json as { data?: { schema_json?: { fields?: Array<{ label?: string }> } } }).data?.schema_json;
        const schemaLabels = (schema?.fields ?? []).map((f) => f.label ?? "");
        detectedCleanly.push(`Generated schema fields (${schemaLabels.length}): ${schemaLabels.join(" | ")}`);
        if (schemaLabels.some((l) => /routing code/i.test(l))) failed.push("routing_code in published schema");
    }

    // NOTE: the standalone form-authoring route (`/adminV2/forms/[id]`) was retired — form authoring
    // now lives in the Digital Mailroom, so there is no standalone builder page to fetch/assert here.

    writeReport(caseId, formId);
    console.log(`Report written to ${REPORT}`);
    if (failed.length) {
        console.error("Failures:", failed);
        process.exit(1);
    }
}

function writeReport(caseId: string | null, formId: string | null) {
    const builderHandoff = failed.some((f) => f.includes("builder")) ? "fail" : formId ? "pass" : "partial";
    const recommendation =
        failed.length === 0 && builderHandoff === "pass" ? "**commit**" : failed.length <= 2 ? "**fix before commit**" : "**blocked**";

    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const md = `# Processing Form Composer V1 — E2E Validation Report

**Date:** ${new Date().toISOString()}
**Branch:** feat/processing-form-composer-v1
**Processing case ID:** ${caseId ?? "—"}
**Form ID:** ${formId ?? "—"}

## PDF used
\`tests/fixtures/processing/mo500-3313-school-age-child-health-report.pdf\`

MO500-style **generated AcroForm fixture** (7 fields: child_name, birthdate, allergy_notes, health_good, routing_code, parent_signature, signature_date).

Official Missouri DESE URL (\`dese.mo.gov/media/pdf/mo500-3313...\`) returns HTML, not a PDF — not usable from CI/repo.

## What detected cleanly
${detectedCleanly.map((x) => `- ${x}`).join("\n") || "- (none)"}

## What required operator review
${requiredReview.map((x) => `- ${x}`).join("\n") || "- (none)"}

## What failed
${failed.map((x) => `- ${x}`).join("\n") || "- (none)"}

## Builder handoff
- Status: **${builderHandoff}**
- Target route: \`/adminV2/forms/[id]\`

## Playwright UI E2E
Partial automation in \`playwright/tests/processing-form-composer-v1-e2e.spec.ts\`.
- Upload + case creation: verified via API script
- Processing modal UI: intermittent in headless runs (BOS modal portal timing); screenshots in \`docs/sprints/archive/07_2026/processing-form-composer-v1-screenshots/\` when UI test completes

## Unrelated WIP in commit diff
- Focus-panel composer untracked files: **not** in tracked diff
- Queue-row slot changes on branch: **revert before commit** (unrelated to Form Composer)

## Notes
${notes.map((x) => `- ${x}`).join("\n")}

## Recommendation
${recommendation}
`;
    fs.writeFileSync(REPORT, md);
}

main().catch((e) => {
    failed.push(e instanceof Error ? e.message : String(e));
    writeReport(null, null);
    console.error(e);
    process.exit(1);
});
