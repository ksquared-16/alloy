/**
 * R2 — a Forms write's DESTINATION honours the caller's department/site scope, not only its current subject.
 *
 * Found reading the routes for the hosted R2 matrix (certification/documents-v1/R2-R5-PROOF-SUPPORT.md): four writes
 * take their destination from the request and checked only the current subject or the anchor —
 *   manual-link              re-points a submission's opportunity / household / child / person;
 *   POS packet compose       mints links for an anchor's children and recipients (only the anchor was checked);
 *   form public link mint    caller metadata (`source_entity_*`, opportunity, selected children, recipient) feeds the
 *   and its PATCH            public prefill and the submission's subject; the PATCH did not scope the existing link;
 *   packet link mint         the same metadata and the enrollment selection (only `launch_from_entity` was checked);
 *   packet roster (read)     the composer's household roster (children with dates of birth, parents) had no gate.
 *
 * The rule is the read rule applied to the destination (`lib/forms/formsDestinationScope.ts`): every named subject in
 * scope; every child / recipient in the in-scope opportunity's own household. A restricted actor's refusal is the same
 * 404 a missing record gets, and writes NOTHING; unrestricted actors keep their behaviour and their descriptive 400s.
 * The REAL routes run against an in-memory database; only the session, access context and service client are substituted.
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

import { POST as manualLinkPOST } from "@/app/api/admin/forms/submissions/[submissionId]/manual-link/route";
import { POST as composePOST } from "@/app/api/admin/pos/packets/compose/route";
import { POST as formLinkPOST } from "@/app/api/admin/forms/[formId]/public-links/route";
import { PATCH as formLinkPATCH } from "@/app/api/admin/forms/[formId]/public-links/[linkId]/route";
import { POST as packetLinkPOST } from "@/app/api/admin/forms/packet-links/route";
import { GET as rosterGET } from "@/app/api/admin/pos/packets/roster/route";
import { linkMetadataDestination } from "@/lib/forms/formsDestinationScope";

const ORG = "0a000000-0000-4000-8000-0000000000d7";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d7";
const USER = "05e00000-0000-4000-8000-0000000000d7";
const D_IN = "de000000-0000-4000-8000-0000000000d1";
const D_OUT = "de000000-0000-4000-8000-0000000000d2";
const WU_IN = "a0000000-0000-4000-8000-0000000000d1";
const WU_OUT = "a0000000-0000-4000-8000-0000000000d2";
const HH_IN = "c0000000-0000-4000-8000-0000000000d1";
const HH_OUT = "c0000000-0000-4000-8000-0000000000d2";
const OPP_IN = "0f000000-0000-4000-8000-0000000000d1";
const OPP_OUT = "0f000000-0000-4000-8000-0000000000d2";
const OPP_X = "0f000000-0000-4000-8000-0000000000d3"; // another organization
const CHILD_IN = "cb000000-0000-4000-8000-0000000000d1";
const CHILD_IN_2 = "cb000000-0000-4000-8000-0000000000d4"; // inactive, same household
const CHILD_OUT = "cb000000-0000-4000-8000-0000000000d2";
const CHILD_X = "cb000000-0000-4000-8000-0000000000d3";
const PERSON_IN = "9e000000-0000-4000-8000-0000000000d1";
const PERSON_OUT = "9e000000-0000-4000-8000-0000000000d2";
const MISSING = "0e000000-0000-4000-8000-0000000000d9";
const FORM = "f0000000-0000-4000-8000-0000000000d7";
const VERSION = "f1000000-0000-4000-8000-0000000000d7";
const PACKET = "fa000000-0000-4000-8000-0000000000d7";
const S_IN = "5b000000-0000-4000-8000-0000000000d1";
const S_OUT = "5b000000-0000-4000-8000-0000000000d2";
const LINK_OUT = "1c000000-0000-4000-8000-0000000000d2";
const LINK_NONE = "1c000000-0000-4000-8000-0000000000d3";
const SECRET = "QA-R2-DEST-SECRET";

type Scope = { departmentScope: "all" | "restricted"; allowedDepartmentIds: string[] | null; siteScope: "all" | "restricted"; allowedSiteLocationIds: string[] | null };
const UNRESTRICTED: Scope = { departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null };
const RESTRICTED: Scope = { departmentScope: "restricted", allowedDepartmentIds: [D_IN], siteScope: "all", allowedSiteLocationIds: null };
const PERMS = ["forms.author", "forms.submissions", "forms.submissions.confirm", "documents.read"];

function as(orgId: string, scope: Scope, perms = PERMS) {
    mockCtx.mockResolvedValue({ ok: true, orgId, role: "admin", userId: USER, permissionKeys: perms });
    mockAccess.mockResolvedValue({ ok: true, userId: USER, orgId, roleKeys: ["admin"], permissionKeys: perms, ...scope });
}

let db: InMemorySupabase;
const TABLES = ["form_submissions", "form_public_links", "form_packet_definitions", "form_packet_items", "form_definition_versions", "documents"];
const snapshot = () => JSON.stringify(TABLES.map((t) => db.rows(t)));

beforeEach(() => {
    db = new InMemorySupabase();
    dbRef.current = db;
    db.seed("work_units", [{ id: WU_IN, org_id: ORG, department_id: D_IN }, { id: WU_OUT, org_id: ORG, department_id: D_OUT }]);
    db.seed("customers", [{ id: HH_IN, org_id: ORG }, { id: HH_OUT, org_id: ORG }]);
    db.seed("opportunities", [
        { id: OPP_IN, org_id: ORG, work_unit_id: WU_IN, location_id: null, customer_id: HH_IN, primary_person_id: null, primary_contact_id: null },
        { id: OPP_OUT, org_id: ORG, work_unit_id: WU_OUT, location_id: null, customer_id: HH_OUT, primary_person_id: null, primary_contact_id: null },
        { id: OPP_X, org_id: OTHER_ORG, work_unit_id: null, location_id: null, customer_id: null, primary_person_id: null, primary_contact_id: null },
    ]);
    db.seed("customer_members", [
        { id: CHILD_IN, org_id: ORG, customer_id: HH_IN, relationship: "child", is_active: true, display_name: "In" },
        { id: CHILD_IN_2, org_id: ORG, customer_id: HH_IN, relationship: "child", is_active: false, display_name: "In 2" },
        { id: CHILD_OUT, org_id: ORG, customer_id: HH_OUT, relationship: "child", is_active: true, display_name: "Out" },
        { id: CHILD_X, org_id: OTHER_ORG, customer_id: null, relationship: "child", is_active: true, display_name: "X" },
    ]);
    db.seed("persons", [{ id: PERSON_IN, org_id: ORG, full_name: "In" }, { id: PERSON_OUT, org_id: ORG, full_name: "Out" }]);
    db.seed("customer_persons", [
        { org_id: ORG, customer_id: HH_IN, person_id: PERSON_IN, role_type: "primary_contact", is_primary: true },
        { org_id: ORG, customer_id: HH_OUT, person_id: PERSON_OUT, role_type: "primary_contact", is_primary: true },
    ]);
    db.seed("form_definitions", [{ id: FORM, org_id: ORG, key: "consent", name: "Consent", kind: "center", is_active: true, metadata: {} }]);
    db.seed("form_definition_versions", [{
        id: VERSION, org_id: ORG, form_definition_id: FORM, version_number: 1, status: "published", pdf_mapping_json: null, metadata: {},
        schema_json: { schema_version: 1, title: "Consent", sections: [{ id: "s", title: "S", field_ids: ["note"] }], fields: [{ id: "note", label: "Note", type: "text" }] },
    }]);
    db.seed("form_packet_definitions", [{ id: PACKET, org_id: ORG, key: "pkt", name: "Packet", is_active: true, metadata: {} }]);
    db.seed("form_packet_items", [{ id: "item-1", org_id: ORG, packet_definition_id: PACKET, sequence_index: 0, form_definition_id: FORM, pinned_form_definition_version_id: null, metadata: {} }]);
    const sub = (id: string, over: Record<string, unknown>) => ({
        id, org_id: ORG, form_definition_id: FORM, form_definition_version_id: VERSION, status: "submitted", payload: { values: { note: `${SECRET} ${id}` }, meta: {} },
        person_id: null, customer_id: null, customer_member_id: null, opportunity_id: null, metadata: {}, updated_at: "2026-10-30T00:00:00Z", ...over,
    });
    db.seed("form_submissions", [sub(S_IN, { opportunity_id: OPP_IN, customer_id: HH_IN }), sub(S_OUT, { opportunity_id: OPP_OUT, customer_id: HH_OUT })]);
    db.seed("form_public_links", [
        { id: LINK_OUT, org_id: ORG, form_definition_id: FORM, is_active: true, metadata: { opportunity_id: OPP_OUT, label: SECRET }, token_hash: "h1", expires_at: null, allowed_embed_origins: null },
        { id: LINK_NONE, org_id: ORG, form_definition_id: FORM, is_active: true, metadata: { label: "intake" }, token_hash: "h2", expires_at: null, allowed_embed_origins: null },
    ]);
});

const relink = (submissionId: string, body: Record<string, unknown>) =>
    invokeRoute(manualLinkPOST, buildRequest({ method: "POST", path: "/x", body }), routeParams({ submissionId }));
const row = (id: string) => db.rows("form_submissions").find((r) => r.id === id)!;
const leaks = (body: unknown, ...ids: string[]) => {
    const raw = JSON.stringify(body ?? null);
    return raw.includes(SECRET) || ids.some((i) => raw.includes(i));
};

describe("manual-link — the proposed target is scoped like the current subject", () => {
    it("restricted, in scope: re-linking to a child of the same in-scope household is written", async () => {
        as(ORG, RESTRICTED);
        const r = await relink(S_IN, { customer_member_id: CHILD_IN });
        expect(r.status).toBe(200);
        expect(row(S_IN).customer_member_id).toBe(CHILD_IN);
        expect(row(S_IN).opportunity_id).toBe(OPP_IN);
    });

    it("restricted, out-of-scope opportunity target (alone, or consistent with its household): 404, names nothing, writes nothing", async () => {
        as(ORG, RESTRICTED);
        for (const body of [{ opportunity_id: OPP_OUT }, { opportunity_id: OPP_OUT, customer_id: HH_OUT }]) {
            const before = snapshot();
            const r = await relink(S_IN, body);
            expect(r.status, JSON.stringify(body)).toBe(404);
            expect(leaks(r.body, OPP_OUT, HH_OUT)).toBe(false);
            expect(snapshot()).toBe(before);
        }
    });

    it("restricted: an existing out-of-scope child and a missing child are indistinguishable (same 404, same body)", async () => {
        as(ORG, RESTRICTED);
        const before = snapshot();
        const existing = await relink(S_IN, { customer_member_id: CHILD_OUT });
        const missing = await relink(S_IN, { customer_member_id: MISSING });
        expect(existing.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(existing.body).toEqual(missing.body);
        expect(snapshot()).toBe(before);
    });

    it("restricted, ambiguous: un-linking the opportunity leaves a subject only an unrestricted actor may hold → 404, nothing written", async () => {
        as(ORG, RESTRICTED);
        const before = snapshot();
        const r = await relink(S_IN, { opportunity_id: null });
        expect(r.status).toBe(404);
        expect(snapshot()).toBe(before);
    });

    it("restricted, cross-organization target: the same 404 as a missing one, nothing written", async () => {
        as(ORG, RESTRICTED);
        const before = snapshot();
        const cross = await relink(S_IN, { opportunity_id: OPP_X });
        const missing = await relink(S_IN, { opportunity_id: MISSING });
        expect(cross.status).toBe(404);
        expect(cross.body).toEqual(missing.body);
        expect(snapshot()).toBe(before);
    });

    it("restricted: an out-of-scope CURRENT subject is still 404 whatever the target", async () => {
        as(ORG, RESTRICTED);
        const before = snapshot();
        expect((await relink(S_OUT, { opportunity_id: OPP_IN, customer_id: HH_IN })).status).toBe(404);
        expect(snapshot()).toBe(before);
    });

    it("unrestricted: re-linking across departments is unchanged (200), and the descriptive 400s are kept", async () => {
        as(ORG, UNRESTRICTED);
        const missing = await relink(S_IN, { customer_member_id: MISSING });
        expect(missing.status).toBe(400);
        expect(JSON.stringify(missing.body)).toContain("customer_member_id not found in this organization");
        const mismatch = await relink(S_IN, { customer_member_id: CHILD_OUT });
        expect(mismatch.status).toBe(400);
        expect(JSON.stringify(mismatch.body)).toContain("does not match");
        const moved = await relink(S_IN, { opportunity_id: OPP_OUT, customer_id: HH_OUT });
        expect(moved.status).toBe(200);
        expect(row(S_IN).opportunity_id).toBe(OPP_OUT);
    });

    it("another organization's unrestricted admin: 404 on our submission, nothing written", async () => {
        as(OTHER_ORG, UNRESTRICTED);
        const before = snapshot();
        expect((await relink(S_IN, { opportunity_id: OPP_X })).status).toBe(404);
        expect(snapshot()).toBe(before);
    });
});

const compose = (body: Record<string, unknown>) => invokeRoute(composePOST, buildRequest({ method: "POST", path: "/x", body }));
const anchorIn = { entity_type: "opportunity", entity_id: OPP_IN };

describe("POS packet compose — every child and recipient, not just the anchor (restricted author)", () => {
    const refusals: Array<[string, Record<string, unknown>]> = [
        ["a child of another department's household", { anchor: anchorIn, child_ids: [CHILD_OUT] }],
        ["the second of two children out of scope (not only the first is read)", { anchor: anchorIn, child_ids: [CHILD_IN, CHILD_OUT] }],
        ["a recipient of another household", { anchor: anchorIn, recipient_ids: [PERSON_OUT] }],
        ["a child of another organization", { anchor: anchorIn, child_ids: [CHILD_X] }],
        ["an out-of-scope anchor", { anchor: { entity_type: "opportunity", entity_id: OPP_OUT }, child_ids: [] }],
        ["a household anchor (no department linkage)", { anchor: { entity_type: "customer", entity_id: HH_IN } }],
    ];
    for (const [why, dest] of refusals) {
        it(`${why} → 404, nothing published, defined or minted`, async () => {
            as(ORG, RESTRICTED);
            const before = snapshot();
            const r = await compose({ form_definition_ids: [FORM], ...dest });
            expect(r.status).toBe(404);
            expect(leaks(r.body, CHILD_OUT, PERSON_OUT, OPP_OUT)).toBe(false);
            expect(snapshot()).toBe(before);
        });
    }

    it("in scope: the anchor's own children (an inactive one included) and recipient pass the destination gate", async () => {
        as(ORG, RESTRICTED);
        const r = await compose({ form_definition_ids: [FORM], anchor: anchorIn, child_ids: [CHILD_IN, CHILD_IN_2], recipient_ids: [PERSON_IN] });
        expect(r.status).not.toBe(404);
        expect(r.status).not.toBe(403);
        expect(db.rows("form_packet_definitions").length).toBe(2); // the packet was created: the request got past the gate
    });

    it("unrestricted: unchanged — another household's child is not refused by scope", async () => {
        as(ORG, UNRESTRICTED);
        const r = await compose({ form_definition_ids: [FORM], anchor: anchorIn, child_ids: [CHILD_OUT] });
        expect(r.status).not.toBe(404);
    });

    it("without forms.author: refused by capability (403) before anything else", async () => {
        as(ORG, RESTRICTED, ["forms.submissions", "documents.read"]);
        expect((await compose({ form_definition_ids: [FORM], anchor: anchorIn })).status).toBe(403);
    });
});

const mint = (body: Record<string, unknown>) => invokeRoute(formLinkPOST, buildRequest({ method: "POST", path: "/x", body }), routeParams({ formId: FORM }));
const patch = (linkId: string, body: Record<string, unknown>) =>
    invokeRoute(formLinkPATCH, buildRequest({ method: "PATCH", path: "/x", body }), routeParams({ formId: FORM, linkId }));

describe("form public link — caller metadata subjects are destinations (restricted author)", () => {
    const refusals: Array<[string, Record<string, unknown>]> = [
        ["existing-record prefill from an out-of-scope opportunity", { metadata: { form_context_mode: "existing_record", source_entity_type: "opportunity", source_entity_id: OPP_OUT } }],
        ["a child source (no department linkage)", { metadata: { form_context_mode: "existing_record", source_entity_type: "customer_member", source_entity_id: CHILD_IN } }],
        ["an in-scope opportunity carrying another household's child in the ARRAY", { metadata: { opportunity_id: OPP_IN, selected_customer_member_ids: [CHILD_IN, CHILD_OUT] } }],
        ["an in-scope launch carrying another household's recipient", { launch_from_entity: anchorIn, metadata: { composer_recipient_id: PERSON_OUT } }],
        ["an in-scope launch carrying an out-of-scope anchor opportunity", { launch_from_entity: anchorIn, metadata: { anchor_opportunity_id: OPP_OUT } }],
    ];
    for (const [why, body] of refusals) {
        it(`${why} → 404, no link written`, async () => {
            as(ORG, RESTRICTED);
            const before = snapshot();
            const r = await mint(body);
            expect(r.status).toBe(404);
            expect(leaks(r.body, OPP_OUT, CHILD_OUT, PERSON_OUT)).toBe(false);
            expect(snapshot()).toBe(before);
        });
    }

    it("passes: intake metadata naming no subject, and an in-scope opportunity with its own child", async () => {
        as(ORG, RESTRICTED);
        expect((await mint({ metadata: { label: "intake", form_context_mode: "processing_intake" } })).status).not.toBe(404);
        expect((await mint({ metadata: { opportunity_id: OPP_IN, selected_customer_member_ids: [CHILD_IN] } })).status).not.toBe(404);
    });

    it("unrestricted: unchanged — metadata naming any record of the organization is accepted", async () => {
        as(ORG, UNRESTRICTED);
        expect((await mint({ metadata: { form_context_mode: "existing_record", source_entity_type: "opportunity", source_entity_id: OPP_OUT } })).status).not.toBe(404);
    });

    it("PATCH: a link naming an out-of-scope subject is not found; nothing changes", async () => {
        as(ORG, RESTRICTED);
        const before = snapshot();
        const r = await patch(LINK_OUT, { is_active: false });
        expect(r.status).toBe(404);
        expect(leaks(r.body, OPP_OUT)).toBe(false);
        expect(snapshot()).toBe(before);
    });

    it("PATCH: metadata may not re-point a subject-less link at an out-of-scope record; a plain edit still works", async () => {
        as(ORG, RESTRICTED);
        const before = snapshot();
        const r = await patch(LINK_NONE, { metadata: { form_context_mode: "packet", source_entity_type: "opportunity", source_entity_id: OPP_OUT } });
        expect(r.status).toBe(404);
        expect(snapshot()).toBe(before);
        const ok = await patch(LINK_NONE, { is_active: false });
        expect(ok.status).toBe(200);
        expect(db.rows("form_public_links").find((l) => l.id === LINK_NONE)?.is_active).toBe(false);
    });

    it("PATCH, unrestricted: unchanged", async () => {
        as(ORG, UNRESTRICTED);
        expect((await patch(LINK_OUT, { is_active: false })).status).toBe(200);
    });
});

const packetLink = (body: Record<string, unknown>) => invokeRoute(packetLinkPOST, buildRequest({ method: "POST", path: "/x", body }));

describe("packet link mint — metadata and enrollment selection are destinations (restricted, forms.submissions)", () => {
    const SUBMITTER = ["forms.submissions", "forms.submissions.confirm", "documents.read"];
    const refusals: Array<[string, Record<string, unknown>]> = [
        ["no launch, metadata prefill source out of scope", { packet_definition_id: PACKET, metadata: { source_entity_type: "opportunity", source_entity_id: OPP_OUT } }],
        ["in-scope launch, enrollment selection of another household's child", { packet_definition_id: PACKET, launch_from_entity: anchorIn, enrollment_selection: { customer_member_id: CHILD_OUT } }],
        ["in-scope launch, enrollment selection of another household's recipient", { packet_definition_id: PACKET, launch_from_entity: anchorIn, enrollment_selection: { recipient_person_id: PERSON_OUT } }],
        ["in-scope launch, metadata children beyond the first", { packet_definition_id: PACKET, launch_from_entity: anchorIn, metadata: { selected_customer_member_ids: [CHILD_IN, CHILD_OUT] } }],
    ];
    for (const [why, body] of refusals) {
        it(`${why} → 404, no link written`, async () => {
            as(ORG, RESTRICTED, SUBMITTER);
            const before = snapshot();
            const r = await packetLink(body);
            expect(r.status).toBe(404);
            expect(snapshot()).toBe(before);
        });
    }

    it("in-scope launch with its own child passes the destination gate", async () => {
        as(ORG, RESTRICTED, SUBMITTER);
        const r = await packetLink({ packet_definition_id: PACKET, launch_from_entity: anchorIn, enrollment_selection: { customer_member_id: CHILD_IN } });
        expect(r.status).not.toBe(404);
    });

    it("unrestricted: unchanged", async () => {
        as(ORG, UNRESTRICTED, SUBMITTER);
        expect((await packetLink({ packet_definition_id: PACKET, metadata: { source_entity_type: "opportunity", source_entity_id: OPP_OUT } })).status).not.toBe(404);
    });
});

describe("linkMetadataDestination reads every subject key", () => {
    it("collects the launch, every opportunity key, the source, every child (arrays whole) and every recipient", () => {
        const d = linkMetadataDestination(
            { opportunity_id: OPP_IN, anchor_opportunity_id: OPP_OUT, composer_child_id: CHILD_IN, selected_customer_member_ids: [CHILD_IN, CHILD_OUT], recipient_person_id: PERSON_IN, composer_recipient_id: PERSON_OUT },
            { opportunity_id: OPP_IN },
        );
        expect(d.subjects).toEqual([{ opportunity_id: OPP_IN }, { opportunity_id: OPP_IN }, { opportunity_id: OPP_OUT }]);
        expect(d.childIds).toEqual([CHILD_IN, CHILD_OUT]);
        expect(d.recipientIds).toEqual([PERSON_OUT, PERSON_IN]);
        expect(d.rosterOpportunityId).toBe(OPP_IN);
    });
    it("a non-opportunity source is an unlinked subject", () => {
        expect(linkMetadataDestination({ source_entity_type: "person", source_entity_id: PERSON_IN }).subjects).toEqual([{ person_id: PERSON_IN }]);
    });
});

const roster = (entityType: string, entityId: string) =>
    invokeRoute(rosterGET, buildRequest({ path: `/api/admin/pos/packets/roster?entity_type=${entityType}&entity_id=${entityId}` }));

describe("packet roster — the composer's household read is the composer's: forms.author and an in-scope anchor", () => {
    it("restricted author, in-scope opportunity: its household's children and recipient", async () => {
        as(ORG, RESTRICTED);
        const r = await roster("opportunity", OPP_IN);
        expect(r.status).toBe(200);
        const data = (r.body as { data?: { children?: Array<{ customer_member_id: string }>; recipients?: Array<{ person_id: string }> } }).data;
        expect(data?.children?.map((c) => c.customer_member_id)).toContain(CHILD_IN);
        expect(data?.recipients?.map((p) => p.person_id)).toContain(PERSON_IN);
    });

    it("restricted author: an out-of-scope opportunity, a household, a child or a missing id → the same 404, no names", async () => {
        as(ORG, RESTRICTED);
        const missing = await roster("opportunity", MISSING);
        for (const [t, id] of [["opportunity", OPP_OUT], ["customer", HH_IN], ["customer_member", CHILD_IN]] as const) {
            const r = await roster(t, id);
            expect(r.status, `${t}`).toBe(404);
            expect(r.body).toEqual(missing.body);
            expect(JSON.stringify(r.body)).not.toMatch(/"Out"|"In"|display_name/);
        }
    });

    it("without forms.author: 403 (the roster serves only the composer)", async () => {
        as(ORG, UNRESTRICTED, ["forms.submissions", "documents.read"]);
        expect((await roster("opportunity", OPP_IN)).status).toBe(403);
    });

    it("unrestricted author: unchanged", async () => {
        as(ORG, UNRESTRICTED);
        const r = await roster("opportunity", OPP_OUT);
        expect(r.status).toBe(200);
    });
});
