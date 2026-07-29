import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";
import { toDecisionRecords } from "../../lib/pos/discovery/discoveryDecisionBridge";
import type { ConfigurationDiscoveryResult, ProposalDecisionState } from "../../lib/pos/discovery/contracts";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

/**
 * Configuration Discovery — end-to-end proving journey (FP16/FP17).
 *
 * Certifies the architecture the platform actually intends to keep: canonical Relationship
 * Definitions projected into the collection registry, Forms, Configuration Discovery and the
 * canonical write path. @see docs/platform/core/data/relationship-model.md
 *
 * Runs IN ORDER on a genuinely NEW case each run — the previously certified case had a form that
 * predated apply, so its "publish proof" proved nothing about binding lineage.
 *
 * CERTIFIES steps 1-5: import -> detect -> decisions -> apply (+idempotent) -> save -> generate ->
 * publish -> reopen.
 *
 * STOPS THERE, deliberately. Steps 6-9 (submission with collection metadata -> Processing ->
 * canonical execution) are NOT reachable against a product-generated form: Configuration Discovery
 * resolves each relationship group to its canonical provider and write command, but NOTHING
 * translates that into a collection-bound form group. `createFormFromCaseDraft` has no
 * `collection_binding` handling, and the only writers of `collection_binding` are the manual Forms
 * authoring surfaces. So a generated form has 112 flat fields and 0 collection groups, and a
 * respondent cannot supply emergency contacts as a collection.
 *
 * Injecting the groups by hand here (POST /versions with an edited schema) would certify a path the
 * product cannot produce. That is exactly the "certifying an implementation that still contains the
 * seam" failure this journey exists to avoid. See test 6 below, which ASSERTS the gap so the day it
 * closes, this test fails and the journey gets extended.
 *
 * Requires a running server. Run with:
 *   cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3014 \
 *     PLAYWRIGHT_STORAGE_STATE=/Users/Kelly/.local/state/alloy-dev/auth/slot4/storage-state.json \
 *     npx playwright test playwright/tests/configuration-discovery-proving-journey.spec.ts
 */

const FIXTURE = path.join(process.cwd(), "tests/pos/fixtures/enrollment-record-8.25.pdf");


type Json = Record<string, any>;

async function okJson(res: { ok(): boolean; status(): number; json(): Promise<any>; text(): Promise<string> }, what: string) {
    if (!res.ok()) {
        throw new Error(`${what} failed ${res.status()}: ${(await res.text()).slice(0, 800)}`);
    }
    return res.json();
}

/** Upload a byte-unique copy of the native-layout fixture so a brand-new case is opened. */
async function uploadFreshCase(request: APIRequestContext): Promise<{ caseId: string; documentId: string }> {
    const stamp = `${Date.now()}-${Number(process.hrtime.bigint() % 100000n)}`;
    const bytes = fs.readFileSync(FIXTURE);
    // Append a PDF comment so the bytes differ per run without corrupting the document.
    const unique = Buffer.concat([bytes, Buffer.from(`\n% proving-journey-${stamp}\n`)]);

    const res = await request.post("/api/admin/documents/upload", {
        multipart: {
            file: { name: `proving-journey-${stamp}.pdf`, mimeType: "application/pdf", buffer: unique },
            open_processing_case: "true",
            processing_intent: "generate_form",
            title: `Proving Journey ${stamp}`,
        },
        timeout: 180_000,
    });
    const body = await okJson(res, "documents/upload");
    const caseId: string | null = body.processing_case_id ?? null;
    const documentId: string | undefined = body.raw?.id ?? body.document?.id;
    expect(caseId, "upload did not open a processing case").toBeTruthy();
    expect(documentId, "upload returned no document id").toBeTruthy();
    return { caseId: caseId!, documentId: documentId! };
}

test.describe("Configuration Discovery — proving journey", () => {
    test.describe.configure({ mode: "serial", timeout: 900_000 });

    let caseId = "";
    let documentId = "";
    let discovery: ConfigurationDiscoveryResult;
    let formId = "";
    let versionId = "";
    let generatedSchema: Json;

    test("1. import a NEW case and detect (native layout → discovery)", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        const req = page.request;

        const fresh = await uploadFreshCase(req);
        caseId = fresh.caseId;
        documentId = fresh.documentId;
        console.log(`JOURNEY caseId=${caseId} documentId=${documentId}`);

        const detect = await okJson(
            await req.post(`/api/admin/processing/cases/${caseId}/form-draft`, { data: {}, timeout: 180_000 }),
            "form-draft detect",
        );
        const preview = detect.data?.form_draft_preview;
        expect(preview, "no form_draft_preview returned").toBeTruthy();

        discovery = preview.configuration_discovery;
        expect(
            discovery,
            "no configuration_discovery — the AcroForm path short-circuits before discovery; the fixture must be native-layout",
        ).toBeTruthy();
        expect(discovery.proposals.length).toBeGreaterThan(0);

        const stages = (detect.data?.detection?.stages ?? []).map((s: Json) => s.stage);
        console.log(`JOURNEY detect stages=${stages.join(",")} proposals=${discovery.proposals.length}`);

        // The relationship groups the document expresses must be discovered as relationship_binding
        // proposals — this is the definition-derived detection path.
        const relRoles = discovery.proposals
            .filter((p) => p.disposition === "relationship_binding")
            .map((p) => p.target_relationship_role);
        console.log(`JOURNEY relationship roles discovered=${JSON.stringify(relRoles)}`);
        expect(relRoles.length, "no relationship_binding proposals discovered").toBeGreaterThan(0);
    });

    test("2. record operator decisions (accept all resolvable) and reload them", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        const req = page.request;

        // Baseline reconciliation on a case with no stored decisions.
        const before = await okJson(
            await req.get(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`),
            "GET discovery-decisions (baseline)",
        );
        expect(before.data.decisions).toEqual([]);

        // Accept everything the platform could resolve; leave form_only_response alone.
        const ui: Record<string, ProposalDecisionState> = {};
        for (const p of discovery.proposals) {
            if (p.disposition === "form_only_response") continue;
            ui[p.id] = "accepted";
        }
        const records = toDecisionRecords(discovery, ui, "proving-journey", new Date().toISOString());
        expect(records.length).toBeGreaterThan(0);

        const put = await okJson(
            await req.put(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`, {
                data: { decisions: records },
            }),
            "PUT discovery-decisions",
        );
        expect(put.data.stored.decisions.length).toBe(records.length);

        // Reopen: decisions must survive a fresh read.
        const after = await okJson(
            await req.get(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`),
            "GET discovery-decisions (reload)",
        );
        expect(after.data.decisions.length).toBe(records.length);
        console.log(`JOURNEY decisions stored=${after.data.decisions.length}`);
    });

    test("3. apply — governed, and idempotent on retry", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        const req = page.request;

        const confirmedNewFields = discovery.proposals
            .filter((p) => p.disposition === "create_proposed_field")
            .map((p) => p.id);

        const first = await okJson(
            await req.post(`/api/admin/processing/cases/${caseId}/form-draft/apply-discovery`, {
                data: { confirmedNewFields },
                timeout: 180_000,
            }),
            "apply-discovery (first)",
        );
        const counts = first.data.application.counts;
        console.log(`JOURNEY apply#1 counts=${JSON.stringify(counts)}`);
        expect(counts.applied, "nothing applied").toBeGreaterThan(0);
        expect(counts.failed, "apply reported failures").toBe(0);

        // Relationship proposals must carry the CANONICAL write command from the definition.
        const relResults = first.data.application.results.filter(
            (r: Json) => r.disposition === "relationship_binding",
        );
        expect(relResults.length, "no relationship results").toBeGreaterThan(0);
        for (const r of relResults) {
            expect(r.relationship_apply?.command_key, `no command_key on ${r.concept_label}`).toBeTruthy();
            expect(r.provider_ref, `no provider_ref on ${r.concept_label}`).toBeTruthy();
        }
        console.log(
            `JOURNEY relationship applies=${JSON.stringify(
                relResults.map((r: Json) => [r.provider_ref, r.relationship_apply?.command_key]),
            )}`,
        );

        // Bound draft must now carry field_source bindings.
        const boundFields = (first.data.form_draft_preview?.fields ?? []).filter((f: Json) => f.field_source);
        expect(boundFields.length, "apply bound no field_source").toBeGreaterThan(0);
        console.log(`JOURNEY bound fields=${boundFields.length}`);

        // IDEMPOTENCY: re-apply must not re-do work.
        const second = await okJson(
            await req.post(`/api/admin/processing/cases/${caseId}/form-draft/apply-discovery`, {
                data: { confirmedNewFields },
                timeout: 180_000,
            }),
            "apply-discovery (retry)",
        );
        const retryCounts = second.data.application.counts;
        console.log(`JOURNEY apply#2 counts=${JSON.stringify(retryCounts)}`);
        expect(retryCounts.already_applied, "retry did not report already_applied").toBeGreaterThan(0);
        expect(retryCounts.failed).toBe(0);
    });

    test("4. save the BOUND draft, generate the form, publish it", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        const req = page.request;

        // Re-read the bound draft and echo it back — save rebuilds from posted fields, so the
        // field_source bindings apply wrote must be carried or they are silently dropped.
        const caseRead = await okJson(
            await req.get(`/api/admin/processing/cases/${caseId}`),
            "GET processing case (pre-save)",
        );
        const preview = caseRead.data.detail?.formDraftPreview;
        expect(preview, "no stored draft preview").toBeTruthy();

        const fields = (preview.fields ?? [])
            .filter((f: Json) => typeof f.label === "string" && f.label.trim())
            .map((f: Json) => ({
                label: f.label,
                type: f.type ?? "text",
                required: Boolean(f.required),
                section: f.section ?? undefined,
                description: f.description ?? undefined,
                pdf_field_name: f.pdf_field_name ?? undefined,
                page: f.page ?? undefined,
                bbox: f.bbox ?? undefined,
                evidence: f.evidence ?? undefined,
                field_source: f.field_source ?? undefined,
            }));
        const boundBefore = fields.filter((f: Json) => f.field_source).length;
        expect(boundBefore, "no bound fields to save").toBeGreaterThan(0);

        const formName = `Proving Journey Form ${Date.now()}`;
        const saved = await okJson(
            await req.post(`/api/admin/processing/cases/${caseId}/form-draft/save`, {
                data: {
                    form_name: formName,
                    title: formName,
                    fields,
                    section_dispositions: preview.section_dispositions ?? [],
                },
                timeout: 120_000,
            }),
            "form-draft/save",
        );
        const savedBound = (saved.data.form_draft_preview.fields ?? []).filter((f: Json) => f.field_source).length;
        expect(savedBound, "save dropped the field_source bindings").toBe(boundBefore);

        // Lineage must survive the save path.
        expect(
            saved.data.form_draft_preview.configuration_discovery,
            "save dropped configuration_discovery lineage",
        ).toBeTruthy();
        console.log(`JOURNEY saved bound=${savedBound} lineage=kept`);

        const created = await okJson(
            await req.post(`/api/admin/processing/cases/${caseId}/form-draft/create`, {
                data: { form_name: formName },
                timeout: 120_000,
            }),
            "form-draft/create",
        );
        expect(created.data.already_created).toBeFalsy();
        formId = created.data.form_id;
        versionId = created.data.form_version_id;
        console.log(`JOURNEY formId=${formId} versionId=${versionId}`);

        // Inspect the generated schema BEFORE publishing — do collection-bound groups exist?
        const version = await okJson(
            await req.get(`/api/admin/forms/${formId}/versions/${versionId}`),
            "GET form version",
        );
        const schema = version.data.schema_json;
        const groups = collectGroups(schema.fields ?? []);
        const boundGroups = groups.filter((g) => g.collection_binding?.collection_provider_ref);
        console.log(
            `JOURNEY generated schema: fields=${(schema.fields ?? []).length} groups=${groups.length} collectionBoundGroups=${JSON.stringify(
                boundGroups.map((g) => g.collection_binding.collection_provider_ref),
            )}`,
        );
        generatedSchema = schema;

        const published = await okJson(
            await req.post(`/api/admin/forms/${formId}/versions/${versionId}/publish`, { timeout: 120_000 }),
            "publish",
        );
        expect(published.data.status).toBe("published");
        console.log(`JOURNEY published version=${published.data.version_number}`);
    });

    test("5. reopen the published form — bindings, providers and lineage survive", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        const req = page.request;

        const form = await okJson(await req.get(`/api/admin/forms/${formId}`), "GET form (reopen)");
        const versions = form.data.versions ?? [];
        const publishedVersion = versions.find((v: Json) => v.id === versionId);
        expect(publishedVersion?.status, "reopened version is not published").toBe("published");

        const version = await okJson(
            await req.get(`/api/admin/forms/${formId}/versions/${versionId}`),
            "GET form version (reopen)",
        );
        const schema = version.data.schema_json;

        // Field bindings survived generate → publish → reopen.
        const bound = walkFields(schema.fields ?? []).filter((f) => f.field_source);
        expect(bound.length, "no bound fields survived to the published form").toBeGreaterThan(0);
        console.log(`JOURNEY reopened bound fields=${bound.length}`);

        // Lineage back to the discovery case.
        const meta = form.data.metadata ?? {};
        expect(meta.source_case_id, "form lost its source_case_id lineage").toBe(caseId);
        expect(meta.source_document_id).toBe(documentId);
        console.log(`JOURNEY lineage source_case_id=${meta.source_case_id}`);

        // The case's decisions are still readable after the form exists (reopen the review).
        const decisions = await okJson(
            await req.get(`/api/admin/processing/cases/${caseId}/form-draft/discovery-decisions`),
            "GET discovery-decisions (post-publish)",
        );
        expect(decisions.data.decisions.length).toBeGreaterThan(0);
        console.log(`JOURNEY decisions after publish=${decisions.data.decisions.length}`);
    });

    test("6. GAP PIN — relationship bindings do not become collection-bound form groups", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        const req = page.request;

        // Discovery DID resolve all three relationship groups to their canonical providers.
        const relProposals = discovery.proposals.filter((p) => p.disposition === "relationship_binding");
        expect(relProposals.length, "expected relationship proposals from this fixture").toBeGreaterThanOrEqual(3);

        const version = await okJson(
            await req.get(`/api/admin/forms/${formId}/versions/${versionId}`),
            "GET form version (gap pin)",
        );
        const groups = collectGroups(version.data.schema_json.fields ?? []);
        const boundGroups = groups.filter((g) => g.collection_binding?.collection_provider_ref);

        console.log(
            `JOURNEY GAP: ${relProposals.length} relationship proposals -> ${boundGroups.length} collection-bound groups in the published form`,
        );

        // THIS ASSERTION DOCUMENTS A GAP, NOT DESIRED BEHAVIOUR.
        //
        // When form generation learns to project an accepted relationship_binding into a
        // collection-bound group (provider_ref, iteration_entity_type, iteration_alias and
        // nested_field_keys are ALL already on the relationship definition), flip this to
        // toBe(relProposals.length); journey steps 7-10 (submission -> Processing -> canonical
        // execution -> idempotency) then become reachable and should be written here.
        expect(
            boundGroups.length,
            "collection groups now exist — CLOSE THIS GAP PIN and extend the journey to submission/Processing/execution",
        ).toBe(0);
    });
});

/** Collect group-type fields (one level of nesting is all Forms allows). */
function collectGroups(fields: Json[]): Json[] {
    const out: Json[] = [];
    for (const f of fields) {
        if (f.type === "group") {
            out.push(f);
            out.push(...collectGroups(f.fields ?? []));
        }
    }
    return out;
}

function walkFields(fields: Json[]): Json[] {
    const out: Json[] = [];
    for (const f of fields) {
        out.push(f);
        if (f.type === "group") out.push(...walkFields(f.fields ?? []));
    }
    return out;
}
