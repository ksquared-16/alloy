/**
 * D8 — Forms and Documents convergence: form-produced documents carry their provenance, and a completed form may
 * satisfy a document requirement only under the requirement's published Forms evidence policy.
 *
 * Real routes, the unmodified requirement service and evaluators, the provenance read and the authorization helpers;
 * the session and the service-role client are substituted. The database half (form_evidence validation and
 * immutability) is proven against Postgres by certification/invariants/documents-d8-forms-evidence.sql.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { documentReviewStandIn } from "../harness/documentReviewStandIns";
import { InMemorySupabase } from "../harness/inMemorySupabase";
import { buildRequest, invokeRoute, routeParams } from "../harness/routeInvoker";

const { mockCtx, mockAccess, dbRef } = vi.hoisted(() => ({ mockCtx: vi.fn(), mockAccess: vi.fn(), dbRef: { current: null as unknown } }));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockCtx, getAdminContext: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContextCached: mockAccess, getAdminAccessContext: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => dbRef.current, createServiceRoleClient: () => dbRef.current }));
vi.mock("@/lib/supabase/serverServiceClient", () => ({ createServiceRoleClient: () => dbRef.current }));

import { POST as reviewPOST } from "@/app/api/admin/documents/[id]/review/route";
import { GET as libraryGET } from "@/app/api/admin/documents/library/route";
import { PUT as draftPUT } from "@/app/api/admin/documents/configuration/requirements/[id]/draft/route";
import { GET as readinessGET } from "@/app/api/admin/documents/requirements/readiness/route";
import { artifactIntegrity, formArtifactCountsFor, type FormArtifactProvenance } from "@/lib/documents/forms/formArtifactProvenance";
import type { LibraryDocument } from "@/lib/documents/library/documentLibraryModel";
import { documentRequirementDraftProblems, parseDocumentRequirementDraft } from "@/lib/documents/requirements/documentRequirementPolicy";
import type { SubjectReadiness } from "@/lib/documents/requirements/documentRequirementService";

const ORG = "0a000000-0000-4000-8000-0000000000d8";
const USER = "05e00000-0000-4000-8000-0000000000d8";
const H = "c0000000-0000-4000-8000-0000000000d8";
const C1 = "cb000000-0000-4000-8000-0000000000e1";
const P1 = "9e000000-0000-4000-8000-0000000000d8";
const OPP = "0e000000-0000-4000-8000-0000000000d8";
const T_IMM = { id: "ce000000-0000-4000-8000-0000000000e1", v: "cf000000-0000-4000-8000-0000000000e1" };
const T_GEN = { id: "ce000000-0000-4000-8000-0000000000e2", v: "cf000000-0000-4000-8000-0000000000e2" };
const R = { id: "a6000000-0000-4000-8000-0000000000e1", v: "a7000000-0000-4000-8000-0000000000e1" };
const FORM = { attest: "f0000000-0000-4000-8000-000000000001", intake: "f0000000-0000-4000-8000-000000000002" };
const SUB = { submitted: "5b000000-0000-4000-8000-000000000001", draft: "5b000000-0000-4000-8000-000000000002", other: "5b000000-0000-4000-8000-000000000003" };
const DOC = {
    pdf: "d8000000-0000-4000-8000-000000000001", // completed attestation PDF for Mia, submission submitted
    signed: "d8000000-0000-4000-8000-000000000002", // signed artifact, integrity verified
    tampered: "d8000000-0000-4000-8000-000000000003", // signed artifact whose stored bytes do not match the signed hash
    draftPdf: "d8000000-0000-4000-8000-000000000004", // PDF of a draft submission
    otherForm: "d8000000-0000-4000-8000-000000000005", // PDF of another form
    upload: "d8000000-0000-4000-8000-000000000006", // a typed immunization record uploaded through the form
} as const;

const P = {
    admin: { orgId: ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "processing.documents.manage", "health.view"] },
};
function as(p: { orgId: string; roleKeys: string[]; permissionKeys: string[] }) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: "admin", userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;
const doc = (id: string, over: Record<string, unknown>) => ({
    id, org_id: ORG, bucket: "org_documents", storage_path: `${ORG}/customer_member/${C1}/${id}.pdf`, title: `Form ${id.slice(-2)}`, mime_type: "application/pdf", byte_size: 10,
    doc_type: "generated_form_pdf", sensitivity: "standard", status: "uploaded", metadata: {}, checksum_sha256: "a".repeat(64), entity_type: "customer_member", entity_id: C1,
    created_at: "2026-10-20T00:00:00Z", current_version_id: `v-${id}`, ...over,
});
const owner = (document_id: string) => ({ org_id: ORG, document_id, subject_type: "child", subject_id: C1, association: "owner", is_primary: true, source: "legacy_writer", created_at: "2026-10-20T00:00:00Z", ended_at: null });
const version = (docId: string, over: Record<string, unknown> = {}) => ({
    id: `v-${docId}`, org_id: ORG, document_id: docId, version_number: 1, review_status: null, reviewed_at: null, effective_on: null, expires_on: null, created_at: "2026-10-20T00:00:00Z", source: "document_insert", ...over,
});
function setRequirementForms(formEvidence: unknown) {
    db.rows("document_requirement_versions").find((v) => v.id === R.v)!.form_evidence = formEvidence;
}

beforeEach(() => {
    vi.clearAllMocks();
    db = new InMemorySupabase();
    db.seed("org_settings", [{ org_id: ORG, metadata: { timezone: "America/Los_Angeles" } }]);
    db.seed("customers", [{ id: H, org_id: ORG, name: "Rivera household", status_key: "active", created_at: "2026-09-01T00:00:00Z" }]);
    db.seed("customer_persons", [{ org_id: ORG, customer_id: H, person_id: P1, role_type: "primary_contact", is_primary: true, status: "active", end_date: null, persons: { id: P1, first_name: "Ana", last_name: "Rivera" } }]);
    db.seed("persons", [{ id: P1, org_id: ORG, first_name: "Ana", last_name: "Rivera", created_at: "2026-09-01T00:00:00Z" }]);
    db.seed("customer_members", [{ id: C1, org_id: ORG, customer_id: H, first_name: "Mia", last_name: "Rivera", is_active: true, created_at: "2026-10-01T00:00:00Z" }]);
    db.seed("opportunities", [{ id: OPP, org_id: ORG, customer_id: H, title: "Fall enrollment", status_key: "open", created_at: "2026-10-01T00:00:00Z" }]);
    const tv = (t: { id: string; v: string }, key: string, label: string, subjects: string[], sensitivity: string, review: boolean, validity: Record<string, unknown>) => ({
        type: { id: t.id, org_id: ORG, key, status: "active", seeded: true, published_version_id: t.v },
        version: { id: t.v, org_id: ORG, document_type_id: t.id, version_number: 1, status: "published", label, category_id: null, subject_types: subjects, allowed_formats: ["pdf"], default_sensitivity: sensitivity, review_required: review, replacement_policy: "new_version", validity_policy: validity },
    });
    const imm = tv(T_IMM, "immunization_record", "Immunization record", ["child"], "standard", true, { kind: "periodic_reconfirmation", value: 12, unit: "months", warning_days: [30] });
    const gen = tv(T_GEN, "generated_form_pdf", "Completed form", ["child", "household", "person", "opportunity", "form_submission"], "standard", false, { kind: "none" });
    db.seed("document_types", [imm.type, gen.type]);
    db.seed("document_type_versions", [imm.version, gen.version]);
    db.seed("document_categories", []);
    db.seed("document_requirements", [{ id: R.id, org_id: ORG, key: "immunizations", status: "active", published_version_id: R.v, created_at: "2026-10-01T00:00:00Z", archived_at: null }]);
    db.seed("document_requirement_versions", [
        {
            id: R.v, org_id: ORG, requirement_id: R.id, version_number: 1, status: "published", label: "Immunizations", description: null, document_type_key: "immunization_record",
            subject_type: "child", scope: { kind: "all" }, timing: { kind: "immediate" }, policy: "required", waivable: false, effective_from: null, effective_until: null,
            form_evidence: { form_keys: ["immunization_attestation"], acceptance: "review" }, validation_errors: [], created_at: "2026-10-01T00:00:00Z", published_at: "2026-10-01T00:00:00Z", superseded_at: null,
        },
    ]);
    db.seed("document_requirement_waivers", []);
    db.seed("form_definitions", [
        { id: FORM.attest, org_id: ORG, key: "immunization_attestation", name: "Immunization attestation", kind: "center", is_active: true },
        { id: FORM.intake, org_id: ORG, key: "family_intake", name: "Family intake", kind: "center", is_active: true },
    ]);
    db.seed("form_submissions", [
        { id: SUB.submitted, org_id: ORG, form_definition_id: FORM.attest, status: "submitted", submitted_at: "2026-10-20T00:00:00Z", customer_member_id: C1 },
        { id: SUB.draft, org_id: ORG, form_definition_id: FORM.attest, status: "draft", submitted_at: null, customer_member_id: C1 },
        { id: SUB.other, org_id: ORG, form_definition_id: FORM.intake, status: "submitted", submitted_at: "2026-10-20T00:00:00Z", customer_member_id: C1 },
    ]);
    db.seed("documents", [
        doc(DOC.pdf, { metadata: { version_role: "completed" } }),
        doc(DOC.signed, { checksum_sha256: "b".repeat(64), metadata: { version_role: "signed", lineage: { signed_sha256: "b".repeat(64) } } }),
        doc(DOC.tampered, { checksum_sha256: "c".repeat(64), metadata: { version_role: "signed", lineage: { signed_sha256: "d".repeat(64) } } }),
        doc(DOC.draftPdf, {}),
        doc(DOC.otherForm, {}),
        doc(DOC.upload, { doc_type: "immunization_record", metadata: { form_definition_id: FORM.attest, packet_session_id: "ps1" } }),
    ]);
    db.seed("document_subjects", Object.values(DOC).map(owner));
    // The D2 `document_subject_links` view's rows (active owner associations), as the library reads them.
    db.seed("document_subject_links", Object.values(DOC).map((d) => ({ org_id: ORG, document_id: d, subject_type: "child", subject_id: C1, association: "owner", is_primary: true, derived_from: "document_subjects" })));
    db.seed("document_versions", Object.values(DOC).map((d) => version(d)));
    db.seed("form_submission_documents", [
        { org_id: ORG, form_submission_id: SUB.submitted, document_id: DOC.pdf, role: "generated_pdf" },
        { org_id: ORG, form_submission_id: SUB.submitted, document_id: DOC.signed, role: "generated_pdf" },
        { org_id: ORG, form_submission_id: SUB.submitted, document_id: DOC.tampered, role: "generated_pdf" },
        { org_id: ORG, form_submission_id: SUB.draft, document_id: DOC.draftPdf, role: "generated_pdf" },
        { org_id: ORG, form_submission_id: SUB.other, document_id: DOC.otherForm, role: "generated_pdf" },
    ]);
    db.seed("document_version_review_events", []);
    (db as unknown as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
        const reviewed = documentReviewStandIn(db as never, name, args);
        if (reviewed) return reviewed;
        if (name === "is_medical_form_submission") return { data: false, error: null };
        return { data: null, error: { message: `unexpected rpc ${name}` } };
    };
    dbRef.current = db;
    // Only the completed PDF and the upload are "live" unless a test says otherwise.
    for (const d of [DOC.signed, DOC.tampered, DOC.draftPdf, DOC.otherForm, DOC.upload]) db.rows("documents").find((x) => x.id === d)!.status = "deleted";
    as(P.admin);
});

const live = (...ids: string[]) => {
    for (const id of ids) db.rows("documents").find((x) => x.id === id)!.status = "uploaded";
};
const readiness = async () =>
    (await invokeRoute(readinessGET, buildRequest({ path: `/api/admin/documents/requirements/readiness?subject_type=child&subject_id=${C1}` }))).body as { readiness: { subjects: SubjectReadiness[] } };
const evalOf = async () => (await readiness()).readiness.subjects.flatMap((s) => s.requirements).find((e) => e.requirement_id === R.id) ?? null;

describe("provenance of form-produced documents (D8.2)", () => {
    it("integrity: verified when the signed hash matches the stored bytes, mismatch when not, unrecorded without one", () => {
        expect(artifactIntegrity({ checksum_sha256: "b".repeat(64), metadata: { lineage: { signed_sha256: "B".repeat(64) } } })).toBe("verified");
        expect(artifactIntegrity({ checksum_sha256: "c".repeat(64), metadata: { lineage: { signed_sha256: "d".repeat(64) } } })).toBe("mismatch");
        expect(artifactIntegrity({ checksum_sha256: null, metadata: { lineage: { signed_sha256: "d".repeat(64) } } })).toBe("mismatch");
        expect(artifactIntegrity({ checksum_sha256: "c".repeat(64), metadata: {} })).toBe("unrecorded");
    });
    it("which artifacts may count: a submitted completed PDF of a named form, never a signature, an upload, a draft or a mismatch", () => {
        const p = (over: Partial<FormArtifactProvenance>): FormArtifactProvenance => ({
            document_id: "d", role: "generated_pdf", kind: "completed", form_definition_id: "f", form_key: "a", form_name: "A", form_submission_id: "s",
            submission_status: "submitted", submitted_at: null, packet_session_id: null, integrity: "unrecorded", ...over,
        });
        expect(formArtifactCountsFor(p({}), ["a"])).toBe(true);
        expect(formArtifactCountsFor(p({ kind: "signed", integrity: "verified" }), ["a"])).toBe(true);
        expect(formArtifactCountsFor(p({ form_key: "b" }), ["a"])).toBe(false);
        expect(formArtifactCountsFor(p({ submission_status: "draft" }), ["a"])).toBe(false);
        expect(formArtifactCountsFor(p({ submission_status: "void" }), ["a"])).toBe(false);
        expect(formArtifactCountsFor(p({ integrity: "mismatch" }), ["a"])).toBe(false);
        expect(formArtifactCountsFor(p({ role: "signature_asset", kind: "signature" }), ["a"])).toBe(false);
        expect(formArtifactCountsFor(p({ role: "upload", kind: "upload" }), ["a"])).toBe(false);
        expect(formArtifactCountsFor(null, ["a"])).toBe(false);
    });
    it("the household library names each form artifact's form, kind and integrity — the same canonical documents, no copies", async () => {
        live(DOC.signed, DOC.tampered, DOC.upload);
        const r = await invokeRoute(libraryGET, buildRequest({ path: `/api/admin/documents/library?subject_type=household&subject_id=${H}` }));
        expect(r.status).toBe(200);
        const docs = new Map(((r.body as { library: { documents: LibraryDocument[] } }).library.documents ?? []).map((d) => [d.id, d]));
        expect(docs.get(DOC.pdf)?.form_provenance).toMatchObject({ kind: "completed", form_key: "immunization_attestation", form_name: "Immunization attestation", submission_status: "submitted", integrity: "unrecorded" });
        expect(docs.get(DOC.signed)?.form_provenance).toMatchObject({ kind: "signed", integrity: "verified" });
        expect(docs.get(DOC.tampered)?.form_provenance).toMatchObject({ kind: "signed", integrity: "mismatch" });
        expect(docs.get(DOC.upload)?.form_provenance).toMatchObject({ role: "upload", kind: "upload", form_key: "immunization_attestation", packet_session_id: "ps1" });
        expect(db.rows("documents")).toHaveLength(6);
    });
});

describe("a completed form satisfies a requirement only under its policy (D8.3)", () => {
    it("acceptance review: a submitted completed form is pending review, not accepted evidence", async () => {
        const e = await evalOf();
        expect(e).toMatchObject({ state: "pending_review", blocking: true });
        expect(e?.evidence.from_forms).toEqual([DOC.pdf]);
        expect(e?.evidence.pending).toEqual([DOC.pdf]);
    });
    it("…and accepting its version (D7 review) satisfies the requirement", async () => {
        const r = await invokeRoute(reviewPOST, buildRequest({ method: "POST", path: "/x", body: { decision: "accepted" } }), routeParams({ id: DOC.pdf }));
        expect(r.status).toBe(200);
        expect(await evalOf()).toMatchObject({ state: "satisfied", blocking: false });
    });
    it("acceptance submitted: the organization's policy accepts the submission itself", async () => {
        setRequirementForms({ form_keys: ["immunization_attestation"], acceptance: "submitted" });
        expect(await evalOf()).toMatchObject({ state: "satisfied", evidence: { accepted: [DOC.pdf], from_forms: [DOC.pdf] } });
    });
    it("without Forms evidence on the requirement, a completed form is never evidence (D6 behaviour)", async () => {
        setRequirementForms(null);
        expect(await evalOf()).toMatchObject({ state: "missing" });
    });
    it("a draft submission, another form, or a signed artifact whose bytes do not match is never evidence", async () => {
        setRequirementForms({ form_keys: ["immunization_attestation"], acceptance: "submitted" });
        db.rows("documents").find((x) => x.id === DOC.pdf)!.status = "deleted";
        live(DOC.draftPdf, DOC.otherForm, DOC.tampered);
        expect(await evalOf()).toMatchObject({ state: "missing", evidence: { from_forms: [] } });
        live(DOC.signed);
        expect(await evalOf()).toMatchObject({ state: "satisfied", evidence: { accepted: [DOC.signed] } });
    });
    it("D7 validity applies with the requirement's type policy: a completed form older than its reconfirmation period has expired", async () => {
        setRequirementForms({ form_keys: ["immunization_attestation"], acceptance: "submitted" });
        db.rows("document_versions").find((x) => x.id === `v-${DOC.pdf}`)!.effective_on = "2025-09-01";
        expect(await evalOf()).toMatchObject({ state: "expired", blocking: true });
    });
    it("a form upload of the requirement's type counts as a document of that type (pending its review), with no Forms policy needed", async () => {
        setRequirementForms(null);
        live(DOC.upload);
        expect(await evalOf()).toMatchObject({ state: "pending_review", evidence: { pending: [DOC.upload], from_forms: [] } });
    });
});

describe("authoring Forms evidence (D8.3, D8.4)", () => {
    it("the editor's validator mirrors the database for form_evidence", () => {
        const base = parseDocumentRequirementDraft({ label: "Immunizations", document_type_key: "immunization_record", subject_type: "child" });
        type Ctx = Parameters<typeof documentRequirementDraftProblems>[1];
        const ctx: Ctx = { typeSubjectTypes: ["child"], duplicate: false, activeFormKeys: ["immunization_attestation"], completedFormSubjectTypes: ["child"] };
        const codes = (fe: unknown, c: Partial<Ctx> = {}) => documentRequirementDraftProblems({ ...base, form_evidence: fe as never }, { ...ctx, ...c }).map((p) => p.code);
        expect(codes(null)).toEqual([]);
        expect(codes({ form_keys: ["immunization_attestation"], acceptance: "review" })).toEqual([]);
        expect(codes(["x"])).toEqual(["form_evidence_shape"]);
        expect(codes({ form_keys: [], acceptance: "maybe", extra: 1 })).toEqual(["form_evidence_field_unknown", "form_evidence_forms_shape", "form_evidence_acceptance_unknown"]);
        expect(codes({ form_keys: ["retired"], acceptance: "review" })).toEqual(["form_evidence_form_unknown"]);
        expect(codes({ form_keys: ["immunization_attestation"], acceptance: "review" }, { completedFormSubjectTypes: null })).toEqual(["form_evidence_type_not_accepted"]);
        // Parsing: an empty list means no Forms evidence; acceptance defaults to review.
        expect(parseDocumentRequirementDraft({ form_evidence: { form_keys: [] } }).form_evidence).toBeNull();
        expect(parseDocumentRequirementDraft({ form_evidence: { form_keys: [" immunization_attestation "] } }).form_evidence).toEqual({ form_keys: ["immunization_attestation"], acceptance: "review" });
    });
    it("a draft saves its Forms evidence, and the preview refuses a form that is not an active form of the organization", async () => {
        const body = { label: "Immunizations v2", document_type_key: "immunization_record", subject_type: "child", scope: { kind: "all" }, timing: { kind: "immediate" }, policy: "required", waivable: false, form_evidence: { form_keys: ["retired_form"], acceptance: "review" } };
        const r = await invokeRoute(draftPUT, buildRequest({ method: "PUT", path: "/x", body }), routeParams({ id: R.id }));
        expect(r.status).toBe(200);
        expect(((r.body as { problems: Array<{ code: string }> }).problems ?? []).map((p) => p.code)).toContain("form_evidence_form_unknown");
        const saved = db.rows("document_requirement_versions").find((v) => v.requirement_id === R.id && v.status === "draft");
        expect(saved?.form_evidence).toEqual({ form_keys: ["retired_form"], acceptance: "review" });
    });
});
