/**
 * Documents V1 / D1a — application-level document access, end to end through the real routes.
 *
 * WHAT RUNS FOR REAL
 * Every route handler, `assertDocumentAccess`, `documentActorForRequest`, the `accessScope`
 * department/site predicates, the Processing capability guards, the audit writer (`emitEvent`) and
 * the storage-path predicate run unmodified. Only two things are substituted:
 *   - the session (`getAdminContextCached` / `getAdminAccessContextCached`), so a test can be a
 *     specific actor; and
 *   - the service-role client, by `InMemorySupabase`, which evaluates every query's actual filters
 *     against seeded rows — a missing `.eq("org_id", …)` returns another tenant's row here exactly as
 *     it would in Postgres.
 * Nothing in the authorization chain is mocked, so a helper that is called but wrong fails here.
 *
 * THE MATRIX
 * Actors: admin, ops, a custom portal role (`school_director` — the compatibility projection calls
 * it `ops`), a read-only document role, a Processing-only role, a department-restricted ops, and an
 * admin of another organization. Documents: a child's record, opportunity documents inside and
 * outside the restricted department, unattached intake, a vendor's file, a vendor-referenced file,
 * and three rows whose storage path leaves their organization.
 */
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
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return { ...actual, getAdminAccessContextCached: mockAccess, getAdminAccessContext: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => dbRef.current,
    createServiceRoleClient: () => dbRef.current,
}));

import { GET as signedUrlGET } from "@/app/api/admin/documents/[id]/signed-url/route";
import { GET as sourcePreviewGET } from "@/app/api/admin/documents/[id]/source-preview/route";
import { PATCH as documentPATCH } from "@/app/api/admin/documents/[id]/route";
import { GET as documentsListGET } from "@/app/api/admin/documents/route";
import { GET as entityOptionsGET } from "@/app/api/admin/documents/entity-options/route";
import { POST as uploadPOST } from "@/app/api/admin/documents/upload/route";
import { GET as posListGET } from "@/app/api/admin/pos/documents/route";
import { DELETE as posDocDELETE } from "@/app/api/admin/pos/documents/[id]/route";
import { GET as extractedTextGET } from "@/app/api/admin/pos/documents/[id]/extracted-text/route";
import { GET as vendorSignedUrlGET } from "@/app/api/admin/vendors/[id]/documents/signed-url/route";
import {
    DELETE as profilePhotoDELETE,
    POST as profilePhotoPOST,
} from "@/app/api/admin/persons/[id]/profile-photo/route";
import {
    assertDocumentAccess,
    DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER,
    isStoragePathWithinOrg,
} from "@/lib/documents/assertDocumentAccess";
import { canonicalDocumentEntityType } from "@/lib/documents/documentEntityTypes";
import { ADMIN_DOCUMENT_UPLOAD_MAX_BYTES } from "@/lib/documents/documentUploadLimits";
import { documentActorFromAdminParts } from "@/lib/documents/projectPersonProfilePhotos";
import { resolveProfilePhotosForActor } from "@/lib/documents/profilePhotoPresentation";
import { downloadDocumentBytesSafe } from "@/lib/pos/processingCase/structure/documentBytes";

// ── Fixture identities ──────────────────────────────────────────────────────────────────────────

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const DEPT_1 = "d1000000-0000-4000-8000-000000000001";
const DEPT_2 = "d2000000-0000-4000-8000-000000000002";
const WU_1 = "a1000000-0000-4000-8000-000000000001";
const WU_2 = "a2000000-0000-4000-8000-000000000002";
const OPP_1 = "0b100000-0000-4000-8000-000000000001";
const OPP_2 = "0b200000-0000-4000-8000-000000000002";
const CHILD = "c1000000-0000-4000-8000-000000000001";
const PERSON = "9e100000-0000-4000-8000-000000000001";
const VENDOR_1 = "ae100000-0000-4000-8000-000000000001";
const VENDOR_2 = "ae200000-0000-4000-8000-000000000002";
const CUSTOMER = "cc100000-0000-4000-8000-000000000001";

const DOC = {
    child: "d0c00000-0000-4000-8000-000000000001",
    opp1: "d0c00000-0000-4000-8000-000000000002",
    opp2: "d0c00000-0000-4000-8000-000000000003",
    intake: "d0c00000-0000-4000-8000-000000000004",
    vendor: "d0c00000-0000-4000-8000-000000000005",
    vendorRef: "d0c00000-0000-4000-8000-000000000006",
    unprefixed: "d0c00000-0000-4000-8000-000000000007",
    foreignPath: "d0c00000-0000-4000-8000-000000000008",
    traversal: "d0c00000-0000-4000-8000-000000000009",
    photo: "d0c00000-0000-4000-8000-00000000000a",
    otherOrg: "d0c00000-0000-4000-8000-00000000000b",
    pluralOpp1: "d0c00000-0000-4000-8000-00000000000c",
} as const;

const BUCKET = "org_documents";

function doc(id: string, over: Record<string, unknown>) {
    return {
        id,
        org_id: ORG_A,
        bucket: BUCKET,
        status: "uploaded",
        title: `doc ${id.slice(-2)}`,
        original_filename: `file-${id.slice(-2)}.pdf`,
        doc_type: null,
        extracted_text: `extracted text of ${id}`,
        metadata: {},
        created_at: "2026-10-20T00:00:00Z",
        ...over,
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
    db.seed("vendors", [
        { id: VENDOR_1, org_id: ORG_A, name: "Vendor One", insurance_doc_file_id: null, drivers_license_doc_file_id: null },
        { id: VENDOR_2, org_id: ORG_A, name: "Vendor Two", insurance_doc_file_id: DOC.vendorRef, drivers_license_doc_file_id: null },
    ]);
    db.seed("customers", [{ id: CUSTOMER, org_id: ORG_A, name: "Household One" }]);
    db.seed("persons", [{ id: PERSON, org_id: ORG_A, metadata: {} }]);
    db.seed("documents", [
        doc(DOC.child, {
            entity_type: "customer_member",
            entity_id: CHILD,
            doc_type: "immunization_record",
            storage_path: `${ORG_A}/customer_member/${CHILD}/x-immunization.pdf`,
        }),
        doc(DOC.opp1, { entity_type: "opportunity", entity_id: OPP_1, storage_path: `${ORG_A}/opportunity/${OPP_1}/a.pdf` }),
        doc(DOC.opp2, { entity_type: "opportunity", entity_id: OPP_2, storage_path: `${ORG_A}/opportunity/${OPP_2}/b.pdf` }),
        doc(DOC.intake, {
            entity_type: null,
            entity_id: null,
            storage_path: `${ORG_A}/pos_intake/intake.txt`,
            original_filename: "intake.txt",
        }),
        doc(DOC.vendor, { entity_type: "vendor", entity_id: VENDOR_1, storage_path: `${ORG_A}/vendors/${VENDOR_1}/insurance/c.png` }),
        doc(DOC.vendorRef, { entity_type: null, entity_id: null, storage_path: `${ORG_A}/vendors/${VENDOR_2}/insurance/r.png` }),
        doc(DOC.unprefixed, { entity_type: "vendor", entity_id: VENDOR_1, storage_path: `vendors/${VENDOR_1}/insurance/legacy.png` }),
        doc(DOC.foreignPath, {
            entity_type: "customer_member",
            entity_id: CHILD,
            storage_path: `${ORG_B}/customer_member/zz/secret.pdf`,
        }),
        doc(DOC.traversal, { entity_type: null, entity_id: null, storage_path: `${ORG_A}/../${ORG_B}/x.pdf` }),
        doc(DOC.photo, {
            entity_type: "person",
            entity_id: PERSON,
            doc_type: "profile_photo",
            storage_path: `${ORG_A}/person/${PERSON}/face.png`,
        }),
        doc(DOC.otherOrg, { org_id: ORG_B, entity_type: "customer_member", entity_id: CHILD, storage_path: `${ORG_B}/customer_member/q.pdf` }),
        doc(DOC.pluralOpp1, { entity_type: "opportunities", entity_id: OPP_1, storage_path: `${ORG_A}/opportunity/${OPP_1}/legacy-plural.pdf` }),
    ]);
    db.putObject(BUCKET, `${ORG_A}/pos_intake/intake.txt`, "intake file body");
    db.putObject(BUCKET, `${ORG_A}/opportunity/${OPP_2}/b.pdf`, "%PDF-opp2");
    db.putObject(BUCKET, `${ORG_B}/customer_member/zz/secret.pdf`, "%PDF-other-tenant");
    return db;
}

// ── Actors ──────────────────────────────────────────────────────────────────────────────────────

type Persona = {
    orgId: string;
    /** The compatibility projection `getAdminContextCached` returns: only ever admin|ops. */
    role: "admin" | "ops";
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope?: "all" | "restricted";
    allowedDepartmentIds?: string[] | null;
};

// An administrator holds Medical's `health.view` by default; ops never does (D1b.6).
const ALL_ADMIN = ["documents.read", "documents.write", "processing.operate", "processing.documents.manage", "processing.archive", "health.view", "health.manage"];
const OPS = ["documents.read", "documents.write", "processing.operate"];

const P = {
    admin: { orgId: ORG_A, role: "admin", roleKeys: ["admin"], permissionKeys: ALL_ADMIN },
    ops: { orgId: ORG_A, role: "ops", roleKeys: ["ops"], permissionKeys: OPS },
    /** A portal role with no document authority. The projection names it `ops`. */
    customRole: { orgId: ORG_A, role: "ops", roleKeys: ["school_director"], permissionKeys: ["fin.read"] },
    readOnly: { orgId: ORG_A, role: "ops", roleKeys: ["auditor"], permissionKeys: ["documents.read"] },
    processingOnly: { orgId: ORG_A, role: "ops", roleKeys: ["intake_clerk"], permissionKeys: ["processing.operate"] },
    scopedOps: {
        orgId: ORG_A,
        role: "ops",
        roleKeys: ["ops"],
        permissionKeys: OPS,
        departmentScope: "restricted",
        allowedDepartmentIds: [DEPT_1],
    },
    scopedAdmin: {
        orgId: ORG_A,
        role: "admin",
        roleKeys: ["admin"],
        permissionKeys: ALL_ADMIN,
        departmentScope: "restricted",
        allowedDepartmentIds: [DEPT_1],
    },
    otherOrgAdmin: { orgId: ORG_B, role: "admin", roleKeys: ["admin"], permissionKeys: ALL_ADMIN },
} satisfies Record<string, Persona>;

const USER_ID = "05e00000-0000-4000-8000-000000000001";

function as(p: Persona, opts: { accessFails?: boolean } = {}) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: p.role, userId: USER_ID, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue(
        opts.accessFails
            ? { ok: false, status: 403 }
            : {
                  ok: true,
                  userId: USER_ID,
                  orgId: p.orgId,
                  roleKeys: p.roleKeys,
                  permissionKeys: p.permissionKeys,
                  departmentScope: p.departmentScope ?? "all",
                  allowedDepartmentIds: p.allowedDepartmentIds ?? null,
                  siteScope: "all",
                  allowedSiteLocationIds: null,
              },
    );
}

let db: InMemorySupabase;

beforeEach(() => {
    db = seededDb();
    dbRef.current = db;
    vi.clearAllMocks();
});

function auditRows(event?: string) {
    return db.rows("workflow_events").filter((r) => (event ? r.event_type === event : true));
}

const signedUrl = (id: string) =>
    invokeRoute(signedUrlGET, buildRequest({ path: `/api/admin/documents/${id}/signed-url` }), routeParams({ id }));
const sourcePreview = (id: string) =>
    invokeRoute(sourcePreviewGET, buildRequest({ path: `/api/admin/documents/${id}/source-preview` }), routeParams({ id }));
const extractedText = (id: string) =>
    invokeRoute(extractedTextGET, buildRequest({ path: `/api/admin/pos/documents/${id}/extracted-text` }), routeParams({ id }));
const vendorSignedUrl = (vendorId: string, documentId: string) =>
    invokeRoute(
        vendorSignedUrlGET,
        buildRequest({ path: `/api/admin/vendors/${vendorId}/documents/signed-url`, query: { document_id: documentId } }),
        routeParams({ id: vendorId }),
    );

// ── 1. Signed URL: role × capability × scope × subject ─────────────────────────────────────────

describe("signed-url — the actor × document matrix", () => {
    const EXPECT: Record<string, Partial<Record<keyof typeof DOC, number>>> = {
        admin: { child: 200, opp1: 200, opp2: 200, intake: 200, vendor: 200, unprefixed: 403, foreignPath: 403, traversal: 403, otherOrg: 404 },
        // `child` is an immunization record: since D1b.6 it needs `health.view`, so ops and a plain reader are refused.
        ops: { child: 403, opp1: 200, opp2: 200, intake: 200, vendor: 200, unprefixed: 403, foreignPath: 403, otherOrg: 404 },
        readOnly: { child: 403, opp1: 200, intake: 200 },
        customRole: { child: 403, opp1: 403, opp2: 403, intake: 403, vendor: 403 },
        processingOnly: { child: 403, intake: 403 },
        scopedOps: { opp1: 200, pluralOpp1: 200, opp2: 404, child: 404, intake: 404, vendor: 404 },
        otherOrgAdmin: { child: 404, opp1: 404, intake: 404 },
    };

    for (const [personaName, cases] of Object.entries(EXPECT)) {
        for (const [docName, status] of Object.entries(cases)) {
            it(`${personaName} → ${docName} = ${status}`, async () => {
                as(P[personaName as keyof typeof P]);
                const id = DOC[docName as keyof typeof DOC];
                const res = await signedUrl(id);
                expect(res.status).toBe(status);
                if (status === 200) {
                    expect(db.signCalls).toHaveLength(1);
                    expect(db.signCalls[0].path.startsWith(`${ORG_A}/`)).toBe(true);
                } else {
                    expect(db.signCalls).toHaveLength(0);
                    expect(auditRows("document_link_issued")).toHaveLength(0);
                }
            });
        }
    }

    it("the compatibility role alone no longer admits: a custom portal role is INSUFFICIENT_ROLE", async () => {
        as(P.customRole);
        const res = await signedUrl(DOC.child);
        expect(res.body).toMatchObject({ code: "INSUFFICIENT_ROLE" });
    });

    it("a row pointing at another tenant's object is refused as PATH_OUTSIDE_ORG and never signed", async () => {
        as(P.admin);
        const res = await signedUrl(DOC.foreignPath);
        expect(res.body).toMatchObject({ code: "PATH_OUTSIDE_ORG" });
        expect(db.signCalls).toHaveLength(0);
    });

    it("an unresolvable access context is refused rather than admitted on the legacy role", async () => {
        as(P.admin, { accessFails: true });
        const res = await signedUrl(DOC.opp1);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "SCOPE_DENIED" });
        expect(db.signCalls).toHaveLength(0);
    });

    it("an out-of-scope id is indistinguishable from a missing one", async () => {
        as(P.scopedOps);
        const outOfScope = await signedUrl(DOC.opp2);
        const missing = await signedUrl("d0c00000-0000-4000-8000-0000000000ff");
        expect(outOfScope.status).toBe(404);
        expect(outOfScope.body).toEqual(missing.body);
    });
});

// ── 2. Audit of link issuance ──────────────────────────────────────────────────────────────────

describe("signed-url — issuance is recorded before the link exists", () => {
    it("writes one document_link_issued event, with no URL and no storage path in it", async () => {
        as(P.admin);
        const res = await signedUrl(DOC.child);
        expect(res.status).toBe(200);
        const events = auditRows("document_link_issued");
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ org_id: ORG_A, entity_type: "documents", entity_id: DOC.child });
        const payload = JSON.stringify(events[0].payload);
        expect(payload).toContain(USER_ID);
        expect(payload).not.toContain("sig=");
        expect(payload).not.toContain("x-immunization.pdf");
    });

    it("refuses (503) and signs nothing when the audit cannot be written", async () => {
        as(P.admin);
        db.failInsertInto.add("workflow_events");
        const res = await signedUrl(DOC.child);
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ code: "AUDIT_UNAVAILABLE" });
        expect(db.signCalls).toHaveLength(0);
    });
});

// ── 3. Source preview and OCR text share the decision ──────────────────────────────────────────

describe("source-preview — same decision as the signer", () => {
    it("streams an in-scope text source", async () => {
        as(P.ops);
        const res = await sourcePreview(DOC.intake);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-security-policy")).toContain("sandbox");
        expect(db.downloadCalls).toEqual([{ bucket: BUCKET, path: `${ORG_A}/pos_intake/intake.txt` }]);
    });

    it("refuses an out-of-scope document before reading any bytes", async () => {
        as(P.scopedOps);
        const res = await sourcePreview(DOC.opp2);
        expect(res.status).toBe(404);
        expect(db.downloadCalls).toHaveLength(0);
    });

    it("refuses a custom portal role", async () => {
        as(P.customRole);
        const res = await sourcePreview(DOC.intake);
        expect(res.status).toBe(403);
        expect(db.downloadCalls).toHaveLength(0);
    });
});

describe("extracted-text — Processing authority AND the document decision", () => {
    it("serves the text to ops (processing.operate + documents.read)", async () => {
        as(P.ops);
        const res = await extractedText(DOC.intake);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: true, text: `extracted text of ${DOC.intake}` });
    });

    it("refuses a portal member without Processing authority — the D0 finding", async () => {
        as(P.customRole);
        const res = await extractedText(DOC.child);
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toContain("extracted text");
    });

    it("refuses Processing authority without document read", async () => {
        as(P.processingOnly);
        const res = await extractedText(DOC.child);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "INSUFFICIENT_ROLE" });
    });

    it("refuses a child's record outside a restricted actor's scope, and serves one inside it", async () => {
        as(P.scopedOps);
        expect((await extractedText(DOC.child)).status).toBe(404);
        expect((await extractedText(DOC.opp2)).status).toBe(404);
        expect((await extractedText(DOC.opp1)).status).toBe(200);
    });

    it("refuses another organization's document and a row whose path leaves its org", async () => {
        as(P.admin);
        expect((await extractedText(DOC.otherOrg)).status).toBe(404);
        const foreign = await extractedText(DOC.foreignPath);
        expect(foreign.status).toBe(403);
        expect(JSON.stringify(foreign.body)).not.toContain("extracted text");
    });
});

// ── 4. Lists ───────────────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/documents — documents.read and scope", () => {
    const list = () => invokeRoute(documentsListGET, buildRequest({ path: "/api/admin/documents" }));
    const ids = (body: unknown) => ((body as { documents?: Array<{ id: string }> }).documents ?? []).map((d) => d.id);

    it("refuses a portal member without documents.read", async () => {
        as(P.customRole);
        const res = await list();
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ required_permission: "documents.read" });
    });

    it("lists this organization's documents for a reader, and none of another's", async () => {
        as(P.readOnly);
        const res = await list();
        expect(res.status).toBe(200);
        expect(ids(res.body)).toContain(DOC.opp1);
        expect(ids(res.body)).not.toContain(DOC.otherOrg);
        // D1b.6: the immunization record is medical; a reader without health.view is not shown it.
        expect(ids(res.body)).not.toContain(DOC.child);
    });

    it("narrows a restricted actor to in-scope subjects — the same rule the signer applies", async () => {
        as(P.scopedOps);
        const got = ids((await list()).body);
        expect(got).toContain(DOC.opp1);
        expect(got).toContain(DOC.pluralOpp1);
        expect(got).not.toContain(DOC.opp2);
        expect(got).not.toContain(DOC.child);
        expect(got).not.toContain(DOC.intake);
    });
});

describe("GET /api/admin/pos/documents — processing.documents.manage, read and scope", () => {
    const list = () => invokeRoute(posListGET, buildRequest({ path: "/api/admin/pos/documents" }));
    const ids = (body: unknown) => ((body as { documents?: Array<{ documentId: string }> }).documents ?? []).map((d) => d.documentId);

    it("refuses ops (processing.operate is not processing.documents.manage)", async () => {
        as(P.ops);
        expect((await list()).status).toBe(403);
    });

    it("refuses a custom portal role", async () => {
        as(P.customRole);
        expect((await list()).status).toBe(403);
    });

    it("lists for an administrator and narrows a restricted one", async () => {
        as(P.admin);
        const all = await list();
        expect(all.status).toBe(200);
        expect(ids(all.body)).toContain(DOC.child);

        as(P.scopedAdmin);
        const scoped = ids((await list()).body);
        expect(scoped).toContain(DOC.opp1);
        expect(scoped).not.toContain(DOC.child);
        expect(scoped).not.toContain(DOC.opp2);
    });
});

describe("GET /api/admin/documents/entity-options — documents.write", () => {
    const options = () =>
        invokeRoute(entityOptionsGET, buildRequest({ path: "/api/admin/documents/entity-options", query: { entity_type: "customer" } }));

    it("refuses a reader and a custom portal role", async () => {
        as(P.readOnly);
        expect((await options()).status).toBe(403);
        as(P.customRole);
        expect((await options()).status).toBe(403);
    });

    it("answers a writer", async () => {
        as(P.ops);
        const res = await options();
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toContain("Household One");
    });
});

// ── 5. Upload ──────────────────────────────────────────────────────────────────────────────────

function uploadRequest(fields: Record<string, string>, file: Blob, fileName = "note.txt"): NextRequest {
    const form = new FormData();
    form.set("file", new File([file], fileName, { type: file.type || "text/plain" }));
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return new NextRequest("http://localhost:3012/api/admin/documents/upload", { method: "POST", body: form });
}
const upload = (fields: Record<string, string>, file: Blob, name?: string) => invokeRoute(uploadPOST, uploadRequest(fields, file, name));

describe("POST /api/admin/documents/upload — documents.write, Processing authority, size", () => {
    const text = new Blob(["hello"], { type: "text/plain" });

    it("admits ops, which holds documents.write (the legacy admin-only gate refused it)", async () => {
        as(P.ops);
        const res = await upload({ entity_type: "customer", entity_id: CUSTOMER }, text);
        expect(res.status).toBe(200);
        expect(db.uploadCalls).toHaveLength(1);
        expect(db.uploadCalls[0].path.startsWith(`${ORG_A}/customer/${CUSTOMER}/`)).toBe(true);
    });

    it("refuses a reader and a custom portal role before anything is stored", async () => {
        for (const p of [P.readOnly, P.customRole]) {
            as(p);
            const res = await upload({ entity_type: "customer", entity_id: CUSTOMER }, text);
            expect(res.status).toBe(403);
        }
        expect(db.uploadCalls).toHaveLength(0);
    });

    it("refuses to open or join a Processing case without processing.operate", async () => {
        as({ ...P.ops, permissionKeys: ["documents.read", "documents.write"] });
        const opened = await upload({ open_processing_case: "true" }, text);
        expect(opened.status).toBe(403);
        const attached = await upload({ attach_to_case_id: "ca5e0000-0000-4000-8000-000000000001" }, text);
        expect(attached.status).toBe(403);
        expect(db.uploadCalls).toHaveLength(0);
        expect(db.rows("documents").filter((r) => String(r.storage_path).includes("pos_intake/") && r.id !== DOC.intake)).toHaveLength(0);
    });

    it("refuses a file over the limit with 413 and stores nothing", async () => {
        as(P.admin);
        const big = new Blob([new Uint8Array(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES + 1).fill(0x61)], { type: "text/plain" });
        const res = await upload({ entity_type: "customer", entity_id: CUSTOMER }, big);
        expect(res.status).toBe(413);
        expect(res.body).toMatchObject({ code: "FILE_TOO_LARGE" });
        expect(db.uploadCalls).toHaveLength(0);
    });

    it("D4: records the upload before storing it, names the stored document, never the path, and keeps the uploader", async () => {
        as(P.admin);
        const res = await upload({ entity_type: "customer", entity_id: CUSTOMER }, text);
        expect(res.status).toBe(200);
        const stored = db.rows("documents").find((r) => String(r.storage_path).startsWith(`${ORG_A}/customer/${CUSTOMER}/`));
        const event = db.rows("workflow_events").find((e) => e.event_type === "document_upload_authorized");
        expect(event).toMatchObject({ entity_type: "documents", entity_id: stored?.id });
        expect(JSON.stringify(event?.payload)).not.toContain(String(stored?.storage_path));
        expect((stored?.metadata as Record<string, unknown>).uploaded_by).toBe(USER_ID);
        expect((stored?.metadata as Record<string, unknown>).upload_audit_event_id).toBe(event?.id);
    });

    it("D4: an upload that cannot be recorded stores nothing (503 AUDIT_UNAVAILABLE)", async () => {
        as(P.admin);
        db.failInsertInto.add("workflow_events");
        const before = db.rows("documents").length;
        const res = await upload({ entity_type: "customer", entity_id: CUSTOMER }, text);
        expect(res.status).toBe(503);
        expect(db.uploadCalls).toHaveLength(0);
        expect(db.rows("documents")).toHaveLength(before);
    });

    it("accepts a file exactly at the limit", async () => {
        as(P.admin);
        const atLimit = new Blob([new Uint8Array(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES).fill(0x61)], { type: "text/plain" });
        const res = await upload({ entity_type: "customer", entity_id: CUSTOMER }, atLimit);
        expect(res.status).toBe(200);
    });
});

// ── 5b. Upload size — the APPLICATION boundary ─────────────────────────────────────────────────
//
// Hosted, the Vercel request-body limit (~4.5 MB) answers 413 long before this route runs, so a
// hosted 413 proves nothing about the application check. This exercises the route's own validation
// at the exact boundary, and proves a rejection persists nothing: no stored object, no document row,
// no workflow event. Recorded as APP_BOUNDARY_CERTIFIED / HOSTED_TRANSPORT_LIMITED.

describe("upload size — application boundary (10 MB), rejection before persistence", () => {
    // Text bytes: since D1b.3 a `.txt` must actually be text, so zero-filled buffers are refused as CONTENT_MISMATCH.
    const at = (n: number) => new Blob([new Uint8Array(n).fill(0x61)], { type: "text/plain" });
    const target = { entity_type: "customer", entity_id: CUSTOMER };
    const persisted = () => ({
        uploads: db.uploadCalls.length,
        documents: db.rows("documents").length,
        events: db.rows("workflow_events").length,
    });

    it("the limit is exactly 10 MiB", () => {
        expect(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024);
    });

    it("accepts one byte under the limit and stores it", async () => {
        as(P.admin);
        const before = persisted();
        const res = await upload(target, at(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES - 1));
        expect(res.status).toBe(200);
        expect(db.uploadCalls.at(-1)?.bytes).toBe(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES - 1);
        expect(persisted().documents).toBe(before.documents + 1);
    });

    it("accepts exactly the limit", async () => {
        as(P.admin);
        const res = await upload(target, at(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES));
        expect(res.status).toBe(200);
        expect(db.uploadCalls.at(-1)?.bytes).toBe(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES);
    });

    it("refuses one byte over the limit with 413 and persists nothing", async () => {
        as(P.admin);
        const before = persisted();
        const res = await upload(target, at(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES + 1));
        expect(res.status).toBe(413);
        expect(res.body).toMatchObject({ code: "FILE_TOO_LARGE", max_bytes: ADMIN_DOCUMENT_UPLOAD_MAX_BYTES });
        expect(persisted()).toEqual(before);
    });

    it("refuses a body whose declared length cannot fit, before parsing it", async () => {
        as(P.admin);
        const before = persisted();
        const form = new FormData();
        form.set("file", new File([at(16)], "small.txt", { type: "text/plain" }));
        form.set("entity_type", "customer");
        form.set("entity_id", CUSTOMER);
        const req = new NextRequest("http://localhost:3012/api/admin/documents/upload", { method: "POST", body: form });
        const formDataSpy = vi.spyOn(req, "formData");
        const declared = new NextRequest(req, {
            headers: { ...Object.fromEntries(req.headers), "content-length": String(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES + 128 * 1024) },
        });
        const parseSpy = vi.spyOn(declared, "formData");
        const res = await invokeRoute(uploadPOST, declared);
        expect(res.status).toBe(413);
        expect(parseSpy).not.toHaveBeenCalled();
        expect(formDataSpy).not.toHaveBeenCalled();
        expect(persisted()).toEqual(before);
    });

    it("an unauthorized oversize upload is refused for authority first, still persisting nothing", async () => {
        as(P.readOnly);
        const before = persisted();
        const res = await upload(target, at(ADMIN_DOCUMENT_UPLOAD_MAX_BYTES + 1));
        expect(res.status).toBe(403);
        expect(persisted()).toEqual(before);
    });
});

// ── 6. Status PATCH ───────────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/documents/[id] — documents.write and scope", () => {
    const patch = (id: string) =>
        invokeRoute(
            documentPATCH,
            buildRequest({ method: "PATCH", path: `/api/admin/documents/${id}`, body: { status_key: "" } }),
            routeParams({ id }),
        );

    it("admits ops (documents.write) where the legacy gate admitted only admin", async () => {
        as(P.ops);
        expect((await patch(DOC.opp1)).status).toBe(200);
    });

    it("refuses a reader", async () => {
        as(P.readOnly);
        const res = await patch(DOC.opp1);
        expect(res.status).toBe(403);
        expect(db.rows("documents").find((r) => r.id === DOC.opp1)?.status).toBe("uploaded");
    });

    it("refuses a restricted writer on a document outside their scope and changes nothing", async () => {
        as(P.scopedOps);
        const res = await patch(DOC.opp2);
        expect(res.status).toBe(404);
        expect(db.rows("documents").find((r) => r.id === DOC.opp2)?.status).toBe("uploaded");
    });
});

// ── 7. Vendor documents ────────────────────────────────────────────────────────────────────────

describe("vendor signed-url — the document must belong to the vendor", () => {
    it("signs a document attached to this vendor", async () => {
        as(P.admin);
        const res = await vendorSignedUrl(VENDOR_1, DOC.vendor);
        expect(res.status).toBe(200);
        expect(auditRows("document_link_issued")[0]?.payload).toMatchObject({ vendor_id: VENDOR_1 });
    });

    it("signs a file the vendor row references", async () => {
        as(P.admin);
        expect((await vendorSignedUrl(VENDOR_2, DOC.vendorRef)).status).toBe(200);
    });

    it("refuses a child's record requested under a vendor's name — the D0 finding", async () => {
        as(P.admin);
        const res = await vendorSignedUrl(VENDOR_1, DOC.child);
        expect(res.status).toBe(404);
        expect(db.signCalls).toHaveLength(0);
        expect(auditRows()).toHaveLength(0);
    });

    it("refuses another vendor's file", async () => {
        as(P.admin);
        expect((await vendorSignedUrl(VENDOR_1, DOC.vendorRef)).status).toBe(404);
        expect((await vendorSignedUrl(VENDOR_2, DOC.vendor)).status).toBe(404);
        expect(db.signCalls).toHaveLength(0);
    });

    it("refuses a legacy unprefixed vendor object", async () => {
        as(P.admin);
        const res = await vendorSignedUrl(VENDOR_1, DOC.unprefixed);
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "PATH_OUTSIDE_ORG" });
    });
});

// ── 8. Processing source deletion ──────────────────────────────────────────────────────────────

describe("DELETE /api/admin/pos/documents/[id] — audited before it acts", () => {
    const del = (id: string) =>
        invokeRoute(posDocDELETE, buildRequest({ method: "DELETE", path: `/api/admin/pos/documents/${id}` }), routeParams({ id }));

    it("records the deletion, then removes the row and the object", async () => {
        as(P.admin);
        const res = await del(DOC.intake);
        expect(res.status).toBe(200);
        expect(auditRows("document_delete_authorized")).toHaveLength(1);
        expect(auditRows("document_delete_authorized")[0]).toMatchObject({ entity_type: "documents", entity_id: DOC.intake });
        expect(db.removeCalls).toEqual([{ bucket: BUCKET, paths: [`${ORG_A}/pos_intake/intake.txt`] }]);
        expect(db.rows("documents").some((r) => r.id === DOC.intake)).toBe(false);
    });

    it("deletes nothing when the record cannot be written", async () => {
        as(P.admin);
        db.failInsertInto.add("workflow_events");
        const res = await del(DOC.intake);
        expect(res.status).toBe(503);
        expect(db.removeCalls).toHaveLength(0);
        expect(db.rows("documents").some((r) => r.id === DOC.intake)).toBe(true);
    });

    it("refuses a row whose stored file is outside the organization, touching nothing", async () => {
        as(P.admin);
        const res = await del(DOC.foreignPath);
        expect(res.status).toBe(409);
        expect(db.removeCalls).toHaveLength(0);
        expect(db.rows("documents").some((r) => r.id === DOC.foreignPath)).toBe(true);
    });

    it("still refuses ops (processing.documents.manage is admin-only)", async () => {
        as(P.ops);
        expect((await del(DOC.intake)).status).toBe(403);
    });
});

// ── 9. Profile photo set / clear ───────────────────────────────────────────────────────────────

describe("profile photo — set and clear are audited; set signs only what it may read", () => {
    const set = (personId: string, documentId: string) =>
        invokeRoute(
            profilePhotoPOST,
            buildRequest({ method: "POST", path: `/api/admin/persons/${personId}/profile-photo`, body: { document_id: documentId } }),
            routeParams({ id: personId }),
        );
    const clear = (personId: string) =>
        invokeRoute(
            profilePhotoDELETE,
            buildRequest({ method: "DELETE", path: `/api/admin/persons/${personId}/profile-photo` }),
            routeParams({ id: personId }),
        );
    const meta = () => db.rows("persons").find((r) => r.id === PERSON)?.metadata as Record<string, unknown>;

    it("records person_profile_photo_set and moves the pointer", async () => {
        as(P.ops);
        const res = await set(PERSON, DOC.photo);
        expect(res.status).toBe(200);
        expect(auditRows("person_profile_photo_set")).toHaveLength(1);
        expect(auditRows("person_profile_photo_set")[0]).toMatchObject({ entity_type: "persons", entity_id: PERSON });
        expect(meta().profile_photo_document_id).toBe(DOC.photo);
    });

    it("leaves the pointer alone when the record cannot be written", async () => {
        as(P.ops);
        db.failInsertInto.add("workflow_events");
        expect((await set(PERSON, DOC.photo)).status).toBe(503);
        expect(meta().profile_photo_document_id).toBeUndefined();
        expect(db.signCalls).toHaveLength(0);
    });

    it("records person_profile_photo_cleared, and refuses to clear unrecorded", async () => {
        as(P.ops);
        await set(PERSON, DOC.photo);
        db.failInsertInto.add("workflow_events");
        expect((await clear(PERSON)).status).toBe(503);
        expect(meta().profile_photo_document_id).toBe(DOC.photo);
        db.failInsertInto.clear();
        expect((await clear(PERSON)).status).toBe(200);
        expect(auditRows("person_profile_photo_cleared")).toHaveLength(1);
        expect(meta().profile_photo_document_id).toBeUndefined();
    });

    it("does not sign a photo for a writer whose scope cannot place the person (fail closed)", async () => {
        as(P.scopedOps);
        const res = await set(PERSON, DOC.photo);
        expect(res.status).toBe(404);
        expect(db.signCalls).toHaveLength(0);
        expect(meta().profile_photo_document_id).toBeUndefined();
    });
});

// ── 10. Decision-level properties ──────────────────────────────────────────────────────────────

describe("decision function — canonical entity types, path prefix, explicit scope", () => {
    it("canonicalises plural and singular stored types to one vocabulary", () => {
        expect(canonicalDocumentEntityType("opportunities")).toBe("opportunity");
        expect(canonicalDocumentEntityType("customer_members")).toBe("customer_member");
        expect(canonicalDocumentEntityType("persons")).toBe("person");
        expect(canonicalDocumentEntityType(" Vendor ")).toBe("vendor");
        expect(canonicalDocumentEntityType(null)).toBeNull();
        expect(canonicalDocumentEntityType("widget")).toBe("widget");
    });

    it("reports the canonical type on an allowed decision, whatever the row spelled", async () => {
        const d = await assertDocumentAccess({
            supabase: db as never,
            actor: {
                ok: true,
                orgId: ORG_A,
                roleKeys: ["ops"],
                permissionKeys: ["documents.read"],
                scope: { departmentScope: "restricted", allowedDepartmentIds: [DEPT_1], siteScope: "all", allowedSiteLocationIds: null },
            },
            documentId: DOC.pluralOpp1,
            operation: "download",
        });
        expect(d.outcome).toBe("allowed");
        if (d.outcome === "allowed") expect(d.document.entityType).toBe("opportunity");
    });

    it("isStoragePathWithinOrg accepts only paths under <org>/ and refuses escapes", () => {
        expect(isStoragePathWithinOrg(`${ORG_A}/customer_member/x/a.pdf`, ORG_A)).toBe(true);
        expect(isStoragePathWithinOrg(`${ORG_B}/customer_member/x/a.pdf`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`vendors/${VENDOR_1}/insurance/a.png`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`${ORG_A}/../${ORG_B}/a.pdf`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`/${ORG_A}/a.pdf`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`${ORG_A}`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`${ORG_A}//a.pdf`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`${ORG_A}x/a.pdf`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`${ORG_A}\\..\\a.pdf`, ORG_A)).toBe(false);
        expect(isStoragePathWithinOrg(`${ORG_A}/a.pdf`, "")).toBe(false);
    });

    it("a server-side byte read refuses a row whose path leaves its organization", async () => {
        const out = await downloadDocumentBytesSafe(db as never, { orgId: ORG_A, documentId: DOC.foreignPath });
        expect(out).toBeNull();
        expect(db.downloadCalls).toHaveLength(0);
        const ok = await downloadDocumentBytesSafe(db as never, { orgId: ORG_A, documentId: DOC.intake });
        expect(ok?.bytes.length).toBeGreaterThan(0);
    });
});

// ── 11. What D1a deliberately did NOT change: caller-authorized avatars ───────────────────────

describe("avatar projection — pre-D1a admission preserved, path prefix now enforced", () => {
    it("a portal role the projection calls `ops` still sees an avatar its caller already authorized", async () => {
        db.rows("persons")[0].metadata = { profile_photo_document_id: DOC.photo };
        const actor = documentActorFromAdminParts({ ok: true, orgId: ORG_A, role: "ops", roleKeys: ["school_director"], permissionKeys: [] });
        expect(actor.scope).toBe(DOCUMENT_SCOPE_AUTHORIZED_BY_CALLER);
        const photos = await resolveProfilePhotosForActor({
            supabase: db as never,
            actor,
            people: [{ personId: PERSON, metadata: { profile_photo_document_id: DOC.photo } }],
        });
        expect(photos.get(PERSON)?.photoUrl).toBeTruthy();
    });

    it("but never signs an avatar whose path leaves the organization", async () => {
        const actor = documentActorFromAdminParts({ ok: true, orgId: ORG_A, role: "admin", roleKeys: ["admin"], permissionKeys: [] });
        const photos = await resolveProfilePhotosForActor({
            supabase: db as never,
            actor,
            people: [{ personId: PERSON, metadata: { profile_photo_document_id: DOC.foreignPath } }],
        });
        expect(photos.get(PERSON)?.photoUrl).toBeNull();
        expect(db.signCalls).toHaveLength(0);
    });
});
