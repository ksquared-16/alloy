/**
 * EN-FI-01 — medical document metadata outside the Documents routes.
 *
 * The Documents routes decide every read with admission (documents.read), subject scope and sensitivity clearance
 * (health.view for medical). The batch census found surfaces that LABEL documents from service-role reads with none of
 * the three: the Processing queue and case, a form submission's linked documents, packet review, enrollment packets,
 * the Documents status PATCH (full row back), the POS rename/delete, and the Health card's document list. Each now
 * goes through `disclosableDocumentIds`. Actors: an ordinary Documents operator (ops: documents.read, no health.view),
 * a Medical-authorized administrator, an out-of-scope operator, a cross-organization administrator, a portal member with
 * no document authority, and an anonymous caller.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySupabase } from "../harness/inMemorySupabase";
import { buildRequest, invokeRoute, routeParams } from "../harness/routeInvoker";

const { mockCtx, mockAccess, dbRef } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockAccess: vi.fn(),
    dbRef: { current: null as unknown },
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockCtx, getAdminContext: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContextCached: mockAccess, getAdminAccessContext: mockAccess };
});
// The in-memory database cannot evaluate the facts reader's validity `.or`; the facts are not under test here.
vi.mock("@/lib/health/healthFactCollectionResolver", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    resolveActiveHealthFacts: async () => [],
}));
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => dbRef.current,
    createServiceRoleClient: () => dbRef.current,
}));

import { PATCH as documentPATCH } from "@/app/api/admin/documents/[id]/route";
import { DELETE as posDocDELETE, PATCH as posDocPATCH } from "@/app/api/admin/pos/documents/[id]/route";
import { GET as submissionGET } from "@/app/api/admin/forms/submissions/[submissionId]/route";
import { disclosableDocumentIds, UNDISCLOSED_DOCUMENT_LABEL } from "@/lib/documents/documentMetadataDisclosure";
import { makeDefaultSourceDisplayResolverRegistry } from "@/lib/pos/processingCase/readModel/processingCaseReadModelDb";
import { redactPacketRollupDocuments } from "@/lib/forms/packets/redactPacketRollupDocuments";
import { buildHealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { GET as relatedGET } from "@/app/api/admin/related/[entity]/[id]/route";
import { GET as p076GET } from "@/app/api/admin/p076-first-order-prototype/route";
import { POST as generateDocumentPOST } from "@/app/api/admin/forms/submissions/[submissionId]/generate-document/route";
import { discloseFormDraftTextPreview } from "@/lib/documents/extractedTextDisclosure";
import { diagnosticReaderAllowed } from "@/lib/admin/diagnosticReaderAuthority";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const DEPT_1 = "d1000000-0000-4000-8000-000000000001";
const DEPT_2 = "d2000000-0000-4000-8000-000000000002";
const WU_1 = "a1000000-0000-4000-8000-000000000001";
const WU_2 = "a2000000-0000-4000-8000-000000000002";
const OPP_1 = "0b100000-0000-4000-8000-000000000001";
const OPP_2 = "0b200000-0000-4000-8000-000000000002";
const CHILD = "c1000000-0000-4000-8000-000000000001";
const SUB = "5b000000-0000-4000-8000-000000000001";
const VER = "5e000000-0000-4000-8000-000000000001";
const USER_ID = "05e00000-0000-4000-8000-000000000001";

const DOC = {
    immunization: "d0c00000-0000-4000-8000-000000000001",
    plain: "d0c00000-0000-4000-8000-000000000002",
    otherDept: "d0c00000-0000-4000-8000-000000000003",
    otherOrg: "d0c00000-0000-4000-8000-000000000004",
    quarantinedMedical: "d0c00000-0000-4000-8000-000000000005",
} as const;

function doc(id: string, over: Record<string, unknown>) {
    return {
        id, org_id: ORG_A, bucket: "org_documents", status: "uploaded", title: `title ${id.slice(-2)}`,
        original_filename: `file-${id.slice(-2)}.pdf`, doc_type: null, metadata: {}, created_at: "2026-10-20T00:00:00Z",
        legal_hold: false, retention_until: null, storage_path: `${ORG_A}/x/${id}.pdf`, ...over,
    };
}

function seededDb(): InMemorySupabase {
    const db = new InMemorySupabase();
    db.seed("work_units", [
        { id: WU_1, org_id: ORG_A, department_id: DEPT_1 },
        { id: WU_2, org_id: ORG_A, department_id: DEPT_2 },
    ]);
    db.seed("opportunities", [
        { id: OPP_1, org_id: ORG_A, work_unit_id: WU_1, location_id: null },
        { id: OPP_2, org_id: ORG_A, work_unit_id: WU_2, location_id: null },
    ]);
    db.seed("documents", [
        doc(DOC.immunization, { entity_type: "opportunity", entity_id: OPP_1, doc_type: "immunization_record", title: "Immunization record — Ava", original_filename: "Immunization_Record_Ava.pdf", sensitivity: "medical" }),
        doc(DOC.plain, { entity_type: "opportunity", entity_id: OPP_1, title: "Enrollment agreement", original_filename: "agreement.pdf" }),
        doc(DOC.otherDept, { entity_type: "opportunity", entity_id: OPP_2, title: "Other department", original_filename: "other.pdf" }),
        doc(DOC.otherOrg, { org_id: ORG_B, entity_type: "opportunity", entity_id: OPP_1, title: "Other tenant", original_filename: "tenant.pdf" }),
    ]);
    db.seed("child_safeguarding_restrictions", []);
    db.seed("form_submission_documents", []);
    return db;
}

type Persona = { orgId: string; role: "admin" | "ops"; roleKeys: string[]; permissionKeys: string[]; restricted?: boolean };
const ADMIN = ["documents.read", "documents.write", "processing.operate", "processing.documents.manage", "health.view", "health.manage"];
const P = {
    medicalAdmin: { orgId: ORG_A, role: "admin", roleKeys: ["admin"], permissionKeys: ADMIN },
    documentsOperator: { orgId: ORG_A, role: "ops", roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write", "processing.operate"] },
    processingManager: { orgId: ORG_A, role: "ops", roleKeys: ["intake_lead"], permissionKeys: ["documents.read", "processing.operate", "processing.documents.manage"] },
    noDocuments: { orgId: ORG_A, role: "ops", roleKeys: ["school_director"], permissionKeys: ["fin.read", "health.view"] },
    outOfScope: { orgId: ORG_A, role: "admin", roleKeys: ["admin"], permissionKeys: ADMIN, restricted: true },
    crossOrg: { orgId: ORG_B, role: "admin", roleKeys: ["admin"], permissionKeys: ADMIN },
} satisfies Record<string, Persona>;

function accessOf(p: Persona) {
    return {
        ok: true as const, userId: USER_ID, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: p.restricted ? "restricted" : "all", allowedDepartmentIds: p.restricted ? [DEPT_2] : null,
        siteScope: "all", allowedSiteLocationIds: null,
    };
}
function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: p.role, userId: USER_ID, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue(accessOf(p));
}
function anonymous() {
    mockCtx.mockResolvedValue({ ok: false, status: 401 });
    mockAccess.mockResolvedValue({ ok: false, status: 401 });
}
const actor = (p: Persona) => {
    const a = accessOf(p);
    return {
        roleKeys: a.roleKeys, permissionKeys: a.permissionKeys,
        scope: { departmentScope: a.departmentScope, allowedDepartmentIds: a.allowedDepartmentIds, siteScope: "all", allowedSiteLocationIds: null },
    } as never;
};

let db: InMemorySupabase;
beforeEach(() => {
    db = seededDb();
    dbRef.current = db;
    vi.clearAllMocks();
});

const ALL = [DOC.immunization, DOC.plain, DOC.otherDept, DOC.otherOrg];

describe("disclosableDocumentIds — admission ∧ scope ∧ sensitivity, fail closed", () => {
    it("a Medical-authorized administrator sees every document of their organization", async () => {
        expect([...(await disclosableDocumentIds(db as never, ORG_A, actor(P.medicalAdmin), ALL))].sort()).toEqual([DOC.immunization, DOC.plain, DOC.otherDept].sort());
    });
    it("an ordinary Documents operator (no health.view) does not see the medical document", async () => {
        const s = await disclosableDocumentIds(db as never, ORG_A, actor(P.documentsOperator), ALL);
        expect(s.has(DOC.immunization)).toBe(false);
        expect(s.has(DOC.plain)).toBe(true);
    });
    it("health.view without Documents admission sees nothing — both authorizations are required", async () => {
        expect((await disclosableDocumentIds(db as never, ORG_A, actor(P.noDocuments), ALL)).size).toBe(0);
    });
    it("an out-of-scope actor sees only its department's documents", async () => {
        const s = await disclosableDocumentIds(db as never, ORG_A, actor(P.outOfScope), ALL);
        expect([...s]).toEqual([DOC.otherDept]);
    });
    it("another organization's document is never disclosable; no actor sees nothing", async () => {
        expect((await disclosableDocumentIds(db as never, ORG_B, actor(P.crossOrg), [DOC.immunization, DOC.plain])).size).toBe(0);
        expect((await disclosableDocumentIds(db as never, ORG_A, null, ALL)).size).toBe(0);
    });
});

describe("Processing queue / case source labels", () => {
    const resolve = async (p: Persona | null) =>
        makeDefaultSourceDisplayResolverRegistry(db as never, ORG_A, p ? actor(p) : null).get("document")!([DOC.immunization, DOC.plain]);
    it("a Documents operator without health.view sees a neutral label, no file name, for the medical source", async () => {
        const out = await resolve(P.documentsOperator);
        expect(out.get(DOC.immunization)).toMatchObject({ label: UNDISCLOSED_DOCUMENT_LABEL, originalFilename: null });
        expect(JSON.stringify(out.get(DOC.immunization))).not.toContain("Ava");
        expect(out.get(DOC.plain)?.label).not.toBe(UNDISCLOSED_DOCUMENT_LABEL);
    });
    it("a Medical-authorized administrator sees the real label", async () => {
        expect((await resolve(P.medicalAdmin)).get(DOC.immunization)?.originalFilename).toBe("Immunization_Record_Ava.pdf");
    });
    it("no reader — every label neutral", async () => {
        const out = await resolve(null);
        expect([...out.values()].every((v) => v.label === UNDISCLOSED_DOCUMENT_LABEL)).toBe(true);
    });
});

describe("PATCH /api/admin/documents/[id] — full row back", () => {
    const patch = (id: string) => invokeRoute(documentPATCH, buildRequest({ method: "PATCH", path: `/api/admin/documents/${id}`, body: { status_key: "reviewed" } }), routeParams({ id }));
    it("a Documents writer without health.view gets 404 for a medical document, and nothing is changed", async () => {
        as(P.documentsOperator);
        const r = await patch(DOC.immunization);
        expect(r.status).toBe(404);
        expect(JSON.stringify(r.body)).not.toContain("Ava");
    });
    it("cross-organization: 404", async () => {
        as(P.crossOrg);
        expect((await patch(DOC.immunization)).status).toBe(404);
    });
    it("anonymous: 401", async () => {
        anonymous();
        expect((await patch(DOC.immunization)).status).toBe(401);
    });
});

describe("POS rename / delete — processing.documents.manage alone is not enough", () => {
    it("a Processing manager without health.view cannot rename or delete the medical document (404, title unchanged)", async () => {
        as(P.processingManager);
        const r = await invokeRoute(posDocPATCH, buildRequest({ method: "PATCH", path: "/x", body: { display_name: "renamed" } }), routeParams({ id: DOC.immunization }));
        expect(r.status).toBe(404);
        const d = await invokeRoute(posDocDELETE, buildRequest({ method: "DELETE", path: "/x" }), routeParams({ id: DOC.immunization }));
        expect(d.status).toBe(404);
        const rows = (db as unknown as { table(n: string): Array<Record<string, unknown>> }).table?.("documents");
        if (rows) expect(rows.find((x) => x.id === DOC.immunization)?.title).toBe("Immunization record — Ava");
    });
    it("the same manager may still rename an ordinary document", async () => {
        as(P.processingManager);
        const r = await invokeRoute(posDocPATCH, buildRequest({ method: "PATCH", path: "/x", body: { display_name: "renamed" } }), routeParams({ id: DOC.plain }));
        expect(r.status).toBe(200);
    });
    it("anonymous: 401", async () => {
        anonymous();
        const r = await invokeRoute(posDocPATCH, buildRequest({ method: "PATCH", path: "/x", body: { display_name: "x" } }), routeParams({ id: DOC.plain }));
        expect(r.status).toBe(401);
    });
});

describe("Form submission linked documents", () => {
    beforeEach(() => {
        db.seed("form_submissions", [{ id: SUB, org_id: ORG_A, form_definition_version_id: VER, form_definition_id: null, payload: {}, status: "submitted", created_via_public_link_id: null }]);
        db.seed("form_definition_versions", [{ id: VER, org_id: ORG_A, schema_json: { fields: [] } }]);
        db.seed("form_submission_documents", [
            { org_id: ORG_A, form_submission_id: SUB, document_id: DOC.immunization, role: "generated_pdf", created_at: "2026-10-20T00:00:00Z" },
            { org_id: ORG_A, form_submission_id: SUB, document_id: DOC.plain, role: "upload", created_at: "2026-10-20T00:00:01Z" },
        ]);
        (db as unknown as { rpc: unknown }).rpc = async () => ({ data: false, error: null });
    });
    const get = () => invokeRoute(submissionGET, buildRequest({ path: `/api/admin/forms/submissions/${SUB}` }), routeParams({ submissionId: SUB }));
    it("a Documents operator without health.view sees the medical PDF neutrally named", async () => {
        as(P.documentsOperator);
        const r = await get();
        expect(r.status).toBe(200);
        const linked = (r.body as { data?: { linked_documents: Array<{ document: { id: string; name: string | null; original_filename: string | null } }> } }).data?.linked_documents
            ?? (r.body as { linked_documents: Array<{ document: { id: string; name: string | null; original_filename: string | null } }> }).linked_documents;
        const med = linked.find((l) => l.document.id === DOC.immunization)!;
        expect(med.document).toMatchObject({ name: UNDISCLOSED_DOCUMENT_LABEL, original_filename: null });
        expect(linked.find((l) => l.document.id === DOC.plain)!.document.name).toBe("Enrollment agreement");
    });
    it("a Medical-authorized administrator sees the real name", async () => {
        as(P.medicalAdmin);
        const r = await get();
        expect(JSON.stringify(r.body)).toContain("Immunization record — Ava");
    });
});

describe("Packet review — generated document titles", () => {
    it("names only disclosable documents; ids, kinds and form names stay", () => {
        const rollup = {
            steps: [{ form_name: "Immunization form", artifact: { documents: [{ id: DOC.immunization, name: "Immunization record — Ava", generation_label: "current" }, { id: DOC.plain, name: "Agreement", generation_label: "current" }] } }],
            documents_index: [
                { kind: "generated_pdf", document_id: DOC.immunization, title: "Immunization record — Ava", form_name: "Immunization form" },
                { kind: "submitted_record", document_id: null, title: "Immunization form", form_name: "Immunization form" },
            ],
        } as unknown as PacketReviewRollupV1;
        const out = redactPacketRollupDocuments(rollup, new Set([DOC.plain]));
        expect(out.steps[0]!.artifact.documents.map((d) => d.name)).toEqual([UNDISCLOSED_DOCUMENT_LABEL, "Agreement"]);
        expect(out.documents_index.map((e) => e.title)).toEqual([UNDISCLOSED_DOCUMENT_LABEL, "Immunization form"]);
        expect(out.steps[0]!.artifact.documents[0]!.id).toBe(DOC.immunization);
    });
});

describe("Health card document list — Medical gate AND Documents gates", () => {
    beforeEach(() => {
        db.seed("documents", [
            doc(DOC.quarantinedMedical, { entity_type: "customer_member", entity_id: CHILD, doc_type: "immunization_record", status: "quarantined", sensitivity: "medical" }),
            doc("d0c00000-0000-4000-8000-000000000006", { entity_type: "customer_member", entity_id: CHILD, doc_type: "physical", title: "Physical — Ava", sensitivity: "medical" }),
        ]);
    });
    const card = (p: Persona | null, keys: string[]) =>
        buildHealthSafetyCardVM(db as never, { orgId: ORG_A, customerMemberId: CHILD, displayName: "Ava", access: { permissionKeys: keys }, documentActor: p ? actor(p) : null });
    it("health.view without Documents admission lists no documents", async () => {
        const vm = await card(P.noDocuments, ["health.view"]);
        expect(vm.permissionDenied ?? false).toBe(false);
        expect(vm.documents).toEqual([]);
    });
    it("a Medical-authorized administrator sees the child's available documents, never a quarantined one", async () => {
        const vm = await card({ ...P.medicalAdmin }, ADMIN);
        const ids = vm.documents.map((d) => d.documentId);
        expect(ids).toContain("d0c00000-0000-4000-8000-000000000006");
        expect(ids).not.toContain(DOC.quarantinedMedical);
    });
    it("without health.view the card itself is refused", async () => {
        const vm = await card(P.documentsOperator, ["documents.read"]);
        expect(vm.permissionDenied).toBe(true);
    });
});

describe("Related records — the document's own subject scope (EN-FI-01 security release)", () => {
    const CONTACT = "c0a00000-0000-4000-8000-000000000001";
    const MED = "d0c00000-0000-4000-8000-0000000000c1";
    const STD = "d0c00000-0000-4000-8000-0000000000c2";
    beforeEach(() => {
        db.seed("contacts", [{ id: CONTACT, org_id: ORG_A, customer_id: null, vendor_id: null }]);
        db.seed("documents", [
            doc(MED, { entity_type: "contact", entity_id: CONTACT, doc_type: "immunization_record", sensitivity: "medical", title: "Immunization — Ava" }),
            doc(STD, { entity_type: "contact", entity_id: CONTACT, title: "Photo release" }),
        ]);
    });
    const related = () => invokeRoute(relatedGET, buildRequest({ path: `/api/admin/related/contact/${CONTACT}` }), routeParams({ entity: "contact", id: CONTACT }));
    const ids = (r: { body: unknown }) => ((r.body as { documents?: Array<{ id: string }> }).documents ?? []).map((d) => d.id);
    it("a department-restricted reader gets none (a contact's documents have no department; scope fails closed)", async () => {
        as(P.outOfScope);
        const r = await related();
        expect(r.status).toBe(200);
        expect(ids(r)).toEqual([]);
    });
    it("a Documents operator sees the ordinary document, never the medical one", async () => {
        as(P.documentsOperator);
        const got = ids(await related());
        expect(got).toContain(STD);
        expect(got).not.toContain(MED);
    });
    it("a Medical-authorized administrator sees both", async () => {
        as(P.medicalAdmin);
        expect(ids(await related()).sort()).toEqual([MED, STD].sort());
    });
    it("health.view without Documents admission sees none; cross-organization sees none", async () => {
        as(P.noDocuments);
        expect(ids(await related())).toEqual([]);
        as(P.crossOrg);
        expect(ids(await related())).toEqual([]);
    });
});

describe("Processing form-draft OCR preview — scope as well as clearance", () => {
    const draft = () => ({ source_document_id: DOC.immunization, diagnostics: { extracted_text_preview: "MMR dose 1 2022-01-04" } });
    const preview = (p: Persona) => discloseFormDraftTextPreview(db as never, ORG_A, accessOf(p) as never, draft());
    it("a Medical-authorized administrator in scope reads it", async () => {
        expect((await preview(P.medicalAdmin)).diagnostics.extracted_text_preview).toContain("MMR");
    });
    it("out of scope, or without health.view, it is blanked", async () => {
        expect((await preview(P.outOfScope)).diagnostics.extracted_text_preview).toBe("");
        expect((await preview(P.documentsOperator)).diagnostics.extracted_text_preview).toBe("");
    });
    it("an actor without scope dimensions is refused (scope unknown is not scope granted)", async () => {
        const out = await discloseFormDraftTextPreview(db as never, ORG_A, { roleKeys: ["admin"], permissionKeys: ADMIN }, draft());
        expect(out.diagnostics.extracted_text_preview).toBe("");
    });
});

describe("p076 diagnostic — live on staging (ALLOY_ROUTE_TIMING=1): administrator, unrestricted, Documents AND Medical", () => {
    it("who may run it", () => {
        expect(diagnosticReaderAllowed(accessOf(P.medicalAdmin) as never)).toBe(true);
        expect(diagnosticReaderAllowed(accessOf(P.documentsOperator) as never)).toBe(false);
        expect(diagnosticReaderAllowed(accessOf(P.noDocuments) as never)).toBe(false);
        expect(diagnosticReaderAllowed(accessOf(P.processingManager) as never)).toBe(false);
        expect(diagnosticReaderAllowed(accessOf(P.outOfScope) as never)).toBe(false);
    });
    it("the route refuses everyone else before any read; with the flag off it does not exist", async () => {
        const prev = process.env.ALLOY_ROUTE_TIMING;
        try {
            process.env.ALLOY_ROUTE_TIMING = "1";
            as(P.documentsOperator);
            const spy = vi.spyOn(db, "from");
            const r = await invokeRoute(p076GET, buildRequest({ path: `/api/admin/p076-first-order-prototype?member_id=${OPP_1}` }));
            expect(r.status).toBe(403);
            expect(spy).not.toHaveBeenCalled();
            delete process.env.ALLOY_ROUTE_TIMING;
            expect((await invokeRoute(p076GET, buildRequest({ path: "/api/admin/p076-first-order-prototype" }))).status).toBe(404);
        } finally {
            if (prev === undefined) delete process.env.ALLOY_ROUTE_TIMING;
            else process.env.ALLOY_ROUTE_TIMING = prev;
        }
    });
});

describe("generate-document — the provenance reference must be this organization's document", () => {
    const post = (generated_from_document_id: string) =>
        invokeRoute(generateDocumentPOST, buildRequest({ method: "POST", path: "/x", body: { generated_from_document_id } }), routeParams({ submissionId: "5b000000-0000-4000-8000-000000000009" }));
    it("another organization's document id is refused before anything is generated", async () => {
        as({ ...P.medicalAdmin, permissionKeys: [...ADMIN, "forms.submissions"] });
        const r = await post(DOC.otherOrg);
        expect(r.status).toBe(400);
    });
    it("this organization's document passes the check (and the missing submission is then a 404)", async () => {
        as({ ...P.medicalAdmin, permissionKeys: [...ADMIN, "forms.submissions"] });
        expect((await post(DOC.plain)).status).toBe(404);
    });
});
