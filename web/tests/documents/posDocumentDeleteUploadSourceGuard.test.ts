/**
 * Regression for the staff delete's completed-case guard (Documents A1). Found by Documents D9-H2 (hosted runs
 * qar_77f7fabe4235 and qar_b26de1259afd): the delete accepted (200) a D9.2 escalated API upload whose Processing case was
 * completed, and the case was left without its document.
 *
 * The route read case sources only for its own ["document", "email_attachment"]; the 24 h escalation opens its case with
 * source_kind = 'upload'. The route now uses the filing model's DOCUMENT_SOURCE_KINDS, so the guard and the case removal
 * see every case a document can open. The control ('document' source) is unchanged; the 'upload' cases are refused 409
 * when completed and removed with the document when still open, the same as a 'document' source.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySupabase } from "../harness/inMemorySupabase";
import { buildRequest, invokeRoute, routeParams } from "../harness/routeInvoker";

const { mockCtx, mockAccess, dbRef } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockAccess: vi.fn(),
    dbRef: { current: null as unknown },
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockCtx, getAdminContext: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContextCached: mockAccess, getAdminAccessContext: mockAccess };
});
vi.mock("@/lib/health/healthFactCollectionResolver", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    resolveActiveHealthFacts: async () => [],
}));
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => dbRef.current,
    createServiceRoleClient: () => dbRef.current,
}));

import { DELETE as posDocDELETE } from "@/app/api/admin/pos/documents/[id]/route";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const DEPT = "d1000000-0000-4000-8000-000000000001";
const WU = "a1000000-0000-4000-8000-000000000001";
const OPP = "0b100000-0000-4000-8000-000000000001";
const USER_ID = "05e00000-0000-4000-8000-000000000001";
const DOC = "d0c00000-0000-4000-8000-0000000000e5";
const CASE = "ca5e0000-0000-4000-8000-0000000000e5";
const ADMIN = ["documents.read", "documents.write", "processing.operate", "processing.documents.manage"];

function seeded(sourceKind: "upload" | "document", caseStatus: string): InMemorySupabase {
    const db = new InMemorySupabase();
    db.seed("work_units", [{ id: WU, org_id: ORG, department_id: DEPT }]);
    db.seed("opportunities", [{ id: OPP, org_id: ORG, work_unit_id: WU, location_id: null }]);
    db.seed("documents", [{
        id: DOC, org_id: ORG, bucket: "org_documents", status: "uploaded", title: "late-filed API upload", original_filename: "u.pdf",
        doc_type: null, entity_type: "opportunity", entity_id: OPP, created_at: "2026-11-08T18:58:09Z", legal_hold: false,
        retention_until: null, storage_path: `${ORG}/api_uploads/${DOC}.pdf`,
        metadata: { source: "api_v1_upload", received_via: { kind: "api_v1", installation_id: "i" }, filing: { key: "late" } },
    }]);
    db.seed("processing_cases", [{
        id: CASE, org_id: ORG, status: caseStatus,
        metadata: { api_upload_escalation: { kind: "api_v1_unfiled_upload", document_id: DOC } },
    }]);
    db.seed("processing_case_sources", [{ org_id: ORG, processing_case_id: CASE, source_kind: sourceKind, source_id: DOC, role: "primary" }]);
    db.seed("communication_message_attachments", []);
    db.seed("child_safeguarding_restrictions", []);
    db.seed("form_submission_documents", []);
    db.seed("workflow_events", []);
    return db;
}

let db: InMemorySupabase;
function rows(name: string): Array<Record<string, unknown>> {
    return db.rows(name);
}
async function del() {
    return invokeRoute(posDocDELETE, buildRequest({ method: "DELETE", path: "/x" }), routeParams({ id: DOC }));
}

beforeEach(() => {
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, role: "admin", userId: USER_ID, permissionKeys: ADMIN });
    mockAccess.mockResolvedValue({
        ok: true, userId: USER_ID, orgId: ORG, roleKeys: ["admin"], permissionKeys: ADMIN,
        departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
    });
});

describe("staff delete: the completed-case guard", () => {
    it("control: a document whose 'document'-sourced case is completed is refused 409 and kept", async () => {
        db = seeded("document", "completed");
        dbRef.current = db;
        const r = await del();
        expect(r.status).toBe(409);
        expect(rows("documents").map((d) => d.id)).toContain(DOC);
    });

    it("an escalated API upload whose 'upload'-sourced case is completed is refused 409 and kept", async () => {
        db = seeded("upload", "completed");
        dbRef.current = db;
        const r = await del();
        expect(r.status).toBe(409);
        expect(rows("documents").map((d) => d.id)).toContain(DOC);
    });

    it("deleting an escalated upload never leaves its case without a document", async () => {
        db = seeded("upload", "completed");
        dbRef.current = db;
        await del();
        const docGone = !rows("documents").some((d) => d.id === DOC);
        const caseLeft = rows("processing_cases").some((c) => c.id === CASE);
        expect(docGone && caseLeft).toBe(false);
    });

    it("an escalated upload whose 'upload'-sourced case is still open is deleted with its case, like a 'document' source", async () => {
        db = seeded("upload", "open");
        dbRef.current = db;
        const r = await del();
        expect(r.status).toBe(200);
        expect(rows("documents").some((d) => d.id === DOC)).toBe(false);
        expect(rows("processing_cases").some((c) => c.id === CASE)).toBe(false);
        expect(rows("processing_case_sources").some((c) => c.source_id === DOC)).toBe(false);
    });
});
