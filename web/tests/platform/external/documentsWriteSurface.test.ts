/**
 * D9.2 — the `/api/v1` document write surface, through the real routes (user-ratified 2026-11-03, Q1–Q8).
 *
 * Synthetic: the in-memory service client, the D9.1 SQL readers emulated as in documentsResource.test.ts, and an
 * in-memory stand-in for the `document_file` / link transactions. Credential resolution, rate limiting, activity and
 * the boundary resolver are substituted exactly as for the read suite. NOT proven here: the SQL transactions, storage
 * policies and the deployed runtime (hosted proof D9-H2).
 */
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { InMemorySupabase } from "../../harness/inMemorySupabase";

const { dbRef, principalRef, sitesRef, emitted } = vi.hoisted(() => ({
    dbRef: { current: null as unknown },
    principalRef: { current: null as null | Record<string, unknown> },
    sitesRef: { current: [] as string[] },
    emitted: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => dbRef.current }));
vi.mock("@/lib/platform/external/externalRequest", () => ({
    requireExternalPrincipal: async () => {
        const p = principalRef.current;
        if (!p) return { ok: false, refusal: "invalid_credential" };
        return { ok: true, context: { requestId: "req", principal: p, tokenId: "tok", applicationId: p.applicationId, installationId: p.installationId, organizationId: p.orgId, scopes: p.grantedScopes, resourceBoundary: p.boundary } };
    },
}));
vi.mock("@/lib/platform/external/rateLimit", async (orig) => ({
    ...(await orig<typeof import("@/lib/platform/external/rateLimit")>()),
    consumeRateLimit: async () => ({ allowed: true, limit: 120, remaining: 119, resetSeconds: 60 }),
}));
vi.mock("@/lib/platform/principal/attendanceAuthorityAdapter", async (orig) => ({
    ...(await orig<typeof import("@/lib/platform/principal/attendanceAuthorityAdapter")>()),
    resolveBoundarySites: async () => ({ ok: true, siteIds: [...sitesRef.current] }),
}));
vi.mock("@/lib/platform/external/apiActivity", async (orig) => ({ ...(await orig<typeof import("@/lib/platform/external/apiActivity")>()), recordApiActivity: async () => undefined }));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: async (e: Record<string, unknown>) => { emitted.push(e); return `evt-${emitted.length}`; } }));

import { POST as createUpload } from "@/app/api/v1/document-uploads/route";
import { POST as sendContent } from "@/app/api/v1/document-uploads/content/route";
import { POST as fileDoc } from "@/app/api/v1/document-filings/route";
import { POST as link } from "@/app/api/v1/document-subjects/route";
import { POST as unlink } from "@/app/api/v1/document-subjects/unlink/route";
import { GET as listDocuments } from "@/app/api/v1/documents/route";
import {
    API_DOCUMENT_UPLOAD_MAX_BYTES,
    completeDocumentUpload,
    signUploadId,
    sweepAbandonedApiUploads,
    sweepAbandonedApiUploadsAcrossOrgs,
    uploadDocumentId,
    uploadSigningSecret,
} from "@/lib/documents/external/externalDocumentWrites";

const ORG = "0a000000-0000-4000-8000-0000000000b9";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000b9";
const SITE = "51000000-0000-4000-8000-0000000000b9";
const C_IN = "cb000000-0000-4000-8000-0000000000b1";
const C_SIB = "cb000000-0000-4000-8000-0000000000b3";
const C_OUT = "cb000000-0000-4000-8000-0000000000b2";
const H_IN = "c0000000-0000-4000-8000-0000000000b1";
const T = { enr: { id: "ce000000-0000-4000-8000-0000000000b2", v: "cf000000-0000-4000-8000-0000000000b2" }, imm: { id: "ce000000-0000-4000-8000-0000000000b1", v: "cf000000-0000-4000-8000-0000000000b1" } };
const VISIBLE_CHILDREN = new Set([C_IN, C_SIB]);
const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const PDF = enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const PDF2 = enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R /X 1 >>\n%%EOF\n");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let db: InMemorySupabase;
const principal = (over: Record<string, unknown> = {}) => ({
    kind: "application", applicationId: "app-1", applicationSlug: "partner", ownershipMode: "partner_managed", environment: "production",
    installationId: "inst-1", orgId: ORG, producerKey: "pk", credentialId: "cred-1", clientId: "client-1",
    grantedScopes: ["documents.write", "documents.read"], boundary: { mode: "locations", locationIds: [SITE] }, ...over,
});

beforeEach(() => {
    db = new InMemorySupabase();
    dbRef.current = db;
    principalRef.current = principal();
    sitesRef.current = [SITE];
    emitted.length = 0;
    wc1.forceMismatch = false;
    db.seed("customers", [{ id: H_IN, org_id: ORG, name: "H" }]);
    db.seed("customer_members", [
        { id: C_IN, org_id: ORG, customer_id: H_IN, first_name: "In", last_name: "H", is_active: true },
        { id: C_SIB, org_id: ORG, customer_id: H_IN, first_name: "Sib", last_name: "H", is_active: true },
        { id: C_OUT, org_id: ORG, customer_id: H_IN, first_name: "Out", last_name: "H", is_active: true },
    ]);
    db.seed("document_types", [
        { id: T.enr.id, org_id: ORG, key: "enrollment_document", status: "active", published_version_id: T.enr.v },
        { id: T.imm.id, org_id: ORG, key: "immunization_record", status: "active", published_version_id: T.imm.v },
    ]);
    const ver = (t: { id: string; v: string }, over: Record<string, unknown>) => ({ id: t.v, org_id: ORG, document_type_id: t.id, version_number: 1, status: "published", validity_policy: { kind: "none" }, ...over });
    db.seed("document_type_versions", [
        ver(T.enr, { label: "Enrollment document", subject_types: ["child", "household"], allowed_formats: ["pdf"], default_sensitivity: "standard", review_required: false, replacement_policy: "new_document" }),
        ver(T.imm, { label: "Immunization record", subject_types: ["child"], allowed_formats: ["pdf"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version" }),
    ]);
    (db as unknown as { rpc: unknown }).rpc = async (fn: string, args: Record<string, unknown>) => {
        if (args.p_org_id !== ORG) return { data: [], error: null };
        if (fn === "list_external_children") return { data: ((args.p_child_ids as string[]) ?? []).filter((i) => VISIBLE_CHILDREN.has(i)).map((id) => ({ id })), error: null };
        if (fn === "list_external_households") return { data: ((args.p_household_ids as string[]) ?? []).filter((i) => i === H_IN).map((id) => ({ id })), error: null };
        if (fn === "is_medical_form_submission") return { data: false, error: null };
        if (fn === "document_file") {
            const d = db.rows("documents").find((r) => r.id === args.p_document_id)!;
            const filing = (d.metadata as Record<string, unknown>)?.filing as Record<string, unknown> | undefined;
            if (filing?.key === args.p_filing_key) return { data: { replay: true, document_id: d.id, filing }, error: null };
            if (filing) return { data: null, error: { message: "document_filing_already_filed: x" } };
            d.doc_type = args.p_doc_type;
            d.status = "active";
            const primary = { subject_type: args.p_primary_type, subject_id: args.p_primary_id };
            db.seed("document_subjects", [{ org_id: ORG, document_id: d.id, ...primary, association: "owner", is_primary: true, ended_at: null }]);
            const f = { key: args.p_filing_key, mode: "new_document", doc_type: args.p_doc_type, primary, contexts: [] };
            d.metadata = { ...(d.metadata as object), filing: f };
            return { data: { replay: false, document_id: d.id, version_id: d.current_version_id, doc_type: d.doc_type, sensitivity: "standard", filing: f }, error: null };
        }
        if (fn === "document_link_subject") {
            const bad = linkAuditCheck(args, "link");
            if (bad) return { data: null, error: bad };
            db.seed("document_subjects", [{ org_id: ORG, document_id: args.p_document_id, subject_type: args.p_subject_type, subject_id: args.p_subject_id, association: args.p_association, is_primary: false, ended_at: null, link_audit_event_id: args.p_audit_event_id ?? null }]);
            return { data: {}, error: null };
        }
        if (fn === "document_unlink_subject") {
            const bad = linkAuditCheck(args, "unlink");
            if (bad) return { data: null, error: bad };
            for (const s of db.rows("document_subjects")) if (s.document_id === args.p_document_id && s.subject_id === args.p_subject_id && !s.is_primary && !s.ended_at) Object.assign(s, { ended_at: "now", unlink_audit_event_id: args.p_audit_event_id ?? null });
            return { data: {}, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
    };
});

const KEY = "partner-key-0001";
function post(path: string, body: unknown, { key = KEY as string | null, bytes = false, query = "" } = {}) {
    const headers: Record<string, string> = { authorization: "Bearer t" };
    if (key) headers["idempotency-key"] = key;
    const init: { method: string; headers: Record<string, string>; body: BodyInit } = bytes
        ? { method: "POST", headers: { ...headers, "content-type": "application/pdf" }, body: Buffer.from(body as Uint8Array) }
        : { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) };
    return new NextRequest(`https://alloy.test${path}${query}`, init as never);
}
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });
const declare = (bytes = PDF, over: Record<string, unknown> = {}) => ({ filename: "consent.pdf", mime_type: "application/pdf", byte_size: bytes.byteLength, sha256: sha(bytes), ...over });
async function upload(bytes = PDF, key = KEY) {
    const c = await json(await createUpload(post("/api/v1/document-uploads", declare(bytes), { key })));
    const s = await json(await sendContent(post("/api/v1/document-uploads/content", bytes, { bytes: true, query: `?upload_id=${encodeURIComponent(c.body.upload_id)}` })));
    return { create: c, content: s };
}
const audits = (type: string) => emitted.filter((e) => e.event_type === type);

/** W-C1 (migration 20261222090000): the link / unlink stand-ins enforce the SQL contract when an audit id is passed. */
const wc1 = { forceMismatch: false };
function linkAuditCheck(a: Record<string, unknown>, change: "link" | "unlink"): { message: string } | null {
    if (a.p_audit_event_id == null) return null;
    const e = emitted[Number(String(a.p_audit_event_id).replace(/^evt-/, "")) - 1] as { event_type?: string; entity_id?: string; payload?: Record<string, unknown> } | undefined;
    const must = { ...((a.p_audit_payload as Record<string, unknown>) ?? {}), change, subject_type: a.p_subject_type, subject_id: a.p_subject_id };
    const actorNamed = a.p_audit_payload && "actor_kind" in (a.p_audit_payload as object);
    const ok = !!e && e.event_type === "document_subject_changed" && e.entity_id === a.p_document_id && Object.entries(must).every(([k, v]) => String(e.payload?.[k]) === String(v));
    const col = change === "link" ? "link_audit_event_id" : "unlink_audit_event_id";
    if (wc1.forceMismatch || !actorNamed || !ok) return { message: "audit_event_mismatch" };
    if (db.rows("document_subjects").some((r) => r[col] === a.p_audit_event_id)) return { message: `duplicate key value violates unique constraint "uq_document_subjects_${change}_audit_event"` };
    return null;
}

describe("scopes: documents.write is its own grant", () => {
    it("without documents.write every write is 403 before anything is read, recorded or stored", async () => {
        principalRef.current = principal({ grantedScopes: ["documents.read"] });
        const results = [
            await createUpload(post("/api/v1/document-uploads", declare())),
            await sendContent(post("/api/v1/document-uploads/content", PDF, { bytes: true, query: "?upload_id=x" })),
            await fileDoc(post("/api/v1/document-filings", { document_id: C_IN })),
            await link(post("/api/v1/document-subjects", {})),
            await unlink(post("/api/v1/document-subjects/unlink", {})),
        ];
        for (const r of results) expect(r.status).toBe(403);
        expect(emitted).toEqual([]);
        expect(db.uploadCalls).toEqual([]);
    });

    it("documents.write alone cannot read: listDocuments is 403", async () => {
        principalRef.current = principal({ grantedScopes: ["documents.write"] });
        const r = await listDocuments(new NextRequest(`https://alloy.test/api/v1/documents?child_id=${C_IN}`, { headers: { authorization: "Bearer t" } }));
        expect(r.status).toBe(403);
    });
});

describe("the first usable write surface: upload → file → link", () => {
    it("uploads, files to a visible child, links a sibling, unlinks it; every step audited as the application", async () => {
        const { create, content } = await upload();
        expect(create.status).toBe(201);
        expect(create.body).toMatchObject({ max_bytes: API_DOCUMENT_UPLOAD_MAX_BYTES, content_url: "/api/v1/document-uploads/content" });
        expect(content).toMatchObject({ status: 201, body: { status: "received", replay: false } });
        const docId = content.body.document_id as string;
        const row = db.rows("documents").find((d) => d.id === docId)!;
        expect(row).toMatchObject({ org_id: ORG, checksum_sha256: sha(PDF), mime_type: "application/pdf", storage_path: `${ORG}/api_uploads/${docId}/${sha(PDF)}` });
        expect((row.metadata as Record<string, any>).received_via).toEqual({ kind: "api_v1", installation_id: "inst-1", application_id: "app-1", credential_id: "cred-1" });

        const filed = await json(await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_IN } }, { key: "file-key-0001" })));
        expect(filed).toMatchObject({ status: 201, body: { document_id: docId, filed_document_id: docId, mode: "new_document", doc_type: "enrollment_document", replay: false } });

        const linked = await json(await link(post("/api/v1/document-subjects", { document_id: docId, subject_type: "child", subject_id: C_SIB }, { key: "link-key-0001" })));
        expect(linked).toMatchObject({ status: 200, body: { linked: true } });
        const unlinked = await json(await unlink(post("/api/v1/document-subjects/unlink", { document_id: docId, subject_type: "child", subject_id: C_SIB }, { key: "unlink-key-01" })));
        expect(unlinked).toMatchObject({ status: 200, body: { linked: false } });

        for (const t of ["document_upload_authorized", "document_filing_authorized", "document_subject_changed"]) {
            expect(audits(t).length, t).toBeGreaterThan(0);
            for (const e of audits(t)) expect(e.payload).toMatchObject({ actor_user_id: null, actor_kind: "application", actor_installation_id: "inst-1", actor_credential_id: "cred-1" });
        }
        // The filed document is now readable through D9.1 by the same installation.
        const list = await json(await listDocuments(new NextRequest(`https://alloy.test/api/v1/documents?child_id=${C_IN}`, { headers: { authorization: "Bearer t" } })));
        expect(list.status).toBe(200);
        expect(JSON.stringify(list.body)).toContain(docId);
        expect(JSON.stringify(list.body)).not.toContain("api_uploads");
    });
});

describe("idempotency (Q4)", () => {
    it("every write requires an Idempotency-Key", async () => {
        expect((await json(await createUpload(post("/api/v1/document-uploads", declare(), { key: null })))).body.error.code).toBe("idempotency_key_required");
        expect((await json(await fileDoc(post("/api/v1/document-filings", { document_id: C_IN }, { key: null })))).body.error.code).toBe("idempotency_key_required");
        expect((await json(await link(post("/api/v1/document-subjects", {}, { key: null })))).body.error.code).toBe("idempotency_key_required");
    });

    it("a repeated upload converges on one document and stores the object once; a repeated filing replays", async () => {
        const a = await upload();
        const b = await upload();
        expect(b.content).toMatchObject({ status: 200, body: { document_id: a.content.body.document_id, replay: true } });
        expect(db.uploadCalls).toHaveLength(1);
        const body = { document_id: a.content.body.document_id, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_IN } };
        await fileDoc(post("/api/v1/document-filings", body, { key: "file-key-0002" }));
        const again = await json(await fileDoc(post("/api/v1/document-filings", body, { key: "file-key-0002" })));
        expect(again).toMatchObject({ status: 200, body: { replay: true } });
        expect(audits("document_filing_authorized")).toHaveLength(1);
    });

    it("the same key over different bytes → 409 idempotency_conflict, nothing new stored", async () => {
        await upload(PDF);
        const c = await json(await createUpload(post("/api/v1/document-uploads", declare(PDF2))));
        const s = await json(await sendContent(post("/api/v1/document-uploads/content", PDF2, { bytes: true, query: `?upload_id=${encodeURIComponent(c.body.upload_id)}` })));
        expect(s).toMatchObject({ status: 409, body: { error: { code: "idempotency_conflict" } } });
        expect(db.uploadCalls).toHaveLength(1);
    });
});

describe("upload refusals", () => {
    it("declared too large → 413 at creation; unsupported format → 415", async () => {
        expect((await createUpload(post("/api/v1/document-uploads", declare(PDF, { byte_size: API_DOCUMENT_UPLOAD_MAX_BYTES + 1 })))).status).toBe(413);
        expect((await createUpload(post("/api/v1/document-uploads", declare(PDF, { filename: "notes.exe", mime_type: "application/x-msdownload" })))).status).toBe(415);
    });

    it("bytes that are not the declared format → 415 CONTENT_MISMATCH; wrong checksum → 422; nothing stored", async () => {
        const junk = enc("not a pdf at all, just text");
        const c = await json(await createUpload(post("/api/v1/document-uploads", declare(junk, { filename: "x.pdf" }))));
        const r = await json(await sendContent(post("/api/v1/document-uploads/content", junk, { bytes: true, query: `?upload_id=${encodeURIComponent(c.body.upload_id)}` })));
        expect(r).toMatchObject({ status: 415, body: { error: { code: "CONTENT_MISMATCH" } } });
        const c2 = await json(await createUpload(post("/api/v1/document-uploads", declare(PDF), { key: "other-key-001" })));
        const r2 = await json(await sendContent(post("/api/v1/document-uploads/content", PDF2, { bytes: true, query: `?upload_id=${encodeURIComponent(c2.body.upload_id)}` })));
        expect(r2).toMatchObject({ status: 422, body: { error: { code: "checksum_mismatch" } } });
        expect(db.uploadCalls).toEqual([]);
        expect(db.rows("documents")).toEqual([]);
    });

    it("another installation, another org, a forged or expired upload id → 404 / 409, never stored", async () => {
        const c = await json(await createUpload(post("/api/v1/document-uploads", declare())));
        principalRef.current = principal({ installationId: "inst-2" });
        expect((await sendContent(post("/api/v1/document-uploads/content", PDF, { bytes: true, query: `?upload_id=${encodeURIComponent(c.body.upload_id)}` }))).status).toBe(404);
        principalRef.current = principal({ orgId: OTHER_ORG });
        expect((await sendContent(post("/api/v1/document-uploads/content", PDF, { bytes: true, query: `?upload_id=${encodeURIComponent(c.body.upload_id)}` }))).status).toBe(404);
        principalRef.current = principal();
        const forged = String(c.body.upload_id).replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
        expect((await sendContent(post("/api/v1/document-uploads/content", PDF, { bytes: true, query: `?upload_id=${encodeURIComponent(forged)}` }))).status).toBe(404);
        const expired = signUploadId({ v: 1, u: "aa000000-0000-4000-8000-0000000000b1", o: ORG, i: "inst-1", k: "pdf", n: PDF.byteLength, s: sha(PDF), f: "x.pdf", e: 1 }, uploadSigningSecret()!);
        expect(await json(await sendContent(post("/api/v1/document-uploads/content", PDF, { bytes: true, query: `?upload_id=${encodeURIComponent(expired)}` })))).toMatchObject({ status: 409, body: { error: { code: "upload_expired" } } });
        expect(db.uploadCalls).toEqual([]);
    });

    it("a failed row insert removes the object it just stored", async () => {
        const secret = uploadSigningSecret()!;
        const token = signUploadId({ v: 1, u: "aa000000-0000-4000-8000-0000000000b2", o: ORG, i: "inst-1", k: "pdf", n: PDF.byteLength, s: sha(PDF), f: "x.pdf", e: Math.floor(Date.now() / 1000) + 600 }, secret);
        const removed: string[][] = [];
        const fake = {
            from: (t: string) => ({
                select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
                insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "XX000", message: "boom" } }) }) }),
                _t: t,
            }),
            storage: { from: () => ({ upload: async () => ({ error: null }), remove: async (p: string[]) => { removed.push(p); return { error: null }; } }) },
        } as unknown as SupabaseClient;
        const ctx = { organizationId: ORG, installationId: "inst-1", boundaryMode: "locations" as const, siteIds: [SITE], principal: { applicationId: "app-1", installationId: "inst-1", credentialId: "cred-1" } };
        const r = await completeDocumentUpload(fake, ctx, token, PDF, { audit: async () => ({ ok: true, eventId: "e" }) });
        expect(r).toMatchObject({ ok: false, error: { status: 503 } });
        const docId = uploadDocumentId("aa000000-0000-4000-8000-0000000000b2");
        expect(removed).toEqual([[`${ORG}/api_uploads/${docId}/${sha(PDF)}`]]);
    });
});

describe("filing and links stay within reach", () => {
    async function received() {
        return (await upload()).content.body.document_id as string;
    }
    it("a medical type → 422 TYPE_NOT_AVAILABLE_EXTERNALLY; an invisible child → 404; a document of another installation → 404", async () => {
        const docId = await received();
        expect((await json(await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "immunization_record", primary: { subject_type: "child", subject_id: C_IN } }, { key: "fk-medical-01" })))).body.error.code).toBe("TYPE_NOT_AVAILABLE_EXTERNALLY");
        expect((await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_OUT } }, { key: "fk-hidden-001" }))).status).toBe(404);
        principalRef.current = principal({ installationId: "inst-2" });
        expect((await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_IN } }, { key: "fk-other-0001" }))).status).toBe(404);
    });

    it("linking the owner → 409; linking an invisible child or on an unfiled document → 404", async () => {
        const docId = await received();
        expect((await link(post("/api/v1/document-subjects", { document_id: docId, subject_type: "child", subject_id: C_SIB }, { key: "lk-unfiled-01" }))).status).toBe(404);
        await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_IN } }, { key: "fk-ok-000001" }));
        expect(await json(await link(post("/api/v1/document-subjects", { document_id: docId, subject_type: "child", subject_id: C_IN }, { key: "lk-owner-001" })))).toMatchObject({ status: 409, body: { error: { code: "primary_subject_immutable" } } });
        expect((await link(post("/api/v1/document-subjects", { document_id: docId, subject_type: "child", subject_id: C_OUT }, { key: "lk-hidden-01" }))).status).toBe(404);
        expect(await json(await unlink(post("/api/v1/document-subjects/unlink", { document_id: docId, subject_type: "child", subject_id: C_IN }, { key: "ul-owner-001" })))).toMatchObject({ status: 409 });
    });
});

describe("abandoned-upload sweep", () => {
    it("removes only unreferenced objects under <org>/api_uploads older than the TTL", async () => {
        const docA = "da000000-0000-4000-8000-0000000000b1";
        const docB = "da000000-0000-4000-8000-0000000000b2";
        const docC = "da000000-0000-4000-8000-0000000000b3";
        const h = "e".repeat(64);
        const now = Date.parse("2026-11-03T12:00:00Z");
        const old = "2026-11-03T10:00:00Z";
        const fresh = "2026-11-03T11:50:00Z";
        const removed: string[][] = [];
        const listing: Record<string, Array<{ name: string; created_at?: string }>> = {
            [`${ORG}/api_uploads`]: [{ name: docA }, { name: docB }, { name: docC }, { name: "not-a-uuid" }],
            [`${ORG}/api_uploads/${docA}`]: [{ name: h, created_at: old }], // orphan → removed
            [`${ORG}/api_uploads/${docB}`]: [{ name: h, created_at: old }], // referenced → kept
            [`${ORG}/api_uploads/${docC}`]: [{ name: h, created_at: fresh }], // too recent → kept
        };
        const fake = {
            storage: { from: () => ({ list: async (p: string) => ({ data: listing[p] ?? [], error: null }), remove: async (p: string[]) => { removed.push(p); return { error: null }; } }) },
            from: () => ({ select: () => ({ eq: () => ({ in: async (_c: string, paths: string[]) => ({ data: paths.filter((p) => p.includes(docB)).map((storage_path) => ({ storage_path })), error: null }) }) }) }),
        } as unknown as SupabaseClient;
        const r = await sweepAbandonedApiUploads(fake, ORG, { nowMs: now });
        expect(r).toEqual({ ok: true, removed: [`${ORG}/api_uploads/${docA}/${h}`] });
        expect(removed).toEqual([[`${ORG}/api_uploads/${docA}/${h}`]]);
    });

    it("across orgs: only organizations with a documents.write installation, bounded, one failure never stops the rest", async () => {
        const ORG2 = "0c000000-0000-4000-8000-0000000000b9";
        const listed: string[] = [];
        let containsArg: unknown = null;
        const fake = {
            from: (t: string) =>
                t === "app_installations"
                    ? { select: () => ({ contains: async (_c: string, v: unknown) => { containsArg = v; return { data: [{ org_id: ORG }, { org_id: ORG }, { org_id: ORG2 }, { org_id: "bad" }], error: null }; } }) }
                    : { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) },
            storage: { from: () => ({ list: async (p: string) => { listed.push(p); if (p.startsWith(ORG2)) throw new Error("down"); return { data: [], error: null }; }, remove: async () => ({ error: null }) }) },
        } as unknown as SupabaseClient;
        const r = await sweepAbandonedApiUploadsAcrossOrgs(fake);
        expect(containsArg).toEqual(["documents.write"]);
        expect(r).toEqual({ orgs: 2, removed: 0, failed: 1 });
        expect(listed).toEqual([`${ORG}/api_uploads`, `${ORG2}/api_uploads`]);
    });
});

describe("late filing after escalation (unfiled uploads become Processing cases after 24 h)", () => {
    it("the installation can still file its upload; the filing closes the escalation case, audited as the system process", async () => {
        const docId = (await upload()).content.body.document_id as string;
        const caseId = "ca000000-0000-4000-8000-0000000000b9";
        db.seed("processing_cases", [{ id: caseId, org_id: ORG, status: "received", metadata: { processing_intent: "store_document", api_upload_escalation: { kind: "api_v1_unfiled_upload", document_id: docId } } }]);
        db.seed("processing_case_sources", [{ org_id: ORG, processing_case_id: caseId, source_kind: "upload", source_id: docId, role: "primary" }]);

        const filed = await json(await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_IN } }, { key: "late-file-key-1" })));
        expect(filed).toMatchObject({ status: 201, body: { document_id: docId, replay: false } });
        const c = db.rows("processing_cases").find((r) => r.id === caseId)!;
        expect(c.status).toBe("completed");
        expect((c.metadata as Record<string, any>).operational_result).toMatchObject({ kind: "document_filed", filed_document_id: docId, filed_outside_case: true });
        expect(audits("document_unfiled_upload_case_resolved")[0]?.payload).toMatchObject({ actor_kind: "system", actor_process: "api_upload_escalation", processing_case_id: caseId, filed_through_api: true });
        // The partner's response carries nothing about the case.
        expect(JSON.stringify(filed.body)).not.toContain(caseId);
    });

    it("a staff filing through the case first leaves the installation's later filing as 409 ALREADY_FILED", async () => {
        const docId = (await upload()).content.body.document_id as string;
        const d = db.rows("documents").find((r) => r.id === docId)!;
        d.metadata = { ...(d.metadata as object), filing: { key: `processing_case:ca000000-0000-4000-8000-0000000000b8:document:${docId}`, mode: "new_document" } };
        const r = await json(await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_IN } }, { key: "late-file-key-2" })));
        expect(r).toMatchObject({ status: 409, body: { error: { code: "ALREADY_FILED" } } });
    });
});

describe("the 4 MiB limit is explicit to the partner", () => {
    it("creation answers max_bytes; an oversize declaration and an oversize body both name 4 MiB (4,194,304 bytes)", async () => {
        const created = await json(await createUpload(post("/api/v1/document-uploads", declare())));
        expect(created.body.max_bytes).toBe(4 * 1024 * 1024);
        const declared = await json(await createUpload(post("/api/v1/document-uploads", declare(PDF, { byte_size: API_DOCUMENT_UPLOAD_MAX_BYTES + 1 }), { key: "big-key-00001" })));
        expect(declared).toMatchObject({ status: 413, body: { error: { code: "FILE_TOO_LARGE" } } });
        expect(declared.body.error.message).toContain("4 MiB (4,194,304 bytes)");
        const big = new Uint8Array(API_DOCUMENT_UPLOAD_MAX_BYTES + 1);
        const sent = await json(await sendContent(post("/api/v1/document-uploads/content", big, { bytes: true, query: `?upload_id=${encodeURIComponent(created.body.upload_id)}` })));
        expect(sent.status).toBe(413);
        expect(sent.body.error.message).toContain("4 MiB (4,194,304 bytes)");
        expect(db.uploadCalls).toEqual([]);
    });
});

describe("W-C1: link and unlink bind the exact audit row written for this application (migration 20261222090000)", () => {
    const idOf = (e: Record<string, unknown>) => `evt-${emitted.indexOf(e) + 1}`;
    async function filedDoc() {
        const { content } = await upload();
        const docId = content.body.document_id as string;
        await fileDoc(post("/api/v1/document-filings", { document_id: docId, type_key: "enrollment_document", primary: { subject_type: "child", subject_id: C_IN } }, { key: "file-key-0001" }));
        return docId;
    }

    it("link and unlink each store their own audit id, written for app-1 / inst-1 and this subject", async () => {
        const docId = await filedDoc();
        await link(post("/api/v1/document-subjects", { document_id: docId, subject_type: "child", subject_id: C_SIB }, { key: "link-key-0001" }));
        await unlink(post("/api/v1/document-subjects/unlink", { document_id: docId, subject_type: "child", subject_id: C_SIB }, { key: "unlink-key-01" }));
        const [la, ua] = audits("document_subject_changed");
        const row = db.rows("document_subjects").find((r) => r.document_id === docId && r.subject_id === C_SIB)!;
        expect(row.link_audit_event_id).toBe(idOf(la));
        expect(row.unlink_audit_event_id).toBe(idOf(ua));
        expect(la.payload).toMatchObject({ change: "link", subject_id: C_SIB, actor_kind: "application", actor_application_id: "app-1", actor_installation_id: "inst-1" });
        expect(ua.payload).toMatchObject({ change: "unlink", subject_id: C_SIB });
    });

    it("a mismatch is refused before the link is written and answered 503 AUDIT_UNAVAILABLE", async () => {
        const docId = await filedDoc();
        wc1.forceMismatch = true;
        const r = await json(await link(post("/api/v1/document-subjects", { document_id: docId, subject_type: "child", subject_id: C_SIB }, { key: "link-key-0002" })));
        expect(r).toMatchObject({ status: 503, body: { error: { code: "AUDIT_UNAVAILABLE" } } });
        expect(db.rows("document_subjects").some((x) => x.document_id === docId && x.subject_id === C_SIB)).toBe(false);
    });
});

