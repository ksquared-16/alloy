/**
 * D1c-1 through the real routes: screening at ingestion, quarantine unavailability, the review queue and release.
 *
 * As in the D1a/D1b suites, handlers and every authorization helper run unmodified; only the session and the service-role
 * client are substituted, and the in-memory client evaluates each query's real filters. The audit writer is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

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

import { POST as uploadPOST } from "@/app/api/admin/documents/upload/route";
import { GET as signedUrlGET } from "@/app/api/admin/documents/[id]/signed-url/route";
import { GET as documentsListGET } from "@/app/api/admin/documents/route";
import { GET as posListGET } from "@/app/api/admin/pos/documents/route";
import { GET as queueGET } from "@/app/api/admin/documents/screening/route";
import { POST as releasePOST } from "@/app/api/admin/documents/[id]/screening/route";
import { POST as vendorApplicationPOST } from "@/app/api/vendor-application/route";
import { downloadDocumentBytesSafe } from "@/lib/pos/processingCase/structure/documentBytes";

const ORG = "0a000000-0000-4000-8000-0000000000c1";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000c1";
const CUSTOMER = "c0000000-0000-4000-8000-0000000000c1";
const USER = "05e00000-0000-4000-8000-0000000000c1";

type Persona = { orgId: string; role: "admin" | "ops"; roleKeys: string[]; permissionKeys: string[] };
const ADMIN_KEYS = ["documents.read", "documents.write", "processing.operate", "processing.documents.manage", "health.view"];
const P = {
    admin: { orgId: ORG, role: "admin", roleKeys: ["admin"], permissionKeys: ADMIN_KEYS },
    reader: { orgId: ORG, role: "ops", roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    ocr: { orgId: ORG, role: "ops", roleKeys: ["qa_ocr"], permissionKeys: ["portal.access", "documents.read", "processing.operate"] },
    otherOrgAdmin: { orgId: OTHER_ORG, role: "admin", roleKeys: ["admin"], permissionKeys: ADMIN_KEYS },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: p.role, userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;
beforeEach(() => {
    db = new InMemorySupabase();
    db.seed("customers", [{ id: CUSTOMER, org_id: ORG, name: "Household" }]);
    (db as unknown as { rpc: unknown }).rpc = async (name: string) =>
        name === "consume_rate_limit"
            ? { data: [{ allowed: true, current_count: 1, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null }
            : { data: false, error: null };
    dbRef.current = db;
    vi.clearAllMocks();
});

async function cleanPdf() {
    const d = await PDFDocument.create();
    d.addPage([100, 100]);
    return d.save();
}
const jsPdf = () =>
    new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));
const corruptPng = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3]);

function upload(bytes: Uint8Array, name: string, type: string) {
    const form = new FormData();
    form.set("entity_type", "customer");
    form.set("entity_id", CUSTOMER);
    form.set("file", new File([bytes as unknown as BlobPart], name, { type }));
    return invokeRoute(uploadPOST, new NextRequest("http://localhost/api/admin/documents/upload", { method: "POST", body: form }));
}
const docId = (body: unknown) => ((body as { document?: { id?: string } }).document?.id ?? "") as string;
const signedUrl = (id: string) => invokeRoute(signedUrlGET, buildRequest({ path: `/api/admin/documents/${id}/signed-url` }), routeParams({ id }));
const release = (id: string, body: Record<string, unknown>) =>
    invokeRoute(releasePOST, buildRequest({ method: "POST", path: `/api/admin/documents/${id}/screening`, body }), routeParams({ id }));
const listIds = async (route: typeof documentsListGET | typeof posListGET, key: "id" | "documentId") =>
    (((await invokeRoute(route, buildRequest({ path: "/x" }))).body as { documents?: Array<Record<string, string>> }).documents ?? []).map((d) => d[key]);

describe("positive controls", () => {
    it("a clean PDF is stored available, with a clean screening record", async () => {
        as(P.admin);
        const res = await upload(await cleanPdf(), "clean.pdf", "application/pdf");
        expect(res.status).toBe(200);
        const row = db.rows("documents").find((d) => d.id === docId(res.body))!;
        expect(row.status).toBe("uploaded");
        expect((row.metadata as { screening?: { verdict?: string } }).screening?.verdict).toBe("clean");
        expect((await signedUrl(row.id as string)).status).toBe(200);
    });
});

describe("unsafe structure is quarantined, and a quarantined document is unreachable", () => {
    it("is stored quarantined, never extracted, audited, and refused everywhere", async () => {
        as(P.admin);
        const res = await upload(jsPdf(), "scripted.pdf", "application/pdf");
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ screening: { verdict: "quarantine", reason: "active_content" }, processing_case_id: null });
        const id = docId(res.body);
        const row = db.rows("documents").find((d) => d.id === id)!;
        expect(row.status).toBe("quarantined");
        expect(row.extracted_text ?? null).toBeNull();
        expect(db.rows("workflow_events").some((e) => e.event_type === "document_quarantined" && e.entity_id === id)).toBe(true);

        for (const p of [P.admin, P.reader]) {
            as(p);
            const s = await signedUrl(id);
            expect(s.status).toBe(403);
            expect(s.body).toMatchObject({ code: "DOCUMENT_RESTRICTED" });
            expect(await listIds(documentsListGET, "id")).not.toContain(id);
        }
        as(P.admin);
        expect(await listIds(posListGET, "documentId")).not.toContain(id);
        expect(await downloadDocumentBytesSafe(db as never, { orgId: ORG, documentId: id })).toBeNull();
        expect(db.signCalls).toHaveLength(0);
    });
});

describe("invalid content is refused and nothing is stored", () => {
    it("a corrupted image", async () => {
        as(P.admin);
        const res = await upload(corruptPng(), "broken.png", "image/png");
        expect(res.status).toBe(415);
        expect(res.body).toMatchObject({ code: "SCREENING_REFUSED", reason: "corrupt" });
        expect(db.uploadCalls).toHaveLength(0);
        expect(db.rows("documents")).toHaveLength(0);
    });

    it("bytes that are not the declared format", async () => {
        as(P.admin);
        const res = await upload(corruptPng(), "photo.pdf", "application/pdf");
        expect(res.status).toBe(415);
        expect(db.uploadCalls).toHaveLength(0);
    });

    it("a public vendor application with a corrupted file stores nothing", async () => {
        process.env.ALLOY_PUBLIC_ORG_ID = ORG;
        const form = new FormData();
        for (const [k, v] of Object.entries({ first_name: "Q", last_name: "A", email: "qa@example.com", phone: "5550000000", consent_contractor_agreement: "true", consent_legal: "true" })) form.set(k, v);
        form.append("vertical_ids[]", "v1");
        form.set("proof_of_insurance", new File([corruptPng() as unknown as BlobPart], "ins.png", { type: "image/png" }));
        form.set("drivers_license", new File([corruptPng() as unknown as BlobPart], "dl.png", { type: "image/png" }));
        const res = await invokeRoute(vendorApplicationPOST, new NextRequest("http://localhost/api/vendor-application", { method: "POST", body: form }));
        expect(res.status).toBe(415);
        expect(res.body).toMatchObject({ code: "SCREENING_REFUSED" });
        expect(db.rows("vendors")).toHaveLength(0);
        expect(db.uploadCalls).toHaveLength(0);
    });
});

describe("review queue and release", () => {
    async function quarantined() {
        as(P.admin);
        return docId((await upload(jsPdf(), "scripted.pdf", "application/pdf")).body);
    }

    it("the queue lists it for a reviewer, and refuses a non-reviewer", async () => {
        const id = await quarantined();
        as(P.admin);
        const q = await invokeRoute(queueGET, buildRequest({ path: "/api/admin/documents/screening" }));
        expect(q.status).toBe(200);
        expect((q.body as { documents: Array<{ id: string; screening: { reason: string } }> }).documents).toEqual([
            expect.objectContaining({ id, screening: expect.objectContaining({ reason: "active_content" }) }),
        ]);
        for (const p of [P.reader, P.ocr]) {
            as(p);
            expect((await invokeRoute(queueGET, buildRequest({ path: "/api/admin/documents/screening" }))).status).toBe(403);
        }
    });

    it("an unauthorized release is refused; another organization cannot see it", async () => {
        const id = await quarantined();
        as(P.reader);
        expect((await release(id, { action: "release", reason: "looked at the findings" })).status).toBe(403);
        as(P.otherOrgAdmin);
        expect((await release(id, { action: "release", reason: "looked at the findings" })).status).toBe(404);
        expect(db.rows("documents").find((d) => d.id === id)!.status).toBe("quarantined");
    });

    it("a release needs a reason, is audited first, and makes the document available", async () => {
        const id = await quarantined();
        as(P.admin);
        expect((await release(id, { action: "release" })).status).toBe(400);
        const ok = await release(id, { action: "release", reason: "Fillable school form; script is a date formatter" });
        expect(ok.status).toBe(200);
        const row = db.rows("documents").find((d) => d.id === id)!;
        expect(row.status).toBe("uploaded");
        expect((row.metadata as { screening: { release: { reason: string } } }).screening.release.reason).toContain("date formatter");
        expect(db.rows("workflow_events").some((e) => e.event_type === "document_released" && e.entity_id === id)).toBe(true);
        expect((await signedUrl(id)).status).toBe(200);
        expect((await release(id, { action: "release", reason: "again, for no reason" })).status).toBe(409);
    });

    it("no audit, no release", async () => {
        const id = await quarantined();
        as(P.admin);
        db.failInsertInto.add("workflow_events");
        const r = await release(id, { action: "release", reason: "reviewed the findings" });
        expect(r.status).toBe(503);
        expect(db.rows("documents").find((d) => d.id === id)!.status).toBe("quarantined");
    });
});
