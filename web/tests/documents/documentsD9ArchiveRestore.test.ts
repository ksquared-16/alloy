/**
 * D9.3 — archived documents and their staff restore, through the real routes.
 *
 * `GET /api/admin/documents/archived` lists a household's archived documents with the library's own admission and
 * disclosure; `POST /api/admin/documents/[id]/restore` returns one to its previous status through
 * `public.document_unarchive` (pending migration). Handlers and every authorization helper run unmodified; the session
 * and the service-role client are substituted, the in-memory client evaluates each query's real filters, and
 * `document_unarchive` is given its migration's contract only where a test says the database has it.
 */
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

import { GET as archivedGET } from "@/app/api/admin/documents/archived/route";
import { GET as libraryGET } from "@/app/api/admin/documents/library/route";
import { POST as restorePOST } from "@/app/api/admin/documents/[id]/restore/route";
import type { DocumentLibrary, LibraryDocument } from "@/lib/documents/library/documentLibraryModel";

const ORG = "0a000000-0000-4000-8000-0000000000a9";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000a9";
const USER = "05e00000-0000-4000-8000-0000000000a9";
const DEPT = "de000000-0000-4000-8000-0000000000a9";
const WU = "a0000000-0000-4000-8000-0000000000a9";
const H = "c0000000-0000-4000-8000-0000000000a1";
const C1 = "cb000000-0000-4000-8000-0000000000a1";
const C2 = "cb000000-0000-4000-8000-0000000000a2";
const OPP = "0e000000-0000-4000-8000-0000000000a1";
const D = {
    byApp: "da000000-0000-4000-8000-000000000001",
    byStaff: "da000000-0000-4000-8000-000000000002",
    medical: "da000000-0000-4000-8000-000000000003",
    available: "da000000-0000-4000-8000-000000000004",
    quarantined: "da000000-0000-4000-8000-000000000005",
    otherOrg: "da000000-0000-4000-8000-000000000006",
} as const;

type Persona = { orgId: string; roleKeys: string[]; permissionKeys: string[]; departmentScope?: "all" | "restricted"; allowedDepartmentIds?: string[] | null };
const P = {
    admin: { orgId: ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "health.view"] },
    readOnly: { orgId: ORG, roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    writerNoHealth: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write"] },
    writeNoRead: { orgId: ORG, roleKeys: ["qa_writer"], permissionKeys: ["portal.access", "documents.write"] },
    scoped: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write", "health.view"], departmentScope: "restricted", allowedDepartmentIds: [DEPT] },
    otherOrgAdmin: { orgId: OTHER_ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "health.view"] },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: "admin", userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: p.departmentScope ?? "all", allowedDepartmentIds: p.allowedDepartmentIds ?? null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

const archiveRecord = (by: string | null, previous = "uploaded") => ({
    archive: { key: "ext:inst:k-0001", reason: "Partner withdrew the upload", previous_status: previous, archived_by: by, audit_event_id: null, archived_at: "2026-11-03T10:00:00Z" },
});

let db: InMemorySupabase;
let unarchiveMigrated: boolean;
let unarchiveCalls: Array<Record<string, unknown>>;

function doc(id: string, over: Record<string, unknown>) {
    return {
        id, org_id: ORG, bucket: "org_documents", storage_path: `${ORG}/x/${id}.pdf`, title: `Doc ${id.slice(-2)}`, original_filename: `file-${id.slice(-2)}.pdf`,
        mime_type: "application/pdf", byte_size: 2048, doc_type: null, sensitivity: "standard", status: "uploaded", metadata: {}, created_at: "2026-10-20T00:00:00Z",
        current_version_id: `ea${id.slice(2)}`, ...over,
    };
}
const owner = (document_id: string, subject_type: string, subject_id: string, org_id = ORG) => ({ org_id, document_id, subject_type, subject_id, association: "owner", is_primary: true, source: "legacy_writer", created_at: "2026-10-20T00:00:00Z", ended_at: null });

beforeEach(() => {
    vi.clearAllMocks();
    db = new InMemorySupabase();
    unarchiveMigrated = true;
    unarchiveCalls = [];
    db.seed("work_units", [{ id: WU, org_id: ORG, department_id: DEPT }]);
    db.seed("customers", [{ id: H, org_id: ORG, name: "Okafor household" }]);
    db.seed("customer_persons", []);
    db.seed("customer_members", [
        { id: C1, org_id: ORG, customer_id: H, first_name: "Ada", last_name: "Okafor", is_active: true },
        { id: C2, org_id: ORG, customer_id: H, first_name: "Obi", last_name: "Okafor", is_active: true },
    ]);
    db.seed("opportunities", [{ id: OPP, org_id: ORG, customer_id: H, title: "Fall enrollment", work_unit_id: WU, location_id: null, created_at: "2026-10-01T00:00:00Z" }]);
    db.seed("document_categories", []);
    db.seed("document_types", []);
    db.seed("documents", [
        doc(D.byApp, { entity_type: "customer_member", entity_id: C1, title: "Partner upload", status: "archived", metadata: archiveRecord(null) }),
        doc(D.byStaff, { entity_type: "customer_member", entity_id: C2, title: "Old pickup form", status: "archived", metadata: archiveRecord(USER, "verified") }),
        doc(D.medical, { entity_type: "customer_member", entity_id: C1, title: "Old allergy plan", sensitivity: "medical", status: "archived", metadata: archiveRecord(null) }),
        doc(D.available, { entity_type: "customer", entity_id: H, title: "Household contract" }),
        doc(D.quarantined, { entity_type: "customer", entity_id: H, title: "Suspicious upload", status: "quarantined" }),
        doc(D.otherOrg, { org_id: OTHER_ORG, entity_type: "customer", entity_id: H, title: "Foreign", status: "archived", metadata: archiveRecord(null) }),
    ]);
    const subjects = [
        owner(D.byApp, "child", C1),
        owner(D.byStaff, "child", C2),
        owner(D.medical, "child", C1),
        owner(D.available, "household", H),
        owner(D.quarantined, "household", H),
        owner(D.otherOrg, "household", H, OTHER_ORG),
    ];
    db.seed("document_subjects", subjects);
    db.seed(
        "document_subject_links",
        subjects.map((s) => ({ org_id: s.org_id, document_id: s.document_id, subject_type: s.subject_type, subject_id: s.subject_id, association: "owner", is_primary: true, derived_from: "document_subjects" })),
    );
    db.seed(
        "document_versions",
        Object.values(D).map((id) => ({ id: `ea${id.slice(2)}`, org_id: ORG, document_id: id, version_number: 1, source: "document_insert", created_at: "2026-10-20T00:00:00Z", review_status: null, effective_on: null, expires_on: null })),
    );
    // `document_unarchive` with its migration's contract (20261217090000): org-scoped row, archived only, back to
    // metadata.archive.previous_status, restore facts appended to the archive record. Everything else answers as before.
    (db as unknown as { rpc: unknown }).rpc = async (fn: string, args: Record<string, unknown> = {}) => {
        if (fn !== "document_unarchive") return { data: false, error: null };
        if (!unarchiveMigrated) return { data: null, error: { code: "PGRST202", message: "Could not find the function public.document_unarchive" } };
        unarchiveCalls.push(args);
        const row = db.rows("documents").find((d) => d.id === args.p_document_id && d.org_id === args.p_org_id);
        if (!row) return { data: null, error: { message: "document_archive_not_found" } };
        if (row.status !== "archived") return { data: null, error: { message: "document_unarchive_not_archived" } };
        const archive = (row.metadata as { archive: Record<string, unknown> }).archive;
        const previous = String(archive.previous_status ?? "uploaded");
        row.status = previous;
        row.metadata = { ...(row.metadata as object), archive: { ...archive, restored_at: "2026-11-03T12:00:00Z", restored_by: args.p_actor, restore_reason: args.p_reason, restore_audit_event_id: args.p_audit_event_id } };
        return { data: { document_id: row.id, status: previous }, error: null };
    };
    dbRef.current = db;
});

const archived = async (query: string) => invokeRoute(archivedGET, buildRequest({ path: `/api/admin/documents/archived?${query}` }));
const archivedDocs = (res: { body: unknown }) => ((res.body as { documents?: LibraryDocument[] }).documents ?? []);
const library = async (query: string) => ((await invokeRoute(libraryGET, buildRequest({ path: `/api/admin/documents/library?${query}` }))).body as { library: DocumentLibrary }).library;
const restore = (id: string, body: Record<string, unknown>) =>
    invokeRoute(restorePOST, buildRequest({ method: "POST", path: `/api/admin/documents/${id}/restore`, body }), routeParams({ id }));
const HOUSEHOLD = `subject_type=household&subject_id=${H}`;
const REASON = "Archived by mistake; the partner re-sent it";
const audits = (event: string) => db.rows("workflow_events").filter((e) => e.event_type === event);

describe("the archived listing", () => {
    it("lists only archived documents of the household, each with its archive record, and never the library's own", async () => {
        as(P.admin);
        const res = await archived(HOUSEHOLD);
        expect(res.status).toBe(200);
        const docs = archivedDocs(res);
        expect(docs.map((d) => d.id).sort()).toEqual([D.byApp, D.byStaff, D.medical].sort());
        expect(docs.find((d) => d.id === D.byApp)?.archive).toEqual({ archived_at: "2026-11-03T10:00:00Z", reason: "Partner withdrew the upload", by: "application", previous_status: "uploaded" });
        expect(docs.find((d) => d.id === D.byStaff)?.archive).toMatchObject({ by: "staff", previous_status: "verified" });
        // The archive key names an installation's idempotency key: never shown.
        expect(JSON.stringify(res.body)).not.toContain("ext:inst:k-0001");
        // The library itself still lists none of them, and the archived listing never shows the quarantined document.
        expect((await library(HOUSEHOLD)).documents.map((d) => d.id)).toEqual([D.available]);
        expect(docs.some((d) => d.id === D.quarantined || d.id === D.available || d.id === D.otherOrg)).toBe(false);
    });

    it("applies the library's disclosure: sensitivity, focus, read admission, organization", async () => {
        as(P.writerNoHealth);
        expect(archivedDocs(await archived(HOUSEHOLD)).map((d) => d.id).sort()).toEqual([D.byApp, D.byStaff].sort());
        as(P.admin);
        expect(archivedDocs(await archived(`${HOUSEHOLD}&focus_type=child&focus_id=${C2}`)).map((d) => d.id)).toEqual([D.byStaff]);
        as(P.writeNoRead);
        expect((await archived(HOUSEHOLD)).status).toBe(403);
        as(P.otherOrgAdmin);
        expect((await archived(HOUSEHOLD)).status).toBe(404);
        as(P.admin);
        expect((await archived("subject_type=household")).status).toBe(400);
    });
});

describe("staff restore", () => {
    it("restores an archived document to its previous status, audited first, and it returns to the library", async () => {
        as(P.admin);
        const res = await restore(D.byStaff, { reason: REASON });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, document_id: D.byStaff, status: "verified" });
        const row = db.rows("documents").find((d) => d.id === D.byStaff)!;
        expect(row.status).toBe("verified");
        const event = audits("document_restored");
        expect(event).toHaveLength(1);
        expect(event[0].entity_id).toBe(D.byStaff);
        expect(unarchiveCalls[0]).toMatchObject({ p_org_id: ORG, p_document_id: D.byStaff, p_reason: REASON, p_actor: USER, p_audit_event_id: event[0].id });
        expect((row.metadata as { archive: Record<string, unknown> }).archive).toMatchObject({ restored_by: USER, restore_reason: REASON, reason: "Partner withdrew the upload" });
        expect((await library(HOUSEHOLD)).documents.map((d) => d.id).sort()).toEqual([D.available, D.byStaff].sort());
        expect(archivedDocs(await archived(HOUSEHOLD)).map((d) => d.id)).not.toContain(D.byStaff);
    });

    it("needs documents.write AND read admission, a written reason, and an archived document", async () => {
        as(P.readOnly);
        expect((await restore(D.byApp, { reason: REASON })).status).toBe(403);
        as(P.writeNoRead);
        expect((await restore(D.byApp, { reason: REASON })).status).toBe(403);
        as(P.admin);
        expect(await restore(D.byApp, { reason: "too short" })).toMatchObject({ status: 400, body: { code: "REASON_REQUIRED" } });
        expect(await restore(D.available, { reason: REASON })).toMatchObject({ status: 409, body: { code: "NOT_ARCHIVED" } });
        expect(await restore(D.quarantined, { reason: REASON })).toMatchObject({ status: 409, body: { code: "NOT_ARCHIVED" } });
        expect(unarchiveCalls).toHaveLength(0);
        expect(audits("document_restored")).toHaveLength(0);
    });

    it("never discloses: another organization's document, a missing id and an out-of-scope subject are the same 404", async () => {
        as(P.admin);
        const foreign = await restore(D.otherOrg, { reason: REASON });
        const missing = await restore("da000000-0000-4000-8000-0000000000ff", { reason: REASON });
        expect(foreign).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
        expect(missing.body).toEqual(foreign.body);
        as(P.scoped);
        expect(await restore(D.byApp, { reason: REASON })).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
        expect(db.rows("documents").find((d) => d.id === D.otherOrg)!.status).toBe("archived");
        expect(unarchiveCalls).toHaveLength(0);
    });

    it("a medical document needs the medical clearance to restore", async () => {
        as(P.writerNoHealth);
        expect(await restore(D.medical, { reason: REASON })).toMatchObject({ status: 403, body: { code: "SENSITIVE_DOCUMENT" } });
        expect(db.rows("documents").find((d) => d.id === D.medical)!.status).toBe("archived");
    });

    it("answers 503 archive_unavailable while the database lacks document_unarchive, and changes no status", async () => {
        unarchiveMigrated = false;
        as(P.admin);
        expect(await restore(D.byApp, { reason: REASON })).toMatchObject({ status: 503, body: { code: "archive_unavailable" } });
        expect(db.rows("documents").find((d) => d.id === D.byApp)!.status).toBe("archived");
    });

    it("restores nothing when the audit cannot be written", async () => {
        as(P.admin);
        const realFrom = db.from.bind(db);
        (db as unknown as { from: unknown }).from = (table: string) => {
            if (table === "workflow_events") throw new Error("audit store down");
            return realFrom(table);
        };
        const res = await restore(D.byApp, { reason: REASON });
        expect(res.status).toBe(503);
        expect(unarchiveCalls).toHaveLength(0);
        expect(db.rows("documents").find((d) => d.id === D.byApp)!.status).toBe("archived");
    });
});
