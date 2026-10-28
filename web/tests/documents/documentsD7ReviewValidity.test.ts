/**
 * D7 — review lifecycle, validity and expiration, renewal, and the operational projections, through the real routes.
 *
 * The validity evaluator, the requirement evaluator, the requirement service, the attention projection and every
 * authorization helper run unmodified; the session and the service-role client are substituted, and the in-memory
 * client evaluates each query's real filters. The governed review and validity functions are stood in for
 * (tests/harness/documentReviewStandIns.ts) and proven against Postgres by
 * certification/invariants/documents-d7-review-validity.sql.
 */
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { documentReviewStandIn } from "../harness/documentReviewStandIns";
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

import { POST as reviewPOST } from "@/app/api/admin/documents/[id]/review/route";
import { GET as validityGET, PUT as validityPUT } from "@/app/api/admin/documents/[id]/validity/route";
import { POST as versionsPOST } from "@/app/api/admin/documents/[id]/versions/route";
import { GET as historyGET } from "@/app/api/admin/documents/[id]/history/route";
import { GET as readinessGET } from "@/app/api/admin/documents/requirements/readiness/route";
import { GET as workGET } from "@/app/api/admin/documents/requirements/work/route";
import { evaluateDocumentRequirement, type EvaluableRequirement, type EvidenceDocument } from "@/lib/documents/requirements/documentRequirementEvaluator";
import type { RequirementWorkRow, SubjectReadiness } from "@/lib/documents/requirements/documentRequirementService";
import type { DocumentAttentionRow } from "@/lib/documents/validity/documentAttentionVocabulary";
import { attentionKindFor } from "@/lib/documents/validity/documentAttention";
import { clockAt, localDateOf } from "@/lib/documents/validity/documentsClock";
import { addPeriod, evaluateDocumentValidity, type DocumentValidity } from "@/lib/documents/validity/documentValidity";
import { mapDocumentRequirementWorkToWorkItemRows } from "@/lib/workItems/mapDocumentRequirementToWorkItemRow";

const ORG = "0a000000-0000-4000-8000-0000000000d7";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d7";
const USER = "05e00000-0000-4000-8000-0000000000d7";
const H = "c0000000-0000-4000-8000-0000000000d7";
const C1 = "cb000000-0000-4000-8000-0000000000d1";
const C2 = "cb000000-0000-4000-8000-0000000000d2";
const P1 = "9e000000-0000-4000-8000-0000000000d7";

const T = {
    imm: { id: "ce000000-0000-4000-8000-0000000000d1", v: "cf000000-0000-4000-8000-0000000000d1" },
    lic: { id: "ce000000-0000-4000-8000-0000000000d2", v: "cf000000-0000-4000-8000-0000000000d2" },
    phys: { id: "ce000000-0000-4000-8000-0000000000d3", v: "cf000000-0000-4000-8000-0000000000d3" },
};
const R_IMM = { id: "a6000000-0000-4000-8000-0000000000d1", v: "a7000000-0000-4000-8000-0000000000d1" };
const R_PHYS = { id: "a6000000-0000-4000-8000-0000000000d2", v: "a7000000-0000-4000-8000-0000000000d2" };
const DOC = {
    immC1: "d7000000-0000-4000-8000-000000000001", // immunization record for Mia: accepted, expires 2026-11-15 (expiring soon on 2026-10-27)
    immC2: "d7000000-0000-4000-8000-000000000002", // for Leo: accepted, expired 2026-10-01
    licP1: "d7000000-0000-4000-8000-000000000003", // driver's license for Ana: explicit-date type, accepted, no date recorded
    physC1: "d7000000-0000-4000-8000-000000000004", // physical for Mia: duration 12 months from effective 2025-11-10 → through 2026-11-09
    held: "d7000000-0000-4000-8000-000000000005", // quarantined immunization record for Leo
    foreign: "d7000000-0000-4000-8000-000000000006",
} as const;
const TODAY = "2026-10-27";

type Persona = { orgId: string; roleKeys: string[]; permissionKeys: string[] };
const P = {
    admin: { orgId: ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "processing.documents.manage", "health.view"] },
    ops: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["portal.access", "documents.read", "documents.write", "processing.operate", "health.view"] },
    reader: { orgId: ORG, roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    otherOrg: { orgId: OTHER_ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "processing.documents.manage", "health.view"] },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: "admin", userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;

function type(t: { id: string; v: string }, key: string, label: string, subjects: string[], sensitivity: string, review: boolean, validity: Record<string, unknown>) {
    return {
        type: { id: t.id, org_id: ORG, key, status: "active", seeded: false, published_version_id: t.v },
        version: {
            id: t.v, org_id: ORG, document_type_id: t.id, version_number: 1, status: "published", label, category_id: null, subject_types: subjects,
            allowed_formats: ["pdf"], default_sensitivity: sensitivity, review_required: review, replacement_policy: "new_version", validity_policy: validity,
        },
    };
}
function requirement(r: { id: string; v: string }, key: string, typeKey: string) {
    return {
        req: { id: r.id, org_id: ORG, key, status: "active", published_version_id: r.v, created_at: "2026-10-01T00:00:00Z", archived_at: null },
        version: {
            id: r.v, org_id: ORG, requirement_id: r.id, version_number: 1, status: "published", label: key, description: null, document_type_key: typeKey,
            subject_type: "child", scope: { kind: "all" }, timing: { kind: "immediate" }, policy: "required", waivable: true, effective_from: null, effective_until: null,
            validation_errors: [], created_at: "2026-10-01T00:00:00Z", published_at: "2026-10-01T00:00:00Z", superseded_at: null,
        },
    };
}
function doc(id: string, over: Record<string, unknown>) {
    return {
        id, org_id: ORG, bucket: "org_documents", storage_path: `${ORG}/customer_member/${C1}/${id}.pdf`, title: `Doc ${id.slice(-2)}`, mime_type: "application/pdf",
        byte_size: 10, doc_type: null, sensitivity: "standard", status: "uploaded", metadata: {}, created_at: "2026-10-20T00:00:00Z", current_version_id: `v-${id}`, ...over,
    };
}
const version = (docId: string, over: Record<string, unknown> = {}) => ({
    id: `v-${docId}`, org_id: ORG, document_id: docId, version_number: 1, review_status: "accepted", reviewed_at: "2026-10-02T00:00:00Z",
    effective_on: null, expires_on: null, created_at: "2026-10-01T00:00:00Z", source: "document_insert", ...over,
});
const owner = (document_id: string, subject_type: string, subject_id: string, org = ORG) => ({
    org_id: org, document_id, subject_type, subject_id, association: "owner", is_primary: true, source: "governed", created_at: "2026-10-20T00:00:00Z", ended_at: null,
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    db = new InMemorySupabase();
    db.seed("org_settings", [{ org_id: ORG, metadata: { timezone: "America/Los_Angeles" } }]);
    db.seed("customers", [{ id: H, org_id: ORG, name: "Rivera household", status_key: "active", created_at: "2026-09-01T00:00:00Z" }]);
    db.seed("customer_persons", [{ org_id: ORG, customer_id: H, person_id: P1, role_type: "primary_contact", is_primary: true, status: "active", end_date: null, persons: { id: P1, first_name: "Ana", last_name: "Rivera" } }]);
    db.seed("persons", [{ id: P1, org_id: ORG, first_name: "Ana", last_name: "Rivera", created_at: "2026-09-01T00:00:00Z" }]);
    db.seed("customer_members", [
        { id: C1, org_id: ORG, customer_id: H, first_name: "Mia", last_name: "Rivera", is_active: true, created_at: "2026-10-01T00:00:00Z" },
        { id: C2, org_id: ORG, customer_id: H, first_name: "Leo", last_name: "Rivera", is_active: true, created_at: "2026-10-01T00:00:00Z" },
    ]);
    const imm = type(T.imm, "immunization_record", "Immunization record", ["child"], "medical", true, { kind: "periodic_reconfirmation", value: 12, unit: "months", warning_days: [30, 7] });
    const lic = type(T.lic, "drivers_license", "Driver's license", ["person"], "standard", true, { kind: "explicit_date", warning_days: [30] });
    const phys = type(T.phys, "physical", "Physical examination", ["child"], "medical", false, { kind: "duration", value: 12, unit: "months", warning_days: [30, 7], review_on_renewal: true });
    db.seed("document_types", [imm.type, lic.type, phys.type]);
    db.seed("document_type_versions", [imm.version, lic.version, phys.version]);
    db.seed("document_categories", []);
    const rImm = requirement(R_IMM, "immunizations_on_file", "immunization_record");
    const rPhys = requirement(R_PHYS, "physical_on_file", "physical");
    db.seed("document_requirements", [rImm.req, rPhys.req]);
    db.seed("document_requirement_versions", [rImm.version, rPhys.version]);
    db.seed("document_requirement_waivers", []);
    db.seed("documents", [
        doc(DOC.immC1, { entity_type: "customer_member", entity_id: C1, doc_type: "immunization_record", sensitivity: "medical" }),
        doc(DOC.immC2, { entity_type: "customer_member", entity_id: C2, doc_type: "immunization_record", sensitivity: "medical" }),
        doc(DOC.licP1, { entity_type: "person", entity_id: P1, doc_type: "drivers_license" }),
        doc(DOC.physC1, { entity_type: "customer_member", entity_id: C1, doc_type: "physical", sensitivity: "medical" }),
        doc(DOC.held, { entity_type: "customer_member", entity_id: C2, doc_type: "immunization_record", sensitivity: "medical", status: "quarantined" }),
        doc(DOC.foreign, { org_id: OTHER_ORG, entity_type: "customer", entity_id: H, doc_type: "immunization_record" }),
    ]);
    db.seed("document_subjects", [
        owner(DOC.immC1, "child", C1),
        owner(DOC.immC2, "child", C2),
        owner(DOC.licP1, "person", P1),
        owner(DOC.physC1, "child", C1),
        owner(DOC.held, "child", C2),
        owner(DOC.foreign, "household", H, OTHER_ORG),
    ]);
    db.seed("document_versions", [
        version(DOC.immC1, { expires_on: "2026-11-15" }),
        version(DOC.immC2, { expires_on: "2026-10-01" }),
        version(DOC.licP1),
        version(DOC.physC1, { effective_on: "2025-11-10" }),
        version(DOC.held, { review_status: null }),
        version(DOC.foreign, { org_id: OTHER_ORG }),
    ]);
    db.seed("document_version_review_events", []);
    (db as unknown as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
        const reviewed = documentReviewStandIn(db as never, name, args);
        if (reviewed) return reviewed;
        if (name === "document_add_version") {
            const d = db.rows("documents").find((x) => x.id === args.p_document_id && x.org_id === args.p_org_id);
            if (!d) return { data: null, error: { message: "document_not_found" } };
            const versions = db.rows("document_versions").filter((v) => v.document_id === d.id);
            const id = `v2-${d.id}`;
            const number = Math.max(0, ...versions.map((v) => Number(v.version_number))) + 1;
            db.seed("document_versions", [{ id, org_id: d.org_id, document_id: d.id, version_number: number, review_status: null, effective_on: null, expires_on: null, created_at: "2026-10-27T18:00:00Z", source: "replacement", supersedes_version_id: d.current_version_id }]);
            const supersedes = d.current_version_id;
            Object.assign(d, { current_version_id: id });
            return { data: { version_id: id, version_number: number, supersedes_version_id: supersedes }, error: null };
        }
        if (name === "document_version_require_review") {
            const d = db.rows("documents").find((x) => x.id === args.p_document_id);
            const v = db.rows("document_versions").find((x) => x.id === d?.current_version_id);
            if (v) v.review_status = "pending";
            return { data: null, error: null };
        }
        if (name === "is_medical_form_submission") return { data: false, error: null };
        return { data: null, error: { message: `unexpected rpc ${name}` } };
    };
    dbRef.current = db;
    // Evening in California, already tomorrow in UTC: the organization's date is the 27th.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T03:30:00Z"));
});

const json = (method: "POST" | "PUT", body?: Record<string, unknown>) => buildRequest({ method, path: "/x", body });
const review = (id: string, body: Record<string, unknown>) => invokeRoute(reviewPOST, json("POST", body), routeParams({ id }));
const setDates = (id: string, body: Record<string, unknown>) => invokeRoute(validityPUT, json("PUT", body), routeParams({ id }));
const work = async () => {
    const r = await invokeRoute(workGET, buildRequest({ path: "/api/admin/documents/requirements/work" }));
    return { status: r.status, rows: (r.body as { rows: RequirementWorkRow[] }).rows ?? [], documents: (r.body as { documents: DocumentAttentionRow[] }).documents ?? [], body: r.body };
};
const readiness = async (q: string) => (await invokeRoute(readinessGET, buildRequest({ path: `/api/admin/documents/requirements/readiness?${q}` }))).body as { readiness: { subjects: SubjectReadiness[]; totals: Record<string, number>; today: string } };
const evalOf = (r: { readiness: { subjects: SubjectReadiness[] } }, req: string, subject: string) =>
    r.readiness.subjects.flatMap((s) => s.requirements).find((e) => e.requirement_id === req && e.subject_id === subject) ?? null;
const reviewEvents = (docId: string) => db.rows("document_version_review_events").filter((e) => e.document_id === docId);
const auditsOf = (event: string) => db.rows("workflow_events").filter((e) => e.event_type === event);

// ── D7.1 validity, as a function of explicit inputs ──────────────────────────────────────────────────────────────
describe("the validity evaluator: policy × recorded dates × the organization's date", () => {
    const v = (policy: Record<string, unknown> | null, facts: Partial<{ effective_on: string; expires_on: string; received_on: string; reviewed_on: string }>, today: string): DocumentValidity =>
        evaluateDocumentValidity({ policy: policy as never, facts: { effective_on: null, expires_on: null, received_on: null, reviewed_on: null, ...facts }, today });
    const warn = { kind: "explicit_date", warning_days: [30, 7] };

    it("expires_on is the last valid day: valid on it, expired the day after", () => {
        expect(v(warn, { expires_on: "2026-12-31" }, "2026-12-31").status).toBe("expiring_soon");
        expect(v(warn, { expires_on: "2026-12-31" }, "2027-01-01").status).toBe("expired");
        expect(v(warn, { expires_on: "2026-12-31" }, "2027-01-01").days_remaining).toBe(-1);
    });
    it("the expiring-soon window is the largest warning, inclusive", () => {
        expect(v(warn, { expires_on: "2026-12-31" }, "2026-11-30").status).toBe("valid");
        expect(v(warn, { expires_on: "2026-12-31" }, "2026-12-01").status).toBe("expiring_soon");
        expect(v({ kind: "explicit_date" }, { expires_on: "2026-12-31" }, "2026-12-30").status).toBe("valid");
    });
    it("explicit_date and event_renewal need a recorded date; none never expires unless one is recorded", () => {
        expect(v(warn, {}, TODAY).status).toBe("date_missing");
        expect(v({ kind: "event_renewal", event: "birthday" }, {}, TODAY).status).toBe("date_missing");
        expect(v({ kind: "none" }, {}, TODAY).status).toBe("not_tracked");
        expect(v(null, {}, TODAY).status).toBe("not_tracked");
        expect(v({ kind: "none" }, { expires_on: "2026-01-01" }, TODAY).status).toBe("expired");
    });
    it("duration derives from the effective date (else the received date), minus one day; a recorded date overrides it", () => {
        const d = { kind: "duration", value: 12, unit: "months", warning_days: [30] };
        expect(v(d, { effective_on: "2025-11-10" }, TODAY)).toMatchObject({ expires_on: "2026-11-09", expires_source: "derived", status: "expiring_soon" });
        expect(v(d, { received_on: "2025-10-01" }, TODAY)).toMatchObject({ expires_on: "2026-09-30", status: "expired" });
        expect(v(d, { effective_on: "2025-11-10", expires_on: "2027-06-30" }, TODAY)).toMatchObject({ expires_on: "2027-06-30", expires_source: "recorded", status: "valid" });
        expect(v(d, {}, TODAY).status).toBe("date_missing");
    });
    it("periodic reconfirmation anchors on the effective date, else the review date, else receipt", () => {
        const p = { kind: "periodic_reconfirmation", value: 6, unit: "months" };
        expect(v(p, { reviewed_on: "2026-05-01", received_on: "2026-01-01" }, TODAY).expires_on).toBe("2026-10-31");
        expect(v(p, { effective_on: "2026-02-01", reviewed_on: "2026-05-01" }, TODAY).expires_on).toBe("2026-07-31");
    });
    it("calendar arithmetic clamps month ends and leap days", () => {
        expect(addPeriod("2026-01-31", 1, "months")).toBe("2026-02-28");
        expect(addPeriod("2024-02-29", 1, "years")).toBe("2025-02-28");
        expect(addPeriod("2028-02-29", 4, "years")).toBe("2032-02-29");
        expect(addPeriod("2026-12-15", 2, "months")).toBe("2027-02-15");
        expect(addPeriod("2026-10-27", 10, "days")).toBe("2026-11-06");
    });
    it("a document is not in force before its effective date", () => {
        expect(v(warn, { effective_on: "2026-11-01", expires_on: "2027-11-01" }, TODAY).status).toBe("not_yet_effective");
    });
});

describe("the Documents clock is the organization's calendar date, never the browser's or UTC's", () => {
    it("an evening in California is still that day there", () => {
        expect(localDateOf("2026-10-28T03:30:00Z", "America/Los_Angeles")).toBe("2026-10-27");
        expect(localDateOf("2026-10-28T03:30:00Z", "UTC")).toBe("2026-10-28");
        expect(localDateOf("2026-10-27T23:30:00Z", "Asia/Tokyo")).toBe("2026-10-28");
        expect(clockAt(new Date("2026-03-08T09:30:00Z"), "America/New_York").today).toBe("2026-03-08");
    });
    it("readiness reports the organization-local today (America/Los_Angeles), not the UTC date", async () => {
        as(P.admin);
        expect((await readiness(`subject_type=household&subject_id=${H}`)).readiness.today).toBe("2026-10-27");
    });
    it("a document expiring on the organization's today is still valid after UTC midnight", async () => {
        db.rows("document_versions").find((x) => x.id === `v-${DOC.immC2}`)!.expires_on = "2026-10-27";
        as(P.admin);
        expect(evalOf(await readiness(`subject_type=household&subject_id=${H}`), R_IMM.id, C2)).toMatchObject({ state: "satisfied", expiring_soon: true });
    });
});

// ── the requirement evaluator with validity and renewal ───────────────────────────────────────────────────────
describe("requirement satisfaction honours validity (D7.1) and renewal (D7.3)", () => {
    const requirement: EvaluableRequirement = {
        requirement_id: "r1", requirement_key: "r1", version_id: "v1", label: "Immunizations", document_type_key: "immunization_record", subject_type: "child",
        scope: { kind: "all" }, timing: { kind: "immediate" }, policy: "required", waivable: true, effective_from: null, effective_until: null,
    };
    const t = { key: "immunization_record", label: "Immunization record", subject_types: ["child"], review_required: true };
    const subject = { subject_type: "child" as const, subject_id: "c1", created_at: "2026-10-01", journeys: [] };
    const val = (status: DocumentValidity["status"], expires_on: string | null = "2026-11-15"): DocumentValidity => ({ status, expires_on, expires_source: "recorded", effective_on: null, warn_from: null, days_remaining: null });
    const e = (docs: EvidenceDocument[], waivers = [] as never[]) => evaluateDocumentRequirement({ requirement, type: t, subject, documents: docs, waivers, today: TODAY })!;
    const d = (id: string, over: Partial<EvidenceDocument>): EvidenceDocument => ({ document_id: id, status: "uploaded", review_status: "accepted", received_at: "2026-10-01", ...over });

    it("accepted but expired evidence no longer satisfies: expired, blocking", () => {
        expect(e([d("a", { validity: val("expired", "2026-10-01") })])).toMatchObject({ state: "expired", blocking: true, evidence: { expired: ["a"], accepted: [] } });
    });
    it("expiring evidence still satisfies, flagged for renewal with its last valid day", () => {
        expect(e([d("a", { validity: val("expiring_soon") })])).toMatchObject({ state: "satisfied", blocking: false, expiring_soon: true, valid_until: "2026-11-15" });
        expect(e([d("a", { validity: val("expiring_soon") }), d("b", { validity: val("valid", "2027-11-15") })])).toMatchObject({ expiring_soon: false, valid_until: "2027-11-15" });
        expect(e([d("a", { validity: val("not_tracked", null) })])).toMatchObject({ state: "satisfied", valid_until: null, expiring_soon: false });
    });
    it("accepted without its required expiration date: pending review (the date must be recorded)", () => {
        expect(e([d("a", { validity: val("date_missing", null) })])).toMatchObject({ state: "pending_review", blocking: true, evidence: { undated: ["a"], pending: ["a"] } });
    });
    it("not yet in force does not satisfy", () => {
        expect(e([d("a", { validity: val("not_yet_effective") })]).state).toBe("expired");
    });
    it("a renewal awaiting review keeps the earlier accepted, still-valid version counting", () => {
        const r = e([d("a", { review_status: "pending", validity: val("valid", null), prior_accepted: { version_id: "v1", validity: val("expiring_soon") } })]);
        expect(r).toMatchObject({ state: "satisfied", renewal_pending: true, expiring_soon: true });
    });
    it("a rejected renewal never satisfies by itself; the earlier valid version still does, an expired one does not", () => {
        expect(e([d("a", { review_status: "rejected", prior_accepted: { version_id: "v1", validity: val("valid") } })])).toMatchObject({ state: "satisfied", renewal_pending: true });
        expect(e([d("a", { review_status: "rejected", prior_accepted: { version_id: "v1", validity: val("expired") } })])).toMatchObject({ state: "blocked", blocked_reason: "evidence_rejected" });
        expect(e([d("a", { review_status: "pending", prior_accepted: { version_id: "v1", validity: val("expired") } })]).state).toBe("pending_review");
    });
    it("a quarantined document never satisfies, whatever its earlier versions say", () => {
        expect(e([d("q", { status: "quarantined", prior_accepted: { version_id: "v1", validity: val("valid") } })])).toMatchObject({ state: "blocked", blocked_reason: "evidence_quarantined" });
    });
    it("a waiver still applies over expired evidence; satisfied evidence outranks it", () => {
        const w = [{ waiver_id: "w1", requirement_id: "r1", subject_type: "child", subject_id: "c1", state: "active" as const, effective_until: null }];
        expect(e([d("a", { validity: val("expired") })], w as never).state).toBe("waived");
        expect(e([d("a", { validity: val("valid") })], w as never).state).toBe("satisfied");
    });
    it("the attention kind of one document", () => {
        expect(attentionKindFor({ review_status: "pending", review_required: true, validity: null, prior_validity: null })).toBe("review_due");
        expect(attentionKindFor({ review_status: null, review_required: true, validity: null, prior_validity: null })).toBe("review_due");
        expect(attentionKindFor({ review_status: "accepted", review_required: true, validity: val("expired"), prior_validity: null })).toBe("expired");
        expect(attentionKindFor({ review_status: "rejected", review_required: true, validity: val("valid"), prior_validity: val("expiring_soon") })).toBe("expiring_soon");
        expect(attentionKindFor({ review_status: "accepted", review_required: true, validity: val("date_missing", null), prior_validity: null })).toBe("date_missing");
        expect(attentionKindFor({ review_status: "accepted", review_required: false, validity: val("valid"), prior_validity: null })).toBeNull();
    });
});

// ── through the routes: readiness, work, attention, Work Items ────────────────────────────────────────────────
describe("readiness, work and attention from one evaluator (D7.4)", () => {
    it("readiness: expired, expiring soon and derived-duration validity per child", async () => {
        as(P.admin);
        const r = await readiness(`subject_type=household&subject_id=${H}`);
        expect(evalOf(r, R_IMM.id, C1)).toMatchObject({ state: "satisfied", expiring_soon: true, valid_until: "2026-11-15" });
        expect(evalOf(r, R_IMM.id, C2)).toMatchObject({ state: "expired", blocking: true });
        expect(evalOf(r, R_PHYS.id, C1)).toMatchObject({ state: "satisfied", expiring_soon: true, valid_until: "2026-11-09" });
        expect(r.readiness.totals).toMatchObject({ expired: 1, expiring_soon: 2 });
    });
    it("work: expired requirement rows block; expiring requirement rows are renewal work due on the last valid day", async () => {
        as(P.admin);
        const w = await work();
        expect(w.status).toBe(200);
        const byKey = new Map(w.rows.map((r) => [`${r.requirement_id}:${r.subject_id}`, r]));
        expect(byKey.get(`${R_IMM.id}:${C2}`)).toMatchObject({ state: "expired", expired_document_ids: [DOC.immC2] });
        expect(byKey.get(`${R_IMM.id}:${C1}`)).toMatchObject({ state: "expiring_soon", due_on: "2026-11-15", overdue: false });
        expect(byKey.get(`${R_PHYS.id}:${C1}`)).toMatchObject({ state: "expiring_soon", due_on: "2026-11-09" });
    });
    it("attention: a document no requirement covers is listed once (date missing); covered documents are not duplicated", async () => {
        as(P.admin);
        const w = await work();
        const kinds = w.documents.map((d) => [d.document_id, d.kind]);
        expect(kinds).toContainEqual([DOC.licP1, "date_missing"]);
        // immC1 / immC2 / physC1 are already requirement rows; the quarantined upload is never listed.
        expect(w.documents.map((d) => d.document_id)).not.toContain(DOC.immC1);
        expect(w.documents.map((d) => d.document_id)).not.toContain(DOC.immC2);
        expect(w.documents.map((d) => d.document_id)).not.toContain(DOC.physC1);
        expect(JSON.stringify(w.body)).not.toContain(DOC.held);
        expect(JSON.stringify(w.body)).not.toContain(DOC.foreign);
    });
    it("attention without a requirement: an expired document is listed as expired", async () => {
        db.tables.document_requirements = [];
        as(P.admin);
        const w = await work();
        expect(w.rows).toHaveLength(0);
        const k = new Map(w.documents.map((d) => [d.document_id, d.kind]));
        expect(k.get(DOC.immC2)).toBe("expired");
        expect(k.get(DOC.immC1)).toBe("expiring_soon");
        expect(k.get(DOC.physC1)).toBe("expiring_soon");
        expect(k.has(DOC.held)).toBe(false);
    });
    it("clearance: a reader without health.view sees no medical requirement and no medical attention row", async () => {
        as(P.reader);
        const w = await work();
        expect(w.rows).toHaveLength(0);
        expect(w.documents.every((d) => d.document_type_key === "drivers_license")).toBe(true);
    });
    it("Work Items maps requirement rows and attention rows, never stored, routed to Documents", async () => {
        as(P.admin);
        const w = await work();
        const items = mapDocumentRequirementWorkToWorkItemRows(w.rows, w.documents);
        expect(items.length).toBe(w.rows.length + w.documents.length);
        expect(items.every((i) => i.source === "documents" && i.is_document_requirement_projection)).toBe(true);
        expect(items.find((i) => i.id === `document_attention:${DOC.licP1}:date_missing`)).toMatchObject({ document_attention_kind: "date_missing", title: expect.stringContaining("Record dates") });
        expect(items.find((i) => i.document_requirement_state === "expired")?.title).toMatch(/^Renew:/);
    });
});

// ── D7.2 review lifecycle ──────────────────────────────────────────────────────────────────────────────────
describe("the review lifecycle (D7.2)", () => {
    beforeEach(() => {
        db.rows("document_versions").find((x) => x.id === `v-${DOC.immC1}`)!.review_status = "pending";
    });

    it("first decision with documents.write; every decision is in the history with its reason", async () => {
        as(P.ops);
        expect((await review(DOC.immC1, { decision: "rejected" })).status).toBe(400);
        const r = await review(DOC.immC1, { decision: "rejected", reason: "Illegible scan" });
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ review_status: "rejected", previous_review_status: "pending", rereview: false });
        expect(reviewEvents(DOC.immC1)).toHaveLength(1);
        expect(auditsOf("document_version_reviewed")).toHaveLength(1);
    });

    it("re-review needs Documents administration and a reason; accepted ↔ rejected and reopen all recorded", async () => {
        as(P.ops);
        await review(DOC.immC1, { decision: "rejected", reason: "Illegible scan" });
        const refused = await review(DOC.immC1, { decision: "accepted" });
        expect(refused.status).toBe(403);
        expect((refused.body as { code: string }).code).toBe("REREVIEW_NOT_AUTHORIZED");
        as(P.admin);
        expect((await review(DOC.immC1, { decision: "accepted" })).status).toBe(400);
        const changed = await review(DOC.immC1, { decision: "accepted", reason: "Clear copy confirmed by phone" });
        expect(changed.status).toBe(200);
        expect(changed.body).toMatchObject({ review_status: "accepted", previous_review_status: "rejected", rereview: true });
        const reopened = await review(DOC.immC1, { decision: "pending", reason: "Date of birth mismatch" });
        expect(reopened.status).toBe(200);
        expect(db.rows("document_versions").find((x) => x.id === `v-${DOC.immC1}`)).toMatchObject({ review_status: "pending", reviewed_by: null });
        expect(reviewEvents(DOC.immC1).map((e) => e.decision)).toEqual(["rejected", "accepted", "reopened"]);
        // The D6 hosted finding: the history now shows every decision, not only the latest.
        const h = await invokeRoute(historyGET, buildRequest({ path: "/x" }), routeParams({ id: DOC.immC1 }));
        const actions = ((h.body as { entries: Array<{ action: string; detail: string | null }> }).entries ?? []).map((x) => `${x.action}|${x.detail ?? ""}`);
        expect(actions).toEqual(expect.arrayContaining(["Review rejected|Illegible scan", "Review accepted (was rejected)|Clear copy confirmed by phone", "Review reopened|Date of birth mismatch"]));
    });

    it("reopening an undecided version is refused; a quarantined document cannot be reviewed; another organization is not found", async () => {
        as(P.admin);
        expect((await review(DOC.immC1, { decision: "pending", reason: "Reopen what is open" })).status).toBe(409);
        expect([403, 404, 409]).toContain((await review(DOC.held, { decision: "accepted" })).status);
        as(P.otherOrg);
        expect((await review(DOC.immC1, { decision: "accepted" })).status).toBe(404);
        expect(reviewEvents(DOC.held)).toHaveLength(0);
    });

    it("pending → accepted moves the requirement from pending review to satisfied (re-evaluated on read)", async () => {
        as(P.admin);
        expect(evalOf(await readiness(`subject_type=child&subject_id=${C1}`), R_IMM.id, C1)?.state).toBe("pending_review");
        await review(DOC.immC1, { decision: "accepted" });
        expect(evalOf(await readiness(`subject_type=child&subject_id=${C1}`), R_IMM.id, C1)?.state).toBe("satisfied");
    });
});

// ── D7.1 validity dates through the route ───────────────────────────────────────────────────────────────────
describe("recording validity dates (D7.1)", () => {
    it("records the dates on the current version only; the review is untouched; the derived validity is returned", async () => {
        as(P.ops);
        const r = await setDates(DOC.licP1, { effective_on: "2026-01-10", expires_on: "2030-01-09", reason: "From the license" });
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ changed: true, expires_on: "2030-01-09", validity: { status: "valid" }, today: TODAY });
        expect(db.rows("document_versions").find((x) => x.id === `v-${DOC.licP1}`)).toMatchObject({ review_status: "accepted", expires_on: "2030-01-09" });
        expect(auditsOf("document_version_validity_set")).toHaveLength(1);
        expect(reviewEvents(DOC.licP1)).toHaveLength(1);
        const g = await invokeRoute(validityGET, buildRequest({ path: "/x" }), routeParams({ id: DOC.licP1 }));
        expect(g.body).toMatchObject({ policy: { kind: "explicit_date" }, validity: { status: "valid", expires_on: "2030-01-09" } });
        // The license is no longer an attention row once its date is recorded.
        as(P.admin);
        expect((await work()).documents.some((d) => d.document_id === DOC.licP1)).toBe(false);
    });
    it("refusals: bad or inverted dates 400, no write 403, quarantined refused, another organization 404, stale version 409", async () => {
        as(P.ops);
        expect((await setDates(DOC.licP1, { expires_on: "2026-13-01" })).status).toBe(400);
        expect((await setDates(DOC.licP1, { effective_on: "2026-05-01", expires_on: "2026-04-30" })).status).toBe(400);
        expect((await setDates(DOC.licP1, { expires_on: "2027-01-01", version_id: "stale" })).status).toBe(409);
        expect([403, 404, 409]).toContain((await setDates(DOC.held, { expires_on: "2027-01-01" })).status);
        as(P.reader);
        expect((await setDates(DOC.licP1, { expires_on: "2027-01-01" })).status).toBe(403);
        as(P.otherOrg);
        expect((await setDates(DOC.licP1, { expires_on: "2027-01-01" })).status).toBe(404);
        expect(db.rows("document_versions").find((x) => x.id === `v-${DOC.licP1}`)!.expires_on).toBeNull();
    });
});

// ── D7.3 renewal ────────────────────────────────────────────────────────────────────────────────────────────
describe("renewal by replacement (D7.3)", () => {
    async function pdf() {
        const d = await PDFDocument.create();
        d.addPage([100, 100]);
        return d.save();
    }
    async function renew(id: string, fields: Record<string, string>) {
        const form = new FormData();
        form.set("file", new File([(await pdf()) as unknown as BlobPart], "renewal.pdf", { type: "application/pdf" }));
        form.set("reason", "Renewed physical from the pediatrician");
        for (const [k, v] of Object.entries(fields)) form.set(k, v);
        return invokeRoute(versionsPOST, new NextRequest(`http://localhost/api/admin/documents/${id}/versions`, { method: "POST", body: form }), routeParams({ id }));
    }

    it("a renewal is a new version on the same document and subject, pending review (review_on_renewal), with its dates", async () => {
        as(P.admin);
        const r = await renew(DOC.physC1, { effective_on: "2026-10-20", expires_on: "2027-10-19" });
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ version_number: 2, validity_recorded: true });
        const v2 = db.rows("document_versions").find((x) => x.id === `v2-${DOC.physC1}`)!;
        expect(v2).toMatchObject({ review_status: "pending", effective_on: "2026-10-20", expires_on: "2027-10-19" });
        expect(db.rows("document_versions").find((x) => x.id === `v-${DOC.physC1}`)).toMatchObject({ review_status: "accepted" });
        expect(db.rows("document_subjects").filter((s) => s.document_id === DOC.physC1)).toHaveLength(1);
        // Still met by version 1 (in force until 2026-11-09) while the renewal awaits review.
        const before = evalOf(await readiness(`subject_type=child&subject_id=${C1}`), R_PHYS.id, C1);
        expect(before).toMatchObject({ state: "satisfied", renewal_pending: true, valid_until: "2026-11-09" });
        await review(DOC.physC1, { decision: "accepted" });
        const after = evalOf(await readiness(`subject_type=child&subject_id=${C1}`), R_PHYS.id, C1);
        expect(after).toMatchObject({ state: "satisfied", renewal_pending: false, valid_until: "2027-10-19", expiring_soon: false });
        expect((await work()).rows.some((x) => x.requirement_id === R_PHYS.id && x.subject_id === C1)).toBe(false);
    });
    it("a rejected renewal does not satisfy; once version 1 lapses the requirement is blocked by the rejection", async () => {
        as(P.admin);
        await renew(DOC.physC1, {});
        await review(DOC.physC1, { decision: "rejected", reason: "Wrong child on the form" });
        expect(evalOf(await readiness(`subject_type=child&subject_id=${C1}`), R_PHYS.id, C1)).toMatchObject({ state: "satisfied", renewal_pending: true });
        vi.setSystemTime(new Date("2026-11-11T20:00:00Z"));
        expect(evalOf(await readiness(`subject_type=child&subject_id=${C1}`), R_PHYS.id, C1)).toMatchObject({ state: "blocked", blocked_reason: "evidence_rejected" });
    });
    it("bad renewal dates are refused before anything is stored", async () => {
        as(P.admin);
        expect((await renew(DOC.physC1, { effective_on: "2027-01-01", expires_on: "2026-01-01" })).status).toBe(400);
        expect(db.rows("document_versions").some((x) => x.id === `v2-${DOC.physC1}`)).toBe(false);
    });
});
