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

/**
 * Certification fixture manifest (certification/fixtures/configuration-discovery-v1-fixture.sql).
 * Namespaced `cdc10000-` so teardown is exact. Only meaningful on the local cert stack.
 */
const FX = {
    customerId: "cdc10000-0000-4000-8000-000000000001",
    childA: "cdc10000-0000-4000-8000-00000000000a",
    siblingB: "cdc10000-0000-4000-8000-00000000000b",
    guardianPerson: "cdc10000-0000-4000-8000-000000000101",
    multiRolePerson: "cdc10000-0000-4000-8000-000000000103",
};
const ON_CERT_STACK = (process.env.PLAYWRIGHT_BASE_URL ?? "").includes("3018");
/** The local certification tenant's single vertical (Childcare). */
const CERT_VERTICAL_ID = "d7a48ba5-2602-4dcd-8e5f-598f32436350";


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

    // ONE browser context, authenticated ONCE, shared across the serial journey. Re-logging in per
    // test is both slow and fragile in dev (Fast Refresh can wipe the controlled login inputs
    // mid-submit), and the journey is a single operator session by nature.
    let page: import("@playwright/test").Page;

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage();
        await ensureAdminPlaywrightSession(page);
    });

    test.afterAll(async () => {
        await page?.close();
    });

    let caseId = "";
    let documentId = "";
    let discovery: ConfigurationDiscoveryResult;
    let formId = "";
    let versionId = "";
    let generatedSchema: Json;
    let flatBefore = 0;
    let publicToken = "";
    let submissionId = "";
    let submissionCaseId: string | null = null;

    test("1. import a NEW case and detect (native layout → discovery)", async () => {
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

        flatBefore = (preview.fields ?? []).length;
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

    test("2. record operator decisions (accept all resolvable) and reload them", async () => {
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

    test("3. apply — governed, and idempotent on retry", async () => {
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

    test("4. save the BOUND draft, generate the form, publish it", async () => {
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
        const flatQuestions = walkFields(schema.fields ?? []).filter(
            (f) => f.type !== "group" && f.type !== "text_block",
        ).length;
        console.log(
            `JOURNEY generated schema: flatQuestions=${flatQuestions} groups=${groups.length} collectionBoundGroups=${JSON.stringify(
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

    test("5. reopen the published form — bindings, providers and lineage survive", async () => {
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

    test("6. the published form carries the three relationship COLLECTIONS", async () => {
        const req = page.request;

        const relProposals = discovery.proposals.filter((p) => p.disposition === "relationship_binding");
        expect(relProposals.length, "expected relationship proposals from this fixture").toBeGreaterThanOrEqual(3);

        const version = await okJson(
            await req.get(`/api/admin/forms/${formId}/versions/${versionId}`),
            "GET form version (collections)",
        );
        const schema = version.data.schema_json;
        const groups = collectGroups(schema.fields ?? []);
        const boundGroups = groups.filter((g) => g.collection_binding?.collection_provider_ref);
        const refs = boundGroups.map((g) => g.collection_binding.collection_provider_ref).sort();

        const flatAfter = walkFields(schema.fields ?? []).filter(
            (f) => f.type !== "group" && f.type !== "text_block",
        ).length;

        console.log(`JOURNEY PROJECTION flatBefore=${flatBefore} flatAfter=${flatAfter}`);
        console.log(`JOURNEY PROJECTION collectionGroups=${boundGroups.length} refs=${JSON.stringify(refs)}`);
        for (const g of boundGroups) {
            console.log(
                `JOURNEY PROJECTION group ${g.collection_binding.collection_provider_ref} alias=${g.collection_binding.iteration_alias} entity=${g.collection_binding.iteration_entity_type} nested=${JSON.stringify(
                    (g.fields ?? []).map((n: Json) => n.field_source?.field_key ?? n.label),
                )}`,
            );
        }

        // The three relationship concepts must be represented as collection-bound groups.
        expect(boundGroups.length, "relationship concepts did not project into collection groups").toBe(3);
        expect(refs).toEqual([
            "person.contact_role.authorized_pickups",
            "person.contact_role.emergency_contacts",
            "person.contact_role.parents",
        ]);

        // Each carries definition-derived nested Person fields.
        for (const g of boundGroups) {
            expect((g.fields ?? []).length, `${g.label} has no nested fields`).toBeGreaterThan(0);
            expect(g.collection_binding.iteration_entity_type).toBe("person");
        }

        // The flat questions the groups replaced must be gone from participant execution.
        expect(flatAfter, "projection did not reduce the flat question count").toBeLessThan(flatBefore);
    });

    test("7. reopen — collection bindings and lineage survive publish", async () => {
        const req = page.request;

        const version = await okJson(
            await req.get(`/api/admin/forms/${formId}/versions/${versionId}`),
            "GET form version (reopen collections)",
        );
        const boundGroups = collectGroups(version.data.schema_json.fields ?? []).filter(
            (g) => g.collection_binding?.collection_provider_ref,
        );
        expect(boundGroups.length, "collection bindings lost after publish/reopen").toBe(3);

        // Draft-side lineage: the projection is retained with its source evidence.
        const caseRead = await okJson(
            await req.get(`/api/admin/processing/cases/${caseId}`),
            "GET case (collection lineage)",
        );
        const collections = caseRead.data.detail?.formDraftPreview?.collections ?? [];
        expect(collections.length, "draft lost its projected collections").toBe(3);
        for (const c of collections) {
            expect(c.source_concept_id, `${c.id} lost concept lineage`).toBeTruthy();
            expect(c.source_labels.length, `${c.id} lost source question evidence`).toBeGreaterThan(0);
            expect(c.operational_role_key).toBeTruthy();
            console.log(
                `JOURNEY LINEAGE ${c.id} role=${c.operational_role_key} scope=${c.relationship_scope} observedInstances=${c.observed_instance_count} sourceLabels=${c.source_labels.length} sections=${JSON.stringify(c.source_section_titles)}`,
            );
            // A projection must never claim an output copy or a non-field section: the classroom copy
            // reproduces earlier questions, and a "…Signatures" section collects a signature, not a
            // related person. Claiming either double-counts cardinality and suppresses real questions.
            for (const t of c.source_section_titles as string[]) {
                expect(t, `${c.id} claimed an output-copy section`).not.toMatch(/\bcopy\b/i);
                expect(t, `${c.id} claimed a signature section`).not.toMatch(/signature/i);
            }
        }

        // The signature question the document requires must survive projection.
        const publishedVersion = await okJson(
            await req.get(`/api/admin/forms/${formId}/versions/${versionId}`),
            "GET form version (signature survival)",
        );
        const signatures = walkFields(publishedVersion.data.schema_json.fields ?? []).filter(
            (f) => f.type === "signature",
        );
        expect(signatures.length, "projection suppressed the form's signature field(s)").toBeGreaterThan(0);
        console.log(`JOURNEY LINEAGE signature fields surviving=${signatures.length}`);

        // Suppressed source questions are RETAINED on the draft as evidence, not deleted.
        const suppressed = (caseRead.data.detail?.formDraftPreview?.fields ?? []).filter(
            (f: Json) => f.suppressed_by_collection,
        );
        expect(suppressed.length, "source questions were deleted rather than retained as evidence").toBeGreaterThan(0);
        console.log(`JOURNEY LINEAGE retained suppressed source questions=${suppressed.length}`);
    });

    test("8. submit real collection responses through the supported public form path", async () => {
        test.skip(!ON_CERT_STACK, "Live submission runs only against the local certification stack");
        const req = page.request;

        // Mint a public link. pos_connected + lead_capture are what make the submission open a
        // Processing case — this is the supported distribution path, not a test hook.
        const link = await okJson(
            await req.post(`/api/admin/forms/${formId}/public-links`, {
                data: {
                    // The canonical Processing-intake link shape the product's own builder produces
                    // (buildProcessingPublicLinkMetadata): form_context_mode is what routes a public
                    // submission into Processing. `lead_capture` alone does not.
                    metadata: {
                        form_context_mode: "processing_intake",
                        // BOTH markers are required: form_context_mode routes the link into
                        // Processing, and lead_capture is what makes the public submit path actually
                        // run intake. Without it the submission records
                        // intake_resolution_path="skipped_intake_disabled" and opens no case.
                        lead_capture: true,
                        // CRM intake requires the link to name its vertical. The local certification
                        // tenant has exactly one (Childcare); a real Studio-minted link carries this
                        // from the form's operational intent.
                        default_vertical_id: CERT_VERTICAL_ID,
                        pos_connected: true,
                        source: "processing_studio",
                        embed_mode: true,
                        label: "CDV1 certification",
                        purpose: "Public form — submissions enter Processing for review.",
                    },
                    pinned_form_definition_version_id: versionId,
                    is_active: true,
                    label: "CDV1 certification",
                },
            }),
            "public-links",
        );
        publicToken = link.data.plaintext_token;
        expect(publicToken, "no plaintext token returned").toBeTruthy();

        // Resolve the PUBLISHED schema to get the real group + nested field ids the product created.
        const resolved = await okJson(
            await req.get(`/api/public/forms/${publicToken}/resolve`),
            "public resolve",
        );
        const schema = resolved.schema_json ?? resolved.data?.schema_json;
        const groups = collectGroups(schema.fields ?? []).filter(
            (g) => g.collection_binding?.collection_provider_ref,
        );
        expect(groups.length, "published form exposes no collection groups").toBe(3);

        const groupFor = (ref: string) =>
            groups.find((g) => g.collection_binding.collection_provider_ref === ref)!;
        const nestedId = (g: Json, fieldKey: string) =>
            (g.fields ?? []).find((f: Json) => f.field_source?.field_key === fieldKey)?.id;

        const parents = groupFor("person.contact_role.parents");
        const emergency = groupFor("person.contact_role.emergency_contacts");
        const pickups = groupFor("person.contact_role.authorized_pickups");

        // The document requires signatures, and the projection correctly preserved them — a real
        // respondent signs. Typed signatures for every signature field the published form exposes.
        const signatureFields = walkFields(schema.fields ?? []).filter((f) => f.type === "signature");
        const signatures: Record<string, Json> = {};
        for (const f of signatureFields) {
            signatures[f.id] = {
                kind: "typed",
                typed_full_name: "Dana CDV1Guardian",
                acknowledged_at: new Date().toISOString(),
            };
        }
        console.log(`JOURNEY SUBMIT signing ${signatureFields.length} signature field(s)`);

        const payload = {
            values: {},
            signatures,
            groups: {
                // GUARDIAN — an EXISTING canonical Person, linked not created.
                [parents.id]: [
                    {
                        instance_key: "cdv1-guardian-1",
                        // A respondent filling the guardian block supplies contact details; the form
                        // asks for them, and intake needs a way to reach the family.
                        values: {
                            [nestedId(parents, "full_name")!]: "Dana CDV1Guardian",
                            [nestedId(parents, "email")!]: "dana.guardian@cdv1.invalid",
                            [nestedId(parents, "phone")!]: "5550100",
                        },
                        collection: {
                            provider_ref: "person.contact_role.parents",
                            origin: "existing",
                            item_id: FX.guardianPerson,
                            iteration_entity_type: "person",
                        },
                    },
                ],
                // EMERGENCY CONTACT — respondent-added, so Processing must CREATE the Person.
                [emergency.id]: [
                    {
                        instance_key: "cdv1-emergency-1",
                        values: {
                            [nestedId(emergency, "full_name")!]: "Rosa CDV1Emergency",
                            [nestedId(emergency, "phone")!]: "5550102",
                        },
                        collection: {
                            provider_ref: "person.contact_role.emergency_contacts",
                            origin: "respondent_added",
                            iteration_entity_type: "person",
                        },
                    },
                ],
                // AUTHORIZED PICKUP — the SAME canonical Person who will also hold another role.
                [pickups.id]: [
                    {
                        instance_key: "cdv1-pickup-1",
                        values: { [nestedId(pickups, "full_name")!]: "Sam CDV1MultiRole" },
                        collection: {
                            provider_ref: "person.contact_role.authorized_pickups",
                            origin: "existing",
                            item_id: FX.multiRolePerson,
                            iteration_entity_type: "person",
                        },
                    },
                ],
            },
        };

        const draft = await okJson(
            await req.post(`/api/public/forms/${publicToken}/submissions`, { data: { payload } }),
            "create submission",
        );
        submissionId = draft.id ?? draft.data?.id;
        expect(submissionId, "no submission id").toBeTruthy();

        const submitted = await okJson(
            await req.post(`/api/public/forms/${publicToken}/submissions/${submissionId}/submit`, {
                data: { payload },
            }),
            "submit",
        );
        const row = submitted.data ?? submitted;
        console.log(`JOURNEY SUBMIT id=${submissionId} status=${row.status}`);

        // The submission must PRESERVE collection metadata rather than flattening to field pairs.
        const savedGroups = row.payload?.groups ?? {};
        const allRows: Json[] = Object.values(savedGroups).flat() as Json[];
        expect(allRows.length, "submission lost its collection rows").toBe(3);
        for (const r of allRows) {
            expect(r.collection?.provider_ref, "row lost provider_ref").toBeTruthy();
            expect(r.instance_key, "row lost instance identity").toBeTruthy();
            expect(r.collection?.origin, "row lost origin").toBeTruthy();
            expect(r.collection?.iteration_entity_type).toBe("person");
        }
        const byRef = Object.fromEntries(allRows.map((r) => [r.collection.provider_ref, r]));
        expect(byRef["person.contact_role.parents"].collection.origin).toBe("existing");
        expect(byRef["person.contact_role.parents"].collection.item_id).toBe(FX.guardianPerson);
        expect(byRef["person.contact_role.emergency_contacts"].collection.origin).toBe("respondent_added");
        expect(byRef["person.contact_role.emergency_contacts"].collection.item_id).toBeUndefined();
        expect(byRef["person.contact_role.authorized_pickups"].collection.item_id).toBe(FX.multiRolePerson);

        // The server stamps a collection envelope onto the submission — this is the structured
        // handoff Processing consumes, and the reason a collection response is not flattened into
        // ordinary question/value pairs.
        const envelope = row.payload?.meta?.collection_submission_envelope ?? {};
        const envelopeRows: Json[] = Object.values(envelope).flat() as Json[];
        expect(envelopeRows.length, "no collection envelope stamped on the submission").toBe(3);
        for (const r of envelopeRows) {
            expect(r.provider_ref).toBeTruthy();
            expect(r.instance_key).toBeTruthy();
            expect(r.iteration_entity_type).toBe("person");
        }
        console.log(
            `JOURNEY ENVELOPE groups=${Object.keys(envelope).length} rows=${envelopeRows.length} ` +
                `origins=${JSON.stringify(envelopeRows.map((r) => r.origin))}`,
        );

        submissionCaseId = row.payload?.meta?.processing_case_id ?? null;
        expect(
            submissionCaseId,
            `submission opened no Processing case (path=${row.payload?.meta?.intake_resolution_path}, reason=${row.payload?.meta?.intake_skip_reason})`,
        ).toBeTruthy();
        console.log(
            `JOURNEY SUBMIT preserved refs=${JSON.stringify(Object.keys(byRef))} processingCase=${submissionCaseId}`,
        );
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
