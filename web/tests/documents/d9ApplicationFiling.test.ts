/**
 * D9.2 — an application principal files a document through the SAME filing rules and transaction as staff (Q2).
 *
 * Synthetic: the two filing transactions are the in-memory stand-in the D5 suite uses, and the D9.1 external
 * visibility authority is substituted by a fixed visible set (its own suites prove the SQL authorities). What is proven:
 * the principal-specific decisions — only a document this installation received, visible subjects only, standard
 * sensitivity only, no pre-accepted review, NOT_FOUND for anything outside reach, NULL user actor with an audit that
 * names application / installation / credential — and that the staff path is untouched (documentsD5Filing.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySupabase } from "../harness/inMemorySupabase";

const vis = vi.hoisted(() => ({ subjects: new Set<string>(), documents: new Set<string>() }));
vi.mock("@/lib/documents/external/externalDocumentAuthority", async () => {
    const actual = await vi.importActual<typeof import("@/lib/documents/external/externalDocumentAuthority")>("@/lib/documents/external/externalDocumentAuthority");
    return {
        ...actual,
        subjectVisibility: () => ({ isVisible: async (s: { id: string }) => vis.subjects.has(s.id) }),
        listExternalDocuments: async (_db: unknown, _b: unknown, f: { documentId?: string }) => ({
            ok: true,
            rows: f.documentId && vis.documents.has(f.documentId) ? [{ id: f.documentId, sort_key: "x" }] : [],
        }),
    };
});
const dbRef = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => dbRef.current, createServiceRoleClient: () => dbRef.current }));

import { commitDocumentFilingAsApplication, commitDocumentFiling, type DocumentFilingRequest } from "@/lib/documents/filing/documentFiling";
import { raiseSensitivity } from "@/lib/documents/configuration/documentTypePolicy";

const ORG = "0a000000-0000-4000-8000-0000000000e2";
const INST = "1a000000-0000-4000-8000-0000000000e2";
const OTHER_INST = "1b000000-0000-4000-8000-0000000000e2";
const APP = "2a000000-0000-4000-8000-0000000000e2";
const CRED = "3a000000-0000-4000-8000-0000000000e2";
const H = "c0000000-0000-4000-8000-0000000000e1";
const H2 = "c0000000-0000-4000-8000-0000000000e2";
const C1 = "cb000000-0000-4000-8000-0000000000e1";
const C3 = "cb000000-0000-4000-8000-0000000000e3";
const HIDDEN = "cb000000-0000-4000-8000-0000000000e9";
const T = {
    enr: { id: "ce000000-0000-4000-8000-0000000000e2", v: "cf000000-0000-4000-8000-0000000000e2" },
    imm: { id: "ce000000-0000-4000-8000-0000000000e1", v: "cf000000-0000-4000-8000-0000000000e1" },
    cust: { id: "ce000000-0000-4000-8000-0000000000e3", v: "cf000000-0000-4000-8000-0000000000e3" },
};
const D = {
    mine: "d9000000-0000-4000-8000-0000000000e1",
    theirs: "d9000000-0000-4000-8000-0000000000e2",
    staff: "d9000000-0000-4000-8000-0000000000e3",
    quarantined: "d9000000-0000-4000-8000-0000000000e4",
};
const via = (inst: string) => ({ received_via: { kind: "api_v1", installation_id: inst } });

let db: InMemorySupabase;
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
const doc = (id: string, over: Record<string, unknown> = {}) => ({
    id, org_id: ORG, title: null, original_filename: "scan.pdf", mime_type: "application/pdf", byte_size: 4096, bucket: "org_documents",
    storage_path: `${ORG}/api_uploads/${id}.pdf`, status: "uploaded", sensitivity: "standard", doc_type: null, entity_type: null, entity_id: null,
    metadata: via(INST), created_at: "2026-11-03T00:00:00Z", current_version_id: `${id.slice(0, -2)}f${id.slice(-1)}`, ...over,
});

beforeEach(() => {
    rpcCalls = [];
    vis.subjects = new Set([C1, C3, H, H2]);
    vis.documents = new Set();
    db = new InMemorySupabase();
    db.seed("customers", [{ id: H, org_id: ORG, name: "A household" }, { id: H2, org_id: ORG, name: "Neighbours" }]);
    db.seed("customer_members", [
        { id: C1, org_id: ORG, customer_id: H, first_name: "Obi", last_name: "A", is_active: true },
        { id: C3, org_id: ORG, customer_id: H2, first_name: "Zed", last_name: "B", is_active: true },
        { id: HIDDEN, org_id: ORG, customer_id: H, first_name: "Hid", last_name: "A", is_active: true },
    ]);
    db.seed("document_types", [
        { id: T.enr.id, org_id: ORG, key: "enrollment_document", status: "active", published_version_id: T.enr.v },
        { id: T.imm.id, org_id: ORG, key: "immunization_record", status: "active", published_version_id: T.imm.v },
        { id: T.cust.id, org_id: ORG, key: "custody_order", status: "active", published_version_id: T.cust.v },
    ]);
    const ver = (t: { id: string; v: string }, over: Record<string, unknown>) => ({ id: t.v, org_id: ORG, document_type_id: t.id, version_number: 1, status: "published", validity_policy: { kind: "none" }, ...over });
    db.seed("document_type_versions", [
        ver(T.enr, { label: "Enrollment document", subject_types: ["child", "household"], allowed_formats: ["pdf"], default_sensitivity: "standard", review_required: false, replacement_policy: "new_document" }),
        ver(T.imm, { label: "Immunization record", subject_types: ["child"], allowed_formats: ["pdf"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version" }),
        ver(T.cust, { label: "Custody order", subject_types: ["child"], allowed_formats: ["pdf"], default_sensitivity: "custody_safeguarding", review_required: false, replacement_policy: "not_allowed" }),
    ]);
    db.seed("documents", [doc(D.mine), doc(D.theirs, { metadata: via(OTHER_INST) }), doc(D.staff, { metadata: {} }), doc(D.quarantined, { status: "quarantined" })]);
    (db as unknown as { rpc: unknown }).rpc = async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        if (fn !== "document_file") return { data: false, error: null };
        const d = db.rows("documents").find((r) => r.id === args.p_document_id && r.org_id === args.p_org_id)!;
        const filing = (d.metadata as Record<string, unknown>)?.filing as Record<string, unknown> | undefined;
        if (filing?.key === args.p_filing_key) return { data: { replay: true, document_id: d.id, filing }, error: null };
        if (filing) return { data: null, error: { message: "document_filing_already_filed: x" } };
        const v = db.rows("document_type_versions").find((x) => db.rows("document_types").some((t) => t.key === args.p_doc_type && t.published_version_id === x.id));
        d.doc_type = args.p_doc_type;
        d.sensitivity = raiseSensitivity(d.sensitivity as never, (v?.default_sensitivity ?? "standard") as never);
        const primary = { subject_type: args.p_primary_type, subject_id: args.p_primary_id };
        const f = { key: args.p_filing_key, mode: "new_document", doc_type: args.p_doc_type, primary, contexts: args.p_contexts, filed_by: args.p_actor };
        d.metadata = { ...(d.metadata as object), filing: f };
        vis.documents.add(String(d.id));
        return { data: { replay: false, document_id: d.id, version_id: d.current_version_id, doc_type: d.doc_type, sensitivity: d.sensitivity, filing: f }, error: null };
    };
    dbRef.current = db;
});

const ctx = { organizationId: ORG, installationId: INST, boundaryMode: "org_wide" as const, siteIds: [], principal: { applicationId: APP, installationId: INST, credentialId: CRED } };
const req = (over: Partial<DocumentFilingRequest> = {}): DocumentFilingRequest => ({
    documentId: D.mine, mode: "new_document", docType: "enrollment_document", primary: { subject_type: "child", subject_id: C1 }, contexts: [],
    reviewAccepted: false, filingKey: `ext:${INST}:key-0001`, ...over,
});
const file = (over: Partial<DocumentFilingRequest> = {}) => commitDocumentFilingAsApplication(db as never, ctx, req(over), "api/v1/documents/filing");
const events = (type: string) => db.rows("workflow_events").filter((e) => e.event_type === type);

describe("D9.2 application filing", () => {
    it("files a document this installation received: same transaction, NULL user actor, audit names the application", async () => {
        const r = await file();
        expect(r).toMatchObject({ ok: true, result: { replay: false, mode: "new_document", document_id: D.mine, doc_type: "enrollment_document", sensitivity: "standard" } });
        const call = rpcCalls.find((c) => c.fn === "document_file")!;
        expect(call.args).toMatchObject({ p_org_id: ORG, p_actor: null, p_review_status: null, p_sensitivity: null, p_case_id: null });
        for (const e of [...events("document_filing_authorized"), ...events("document_filed")]) {
            expect(e.payload).toMatchObject({ actor_user_id: null, actor_kind: "application", actor_application_id: APP, actor_installation_id: INST, actor_credential_id: CRED });
        }
        expect(events("document_filing_authorized")).toHaveLength(1);
    });

    it("a retry with the same key replays the committed result and writes nothing new", async () => {
        await file();
        const again = await file();
        expect(again).toMatchObject({ ok: true, result: { replay: true, document_id: D.mine } });
        expect(rpcCalls.filter((c) => c.fn === "document_file")).toHaveLength(1);
        expect(events("document_filed")).toHaveLength(1);
    });

    it("the same document with a different key → 409 ALREADY_FILED", async () => {
        await file();
        expect(await file({ filingKey: `ext:${INST}:key-0002` })).toMatchObject({ ok: false, status: 409, code: "ALREADY_FILED" });
    });

    it("another installation's upload, a staff upload, or a missing id → the same 404 NOT_FOUND, nothing written", async () => {
        for (const documentId of [D.theirs, D.staff, "d9000000-0000-4000-8000-0000000000ff"]) {
            expect(await file({ documentId })).toEqual({ ok: false, status: 404, code: "NOT_FOUND", message: "Not found.", problems: undefined });
        }
        expect(rpcCalls).toEqual([]);
        expect(events("document_filing_authorized")).toHaveLength(0);
    });

    it("a subject outside the installation's reach, or a non-external subject type → 404 NOT_FOUND (never SUBJECT_NOT_FOUND)", async () => {
        for (const primary of [{ subject_type: "child" as const, subject_id: HIDDEN }, { subject_type: "opportunity" as const, subject_id: C1 }]) {
            expect(await file({ primary })).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
        }
        expect(await file({ contexts: [{ subject_type: "child", subject_id: HIDDEN }] })).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
        expect(rpcCalls).toEqual([]);
    });

    it("a type whose resulting sensitivity is not standard → 422 TYPE_NOT_AVAILABLE_EXTERNALLY (medical, custody)", async () => {
        for (const docType of ["immunization_record", "custody_order"]) {
            expect(await file({ docType })).toMatchObject({ ok: false, status: 422, code: "TYPE_NOT_AVAILABLE_EXTERNALLY" });
        }
        expect(rpcCalls).toEqual([]);
    });

    it("never a pre-accepted review, a requested sensitivity or a processing case through the API", async () => {
        expect(await file({ reviewAccepted: true })).toMatchObject({ status: 422, code: "BAD_FILING" });
        expect(await file({ sensitivity: "medical" })).toMatchObject({ status: 422, code: "BAD_FILING" });
        expect(await file({ processingCaseId: "ca5e0000-0000-4000-8000-0000000000e1" })).toMatchObject({ status: 422, code: "BAD_FILING" });
        expect(rpcCalls).toEqual([]);
    });

    it("a quarantined upload of this installation → 409 DOCUMENT_QUARANTINED", async () => {
        expect(await file({ documentId: D.quarantined })).toMatchObject({ ok: false, status: 409, code: "DOCUMENT_QUARANTINED" });
    });

    it("shared filing rules still apply: a context outside the primary's household → SUBJECT_NOT_RELATED", async () => {
        const r = await file({ contexts: [{ subject_type: "child", subject_id: C3 }] });
        expect(r).toMatchObject({ ok: false, status: 422, code: "SUBJECT_NOT_RELATED" });
    });

    it("a staff actor cannot use the application's received document unless the access decision allows it (staff path unchanged)", async () => {
        const r = await commitDocumentFiling(db as never, { ok: false, failureStatus: 401, scope: null }, req(), "admin");
        expect(r).toMatchObject({ ok: false, status: 401, code: "UNAUTHENTICATED" });
    });
});
