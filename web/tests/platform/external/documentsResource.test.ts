/**
 * D9.1 — read-only Documents in /api/v1 (user-approved 2026-10-30): category hierarchy, list, detail and an audited
 * short-lived download link, for standard-sensitivity documents of visible children, households and parents/guardians.
 *
 * The REAL route handlers and the REAL collection factory run against an in-memory database. Only the credential, the
 * rate budget, the boundary's site resolution, API-activity recording and the event emitter are substituted, so the
 * security order (credential → scope → budget → boundary → authority) is the one that ships.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySupabase } from "../../harness/inMemorySupabase";

const { dbRef, principalRef, sitesRef, emitted, emitFails, order } = vi.hoisted(() => ({
    dbRef: { current: null as unknown },
    principalRef: { current: null as null | Record<string, unknown> },
    sitesRef: { current: [] as string[] },
    emitted: [] as Array<Record<string, unknown>>,
    emitFails: { current: false },
    order: [] as string[],
}));

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => dbRef.current }));
vi.mock("@/lib/platform/external/externalRequest", () => ({
    requireExternalPrincipal: async () => {
        const p = principalRef.current;
        if (!p) return { ok: false, refusal: "invalid_credential" };
        return {
            ok: true,
            context: {
                requestId: "req", principal: p, tokenId: "tok", applicationId: p.applicationId, installationId: p.installationId,
                organizationId: p.orgId, scopes: p.grantedScopes, resourceBoundary: p.boundary,
            },
        };
    },
}));
vi.mock("@/lib/platform/external/rateLimit", async (orig) => ({
    ...(await orig<typeof import("@/lib/platform/external/rateLimit")>()),
    consumeRateLimit: async () => ({ allowed: true, limit: 600, remaining: 599, resetSeconds: 60 }),
}));
vi.mock("@/lib/platform/principal/attendanceAuthorityAdapter", async (orig) => ({
    ...(await orig<typeof import("@/lib/platform/principal/attendanceAuthorityAdapter")>()),
    resolveBoundarySites: async () => ({ ok: true, siteIds: [...sitesRef.current] }),
}));
vi.mock("@/lib/platform/external/apiActivity", async (orig) => ({
    ...(await orig<typeof import("@/lib/platform/external/apiActivity")>()),
    recordApiActivity: async () => undefined,
}));
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: async (e: Record<string, unknown>) => {
        if (emitFails.current) throw new Error("audit store down");
        order.push("audit");
        emitted.push(e);
        return "evt-1";
    },
}));

import { GET as listDocuments } from "@/app/api/v1/documents/route";
import { GET as getDocument } from "@/app/api/v1/documents/[id]/route";
import { GET as getDownloadLink } from "@/app/api/v1/documents/[id]/download-link/route";
import { GET as listCategories } from "@/app/api/v1/document-categories/route";

const ORG = "0a000000-0000-4000-8000-0000000000a9";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000a9";
const SITE = "51000000-0000-4000-8000-0000000000a9";
const C_IN = "cb000000-0000-4000-8000-0000000000a1"; // enrolled in-boundary
const C_OUT = "cb000000-0000-4000-8000-0000000000a2"; // not visible
const H_IN = "c0000000-0000-4000-8000-0000000000a1";
const H_OUT = "c0000000-0000-4000-8000-0000000000a2";
const P_GUARD = "9e000000-0000-4000-8000-0000000000a1"; // active parent of C_IN
const P_PICKUP = "9e000000-0000-4000-8000-0000000000a2"; // authorized pickup only
const P_INACTIVE = "9e000000-0000-4000-8000-0000000000a3"; // inactive guardian of C_IN
const P_OUTGUARD = "9e000000-0000-4000-8000-0000000000a4"; // guardian of C_OUT only
const D = {
    child: "d0000000-0000-4000-8000-0000000000a1",
    child2: "d0000000-0000-4000-8000-0000000000aa",
    medical: "d0000000-0000-4000-8000-0000000000a2",
    immunization: "d0000000-0000-4000-8000-0000000000a3",
    quarantined: "d0000000-0000-4000-8000-0000000000a4",
    safeguarding: "d0000000-0000-4000-8000-0000000000a5",
    household: "d0000000-0000-4000-8000-0000000000a6",
    guardian: "d0000000-0000-4000-8000-0000000000a7",
    pickup: "d0000000-0000-4000-8000-0000000000a8",
    outChild: "d0000000-0000-4000-8000-0000000000a9",
    contextOnly: "d0000000-0000-4000-8000-0000000000ab",
    foreign: "d0000000-0000-4000-8000-0000000000ac",
    inactiveGuardian: "d0000000-0000-4000-8000-0000000000ad",
};
const CAT_ROOT = "ca000000-0000-4000-8000-0000000000a1";
const CAT_CHILD = "ca000000-0000-4000-8000-0000000000a2";
const CAT_OLD = "ca000000-0000-4000-8000-0000000000a3";
const SECRET_PATH = `${ORG}/secret/path/file.pdf`;

const VISIBLE_CHILDREN = new Set([C_IN]);
const VISIBLE_HOUSEHOLDS = new Set([H_IN]);
let db: InMemorySupabase;

function principal(over: Record<string, unknown> = {}) {
    return {
        kind: "application", applicationId: "app-1", applicationSlug: "partner", ownershipMode: "partner_managed", environment: "production",
        installationId: "inst-1", orgId: ORG, producerKey: "pk", credentialId: "cred-1", clientId: "client-1",
        grantedScopes: ["documents.read"], boundary: { mode: "locations", locationIds: [SITE] }, ...over,
    };
}

const doc = (id: string, over: Record<string, unknown>) => ({
    id, org_id: ORG, title: `Doc ${id.slice(-2)}`, original_filename: "f.pdf", doc_type: "enrollment_form", status: "active",
    sensitivity: "standard", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    current_version_id: `${id.slice(0, -2)}f${id.slice(-1)}`, bucket: "org_documents", storage_path: SECRET_PATH, ...over,
});
const owner = (documentId: string, subject_type: string, subject_id: string, extra: Record<string, unknown> = {}) => ({
    org_id: ORG, document_id: documentId, subject_type, subject_id, association: "owner", is_primary: true, ended_at: null, ...extra,
});
const context = (documentId: string, subject_type: string, subject_id: string) => ({
    org_id: ORG, document_id: documentId, subject_type, subject_id, association: "context", is_primary: false, ended_at: null,
});

beforeEach(() => {
    db = new InMemorySupabase();
    dbRef.current = db;
    principalRef.current = principal();
    sitesRef.current = [SITE];
    emitted.length = 0;
    order.length = 0;
    emitFails.current = false;
    const signed = db.storage;
    (db as unknown as { storage: unknown }).storage; // keep harness storage
    void signed;
    (db as unknown as { rpc: unknown }).rpc = async (fn: string, args: Record<string, unknown>) => {
        if (args.p_org_id !== ORG) return { data: [], error: null };
        if (fn === "list_external_children") {
            const ids = (args.p_child_ids as string[] | null) ?? [];
            return { data: ids.filter((i) => VISIBLE_CHILDREN.has(i)).map((id) => ({ id })), error: null };
        }
        if (fn === "list_external_households") {
            const ids = (args.p_household_ids as string[] | null) ?? [];
            return { data: ids.filter((i) => VISIBLE_HOUSEHOLDS.has(i)).map((id) => ({ id })), error: null };
        }
        if (fn === "is_medical_form_submission") return { data: false, error: null };
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
    };
    db.seed("person_child_relationships", [
        { org_id: ORG, person_id: P_GUARD, customer_member_id: C_IN, relationship_type: "parent", status: "active" },
        { org_id: ORG, person_id: P_PICKUP, customer_member_id: C_IN, relationship_type: "authorized_pickup", status: "active" },
        { org_id: ORG, person_id: P_INACTIVE, customer_member_id: C_IN, relationship_type: "guardian", status: "inactive" },
        { org_id: ORG, person_id: P_OUTGUARD, customer_member_id: C_OUT, relationship_type: "guardian", status: "active" },
    ]);
    db.seed("documents", [
        doc(D.child, { updated_at: "2026-10-02T00:00:00Z" }),
        doc(D.child2, { updated_at: "2026-10-03T00:00:00Z", doc_type: "photo_release" }),
        doc(D.medical, { sensitivity: "medical" }),
        doc(D.immunization, { doc_type: "immunization_record" }),
        doc(D.quarantined, { status: "quarantined" }),
        doc(D.safeguarding, {}),
        doc(D.household, {}),
        doc(D.guardian, {}),
        doc(D.pickup, {}),
        doc(D.outChild, {}),
        doc(D.contextOnly, {}),
        doc(D.inactiveGuardian, {}),
        doc(D.foreign, { org_id: OTHER_ORG }),
    ]);
    db.seed("document_subjects", [
        owner(D.child, "child", C_IN),
        context(D.child, "household", H_IN),
        context(D.child, "person", P_PICKUP), // a related adult the installation cannot see
        context(D.child, "child", C_OUT), // a related child outside the boundary
        owner(D.child2, "child", C_IN),
        owner(D.medical, "child", C_IN),
        owner(D.immunization, "child", C_IN),
        owner(D.quarantined, "child", C_IN),
        owner(D.safeguarding, "child", C_IN),
        owner(D.household, "household", H_IN),
        owner(D.guardian, "person", P_GUARD),
        owner(D.pickup, "person", P_PICKUP),
        owner(D.outChild, "child", C_OUT),
        owner(D.contextOnly, "child", C_OUT),
        context(D.contextOnly, "child", C_IN), // linked to the visible child, owned by an invisible one
        owner(D.inactiveGuardian, "person", P_INACTIVE),
        { ...owner(D.foreign, "child", C_IN), org_id: OTHER_ORG },
    ]);
    db.seed("child_safeguarding_restrictions", [{ org_id: ORG, evidence_document_id: D.safeguarding }]);
    db.seed("document_versions", Object.values(D).map((id) => ({
        id: `${id.slice(0, -2)}f${id.slice(-1)}`, org_id: ORG, document_id: id, version_number: 2, mime_type: "application/pdf",
        byte_size: 1234, created_at: "2026-10-01T00:00:00Z", review_status: "accepted", expires_on: "2027-10-01",
    })));
    db.seed("document_categories", [
        { id: CAT_ROOT, org_id: ORG, key: "family", label: "Family", description: null, parent_id: null, sort_order: 1, status: "active", seeded: true, updated_at: "2026-09-01T00:00:00Z" },
        { id: CAT_CHILD, org_id: ORG, key: "enrollment", label: "Enrollment", description: "Enrollment paperwork", parent_id: CAT_ROOT, sort_order: 2, status: "active", seeded: true, updated_at: "2026-09-02T00:00:00Z" },
        { id: CAT_OLD, org_id: ORG, key: "old", label: "Old", description: null, parent_id: null, sort_order: 3, status: "archived", seeded: false, updated_at: "2026-09-03T00:00:00Z" },
    ]);
    db.seed("document_types", [
        { id: "t1", org_id: ORG, key: "enrollment_form", status: "active", seeded: true, published_version_id: "tv1" },
        { id: "t2", org_id: ORG, key: "photo_release", status: "active", seeded: true, published_version_id: "tv2" },
    ]);
    db.seed("document_type_versions", [
        { id: "tv1", org_id: ORG, document_type_id: "t1", version_number: 1, status: "published", label: "Enrollment form", category_id: CAT_CHILD },
        { id: "tv2", org_id: ORG, document_type_id: "t2", version_number: 1, status: "published", label: "Photo release", category_id: CAT_ROOT },
    ]);
});

const req = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { authorization: "Bearer test" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function json(res: Response) {
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const ids = (body: Record<string, unknown>) => ((body.data as Array<{ id: string }>) ?? []).map((d) => d.id);

describe("security order", () => {
    it("no credential → 401 on every operation, even for a malformed id", async () => {
        principalRef.current = null;
        expect((await listDocuments(req(`/api/v1/documents?child_id=${C_IN}`))).status).toBe(401);
        expect((await getDocument(req("/api/v1/documents/x"), params("not-a-uuid"))).status).toBe(401);
        expect((await getDownloadLink(req("/x"), params(D.child))).status).toBe(401);
        expect((await listCategories(req("/api/v1/document-categories"))).status).toBe(401);
    });

    it("without documents.read → 403 before any document is read", async () => {
        principalRef.current = principal({ grantedScopes: ["children.read", "households.read", "relationships.read"] });
        const r = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}`)));
        expect(r.status).toBe(403);
        expect((r.body.error as { type: string }).type).toBe("forbidden_scope");
        expect((await getDownloadLink(req("/x"), params(D.child))).status).toBe(403);
        expect(db.signCalls).toHaveLength(0);
    });

    it("exactly one subject filter is required — no organization-wide export", async () => {
        for (const q of ["", `?child_id=${C_IN}&household_id=${H_IN}`]) {
            const r = await json(await listDocuments(req(`/api/v1/documents${q}`)));
            expect(r.status, q).toBe(400);
            expect((r.body.error as { code: string }).code).toBe("subject_filter_required");
        }
    });

    it("a locations boundary with no reachable site answers an empty page", async () => {
        sitesRef.current = [];
        const r = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}`)));
        expect(r.status).toBe(200);
        expect(ids(r.body)).toEqual([]);
    });
});

describe("list — children, households and parents/guardians", () => {
    it("a visible child: only its standard, available, primary-owned documents", async () => {
        const r = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}`)));
        expect(r.status).toBe(200);
        expect(ids(r.body)).toEqual([D.child, D.child2]);
        // medical (declared), immunization (medical type), quarantined, safeguarding evidence, context-only: all absent
    });

    it("related subjects the installation cannot see are omitted, never named; nothing internal leaks", async () => {
        const r = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}`)));
        const first = (r.body.data as Array<Record<string, unknown>>)[0];
        expect(first.subjects).toEqual([
            { type: "child", id: C_IN, role: "primary" },
            { type: "household", id: H_IN, role: "related" },
        ]);
        const raw = JSON.stringify(r.body);
        for (const leaked of [P_PICKUP, C_OUT, SECRET_PATH, "org_documents", "storage_path", "bucket", "sensitivity"]) {
            expect(raw, leaked).not.toContain(leaked);
        }
        expect(first.category_path).toEqual([{ key: "family", label: "Family" }, { key: "enrollment", label: "Enrollment" }]);
        expect(first.type).toEqual({ key: "enrollment_form", label: "Enrollment form" });
        expect(first.current_version).toMatchObject({ number: 2, content_type: "application/pdf", size_bytes: 1234 });
    });

    it("a child outside the boundary answers an empty page, not a refusal", async () => {
        const r = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_OUT}`)));
        expect(r.status).toBe(200);
        expect(ids(r.body)).toEqual([]);
    });

    it("a visible household's own documents; another household's are invisible", async () => {
        expect(ids((await json(await listDocuments(req(`/api/v1/documents?household_id=${H_IN}`)))).body)).toEqual([D.household]);
        expect(ids((await json(await listDocuments(req(`/api/v1/documents?household_id=${H_OUT}`)))).body)).toEqual([]);
    });

    it("a parent/guardian of a visible child; never a pickup-only adult, an inactive guardian or a guardian of an invisible child", async () => {
        expect(ids((await json(await listDocuments(req(`/api/v1/documents?person_id=${P_GUARD}`)))).body)).toEqual([D.guardian]);
        for (const p of [P_PICKUP, P_INACTIVE, P_OUTGUARD]) {
            expect(ids((await json(await listDocuments(req(`/api/v1/documents?person_id=${p}`)))).body), p).toEqual([]);
        }
    });

    it("another organization's installation sees nothing of ours", async () => {
        principalRef.current = principal({ orgId: OTHER_ORG });
        expect(ids((await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}`)))).body)).toEqual([]);
    });

    it("category_key and type_key narrow within the visible set; a malformed key is a caller error", async () => {
        expect(ids((await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&category_key=enrollment`)))).body)).toEqual([D.child]);
        expect(ids((await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&category_key=family`)))).body)).toEqual([D.child, D.child2]);
        expect(ids((await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&type_key=photo_release`)))).body)).toEqual([D.child2]);
        expect((await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&type_key=Bad Key`))).status).toBe(400);
    });

    it("pages with limit / cursor and resumes with since_token, in (updated_at, id) order", async () => {
        const p1 = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&limit=1`)));
        expect(ids(p1.body)).toEqual([D.child]);
        const next = p1.body.next_cursor as string;
        expect(next).toBeTruthy();
        const p2 = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&limit=1&cursor=${encodeURIComponent(next)}`)));
        expect(ids(p2.body)).toEqual([D.child2]);
        expect(p2.body.next_cursor).toBeNull();
        const sync = p2.body.sync_token as string;
        const after = await json(await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&since_token=${encodeURIComponent(sync)}`)));
        expect(ids(after.body)).toEqual([]);
        expect((await listDocuments(req(`/api/v1/documents?child_id=${C_IN}&cursor=garbage`))).status).toBe(400);
    });
});

describe("detail — missing and withheld are one answer", () => {
    it("a visible document by id", async () => {
        const r = await json(await getDocument(req(`/api/v1/documents/${D.guardian}`), params(D.guardian)));
        expect(r.status).toBe(200);
        expect((r.body.data as { id: string }).id).toBe(D.guardian);
    });

    it("medical, immunization-type, quarantined, safeguarding, out-of-boundary, pickup-owned, foreign, missing and malformed → the same 404", async () => {
        const answers = [];
        for (const id of [D.medical, D.immunization, D.quarantined, D.safeguarding, D.outChild, D.pickup, D.foreign, D.contextOnly, "d0000000-0000-4000-8000-0000000000ff", "nope"]) {
            const r = await json(await getDocument(req(`/api/v1/documents/${id}`), params(id)));
            expect(r.status, id).toBe(404);
            answers.push({ code: (r.body.error as { code: string }).code, type: (r.body.error as { type: string }).type, message: (r.body.error as { message: string }).message });
        }
        expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    });
});

describe("download link — audited before it is minted, short-lived, no storage path", () => {
    it("a visible document: a ten-minute link, audited with the application principal first", async () => {
        const before = Date.now();
        const r = await json(await getDownloadLink(req("/x"), params(D.child)));
        expect(r.status).toBe(200);
        const data = r.body.data as { document_id: string; url: string; expires_at: string };
        expect(data.document_id).toBe(D.child);
        expect(Date.parse(data.expires_at) - before).toBeLessThanOrEqual(600_000 + 2_000);
        expect(Date.parse(data.expires_at) - before).toBeGreaterThan(590_000);
        expect(db.signCalls).toEqual([{ bucket: "org_documents", path: SECRET_PATH, expires: 600 }]);
        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toMatchObject({ org_id: ORG, event_type: "document_link_issued", entity_type: "documents", entity_id: D.child });
        expect(emitted[0].payload).toMatchObject({
            actor_user_id: null, actor_kind: "application", actor_application_id: "app-1", actor_installation_id: "inst-1",
            actor_credential_id: "cred-1", operation: "download", expires_in_seconds: 600,
        });
        expect(Object.keys(r.body.data as object).sort()).toEqual(["document_id", "expires_at", "url"]);
        expect(JSON.stringify(r.body)).not.toContain("storage_path");
    });

    it("each request issues a new audited link", async () => {
        await getDownloadLink(req("/x"), params(D.child));
        await getDownloadLink(req("/x"), params(D.child));
        expect(emitted).toHaveLength(2);
        expect(db.signCalls).toHaveLength(2);
    });

    it("no audit record, no link", async () => {
        emitFails.current = true;
        const r = await getDownloadLink(req("/x"), params(D.child));
        expect(r.status).toBe(500);
        expect(db.signCalls).toHaveLength(0);
    });

    it("a withheld or invisible document: 404, nothing audited, nothing signed", async () => {
        for (const id of [D.medical, D.outChild, D.foreign, "nope"]) {
            const r = await getDownloadLink(req("/x"), params(id));
            expect(r.status, id).toBe(404);
        }
        expect(emitted).toHaveLength(0);
        expect(db.signCalls).toHaveLength(0);
    });

    it("a storage path outside the organization is never signed", async () => {
        db.seed("documents", [doc("d0000000-0000-4000-8000-0000000000b1", { storage_path: `${OTHER_ORG}/x.pdf` })]);
        db.seed("document_subjects", [owner("d0000000-0000-4000-8000-0000000000b1", "child", C_IN)]);
        const r = await getDownloadLink(req("/x"), params("d0000000-0000-4000-8000-0000000000b1"));
        expect(r.status).toBe(500);
        expect(emitted).toHaveLength(0);
        expect(db.signCalls).toHaveLength(0);
    });
});

describe("categories — the logical folders", () => {
    it("active categories with their parent and published types; archived ones never appear", async () => {
        const r = await json(await listCategories(req("/api/v1/document-categories")));
        expect(r.status).toBe(200);
        const data = r.body.data as Array<{ key: string; parent_key: string | null; types: Array<{ key: string }> }>;
        expect(data.map((c) => c.key)).toEqual(["family", "enrollment"]);
        expect(data.find((c) => c.key === "enrollment")!.parent_key).toBe("family");
        expect(data.find((c) => c.key === "enrollment")!.types.map((t) => t.key)).toEqual(["enrollment_form"]);
        expect(data.find((c) => c.key === "family")!.types.map((t) => t.key)).toEqual(["photo_release"]);
    });
});
