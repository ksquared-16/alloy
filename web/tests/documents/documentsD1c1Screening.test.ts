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

describe("Q2 / W2: a release honours the malware verdict store", () => {
    const V1 = "ea000000-0000-4000-8000-0000000000c1";
    const V2 = "ea000000-0000-4000-8000-0000000000c2";
    let verdicts: Record<string, string | null>;
    let verdictError: boolean;
    let verdictCalls: Array<Record<string, unknown>>;

    /** A quarantined document with two versions (V2 current); `document_malware_effective_verdict` answers from `verdicts`. */
    async function quarantinedWithVersions(metadata: Record<string, unknown> = {}) {
        as(P.admin);
        const id = docId((await upload(jsPdf(), "scripted.pdf", "application/pdf")).body);
        const row = db.rows("documents").find((d) => d.id === id)!;
        row.current_version_id = V2;
        row.metadata = { ...(row.metadata as object), screening: { ...((row.metadata as { screening?: object }).screening ?? {}), ...metadata } };
        db.seed("document_versions", [
            { id: V1, org_id: ORG, document_id: id, version_number: 1 },
            { id: V2, org_id: ORG, document_id: id, version_number: 2 },
            // Another organization's version of the same id is never asked about.
            { id: "ea000000-0000-4000-8000-0000000000cf", org_id: OTHER_ORG, document_id: id, version_number: 1 },
        ]);
        return id;
    }
    beforeEach(() => {
        verdicts = {};
        verdictError = false;
        verdictCalls = [];
        const base = (db as unknown as { rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> }).rpc;
        (db as unknown as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown> = {}) => {
            if (name !== "document_malware_effective_verdict") return base(name, args);
            verdictCalls.push(args);
            if (verdictError) return { data: null, error: { message: "permission denied" } };
            const v = verdicts[String(args.p_version_id)] ?? null;
            return { data: v ? [{ verdict_id: "f0000000-0000-4000-8000-0000000000c1", verdict: v, document_id: "x", version_id: args.p_version_id, checksum_sha256: "0".repeat(64) }] : [], error: null };
        };
    });
    const released = (id: string) => db.rows("workflow_events").some((e) => e.event_type === "document_released" && e.entity_id === id);
    const status = (id: string) => db.rows("documents").find((d) => d.id === id)!.status;
    const REASON = "Reviewed the findings with the family";

    it("an unsafe verdict on ANY version → 409 MALWARE_UNSAFE, no audit, still quarantined", async () => {
        for (const unsafe of ["infected", "suspicious"]) {
            const id = await quarantinedWithVersions();
            verdicts = { [V1]: unsafe, [V2]: "clean" };
            const r = await release(id, { action: "release", reason: REASON });
            expect(r).toMatchObject({ status: 409, body: { code: "MALWARE_UNSAFE" } });
            expect(released(id)).toBe(false);
            expect(status(id)).toBe("quarantined");
        }
        expect(verdictCalls.every((a) => a.p_org_id === ORG)).toBe(true);
        expect(verdictCalls.map((a) => a.p_version_id)).not.toContain("ea000000-0000-4000-8000-0000000000cf");
    });

    it("held for a verdict: the current version must be clean (pending / failed → 409 MALWARE_SCAN_PENDING)", async () => {
        for (const current of [null, "failed"]) {
            const id = await quarantinedWithVersions({ malware_hold: "awaiting_verdict" });
            verdicts = { [V1]: "clean", [V2]: current };
            expect(await release(id, { action: "release", reason: REASON })).toMatchObject({ status: 409, body: { code: "MALWARE_SCAN_PENDING" } });
            expect(released(id)).toBe(false);
            expect(status(id)).toBe("quarantined");
        }
        const id = await quarantinedWithVersions({ malware_hold: "awaiting_verdict" });
        verdicts = { [V2]: "clean" };
        expect((await release(id, { action: "release", reason: REASON })).status).toBe(200);
        expect(status(id)).toBe("uploaded");
    });

    it("no verdicts, or clean / failed without a hold → the existing release", async () => {
        for (const v of [{}, { [V1]: "failed", [V2]: "clean" }] as Array<Record<string, string | null>>) {
            const id = await quarantinedWithVersions();
            verdicts = v;
            expect((await release(id, { action: "release", reason: REASON })).status).toBe(200);
            expect(released(id)).toBe(true);
            expect(status(id)).toBe("uploaded");
        }
    });

    it("verdicts that cannot be read refuse the release (fail closed), before the audit", async () => {
        const id = await quarantinedWithVersions();
        verdictError = true;
        expect(await release(id, { action: "release", reason: REASON })).toMatchObject({ status: 503, body: { code: "MALWARE_VERDICT_UNAVAILABLE" } });
        expect(released(id)).toBe(false);
        expect(status(id)).toBe("quarantined");
    });

    it("the database guard's refusals (race backstop) map to the same 409s", async () => {
        for (const [message, code] of [["document_malware_unsafe", "MALWARE_UNSAFE"], ["document_malware_scan_pending", "MALWARE_SCAN_PENDING"]]) {
            const id = await quarantinedWithVersions();
            const realFrom = db.from.bind(db);
            (db as unknown as { from: unknown }).from = (table: string) => {
                const b = realFrom(table);
                if (table !== "documents") return b;
                const failing = { eq: () => failing, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "23514", message } }).then(ok) };
                (b as unknown as { update: unknown }).update = () => failing;
                return b;
            };
            expect(await release(id, { action: "release", reason: REASON })).toMatchObject({ status: 409, body: { code } });
            (db as unknown as { from: unknown }).from = realFrom;
            expect(status(id)).toBe("quarantined");
        }
    });
});
