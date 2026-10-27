/**
 * D6 — document requirements, satisfaction, waivers, readiness and derived work, through the real routes.
 *
 * Handlers, the service, the ONE evaluator and every authorization helper (scope, sensitivity, availability) run
 * unmodified; the session and the service-role client are substituted, and the in-memory client evaluates each query's
 * real filters. The governed database functions are stood in for where a route calls one (validate, publish, waiver
 * grant/revoke); their guards are proven against Postgres by certification/invariants/documents-d6-requirements.sql.
 * This file pins the application half, the evaluator's outcome matrix, disclosure, and the parity between the two
 * validators and between every consumer of the evaluator.
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

import { GET as reqsGET, POST as reqsPOST } from "@/app/api/admin/documents/configuration/requirements/route";
import { GET as reqGET, PATCH as reqPATCH, DELETE as reqDELETE } from "@/app/api/admin/documents/configuration/requirements/[id]/route";
import { PUT as draftPUT } from "@/app/api/admin/documents/configuration/requirements/[id]/draft/route";
import { POST as validatePOST } from "@/app/api/admin/documents/configuration/requirements/[id]/validate/route";
import { POST as publishPOST } from "@/app/api/admin/documents/configuration/requirements/[id]/publish/route";
import { GET as readinessGET } from "@/app/api/admin/documents/requirements/readiness/route";
import { GET as workGET } from "@/app/api/admin/documents/requirements/work/route";
import { GET as waiversGET, POST as waiversPOST } from "@/app/api/admin/documents/requirements/waivers/route";
import { PATCH as waiverPATCH } from "@/app/api/admin/documents/requirements/waivers/[id]/route";
import { POST as reviewPOST } from "@/app/api/admin/documents/[id]/review/route";
import {
    evaluateDocumentRequirement,
    type EvaluableRequirement,
    type EvaluationSubject,
    type EvidenceDocument,
} from "@/lib/documents/requirements/documentRequirementEvaluator";
import { documentRequirementDraftProblems, type DocumentRequirementDraft } from "@/lib/documents/requirements/documentRequirementPolicy";
import { evaluateDocumentTypeRequirementsForChild, type RequirementWorkRow, type SubjectReadiness } from "@/lib/documents/requirements/documentRequirementService";

const ORG = "0a000000-0000-4000-8000-0000000000d6";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d6";
const USER = "05e00000-0000-4000-8000-0000000000d6";
const DEPT = "de000000-0000-4000-8000-0000000000d6";
const WU = "a0000000-0000-4000-8000-0000000000d6";
const H = "c0000000-0000-4000-8000-0000000000d6";
const P1 = "9e000000-0000-4000-8000-0000000000d6";
const C1 = "cb000000-0000-4000-8000-000000000001";
const C2 = "cb000000-0000-4000-8000-000000000002";
const C_OTHER_ORG = "cb000000-0000-4000-8000-000000000009";
const OPP = "0e000000-0000-4000-8000-0000000000d6";
const PI1 = "91000000-0000-4000-8000-000000000001";

const T_IMM = { id: "ce000000-0000-4000-8000-000000000001", v: "cf000000-0000-4000-8000-000000000001" };
const T_CUSTODY = { id: "ce000000-0000-4000-8000-000000000002", v: "cf000000-0000-4000-8000-000000000002" };
const T_CONTRACT = { id: "ce000000-0000-4000-8000-000000000003", v: "cf000000-0000-4000-8000-000000000003" };

const R_IMM = { id: "a6000000-0000-4000-8000-000000000001", v: "a7000000-0000-4000-8000-000000000001" }; // medical, child, required, waivable
const R_CUSTODY = { id: "a6000000-0000-4000-8000-000000000002", v: "a7000000-0000-4000-8000-000000000002" }; // standard, child, enrollment journey
const R_CONTRACT = { id: "a6000000-0000-4000-8000-000000000003", v: "a7000000-0000-4000-8000-000000000003" }; // standard, household, NOT waivable
const R_OPTIONAL = { id: "a6000000-0000-4000-8000-000000000004", v: "a7000000-0000-4000-8000-000000000004" }; // optional
const R_OTHER_ORG = { id: "a6000000-0000-4000-8000-000000000009", v: "a7000000-0000-4000-8000-000000000009" };

const DOC = {
    custodyPending: "d6000000-0000-4000-8000-000000000001",
    custodyQuarantined: "d6000000-0000-4000-8000-000000000002",
    immRejected: "d6000000-0000-4000-8000-000000000003",
    contractOtherOrg: "d6000000-0000-4000-8000-000000000004",
} as const;

type Persona = { orgId: string; roleKeys: string[]; permissionKeys: string[]; departmentScope?: "all" | "restricted"; allowedDepartmentIds?: string[] | null };
const P = {
    admin: { orgId: ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "documents.write", "processing.documents.manage", "health.view"] },
    adminNoHealth: { orgId: ORG, roleKeys: ["qa_doc_admin"], permissionKeys: ["documents.read", "documents.write", "processing.documents.manage"] },
    ops: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["portal.access", "documents.read", "documents.write", "processing.operate", "health.view"] },
    readerNoHealth: { orgId: ORG, roleKeys: ["qa_doc_reader"], permissionKeys: ["portal.access", "documents.read"] },
    noDocs: { orgId: ORG, roleKeys: ["qa_no_docs"], permissionKeys: ["portal.access"] },
    scoped: { orgId: ORG, roleKeys: ["ops"], permissionKeys: ["documents.read", "documents.write", "processing.documents.manage", "health.view"], departmentScope: "restricted", allowedDepartmentIds: [DEPT] },
    otherOrgAdmin: { orgId: OTHER_ORG, roleKeys: ["admin"], permissionKeys: ["documents.read", "processing.documents.manage", "health.view"] },
} satisfies Record<string, Persona>;

function as(p: Persona) {
    mockCtx.mockResolvedValue({ ok: true, orgId: p.orgId, role: "admin", userId: USER, permissionKeys: p.permissionKeys });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER, orgId: p.orgId, roleKeys: p.roleKeys, permissionKeys: p.permissionKeys,
        departmentScope: p.departmentScope ?? "all", allowedDepartmentIds: p.allowedDepartmentIds ?? null, siteScope: "all", allowedSiteLocationIds: null,
    });
}

let db: InMemorySupabase;
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;

function typeRows(t: { id: string; v: string }, key: string, label: string, subjectTypes: string[], sensitivity: string, reviewRequired: boolean, org = ORG) {
    return {
        type: { id: t.id, org_id: org, key, status: "active", seeded: false, published_version_id: t.v },
        version: {
            id: t.v, org_id: org, document_type_id: t.id, version_number: 1, status: "published", label, category_id: null, subject_types: subjectTypes,
            allowed_formats: ["pdf"], default_sensitivity: sensitivity, review_required: reviewRequired, replacement_policy: "new_version", validity_policy: { kind: "none" },
        },
    };
}
function reqRows(r: { id: string; v: string }, key: string, over: Record<string, unknown>, org = ORG) {
    return {
        req: { id: r.id, org_id: org, key, status: "active", published_version_id: r.v, created_at: "2026-10-01T00:00:00Z", archived_at: null },
        version: {
            id: r.v, org_id: org, requirement_id: r.id, version_number: 1, status: "published", label: key, description: null, document_type_key: "immunization_record",
            subject_type: "child", scope: { kind: "all" }, timing: { kind: "immediate" }, policy: "required", waivable: false, effective_from: null, effective_until: null,
            validation_errors: [], created_at: "2026-10-01T00:00:00Z", published_at: "2026-10-01T00:00:00Z", superseded_at: null, ...over,
        },
    };
}
function doc(id: string, over: Record<string, unknown>) {
    return {
        id, org_id: ORG, bucket: "org_documents", storage_path: `${ORG}/x/${id}.pdf`, title: `Doc ${id.slice(-2)}`, mime_type: "application/pdf", byte_size: 10,
        doc_type: null, sensitivity: "standard", status: "uploaded", metadata: {}, created_at: "2026-10-20T00:00:00Z", current_version_id: `v-${id}`, ...over,
    };
}
const owner = (document_id: string, subject_type: string, subject_id: string, org = ORG) => ({
    org_id: org, document_id, subject_type, subject_id, association: "owner", is_primary: true, source: "governed", created_at: "2026-10-20T00:00:00Z", ended_at: null,
});

beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls = [];
    db = new InMemorySupabase();
    db.seed("work_units", [{ id: WU, org_id: ORG, department_id: DEPT }]);
    db.seed("customers", [{ id: H, org_id: ORG, name: "Rivera household", status_key: "active", created_at: "2026-09-01T00:00:00Z" }]);
    db.seed("customer_persons", [{ org_id: ORG, customer_id: H, person_id: P1, role_type: "primary_contact", is_primary: true, status: "active", end_date: null, persons: { id: P1, first_name: "Ana", last_name: "Rivera" } }]);
    db.seed("persons", [{ id: P1, org_id: ORG, first_name: "Ana", last_name: "Rivera", created_at: "2026-09-01T00:00:00Z" }]);
    db.seed("customer_members", [
        { id: C1, org_id: ORG, customer_id: H, first_name: "Mia", last_name: "Rivera", is_active: true, created_at: "2026-10-01T00:00:00Z" },
        { id: C2, org_id: ORG, customer_id: H, first_name: "Leo", last_name: "Rivera", is_active: true, created_at: "2026-10-01T00:00:00Z" },
        { id: C_OTHER_ORG, org_id: OTHER_ORG, customer_id: "c0000000-0000-4000-8000-0000000000ff", first_name: "Zed", last_name: "Foreign", is_active: true, created_at: "2026-10-01T00:00:00Z" },
    ]);
    db.seed("opportunities", [{ id: OPP, org_id: ORG, customer_id: H, title: "Fall enrollment", status_key: "open", work_unit_id: WU, location_id: null, created_at: "2026-10-01T00:00:00Z" }]);
    // Mia (C1) is in an open enrollment journey at stage `enrolling`; Leo is not in any journey.
    db.seed("process_instances", [
        { id: PI1, org_id: ORG, process_key: "enrollment_process", subject_type: "child", subject_id: C1, context_type: "opportunity", context_id: OPP, stage_key: "enrolling", state: "enrolling", close_reason_key: null, created_at: "2026-10-05T00:00:00Z" },
    ]);

    const imm = typeRows(T_IMM, "immunization_record", "Immunization record", ["child"], "medical", true);
    const custody = typeRows(T_CUSTODY, "custody_order", "Custody order", ["child"], "standard", true);
    const contract = typeRows(T_CONTRACT, "enrollment_contract", "Enrollment contract", ["household"], "standard", false);
    db.seed("document_types", [imm.type, custody.type, contract.type]);
    db.seed("document_type_versions", [imm.version, custody.version, contract.version]);
    db.seed("document_categories", []);

    const rImm = reqRows(R_IMM, "immunizations_on_file", { waivable: true, timing: { kind: "within_days", days: 30 } });
    const rCustody = reqRows(R_CUSTODY, "custody_for_enrolling", { document_type_key: "custody_order", scope: { kind: "business_process", process_key: "enrollment_process", stage_keys: ["enrolling"] }, waivable: true });
    const rContract = reqRows(R_CONTRACT, "household_contract", { document_type_key: "enrollment_contract", subject_type: "household", waivable: false });
    const rOptional = reqRows(R_OPTIONAL, "optional_contract_copy", { document_type_key: "enrollment_contract", subject_type: "household", policy: "optional", scope: { kind: "business_process", process_key: "enrollment_process" } });
    const rOther = reqRows(R_OTHER_ORG, "foreign_requirement", {}, OTHER_ORG);
    db.seed("document_requirements", [rImm.req, rCustody.req, rContract.req, rOptional.req, rOther.req]);
    db.seed("document_requirement_versions", [rImm.version, rCustody.version, rContract.version, rOptional.version, rOther.version]);
    db.seed("document_requirement_waivers", []);

    db.seed("documents", [
        doc(DOC.custodyPending, { entity_type: "customer_member", entity_id: C1, doc_type: "custody_order" }),
        doc(DOC.custodyQuarantined, { entity_type: "customer_member", entity_id: C2, doc_type: "custody_order", status: "quarantined" }),
        doc(DOC.immRejected, { entity_type: "customer_member", entity_id: C2, doc_type: "immunization_record", sensitivity: "medical" }),
        doc(DOC.contractOtherOrg, { org_id: OTHER_ORG, entity_type: "customer", entity_id: H, doc_type: "enrollment_contract" }),
    ]);
    db.seed("document_subjects", [
        owner(DOC.custodyPending, "child", C1),
        owner(DOC.custodyQuarantined, "child", C2),
        owner(DOC.immRejected, "child", C2),
        owner(DOC.contractOtherOrg, "household", H, OTHER_ORG),
    ]);
    db.seed("document_versions", [
        { id: `v-${DOC.custodyPending}`, org_id: ORG, document_id: DOC.custodyPending, version_number: 1, review_status: "pending" },
        { id: `v-${DOC.custodyQuarantined}`, org_id: ORG, document_id: DOC.custodyQuarantined, version_number: 1, review_status: null },
        { id: `v-${DOC.immRejected}`, org_id: ORG, document_id: DOC.immRejected, version_number: 1, review_status: "rejected" },
        { id: `v-${DOC.contractOtherOrg}`, org_id: OTHER_ORG, document_id: DOC.contractOtherOrg, version_number: 1, review_status: null },
    ]);

    // Stand-ins for the governed functions; their guards are proven in Postgres.
    (db as unknown as { rpc: unknown }).rpc = async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (name === "document_requirement_validate") return { data: { version_id: args.p_version_id, valid: true, problems: [] }, error: null };
        if (name === "document_requirement_publish") return { data: { version_id: args.p_version_id, version_number: 2, superseded_version_id: args.p_expected_published_version_id }, error: null };
        if (name === "document_requirement_waiver_grant") {
            const r = db.rows("document_requirements").find((x) => x.id === args.p_requirement_id && x.org_id === args.p_org_id);
            if (!r) return { data: null, error: { message: "document_requirement_not_found" } };
            const v = db.rows("document_requirement_versions").find((x) => x.id === r.published_version_id)!;
            if (!v.waivable) return { data: null, error: { message: "document_requirement_not_waivable: this requirement's policy does not allow waivers" } };
            // As document_subject_resolves: the subject must exist in the waiving organization (invariant 5c).
            const table = { child: "customer_members", household: "customers", person: "persons", opportunity: "opportunities" }[String(args.p_subject_type)] ?? "";
            if (!db.rows(table).some((x) => x.id === args.p_subject_id && x.org_id === args.p_org_id)) {
                return { data: null, error: { message: "document_requirement_waiver_subject_unresolved" } };
            }
            if (db.rows("document_requirement_waivers").some((w) => w.requirement_id === r.id && w.subject_id === args.p_subject_id && w.state === "active")) {
                return { data: null, error: { message: "document_requirement_waiver_exists" } };
            }
            const id = `e0000000-0000-4000-8000-00000000000${db.rows("document_requirement_waivers").length + 1}`;
            db.seed("document_requirement_waivers", [
                { id, org_id: args.p_org_id, requirement_id: r.id, requirement_version_id: v.id, subject_type: args.p_subject_type, subject_id: args.p_subject_id, reason: args.p_reason, state: "active", effective_until: args.p_effective_until, granted_by: args.p_actor, granted_at: "2026-10-27T00:00:00Z" },
            ]);
            return { data: { waiver_id: id, requirement_version_id: v.id }, error: null };
        }
        if (name === "document_requirement_waiver_revoke") {
            const w = db.rows("document_requirement_waivers").find((x) => x.id === args.p_waiver_id && x.org_id === args.p_org_id);
            if (!w) return { data: null, error: { message: "document_requirement_waiver_not_found" } };
            if (w.state !== "active") return { data: null, error: { message: "document_requirement_waiver_not_active" } };
            Object.assign(w, { state: "revoked", revoked_by: args.p_actor, revoked_at: "2026-10-27T01:00:00Z", revoke_reason: args.p_reason });
            return { data: { waiver_id: w.id, requirement_id: w.requirement_id }, error: null };
        }
        if (name === "document_requirement_purge") {
            const r = db.rows("document_requirements").find((x) => x.id === args.p_requirement_id && x.org_id === args.p_org_id);
            if (!r) return { data: null, error: { message: "document_requirement_not_found" } };
            if (!/^qa_[a-z0-9_]+$/.test(String(r.key)) || r.status !== "archived") return { data: null, error: { message: "document_requirement_purge_refused" } };
            const versions = db.rows("document_requirement_versions").filter((v) => v.requirement_id === r.id).length;
            const waivers = db.rows("document_requirement_waivers").filter((w) => w.requirement_id === r.id).length;
            for (const t of ["document_requirement_waivers", "document_requirement_versions"]) db.tables[t] = db.rows(t).filter((x) => x.requirement_id !== r.id);
            db.tables.document_requirements = db.rows("document_requirements").filter((x) => x.id !== r.id);
            return { data: { requirement_id: r.id, versions, waivers, purged: true }, error: null };
        }
        if (name === "document_set_version_review") {
            const v = db.rows("document_versions").find((x) => x.id === args.p_version_id && x.org_id === args.p_org_id);
            if (!v) return { data: null, error: { message: "document_version_not_found" } };
            Object.assign(v, { review_status: args.p_review_status, reviewed_by: args.p_actor, effective_on: args.p_effective_on, expires_on: args.p_expires_on });
            return { data: { version_id: v.id, review_status: args.p_review_status }, error: null };
        }
        if (name === "is_medical_form_submission") return { data: false, error: null };
        return { data: null, error: { message: `unexpected rpc ${name}` } };
    };
    dbRef.current = db;
});

const audits = (event: string) => db.rows("workflow_events").filter((e) => e.event_type === event);
const json = (method: "POST" | "PATCH" | "PUT" | "DELETE", body?: Record<string, unknown>) => buildRequest({ method, path: "/x", body });
const readiness = async (q: string) => invokeRoute(readinessGET, buildRequest({ path: `/api/admin/documents/requirements/readiness?${q}` }));
const work = async () => invokeRoute(workGET, buildRequest({ path: "/api/admin/documents/requirements/work" }));
const rows = (res: { body: unknown }) => (res.body as { rows: RequirementWorkRow[] }).rows;
const subjectsOf = (res: { body: unknown }) => (res.body as { readiness: { subjects: SubjectReadiness[] } }).readiness.subjects;
const stateOf = (subjects: SubjectReadiness[], requirementId: string, subjectId: string) =>
    subjects.flatMap((s) => s.requirements).find((e) => e.requirement_id === requirementId && e.subject_id === subjectId)?.state ?? null;

// ── the evaluator, as a function of explicit inputs ──────────────────────────────────────────────────────────────
describe("the evaluator: missing / pending review / satisfied / waived / blocked", () => {
    const requirement: EvaluableRequirement = {
        requirement_id: "r1", requirement_key: "r1", version_id: "v1", label: "Immunizations", document_type_key: "immunization_record", subject_type: "child",
        scope: { kind: "all" }, timing: { kind: "within_days", days: 30 }, policy: "required", waivable: true, effective_from: null, effective_until: null,
    };
    const type = { key: "immunization_record", label: "Immunization record", subject_types: ["child"], review_required: true };
    const subject: EvaluationSubject = { subject_type: "child", subject_id: "c1", created_at: "2026-10-01T00:00:00Z", journeys: [] };
    const d = (id: string, status: string | null, review: EvidenceDocument["review_status"]): EvidenceDocument => ({ document_id: id, status, review_status: review, received_at: "2026-10-10T00:00:00Z" });
    const waiver = { waiver_id: "w1", requirement_id: "r1", subject_type: "child", subject_id: "c1", state: "active" as const, effective_until: null };
    const run = (over: Partial<Parameters<typeof evaluateDocumentRequirement>[0]> = {}) =>
        evaluateDocumentRequirement({ requirement, type, subject, documents: [], waivers: [], today: "2026-10-27", ...over });

    it("missing evidence → missing, blocking, due from the subject's anchor", () => {
        const e = run()!;
        expect([e.state, e.blocking, e.due_on]).toEqual(["missing", true, "2026-10-31"]);
    });
    it("uploaded but unaccepted → pending review (pending review, or no review on a review-required type)", () => {
        expect(run({ documents: [d("a", "uploaded", "pending")] })!.state).toBe("pending_review");
        expect(run({ documents: [d("a", null, null)] })!.state).toBe("pending_review");
        expect(run({ documents: [d("a", null, null)], type: { ...type, review_required: false } })!.state).toBe("satisfied");
    });
    it("accepted evidence → satisfied, and it beats a waiver", () => {
        const e = run({ documents: [d("a", "uploaded", "accepted")], waivers: [waiver] })!;
        expect([e.state, e.blocking, e.waiver_id, e.evidence.accepted]).toEqual(["satisfied", false, null, ["a"]]);
    });
    it("quarantined or rejected evidence only → blocked, with the reason", () => {
        expect(run({ documents: [d("q", "quarantined", null)] })).toMatchObject({ state: "blocked", blocked_reason: "evidence_quarantined" });
        expect(run({ documents: [d("r", "uploaded", "rejected")] })).toMatchObject({ state: "blocked", blocked_reason: "evidence_rejected" });
        // A pending replacement next to a rejected one is pending review, not blocked.
        expect(run({ documents: [d("r", "uploaded", "rejected"), d("p", "uploaded", "pending")] })!.state).toBe("pending_review");
    });
    it("deleted, restricted and superseded documents are never evidence", () => {
        for (const s of ["deleted", "restricted", "superseded"]) expect(run({ documents: [d("x", s, "accepted")] })!.state).toBe("missing");
    });
    it("an active, unexpired waiver on a waivable requirement → waived (not blocking); never evidence", () => {
        const e = run({ waivers: [waiver] })!;
        expect([e.state, e.blocking, e.waiver_id, e.evidence.accepted]).toEqual(["waived", false, "w1", []]);
        expect(run({ waivers: [{ ...waiver, effective_until: "2026-10-26" }] })!.state).toBe("missing");
        expect(run({ waivers: [{ ...waiver, state: "revoked" }] })!.state).toBe("missing");
        expect(run({ waivers: [{ ...waiver, subject_id: "c2" }] })!.state).toBe("missing");
        // Policy eligibility is re-read: a requirement republished as non-waivable ignores the old waiver.
        expect(run({ waivers: [waiver], requirement: { ...requirement, waivable: false } })!.state).toBe("missing");
    });
    it("a waiver does not lift quarantine: the quarantined document stays out of the evidence", () => {
        const e = run({ documents: [d("q", "quarantined", null)], waivers: [waiver] })!;
        expect(e.state).toBe("waived");
        expect(e.evidence.accepted).toEqual([]);
        expect(e.evidence.quarantined).toEqual(["q"]);
    });
    it("a type no longer published, or no longer accepting the grain → blocked by configuration", () => {
        expect(run({ type: null })).toMatchObject({ state: "blocked", blocked_reason: "type_unavailable" });
        expect(run({ type: { ...type, subject_types: ["household"] } })).toMatchObject({ state: "blocked", blocked_reason: "type_subject_not_accepted" });
    });
    it("subject and scope eligibility: grain, effective window and Business Process journeys", () => {
        expect(run({ subject: { ...subject, subject_type: "household" } })).toBeNull();
        expect(run({ requirement: { ...requirement, effective_from: "2026-11-01" } })).toBeNull();
        expect(run({ requirement: { ...requirement, effective_until: "2026-10-01" } })).toBeNull();
        const bp: EvaluableRequirement = { ...requirement, scope: { kind: "business_process", process_key: "enrollment_process", stage_keys: ["enrolling"] } };
        expect(run({ requirement: bp })).toBeNull();
        expect(run({ requirement: bp, subject: { ...subject, journeys: [{ process_key: "enrollment_process", stage_key: "waitlist", started_at: "2026-10-05T00:00:00Z" }] } })).toBeNull();
        const inScope = run({ requirement: bp, subject: { ...subject, journeys: [{ process_key: "enrollment_process", stage_key: "enrolling", started_at: "2026-10-05T00:00:00Z" }] } })!;
        expect([inScope.state, inScope.due_on]).toEqual(["missing", "2026-11-04"]);
    });
    it("optional requirements are evaluated but never blocking", () => {
        const e = run({ requirement: { ...requirement, policy: "optional" } })!;
        expect([e.state, e.blocking]).toEqual(["missing", false]);
    });
    it("is deterministic: the same inputs in any order give the same result", () => {
        const docs = [d("b", "uploaded", "pending"), d("a", "uploaded", "pending")];
        expect(run({ documents: docs })).toEqual(run({ documents: [...docs].reverse() }));
    });
});

// ── the two validators agree ─────────────────────────────────────────────────────────────────────────────────────
describe("validation parity: the editor mirrors the database", () => {
    it("emits exactly the database's problem codes", () => {
        const sql = readFileSync(resolve(join(__dirname, "../../../supabase/migrations/20261212090000_documents_d6_requirements.sql")), "utf8");
        const fn = sql.slice(sql.indexOf("FUNCTION public.document_requirement_version_problems"), sql.indexOf("FUNCTION public.document_requirement_validate"));
        const sqlCodes = new Set([...fn.matchAll(/'code', '([a-z_]+)'/g)].map((m) => m[1]));
        sqlCodes.delete("not_found");
        const ts = readFileSync(resolve(join(__dirname, "../../lib/documents/requirements/documentRequirementPolicy.ts")), "utf8");
        const tsCodes = new Set([...ts.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]));
        expect([...tsCodes].sort()).toEqual([...sqlCodes].sort());
    });
    it("reports the same problems for the same bad draft", () => {
        const bad: DocumentRequirementDraft = {
            label: "", document_type_key: "immunization_record", subject_type: "household", scope: { kind: "business_process" } as never,
            timing: { kind: "within_days", days: 0 }, policy: "required", waivable: false, effective_from: "2027-01-01", effective_until: "2026-01-01",
        };
        const codes = documentRequirementDraftProblems(bad, { typeSubjectTypes: ["child"], duplicate: true }).map((p) => p.code).sort();
        expect(codes).toEqual(["effective_range_inverted", "label_required", "requirement_duplicate", "scope_process_required", "subject_type_not_accepted_by_type", "timing_days_range"].sort());
        expect(documentRequirementDraftProblems({ ...bad, label: "x", subject_type: "child", scope: { kind: "all" }, timing: { kind: "immediate" }, effective_from: null }, { typeSubjectTypes: null, duplicate: false }).map((p) => p.code)).toEqual(["document_type_not_published"]);
    });
});

// ── D6.1 authoring ───────────────────────────────────────────────────────────────────────────────────────────────
describe("requirement authoring: processing.documents.manage writes, documents.read reads", () => {
    it("readers read the configuration; a no-documents role does not", async () => {
        for (const p of [P.readerNoHealth, P.ops, P.admin]) {
            as(p);
            expect((await invokeRoute(reqsGET, buildRequest({ path: "/x" }))).status).toBe(200);
        }
        as(P.noDocs);
        expect((await invokeRoute(reqsGET, buildRequest({ path: "/x" }))).status).toBe(403);
    });
    it("ops and readers cannot author, publish, archive or delete, and nothing is recorded", async () => {
        for (const p of [P.ops, P.readerNoHealth]) {
            as(p);
            expect((await invokeRoute(reqsPOST, json("POST", { label: "X", document_type_key: "custody_order", subject_type: "child" }))).status).toBe(403);
            expect((await invokeRoute(draftPUT, json("PUT", { label: "X" }), routeParams({ id: R_IMM.id }))).status).toBe(403);
            expect((await invokeRoute(publishPOST, json("POST", { version_id: R_IMM.v }), routeParams({ id: R_IMM.id }))).status).toBe(403);
            expect((await invokeRoute(reqPATCH, json("PATCH", { action: "archive" }), routeParams({ id: R_IMM.id }))).status).toBe(403);
            expect((await invokeRoute(reqDELETE, json("DELETE"), routeParams({ id: R_IMM.id }))).status).toBe(403);
        }
        expect(audits("document_requirement_changed")).toHaveLength(0);
        expect(rpcCalls).toHaveLength(0);
    });
    it("create → draft → validate → publish (compare-and-swap) through the governed functions, audited first", async () => {
        as(P.admin);
        const created = await invokeRoute(reqsPOST, json("POST", { label: "Allergy plan", document_type_key: "custody_order", subject_type: "child", waivable: true }));
        expect(created.status).toBe(200);
        const { requirement_id, version_id } = created.body as { requirement_id: string; version_id: string };
        expect(db.rows("document_requirement_versions").find((v) => v.id === version_id)).toMatchObject({ status: "draft", document_type_key: "custody_order", waivable: true });

        const saved = await invokeRoute(draftPUT, json("PUT", { label: "Allergy plan", document_type_key: "custody_order", subject_type: "household" }), routeParams({ id: requirement_id }));
        expect(saved.status).toBe(200);
        expect((saved.body as { problems: Array<{ code: string }> }).problems.map((p) => p.code)).toContain("subject_type_not_accepted_by_type");

        expect((await invokeRoute(validatePOST, json("POST", { version_id }), routeParams({ id: requirement_id }))).status).toBe(200);
        const pub = await invokeRoute(publishPOST, json("POST", { version_id, expected_published_version_id: null }), routeParams({ id: requirement_id }));
        expect(pub.status).toBe(200);
        expect(rpcCalls.map((c) => c.name)).toEqual(["document_requirement_validate", "document_requirement_publish"]);
        expect(rpcCalls[1].args).toMatchObject({ p_org_id: ORG, p_requirement_id: requirement_id, p_version_id: version_id, p_expected_published_version_id: null });
        expect(audits("document_requirement_changed").map((e) => (e.payload as { action: string }).action)).toEqual(["create", "save_draft", "publish"]);
    });
    it("a published version is edited only as a new draft revision; history is listed newest first", async () => {
        as(P.admin);
        const saved = await invokeRoute(draftPUT, json("PUT", { label: "Immunizations v2", document_type_key: "immunization_record", subject_type: "child" }), routeParams({ id: R_IMM.id }));
        expect(saved.body).toMatchObject({ ok: true, version_number: 2, created: true });
        expect(db.rows("document_requirement_versions").find((v) => v.id === R_IMM.v)).toMatchObject({ status: "published", label: "immunizations_on_file" });
        const got = await invokeRoute(reqGET, buildRequest({ path: "/x" }), routeParams({ id: R_IMM.id }));
        expect((got.body as { versions: Array<{ version_number: number }> }).versions.map((v) => v.version_number).sort()).toEqual([1, 2]);
    });
    it("another organization's requirement is not found", async () => {
        as(P.admin);
        expect((await invokeRoute(reqGET, buildRequest({ path: "/x" }), routeParams({ id: R_OTHER_ORG.id }))).status).toBe(404);
        expect((await invokeRoute(publishPOST, json("POST", { version_id: R_OTHER_ORG.v }), routeParams({ id: R_OTHER_ORG.id }))).status).toBe(404);
        expect(rpcCalls).toHaveLength(0);
    });
});

// ── D6.5 readiness / D6.4 work: the same evaluator, disclosed per actor ─────────────────────────────────────────
describe("readiness and work: one evaluator, the canonical disclosure", () => {
    it("readiness for the household: missing, pending review, blocked, scope-eligibility, optional", async () => {
        as(P.admin);
        const res = await readiness(`subject_type=household&subject_id=${H}`);
        expect(res.status).toBe(200);
        const s = subjectsOf(res);
        expect(stateOf(s, R_IMM.id, C1)).toBe("missing");
        expect(stateOf(s, R_IMM.id, C2)).toBe("blocked"); // rejected immunization
        expect(stateOf(s, R_CUSTODY.id, C1)).toBe("pending_review"); // Mia is enrolling; custody pending review
        expect(stateOf(s, R_CUSTODY.id, C2)).toBeNull(); // Leo is in no journey: out of scope
        expect(stateOf(s, R_CONTRACT.id, H)).toBe("missing");
        expect(stateOf(s, R_OPTIONAL.id, H)).toBe("missing");
        // Another organization's documents never count toward this household.
        const evidence = s.flatMap((x) => x.requirements).flatMap((e) => [...e.evidence.accepted, ...e.evidence.pending, ...e.evidence.rejected]);
        expect(evidence).not.toContain(DOC.contractOtherOrg);
        // Quarantined evidence is never listed by id.
        expect(JSON.stringify(res.body)).not.toContain(DOC.custodyQuarantined);
    });

    it("missing → pending review → satisfied as evidence arrives and is accepted; nothing is stored", async () => {
        as(P.admin);
        const before = JSON.stringify(db.tables);
        const D_NEW = "d6000000-0000-4000-8000-0000000000aa";
        expect(stateOf(subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`)), R_IMM.id, C1)).toBe("missing");
        expect(JSON.stringify(db.tables)).toBe(before); // a read writes nothing: no placeholder rows, no satisfaction table
        db.seed("documents", [doc(D_NEW, { entity_type: "customer_member", entity_id: C1, doc_type: "immunization_record", sensitivity: "medical" })]);
        db.seed("document_subjects", [owner(D_NEW, "child", C1)]);
        db.seed("document_versions", [{ id: `v-${D_NEW}`, org_id: ORG, document_id: D_NEW, version_number: 1, review_status: "pending" }]);
        expect(stateOf(subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`)), R_IMM.id, C1)).toBe("pending_review");
        expect(rows(await work()).find((r) => r.requirement_id === R_IMM.id && r.subject_id === C1)).toMatchObject({ state: "pending_review", pending_document_ids: [D_NEW] });
        db.rows("document_versions").find((v) => v.id === `v-${D_NEW}`)!.review_status = "accepted";
        expect(stateOf(subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`)), R_IMM.id, C1)).toBe("satisfied");
        expect(rows(await work()).some((r) => r.requirement_id === R_IMM.id && r.subject_id === C1)).toBe(false);
    });

    it("work rows equal the readiness results that need work (Processing / Work Items / Focus Panel parity)", async () => {
        as(P.admin);
        const w = rows(await work());
        const r = subjectsOf(await readiness(`subject_type=household&subject_id=${H}`));
        const fromReadiness = r.flatMap((s) => s.requirements).filter((e) => e.blocking).map((e) => `${e.requirement_id}:${e.subject_id}:${e.state}`).sort();
        const fromWork = w.map((x) => `${x.requirement_id}:${x.subject_id}:${x.state}`).sort();
        expect(fromWork).toEqual(fromReadiness);
        // Stable derived identity, never an operational task.
        expect(w.every((x) => x.id === `document_requirement:${x.requirement_id}:${x.subject_type}:${x.subject_id}`)).toBe(true);
        expect(db.rows("operational_tasks")).toHaveLength(0);
        // Optional requirements make no work.
        expect(w.some((x) => x.requirement_id === R_OPTIONAL.id)).toBe(false);
    });

    it("a requirement of a class the actor is not cleared for is hidden from readiness, work and counts", async () => {
        as(P.readerNoHealth);
        const s = subjectsOf(await readiness(`subject_type=household&subject_id=${H}`));
        expect(s.flatMap((x) => x.requirements).some((e) => e.requirement_id === R_IMM.id)).toBe(false);
        expect(rows(await work()).some((x) => x.requirement_id === R_IMM.id)).toBe(false);
        expect(JSON.stringify(s)).not.toContain(DOC.immRejected);
        // The standard requirements are still there.
        expect(stateOf(s, R_CONTRACT.id, H)).toBe("missing");
    });

    it("a scope-restricted actor sees no child or household results (fail closed, as D2/D4), and work matches", async () => {
        as(P.scoped);
        const res = await readiness(`subject_type=opportunity&subject_id=${OPP}`);
        expect(res.status).toBe(200);
        const s = subjectsOf(res);
        expect(s.some((x) => ["child", "household", "person"].includes(x.subject.subject_type))).toBe(false);
        expect(rows(await work()).some((x) => ["child", "household", "person"].includes(x.subject_type))).toBe(false);
    });

    it("another organization's record is not found; a no-documents role is refused", async () => {
        as(P.otherOrgAdmin);
        expect((await readiness(`subject_type=household&subject_id=${H}`)).status).toBe(404);
        expect(rows(await work()).some((x) => x.subject_id === H || x.subject_id === C1)).toBe(false);
        as(P.noDocs);
        expect((await readiness(`subject_type=household&subject_id=${H}`)).status).toBe(403);
        expect((await work()).status).toBe(403);
    });
});

// ── D6.3 waivers ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("waivers: Documents-owned, governed, audited, revocable", () => {
    const grant = (body: Record<string, unknown>) => invokeRoute(waiversPOST, json("POST", body));

    it("grant → waived (work disappears) → revoke → missing again; both audited first; history kept", async () => {
        as(P.admin);
        const g = await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: "Medical exemption letter on file" });
        expect(g.status).toBe(200);
        const waiverId = (g.body as { waiver_id: string }).waiver_id;
        expect(audits("document_requirement_waiver_granted")).toHaveLength(1);
        expect(stateOf(subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`)), R_IMM.id, C1)).toBe("waived");
        expect(rows(await work()).some((r) => r.requirement_id === R_IMM.id && r.subject_id === C1)).toBe(false);
        // The waiver touched no document.
        expect(db.rows("documents").every((d) => d.status !== "waived")).toBe(true);

        const rv = await invokeRoute(waiverPATCH, json("PATCH", { action: "revoke", reason: "Exemption expired" }), routeParams({ id: waiverId }));
        expect(rv.status).toBe(200);
        expect(audits("document_requirement_waiver_revoked")).toHaveLength(1);
        expect(stateOf(subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`)), R_IMM.id, C1)).toBe("missing");
        const hist = await invokeRoute(waiversGET, buildRequest({ path: `/x?subject_type=child&subject_id=${C1}` }));
        expect((hist.body as { waivers: Array<{ state: string }> }).waivers.map((w) => w.state)).toEqual(["revoked"]);
    });

    it("an unsupported waiver (policy does not allow waivers) is refused by the database, after the attempt is audited", async () => {
        as(P.admin);
        const g = await grant({ requirement_id: R_CONTRACT.id, subject_type: "household", subject_id: H, reason: "Please waive" });
        expect(g.status).toBe(409);
        expect((g.body as { code: string }).code).toBe("NOT_WAIVABLE");
        expect(db.rows("document_requirement_waivers")).toHaveLength(0);
        expect(audits("document_requirement_waiver_granted")).toHaveLength(1);
    });

    it("refusals: no capability 403; not cleared for the class 403; out-of-scope or foreign subject 404; no reason 400", async () => {
        as(P.ops);
        expect((await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: "ops try" })).status).toBe(403);
        as(P.adminNoHealth);
        const sens = await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: "no clearance" });
        expect([sens.status, (sens.body as { code: string }).code]).toEqual([403, "SENSITIVE_REQUIREMENT"]);
        as(P.scoped);
        expect((await grant({ requirement_id: R_CUSTODY.id, subject_type: "child", subject_id: C1, reason: "scoped" })).status).toBe(404);
        as(P.admin);
        expect((await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C_OTHER_ORG, reason: "foreign" })).status).toBe(404);
        expect((await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: " " })).status).toBe(400);
        as(P.otherOrgAdmin);
        expect((await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: "cross org" })).status).toBe(404);
        expect(db.rows("document_requirement_waivers")).toHaveLength(0);
        // Capability, clearance, scope and reason are refused before the database; a foreign subject and another
        // organization's requirement are refused BY the database (document_subject_resolves / org-bound lookup).
        expect(rpcCalls.filter((c) => c.name === "document_requirement_waiver_grant").map((c) => [c.args.p_org_id, c.args.p_subject_id])).toEqual([
            [ORG, C_OTHER_ORG],
            [OTHER_ORG, C1],
        ]);
    });

    it("revocation: another organization 404; not cleared 403; revoking twice 409", async () => {
        as(P.admin);
        const waiverId = ((await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: "Exempt" })).body as { waiver_id: string }).waiver_id;
        as(P.otherOrgAdmin);
        expect((await invokeRoute(waiverPATCH, json("PATCH", { action: "revoke", reason: "foreign" }), routeParams({ id: waiverId }))).status).toBe(404);
        as(P.adminNoHealth);
        expect((await invokeRoute(waiverPATCH, json("PATCH", { action: "revoke", reason: "no clearance" }), routeParams({ id: waiverId }))).status).toBe(403);
        as(P.admin);
        expect((await invokeRoute(waiverPATCH, json("PATCH", { action: "revoke", reason: "done" }), routeParams({ id: waiverId }))).status).toBe(200);
        const again = await invokeRoute(waiverPATCH, json("PATCH", { action: "revoke", reason: "again" }), routeParams({ id: waiverId }));
        expect([again.status, (again.body as { code: string }).code]).toEqual([409, "WAIVER_NOT_ACTIVE"]);
    });

    it("the waiver history hides waivers of requirements the actor is not cleared for", async () => {
        as(P.admin);
        await grant({ requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: "Exempt" });
        await grant({ requirement_id: R_CUSTODY.id, subject_type: "child", subject_id: C1, reason: "Court order pending" });
        as(P.readerNoHealth);
        const hist = await invokeRoute(waiversGET, buildRequest({ path: `/x?subject_type=child&subject_id=${C1}` }));
        expect((hist.body as { waivers: Array<{ requirement_id: string }> }).waivers.map((w) => w.requirement_id)).toEqual([R_CUSTODY.id]);
    });
});

// ── D6.6 Business Process consumption ───────────────────────────────────────────────────────────────────────────
describe("Business Process asks Documents", () => {
    it("a live requirement's evaluation (waivers included) answers for its type; otherwise the stage requirement is evaluated by the same evaluator", async () => {
        const answer = await evaluateDocumentTypeRequirementsForChild(db as never, { orgId: ORG, childId: C1, typeKeys: ["custody_order", "immunization_record", "enrollment_contract"], today: "2026-10-27" });
        expect(answer).not.toBeNull();
        expect(answer!.get("custody_order")).toMatchObject({ requirement_id: R_CUSTODY.id, state: "pending_review" });
        expect(answer!.get("immunization_record")).toMatchObject({ requirement_id: R_IMM.id, state: "missing" });
        // No live child requirement for the household contract type: evaluated as the stage's own requirement, and the
        // type does not accept a child, so it is blocked by configuration rather than silently satisfied.
        expect(answer!.get("enrollment_contract")).toMatchObject({ requirement_id: "stage:enrollment_contract", state: "blocked", blocked_reason: "type_subject_not_accepted" });

        db.seed("document_requirement_waivers", [{ id: "w-bp", org_id: ORG, requirement_id: R_IMM.id, requirement_version_id: R_IMM.v, subject_type: "child", subject_id: C1, reason: "Exempt", state: "active", effective_until: null }]);
        const after = await evaluateDocumentTypeRequirementsForChild(db as never, { orgId: ORG, childId: C1, typeKeys: ["immunization_record"], today: "2026-10-27" });
        expect(after!.get("immunization_record")).toMatchObject({ state: "waived", waiver_id: "w-bp" });
    });
});

// ── review: uploaded-but-unaccepted evidence becomes evidence, or is blocked ─────────────────────────────────────
describe("reviewing the current version (pending review → satisfied / blocked)", () => {
    const review = (docId: string, body: Record<string, unknown>) => invokeRoute(reviewPOST, json("POST", body), routeParams({ id: docId }));

    it("accepting moves the requirement pending review → satisfied (work disappears); audited first", async () => {
        as(P.ops);
        expect(stateOf(subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`)), R_CUSTODY.id, C1)).toBe("pending_review");
        const r = await review(DOC.custodyPending, { decision: "accepted" });
        expect(r.status).toBe(200);
        expect(audits("document_version_reviewed")).toHaveLength(1);
        expect((audits("document_version_reviewed")[0].payload as { from: string; to: string })).toMatchObject({ from: "pending", to: "accepted" });
        expect(stateOf(subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`)), R_CUSTODY.id, C1)).toBe("satisfied");
        expect(rows(await work()).some((x) => x.requirement_id === R_CUSTODY.id && x.subject_id === C1)).toBe(false);
    });

    it("rejecting needs a reason and blocks the requirement until a new document arrives", async () => {
        as(P.ops);
        expect((await review(DOC.custodyPending, { decision: "rejected" })).status).toBe(400);
        expect((await review(DOC.custodyPending, { decision: "rejected", reason: "Illegible scan" })).status).toBe(200);
        const s = subjectsOf(await readiness(`subject_type=child&subject_id=${C1}`));
        expect(s.flatMap((x) => x.requirements).find((e) => e.requirement_id === R_CUSTODY.id)).toMatchObject({ state: "blocked", blocked_reason: "evidence_rejected" });
    });

    it("refusals: no write 403; a quarantined document cannot be reviewed; not the current version 409; another organization 404", async () => {
        as(P.readerNoHealth);
        expect((await review(DOC.custodyPending, { decision: "accepted" })).status).toBe(403);
        as(P.ops);
        expect([403, 404]).toContain((await review(DOC.custodyQuarantined, { decision: "accepted" })).status);
        expect((await review(DOC.custodyPending, { decision: "accepted", version_id: "not-the-current-one" })).status).toBe(409);
        // A writer in another organization reaches the access decision and gets the non-disclosing 404.
        as({ ...P.otherOrgAdmin, permissionKeys: [...P.otherOrgAdmin.permissionKeys, "documents.write"] });
        expect((await review(DOC.custodyPending, { decision: "accepted" })).status).toBe(404);
        expect(db.rows("document_versions").find((v) => v.id === `v-${DOC.custodyQuarantined}`)!.review_status).toBeNull();
        expect(db.rows("document_versions").find((v) => v.id === `v-${DOC.custodyPending}`)!.review_status).toBe("pending");
        expect(audits("document_version_reviewed")).toHaveLength(0);
    });

    it("a reviewer without clearance for the document's class is refused (sensitivity is enforced)", async () => {
        db.rows("document_versions").find((v) => v.id === `v-${DOC.immRejected}`)!.review_status = "pending";
        as({ ...P.ops, permissionKeys: ["portal.access", "documents.read", "documents.write"] });
        expect((await review(DOC.immRejected, { decision: "accepted" })).status).toBe(403);
        expect(db.rows("document_versions").find((v) => v.id === `v-${DOC.immRejected}`)!.review_status).toBe("pending");
    });
});

// ── teardown: only an archived QA fixture requirement is purged ──────────────────────────────────────────────────
describe("the QA fixture purge (zero-residue teardown) never reaches a real requirement", () => {
    it("an archived qa_ requirement is purged with its versions and waivers, audited as purge_fixture", async () => {
        as(P.admin);
        db.rows("document_requirements").find((r) => r.id === R_IMM.id)!.key = "qa_d6_run_immunizations";
        await invokeRoute(waiversPOST, json("POST", { requirement_id: R_IMM.id, subject_type: "child", subject_id: C1, reason: "Fixture waiver" }));
        db.rows("document_requirements").find((r) => r.id === R_IMM.id)!.status = "archived";
        const res = await invokeRoute(reqDELETE, json("DELETE"), routeParams({ id: R_IMM.id }));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ purged: true, versions: 1, waivers: 1 });
        expect(db.rows("document_requirements").some((r) => r.id === R_IMM.id)).toBe(false);
        expect(db.rows("document_requirement_waivers")).toHaveLength(0);
        expect((audits("document_requirement_changed").at(-1)!.payload as { action: string }).action).toBe("purge_fixture");
    });
    it("a real (non-qa_) or still-active requirement is never purged; the purge function is not called", async () => {
        as(P.admin);
        db.rows("document_requirements").find((r) => r.id === R_IMM.id)!.status = "archived"; // real key, archived
        await invokeRoute(reqDELETE, json("DELETE"), routeParams({ id: R_IMM.id }));
        db.rows("document_requirements").find((r) => r.id === R_CUSTODY.id)!.key = "qa_d6_active"; // fixture key, still active
        await invokeRoute(reqDELETE, json("DELETE"), routeParams({ id: R_CUSTODY.id }));
        expect(rpcCalls.filter((c) => c.name === "document_requirement_purge")).toHaveLength(0);
    });
    it("ops cannot purge", async () => {
        as(P.ops);
        expect((await invokeRoute(reqDELETE, json("DELETE"), routeParams({ id: R_IMM.id }))).status).toBe(403);
    });
});
