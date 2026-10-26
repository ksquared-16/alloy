/**
 * D5 — Processing document filing, through the real routes.
 *
 * Processing → Work → Documents (queue, workspace, proposal) and the case approval that FILES through the Documents
 * command, plus the Studio policy enforced on the operator upload and the replacement route. Handlers, the filing
 * service, the Processing service and every authorization helper run unmodified; the session and the service-role
 * client are substituted. The two filing transactions (`document_file`, `document_file_as_version`) are SQL: their
 * policy, replay and atomicity are certified on Postgres by `certification/documents-v1/d5-filing-invariants.sql`.
 * Here the RPC is a stand-in that performs the same writes, so the layers ABOVE it — authorization, audit-before-effect,
 * case transitions, retry and disclosure — are what these tests prove.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET as queueGET } from "@/app/api/admin/processing/documents/queue/route";
import { GET as workspaceGET, PUT as proposalPUT } from "@/app/api/admin/processing/cases/[caseId]/document-filing/route";
import { POST as approvePOST } from "@/app/api/admin/processing/cases/[caseId]/approve/route";
import { POST as uploadPOST } from "@/app/api/admin/documents/upload/route";
import { POST as versionsPOST } from "@/app/api/admin/documents/[id]/versions/route";
import { GET as historyGET } from "@/app/api/admin/documents/[id]/history/route";
import { commitDocumentFiling } from "@/lib/documents/filing/documentFiling";
import { disposeDocumentsOfDeletedSubjects } from "@/lib/documents/documentDisposal";
import { documentActorForRequest } from "@/lib/documents/assertDocumentAccess";
import type { DocumentFilingQueueRow, DocumentFilingWorkspace } from "@/lib/pos/documentFiling/documentFilingService";
import { deriveDocumentFilingLane, EMPTY_PROPOSAL, isFilingIntent, processingFilingKey } from "@/lib/pos/documentFiling/documentFilingModel";
import { raiseSensitivity } from "@/lib/documents/configuration/documentTypePolicy";

const ORG = "0a000000-0000-4000-8000-0000000000d5";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d5";
const USER = "05e00000-0000-4000-8000-0000000000d5";
const DEPT = "de000000-0000-4000-8000-0000000000d5";
const H = "c0000000-0000-4000-8000-0000000000d1";
const H2 = "c0000000-0000-4000-8000-0000000000d2";
const P1 = "9e000000-0000-4000-8000-0000000000d1";
const C1 = "cb000000-0000-4000-8000-0000000000d1";
const C2 = "cb000000-0000-4000-8000-0000000000d2";
const C3 = "cb000000-0000-4000-8000-0000000000d3";
const OPP = "0e000000-0000-4000-8000-0000000000d1";
const CAT_HEALTH = "ca000000-0000-4000-8000-0000000000d1";
const CAT_ENR = "ca000000-0000-4000-8000-0000000000d2";

const T = {
    imm: { id: "ce000000-0000-4000-8000-0000000000d1", v: "cf000000-0000-4000-8000-0000000000d1" },
    enr: { id: "ce000000-0000-4000-8000-0000000000d2", v: "cf000000-0000-4000-8000-0000000000d2" },
    cust: { id: "ce000000-0000-4000-8000-0000000000d3", v: "cf000000-0000-4000-8000-0000000000d3" },
    old: { id: "ce000000-0000-4000-8000-0000000000d4", v: "cf000000-0000-4000-8000-0000000000d4" },
};
const D = {
    intake: "d5000000-0000-4000-8000-000000000001",
    quarantined: "d5000000-0000-4000-8000-000000000002",
    text: "d5000000-0000-4000-8000-000000000003",
    existingImm: "d5000000-0000-4000-8000-000000000004",
    secondImm: "d5000000-0000-4000-8000-000000000005",
    template: "d5000000-0000-4000-8000-000000000006",
    existingCustody: "d5000000-0000-4000-8000-000000000007",
    secondCustody: "d5000000-0000-4000-8000-000000000008",
    otherOrg: "d5000000-0000-4000-8000-000000000009",
};
const CASE = {
    intake: "ca5e0000-0000-4000-8000-000000000001",
    quarantined: "ca5e0000-0000-4000-8000-000000000002",
    text: "ca5e0000-0000-4000-8000-000000000003",
    secondImm: "ca5e0000-0000-4000-8000-000000000005",
    template: "ca5e0000-0000-4000-8000-000000000006",
    secondCustody: "ca5e0000-0000-4000-8000-000000000008",
    otherOrg: "ca5e0000-0000-4000-8000-000000000009",
};

type Persona = { orgId: string; roleKeys: string[]; permissionKeys: string[]; departmentScope?: "all" | "restricted"; allowedDepartmentIds?: string[] | null };
const FULL = ["documents.read", "documents.write", "processing.operate", "health.view", "documents.identity.read"];
const P = {
    admin: { orgId: ORG, roleKeys: ["admin"], permissionKeys: [...FULL, "safeguarding.view"] },
    noHealth: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write", "processing.operate"] },
    noWrite: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["documents.read", "processing.operate", "health.view"] },
    noProcessing: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write", "health.view"] },
    scoped: { orgId: ORG, roleKeys: ["ops"], permissionKeys: FULL, departmentScope: "restricted", allowedDepartmentIds: [DEPT] },
    otherOrg: { orgId: OTHER_ORG, roleKeys: ["admin"], permissionKeys: FULL },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: "admin", userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: p.departmentScope ?? "all", allowedDepartmentIds: p.allowedDepartmentIds ?? null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
let rpcFailure: { fn: string; message: string } | null;

const doc = (id: string, over: Record<string, unknown> = {}) => ({
    id, org_id: ORG, title: `Doc ${id.slice(-2)}`, original_filename: `scan-${id.slice(-2)}.pdf`, mime_type: "application/pdf", byte_size: 4096,
    bucket: "org_documents", storage_path: `${ORG}/pos_intake/${id}.pdf`, status: "uploaded", sensitivity: "standard", doc_type: null,
    entity_type: null, entity_id: null, metadata: {}, created_at: "2026-10-20T10:00:00Z", current_version_id: `${id.slice(0, -2)}f${id.slice(-1)}`, ...over,
});
const docCase = (id: string, documentId: string, metadata: Record<string, unknown> = { processing_intent: "store_document" }, org = ORG) => ({
    caseRow: { id, org_id: org, status: "received", case_type: "document", created_at: "2026-10-20T10:00:00Z", status_changed_at: "2026-10-20T10:00:00Z", metadata },
    source: { id: `${id}-s`, org_id: org, processing_case_id: id, source_kind: "document", source_id: documentId, role: "primary" },
});

/** The stand-in for the two SQL filing transactions: the same writes, replay on the key, unavailable refused. */
function rpc(fn: string, args: Record<string, unknown>) {
    rpcCalls.push({ fn, args });
    if (rpcFailure && rpcFailure.fn === fn) return { data: null, error: { message: rpcFailure.message } };
    const docs = db.rows("documents");
    if (fn === "document_file") {
        const d = docs.find((r) => r.id === args.p_document_id && r.org_id === args.p_org_id);
        if (!d) return { data: null, error: { message: "document_not_found" } };
        const filing = (d.metadata as Record<string, unknown>)?.filing as Record<string, unknown> | undefined;
        if (filing?.key === args.p_filing_key) return { data: { replay: true, document_id: d.id, filing }, error: null };
        if (["deleted", "quarantined", "restricted", "superseded"].includes(String(d.status))) return { data: null, error: { message: "document_filing_unavailable: x" } };
        if (filing) return { data: null, error: { message: "document_filing_already_filed: x" } };
        const v = db.rows("document_type_versions").find((x) => db.rows("document_types").some((t) => t.key === args.p_doc_type && t.published_version_id === x.id));
        d.doc_type = args.p_doc_type;
        d.sensitivity = raiseSensitivity(raiseSensitivity(d.sensitivity as never, (v?.default_sensitivity ?? "standard") as never), (args.p_sensitivity ?? "standard") as never);
        const primary = { subject_type: args.p_primary_type, subject_id: args.p_primary_id };
        db.seed("document_subjects", [{ org_id: ORG, document_id: d.id, ...primary, association: "owner", is_primary: true, source: "governed", ended_at: null }]);
        for (const c of (args.p_contexts as Array<Record<string, unknown>>) ?? []) {
            db.seed("document_subjects", [{ org_id: ORG, document_id: d.id, ...c, association: "context", is_primary: false, source: "governed", ended_at: null }]);
        }
        d.entity_type = { child: "customer_member", household: "customer", person: "person", opportunity: "opportunity" }[String(args.p_primary_type)];
        d.entity_id = args.p_primary_id;
        const f = { key: args.p_filing_key, mode: "new_document", doc_type: args.p_doc_type, primary, contexts: args.p_contexts, review_status: args.p_review_status, audit_event_id: args.p_audit_event_id };
        d.metadata = { ...(d.metadata as object), filing: f };
        return { data: { replay: false, document_id: d.id, version_id: d.current_version_id, doc_type: d.doc_type, sensitivity: d.sensitivity, filing: f }, error: null };
    }
    if (fn === "document_file_as_version") {
        const d = docs.find((r) => r.id === args.p_document_id);
        const target = docs.find((r) => r.id === args.p_target_document_id);
        if (!d || !target) return { data: null, error: { message: "document_not_found" } };
        const filing = (d.metadata as Record<string, unknown>)?.filing as Record<string, unknown> | undefined;
        if (filing?.key === args.p_filing_key) return { data: { replay: true, document_id: d.id, version_id: filing?.version_id, filing }, error: null };
        const versionId = "e5000000-0000-4000-8000-0000000000ff";
        db.seed("document_versions", [{ id: versionId, org_id: ORG, document_id: target.id, version_number: 2, storage_path: args.p_storage_path, bucket: args.p_bucket, source: "replacement" }]);
        const owner = db.rows("document_subjects").find((s) => s.document_id === target.id && s.is_primary);
        const f = { key: args.p_filing_key, mode: "new_version", target_document_id: target.id, version_id: versionId, version_number: 2, primary: { subject_type: owner?.subject_type, subject_id: owner?.subject_id } };
        d.status = "superseded";
        d.metadata = { ...(d.metadata as object), filing: f };
        return { data: { replay: false, document_id: d.id, target_document_id: target.id, version_id: versionId, version_number: 2, filing: f }, error: null };
    }
    return { data: false, error: null };
}

beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls = [];
    rpcFailure = null;
    db = new InMemorySupabase();
    db.seed("work_units", [{ id: "a0000000-0000-4000-8000-0000000000d5", org_id: ORG, department_id: DEPT }]);
    db.seed("customers", [{ id: H, org_id: ORG, name: "Okafor household" }, { id: H2, org_id: ORG, name: "Neighbours" }]);
    db.seed("customer_persons", [{ org_id: ORG, customer_id: H, person_id: P1, role_type: "parent", is_primary: true, status: "active", end_date: null, persons: { id: P1, first_name: "Ada", last_name: "Okafor" } }]);
    db.seed("persons", [{ id: P1, org_id: ORG }]);
    db.seed("customer_members", [
        { id: C1, org_id: ORG, customer_id: H, first_name: "Obi", last_name: "Okafor", is_active: true },
        { id: C2, org_id: ORG, customer_id: H, first_name: "Ife", last_name: "Okafor", is_active: true },
        { id: C3, org_id: ORG, customer_id: H2, first_name: "Zed", last_name: "Neighbour", is_active: true },
    ]);
    db.seed("opportunities", [{ id: OPP, org_id: ORG, customer_id: H, title: "Fall enrollment", work_unit_id: "a0000000-0000-4000-8000-0000000000d5", created_at: "2026-10-01T00:00:00Z" }]);
    db.seed("document_categories", [
        { id: CAT_HEALTH, org_id: ORG, key: "health", label: "Health & medical", status: "active" },
        { id: CAT_ENR, org_id: ORG, key: "enrollment", label: "Enrollment", status: "active" },
    ]);
    db.seed("document_types", [
        { id: T.imm.id, org_id: ORG, key: "immunization_record", status: "active", published_version_id: T.imm.v },
        { id: T.enr.id, org_id: ORG, key: "enrollment_document", status: "active", published_version_id: T.enr.v },
        { id: T.cust.id, org_id: ORG, key: "custody_order", status: "active", published_version_id: T.cust.v },
        { id: T.old.id, org_id: ORG, key: "retired_form", status: "archived", published_version_id: T.old.v },
    ]);
    const ver = (t: { id: string; v: string }, over: Record<string, unknown>) => ({ id: t.v, org_id: ORG, document_type_id: t.id, version_number: 1, status: "published", validity_policy: { kind: "none" }, ...over });
    db.seed("document_type_versions", [
        ver(T.imm, { label: "Immunization record", category_id: CAT_HEALTH, subject_types: ["child"], allowed_formats: ["pdf", "png", "jpeg"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version" }),
        ver(T.enr, { label: "Enrollment document", category_id: CAT_ENR, subject_types: ["child", "household", "opportunity"], allowed_formats: ["pdf", "png", "jpeg", "docx"], default_sensitivity: "standard", review_required: false, replacement_policy: "new_document" }),
        ver(T.cust, { label: "Custody order", category_id: CAT_HEALTH, subject_types: ["child"], allowed_formats: ["pdf"], default_sensitivity: "custody_safeguarding", review_required: false, replacement_policy: "not_allowed" }),
        ver(T.old, { label: "Retired form", category_id: CAT_ENR, subject_types: ["child", "household"], allowed_formats: ["pdf"], default_sensitivity: "standard", review_required: false, replacement_policy: "new_document" }),
    ]);
    db.seed("documents", [
        doc(D.intake, { title: "Scan from front desk" }),
        doc(D.quarantined, { status: "quarantined" }),
        doc(D.text, { mime_type: "text/plain", storage_path: `${ORG}/pos_intake/${D.text}.txt` }),
        doc(D.existingImm, { doc_type: "immunization_record", sensitivity: "medical", entity_type: "customer_member", entity_id: C1, storage_path: `${ORG}/customer_member/${C1}/imm.pdf`, metadata: { filing: { key: "earlier" } } }),
        doc(D.secondImm),
        doc(D.template, { title: "Blank enrollment form" }),
        doc(D.existingCustody, { doc_type: "custody_order", sensitivity: "custody_safeguarding", entity_type: "customer_member", entity_id: C1 }),
        doc(D.secondCustody),
        doc(D.otherOrg, { org_id: OTHER_ORG }),
    ]);
    db.seed("document_subjects", [
        { org_id: ORG, document_id: D.existingImm, subject_type: "child", subject_id: C1, association: "owner", is_primary: true, ended_at: null },
        { org_id: ORG, document_id: D.existingCustody, subject_type: "child", subject_id: C1, association: "owner", is_primary: true, ended_at: null },
    ]);
    for (const id of Object.values(D)) db.putObject("org_documents", (db.rows("documents").find((d) => d.id === id)!.storage_path as string), "pdf-bytes");
    const cases = [
        docCase(CASE.intake, D.intake, { processing_intent: "store_document", classification: { classification_key: "enrollment_document", confidence: 0.62, status: "classified" } }),
        docCase(CASE.quarantined, D.quarantined),
        docCase(CASE.text, D.text),
        docCase(CASE.secondImm, D.secondImm, { processing_intent: "process_information", classification: { classification_key: "immunization_record", confidence: 0.8, status: "classified" } }),
        docCase(CASE.template, D.template, { processing_intent: "generate_form" }),
        docCase(CASE.secondCustody, D.secondCustody),
        docCase(CASE.otherOrg, D.otherOrg, { processing_intent: "store_document" }, OTHER_ORG),
    ];
    db.seed("processing_cases", cases.map((c) => c.caseRow));
    db.seed("processing_case_sources", cases.map((c) => c.source));
    (db as unknown as { rpc: unknown }).rpc = async (fn: string, args: Record<string, unknown>) => rpc(fn, args);
    dbRef.current = db;
});

const queue = async () => invokeRoute(queueGET, buildRequest({ path: "/api/admin/processing/documents/queue" }));
const rowsOf = (res: { body: unknown }) => (res.body as { rows: DocumentFilingQueueRow[] }).rows;
const workspace = async (caseId: string, household?: string) =>
    invokeRoute(workspaceGET, buildRequest({ path: `/api/admin/processing/cases/${caseId}/document-filing`, query: household ? { household_id: household } : undefined }), routeParams({ caseId }));
const wsOf = (res: { body: unknown }) => (res.body as { workspace: DocumentFilingWorkspace }).workspace;
const propose = async (caseId: string, proposal: Record<string, unknown>) =>
    invokeRoute(proposalPUT, buildRequest({ method: "PUT", path: `/api/admin/processing/cases/${caseId}/document-filing`, body: { proposal } }), routeParams({ caseId }));
const approve = async (caseId: string) => invokeRoute(approvePOST, buildRequest({ method: "POST", path: `/api/admin/processing/cases/${caseId}/approve` }), routeParams({ caseId }));
const caseRow = (id: string) => db.rows("processing_cases").find((c) => c.id === id)!;
const events = (type: string) => db.rows("workflow_events").filter((e) => e.event_type === type);
const subjectsOf = (id: string) => db.rows("document_subjects").filter((s) => s.document_id === id && !s.ended_at);
const child = (id: string) => ({ subject_type: "child", subject_id: id });

describe("D5.1 the Documents work queue is derived from the Processing case spine", () => {
    it("lists customer-document cases with lane, proposal, suggestion and required action; form templates and other orgs are absent", async () => {
        as(P.admin);
        const res = await queue();
        expect(res.status).toBe(200);
        const rows = rowsOf(res);
        const ids = rows.map((r) => r.case_id);
        expect(ids).toEqual(expect.arrayContaining([CASE.intake, CASE.text, CASE.secondImm, CASE.secondCustody]));
        expect(ids).not.toContain(CASE.template); // generate_form, no proposal
        expect(ids).not.toContain(CASE.otherOrg);
        expect(ids).not.toContain(CASE.quarantined); // undisclosed: a quarantined document is not readable
        const intake = rows.find((r) => r.case_id === CASE.intake)!;
        expect(intake).toMatchObject({
            document_id: D.intake,
            title: "Scan from front desk",
            lane: "unclassified",
            required_action: "Choose the document type",
            proposed_type: null,
            suggested_type: { key: "enrollment_document", label: "Enrollment document", confidence: 0.62 },
            proposed_subject: null,
            uncertainty: { classification: "suggested", subject: "unresolved" },
        });
        expect(db.rows("processing_cases").length).toBe(7); // the read persisted nothing
    });

    it("needs processing.operate and documents.read; a document the actor may not read is not listed", async () => {
        as(P.noProcessing);
        expect((await queue()).status).toBe(403);
        // A medical document is withheld from an actor without health.view.
        as(P.admin);
        expect((await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C2) })).status).toBe(200);
        rpc("document_file", { p_org_id: ORG, p_document_id: D.secondImm, p_doc_type: "immunization_record", p_primary_type: "child", p_primary_id: C2, p_contexts: [], p_filing_key: "x".repeat(10) });
        db.rows("documents").find((d) => d.id === D.secondImm)!.metadata = {}; // classified medical, not yet filed
        as(P.noHealth);
        expect(rowsOf(await queue()).map((r) => r.case_id)).not.toContain(CASE.secondImm);
    });

    it("lanes follow the proposal: unclassified → needs a record → needs review → ready; errors and filed are their own lanes", () => {
        const lane = (proposal: Partial<typeof EMPTY_PROPOSAL>, publishedType: { review_required: boolean } | null, filed = false) =>
            deriveDocumentFilingLane({ caseStatus: "received", filed, proposal: { ...EMPTY_PROPOSAL, ...proposal }, publishedType });
        expect(lane({}, null)).toBe("unclassified");
        expect(lane({ doc_type: "x" }, { review_required: true })).toBe("awaiting_subject");
        expect(lane({ doc_type: "x", primary: { subject_type: "child", subject_id: C1 } }, { review_required: true })).toBe("awaiting_review");
        expect(lane({ doc_type: "x", primary: { subject_type: "child", subject_id: C1 }, review_accepted: true }, { review_required: true })).toBe("ready");
        expect(lane({ doc_type: "x", last_error: { code: "E", message: "m", at: "" } }, null)).toBe("filing_error");
        expect(lane({}, null, true)).toBe("filed");
        expect(isFilingIntent("generate_form", false)).toBe(false);
        expect(isFilingIntent("generate_form", true)).toBe(true);
        expect(isFilingIntent("store_document", false)).toBe(true);
    });
});

describe("D5.2/D5.3 classification and record selection", () => {
    it("the workspace offers the published catalog with its policy and the classifier's suggestion as a proposal only", async () => {
        as(P.admin);
        const ws = wsOf(await workspace(CASE.intake));
        expect(ws.catalog.map((t) => t.key).sort()).toEqual(["custody_order", "enrollment_document", "immunization_record"]); // archived type absent
        const imm = ws.catalog.find((t) => t.key === "immunization_record")!;
        expect(imm).toMatchObject({ category_label: "Health & medical", subject_types: ["child"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version" });
        expect(ws.suggested_type).toMatchObject({ key: "enrollment_document", confidence: 0.62 });
        expect(ws.proposal.doc_type).toBeNull(); // a suggestion never classifies
        expect(ws.household).toBeNull(); // nothing is matched from names or emails
        expect(ws.lane).toBe("unclassified");
    });

    it("a record is chosen from a household graph the operator can see; members are labelled by the server", async () => {
        as(P.admin);
        const ws = wsOf(await workspace(CASE.intake, H));
        expect(ws.household?.members.map((m) => `${m.subject_type}:${m.subject_id}`)).toEqual([`household:${H}`, `person:${P1}`, `child:${C1}`, `child:${C2}`, `opportunity:${OPP}`]);
        const saved = await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: { ...child(C1), label: "spoofed" }, contexts: [{ subject_type: "household", subject_id: H }, { subject_type: "opportunity", subject_id: OPP }] });
        expect(saved.status).toBe(200);
        const p = (saved.body as { proposal: { primary: { label: string }; contexts: unknown[] } }).proposal;
        expect(p.primary.label).toBe("Obi Okafor");
        expect(p.contexts).toHaveLength(2);
    });

    it("refuses a record outside the chosen household (a neighbour's child) and a household out of scope, as not found", async () => {
        as(P.admin);
        expect((await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C3) })).status).toBe(404);
        expect((await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1), contexts: [child(C3)] })).status).toBe(404);
        as(P.scoped);
        // Household/person/child subjects are unrestricted-scope only; the intake document itself is out of scope too.
        expect((await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) })).status).toBe(404);
        expect((await workspace(CASE.intake)).status).toBe(404);
    });
});

describe("D5.4 the canonical filing command, through the case approval", () => {
    it("files: audit first, one filing transaction, the case completed only after the commit, then the committed activity", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1), contexts: [{ subject_type: "household", subject_id: H }] });
        const res = await approve(CASE.intake);
        expect(res.status).toBe(200);
        const data = (res.body as { data: { status: string; operationalResult: Record<string, unknown> } }).data;
        expect(data.status).toBe("completed");
        expect(data.operationalResult).toMatchObject({ kind: "document_filed", filed_document_id: D.intake, mode: "new_document", doc_type: "enrollment_document", primary: { subject_type: "child", subject_id: C1, label: "Obi Okafor" } });
        const call = rpcCalls.find((c) => c.fn === "document_file")!;
        expect(call.args).toMatchObject({ p_org_id: ORG, p_document_id: D.intake, p_doc_type: "enrollment_document", p_primary_type: "child", p_primary_id: C1, p_filing_key: processingFilingKey(CASE.intake, D.intake), p_case_id: CASE.intake, p_actor: USER });
        expect(subjectsOf(D.intake).map((s) => `${s.association}:${s.subject_type}`).sort()).toEqual(["context:household", "owner:child"]);
        const authorized = events("document_filing_authorized");
        const filed = events("document_filed");
        expect(authorized).toHaveLength(1);
        expect(filed).toHaveLength(1);
        expect(db.rows("workflow_events").indexOf(authorized[0])).toBeLessThan(db.rows("workflow_events").indexOf(filed[0]));
        expect(JSON.stringify(authorized[0])).not.toContain("pos_intake"); // never the storage path
        expect(call.args.p_audit_event_id).toBe(authorized[0].id); // the filing record names the audited attempt
        expect(caseRow(CASE.intake).status).toBe("completed");
        // The queue shows it as filed; a second approval is a no-op on the completed case.
        expect(rowsOf(await queue()).find((r) => r.case_id === CASE.intake)?.lane).toBe("filed");
        const again = await approve(CASE.intake);
        expect((again.body as { data: { alreadyDone: boolean } }).data.alreadyDone).toBe(true);
        expect(rpcCalls.filter((c) => c.fn === "document_file")).toHaveLength(1);
    });

    it("a retry of a committed filing replays from the record: no second transaction, no new audit", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        // The filing committed but completing the case failed (simulated: the case is still open).
        const actor = documentActorForRequest(await mockCtx(), await mockAccess());
        const req = { documentId: D.intake, mode: "new_document" as const, docType: "enrollment_document", primary: { subject_type: "child" as const, subject_id: C1 }, contexts: [], reviewAccepted: false, filingKey: processingFilingKey(CASE.intake, D.intake), processingCaseId: CASE.intake };
        expect((await commitDocumentFiling(db as never, actor, req)).ok).toBe(true);
        const before = db.rows("workflow_events").length;
        const res = await approve(CASE.intake);
        expect(res.status).toBe(200);
        expect((res.body as { data: { operationalResult: { replay: boolean } } }).data.operationalResult.replay).toBe(true);
        expect(rpcCalls.filter((c) => c.fn === "document_file")).toHaveLength(1);
        expect(db.rows("workflow_events").length).toBe(before);
        expect(subjectsOf(D.intake)).toHaveLength(1);
        expect(caseRow(CASE.intake).status).toBe("completed");
    });

    it("a refused filing leaves the case open in Filing errors; correcting the proposal and retrying files it", async () => {
        as(P.admin);
        await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C2) });
        const refused = await approve(CASE.secondImm);
        expect(refused.status).toBe(409);
        expect((refused.body as { code: string }).code).toBe("REVIEW_REQUIRED");
        expect(caseRow(CASE.secondImm).status).toBe("received");
        expect(rpcCalls.some((c) => c.fn === "document_file")).toBe(false);
        expect(events("document_filed")).toHaveLength(0); // a refusal is never a completed action
        expect(rowsOf(await queue()).find((r) => r.case_id === CASE.secondImm)).toMatchObject({ lane: "filing_error", last_error: { code: "REVIEW_REQUIRED" } });
        await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C2), review_accepted: true });
        expect(rowsOf(await queue()).find((r) => r.case_id === CASE.secondImm)?.lane).toBe("ready");
        const ok = await approve(CASE.secondImm);
        expect(ok.status).toBe(200);
        expect(rpcCalls.find((c) => c.fn === "document_file")!.args.p_review_status).toBe("accepted");
        expect(db.rows("documents").find((d) => d.id === D.secondImm)!.sensitivity).toBe("medical"); // raised by the type
    });

    it("a failed commit does not complete the case, and records the error", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        rpcFailure = { fn: "document_file", message: "could not serialize access" };
        const res = await approve(CASE.intake);
        expect(res.status).toBe(500);
        expect(caseRow(CASE.intake).status).toBe("received");
        expect((caseRow(CASE.intake).metadata as { document_filing: { last_error: { code: string } } }).document_filing.last_error.code).toBe("FILING_FAILED");
        expect(events("document_filed")).toHaveLength(0);
        rpcFailure = null;
        expect((await approve(CASE.intake)).status).toBe(200);
    });

    it("refuses with 503 and writes nothing when the filing cannot be audited", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        db.failInsertInto.add("workflow_events");
        const res = await approve(CASE.intake);
        expect(res.status).toBe(503);
        expect(rpcCalls.some((c) => c.fn === "document_file")).toBe(false);
        expect(caseRow(CASE.intake).status).toBe("received");
    });

    it("a form-template document keeps its routed handoff (not filed, honestly labelled)", async () => {
        as(P.admin);
        const res = await approve(CASE.template);
        expect(res.status).toBe(200);
        expect((res.body as { data: { operationalResult: { kind: string } } }).data.operationalResult.kind).toBe("routed");
        expect(rpcCalls.some((c) => c.fn === "document_file")).toBe(false);
    });
});

describe("D5.6 activity: a filing is committed activity; a refused attempt never reads as done", () => {
    const history = async (id: string) =>
        ((await invokeRoute(historyGET, buildRequest({ path: `/api/admin/documents/${id}/history` }), routeParams({ id }))).body as { entries: Array<{ kind: string; action: string }> }).entries;

    it("shows the refused attempt as not filed, then the committed filing from the record", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        rpcFailure = { fn: "document_file", message: "could not serialize access" };
        await approve(CASE.intake);
        let entries = await history(D.intake);
        expect(entries.filter((e) => e.kind === "refused").map((e) => e.action)).toEqual(["Filing attempted — not filed"]);
        expect(entries.some((e) => e.action === "Filed from Processing")).toBe(false);
        rpcFailure = null;
        // The stand-in writes no filed_at; the SQL does (now()).
        await approve(CASE.intake);
        const d = db.rows("documents").find((r) => r.id === D.intake)!;
        (d.metadata as { filing: Record<string, unknown> }).filing.filed_at = "2026-10-26T12:00:00Z";
        entries = await history(D.intake);
        expect(entries.find((e) => e.action === "Filed from Processing")?.kind).toBe("committed");
        // The successful attempt's audit is matched to the record; only the earlier, failed attempt remains refused.
        expect(entries.filter((e) => e.kind === "refused")).toHaveLength(1);
    });
});

describe("D5.5 Studio policy is enforced at filing", () => {
    it("new version vs new logical document: a second immunization record becomes version 2 of the existing one", async () => {
        as(P.admin);
        await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C1), review_accepted: true });
        const ws = wsOf(await workspace(CASE.secondImm));
        expect(ws.preview?.problems.map((p) => p.code)).toContain("NEW_VERSION_REQUIRED");
        expect(ws.preview?.existing_of_type.map((d) => d.id)).toEqual([D.existingImm]);
        expect((await approve(CASE.secondImm)).status).toBe(409);
        await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C1), review_accepted: true, mode: "new_version", target_document_id: D.existingImm });
        const res = await approve(CASE.secondImm);
        expect(res.status).toBe(200);
        expect((res.body as { data: { operationalResult: Record<string, unknown> } }).data.operationalResult).toMatchObject({ mode: "new_version", filed_document_id: D.existingImm, version_number: 2 });
        // One copy into the version store (one object per version); the received document is kept as provenance.
        expect(db.copyCalls).toEqual([{ bucket: "org_documents", from: `${ORG}/pos_intake/${D.secondImm}.pdf`, to: expect.stringMatching(new RegExp(`^${ORG}/filed/${D.existingImm}/${D.secondImm}-`)) }]);
        expect(db.rows("documents").find((d) => d.id === D.secondImm)!.status).toBe("superseded");
        expect(db.removeCalls).toHaveLength(0);
        expect(db.rows("documents").filter((d) => d.doc_type === "immunization_record" && d.status !== "superseded")).toHaveLength(1);
    });

    it("not_allowed: a record that holds a custody order cannot take a second one", async () => {
        as(P.admin);
        await propose(CASE.secondCustody, { doc_type: "custody_order", household_id: H, primary: child(C1) });
        const res = await approve(CASE.secondCustody);
        expect(res.status).toBe(409);
        expect((res.body as { code: string }).code).toBe("TYPE_REPLACEMENT_NOT_ALLOWED");
        expect(rpcCalls.some((c) => c.fn.startsWith("document_file"))).toBe(false);
    });

    it("subject type and format: a type that does not apply to the record, or a format it does not allow, is refused", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "immunization_record", household_id: H, primary: { subject_type: "household", subject_id: H }, review_accepted: true });
        const a = await approve(CASE.intake);
        expect(a.status).toBe(422);
        expect((a.body as { code: string }).code).toBe("TYPE_SUBJECT_NOT_APPLICABLE");
        await propose(CASE.text, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        const b = await approve(CASE.text);
        expect((b.body as { code: string }).code).toBe("TYPE_FORMAT_NOT_ALLOWED");
        expect(rpcCalls.some((c) => c.fn === "document_file")).toBe(false);
    });

    it("the database is the last line: its refusal maps to a stable code and leaves the case open", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        rpcFailure = { fn: "document_file", message: "document_filing_context_unrelated: child x is not related" };
        const res = await approve(CASE.intake);
        expect(res.status).toBe(422);
        expect((res.body as { code: string }).code).toBe("SUBJECT_NOT_RELATED");
        expect(caseRow(CASE.intake).status).toBe("received");
    });
});

describe("D5.7 security: authorization is decided again at commit", () => {
    it("quarantine: the workspace says so, the approval refuses, nothing is written", async () => {
        as(P.admin);
        expect(wsOf(await workspace(CASE.quarantined)).blocked?.code).toBe("DOCUMENT_QUARANTINED");
        await (db.from("processing_cases").update({ metadata: { processing_intent: "store_document", document_filing: { doc_type: "enrollment_document", primary: child(C1) } } }).eq("id", CASE.quarantined));
        const res = await approve(CASE.quarantined);
        expect(res.status).toBe(409);
        expect((res.body as { code: string }).code).toBe("DOCUMENT_QUARANTINED");
        expect(subjectsOf(D.quarantined)).toHaveLength(0);
        expect(caseRow(CASE.quarantined).status).toBe("received");
    });

    it("Processing access to the case is not destination authority: no documents.write, no filing", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        as(P.noWrite);
        const res = await approve(CASE.intake);
        expect(res.status).toBe(403);
        expect((res.body as { code: string }).code).toBe("DOCUMENTS_WRITE_REQUIRED");
        expect(caseRow(CASE.intake).status).toBe("received");
        as(P.noProcessing);
        expect((await approve(CASE.intake)).status).toBe(403);
        expect((await workspace(CASE.intake)).status).toBe(403);
    });

    it("clearance for the class the document WILL have: no health.view, no filing of a medical type", async () => {
        as(P.admin);
        await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C2), review_accepted: true });
        as(P.noHealth);
        const res = await approve(CASE.secondImm);
        expect(res.status).toBe(403);
        expect((res.body as { code: string }).code).toBe("SENSITIVITY_CLEARANCE_REQUIRED");
        expect(rpcCalls.some((c) => c.fn === "document_file")).toBe(false);
    });

    it("a scope-restricted operator cannot file to a household subject, and learns nothing (404)", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        as(P.scoped);
        const res = await approve(CASE.intake);
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain("Okafor");
        expect(caseRow(CASE.intake).status).toBe("received");
    });

    it("cross-organization: another organization's case, document and subjects are not found", async () => {
        as(P.otherOrg);
        expect((await workspace(CASE.intake)).status).toBe(404);
        expect((await approve(CASE.intake)).status).toBe(404);
        expect(rowsOf(await queue()).map((r) => r.case_id)).not.toContain(CASE.intake);
        // Filing the other org's own document to THIS org's child is refused by the service (subject not visible).
        const actor = documentActorForRequest(await mockCtx(), await mockAccess());
        const r = await commitDocumentFiling(db as never, actor, { documentId: D.otherOrg, mode: "new_document", docType: "enrollment_document", primary: { subject_type: "child", subject_id: C1 }, contexts: [], reviewAccepted: false, filingKey: "cross-org-key" });
        expect(r.ok).toBe(false);
        expect(rpcCalls.some((c) => c.fn === "document_file")).toBe(false);
    });

    it("a raise is honoured and never lowers; the actor must hold the raised class's clearance", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1), sensitivity: "personal_identity" });
        expect(wsOf(await workspace(CASE.intake)).preview?.resulting_sensitivity).toBe("personal_identity");
        await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C2), review_accepted: true, sensitivity: "standard" });
        expect(wsOf(await workspace(CASE.secondImm)).preview?.resulting_sensitivity).toBe("medical");
        as(P.noHealth);
        // noHealth also lacks documents.identity.read: a personal_identity filing is refused.
        expect(((await approve(CASE.intake)).body as { code: string }).code).toBe("SENSITIVITY_CLEARANCE_REQUIRED");
    });
});

describe("D5.5 the same policy on the operator upload and the replacement route", () => {
    async function pdf() {
        const d = await PDFDocument.create();
        d.addPage([100, 100]);
        return d.save();
    }
    const upload = (bytes: Uint8Array, name: string, type: string, fields: Record<string, string>) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.set(k, v);
        form.set("file", new File([bytes as unknown as BlobPart], name, { type }));
        return invokeRoute(uploadPOST, new NextRequest("http://localhost/api/admin/documents/upload", { method: "POST", body: form }));
    };

    it("refuses a type that does not apply to the subject, a format the type does not allow, and an archived type — before storing", async () => {
        as(P.admin);
        const bytes = await pdf();
        const wrongSubject = await upload(bytes, "imm.pdf", "application/pdf", { entity_type: "person", entity_id: P1, doc_type: "immunization_record" });
        expect(wrongSubject.status).toBe(422);
        expect((wrongSubject.body as { code: string }).code).toBe("TYPE_SUBJECT_NOT_APPLICABLE");
        const wrongFormat = await upload(new TextEncoder().encode("plain text"), "a.txt", "text/plain", { entity_type: "customer_member", entity_id: C1, doc_type: "custody_order" });
        expect((wrongFormat.body as { code: string }).code).toBe("TYPE_FORMAT_NOT_ALLOWED");
        const archived = await upload(bytes, "r.pdf", "application/pdf", { entity_type: "customer", entity_id: H, doc_type: "retired_form" });
        expect((archived.body as { code: string }).code).toBe("TYPE_UNAVAILABLE");
        expect(db.uploadCalls).toHaveLength(0);
        expect(events("document_upload_authorized")).toHaveLength(0);
    });

    it("accepts a published type that fits (review-required starts pending) and an uncatalogued legacy label", async () => {
        as(P.admin);
        const bytes = await pdf();
        const ok = await upload(bytes, "imm.pdf", "application/pdf", { entity_type: "customer_member", entity_id: C2, doc_type: "immunization_record" });
        expect(ok.status).toBe(200);
        expect(rpcCalls.some((c) => c.fn === "document_version_require_review")).toBe(true);
        const legacy = await upload(bytes, "x.pdf", "application/pdf", { entity_type: "customer", entity_id: H, doc_type: "other" });
        expect(legacy.status).toBe(200);
    });

    it("a not_allowed type takes no replacement version", async () => {
        as(P.admin);
        const form = new FormData();
        form.set("reason", "A newer court order was received");
        form.set("file", new File([(await pdf()) as unknown as BlobPart], "c.pdf", { type: "application/pdf" }));
        const res = await invokeRoute(
            versionsPOST,
            new NextRequest(`http://localhost/api/admin/documents/${D.existingCustody}/versions`, { method: "POST", body: form }),
            routeParams({ id: D.existingCustody }),
        );
        expect(res.status).toBe(409);
        expect((res.body as { code: string }).code).toBe("TYPE_REPLACEMENT_NOT_ALLOWED");
        expect(db.uploadCalls).toHaveLength(0);
    });
});

describe("D5 lifecycle: deleting the family disposes of what was filed to it", () => {
    const dispose = (documentIds: string[]) =>
        disposeDocumentsOfDeletedSubjects(db as never, { orgId: ORG, actorUserId: USER, documentIds, deletedSubjectIds: [OPP, H, P1, C1, C2], route: "admin/opportunities/delete" });

    it("a filed document goes with its subject, and so does its own completed filing case (it names the family)", async () => {
        as(P.admin);
        await propose(CASE.intake, { doc_type: "enrollment_document", household_id: H, primary: child(C1) });
        expect((await approve(CASE.intake)).status).toBe(200);
        const out = await dispose([D.intake]);
        expect(out).toEqual([expect.objectContaining({ documentId: D.intake, outcome: "deleted" })]);
        expect(db.rows("documents").some((d) => d.id === D.intake)).toBe(false);
        expect(db.rows("processing_cases").some((c) => c.id === CASE.intake)).toBe(false);
        expect(db.rows("processing_case_sources").some((s) => s.processing_case_id === CASE.intake)).toBe(false); // no dangling source
        expect(events("document_delete_authorized").at(-1)?.payload).toMatchObject({ processing_case_ids: [CASE.intake] });
    });

    it("an open Processing case still retains its document", async () => {
        as(P.admin);
        db.rows("documents").find((d) => d.id === D.secondCustody)!.entity_type = "customer_member";
        db.rows("documents").find((d) => d.id === D.secondCustody)!.entity_id = C1;
        const out = await dispose([D.secondCustody]);
        expect(out).toEqual([{ documentId: D.secondCustody, outcome: "retained", reasons: ["processing_case_source"] }]);
        expect(db.rows("processing_cases").some((c) => c.id === CASE.secondCustody)).toBe(true);
    });

    it("a received document filed as a version goes with the document it became a version of", async () => {
        as(P.admin);
        await propose(CASE.secondImm, { doc_type: "immunization_record", household_id: H, primary: child(C1), review_accepted: true, mode: "new_version", target_document_id: D.existingImm });
        expect((await approve(CASE.secondImm)).status).toBe(200);
        const out = await dispose([D.existingImm]);
        expect(out.map((d) => `${d.documentId}:${d.outcome}`).sort()).toEqual([`${D.existingImm}:deleted`, `${D.secondImm}:deleted`].sort());
        expect(db.rows("processing_cases").some((c) => c.id === CASE.secondImm)).toBe(false);
        expect(db.removeCalls.flatMap((r) => r.paths)).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`/filed/${D.existingImm}/`)), `${ORG}/pos_intake/${D.secondImm}.pdf`]));
    });
});

describe("source locks", () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
    it("a storage copy happens only in the Documents filing command", () => {
        const { execSync } = require("node:child_process") as typeof import("node:child_process");
        const hits = execSync("grep -rlE '\\.storage\\s*\\.\\s*from\\([^)]*\\)\\s*\\.\\s*copy\\(' app lib || true", { cwd: process.cwd(), encoding: "utf8" })
            .split("\n")
            .filter(Boolean);
        expect(hits).toEqual(["lib/documents/filing/documentFiling.ts"]);
    });
    it("Processing never writes a document association or a document row for filing", () => {
        const src = read("lib/pos/documentFiling/documentFilingService.ts");
        expect(src).not.toMatch(/from\("document_subjects"\)\s*\.\s*(insert|update|upsert|delete)/);
        expect(src).not.toMatch(/from\("documents"\)\s*\.\s*(insert|update|upsert|delete)/);
        expect(src).not.toMatch(/rpc\("document_/);
    });
    it("the approve route files a customer document before completing it", () => {
        const src = read("app/api/admin/processing/cases/[caseId]/approve/route.ts");
        expect(src.indexOf("fileDocumentCase(")).toBeGreaterThan(-1);
        expect(src.indexOf("fileDocumentCase(")).toBeLessThan(src.indexOf("runMinimalDestinationHandoff(supabase"));
    });
});
