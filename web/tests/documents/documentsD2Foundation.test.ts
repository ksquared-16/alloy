/**
 * D2 — the canonical document foundation, through the real routes.
 *
 * As in the D1a/D1b/D1c-1 suites, handlers and every authorization helper run unmodified; only the session and the
 * service-role client are substituted. The governed database functions (`document_add_version`,
 * `document_set_primary_subject`, …) are stood in for by in-memory equivalents with the same effect; the database's own
 * guards (immutability, raise-only sensitivity, one primary, the single writer) are proven against Postgres by
 * certification/invariants/documents-d2-canonical-foundation.sql.
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

import { PATCH as documentPATCH } from "@/app/api/admin/documents/[id]/route";
import { GET as versionsGET, POST as versionsPOST } from "@/app/api/admin/documents/[id]/versions/route";
import { GET as subjectsGET, POST as subjectsPOST } from "@/app/api/admin/documents/[id]/subjects/route";
import { POST as sensitivityPOST } from "@/app/api/admin/documents/[id]/sensitivity/route";
import { GET as signedUrlGET } from "@/app/api/admin/documents/[id]/signed-url/route";
import {
    actorMayReadSensitivity,
    classForDeclaredSensitivity,
    resolveDocumentSensitivity,
} from "@/lib/documents/documentSensitivity";
import { documentSubjectTypeForLegacy, legacyEntityTypeForSubject } from "@/lib/documents/documentSubjects";

const ORG = "0a000000-0000-4000-8000-0000000000d2";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d2";
const USER = "05e00000-0000-4000-8000-0000000000d2";
const OPP1 = "0c000000-0000-4000-8000-000000000001";
const OPP2 = "0c000000-0000-4000-8000-000000000002";
const DEPT_A = "de000000-0000-4000-8000-00000000000a";
const DEPT_B = "de000000-0000-4000-8000-00000000000b";
const DOC = {
    opp1: "d2000000-0000-4000-8000-000000000001",
    opp2: "d2000000-0000-4000-8000-000000000002",
    quarantined: "d2000000-0000-4000-8000-000000000003",
    deleted: "d2000000-0000-4000-8000-000000000004",
    restricted: "d2000000-0000-4000-8000-000000000005",
    medical: "d2000000-0000-4000-8000-000000000006",
} as const;
const V1 = "e2000000-0000-4000-8000-000000000001";
const V_OTHER = "e2000000-0000-4000-8000-000000000002";
const BUCKET = "org_documents";

type Persona = { orgId: string; role: "admin" | "ops"; roleKeys: string[]; permissionKeys: string[]; depts?: string[] };
// D3 (20261209090000): every organization's admin role holds the two sensitive-read keys by grant.
const ADMIN_KEYS = ["documents.read", "documents.write", "processing.operate", "health.view", "documents.identity.read", "documents.restricted.read"];
const P = {
    admin: { orgId: ORG, role: "admin", roleKeys: ["admin"], permissionKeys: ADMIN_KEYS },
    ops: { orgId: ORG, role: "ops", roleKeys: ["ops"], permissionKeys: ["portal.access", "documents.read", "documents.write"] },
    reader: { orgId: ORG, role: "ops", roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    noDocs: { orgId: ORG, role: "ops", roleKeys: ["qa_no_docs"], permissionKeys: ["portal.access"] },
    scopedOps: { orgId: ORG, role: "ops", roleKeys: ["ops"], permissionKeys: ["portal.access", "documents.read", "documents.write"], depts: [DEPT_A] },
    otherOrgAdmin: { orgId: OTHER_ORG, role: "admin", roleKeys: ["admin"], permissionKeys: ADMIN_KEYS },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: p.role, userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true,
        userId: USER,
        orgId: p.orgId,
        roleKeys: p.roleKeys,
        permissionKeys: p.permissionKeys,
        departmentScope: p.depts ? "restricted" : "all",
        allowedDepartmentIds: p.depts ?? null,
        siteScope: "all",
        allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;

/** In-memory stand-ins for the governed functions: the same effect on the same rows. */
function installRpc() {
    rpcCalls = [];
    (db as unknown as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (name === "document_add_version") {
            const doc = db.rows("documents").find((d) => d.id === args.p_document_id && d.org_id === args.p_org_id);
            if (!doc) return { data: null, error: { message: "document_not_found" } };
            const versions = db.rows("document_versions").filter((v) => v.document_id === doc.id);
            const id = `e2000000-0000-4000-8000-0000000001${String(versions.length).padStart(2, "0")}`;
            const number = Math.max(0, ...versions.map((v) => Number(v.version_number))) + 1;
            db.tables.document_versions = [
                ...db.rows("document_versions"),
                {
                    id, org_id: doc.org_id, document_id: doc.id, version_number: number, bucket: args.p_bucket, storage_path: args.p_storage_path,
                    checksum_sha256: args.p_checksum_sha256, source: "replacement", supersedes_version_id: doc.current_version_id,
                    replacement_reason: args.p_reason, created_by: args.p_actor, created_at: new Date().toISOString(),
                },
            ];
            const supersedes = doc.current_version_id;
            Object.assign(doc, { current_version_id: id, storage_path: args.p_storage_path, checksum_sha256: args.p_checksum_sha256 });
            return { data: { version_id: id, version_number: number, supersedes_version_id: supersedes }, error: null };
        }
        if (name === "document_set_primary_subject") {
            const doc = db.rows("documents").find((d) => d.id === args.p_document_id && d.org_id === args.p_org_id);
            if (!doc) return { data: null, error: { message: "document_not_found" } };
            const exists = db.rows("opportunities").some((o) => o.id === args.p_subject_id && o.org_id === args.p_org_id);
            if (!exists) return { data: null, error: { message: "document_subject_unresolved: opportunity is not a subject of this organization" } };
            Object.assign(doc, { entity_type: legacyEntityTypeForSubject("opportunity"), entity_id: args.p_subject_id });
            return { data: { document_id: doc.id }, error: null };
        }
        if (name === "is_medical_form_submission") return { data: false, error: null };
        return { data: null, error: { message: `unexpected rpc ${name}` } };
    };
}

function doc(id: string, over: Record<string, unknown> = {}) {
    return {
        id, org_id: ORG, bucket: BUCKET, storage_path: `${ORG}/opportunity/${OPP1}/${id}.pdf`, entity_type: "opportunity", entity_id: OPP1,
        doc_type: null, status: "uploaded", sensitivity: "standard", current_version_id: null, metadata: {}, ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    db = new InMemorySupabase();
    db.seed("opportunities", [
        { id: OPP1, org_id: ORG, department_id: DEPT_A },
        { id: OPP2, org_id: ORG, department_id: DEPT_B },
    ]);
    db.seed("documents", [
        doc(DOC.opp1, { current_version_id: V1 }),
        doc(DOC.opp2, { entity_id: OPP2, storage_path: `${ORG}/opportunity/${OPP2}/${DOC.opp2}.pdf` }),
        doc(DOC.quarantined, { status: "quarantined" }),
        doc(DOC.deleted, { status: "deleted" }),
        doc(DOC.restricted, { sensitivity: "restricted" }),
        doc(DOC.medical, { sensitivity: "medical" }),
    ]);
    db.seed("document_versions", [
        { id: V1, org_id: ORG, document_id: DOC.opp1, version_number: 1, bucket: BUCKET, storage_path: `${ORG}/opportunity/${OPP1}/${DOC.opp1}.pdf`, source: "legacy_backfill", created_at: "2026-10-01T00:00:00Z" },
        { id: V_OTHER, org_id: ORG, document_id: DOC.opp2, version_number: 1, bucket: BUCKET, storage_path: `${ORG}/opportunity/${OPP2}/${DOC.opp2}.pdf`, source: "legacy_backfill", created_at: "2026-10-01T00:00:00Z" },
    ]);
    db.putObject(BUCKET, `${ORG}/opportunity/${OPP1}/${DOC.opp1}.pdf`);
    installRpc();
    dbRef.current = db;
});

const audits = (event: string) => db.rows("workflow_events").filter((e) => e.event_type === event);

async function cleanPdf() {
    const d = await PDFDocument.create();
    d.addPage([100, 100]);
    return d.save();
}
const jsPdf = () =>
    new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1"));

function replace(id: string, bytes: Uint8Array, reason = "Corrected scan from the family") {
    const form = new FormData();
    form.set("file", new File([bytes as unknown as BlobPart], "corrected.pdf", { type: "application/pdf" }));
    if (reason) form.set("reason", reason);
    return invokeRoute(versionsPOST, new NextRequest(`http://localhost/api/admin/documents/${id}/versions`, { method: "POST", body: form }), routeParams({ id }));
}

// ── declared sensitivity ─────────────────────────────────────────────────────────────────────────────────────────

describe("declared sensitivity (D2.4)", () => {
    it("maps the declared vocabulary to classes; an unknown value is restricted", () => {
        expect(classForDeclaredSensitivity("standard")).toBeNull();
        expect(classForDeclaredSensitivity("medical")).toBe("medical");
        expect(classForDeclaredSensitivity("custody_safeguarding")).toBe("safeguarding");
        expect(classForDeclaredSensitivity("personal_identity")).toBe("personal_identity");
        expect(classForDeclaredSensitivity("restricted")).toBe("restricted");
        expect(classForDeclaredSensitivity("top_secret")).toBe("restricted");
    });

    it("personal_identity and restricted are cleared by their key or the owner role; every class needs its own clearance", () => {
        const ops = { roleKeys: ["ops"], permissionKeys: ["documents.read", "health.view"] };
        const admin = { roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.identity.read", "documents.restricted.read"] };
        const adminWithoutKeys = { roleKeys: ["admin"], permissionKeys: ["documents.read"] };
        const owner = { roleKeys: ["owner"], permissionKeys: [] };
        const custom = { roleKeys: ["qa_doc_reader"], permissionKeys: ["documents.read", "documents.identity.read"] };
        expect(actorMayReadSensitivity(ops, new Set(["personal_identity"]))).toBe(false);
        expect(actorMayReadSensitivity(ops, new Set(["restricted"]))).toBe(false);
        expect(actorMayReadSensitivity(admin, new Set(["restricted"]))).toBe(true);
        expect(actorMayReadSensitivity(admin, new Set(["personal_identity"]))).toBe(true);
        // D3: the role alone no longer clears; an organization that removes the key from its admin role means it.
        expect(actorMayReadSensitivity(adminWithoutKeys, new Set(["restricted"]))).toBe(false);
        // The owner role holds no seeded grants and keeps the clearance it always had.
        expect(actorMayReadSensitivity(owner, new Set(["restricted", "personal_identity"]))).toBe(true);
        // One key never clears the other class.
        expect(actorMayReadSensitivity(custom, new Set(["personal_identity"]))).toBe(true);
        expect(actorMayReadSensitivity(custom, new Set(["restricted"]))).toBe(false);
        // A union: clearance for one class never covers another.
        expect(actorMayReadSensitivity(admin, new Set(["restricted", "medical"]))).toBe(false);
    });

    it("the declared class adds to the inference and never removes it", async () => {
        const m = await resolveDocumentSensitivity(db as never, ORG, [{ id: DOC.restricted, doc_type: "immunization_record" }]);
        expect([...(m.get(DOC.restricted) ?? [])].sort()).toEqual(["medical", "restricted"]);
    });

    it("before the migration (42703) only the inference applies; any other read failure fails closed", async () => {
        const failing = (code: string) => ({
            from: (t: string) => (t === "documents" ? { select: () => ({ eq: () => ({ in: async () => ({ data: null, error: { code, message: "x" } }) }) }) } : db.from(t)),
            rpc: async () => ({ data: false, error: null }),
        });
        const pre = await resolveDocumentSensitivity(failing("42703") as never, ORG, [{ id: DOC.opp1, doc_type: null }]);
        expect([...(pre.get(DOC.opp1) ?? [])]).toEqual([]);
        const broken = await resolveDocumentSensitivity(failing("57014") as never, ORG, [{ id: DOC.opp1, doc_type: null }]);
        expect([...(broken.get(DOC.opp1) ?? [])].sort()).toEqual(["medical", "personal_identity", "restricted", "safeguarding"]);
    });

    it("a restricted document is refused to a reader and to ops, and signed for an admin", async () => {
        as(P.reader);
        expect((await invokeRoute(signedUrlGET, buildRequest({ path: `/api/admin/documents/${DOC.restricted}/signed-url` }), routeParams({ id: DOC.restricted }))).status).toBe(403);
        as(P.ops);
        expect((await invokeRoute(signedUrlGET, buildRequest({ path: `/api/admin/documents/${DOC.restricted}/signed-url` }), routeParams({ id: DOC.restricted }))).status).toBe(403);
        as(P.admin);
        db.putObject(BUCKET, `${ORG}/opportunity/${OPP1}/${DOC.restricted}.pdf`);
        expect((await invokeRoute(signedUrlGET, buildRequest({ path: `/api/admin/documents/${DOC.restricted}/signed-url` }), routeParams({ id: DOC.restricted }))).status).toBe(200);
    });
});

describe("POST /api/admin/documents/[id]/sensitivity — raise only, own clearance, audited first", () => {
    const raise = (id: string, sensitivity: string, reason = "Contains a passport scan") =>
        invokeRoute(sensitivityPOST, buildRequest({ method: "POST", path: `/api/admin/documents/${id}/sensitivity`, body: { sensitivity, reason } }), routeParams({ id }));

    it("ops cannot declare a class they are not cleared for", async () => {
        as(P.ops);
        const res = await raise(DOC.opp1, "restricted");
        expect(res.status).toBe(403);
        expect(db.rows("documents").find((d) => d.id === DOC.opp1)?.sensitivity).toBe("standard");
        expect(audits("document_sensitivity_raised")).toHaveLength(0);
    });

    it("an admin raises standard → personal_identity, recorded before the change", async () => {
        as(P.admin);
        const res = await raise(DOC.opp1, "personal_identity");
        expect(res.status).toBe(200);
        expect(db.rows("documents").find((d) => d.id === DOC.opp1)?.sensitivity).toBe("personal_identity");
        expect(audits("document_sensitivity_raised")[0]?.payload).toMatchObject({ from: "standard", to: "personal_identity" });
    });

    it("medical → personal_identity is a lowering of the medical class and is refused", async () => {
        as(P.admin);
        const res = await raise(DOC.medical, "personal_identity");
        expect(res.status).toBe(409);
        expect(db.rows("documents").find((d) => d.id === DOC.medical)?.sensitivity).toBe("medical");
    });
});

// ── lifecycle statuses (preflight defect) ────────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/documents/[id] — lifecycle statuses have their own audited paths", () => {
    const patch = (id: string, status_key: string) =>
        invokeRoute(documentPATCH, buildRequest({ method: "PATCH", path: `/api/admin/documents/${id}`, body: { status_key } }), routeParams({ id }));

    it("a writer cannot release a quarantined file by setting its status", async () => {
        as(P.ops);
        const res = await patch(DOC.quarantined, "uploaded");
        expect(res.status).toBe(409);
        expect(db.rows("documents").find((d) => d.id === DOC.quarantined)?.status).toBe("quarantined");
    });

    it("a writer cannot bring back a deleted document, or quarantine one by status", async () => {
        as(P.ops);
        expect((await patch(DOC.deleted, "uploaded")).status).toBe(409);
        expect(db.rows("documents").find((d) => d.id === DOC.deleted)?.status).toBe("deleted");
        expect((await patch(DOC.opp1, "quarantined")).status).toBe(409);
        expect(db.rows("documents").find((d) => d.id === DOC.opp1)?.status).toBe("uploaded");
    });
});

// ── versions ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe("document versions (D2.1)", () => {
    it("lists versions with the current one marked, and never a storage path", async () => {
        as(P.reader);
        const res = await invokeRoute(versionsGET, buildRequest({ path: `/api/admin/documents/${DOC.opp1}/versions` }), routeParams({ id: DOC.opp1 }));
        expect(res.status).toBe(200);
        const body = res.body as { versions: Array<Record<string, unknown>> };
        expect(body.versions).toHaveLength(1);
        expect(body.versions[0]).toMatchObject({ id: V1, version_number: 1, is_current: true });
        expect(JSON.stringify(body)).not.toContain("storage_path");
        expect(JSON.stringify(body)).not.toContain(`${ORG}/`);
    });

    it("the list is refused exactly where the document is: no admission, another organization, a sensitive class", async () => {
        as(P.noDocs);
        expect((await invokeRoute(versionsGET, buildRequest({ path: `/x` }), routeParams({ id: DOC.opp1 }))).status).toBe(403);
        as(P.otherOrgAdmin);
        expect((await invokeRoute(versionsGET, buildRequest({ path: `/x` }), routeParams({ id: DOC.opp1 }))).status).toBe(404);
        as(P.reader);
        expect((await invokeRoute(versionsGET, buildRequest({ path: `/x` }), routeParams({ id: DOC.restricted }))).status).toBe(403);
    });

    it("a clean replacement becomes version 2; version 1 is kept and is still signed, audited with its version", async () => {
        as(P.ops);
        const res = await replace(DOC.opp1, await cleanPdf());
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ version_number: 2, supersedes_version_id: V1 });
        expect(db.rows("document_versions").filter((v) => v.document_id === DOC.opp1)).toHaveLength(2);
        expect(audits("document_version_added")).toHaveLength(1);
        expect(rpcCalls.find((c) => c.name === "document_add_version")?.args).toMatchObject({ p_reason: "Corrected scan from the family" });

        const hist = await invokeRoute(
            signedUrlGET,
            buildRequest({ path: `/api/admin/documents/${DOC.opp1}/signed-url?version=${V1}` }),
            routeParams({ id: DOC.opp1 }),
        );
        expect(hist.status).toBe(200);
        expect(db.signCalls.at(-1)?.path).toBe(`${ORG}/opportunity/${OPP1}/${DOC.opp1}.pdf`);
        expect(audits("document_link_issued").at(-1)?.payload).toMatchObject({ version_id: V1, version_number: 1 });
    });

    it("another document's version is never signed through this one", async () => {
        as(P.admin);
        const res = await invokeRoute(
            signedUrlGET,
            buildRequest({ path: `/api/admin/documents/${DOC.opp1}/signed-url?version=${V_OTHER}` }),
            routeParams({ id: DOC.opp1 }),
        );
        expect(res.status).toBe(404);
        expect(db.signCalls).toHaveLength(0);
    });

    it("a replacement screening would quarantine is not stored at all", async () => {
        as(P.ops);
        const res = await replace(DOC.opp1, jsPdf());
        expect(res.status).toBe(415);
        expect(db.uploadCalls).toHaveLength(0);
        expect(rpcCalls.some((c) => c.name === "document_add_version")).toBe(false);
        expect(db.rows("document_versions").filter((v) => v.document_id === DOC.opp1)).toHaveLength(1);
    });

    it("needs documents.write, a written reason, and a document the writer may read", async () => {
        as(P.reader);
        expect((await replace(DOC.opp1, await cleanPdf())).status).toBe(403);
        as(P.ops);
        expect((await replace(DOC.opp1, await cleanPdf(), "")).status).toBe(400);
        as(P.scopedOps);
        expect((await replace(DOC.opp2, await cleanPdf())).status).toBe(404);
        expect(db.uploadCalls).toHaveLength(0);
    });
});

// ── subjects ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe("typed subjects (D2.2) — access follows the primary owner only", () => {
    const post = (id: string, body: Record<string, unknown>) =>
        invokeRoute(subjectsPOST, buildRequest({ method: "POST", path: `/api/admin/documents/${id}/subjects`, body }), routeParams({ id }));

    it("legacy entity types map to owning subject types and back; staff are persons", () => {
        expect(documentSubjectTypeForLegacy("customer_members")).toBe("child");
        expect(documentSubjectTypeForLegacy("customer")).toBe("household");
        expect(documentSubjectTypeForLegacy("person")).toBe("person");
        expect(documentSubjectTypeForLegacy("job")).toBeNull();
        expect(legacyEntityTypeForSubject("child")).toBe("customer_member");
    });

    it("a restricted writer cannot file a document under a subject outside their scope", async () => {
        as(P.scopedOps);
        const res = await post(DOC.opp1, { action: "set_primary", subject_type: "opportunity", subject_id: OPP2 });
        expect(res.status).toBe(404);
        expect(rpcCalls.some((c) => c.name === "document_set_primary_subject")).toBe(false);
        expect(audits("document_subject_changed")).toHaveLength(0);
    });

    it("re-filing goes through the governed function, recorded first, and moves access with it", async () => {
        as(P.admin);
        const res = await post(DOC.opp1, { action: "set_primary", subject_type: "opportunity", subject_id: OPP2 });
        expect(res.status).toBe(200);
        expect(audits("document_subject_changed")[0]?.payload).toMatchObject({ action: "set_primary", subject_id: OPP2 });
        // The scoped writer saw this document under OPP1; filed under OPP2 it is now outside their scope.
        as(P.scopedOps);
        expect((await invokeRoute(signedUrlGET, buildRequest({ path: `/x` }), routeParams({ id: DOC.opp1 }))).status).toBe(404);
    });

    it("a subject of another organization is refused by the database function", async () => {
        as(P.admin);
        const res = await post(DOC.opp1, { action: "set_primary", subject_type: "opportunity", subject_id: "0c000000-0000-4000-8000-0000000000ff" });
        expect(res.status).toBe(404);
        expect(db.rows("documents").find((d) => d.id === DOC.opp1)?.entity_id).toBe(OPP1);
    });

    it("only owning subject types are named; Processing and Forms context links are those domains' own", async () => {
        as(P.admin);
        expect((await post(DOC.opp1, { action: "link", subject_type: "processing_case", subject_id: OPP1 })).status).toBe(400);
        expect((await post(DOC.opp1, { action: "bogus", subject_type: "opportunity", subject_id: OPP1 })).status).toBe(400);
    });

    it("the subject list is admitted by the document access decision", async () => {
        db.seed("document_subject_links", [
            { org_id: ORG, document_id: DOC.opp1, subject_type: "opportunity", subject_id: OPP1, association: "owner", is_primary: true, derived_from: "document_subjects" },
        ]);
        as(P.noDocs);
        expect((await invokeRoute(subjectsGET, buildRequest({ path: `/x` }), routeParams({ id: DOC.opp1 }))).status).toBe(403);
        as(P.reader);
        const res = await invokeRoute(subjectsGET, buildRequest({ path: `/x` }), routeParams({ id: DOC.opp1 }));
        expect(res.status).toBe(200);
        expect((res.body as { subjects: unknown[] }).subjects).toHaveLength(1);
    });
});
