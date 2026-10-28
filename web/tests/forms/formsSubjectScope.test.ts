/**
 * R2 — Forms reads and actions honour the caller's department/site scope (hosted qar_4246ac22ece0, D8).
 *
 * A department-restricted operator read an out-of-scope child's form answers through the submission read and the list
 * by child, while every Documents route refused the same actor. The fix is ONE rule for every Forms subject surface
 * (lib/forms/formSubmissionScope.ts): an opportunity's work unit department and site decide; a child, household,
 * person or unattached subject is readable only with unrestricted scope (the canonical no-linkage rule).
 *
 * The REAL routes run against an in-memory database that evaluates their filters; only the session, the access context
 * and the service-role client are substituted. Every refusal is a 404 that names nothing.
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
vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: async () => null };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => dbRef.current, createServiceRoleClient: () => dbRef.current }));
vi.mock("@/lib/supabase/serverServiceClient", () => ({ createServiceRoleClient: () => dbRef.current }));

import { GET as listGET, POST as createPOST } from "@/app/api/admin/forms/submissions/route";
import { GET as submissionGET } from "@/app/api/admin/forms/submissions/[submissionId]/route";
import { POST as generatePOST } from "@/app/api/admin/forms/submissions/[submissionId]/generate-document/route";
import { POST as submitPOST } from "@/app/api/admin/forms/submissions/[submissionId]/submit/route";
import { GET as sessionsGET } from "@/app/api/admin/forms/packet-sessions/route";
import { GET as sessionGET } from "@/app/api/admin/forms/packet-sessions/[packetSessionId]/route";
import { GET as intakeSourceGET } from "@/app/api/admin/opportunities/[id]/intake-source/route";
import { POST as previewPOST } from "@/app/api/admin/forms/preview-payload/route";
import { GET as projectionGET } from "@/app/api/admin/pos/packets/sessions/[sessionId]/participant-projection/route";
import { filterLinksInActorScope, linkMetadataSubject, packetSessionSubject } from "@/lib/forms/formSubmissionScope";

const ORG = "0a000000-0000-4000-8000-0000000000f2";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000f2";
const USER = "05e00000-0000-4000-8000-0000000000f2";
const D_IN = "de000000-0000-4000-8000-000000000001";
const D_OUT = "de000000-0000-4000-8000-000000000002";
const WU_IN = "a0000000-0000-4000-8000-000000000001";
const WU_OUT = "a0000000-0000-4000-8000-000000000002";
const OPP_IN = "0f000000-0000-4000-8000-000000000001";
const OPP_OUT = "0f000000-0000-4000-8000-000000000002";
const CHILD = "cb000000-0000-4000-8000-0000000000f2";
const FORM = "f0000000-0000-4000-8000-0000000000f2";
const VERSION = "f1000000-0000-4000-8000-0000000000f2";
const S = {
    inScope: "5b000000-0000-4000-8000-000000000001", // opportunity in the actor's department (also names the child)
    outScope: "5b000000-0000-4000-8000-000000000002", // opportunity in another department
    childOnly: "5b000000-0000-4000-8000-000000000003", // a child, no opportunity — the hosted finding
    otherOrg: "5b000000-0000-4000-8000-000000000004",
};
const PS = { inScope: "5c000000-0000-4000-8000-000000000001", outScope: "5c000000-0000-4000-8000-000000000002", childOnly: "5c000000-0000-4000-8000-000000000003" };
const SECRET = "QA-R2-SECRET-ANSWER";
const PERSON = "9e000000-0000-4000-8000-0000000000f2";

type Scope = { departmentScope: "all" | "restricted"; allowedDepartmentIds: string[] | null; siteScope: "all" | "restricted"; allowedSiteLocationIds: string[] | null };
const UNRESTRICTED: Scope = { departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null };
const RESTRICTED: Scope = { departmentScope: "restricted", allowedDepartmentIds: [D_IN], siteScope: "all", allowedSiteLocationIds: null };
const PERMS = ["forms.author", "forms.submissions", "forms.submissions.confirm", "documents.read", "health.view"];

function as(orgId: string, scope: Scope) {
    mockCtx.mockResolvedValue({ ok: true, orgId, role: "admin", userId: USER, permissionKeys: PERMS });
    mockAccess.mockResolvedValue({ ok: true, userId: USER, orgId, roleKeys: ["admin"], permissionKeys: PERMS, ...scope });
}
function anonymous() {
    mockCtx.mockResolvedValue({ ok: false, status: 401 });
    mockAccess.mockResolvedValue({ ok: false, status: 401 });
}

let db: InMemorySupabase;
const submission = (id: string, over: Record<string, unknown>) => ({
    id, org_id: ORG, form_definition_id: FORM, form_definition_version_id: VERSION, status: "submitted", payload: { values: { note: `${SECRET} ${id}` } },
    person_id: null, customer_id: null, customer_member_id: null, opportunity_id: null, created_via_public_link_id: null, metadata: {},
    submitted_at: "2026-10-28T10:00:00Z", created_at: "2026-10-28T09:00:00Z", ...over,
});
const session = (id: string, crm_snapshot: Record<string, unknown>) => ({
    id, org_id: ORG, packet_definition_id: null, status: "in_progress", crm_snapshot, launch_context: {}, shared_values: { note: `${SECRET} ${id}` }, created_at: "2026-10-28T09:00:00Z",
});

beforeEach(() => {
    db = new InMemorySupabase();
    dbRef.current = db;
    db.seed("work_units", [{ id: WU_IN, org_id: ORG, department_id: D_IN }, { id: WU_OUT, org_id: ORG, department_id: D_OUT }]);
    db.seed("opportunities", [{ id: OPP_IN, org_id: ORG, work_unit_id: WU_IN, location_id: null }, { id: OPP_OUT, org_id: ORG, work_unit_id: WU_OUT, location_id: null }]);
    db.seed("form_definitions", [{ id: FORM, org_id: ORG, key: "consent", name: "Consent", metadata: {} }]);
    db.seed("form_definition_versions", [{
        id: VERSION, org_id: ORG, form_definition_id: FORM, version_number: 1, status: "published", pdf_mapping_json: null, metadata: {},
        schema_json: { schema_version: 1, title: "Consent", sections: [{ id: "s", title: "S", field_ids: ["note"] }], fields: [{ id: "note", label: "Note", type: "text" }] },
    }]);
    db.seed("form_submissions", [
        submission(S.inScope, { opportunity_id: OPP_IN, customer_member_id: CHILD }),
        submission(S.outScope, { opportunity_id: OPP_OUT }),
        submission(S.childOnly, { customer_member_id: CHILD }),
        submission(S.otherOrg, { org_id: OTHER_ORG, opportunity_id: OPP_IN }),
    ]);
    db.seed("form_packet_sessions", [
        session(PS.inScope, { opportunity_id: OPP_IN, customer_member_id: CHILD }),
        session(PS.outScope, { opportunity_id: OPP_OUT }),
        session(PS.childOnly, { customer_member_id: CHILD }),
    ]);
});

const get = (id: string) => invokeRoute(submissionGET, buildRequest({ path: `/api/admin/forms/submissions/${id}` }), routeParams({ submissionId: id }));
const list = (q = "") => invokeRoute(listGET, buildRequest({ path: `/api/admin/forms/submissions${q}` }));
const leaks = (body: unknown, ...ids: string[]) => {
    const raw = JSON.stringify(body ?? null);
    return raw.includes(SECRET) || ids.some((i) => raw.includes(i));
};
const ids = (body: unknown) => (((body as { data?: Array<{ id: string }> })?.data) ?? []).map((r) => r.id);

describe("submission read — the hosted finding (single read and list by child)", () => {
    it("an unrestricted administrator reads every subject of its organization", async () => {
        as(ORG, UNRESTRICTED);
        for (const id of [S.inScope, S.outScope, S.childOnly]) expect((await get(id)).status).toBe(200);
        expect(ids((await list()).body).sort()).toEqual([S.inScope, S.outScope, S.childOnly].sort());
    });
    it("in scope: a restricted operator reads a submission whose opportunity is in its department", async () => {
        as(ORG, RESTRICTED);
        const r = await get(S.inScope);
        expect(r.status).toBe(200);
        expect(JSON.stringify(r.body)).toContain(SECRET);
    });
    it("out of scope (another department, or a child with no department linkage): 404, nothing named", async () => {
        as(ORG, RESTRICTED);
        for (const id of [S.outScope, S.childOnly]) {
            const r = await get(id);
            expect(r.status).toBe(404);
            expect(leaks(r.body, id, CHILD, OPP_OUT)).toBe(false);
        }
    });
    it("the list never discloses out-of-scope submissions, filtered or not", async () => {
        as(ORG, RESTRICTED);
        expect(ids((await list()).body)).toEqual([S.inScope]);
        const byChild = await list(`?customer_member_id=${CHILD}`);
        expect(byChild.status).toBe(200);
        expect(ids(byChild.body)).toEqual([S.inScope]); // the opportunity-linked one only; never the child-only answers
        const byOpp = await list(`?opportunity_id=${OPP_OUT}`);
        expect(ids(byOpp.body)).toEqual([]);
        expect(leaks(byOpp.body, S.outScope)).toBe(false);
    });
    it("wrong organization: 404 even for an unrestricted administrator of the other organization", async () => {
        as(OTHER_ORG, UNRESTRICTED);
        expect((await get(S.inScope)).status).toBe(404);
        expect(ids((await list()).body)).toEqual([S.otherOrg]);
    });
    it("anonymous: refused before anything is read", async () => {
        anonymous();
        expect((await get(S.inScope)).status).toBe(401);
        expect((await list()).status).toBe(401);
    });
    it("a failed access context is no scope at all (fail closed)", async () => {
        mockCtx.mockResolvedValue({ ok: true, orgId: ORG, role: "admin", userId: USER, permissionKeys: PERMS });
        mockAccess.mockResolvedValue({ ok: false, status: 403 });
        expect((await get(S.inScope)).status).toBe(404);
        expect(ids((await list()).body)).toEqual([]);
    });
});

describe("submission actions — out of scope is not found, and nothing is written", () => {
    it("creating a submission about an out-of-scope subject is refused; in scope is created", async () => {
        as(ORG, RESTRICTED);
        const create = (subject: Record<string, string>) =>
            invokeRoute(createPOST, buildRequest({ method: "POST", path: "/x", body: { form_definition_version_id: VERSION, payload: { values: { note: "x" } }, ...subject } }));
        expect((await create({ customer_member_id: CHILD })).status).toBe(404);
        expect((await create({ opportunity_id: OPP_OUT })).status).toBe(404);
        expect(db.rows("form_submissions")).toHaveLength(4);
        expect((await create({ opportunity_id: OPP_IN })).status).toBe(201);
    });
    it("submit and generate-document on an out-of-scope submission: 404, no document stored", async () => {
        as(ORG, RESTRICTED);
        await db.from("form_submissions").update({ status: "draft" }).eq("id", S.childOnly);
        const submit = await invokeRoute(submitPOST, buildRequest({ method: "POST", path: "/x", body: {} }), routeParams({ submissionId: S.childOnly }));
        expect(submit.status).toBe(404);
        expect(db.rows("form_submissions").find((r) => r.id === S.childOnly)?.status).toBe("draft");
        const gen = await invokeRoute(generatePOST, buildRequest({ method: "POST", path: "/x", body: {} }), routeParams({ submissionId: S.outScope }));
        expect(gen.status).toBe(404);
        expect(db.rows("documents")).toHaveLength(0);
    });
});

describe("packet sessions — the same rule from the session's trusted snapshot", () => {
    it("the session subject comes from crm_snapshot, else the launch source", () => {
        expect(packetSessionSubject({ crm_snapshot: { opportunity_id: OPP_IN } })).toMatchObject({ opportunity_id: OPP_IN });
        expect(packetSessionSubject({ crm_snapshot: {}, launch_context: { source_entity_type: "customer_member", source_entity_id: CHILD } })).toMatchObject({ customer_member_id: CHILD, opportunity_id: null });
    });
    it("restricted: by id, an in-scope session is readable; out-of-scope and child-only are 404 with no answers", async () => {
        as(ORG, RESTRICTED);
        const one = (id: string) => invokeRoute(sessionGET, buildRequest({ path: "/x" }), routeParams({ packetSessionId: id }));
        expect((await one(PS.inScope)).status).toBe(200);
        for (const id of [PS.outScope, PS.childOnly]) {
            const r = await one(id);
            expect(r.status).toBe(404);
            expect(leaks(r.body, id)).toBe(false);
        }
    });
    it("restricted: the session list shows only in-scope sessions", async () => {
        as(ORG, RESTRICTED);
        expect(ids((await invokeRoute(sessionsGET, buildRequest({ path: "/x" }))).body)).toEqual([PS.inScope]);
        as(ORG, UNRESTRICTED);
        expect(ids((await invokeRoute(sessionsGET, buildRequest({ path: "/x" }))).body).sort()).toEqual(Object.values(PS).sort());
    });
    it("restricted: a participant projection of an out-of-scope session is not found", async () => {
        as(ORG, RESTRICTED);
        const r = await invokeRoute(projectionGET, buildRequest({ path: `/x?person_id=${PERSON}` }), routeParams({ sessionId: PS.outScope }));
        expect(r.status).toBe(404);
    });
});

describe("other Forms subject reads", () => {
    it("an opportunity's intake answers only within scope", async () => {
        as(ORG, RESTRICTED);
        const intake = (id: string) => invokeRoute(intakeSourceGET, buildRequest({ path: "/x" }), routeParams({ id }));
        const out = await intake(OPP_OUT);
        expect(out.status).toBe(404);
        expect(leaks(out.body)).toBe(false);
        expect((await intake(OPP_IN)).status).toBe(200);
    });
    it("a preview prefilled from an out-of-scope record is refused", async () => {
        as(ORG, RESTRICTED);
        const preview = (launch_fks: Record<string, string>) =>
            invokeRoute(previewPOST, buildRequest({ method: "POST", path: "/x", body: { schema_json: { schema_version: 1, title: "t", sections: [{ id: "s", field_ids: ["note"] }], fields: [{ id: "note", label: "Note", type: "text" }] }, launch_fks } }));
        expect((await preview({ customer_member_id: CHILD })).status).toBe(404);
        expect((await preview({ opportunity_id: OPP_OUT })).status).toBe(404);
        expect((await preview({ opportunity_id: OPP_IN })).status).not.toBe(404);
    });
    it("links: one naming an out-of-scope child / recipient / opportunity is dropped; one naming nothing is kept", async () => {
        const links = [
            { id: "l-none", metadata: { packet_definition_id: "p" } },
            { id: "l-in", metadata: { source_entity_type: "opportunity", source_entity_id: OPP_IN } },
            { id: "l-out", metadata: { anchor_opportunity_id: OPP_OUT, composer_child_id: CHILD } },
            { id: "l-child", metadata: { selected_customer_member_id: CHILD, recipient_person_id: PERSON } },
        ];
        expect(linkMetadataSubject(links[0].metadata)).toBeNull();
        const kept = await filterLinksInActorScope(db as never, ORG, RESTRICTED, links);
        expect(kept.map((l) => l.id)).toEqual(["l-none", "l-in"]);
        expect((await filterLinksInActorScope(db as never, ORG, UNRESTRICTED, links)).map((l) => l.id)).toEqual(links.map((l) => l.id));
        expect(await filterLinksInActorScope(db as never, ORG, null, links)).toEqual([]);
    });
});
