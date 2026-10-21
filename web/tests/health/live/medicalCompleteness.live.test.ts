/**
 * MEDICAL V0.5 — insurance, reported immunizations and the consent lifecycle, against the real database.
 *
 * Form (declared capture) → Processing proposal → operator approval → Medical record → Medical card,
 * with the boundaries that matter: the submission's own child only, health.manage to write,
 * health.view to read, reported never shown as verified, one active consent per child and kind,
 * withdrawal never a deletion, and the database refusing to rewrite what was granted.
 *
 * Skipped unless the cert stack is configured (alloy-stack use) with migration 20261202090000.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { adaptHealthCaptureToProposals } from "@/lib/health/healthCaptureProposals";
import { parseHealthCaptureDeclaration } from "@/lib/health/healthCaptureDeclaration";
import { executeHealthFactProposalCommit } from "@/lib/pos/processingCase/commit/executeHealthFactProposalCommit";
import { executeMedicalConsentProposalCommit } from "@/lib/pos/processingCase/commit/executeMedicalConsentProposalCommit";
import { withdrawMedicalConsent } from "@/lib/health/medicalConsentService";
import { persistFormSubmissionSignatures } from "@/lib/forms/signatures/persistFormSubmissionSignatures";
import { buildHealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const ORG = "00000000-0000-4000-8000-000000000001";
const RUN = Date.now();
const MANAGER = { permissionKeys: ["health.view", "health.manage"] };
const VIEWER = { permissionKeys: ["health.view"] };
let db: SupabaseClient;
const ids = { customer: "", ava: "", ben: "", def: "", ver: "", subs: [] as string[], cases: [] as string[] };

const METADATA = {
    health_capture: {
        immunization_grid: {
            vaccines: [{ vaccine_key: "dtap", dose_field_ids: ["imm_dtap_dose_1", "imm_dtap_dose_2"] }],
            history: [{ vaccine_key: "varicella", field_id: "imm_had_chickenpox", state: "had_disease" }],
        },
        medical_consent: { consent_kind: "medical_records_release", text_field_ids: ["mr_authorization"], signature_field_ids: ["mr_signature"] },
    },
};

const SCHEMA: FormSchemaV1 = validateFormSchema({
    schema_version: 1,
    title: "ZZ Cert medical",
    sections: [{ id: "s", field_ids: ["ins", "imm_dtap_dose_1", "imm_dtap_dose_2", "imm_had_chickenpox", "mr_authorization", "mr_signature"] }],
    fields: [
        {
            id: "ins", type: "group", label: "Health insurance", required: false, repeat: { min: 0, max: 2 },
            collection_binding: { collection_provider_ref: "health.insurance", iteration_entity_type: "person_health_fact", iteration_alias: "insurance" },
            fields: [
                { id: "ins__provider", type: "text", label: "Insurance company", required: true },
                { id: "ins__policy_number", type: "text", label: "Policy number", required: false },
                { id: "ins__subscriber_name", type: "text", label: "Policy holder", required: false },
            ],
        },
        { id: "imm_dtap_dose_1", type: "date", label: "DTaP dose 1", required: false },
        { id: "imm_dtap_dose_2", type: "date", label: "DTaP dose 2", required: false },
        { id: "imm_had_chickenpox", type: "boolean", label: "Had chickenpox", required: false },
        { id: "mr_authorization", type: "text_block", label: "Authorization", content: "I authorize the school to discuss my child's medical condition.", required: false },
        { id: "mr_signature", type: "signature", label: "Signature", required: true },
    ],
} as never);

async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
}

async function submit(childId: string, payload: FormPayload): Promise<{ sub: string; caseId: string }> {
    const s = (await ok(db.from("form_submissions").insert({ org_id: ORG, form_definition_id: ids.def, form_definition_version_id: ids.ver, status: "submitted", submitted_at: new Date().toISOString(), payload, customer_id: ids.customer, customer_member_id: childId }).select("id").single())) as { id: string };
    ids.subs.push(s.id);
    const c = (await ok(db.from("processing_cases").insert({ org_id: ORG, status: "needs_review", metadata: {} }).select("id").single())) as { id: string };
    ids.cases.push(c.id);
    await ok(db.from("processing_case_sources").insert({ org_id: ORG, processing_case_id: c.id, source_kind: "form_submission", source_id: s.id, role: "primary" }));
    return { sub: s.id, caseId: c.id };
}

function proposals(sub: string, payload: FormPayload) {
    const decl = parseHealthCaptureDeclaration(METADATA)!;
    return [
        ...adaptFormSubmissionToRelatedRecordProposals(SCHEMA, payload, { formSubmissionId: sub, formDefinitionVersionId: ids.ver }).collections,
        ...adaptHealthCaptureToProposals(SCHEMA, payload, decl, { formSubmissionId: sub, formDefinitionVersionId: ids.ver }),
    ].flatMap((c) => c.instances);
}

const meta = async (caseId: string) => (((await ok(db.from("processing_cases").select("metadata").eq("id", caseId).single())) as { metadata: Record<string, unknown> }).metadata ?? {});

function avaPayload(over: Partial<{ policy: string; signer: string }> = {}): FormPayload {
    return {
        values: { imm_dtap_dose_1: "2023-06-12", imm_dtap_dose_2: "2023-08-12", imm_had_chickenpox: true },
        groups: { ins: [{ instance_key: `ins-${RUN}`, values: { ins__provider: "Pacific Health Plan", ins__policy_number: over.policy ?? "PHP-4410-22", ins__subscriber_name: "Pat Rivers" }, collection: { provider_ref: "health.insurance", origin: "respondent_added", iteration_entity_type: "person_health_fact" } }] },
        signatures: { mr_signature: { kind: "typed", typed_full_name: over.signer ?? "Pat Rivers", acknowledged_at: new Date().toISOString() } },
    } as FormPayload;
}

describe.skipIf(!env)("medical completeness (cert DB)", () => {
    beforeAll(async () => {
        db = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const c = (await ok(db.from("customers").insert({ org_id: ORG, name: `ZZ Cert Medical V05 ${RUN}` }).select("id").single())) as { id: string };
        ids.customer = c.id;
        const kids = (await ok(db.from("customer_members").insert([
            { org_id: ORG, customer_id: ids.customer, display_name: `Ava ${RUN}`, first_name: "Ava", relationship: "child", is_active: true },
            { org_id: ORG, customer_id: ids.customer, display_name: `Ben ${RUN}`, first_name: "Ben", relationship: "child", is_active: true },
        ]).select("id, first_name"))) as { id: string; first_name: string }[];
        ids.ava = kids.find((k) => k.first_name === "Ava")!.id;
        ids.ben = kids.find((k) => k.first_name === "Ben")!.id;
        const d = (await ok(db.from("form_definitions").insert({ org_id: ORG, key: `zz_cert_med_v05_${RUN}`, name: "ZZ Cert medical", kind: "center", metadata: METADATA }).select("id").single())) as { id: string };
        ids.def = d.id;
        const v = (await ok(db.from("form_definition_versions").insert({ org_id: ORG, form_definition_id: ids.def, version_number: 1, status: "published", published_at: new Date().toISOString(), schema_json: SCHEMA }).select("id").single())) as { id: string };
        ids.ver = v.id;
    });

    afterAll(async () => {
        if (!db) return;
        if (ids.cases.length) {
            await db.from("processing_case_sources").delete().in("processing_case_id", ids.cases);
            await db.from("processing_cases").delete().in("id", ids.cases);
        }
        if (ids.subs.length) await db.from("form_submissions").delete().in("id", ids.subs);
        if (ids.ver) await db.from("form_definition_versions").delete().eq("id", ids.ver);
        if (ids.def) await db.from("form_definitions").delete().eq("id", ids.def);
        // Health facts and consents are append-only / never deleted by design; they stay on the
        // disposable cert stack under this run's unique household.
    });

    let firstConsentId = "";

    it("a viewer cannot record anything; an unsigned authorization is refused", async () => {
        const p = avaPayload();
        const { sub, caseId } = await submit(ids.ava, p);
        const ins = proposals(sub, p).find((x) => x.collection_provider_ref === "health.insurance")!;
        expect(await executeHealthFactProposalCommit({ supabase: db, orgId: ORG, userId: null, access: VIEWER, caseId, proposalId: ins.proposal_id, metadata: await meta(caseId) })).toMatchObject({ ok: false, status: 403 });

        const unsigned = { ...p, signatures: {} } as FormPayload;
        const s2 = await submit(ids.ava, unsigned);
        const consent = proposals(s2.sub, unsigned).find((x) => x.execution_kind === "medical_consent")!;
        expect(await executeMedicalConsentProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId: s2.caseId, proposalId: consent.proposal_id, metadata: await meta(s2.caseId) })).toMatchObject({ ok: false, code: "proposal_incomplete" });
    });

    it("insurance, reported immunizations and the release commit onto the submission's child", async () => {
        const p = avaPayload();
        const { sub, caseId } = await submit(ids.ava, p);
        const all = proposals(sub, p);
        for (const prop of all) {
            const fn = prop.execution_kind === "medical_consent" ? executeMedicalConsentProposalCommit : executeHealthFactProposalCommit;
            const out = await fn({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: prop.proposal_id, metadata: await meta(caseId) });
            expect(out.ok, JSON.stringify(out)).toBe(true);
        }
        const vm = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ava, access: MANAGER });
        expect(vm.insurance).toHaveLength(1);
        expect(vm.insurance[0]).toMatchObject({ provider: "Pacific Health Plan", policyNumber: "PHP-4410-22", subscriberName: "Pat Rivers", assurance: "reported" });
        const byKey = new Map(vm.immunizations.map((m) => [m.vaccineKey, m]));
        expect(byKey.get("dtap")).toMatchObject({ assurance: "reported", doses: [{ doseNumber: 1, administeredOn: "2023-06-12" }, { doseNumber: 2, administeredOn: "2023-08-12" }] });
        expect(byKey.get("varicella")).toMatchObject({ historyState: "had_disease", assurance: "reported" });
        expect(vm.consents).toHaveLength(1);
        expect(vm.consents[0]).toMatchObject({ kind: "medical_records_release", status: "active", grantedByName: "Pat Rivers" });
        firstConsentId = vm.consents[0]!.consentId;
        const row = (await ok(db.from("person_medical_consents").select("text_sha256, source_ref, subject_entity_id").eq("id", firstConsentId).single())) as { text_sha256: string; source_ref: string; subject_entity_id: string };
        expect(row.text_sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(row.source_ref).toBe(`form_submission:${sub}`);
        expect(row.subject_entity_id).toBe(ids.ava);

        // The sibling inherits nothing.
        const ben = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ben, access: MANAGER });
        expect([ben.insurance, ben.immunizations, ben.consents]).toEqual([[], [], []]);
    });

    it("a retry records nothing twice; a corrected policy and a new signature supersede, never duplicate", async () => {
        const p = avaPayload({ policy: "PHP-4410-99", signer: "Pat Rivers" });
        const { sub, caseId } = await submit(ids.ava, p);
        for (const prop of proposals(sub, p)) {
            const fn = prop.execution_kind === "medical_consent" ? executeMedicalConsentProposalCommit : executeHealthFactProposalCommit;
            await fn({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: prop.proposal_id, metadata: await meta(caseId) });
            const again = await fn({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: prop.proposal_id, metadata: await meta(caseId) });
            expect(again).toMatchObject({ ok: true, already_applied: true });
        }
        const vm = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ava, access: MANAGER });
        // A different policy number is a second coverage (two plans), never a silent overwrite.
        expect(vm.insurance.map((i) => i.policyNumber).sort()).toEqual(["PHP-4410-22", "PHP-4410-99"]);
        // Unchanged immunizations are already on record — still one fact per vaccine.
        expect(vm.immunizations.filter((m) => m.vaccineKey === "dtap")).toHaveLength(1);
        // One active consent; the first is superseded and still readable.
        expect(vm.consents.filter((c) => c.status === "active")).toHaveLength(1);
        expect(vm.consents.find((c) => c.consentId === firstConsentId)?.status).toBe("superseded");
    });

    it("withdrawal is a state with a reason; what was granted can never be rewritten or deleted", async () => {
        const vm = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ava, access: MANAGER });
        const active = vm.consents.find((c) => c.status === "active")!;
        await expect(withdrawMedicalConsent(db, { orgId: ORG, access: VIEWER, consentId: active.consentId, reason: "family request", actorUserId: null })).rejects.toThrow();
        await expect(withdrawMedicalConsent(db, { orgId: ORG, access: MANAGER, consentId: active.consentId, reason: "  ", actorUserId: null })).rejects.toThrow(/reason/);
        // FI-03: acting from Ben's card cannot withdraw Ava's consent — refused, and untouched.
        await expect(withdrawMedicalConsent(db, { orgId: ORG, access: MANAGER, consentId: active.consentId, reason: "wrong child", actorUserId: null, customerMemberId: ids.ben })).rejects.toThrow(/active/);
        const w = await withdrawMedicalConsent(db, { orgId: ORG, access: MANAGER, consentId: active.consentId, reason: "Family revoked by phone", actorUserId: null, customerMemberId: ids.ava });
        expect(w).toMatchObject({ status: "withdrawn", withdrawal_reason: "Family revoked by phone" });
        await expect(withdrawMedicalConsent(db, { orgId: ORG, access: MANAGER, consentId: active.consentId, reason: "again", actorUserId: null })).rejects.toThrow(/active/);

        const rewrite = await db.from("person_medical_consents").update({ granted_by_name: "Someone else" }).eq("id", active.consentId);
        expect(rewrite.error?.message).toMatch(/immutable/);
        const reopen = await db.from("person_medical_consents").update({ status: "active", withdrawn_at: null }).eq("id", active.consentId);
        expect(reopen.error).not.toBeNull();
        const del = await db.from("person_medical_consents").delete().eq("id", active.consentId);
        expect(del.error?.message).toMatch(/never deleted/);

        const after = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ava, access: MANAGER });
        expect(after.consents.filter((c) => c.status === "active")).toHaveLength(0);
        expect(after.consents.find((c) => c.consentId === active.consentId)).toMatchObject({ status: "withdrawn", withdrawalReason: "Family revoked by phone" });
    });

    /** A drawn asset exactly as `enrollment-signature-asset` creates one (no bytes needed here). */
    async function drawnAsset(childId: string): Promise<string> {
        const d = (await ok(db.from("documents").insert({ org_id: ORG, entity_type: "customer_member", entity_id: childId, doc_type: "signature_asset", title: "Participant signature", original_filename: "signature.png", mime_type: "image/png", byte_size: 1, bucket: "documents", storage_path: `zz-cert/${RUN}/${childId}.png`, status: "uploaded" }).select("id").single())) as { id: string };
        return d.id;
    }

    it("FI-02: a DRAWN signature's signer is the printed name the signer typed — the real persisted shape", async () => {
        const docId = await drawnAsset(ids.ben);
        // Exactly what the embed client sends: a drawn mark, its asset, the acknowledgment, and the
        // printed name typed by the signer — here the adult the link was sent to.
        const p = { ...avaPayload(), signatures: { mr_signature: { kind: "drawn", drawn_document_id: docId, acknowledged_at: "2026-10-21T16:00:00.000Z", signer_printed_name: "Pat Rivers" } } } as FormPayload;
        const { sub, caseId } = await submit(ids.ben, p);
        const persisted = await persistFormSubmissionSignatures(db, { orgId: ORG, formSubmissionId: sub, schema: SCHEMA, payload: p, signerIpHash: null, channel: { kind: "public_link", linkId: `zz-link-${RUN}`, packetSessionId: null, recipientPersonId: null, recipientName: "Pat Rivers" } });
        expect(persisted).toEqual({ inserted: 1 });

        const row = (await ok(db.from("form_submission_signatures").select("signature_kind, typed_full_name, drawn_asset_document_id, metadata").eq("form_submission_id", sub).single())) as { signature_kind: string; typed_full_name: string | null; drawn_asset_document_id: string; metadata: { signer: Record<string, unknown> } };
        // The real drawn shape: no typed_full_name on the row; who signed lives in metadata.signer.
        expect(row).toMatchObject({ signature_kind: "drawn", typed_full_name: null, drawn_asset_document_id: docId });
        expect(row.metadata.signer).toMatchObject({ method: "drawn", printed_name: "Pat Rivers", identity_basis: "printed_name_with_drawn_mark", channel: "public_link", printed_name_matches_recipient: true });

        const consent = proposals(sub, p).find((x) => x.execution_kind === "medical_consent")!;
        expect(consent.status).toBe("valid");
        const out = await executeMedicalConsentProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: consent.proposal_id, metadata: await meta(caseId) });
        expect(out.ok).toBe(true);
        const ben = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ben, access: MANAGER });
        expect(ben.consents[0]).toMatchObject({ status: "active", grantedByName: "Pat Rivers", grantedAt: expect.stringMatching(/^2026-10-21T16:00/) });
    });

    it("FI-02: a DIFFERENT adult signing on the parent's link is recorded as themselves — and their consent is refused, never re-attributed", async () => {
        const docId = await drawnAsset(ids.ben);
        const p = { ...avaPayload(), signatures: { mr_signature: { kind: "drawn", drawn_document_id: docId, acknowledged_at: "2026-10-21T18:00:00.000Z", signer_printed_name: "Jordan Rivers" } } } as FormPayload;
        const { sub, caseId } = await submit(ids.ben, p);
        await persistFormSubmissionSignatures(db, { orgId: ORG, formSubmissionId: sub, schema: SCHEMA, payload: p, signerIpHash: null, channel: { kind: "public_link", linkId: `zz-link-${RUN}`, packetSessionId: null, recipientPersonId: null, recipientName: "Pat Rivers" } });
        const row = (await ok(db.from("form_submission_signatures").select("metadata").eq("form_submission_id", sub).single())) as { metadata: { signer: Record<string, unknown> } };
        expect(row.metadata.signer).toMatchObject({ printed_name: "Jordan Rivers", printed_name_matches_recipient: false });
        const before = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ben, access: MANAGER });
        const consent = proposals(sub, p).find((x) => x.execution_kind === "medical_consent")!;
        const out = await executeMedicalConsentProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: consent.proposal_id, metadata: await meta(caseId) });
        expect(out).toMatchObject({ ok: false, code: "signer_not_authorized" });
        const after = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ben, access: MANAGER });
        expect(after.consents).toEqual(before.consents);
        expect(JSON.stringify(after.consents)).not.toContain("Jordan Rivers");
    });

    it("FI-02: a drawn mark with NO printed name is refused, never recorded under the recipient's name", async () => {
        const docId = await drawnAsset(ids.ava);
        const p = { ...avaPayload(), signatures: { mr_signature: { kind: "drawn", drawn_document_id: docId, acknowledged_at: "2026-10-21T17:00:00.000Z" } } } as FormPayload;
        const { sub, caseId } = await submit(ids.ava, p);
        await persistFormSubmissionSignatures(db, { orgId: ORG, formSubmissionId: sub, schema: SCHEMA, payload: p, signerIpHash: null, channel: { kind: "public_link", linkId: `zz-link-${RUN}`, packetSessionId: null, recipientPersonId: null, recipientName: "Pat Rivers" } });
        const row = (await ok(db.from("form_submission_signatures").select("metadata").eq("form_submission_id", sub).single())) as { metadata: { signer: Record<string, unknown> } };
        expect(row.metadata.signer).toMatchObject({ printed_name: null, identity_basis: "not_captured" });

        const consent = proposals(sub, p).find((x) => x.execution_kind === "medical_consent")!;
        expect(consent.status).toBe("incomplete");
        expect(JSON.stringify(consent.diagnostics)).toMatch(/does not say who signed/);
        const before = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ava, access: MANAGER });
        const out = await executeMedicalConsentProposalCommit({ supabase: db, orgId: ORG, userId: null, access: MANAGER, caseId, proposalId: consent.proposal_id, metadata: await meta(caseId) });
        expect(out).toMatchObject({ ok: false });
        const after = await buildHealthSafetyCardVM(db, { orgId: ORG, customerMemberId: ids.ava, access: MANAGER });
        expect(after.consents).toHaveLength(before.consents.length);
    });

    it("signed-in database users cannot read consents directly; only the server can", async () => {
        const anonKey = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8").split("\n").find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY="))?.split("=").slice(1).join("=").trim() ?? "";
        expect(anonKey.length).toBeGreaterThan(20);
        const anon = createClient(env!.url, anonKey, { auth: { persistSession: false } });
        const { data, error } = await anon.from("person_medical_consents").select("id").limit(1);
        // Refused outright (no grant) — or, at most, sees nothing.
        expect(error !== null || (data ?? []).length === 0).toBe(true);
        const privileges = await db.from("person_medical_consents").select("id").limit(1);
        expect(privileges.error).toBeNull();
    });
});
