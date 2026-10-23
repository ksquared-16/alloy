/**
 * Documents V1 / D1b — database, storage and ingestion hardening, through the real routes.
 *
 * As in the D1a suite, the route handlers and every authorization helper run unmodified. Only the
 * session and the service-role client are substituted, and the in-memory client evaluates each
 * query's real filters. `rpc` is stubbed per test: `consume_rate_limit` for the public-upload limiter,
 * and `is_medical_form_submission` for medical linkage.
 *
 * What D1b adds, and what this suite holds:
 *   1. content is proven by bytes, and stored under its canonical type (D1b.3 / D1b.4);
 *   2. public uploads are size-capped and rate-limited before any byte is read or token resolved (D1b.4);
 *   3. sensitive classes: medical needs health.view, safeguarding evidence needs safeguarding view, on
 *      the decision AND the lists AND the drawer, and an unreadable classification fails closed (D1b.6);
 *   4. a public drawn signature may cite only its own session's capture (D1b.6);
 *   5. OCR text is disclosed only to an actor who may read it, wherever it surfaces (D1b.2 / D1b.6);
 *   6. the migrations' declared posture matches the code's (D1b.2 / D1b.3).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => dbRef.current,
    createServiceRoleClient: () => dbRef.current,
}));
vi.mock("@/lib/supabase/serverServiceClient", () => ({
    createServiceRoleClient: () => dbRef.current,
}));

import { GET as signedUrlGET } from "@/app/api/admin/documents/[id]/signed-url/route";
import { GET as documentsListGET } from "@/app/api/admin/documents/route";
import { POST as uploadPOST } from "@/app/api/admin/documents/upload/route";
import { GET as entityGET } from "@/app/api/admin/entity/[type]/[id]/route";
import { GET as relatedGET } from "@/app/api/admin/related/[entity]/[id]/route";
import { POST as vendorApplicationPOST } from "@/app/api/vendor-application/route";
import { POST as enrollmentUploadPOST } from "@/app/api/public/forms/[token]/enrollment-upload/route";
import {
    bytesMatchDocumentKind,
    GOVERNED_DOCUMENT_MIME_TYPES,
    sniffBinaryDocumentKind,
    sniffPublicUploadKind,
} from "@/lib/documents/documentContentSignature";
import { PUBLIC_UPLOAD_RATE_POLICY } from "@/lib/documents/publicUploadGuard";
import { MEDICAL_DOCUMENT_TYPES, resolveDocumentSensitivity } from "@/lib/documents/documentSensitivity";
import { discloseFormDraftTextPreview } from "@/lib/documents/extractedTextDisclosure";
import { persistFormSubmissionSignatures } from "@/lib/forms/signatures/persistFormSubmissionSignatures";

const ROOT = resolve(__dirname, "../../..");
const ORG = "0a000000-0000-4000-8000-000000000001";
const USER_ID = "05e00000-0000-4000-8000-000000000001";
const CUSTOMER = "c0000000-0000-4000-8000-000000000001";
const D = {
    plain: "d1b00000-0000-4000-8000-000000000001",
    immunization: "d1b00000-0000-4000-8000-000000000002",
    medicalLinked: "d1b00000-0000-4000-8000-000000000003",
    safeguarding: "d1b00000-0000-4000-8000-000000000004",
    signature: "d1b00000-0000-4000-8000-000000000005",
    otherSessionSignature: "d1b00000-0000-4000-8000-000000000006",
} as const;
const SUBMISSION_MEDICAL = "5b000000-0000-4000-8000-000000000001";
const SESSION = "5e000000-0000-4000-8000-000000000001";

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const HTML_AS_PDF = new TextEncoder().encode("<html><body>%PDF-1.4 hello</body></html>");

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

function seededDb(opts: { rpc?: Rpc } = {}): InMemorySupabase {
    const db = new InMemorySupabase();
    const doc = (id: string, over: Record<string, unknown>) => ({
        id,
        org_id: ORG,
        bucket: "org_documents",
        storage_path: `${ORG}/customer/${CUSTOMER}/${id}.pdf`,
        entity_type: "customer",
        entity_id: CUSTOMER,
        status: "uploaded",
        title: `doc ${id.slice(-2)}`,
        original_filename: `${id.slice(-2)}.pdf`,
        doc_type: null,
        extracted_text: `ocr of ${id}`,
        metadata: {},
        created_at: "2026-10-23T00:00:00Z",
        ...over,
    });
    db.seed("customers", [{ id: CUSTOMER, org_id: ORG, name: "Household" }]);
    db.seed("documents", [
        doc(D.plain, {}),
        doc(D.immunization, { doc_type: "immunization_record" }),
        doc(D.medicalLinked, { doc_type: "generated_pdf" }),
        doc(D.safeguarding, { doc_type: "court_order" }),
        doc(D.signature, { doc_type: "signature_asset", metadata: { packet_session_id: SESSION } }),
        doc(D.otherSessionSignature, { doc_type: "signature_asset", metadata: { packet_session_id: "another-session" } }),
    ]);
    db.seed("form_submission_documents", [
        { id: "f5d00000-0000-4000-8000-000000000001", org_id: ORG, form_submission_id: SUBMISSION_MEDICAL, document_id: D.medicalLinked },
    ]);
    db.seed("child_safeguarding_restrictions", [
        { id: "c5900000-0000-4000-8000-000000000001", org_id: ORG, evidence_document_id: D.safeguarding },
    ]);
    const rpc: Rpc =
        opts.rpc ??
        (async (name, args) => {
            if (name === "is_medical_form_submission") return { data: args._form_submission_id === SUBMISSION_MEDICAL, error: null };
            if (name === "consume_rate_limit") return { data: [{ allowed: true, current_count: 1, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null };
            return { data: null, error: { message: `unexpected rpc ${name}` } };
        });
    (db as unknown as { rpc: Rpc }).rpc = rpc;
    return db;
}

type Persona = { role: "admin" | "ops"; roleKeys: string[]; permissionKeys: string[] };
const P = {
    admin: { role: "admin", roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "processing.operate", "processing.documents.manage", "health.view"] },
    ops: { role: "ops", roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write", "processing.operate"] },
    /** A custom reader: documents.read, no Medical, no safeguarding role. The Q1 `doc_reader`. */
    reader: { role: "ops", roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    processingOnly: { role: "ops", roleKeys: ["qa_processing_only"], permissionKeys: ["portal.access", "processing.operate"] },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, role: p.role, userId: USER_ID, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true,
        userId: USER_ID,
        orgId: ORG,
        roleKeys: p.roleKeys,
        permissionKeys: p.permissionKeys,
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;
beforeEach(() => {
    db = seededDb();
    dbRef.current = db;
    vi.clearAllMocks();
});

const signedUrl = (id: string) =>
    invokeRoute(signedUrlGET, buildRequest({ path: `/api/admin/documents/${id}/signed-url` }), routeParams({ id }));

// ── 1. Content is what its bytes prove ──────────────────────────────────────────────────────────

describe("content signatures (D1b.3 / D1b.4)", () => {
    it("recognises the binary formats by signature, not by label", () => {
        expect(sniffBinaryDocumentKind(PDF)).toBe("pdf");
        expect(sniffBinaryDocumentKind(PNG)).toBe("png");
        expect(sniffBinaryDocumentKind(JPEG)).toBe("jpeg");
        expect(sniffBinaryDocumentKind(new TextEncoder().encode("hello"))).toBeNull();
    });

    it("a text claim must be text, and a binary document relabelled as text is refused", () => {
        expect(bytesMatchDocumentKind(new TextEncoder().encode("a,b\n1,2\n"), "csv")).toBe(true);
        expect(bytesMatchDocumentKind(new Uint8Array(32), "txt")).toBe(false);
        expect(bytesMatchDocumentKind(PNG, "txt")).toBe(false);
        expect(bytesMatchDocumentKind(PNG, "pdf")).toBe(false);
    });

    it("a public PDF must begin with its header, so a polyglot cannot pass as one", () => {
        expect(sniffPublicUploadKind(PDF)).toBe("pdf");
        expect(sniffPublicUploadKind(HTML_AS_PDF)).toBeNull();
        expect(sniffPublicUploadKind(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    });

    it("the admin upload refuses bytes that are not the claimed format, and stores the canonical type", async () => {
        as(P.admin);
        const upload = (bytes: Uint8Array, name: string, type: string) => {
            const form = new FormData();
            form.set("entity_type", "customer");
            form.set("entity_id", CUSTOMER);
            form.set("file", new File([bytes], name, { type }));
            return invokeRoute(uploadPOST, new NextRequest("http://localhost/api/admin/documents/upload", { method: "POST", body: form }));
        };
        const mismatch = await upload(PNG, "photo.pdf", "application/pdf");
        expect(mismatch.status).toBe(415);
        expect(mismatch.body).toMatchObject({ code: "CONTENT_MISMATCH" });
        expect(db.uploadCalls ?? []).toHaveLength(0);

        // A browser that labels a text file with nothing at all: stored as text/plain, never octet-stream.
        const ok = await upload(new TextEncoder().encode("plain notes\n"), "notes.txt", "");
        expect(ok.status).toBe(200);
        const stored = db.rows("documents").find((r) => String(r.storage_path ?? "").endsWith("notes.txt"));
        expect(stored?.mime_type).toBe("text/plain");
    });
});

// ── 2. Public ingestion gates ───────────────────────────────────────────────────────────────────

describe("public uploads: size and rate gates run first (D1b.4)", () => {
    it("the vendor application refuses a declared oversize body before reading it", async () => {
        const req = new NextRequest("http://localhost/api/vendor-application", {
            method: "POST",
            headers: { "content-length": String(64 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
            body: "--x--",
        });
        process.env.ALLOY_PUBLIC_ORG_ID = ORG;
        const res = await invokeRoute(vendorApplicationPOST, req);
        expect(res.status).toBe(413);
        expect(db.rows("vendors")).toHaveLength(0);
    });

    it("the vendor application is rate-limited per caller, before the form is parsed", async () => {
        db = seededDb({
            rpc: async (name) =>
                name === "consume_rate_limit"
                    ? { data: [{ allowed: false, current_count: 6, reset_at: new Date(Date.now() + 300_000).toISOString() }], error: null }
                    : { data: null, error: null },
        });
        dbRef.current = db;
        process.env.ALLOY_PUBLIC_ORG_ID = ORG;
        const form = new FormData();
        form.set("first_name", "A");
        const req = new NextRequest("http://localhost/api/vendor-application", { method: "POST", body: form });
        const res = await invokeRoute(vendorApplicationPOST, req);
        expect(res.status).toBe(429);
        expect(res.body).toMatchObject({ code: "RATE_LIMITED" });
        expect(res.headers.get("retry-after")).toBeTruthy();
    });

    it("a limiter that cannot be reached refuses rather than admits", async () => {
        db = seededDb({ rpc: async () => ({ data: null, error: { message: "down" } }) });
        dbRef.current = db;
        process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key";
        const res = await invokeRoute(
            enrollmentUploadPOST,
            buildRequest({ method: "POST", path: "/api/public/forms/tok/enrollment-upload", body: { field_id: "f" } }),
            routeParams({ token: "tok" }),
        );
        expect(res.status).toBe(429);
    });

    it("budgets are bounded and the vendor application is the tightest", () => {
        expect(PUBLIC_UPLOAD_RATE_POLICY.vendor_application.limit).toBeLessThanOrEqual(PUBLIC_UPLOAD_RATE_POLICY.enrollment_upload.limit);
        for (const p of Object.values(PUBLIC_UPLOAD_RATE_POLICY)) {
            expect(p.limit).toBeGreaterThan(0);
            expect(p.windowSeconds).toBeGreaterThan(0);
        }
    });
});

// ── 3. Sensitive classes ────────────────────────────────────────────────────────────────────────

describe("sensitive documents need their own authority (D1b.6)", () => {
    it("classifies by doc_type, by medical-form linkage and by safeguarding citation", async () => {
        const classes = await resolveDocumentSensitivity(db as never, ORG, [
            { id: D.plain, doc_type: null },
            { id: D.immunization, doc_type: "immunization_record" },
            { id: D.medicalLinked, doc_type: "generated_pdf" },
            { id: D.safeguarding, doc_type: "court_order" },
        ]);
        expect([...(classes.get(D.plain) ?? [])]).toEqual([]);
        expect([...(classes.get(D.immunization) ?? [])]).toEqual(["medical"]);
        expect([...(classes.get(D.medicalLinked) ?? [])]).toEqual(["medical"]);
        expect([...(classes.get(D.safeguarding) ?? [])]).toEqual(["safeguarding"]);
    });

    it("a reader without health.view or a safeguarding role is refused every sensitive class", async () => {
        as(P.reader);
        expect((await signedUrl(D.plain)).status).toBe(200);
        for (const id of [D.immunization, D.medicalLinked, D.safeguarding]) {
            const res = await signedUrl(id);
            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: "SENSITIVE_DOCUMENT" });
        }
    });

    it("ops reads safeguarding evidence but never a medical document; an administrator with health.view reads both", async () => {
        as(P.ops);
        expect((await signedUrl(D.safeguarding)).status).toBe(200);
        expect((await signedUrl(D.immunization)).status).toBe(403);
        as(P.admin);
        expect((await signedUrl(D.immunization)).status).toBe(200);
        expect((await signedUrl(D.medicalLinked)).status).toBe(200);
        expect((await signedUrl(D.safeguarding)).status).toBe(200);
    });

    it("the list applies the same classes", async () => {
        as(P.reader);
        const res = await invokeRoute(documentsListGET, buildRequest({ path: "/api/admin/documents" }));
        const ids = ((res.body as { documents?: Array<{ id: string }> }).documents ?? []).map((d) => d.id);
        expect(ids).toContain(D.plain);
        expect(ids).not.toContain(D.immunization);
        expect(ids).not.toContain(D.medicalLinked);
        expect(ids).not.toContain(D.safeguarding);
    });

    it("fails closed: a classification that cannot be read refuses an actor without both authorities", async () => {
        const realFrom = db.from.bind(db);
        (db as unknown as { from: (t: string) => unknown }).from = (t: string) => {
            if (t === "child_safeguarding_restrictions") throw new Error("relation unavailable");
            return realFrom(t);
        };
        as(P.reader);
        const res = await signedUrl(D.plain);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "SENSITIVE_DOCUMENT" });
    });

    it("the medical doc_type list is the database's list", () => {
        const sql = readFileSync(resolve(ROOT, "supabase/migrations/20261204090000_medical_rows_require_health_permission.sql"), "utf8");
        for (const t of MEDICAL_DOCUMENT_TYPES) expect(sql).toContain(`'${t}'`);
    });
});

describe("the record drawer and related tabs disclose documents only as the decision would (D1b.6)", () => {
    const drawer = (id: string) =>
        invokeRoute(entityGET, buildRequest({ path: `/api/admin/entity/documents/${id}` }), routeParams({ type: "documents", id }));
    const related = () =>
        invokeRoute(relatedGET, buildRequest({ path: `/api/admin/related/customer/${CUSTOMER}` }), routeParams({ entity: "customer", id: CUSTOMER }));
    const relatedIds = (body: unknown) => ((body as { documents?: Array<{ id: string }> }).documents ?? []).map((d) => d.id);

    it("the drawer never carries OCR text, and refuses a sensitive document to a reader", async () => {
        as(P.reader);
        const ok = await drawer(D.plain);
        expect(ok.status).toBe(200);
        expect(JSON.stringify(ok.body)).not.toContain("ocr of");
        expect((await drawer(D.immunization)).status).toBe(404);
    });

    it("the drawer refuses an actor with no document read admission", async () => {
        as(P.processingOnly);
        expect((await drawer(D.plain)).status).toBe(404);
    });

    it("a related tab lists only what the actor may read", async () => {
        as(P.reader);
        const ids = relatedIds((await related()).body);
        expect(ids).toContain(D.plain);
        expect(ids).not.toContain(D.immunization);
        expect(ids).not.toContain(D.safeguarding);
        as(P.processingOnly);
        expect(relatedIds((await related()).body)).toEqual([]);
    });
});

// ── 4. Drawn signatures cite their own capture ──────────────────────────────────────────────────

describe("a public drawn signature may cite only this session's capture (D1b.6)", () => {
    const schema = { version: 1, fields: [{ id: "sig", type: "signature", label: "Sign", required: true }] } as never;
    const persist = (docId: string, packetSessionId: string | null = SESSION) =>
        persistFormSubmissionSignatures(db as never, {
            orgId: ORG,
            formSubmissionId: "5b000000-0000-4000-8000-0000000000aa",
            schema,
            payload: { signatures: { sig: { kind: "drawn", drawn_document_id: docId } } } as never,
            signerIpHash: null,
            channel: { kind: "public_link", linkId: "l", packetSessionId, recipientPersonId: null, recipientName: null },
        });

    it("refuses another document of the organization", async () => {
        const res = await persist(D.immunization);
        expect("error" in res).toBe(true);
        expect(db.rows("form_submission_signatures")).toHaveLength(0);
    });

    it("refuses another session's signature capture", async () => {
        expect("error" in (await persist(D.otherSessionSignature))).toBe(true);
    });

    it("accepts this session's own capture", async () => {
        const res = await persist(D.signature);
        expect("error" in res).toBe(false);
    });
});

// ── 5. OCR text disclosure ──────────────────────────────────────────────────────────────────────

describe("OCR text in a stored form-draft preview (D1b.2 / D1b.6)", () => {
    const draft = (source: string) => ({ source_document_id: source, diagnostics: { extracted_text_length: 12, extracted_text_preview: "secret words" } });

    it("is blanked for an actor without processing.operate and document read; its length stays", async () => {
        for (const p of [P.reader, P.processingOnly]) {
            const out = await discloseFormDraftTextPreview(db as never, ORG, p, draft(D.plain));
            expect(out.diagnostics.extracted_text_preview).toBe("");
            expect(out.diagnostics.extracted_text_length).toBe(12);
        }
    });

    it("is shown to an actor who may read the source document's text", async () => {
        const out = await discloseFormDraftTextPreview(db as never, ORG, P.ops, draft(D.plain));
        expect(out.diagnostics.extracted_text_preview).toBe("secret words");
    });

    it("is blanked when the source document is medical and the actor lacks health.view", async () => {
        const out = await discloseFormDraftTextPreview(db as never, ORG, P.ops, draft(D.immunization));
        expect(out.diagnostics.extracted_text_preview).toBe("");
    });
});

// ── 6. Declared posture ─────────────────────────────────────────────────────────────────────────

describe("the migrations declare the posture the code relies on (D1b.2 / D1b.3)", () => {
    const revoke = readFileSync(resolve(ROOT, "supabase/migrations/20261207181500_documents_direct_access_revocation.sql"), "utf8");
    const bucket = readFileSync(resolve(ROOT, "supabase/migrations/20261207181600_org_documents_bucket_governance.sql"), "utf8");

    it("revokes client privileges on every document-owned table and keeps the service role", () => {
        for (const t of ["documents", "document_versions", "document_field_values", "document_field_definitions", "form_submission_documents", "form_submission_signatures"]) {
            expect(revoke).toContain(`'${t}'`);
        }
        expect(revoke).toContain("REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated");
        expect(revoke).toContain("GRANT ALL ON TABLE public.%I TO service_role");
    });

    it("the bucket allowlist is exactly the canonical content types the upload paths store", () => {
        const list = bucket.match(/allowed_mime_types = ARRAY\[([\s\S]*?)\]/)?.[1] ?? "";
        const declared = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
        expect(declared).toEqual([...GOVERNED_DOCUMENT_MIME_TYPES].sort());
        expect(bucket).toMatch(/public = false/);
        expect(bucket).toMatch(/file_size_limit = 20971520/);
    });

    it("no upload path stores a client-supplied or octet-stream content type", () => {
        for (const f of [
            "web/app/api/admin/documents/upload/route.ts",
            "web/lib/vendors/publicVendorApplication.ts",
            "web/app/api/vendor-application/route.ts",
        ]) {
            const src = readFileSync(resolve(ROOT, f), "utf8");
            expect(src, f).not.toMatch(/contentType:\s*file\.type/);
        }
        expect(readFileSync(resolve(ROOT, "web/app/api/vendor-application/route.ts"), "utf8")).not.toContain('"application/octet-stream"');
    });
});
