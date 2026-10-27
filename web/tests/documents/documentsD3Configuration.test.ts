/**
 * D3 — Document Studio configuration, through the real routes and the real validator.
 *
 * Handlers and authorization helpers run unmodified; the session and the service-role client are substituted, and the
 * in-memory client evaluates each query's real filters. The governed database functions are stood in for where a route
 * calls one. The database's own guards (stable keys, no cycles, immutable published versions, compare-and-swap, the
 * medical floor, anti-downgrade, raise-only document defaults) are proven against Postgres by
 * certification/invariants/documents-d3-studio-configuration.sql; this file pins the application half and the parity
 * between the two validators.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

import { GET as categoriesGET, POST as categoriesPOST } from "@/app/api/admin/documents/configuration/categories/route";
import { PATCH as categoryPATCH, DELETE as categoryDELETE } from "@/app/api/admin/documents/configuration/categories/[id]/route";
import { GET as typesGET, POST as typesPOST } from "@/app/api/admin/documents/configuration/types/route";
import { GET as typeGET, PATCH as typePATCH } from "@/app/api/admin/documents/configuration/types/[id]/route";
import { PUT as draftPUT, DELETE as draftDELETE } from "@/app/api/admin/documents/configuration/types/[id]/draft/route";
import { POST as validatePOST } from "@/app/api/admin/documents/configuration/types/[id]/validate/route";
import { POST as publishPOST } from "@/app/api/admin/documents/configuration/types/[id]/publish/route";
import { GET as compatibilityGET } from "@/app/api/admin/documents/configuration/compatibility/route";
import { documentTypeDraftProblems, raiseSensitivity, slugKey, type DocumentTypeDraft } from "@/lib/documents/configuration/documentTypePolicy";

const ORG = "0a000000-0000-4000-8000-0000000000d3";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d3";
const USER = "05e00000-0000-4000-8000-0000000000d3";
const CAT = "ca000000-0000-4000-8000-000000000001";
const CAT_ARCHIVED = "ca000000-0000-4000-8000-000000000002";
const TYPE = "ce000000-0000-4000-8000-000000000001";
const TYPE_OTHER_ORG = "ce000000-0000-4000-8000-000000000009";
const V1 = "cf000000-0000-4000-8000-000000000001";
const V2 = "cf000000-0000-4000-8000-000000000002";

type Persona = { orgId: string; role: "admin" | "ops"; roleKeys: string[]; permissionKeys: string[] };
const P = {
    admin: { orgId: ORG, role: "admin", roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "processing.documents.manage"] },
    ops: { orgId: ORG, role: "ops", roleKeys: ["ops"], permissionKeys: ["portal.access", "documents.read", "documents.write", "processing.operate"] },
    reader: { orgId: ORG, role: "ops", roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    noDocs: { orgId: ORG, role: "ops", roleKeys: ["qa_no_docs"], permissionKeys: ["portal.access"] },
    otherOrgAdmin: { orgId: OTHER_ORG, role: "admin", roleKeys: ["admin"], permissionKeys: ["documents.read", "processing.documents.manage"] },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: p.role, userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
let rpcError: string | null;

beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls = [];
    rpcError = null;
    db = new InMemorySupabase();
    db.seed("document_categories", [
        { id: CAT, org_id: ORG, key: "health", label: "Health & medical", status: "active", sort_order: 10, seeded: true, parent_id: null },
        { id: CAT_ARCHIVED, org_id: ORG, key: "old", label: "Old", status: "archived", sort_order: 99, seeded: false, parent_id: null },
    ]);
    db.seed("document_types", [
        { id: TYPE, org_id: ORG, key: "immunization_record", status: "active", seeded: true, published_version_id: V1 },
        { id: TYPE_OTHER_ORG, org_id: OTHER_ORG, key: "secret_type", status: "active", seeded: false, published_version_id: null },
    ]);
    db.seed("document_type_versions", [
        {
            id: V1, org_id: ORG, document_type_id: TYPE, version_number: 1, status: "published", label: "Immunization record", category_id: CAT,
            subject_types: ["child"], allowed_formats: ["pdf"], default_sensitivity: "medical", review_required: true, replacement_policy: "new_version",
            validity_policy: { kind: "none" }, validation_errors: [], created_at: "2026-10-01T00:00:00Z", published_at: "2026-10-01T00:00:00Z",
        },
    ]);
    db.seed("documents", [
        { id: "d3000000-0000-4000-8000-000000000001", org_id: ORG, doc_type: "immunization_record" },
        { id: "d3000000-0000-4000-8000-000000000002", org_id: ORG, doc_type: "contract" },
        { id: "d3000000-0000-4000-8000-000000000003", org_id: ORG, doc_type: null },
        { id: "d3000000-0000-4000-8000-000000000004", org_id: OTHER_ORG, doc_type: "secret_type" },
    ]);
    (db as unknown as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (rpcError) return { data: null, error: { message: rpcError } };
        if (name === "document_type_validate") return { data: { valid: true, problems: [] }, error: null };
        if (name === "document_type_publish") return { data: { version_id: args.p_version_id, version_number: 2, superseded_version_id: args.p_expected_published_version_id }, error: null };
        return { data: null, error: { message: `unexpected rpc ${name}` } };
    };
    dbRef.current = db;
});

const audits = (event: string) => db.rows("workflow_events").filter((e) => e.event_type === event);
const json = (method: "POST" | "PATCH" | "PUT" | "DELETE", body?: Record<string, unknown>) => buildRequest({ method, path: "/x", body });

const GOOD: DocumentTypeDraft = {
    label: "Custody order",
    description: null,
    category_id: CAT,
    subject_types: ["child"],
    allowed_formats: ["pdf", "png"],
    default_sensitivity: "custody_safeguarding",
    review_required: true,
    replacement_policy: "new_version",
    validity_policy: { kind: "duration", value: 12, unit: "months", warning_days: [30, 7] },
};

describe("authority: Studio writes need processing.documents.manage; reads need documents.read", () => {
    it("readers and ops read the vocabulary; a no-documents role does not", async () => {
        for (const p of [P.reader, P.ops, P.admin]) {
            as(p);
            expect((await invokeRoute(categoriesGET, buildRequest({ path: "/x" }))).status).toBe(200);
            expect((await invokeRoute(typesGET, buildRequest({ path: "/x" }))).status).toBe(200);
        }
        as(P.noDocs);
        expect((await invokeRoute(categoriesGET, buildRequest({ path: "/x" }))).status).toBe(403);
        expect((await invokeRoute(typesGET, buildRequest({ path: "/x" }))).status).toBe(403);
    });

    it("ops (documents.write) and readers cannot change configuration, and nothing is recorded", async () => {
        for (const p of [P.ops, P.reader]) {
            as(p);
            expect((await invokeRoute(categoriesPOST, json("POST", { label: "Contracts" }))).status).toBe(403);
            expect((await invokeRoute(typesPOST, json("POST", { ...GOOD }))).status).toBe(403);
            expect((await invokeRoute(typePATCH, json("PATCH", { action: "archive" }), routeParams({ id: TYPE }))).status).toBe(403);
            expect((await invokeRoute(publishPOST, json("POST", { version_id: V1 }), routeParams({ id: TYPE }))).status).toBe(403);
            expect((await invokeRoute(draftDELETE, json("DELETE"), routeParams({ id: TYPE }))).status).toBe(403);
        }
        expect(db.rows("document_categories")).toHaveLength(2);
        expect(audits("document_category_changed")).toHaveLength(0);
        expect(audits("document_type_changed")).toHaveLength(0);
    });

    it("another organization's type is not found, and its vocabulary is never listed", async () => {
        as(P.admin);
        expect((await invokeRoute(typeGET, buildRequest({ path: "/x" }), routeParams({ id: TYPE_OTHER_ORG }))).status).toBe(404);
        const listed = (await invokeRoute(typesGET, buildRequest({ path: "/x" }))).body as { types: Array<{ key: string }> };
        expect(listed.types.map((t) => t.key)).toEqual(["immunization_record"]);
        as(P.otherOrgAdmin);
        expect((await invokeRoute(typeGET, buildRequest({ path: "/x" }), routeParams({ id: TYPE }))).status).toBe(404);
        expect((await invokeRoute(draftPUT, json("PUT", { ...GOOD }), routeParams({ id: TYPE }))).status).toBe(404);
        expect((await invokeRoute(draftDELETE, json("DELETE"), routeParams({ id: TYPE }))).status).toBe(404);
    });
});

describe("categories", () => {
    it("create derives a stable key from the label and records the change first", async () => {
        as(P.admin);
        const res = await invokeRoute(categoriesPOST, json("POST", { label: "Court & custody papers" }));
        expect(res.status).toBe(200);
        const cat = (res.body as { category: { id: string; key: string } }).category;
        expect(cat.key).toBe("court_custody_papers");
        expect(audits("document_category_changed")[0]).toMatchObject({ entity_type: "document_categories", entity_id: cat.id });
    });

    it("refuses an invalid key and an empty label", async () => {
        as(P.admin);
        expect((await invokeRoute(categoriesPOST, json("POST", { label: "X", key: "9bad" }))).status).toBe(400);
        expect((await invokeRoute(categoriesPOST, json("POST", { label: "  " }))).status).toBe(400);
    });

    it("maps the database's refusals to stable codes", async () => {
        as(P.admin);
        const real = db.from.bind(db);
        (db as unknown as { from: unknown }).from = (t: string) => {
            const q = real(t);
            if (t !== "document_categories") return q;
            const fail = (message: string) => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message } }) }) });
            return Object.assign(q, {
                update: () => ({ eq: () => ({ eq: () => fail("document_category_cycle: a category cannot be its own ancestor") }) }),
            });
        };
        const res = await invokeRoute(categoryPATCH, json("PATCH", { action: "update", parent_id: CAT }), routeParams({ id: CAT }));
        expect(res.status).toBe(409);
        expect((res.body as { code: string }).code).toBe("CATEGORY_CYCLE");
    });

    it("delete of an unknown category is 404, not a silent success", async () => {
        as(P.admin);
        const res = await invokeRoute(categoryDELETE, json("DELETE"), routeParams({ id: "ca000000-0000-4000-8000-0000000000ff" }));
        expect(res.status).toBe(404);
    });
});

describe("types: draft → validate → publish", () => {
    it("create makes a type and a DRAFT, never a live version", async () => {
        as(P.admin);
        const res = await invokeRoute(typesPOST, json("POST", { ...GOOD }));
        expect(res.status).toBe(200);
        const body = res.body as { type_id: string; version_id: string; key: string; status: string };
        expect(body).toMatchObject({ key: "custody_order", status: "draft" });
        const v = db.rows("document_type_versions").find((x) => x.id === body.version_id);
        expect(v).toMatchObject({ version_number: 1, default_sensitivity: "custody_safeguarding" });
        expect(v?.status ?? "draft").toBe("draft");
        expect(db.rows("document_types").find((t) => t.id === body.type_id)?.published_version_id ?? null).toBeNull();
        expect(audits("document_type_changed")[0]?.payload).toMatchObject({ action: "create", key: "custody_order" });
    });

    it("editing a published type opens revision 2 and leaves version 1 untouched; the preview shows the medical floor", async () => {
        as(P.admin);
        const res = await invokeRoute(draftPUT, json("PUT", { ...GOOD, label: "Immunization", default_sensitivity: "standard" }), routeParams({ id: TYPE }));
        expect(res.status).toBe(200);
        const body = res.body as { version_number: number; created: boolean; problems: Array<{ code: string }> };
        expect(body).toMatchObject({ version_number: 2, created: true });
        expect(body.problems.map((p) => p.code)).toEqual(expect.arrayContaining(["medical_type_floor", "sensitivity_lowering"]));
        expect(db.rows("document_type_versions").find((v) => v.id === V1)).toMatchObject({ label: "Immunization record", status: "published" });
    });

    it("validate and publish go through the governed functions with compare-and-swap; the audit names the sensitivity change", async () => {
        as(P.admin);
        db.seed("document_type_versions", [
            ...db.rows("document_type_versions"),
            { id: V2, org_id: ORG, document_type_id: TYPE, version_number: 2, status: "validated", label: "Immunization record", category_id: CAT,
              subject_types: ["child"], allowed_formats: ["pdf"], default_sensitivity: "restricted", review_required: true, replacement_policy: "new_version",
              validity_policy: { kind: "none" }, validation_errors: [], created_at: "2026-10-02T00:00:00Z", published_at: null },
        ]);
        expect((await invokeRoute(validatePOST, json("POST", { version_id: V2 }), routeParams({ id: TYPE }))).status).toBe(200);
        expect(rpcCalls.at(-1)).toMatchObject({ name: "document_type_validate", args: { p_org_id: ORG, p_version_id: V2 } });
        const res = await invokeRoute(publishPOST, json("POST", { version_id: V2, expected_published_version_id: V1 }), routeParams({ id: TYPE }));
        expect(res.status).toBe(200);
        expect(rpcCalls.at(-1)).toMatchObject({ name: "document_type_publish", args: { p_type_id: TYPE, p_version_id: V2, p_expected_published_version_id: V1 } });
        expect(audits("document_type_changed").at(-1)?.payload).toMatchObject({ action: "publish", sensitivity_from: "medical", sensitivity_to: "restricted", superseded_version_id: V1 });
    });

    it("discarding a revision removes only the open draft; the published version stays live and the discard is audited", async () => {
        as(P.admin);
        expect((await invokeRoute(draftPUT, json("PUT", { ...GOOD, label: "Immunization" }), routeParams({ id: TYPE }))).status).toBe(200);
        // The in-memory client has no column defaults; the database stores a new version as 'draft'.
        for (const v of db.rows("document_type_versions")) v.status ??= "draft";
        const draft = db.rows("document_type_versions").find((v) => v.version_number === 2);
        expect(draft).toMatchObject({ status: "draft" });
        const res = await invokeRoute(draftDELETE, json("DELETE"), routeParams({ id: TYPE }));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ discarded: true, version_id: draft?.id, version_number: 2 });
        expect(db.rows("document_type_versions").map((v) => v.id)).toEqual([V1]);
        expect(db.rows("document_type_versions")[0]).toMatchObject({ status: "published", label: "Immunization record" });
        expect(db.rows("document_types").find((t) => t.id === TYPE)?.published_version_id).toBe(V1);
        expect(audits("document_type_changed").at(-1)?.payload).toMatchObject({ action: "discard_draft", key: "immunization_record", version_number: 2 });
    });

    it("discard refuses when there is no draft (nothing recorded), and when the draft is the type's only version (nothing removed)", async () => {
        as(P.admin);
        const none = await invokeRoute(draftDELETE, json("DELETE"), routeParams({ id: TYPE }));
        expect(none.status).toBe(404);
        expect((none.body as { code: string }).code).toBe("NO_OPEN_DRAFT");
        expect(audits("document_type_changed")).toHaveLength(0);

        const created = (await invokeRoute(typesPOST, json("POST", { ...GOOD }))).body as { type_id: string };
        for (const v of db.rows("document_type_versions")) v.status ??= "draft";
        const before = db.rows("document_type_versions").length;
        const only = await invokeRoute(draftDELETE, json("DELETE"), routeParams({ id: created.type_id }));
        expect(only.status).toBe(409);
        expect((only.body as { code: string }).code).toBe("ONLY_VERSION");
        expect(db.rows("document_type_versions")).toHaveLength(before);
        expect(db.rows("document_types").some((t) => t.id === created.type_id)).toBe(true);
    });

    it("a stale publish surfaces the conflict, and an unknown version is 404", async () => {
        as(P.admin);
        rpcError = "document_type_publish_conflict: the published version changed since this draft was opened";
        const res = await invokeRoute(publishPOST, json("POST", { version_id: V1, expected_published_version_id: null }), routeParams({ id: TYPE }));
        expect(res.status).toBe(409);
        expect((res.body as { code: string }).code).toBe("PUBLISH_CONFLICT");
        expect((await invokeRoute(publishPOST, json("POST", { version_id: "cf000000-0000-4000-8000-0000000000ff" }), routeParams({ id: TYPE }))).status).toBe(404);
    });

    it("the type list says which policy is enforced and which is only declared", async () => {
        as(P.reader);
        const body = (await invokeRoute(typesGET, buildRequest({ path: "/x" }))).body as { enforcement: Record<string, string> };
        expect(body.enforcement).toEqual({
            default_sensitivity: "enforced",
            review_required: "enforced_filing",
            replacement_policy: "enforced_replacement",
            allowed_formats: "enforced_filing",
            subject_types: "enforced_filing",
            validity_policy: "declared_d7",
        });
    });
});

describe("compatibility: stored doc_type values against the organization's types", () => {
    it("counts each stored value, maps the registered ones, and reports free text and NULL as unregistered", async () => {
        as(P.reader);
        const body = (await invokeRoute(compatibilityGET, buildRequest({ path: "/x" }))).body as { doc_types: Array<{ doc_type: string | null; documents: number; type_id: string | null }> };
        expect(body.doc_types).toEqual(
            expect.arrayContaining([
                { doc_type: "immunization_record", documents: 1, type_id: TYPE, type_status: "active" },
                { doc_type: "contract", documents: 1, type_id: null, type_status: null },
                { doc_type: null, documents: 1, type_id: null, type_status: null },
            ]),
        );
        expect(body.doc_types.some((d) => d.doc_type === "secret_type")).toBe(false);
    });
});

describe("the validator (editor preview) matches the database's", () => {
    const ctx: Parameters<typeof documentTypeDraftProblems>[1] = { typeKey: "custody_order", categoryActive: true, publishedSensitivity: null };

    it("accepts a complete draft", () => {
        expect(documentTypeDraftProblems(GOOD, ctx)).toEqual([]);
    });

    it("reports each problem by field", () => {
        const codes = (d: Partial<DocumentTypeDraft>, c: Partial<typeof ctx> = {}) => documentTypeDraftProblems({ ...GOOD, ...d }, { ...ctx, ...c }).map((p) => p.code);
        expect(codes({ label: "" })).toContain("label_required");
        expect(codes({ category_id: null })).toContain("category_required");
        expect(codes({}, { categoryActive: false })).toContain("category_not_active");
        expect(codes({ subject_types: [] })).toContain("subject_types_required");
        expect(codes({ allowed_formats: [] })).toContain("allowed_formats_required");
        expect(codes({ default_sensitivity: "standard" }, { typeKey: "physical" })).toContain("medical_type_floor");
        expect(codes({ default_sensitivity: "standard" }, { publishedSensitivity: "medical" })).toContain("sensitivity_lowering");
        expect(codes({ default_sensitivity: "personal_identity" }, { publishedSensitivity: "medical" })).toContain("sensitivity_lowering");
        expect(codes({ default_sensitivity: "restricted" }, { publishedSensitivity: "medical" })).not.toContain("sensitivity_lowering");
        expect(codes({ validity_policy: { kind: "duration", value: 0, unit: "months" } })).toContain("validity_value_range");
        expect(codes({ validity_policy: { kind: "duration", value: 12, unit: "weeks" as "days" } })).toContain("validity_unit_unknown");
        expect(codes({ validity_policy: { kind: "event_renewal", event: "graduation" as "birthday" } })).toContain("validity_event_unsupported");
        expect(codes({ validity_policy: { kind: "none", warning_days: [30] } })).toContain("warning_without_expiry");
        expect(codes({ validity_policy: { kind: "explicit_date", warning_days: [7, 30] } })).toContain("warning_days_order");
        expect(codes({ validity_policy: { kind: "explicit_date", warning_days: [60, 30, 14, 7, 3, 1] } })).toContain("warning_days_shape");
        expect(codes({ validity_policy: { kind: "none", value: 3 } as never })).toContain("validity_fields_not_applicable");
    });

    it("emits exactly the problem codes the database function emits", () => {
        const sql = readFileSync(join(resolve(__dirname, "../../.."), "supabase/migrations/20261209090100_documents_d3_studio_configuration.sql"), "utf8");
        const fn = sql.slice(sql.indexOf("FUNCTION public.document_type_version_problems"), sql.indexOf("FUNCTION public.document_type_validate"));
        const sqlCodes = new Set([...fn.matchAll(/'code', '([a-z_]+)'/g)].map((m) => m[1]).filter((c) => c !== "not_found"));
        const src = readFileSync(join(resolve(__dirname, "../.."), "lib/documents/configuration/documentTypePolicy.ts"), "utf8");
        const appCodes = new Set([...src.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]).filter((c) => !["sensitivity_unknown", "replacement_unknown"].includes(c)));
        expect([...appCodes].sort()).toEqual([...sqlCodes].sort());
    });

    it("a publish conflict is never a retryable error (hosted: SQLSTATE 40001 was retried until the request timed out)", () => {
        const sql = readFileSync(join(resolve(__dirname, "../../.."), "supabase/migrations/20261209090200_documents_d3_publish_conflict_not_retryable.sql"), "utf8");
        const body = sql.replace(/--[^\n]*/g, "");
        expect(body).toContain("document_type_publish_conflict");
        expect(body).toContain("ERRCODE = 'object_not_in_prerequisite_state'");
        expect(body.match(/ERRCODE = 'serialization_failure'/g)).toBeNull();
    });

    it("raise-only, as public.document_sensitivity_raise", () => {
        expect(raiseSensitivity("standard", "medical")).toBe("medical");
        expect(raiseSensitivity("medical", "standard")).toBe("medical");
        expect(raiseSensitivity("medical", "personal_identity")).toBe("medical");
        expect(raiseSensitivity("medical", "restricted")).toBe("restricted");
        expect(raiseSensitivity("restricted", "medical")).toBe("restricted");
    });

    it("derives keys that the database accepts", () => {
        expect(slugKey("Driver's License (front)")).toBe("driver_s_license_front");
        expect(slugKey("2026 Immunizations")).toBe("t_2026_immunizations");
    });
});
