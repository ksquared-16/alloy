/**
 * D4 — the household document library and document history, through the real routes.
 *
 * Handlers, the read model and every authorization helper (scope, sensitivity, availability, the document access
 * decision) run unmodified; the session and the service-role client are substituted, and the in-memory client
 * evaluates each query's real filters. `document_subject_links` is seeded as the view's rows.
 *
 * One household (two adults, two children, one case) plus a neighbouring household and a second organization.
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

import { GET as libraryGET } from "@/app/api/admin/documents/library/route";
import { GET as historyGET } from "@/app/api/admin/documents/[id]/history/route";
import type { DocumentLibrary } from "@/lib/documents/library/documentLibraryModel";

const ORG = "0a000000-0000-4000-8000-0000000000d4";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d4";
const USER = "05e00000-0000-4000-8000-0000000000d4";
const DEPT = "de000000-0000-4000-8000-0000000000d4";
const WU = "a0000000-0000-4000-8000-0000000000d4";
const H = "c0000000-0000-4000-8000-000000000001"; // household
const H2 = "c0000000-0000-4000-8000-000000000002"; // neighbouring household
const P1 = "9e000000-0000-4000-8000-000000000001";
const P2 = "9e000000-0000-4000-8000-000000000002";
const C1 = "cb000000-0000-4000-8000-000000000001";
const C2 = "cb000000-0000-4000-8000-000000000002";
const C3 = "cb000000-0000-4000-8000-000000000003"; // child of H2
const OPP = "0e000000-0000-4000-8000-000000000001";
const SUB = "5b000000-0000-4000-8000-000000000001";
const CAT = "ca000000-0000-4000-8000-0000000000d4";

const D = {
    household: "d4000000-0000-4000-8000-000000000001",
    parent: "d4000000-0000-4000-8000-000000000002",
    child1: "d4000000-0000-4000-8000-000000000003",
    child2Medical: "d4000000-0000-4000-8000-000000000004",
    shared: "d4000000-0000-4000-8000-000000000005",
    caseDoc: "d4000000-0000-4000-8000-000000000006",
    formsPdf: "d4000000-0000-4000-8000-000000000007",
    quarantined: "d4000000-0000-4000-8000-000000000008",
    neighbour: "d4000000-0000-4000-8000-000000000009",
    otherOrg: "d4000000-0000-4000-8000-00000000000a",
    childOnCase: "d4000000-0000-4000-8000-00000000000b",
} as const;

type Persona = { orgId: string; roleKeys: string[]; permissionKeys: string[]; departmentScope?: "all" | "restricted"; allowedDepartmentIds?: string[] | null };
const P = {
    admin: { orgId: ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "health.view"] },
    readerNoHealth: { orgId: ORG, roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    noDocs: { orgId: ORG, roleKeys: ["qa_no_docs"], permissionKeys: ["portal.access"] },
    scoped: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write", "health.view"], departmentScope: "restricted", allowedDepartmentIds: [DEPT] },
    otherOrgAdmin: { orgId: OTHER_ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "health.view"] },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: "admin", userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: p.departmentScope ?? "all", allowedDepartmentIds: p.allowedDepartmentIds ?? null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;

function doc(id: string, over: Record<string, unknown>) {
    return {
        id, org_id: ORG, bucket: "org_documents", storage_path: `${ORG}/x/${id}.pdf`, title: `Doc ${id.slice(-2)}`, original_filename: `file-${id.slice(-2)}.pdf`,
        mime_type: "application/pdf", byte_size: 2048, doc_type: null, sensitivity: "standard", status: "uploaded", metadata: {}, created_at: "2026-10-20T00:00:00Z",
        current_version_id: `${id.slice(0, -2)}f${id.slice(-1)}`.replace(/^d4/, "e4"), ...over,
    };
}
const owner = (document_id: string, subject_type: string, subject_id: string) => ({ org_id: ORG, document_id, subject_type, subject_id, association: "owner", is_primary: true, source: "legacy_writer", created_at: "2026-10-20T00:00:00Z", ended_at: null });
const context = (document_id: string, subject_type: string, subject_id: string, derived_from = "document_subjects") => ({ org_id: ORG, document_id, subject_type, subject_id, association: "context", is_primary: false, derived_from });

beforeEach(() => {
    vi.clearAllMocks();
    db = new InMemorySupabase();
    db.seed("work_units", [{ id: WU, org_id: ORG, department_id: DEPT }]);
    db.seed("customers", [{ id: H, org_id: ORG, name: "Rivera household" }, { id: H2, org_id: ORG, name: "Neighbours" }]);
    db.seed("customer_persons", [
        { org_id: ORG, customer_id: H, person_id: P1, role_type: "primary_contact", is_primary: true, status: "active", end_date: null, persons: { id: P1, first_name: "Ana", last_name: "Rivera" } },
        { org_id: ORG, customer_id: H, person_id: P2, role_type: "parent", is_primary: false, status: "active", end_date: null, persons: { id: P2, first_name: "Luis", last_name: "Rivera" } },
    ]);
    db.seed("persons", [{ id: P1, org_id: ORG }, { id: P2, org_id: ORG }]);
    db.seed("customer_members", [
        { id: C1, org_id: ORG, customer_id: H, first_name: "Mia", last_name: "Rivera", is_active: true },
        { id: C2, org_id: ORG, customer_id: H, first_name: "Leo", last_name: "Rivera", is_active: true },
        { id: C3, org_id: ORG, customer_id: H2, first_name: "Zoe", last_name: "Other", is_active: true },
    ]);
    db.seed("opportunities", [{ id: OPP, org_id: ORG, customer_id: H, title: "Fall enrollment", work_unit_id: WU, location_id: null, created_at: "2026-10-01T00:00:00Z" }]);
    db.seed("form_submissions", [{ id: SUB, org_id: ORG, opportunity_id: OPP }]);
    db.seed("document_categories", [{ id: CAT, org_id: ORG, key: "health", label: "Health & medical", status: "active", sort_order: 1, parent_id: null }]);
    db.seed("document_types", [{ id: "ce000000-0000-4000-8000-0000000000d4", org_id: ORG, key: "immunization_record", status: "active", seeded: true, published_version_id: "cf000000-0000-4000-8000-0000000000d4" }]);
    db.seed("document_type_versions", [{ id: "cf000000-0000-4000-8000-0000000000d4", org_id: ORG, document_type_id: "ce000000-0000-4000-8000-0000000000d4", version_number: 1, status: "published", label: "Immunization record", category_id: CAT, default_sensitivity: "medical" }]);

    db.seed("documents", [
        doc(D.household, { entity_type: "customer", entity_id: H, title: "Household contract" }),
        doc(D.parent, { entity_type: "person", entity_id: P1, title: "Ana ID copy" }),
        doc(D.child1, { entity_type: "customer_member", entity_id: C1, title: "Mia birth certificate" }),
        doc(D.child2Medical, { entity_type: "customer_member", entity_id: C2, title: "Leo immunizations", doc_type: "immunization_record", sensitivity: "medical" }),
        doc(D.shared, { entity_type: "customer_member", entity_id: C1, title: "Sibling pickup authorization" }),
        doc(D.caseDoc, { entity_type: "opportunity", entity_id: OPP, title: "Case note scan" }),
        doc(D.formsPdf, { entity_type: "opportunity", entity_id: OPP, title: "Enrollment form PDF", doc_type: "generated_form_pdf" }),
        doc(D.quarantined, { entity_type: "customer", entity_id: H, title: "Suspicious upload", status: "quarantined" }),
        doc(D.neighbour, { entity_type: "customer_member", entity_id: C3, title: "Zoe allergy plan" }),
        doc(D.childOnCase, { entity_type: "customer_member", entity_id: C1, title: "Mia custody note" }),
        doc(D.otherOrg, { org_id: OTHER_ORG, entity_type: "customer", entity_id: H, title: "Foreign document" }),
    ]);
    const subjects = [
        owner(D.household, "household", H),
        owner(D.parent, "person", P1),
        owner(D.child1, "child", C1),
        owner(D.child2Medical, "child", C2),
        owner(D.shared, "child", C1),
        { ...owner(D.shared, "child", C2), is_primary: false, association: "context" },
        owner(D.caseDoc, "opportunity", OPP),
        owner(D.formsPdf, "opportunity", OPP),
        owner(D.quarantined, "household", H),
        owner(D.neighbour, "child", C3),
        { ...owner(D.neighbour, "child", C1), is_primary: false, association: "context" },
        owner(D.childOnCase, "child", C1),
        { ...owner(D.childOnCase, "opportunity", OPP), is_primary: false, association: "context" },
        { ...owner(D.otherOrg, "household", H), org_id: OTHER_ORG },
    ];
    db.seed("document_subjects", subjects);
    db.seed("document_subject_links", [
        ...subjects.map((s) => ({ org_id: s.org_id, document_id: s.document_id, subject_type: s.subject_type, subject_id: s.subject_id, association: s.association, is_primary: s.is_primary, derived_from: "document_subjects" })),
        context(D.formsPdf, "form_submission", SUB, "form_submission_documents:generated_pdf"),
    ]);
    db.seed(
        "document_versions",
        Object.values(D).map((id) => ({ id: `${id.slice(0, -2)}f${id.slice(-1)}`.replace(/^d4/, "e4"), org_id: ORG, document_id: id, version_number: 1, source: "document_insert", created_at: "2026-10-20T00:00:00Z", review_status: null, effective_on: null, expires_on: null })),
    );
    (db as unknown as { rpc: unknown }).rpc = async () => ({ data: false, error: null });
    dbRef.current = db;
});

const lib = async (query: string) => invokeRoute(libraryGET, buildRequest({ path: `/api/admin/documents/library?${query}` }));
const body = (res: { body: unknown }) => (res.body as { library: DocumentLibrary }).library;
const ids = (l: DocumentLibrary) => l.documents.map((d) => d.id).sort();

describe("the household library resolves the household, its adults, children and cases", () => {
    it("lists household, adult, child, case and Forms documents once each, from any member of the household", async () => {
        as(P.admin);
        for (const q of [`subject_type=household&subject_id=${H}`, `subject_type=opportunity&subject_id=${OPP}`, `subject_type=child&subject_id=${C2}`, `subject_type=person&subject_id=${P2}`]) {
            const res = await lib(q);
            expect(res.status).toBe(200);
            const l = body(res);
            expect(l.household).toEqual({ id: H, label: "Rivera household" });
            expect(ids(l)).toEqual(
                [D.household, D.parent, D.child1, D.child2Medical, D.shared, D.caseDoc, D.formsPdf, D.neighbour, D.childOnCase].sort(),
            );
        }
    });

    it("names the subjects: household, both adults (primary contact first), both children, the case", async () => {
        as(P.admin);
        const l = body(await lib(`subject_type=household&subject_id=${H}`));
        expect(l.subjects.map((s) => [s.subject_type, s.label, s.role])).toEqual([
            ["household", "Rivera household", "household"],
            ["person", "Ana Rivera", "adult"],
            ["person", "Luis Rivera", "adult"],
            ["child", "Mia Rivera", "child"],
            ["child", "Leo Rivera", "child"],
            ["opportunity", "Fall enrollment", "case"],
        ]);
        expect(l.subjects.find((s) => s.subject_id === P1)?.is_primary_contact).toBe(true);
    });

    it("a shared document is one entry: its owner is the primary, the other child is a context association", async () => {
        as(P.admin);
        const l = body(await lib(`subject_type=household&subject_id=${H}`));
        const shared = l.documents.filter((d) => d.id === D.shared);
        expect(shared).toHaveLength(1);
        expect(shared[0].owner).toEqual({ subject_type: "child", subject_id: C1 });
        expect(shared[0].associations).toEqual([
            expect.objectContaining({ subject_type: "child", subject_id: C1, association: "owner", is_primary: true }),
            expect.objectContaining({ subject_type: "child", subject_id: C2, association: "context", is_primary: false }),
        ]);
    });

    it("distinguishes ownership from context: a document owned in another household is never attributed here", async () => {
        as(P.admin);
        const l = body(await lib(`subject_type=household&subject_id=${H}`));
        const neighbour = l.documents.find((d) => d.id === D.neighbour);
        expect(neighbour).toMatchObject({ owner: null, owned_elsewhere: true });
        expect(JSON.stringify(neighbour)).not.toContain(C3);
        expect(l.subjects.some((s) => s.subject_id === C3)).toBe(false);
    });

    it("carries Studio type and category, version and Forms provenance", async () => {
        as(P.admin);
        const l = body(await lib(`subject_type=household&subject_id=${H}`));
        expect(l.documents.find((d) => d.id === D.child2Medical)?.type).toEqual({ key: "immunization_record", label: "Immunization record", registered: true, category_id: CAT, category_label: "Health & medical" });
        expect(l.documents.find((d) => d.id === D.formsPdf)).toMatchObject({ forms_artifact: true, type: { registered: false } });
        expect(l.documents.find((d) => d.id === D.household)).toMatchObject({ version_count: 1, current_version: { version_number: 1 }, forms_artifact: false });
        // No missing/expiring status is invented: validity is what the version stores.
        expect(l.documents.find((d) => d.id === D.child1)?.current_version).toMatchObject({ review_status: null, expires_on: null });
    });
});

describe("narrowing to one member happens on the server", () => {
    it("a child's library holds only documents linked to that child — a sibling's own documents are not listed or counted", async () => {
        as(P.admin);
        const l = body(await lib(`subject_type=opportunity&subject_id=${OPP}&focus_type=child&focus_id=${C1}`));
        expect(ids(l)).toEqual([D.child1, D.shared, D.neighbour, D.childOnCase].sort());
        expect(JSON.stringify(l.documents)).not.toContain("Leo immunizations");
    });

    it("the sibling sees the shared document through its association, but not the other child's own", async () => {
        as(P.admin);
        const l = body(await lib(`subject_type=household&subject_id=${H}&focus_type=child&focus_id=${C2}`));
        expect(ids(l)).toEqual([D.child2Medical, D.shared].sort());
    });

    it("a focus outside the household is 404", async () => {
        as(P.admin);
        expect((await lib(`subject_type=household&subject_id=${H}&focus_type=child&focus_id=${C3}`)).status).toBe(404);
    });
});

describe("access and privacy", () => {
    it("no documents.read: 403, nothing read", async () => {
        as(P.noDocs);
        expect((await lib(`subject_type=household&subject_id=${H}`)).status).toBe(403);
    });

    it("a medical document is withheld without health.view — not listed, not counted, no title or filename anywhere", async () => {
        as(P.readerNoHealth);
        const res = await lib(`subject_type=household&subject_id=${H}`);
        expect(res.status).toBe(200);
        const text = JSON.stringify(res.body);
        expect(ids(body(res))).not.toContain(D.child2Medical);
        expect(text).not.toContain(D.child2Medical);
        expect(text).not.toContain("Leo immunizations");
        expect(text).not.toContain("file-04.pdf");
    });

    it("a quarantined document is never listed", async () => {
        as(P.admin);
        const text = JSON.stringify((await lib(`subject_type=household&subject_id=${H}`)).body);
        expect(text).not.toContain(D.quarantined);
        expect(text).not.toContain("Suspicious upload");
    });

    it("another organization's household is 404, and a foreign row naming this household is never listed", async () => {
        as(P.otherOrgAdmin);
        expect((await lib(`subject_type=household&subject_id=${H}`)).status).toBe(404);
        as(P.admin);
        expect(JSON.stringify((await lib(`subject_type=household&subject_id=${H}`)).body)).not.toContain("Foreign document");
    });

    it("a scope-restricted operator cannot open a household (no department/site linkage: fail closed, 404)", async () => {
        as(P.scoped);
        expect((await lib(`subject_type=household&subject_id=${H}`)).status).toBe(404);
        expect((await lib(`subject_type=child&subject_id=${C1}`)).status).toBe(404);
    });

    it("from an in-scope case a scoped operator sees only case-owned documents: a context link to the case grants nothing", async () => {
        as(P.scoped);
        const res = await lib(`subject_type=opportunity&subject_id=${OPP}`);
        expect(res.status).toBe(200);
        const l = body(res);
        expect(ids(l)).toEqual([D.caseDoc, D.formsPdf].sort());
        expect(JSON.stringify(l.documents)).not.toContain("Mia custody note");
    });

    it("malformed input is 400", async () => {
        as(P.admin);
        expect((await lib(`subject_type=family&subject_id=${H}`)).status).toBe(400);
        expect((await lib(`subject_type=household&subject_id=not-a-uuid`)).status).toBe(400);
    });
});

describe("history distinguishes committed changes, system events and refused attempts", () => {
    const hist = async (id: string) => invokeRoute(historyGET, buildRequest({ path: "/x" }), routeParams({ id }));

    it("a replacement that landed is committed once; one whose version never landed is refused, not a change", async () => {
        as(P.admin);
        db.seed("document_versions", [
            { id: "e4000000-0000-4000-8000-0000000000b2", org_id: ORG, document_id: D.household, version_number: 2, source: "replacement", created_at: "2026-10-22T00:00:00Z", replacement_reason: "Signed copy received", provenance: { audit_event_id: "ev-landed" } },
        ]);
        db.seed("workflow_events", [
            { id: "ev-landed", org_id: ORG, event_type: "document_version_added", entity_type: "documents", entity_id: D.household, payload: {}, occurred_at: "2026-10-22T00:00:00Z" },
            { id: "ev-refused", org_id: ORG, event_type: "document_version_added", entity_type: "documents", entity_id: D.household, payload: {}, occurred_at: "2026-10-23T00:00:00Z" },
            { id: "ev-subject", org_id: ORG, event_type: "document_subject_changed", entity_type: "documents", entity_id: D.household, payload: { action: "link", subject_type: "child" }, occurred_at: "2026-10-24T00:00:00Z" },
            { id: "ev-link", org_id: ORG, event_type: "document_link_issued", entity_type: "documents", entity_id: D.household, payload: {}, occurred_at: "2026-10-24T01:00:00Z" },
        ]);
        const res = await hist(D.household);
        expect(res.status).toBe(200);
        const entries = (res.body as { entries: Array<{ kind: string; action: string }> }).entries;
        expect(entries.filter((e) => e.kind === "committed").map((e) => e.action)).toEqual(
            expect.arrayContaining(["Replaced with version 2", "Uploaded", "Associated (primary owner: household)"]),
        );
        expect(entries.filter((e) => e.action === "Replaced with version 2")).toHaveLength(1);
        expect(entries.filter((e) => e.kind === "refused").map((e) => e.action)).toEqual([
            "Association change attempted — not applied",
            "Replacement attempted — no version was recorded",
        ]);
        expect(entries.find((e) => e.kind === "access")?.action).toBe("Download link issued");
    });

    it("history follows the document access decision: medical without health.view is 403, foreign is 404, quarantined is refused", async () => {
        as(P.readerNoHealth);
        expect((await hist(D.child2Medical)).status).toBe(403);
        as(P.otherOrgAdmin);
        expect((await hist(D.household)).status).toBe(404);
        as(P.admin);
        expect((await hist(D.quarantined)).status).toBe(403);
    });
});
