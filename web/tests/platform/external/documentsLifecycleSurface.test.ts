/**
 * D9.3 — the `/api/v1` document lifecycle through the real routes: review (documents.review), validity, replacement,
 * archive (documents.write), and reviews / history / requirements / expires_before (documents.read).
 *
 * Synthetic: the in-memory service client; the D9.1 SQL readers emulated as in documentsWriteSurface.test.ts; in-memory
 * stand-ins for `document_review_version`, `document_set_version_validity`, `document_file_as_version` and
 * `document_archive` with each function's contract. The requirement evaluator is substituted (its rules are D6/D7's own
 * suites); what is proven here is the external projection. NOT proven here: the SQL functions, the pending archive
 * migration and the deployed runtime.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySupabase } from "../../harness/inMemorySupabase";

const { dbRef, principalRef, sitesRef, emitted, evaluation } = vi.hoisted(() => ({
    dbRef: { current: null as unknown },
    principalRef: { current: null as null | Record<string, unknown> },
    sitesRef: { current: [] as string[] },
    emitted: [] as Array<Record<string, unknown>>,
    evaluation: { current: [] as Array<Record<string, unknown>> },
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
vi.mock("@/lib/documents/validity/documentsClock", async (orig) => ({
    ...(await orig<typeof import("@/lib/documents/validity/documentsClock")>()),
    resolveDocumentsClock: async () => ({ today: "2026-11-04", timeZone: "UTC" }),
}));
vi.mock("@/lib/documents/requirements/documentRequirementService", async (orig) => {
    const real = await orig<typeof import("@/lib/documents/requirements/documentRequirementService")>();
    return {
        ...real,
        loadLiveRequirements: async () => [],
        loadRequirementTypes: async () =>
            new Map([
                ["enrollment_document", { key: "enrollment_document", default_sensitivity: "standard" }],
                ["immunization_record", { key: "immunization_record", default_sensitivity: "medical" }],
            ]),
        requirementTypeClasses: (_t: unknown, key: string) => new Set(key === "immunization_record" ? ["medical"] : []),
        evaluateSubjects: async (_s: unknown, _o: unknown, refs: Array<{ subject_id: string }>) => ({
            evaluations: evaluation.current.filter((e) => e.subject_id === refs[0].subject_id),
            evidence: new Map(),
        }),
    };
});

import { POST as review } from "@/app/api/v1/document-reviews/route";
import { POST as validity } from "@/app/api/v1/document-validity/route";
import { POST as replace } from "@/app/api/v1/document-versions/route";
import { POST as archive } from "@/app/api/v1/document-archives/route";
import { GET as listReviews } from "@/app/api/v1/documents/[id]/reviews/route";
import { GET as listHistory } from "@/app/api/v1/documents/[id]/history/route";
import { GET as listRequirements } from "@/app/api/v1/document-requirements/route";
import { GET as listDocuments } from "@/app/api/v1/documents/route";

const ORG = "0a000000-0000-4000-8000-0000000000d3";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d3";
const SITE = "51000000-0000-4000-8000-0000000000d3";
const C_IN = "cb000000-0000-4000-8000-0000000000d1";
const C_OUT = "cb000000-0000-4000-8000-0000000000d2";
const H_IN = "c0000000-0000-4000-8000-0000000000d1";
const DOC = "dd000000-0000-4000-8000-0000000000d1";
const V1 = "de000000-0000-4000-8000-0000000000d1";
const MED = "dd000000-0000-4000-8000-0000000000d2";
const MED_V = "de000000-0000-4000-8000-0000000000d2";
const HIDDEN = "dd000000-0000-4000-8000-0000000000d3";
const HIDDEN_V = "de000000-0000-4000-8000-0000000000d3";
const UPLOAD = "dd000000-0000-4000-8000-0000000000d4";
const T = { enr: { id: "ce000000-0000-4000-8000-0000000000d2", v: "cf000000-0000-4000-8000-0000000000d2" } };
const VISIBLE_CHILDREN = new Set([C_IN]);

let db: InMemorySupabase;
let archiveMigrated: boolean;
const principal = (over: Record<string, unknown> = {}) => ({
    kind: "application", applicationId: "app-1", applicationSlug: "partner", ownershipMode: "partner_managed", environment: "production",
    installationId: "inst-1", orgId: ORG, producerKey: "pk", credentialId: "cred-1", clientId: "client-1",
    grantedScopes: ["documents.write", "documents.read", "documents.review"], boundary: { mode: "locations", locationIds: [SITE] }, ...over,
});

function seedDoc(id: string, versionId: string, owner: string, over: Record<string, unknown> = {}, version: Record<string, unknown> = {}) {
    db.seed("documents", [{ id, org_id: ORG, title: "Doc", doc_type: "enrollment_document", status: "active", sensitivity: "standard", current_version_id: versionId, created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z", metadata: {}, ...over }]);
    db.seed("document_versions", [{ id: versionId, org_id: ORG, document_id: id, version_number: 1, review_status: "pending", effective_on: null, expires_on: null, created_at: "2026-10-01T00:00:00.000Z", source: "upload", ...version }]);
    db.seed("document_subjects", [{ org_id: ORG, document_id: id, subject_type: "child", subject_id: owner, association: "owner", is_primary: true, ended_at: null, source: "filing", created_at: "2026-10-01T00:00:00.000Z" }]);
}

beforeEach(() => {
    wc1.auditMigrated = true;
    wc1.forceMismatch = false;
    db = new InMemorySupabase();
    dbRef.current = db;
    principalRef.current = principal();
    sitesRef.current = [SITE];
    emitted.length = 0;
    evaluation.current = [];
    archiveMigrated = false;
    db.seed("customers", [{ id: H_IN, org_id: ORG, name: "H" }]);
    db.seed("customer_members", [
        { id: C_IN, org_id: ORG, customer_id: H_IN, first_name: "In", last_name: "H", is_active: true },
        { id: C_OUT, org_id: ORG, customer_id: H_IN, first_name: "Out", last_name: "H", is_active: true },
    ]);
    db.seed("document_types", [{ id: T.enr.id, org_id: ORG, key: "enrollment_document", status: "active", published_version_id: T.enr.v }]);
    db.seed("document_type_versions", [{ id: T.enr.v, org_id: ORG, document_type_id: T.enr.id, version_number: 1, status: "published", validity_policy: { kind: "none" }, label: "Enrollment document", subject_types: ["child", "household"], allowed_formats: ["pdf"], default_sensitivity: "standard", review_required: false, replacement_policy: "new_version" }]);
    seedDoc(DOC, V1, C_IN);
    seedDoc(MED, MED_V, C_IN, { sensitivity: "medical" });
    seedDoc(HIDDEN, HIDDEN_V, C_OUT);
    // A completed, unfiled upload received by this installation.
    db.seed("documents", [{ id: UPLOAD, org_id: ORG, title: "new.pdf", original_filename: "new.pdf", mime_type: "application/pdf", byte_size: 10, checksum_sha256: "a".repeat(64), doc_type: null, status: "uploaded", sensitivity: "standard", bucket: "org_documents", storage_path: `${ORG}/api_uploads/${UPLOAD}/${"a".repeat(64)}`, created_at: "2026-11-01T00:00:00.000Z", metadata: { source: "api_v1_upload", received_via: { kind: "api_v1", installation_id: "inst-1", application_id: "app-1", credential_id: "cred-1" } } }]);
    db.putObject("org_documents", `${ORG}/api_uploads/${UPLOAD}/${"a".repeat(64)}`);

    (db as unknown as { rpc: unknown }).rpc = async (fn: string, a: Record<string, unknown>) => {
        if (a.p_org_id !== ORG) return { data: [], error: null };
        if (fn === "list_external_children") return { data: ((a.p_child_ids as string[]) ?? []).filter((i) => VISIBLE_CHILDREN.has(i)).map((id) => ({ id })), error: null };
        if (fn === "list_external_households") return { data: ((a.p_household_ids as string[]) ?? []).filter((i) => i === H_IN).map((id) => ({ id })), error: null };
        if (fn === "is_medical_form_submission") return { data: false, error: null };
        const doc = db.rows("documents").find((r) => r.id === a.p_document_id);
        const ver = db.rows("document_versions").find((v) => v.id === a.p_version_id);
        if (fn === "document_review_version") {
            const bad = auditCheck(a, "document_version_reviewed", { version_id: a.p_version_id }, db.rows("document_version_review_events").map((r) => r.audit_event_id).filter(Boolean));
            if (bad) return { data: null, error: bad };
            if (!doc) return { data: null, error: { message: "document_review_document_not_found" } };
            if (doc.current_version_id !== a.p_version_id) return { data: null, error: { message: "document_review_not_current_version" } };
            if ((ver!.review_status === "accepted" || ver!.review_status === "rejected") && !a.p_rereview) return { data: null, error: { message: "document_review_already_decided" } };
            const prev = ver!.review_status;
            ver!.review_status = a.p_decision;
            db.seed("document_version_review_events", [{ id: `ee${db.rows("document_version_review_events").length}`.padEnd(36, "0"), org_id: ORG, document_id: doc.id, version_id: ver!.id, kind: "review", decision: a.p_decision, previous_review_status: prev, reason: a.p_reason, effective_on: null, expires_on: null, actor: a.p_actor, audit_event_id: a.p_audit_event_id ?? null, created_at: new Date().toISOString() }]);
            return { data: { event_id: "e", review_status: a.p_decision, previous_review_status: prev, rereview: false }, error: null };
        }
        if (fn === "document_set_version_validity") {
            const bad = auditCheck(a, "document_version_validity_set", { version_id: a.p_version_id }, db.rows("document_version_review_events").map((r) => r.audit_event_id).filter(Boolean));
            if (bad) return { data: null, error: bad };
            if (doc!.current_version_id !== a.p_version_id) return { data: null, error: { message: "document_review_not_current_version" } };
            const changed = ver!.effective_on !== a.p_effective_on || ver!.expires_on !== a.p_expires_on;
            if (changed) {
                ver!.effective_on = a.p_effective_on;
                ver!.expires_on = a.p_expires_on;
                db.seed("document_version_review_events", [{ id: `ef${db.rows("document_version_review_events").length}`.padEnd(36, "0"), org_id: ORG, document_id: doc!.id, version_id: ver!.id, kind: "validity", decision: null, effective_on: a.p_effective_on, expires_on: a.p_expires_on, actor: a.p_actor, audit_event_id: a.p_audit_event_id ?? null, created_at: new Date().toISOString() }]);
            }
            return { data: { changed, effective_on: ver!.effective_on, expires_on: ver!.expires_on }, error: null };
        }
        if (fn === "document_file_as_version") {
            const filing = (doc!.metadata as Record<string, any>)?.filing;
            if (filing?.key === a.p_filing_key) return { data: { replay: true, version_id: filing.version_id, version_number: filing.version_number }, error: null };
            if (filing) return { data: null, error: { message: "document_filing_already_filed" } };
            const target = db.rows("documents").find((r) => r.id === a.p_target_document_id)!;
            const n = db.rows("document_versions").filter((v) => v.document_id === target.id).length + 1;
            const vid = `df000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
            db.seed("document_versions", [{ id: vid, org_id: ORG, document_id: target.id, version_number: n, review_status: "pending", source: "replacement", replacement_reason: a.p_reason, provenance: { filed_from_document_id: doc!.id }, created_at: new Date().toISOString() }]);
            target.current_version_id = vid;
            doc!.status = "superseded";
            doc!.metadata = { ...(doc!.metadata as object), filing: { key: a.p_filing_key, mode: "new_version", target_document_id: target.id, version_id: vid, version_number: n } };
            return { data: { replay: false, version_id: vid, version_number: n }, error: null };
        }
        if (fn === "document_archive") {
            if (!archiveMigrated) return { data: null, error: { code: "PGRST202", message: "Could not find the function public.document_archive" } };
            if (!doc) return { data: null, error: { message: "document_archive_not_found" } };
            if (doc.status === "archived" && (doc.metadata as Record<string, any>)?.archive?.key === a.p_archive_key) return { data: { replay: true }, error: null };
            doc.status = "archived";
            doc.metadata = { ...(doc.metadata as object), archive: { key: a.p_archive_key, reason: a.p_reason, audit_event_id: a.p_audit_event_id } };
            return { data: { replay: false }, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
    };
});

function post(path: string, body: unknown, key: string | null = "lifecycle-key-1") {
    const headers: Record<string, string> = { authorization: "Bearer t", "content-type": "application/json" };
    if (key) headers["idempotency-key"] = key;
    return new NextRequest(`https://alloy.test${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}
const get = (path: string) => new NextRequest(`https://alloy.test${path}`, { headers: { authorization: "Bearer t" } });
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const audits = (type: string) => emitted.filter((e) => e.event_type === type);

/**
 * W-C1 (migration 20261222090000): the stand-ins enforce the SQL contract when an audit id is passed: the emitted audit
 * `evt-<n>` must exist with the expected type, document and facts and contain the actor payload; one audit binds one
 * effect; a mismatch writes nothing. `auditMigrated = false` answers PGRST202, as staging does before the apply.
 */
const wc1 = { auditMigrated: true, forceMismatch: false };
function auditCheck(a: Record<string, unknown>, eventType: string, facts: Record<string, unknown>, bound: unknown[]): { code?: string; message: string } | null {
    if (a.p_audit_event_id === undefined && a.p_audit_payload === undefined) return null;
    if (!wc1.auditMigrated) return { code: "PGRST202", message: "Could not find the function in the schema cache" };
    if (a.p_audit_event_id == null) return null;
    const n = Number(String(a.p_audit_event_id).replace(/^evt-/, ""));
    const e = emitted[n - 1] as { event_type?: string; entity_id?: string; payload?: Record<string, unknown> } | undefined;
    const must = { ...((a.p_audit_payload as Record<string, unknown>) ?? {}), ...facts };
    const actorNamed = a.p_audit_payload && ("actor_kind" in (a.p_audit_payload as object) || "actor_user_id" in (a.p_audit_payload as object));
    const matches = !!e && e.event_type === eventType && e.entity_id === a.p_document_id && Object.entries(must).every(([k, v]) => String(e.payload?.[k]) === String(v));
    if (wc1.forceMismatch || !actorNamed || !matches) return { message: "audit_event_mismatch" };
    if (bound.includes(a.p_audit_event_id)) return { message: 'duplicate key value violates unique constraint "uq_document_version_review_events_audit_event"' };
    return null;
}

describe("scopes", () => {
    it("review needs documents.review: documents.write alone is 403 before anything is read or recorded", async () => {
        principalRef.current = principal({ grantedScopes: ["documents.write", "documents.read"] });
        expect((await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" }))).status).toBe(403);
        expect(emitted).toEqual([]);
    });
    it("documents.review alone cannot set validity, replace or archive; documents.read alone writes nothing", async () => {
        principalRef.current = principal({ grantedScopes: ["documents.review"] });
        for (const r of [
            await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, expires_on: "2027-01-01" })),
            await replace(post("/api/v1/document-versions", { document_id: DOC, upload_document_id: UPLOAD, reason: "A newer copy" })),
            await archive(post("/api/v1/document-archives", { document_id: DOC, reason: "No longer needed" })),
        ]) expect(r.status).toBe(403);
        principalRef.current = principal({ grantedScopes: ["documents.read"] });
        expect((await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" }))).status).toBe(403);
        expect(emitted).toEqual([]);
    });
});

describe("submitDocumentReview", () => {
    it("accepts the current version once, audited as the application before the decision, with a NULL user actor", async () => {
        const r = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" })));
        expect(r).toMatchObject({ status: 201, body: { document_id: DOC, version_id: V1, review_status: "accepted", replay: false } });
        expect(audits("document_version_reviewed")[0].payload).toMatchObject({ actor_user_id: null, actor_kind: "application", actor_installation_id: "inst-1", actor_credential_id: "cred-1", rereview: false });
        expect(db.rows("document_version_review_events")[0]).toMatchObject({ actor: null, decision: "accepted" });
        // The same answer again converges and records nothing new.
        const again = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" })));
        expect(again).toMatchObject({ status: 200, body: { replay: true } });
        expect(audits("document_version_reviewed")).toHaveLength(1);
    });

    it("re-review and reopen are 403 REREVIEW_NOT_AUTHORIZED, nothing recorded (case 11)", async () => {
        await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" }));
        const flip = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "rejected", reason: "Wrong child" }, "lifecycle-key-2")));
        expect(flip).toMatchObject({ status: 403, body: { error: { code: "REREVIEW_NOT_AUTHORIZED" } } });
        const reopen = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "pending" }, "lifecycle-key-3")));
        expect(reopen).toMatchObject({ status: 403, body: { error: { code: "REREVIEW_NOT_AUTHORIZED" } } });
        expect(audits("document_version_reviewed")).toHaveLength(1);
        expect(db.rows("document_version_review_events")).toHaveLength(1);
    });

    it("a concurrent decision that lands first is refused by the database and answered as REREVIEW_NOT_AUTHORIZED", async () => {
        const ver = db.rows("document_versions").find((v) => v.id === V1)!;
        const realFrom = db.from.bind(db);
        // The read sees `pending`; the decision lands between the read and the function call.
        (db as unknown as { from: unknown }).from = (t: string) => {
            if (t === "document_versions") queueMicrotask(() => (ver.review_status = "rejected"));
            return realFrom(t);
        };
        const r = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" })));
        expect(r).toMatchObject({ status: 403, body: { error: { code: "REREVIEW_NOT_AUTHORIZED" } } });
    });

    it("a rejection needs a reason; a stale version is 409; medical, hidden and other-org documents are 404 with nothing recorded", async () => {
        expect(await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "rejected" })))).toMatchObject({ status: 400, body: { error: { code: "REASON_REQUIRED" } } });
        expect(await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: MED_V, decision: "accepted" })))).toMatchObject({ status: 409, body: { error: { code: "NOT_CURRENT_VERSION" } } });
        for (const [d, v] of [[MED, MED_V], [HIDDEN, HIDDEN_V], ["dd000000-0000-4000-8000-0000000000ff", V1]]) {
            expect((await review(post("/api/v1/document-reviews", { document_id: d, version_id: v, decision: "accepted" }))).status).toBe(404);
        }
        principalRef.current = principal({ orgId: OTHER_ORG });
        expect((await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" }))).status).toBe(404);
        expect(emitted).toEqual([]);
    });
});

describe("setDocumentValidity", () => {
    it("records dates on the current version, audited first; the same dates again change nothing", async () => {
        const r = await json(await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, effective_on: "2026-11-01", expires_on: "2027-10-31" })));
        expect(r).toMatchObject({ status: 201, body: { effective_on: "2026-11-01", expires_on: "2027-10-31", changed: true } });
        expect(audits("document_version_validity_set")[0].payload).toMatchObject({ actor_kind: "application", actor_user_id: null });
        const again = await json(await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, effective_on: "2026-11-01", expires_on: "2027-10-31" })));
        expect(again).toMatchObject({ status: 200, body: { changed: false } });
        expect(db.rows("document_version_review_events").filter((e) => e.kind === "validity")).toHaveLength(1);
    });
    it("bad and inverted dates are 400 before anything is recorded; a hidden document is 404", async () => {
        expect(await json(await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, expires_on: "2027-02-30" })))).toMatchObject({ status: 400, body: { error: { code: "BAD_DATE" } } });
        expect(await json(await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, effective_on: "2027-01-02", expires_on: "2027-01-01" })))).toMatchObject({ status: 400, body: { error: { code: "VALIDITY_RANGE_INVERTED" } } });
        expect((await validity(post("/api/v1/document-validity", { document_id: HIDDEN, version_id: HIDDEN_V, expires_on: "2027-01-01" }))).status).toBe(404);
        expect(emitted).toEqual([]);
    });
});

describe("replaceDocumentVersion", () => {
    it("files this installation's upload as the next version through the one filing path; a retry replays", async () => {
        const body = { document_id: DOC, upload_document_id: UPLOAD, reason: "Updated signed copy" };
        const r = await json(await replace(post("/api/v1/document-versions", body)));
        expect(r).toMatchObject({ status: 201, body: { document_id: DOC, upload_document_id: UPLOAD, version_number: 2, replay: false } });
        expect(db.rows("documents").find((d) => d.id === DOC)!.current_version_id).toBe(r.body.version_id);
        expect(audits("document_filing_authorized")[0].payload).toMatchObject({ mode: "new_version", filing_key: "ext:inst-1:lifecycle-key-1", actor_kind: "application", actor_user_id: null });
        const again = await json(await replace(post("/api/v1/document-versions", body)));
        expect(again).toMatchObject({ status: 200, body: { replay: true, version_id: r.body.version_id } });
        expect(db.rows("document_versions").filter((v) => v.document_id === DOC)).toHaveLength(2);
    });
    it("a short reason is 400; a hidden target or another installation's upload is 404", async () => {
        expect(await json(await replace(post("/api/v1/document-versions", { document_id: DOC, upload_document_id: UPLOAD, reason: "short" })))).toMatchObject({ status: 400, body: { error: { code: "REASON_REQUIRED" } } });
        expect((await replace(post("/api/v1/document-versions", { document_id: HIDDEN, upload_document_id: UPLOAD, reason: "Updated signed copy" }))).status).toBe(404);
        principalRef.current = principal({ installationId: "inst-2" });
        expect((await replace(post("/api/v1/document-versions", { document_id: DOC, upload_document_id: UPLOAD, reason: "Updated signed copy" }))).status).toBe(404);
    });
});

describe("archiveDocument", () => {
    it("answers 503 archive_unavailable while the database lacks document_archive, and writes no status", async () => {
        const r = await json(await archive(post("/api/v1/document-archives", { document_id: DOC, reason: "Duplicate of an earlier upload" })));
        expect(r).toMatchObject({ status: 503, body: { error: { code: "archive_unavailable" } } });
        expect(db.rows("documents").find((d) => d.id === DOC)!.status).toBe("active");
    });
    it("with the function: archives once, leaves every list, replays from its own record, deletes nothing", async () => {
        archiveMigrated = true;
        const body = { document_id: DOC, reason: "Duplicate of an earlier upload" };
        const r = await json(await archive(post("/api/v1/document-archives", body)));
        expect(r).toMatchObject({ status: 201, body: { document_id: DOC, archived: true, replay: false } });
        expect(audits("document_archived")[0].payload).toMatchObject({ actor_kind: "application", actor_user_id: null });
        const list = await json(await listDocuments(get(`/api/v1/documents?child_id=${C_IN}`)));
        expect(JSON.stringify(list.body)).not.toContain(DOC);
        const again = await json(await archive(post("/api/v1/document-archives", body)));
        expect(again).toMatchObject({ status: 200, body: { replay: true } });
        expect(audits("document_archived")).toHaveLength(1);
        // Another key cannot read the archived document's state back.
        expect((await archive(post("/api/v1/document-archives", body, "another-key-01"))).status).toBe(404);
        expect(db.rows("document_versions").filter((v) => v.document_id === DOC)).toHaveLength(1);
        expect(db.removeCalls).toEqual([]);
    });
    it("a hidden or medical document is 404; a short reason is 400", async () => {
        archiveMigrated = true;
        expect((await archive(post("/api/v1/document-archives", { document_id: HIDDEN, reason: "Duplicate of an earlier upload" }))).status).toBe(404);
        expect((await archive(post("/api/v1/document-archives", { document_id: MED, reason: "Duplicate of an earlier upload" }))).status).toBe(404);
        expect((await archive(post("/api/v1/document-archives", { document_id: DOC, reason: "dup" }))).status).toBe(400);
        expect(emitted).toEqual([]);
    });
});

describe("reads", () => {
    it("reviews: decisions and validity records of a visible document, actor kind only, no reasons", async () => {
        db.seed("document_version_review_events", [{ id: "ed000000-0000-4000-8000-000000000001", org_id: ORG, document_id: DOC, version_id: V1, kind: "review", decision: "rejected", previous_review_status: "pending", reason: "Staff note: mother says wrong year", effective_on: null, expires_on: null, actor: "a1000000-0000-4000-8000-000000000001", created_at: "2026-10-02T00:00:00.000Z" }]);
        await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" }));
        const r = await json(await listReviews(get(`/api/v1/documents/${DOC}/reviews`), params(DOC)));
        expect(r.status).toBe(200);
        expect(r.body.data.map((x: Record<string, unknown>) => x.actor_kind)).toEqual(["staff", "application"]);
        expect(JSON.stringify(r.body)).not.toContain("Staff note");
        expect(JSON.stringify(r.body)).not.toContain("a1000000-0000-4000-8000-000000000001");
    });
    it("reviews and history of a hidden, medical or unknown document are an empty page", async () => {
        for (const id of [HIDDEN, MED, "dd000000-0000-4000-8000-0000000000ff", "not-a-uuid"]) {
            const r = await json(await listReviews(get(`/api/v1/documents/${id}/reviews`), params(id)));
            expect(r).toMatchObject({ status: 200, body: { data: [] } });
            const h = await json(await listHistory(get(`/api/v1/documents/${id}/history`), params(id)));
            expect(h).toMatchObject({ status: 200, body: { data: [] } });
        }
    });
    it("history: committed and system entries only, never a detail line", async () => {
        await replace(post("/api/v1/document-versions", { document_id: DOC, upload_document_id: UPLOAD, reason: "Secret replacement reason" }));
        const h = await json(await listHistory(get(`/api/v1/documents/${DOC}/history`), params(DOC)));
        expect(h.status).toBe(200);
        expect(h.body.data.length).toBeGreaterThan(0);
        for (const e of h.body.data) expect(Object.keys(e).sort()).toEqual(["action", "document_id", "id", "kind", "occurred_at", "version_number"]);
        expect(JSON.stringify(h.body)).not.toContain("Secret replacement reason");
    });
    it("expires_before: one subject, only documents whose current version expires strictly before the date", async () => {
        db.rows("document_versions").find((v) => v.id === V1)!.expires_on = "2026-12-01";
        const before = await json(await listDocuments(get(`/api/v1/documents?child_id=${C_IN}&expires_before=2026-12-02`)));
        expect(before.body.data.map((d: { id: string }) => d.id)).toEqual([DOC]);
        const on = await json(await listDocuments(get(`/api/v1/documents?child_id=${C_IN}&expires_before=2026-12-01`)));
        expect(on.body.data).toEqual([]);
        expect((await listDocuments(get(`/api/v1/documents?child_id=${C_IN}&expires_before=soon`))).status).toBe(400);
        expect((await listDocuments(get(`/api/v1/documents?expires_before=2026-12-02`))).status).toBe(400);
    });
    it("requirements: one visible subject; restricted types carry key and state only; evidence only if readable", async () => {
        const base = { subject_type: "child", subject_id: C_IN, version_id: "v", policy: "required", blocking: false, blocked_reason: null, waiver_id: null, waivable: false, due_on: null, valid_until: "2027-10-31", expiring_soon: false };
        evaluation.current = [
            { ...base, requirement_id: "a0000000-0000-4000-8000-000000000001", requirement_key: "enrollment_packet", label: "Enrollment packet", document_type_key: "enrollment_document", state: "satisfied", evidence: { accepted: [DOC, HIDDEN, MED], pending: [], undated: [], expired: [], rejected: [], quarantined: [], from_forms: [] } },
            { ...base, requirement_id: "a0000000-0000-4000-8000-000000000002", requirement_key: "immunizations", label: "Immunizations (medical)", document_type_key: "immunization_record", state: "missing", evidence: { accepted: [MED], pending: [], undated: [], expired: [], rejected: [], quarantined: [], from_forms: [] } },
        ];
        const r = await json(await listRequirements(get(`/api/v1/document-requirements?child_id=${C_IN}`)));
        expect(r.status).toBe(200);
        const [std, med] = [...r.body.data].sort((a: { requirement_key: string }, b: { requirement_key: string }) => a.requirement_key.localeCompare(b.requirement_key));
        expect(std).toMatchObject({ requirement_key: "enrollment_packet", state: "satisfied", restricted: false, evidence: { accepted: [DOC] } });
        expect(med).toEqual({ id: "a0000000-0000-4000-8000-000000000002", requirement_key: "immunizations", state: "missing", restricted: true });
        expect(JSON.stringify(r.body)).not.toContain(MED);
        expect(JSON.stringify(r.body)).not.toContain("medical");
        const hidden = await json(await listRequirements(get(`/api/v1/document-requirements?child_id=${C_OUT}`)));
        expect(hidden).toMatchObject({ status: 200, body: { data: [] } });
        expect((await listRequirements(get(`/api/v1/document-requirements`))).status).toBe(400);
    });
});

describe("W-C1: review and validity bind the exact audit row written for this application (migration 20261222090000)", () => {
    const actor = { actor_kind: "application", actor_application_id: "app-1", actor_installation_id: "inst-1" };
    const idOf = (e: Record<string, unknown>) => `evt-${emitted.indexOf(e) + 1}`;

    it("a review passes its own audit id and the acting application + installation; the event row stores it", async () => {
        const r = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" })));
        expect(r.status).toBe(201);
        const [audit] = audits("document_version_reviewed");
        const row = db.rows("document_version_review_events").find((e) => e.kind === "review")!;
        expect(row.audit_event_id).toBe(idOf(audit));
        expect(audit.payload).toMatchObject({ ...actor, version_id: V1 });
    });

    it("validity binds its audit; a no-op (same dates) writes no row, so its audit stays unbound and can never cover a later change", async () => {
        await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, effective_on: "2026-11-01", expires_on: "2027-10-31" }));
        await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, effective_on: "2026-11-01", expires_on: "2027-10-31" }, "lifecycle-key-2"));
        const third = await json(await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, effective_on: "2026-11-01", expires_on: "2028-10-31" }, "lifecycle-key-3")));
        expect(third.status).toBe(201);
        const [first, noop, real] = audits("document_version_validity_set");
        const rows = db.rows("document_version_review_events").filter((e) => e.kind === "validity");
        expect(rows.map((x) => x.audit_event_id)).toEqual([idOf(first), idOf(real)]);
        expect(rows.map((x) => x.audit_event_id)).not.toContain(idOf(noop));
    });

    it("a mismatch is refused by the database before any write and answered 503 AUDIT_UNAVAILABLE", async () => {
        wc1.forceMismatch = true;
        const r = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" })));
        expect(r).toMatchObject({ status: 503, body: { error: { code: "AUDIT_UNAVAILABLE" } } });
        expect(db.rows("document_version_review_events")).toHaveLength(0);
        expect(db.rows("document_versions").find((v) => v.id === V1)!.review_status).not.toBe("accepted");
        const v = await json(await validity(post("/api/v1/document-validity", { document_id: DOC, version_id: V1, effective_on: "2026-11-01", expires_on: "2027-10-31" }, "lifecycle-key-9")));
        expect(v).toMatchObject({ status: 503, body: { error: { code: "AUDIT_UNAVAILABLE" } } });
        expect(db.rows("document_version_review_events")).toHaveLength(0);
    });

    it("before the migration is applied (PGRST202) the effect runs once with the legacy arguments and binds nothing", async () => {
        wc1.auditMigrated = false;
        const r = await json(await review(post("/api/v1/document-reviews", { document_id: DOC, version_id: V1, decision: "accepted" })));
        expect(r.status).toBe(201);
        const rows = db.rows("document_version_review_events");
        expect(rows).toHaveLength(1);
        expect(rows[0].audit_event_id).toBeNull();
    });
});

