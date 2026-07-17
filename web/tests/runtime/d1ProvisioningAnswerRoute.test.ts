/**
 * D1 ENTRY RESOURCE — route-level canonical slug resolution.
 *
 * The staging defect: `/workspace/work-unit/all-leads` returned "no work unit all-leads in this
 * tenant". Root cause — the route handed D1's composer the operator's RAW slug, and D1 internally
 * maps a slug to a work-unit KEY only by hyphen→underscore (`workUnitRouteSlugToKey`). That resolves
 * a work-unit key ("new-leads"→"new_leads") but NOT a Work View slug whose route key does not
 * coincidentally equal a unit key ("all-leads" has no unit keyed "all_leads"). The view is hosted on
 * the pipeline unit; without resolving the HOST, the answer was an honest — but wrong — "not found".
 *
 * These proofs pin the fix at the ROUTE seam (D1 composition is unchanged). The canonical resolver
 * runs for real; only the DB fetch and the composer are stubbed, and BOTH stubs are HONEST — the
 * fetch returns the tenant's real candidate rows, the composer answers ONLY for the key it is given,
 * so a route that fails to resolve the host is caught, never masked.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

const ORG = "00000000-0000-4000-8000-000000000001";

/** The tenant's real shape: ONE pipeline host unit, several configured Work Views on its department. */
const PIPELINE_WU = {
    id: "wu-pipeline",
    department_id: "dept-enroll",
    key: "enrollment_pipeline",
    name: "Enrollment Pipeline",
    queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
    sort_order: 0,
    is_active: true,
};

const DEPT_ENROLL = {
    id: "dept-enroll",
    key: "enrollment",
    name: "Enrollment",
    metadata: {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "lead_management",
                    name: "Lead Management",
                    is_active: true,
                    stages: [],
                    work_views_v1: [
                        { id: "new_leads", label: "New Leads", compat_queue_key: "new_leads", display_order: 1 },
                        // "all_leads" is a pure Work View — its route slug "all-leads" matches NO unit key.
                        { id: "all_leads", label: "All Leads", display_order: 2 },
                    ],
                },
            ],
        },
    },
};

const { gateSpy, composeSpy, fetchWorkUnitsSpy, fetchDeptsSpy } = vi.hoisted(() => ({
    gateSpy: vi.fn(),
    composeSpy: vi.fn(),
    fetchWorkUnitsSpy: vi.fn(),
    fetchDeptsSpy: vi.fn(),
}));

vi.mock("@/lib/admin/adminRouteGate", () => ({
    loadAdminRouteGate: gateSpy,
    adminRouteGateFailureResponse: () => new Response("forbidden", { status: 403 }),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    // Never consulted directly here — the fetch helpers own every read and are stubbed below.
    createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/admin/fetchWorkUnitsForSlugResolution", () => ({
    fetchWorkUnitsForSlugResolution: fetchWorkUnitsSpy,
    fetchDepartmentsForSlugResolution: fetchDeptsSpy,
}));

vi.mock("@/lib/runtime/provisioning/workUnitProvisioningAnswer", () => ({
    composeWorkUnitProvisioningAnswer: composeSpy,
}));

// The canonical resolver (`@/lib/admin/resolveWorkUnitByRouteSlug`) and the slug→key mapper
// (`@/lib/admin/workUnitRouteSlug`) are NOT mocked — they are the logic under test.
import { GET } from "@/app/api/admin/work-units/[id]/provisioning-answer/route";

/** HONEST composer: an answer ONLY for the host unit's real key. Any other key is a truthful error. */
function honestCompose() {
    return composeSpy.mockImplementation(
        async (args: { workUnitSlug: string; requestedWorkViewId: string | null }) => {
            if (args.workUnitSlug === "enrollment_pipeline") {
                return { terminal: "operational", activeWorkView: { id: args.requestedWorkViewId, label: "" }, rows: [] };
            }
            return { terminal: "error", code: "work_unit_not_found" };
        },
    );
}

/** HONEST fetch: the tenant's candidate rows (mirrors the real direct / org_scan strategies). */
function honestFetch() {
    fetchWorkUnitsSpy.mockImplementation(async ({ platformKey }: { platformKey: string }) => ({
        rows: platformKey === "enrollment_pipeline" ? [PIPELINE_WU] : [PIPELINE_WU],
        strategy: platformKey === "enrollment_pipeline" ? "direct" : "org_scan",
    }));
    fetchDeptsSpy.mockImplementation(async () => [DEPT_ENROLL]);
}

const call = (slug: string, query = "") =>
    GET(new NextRequest(`http://localhost/api/admin/work-units/${slug}/provisioning-answer${query}`), {
        params: Promise.resolve({ id: slug }),
    });

describe("GET provisioning-answer — canonical route slug resolution", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gateSpy.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: "user-1",
            dim: { departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null },
        });
        honestCompose();
        honestFetch();
    });

    it("resolves a Work View slug (≠ any unit key) to its HOST unit + active view", async () => {
        // This is the staging defect, reproduced: "all-leads" is a view slug, not a unit key.
        const res = await call("all-leads");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.terminal).toBe("operational");
        // D1 received the HOST unit's key and the view as the active lens — never the raw slug.
        expect(composeSpy).toHaveBeenCalledTimes(1);
        const arg = composeSpy.mock.calls[0][0];
        expect(arg.workUnitSlug).toBe("enrollment_pipeline");
        expect(arg.requestedWorkViewId).toBe("all_leads");
    });

    it("an unknown slug is passed through UNCHANGED — D1 emits the honest error (no guessing)", async () => {
        const res = await call("does-not-exist");
        expect(res.status).toBe(200);
        const body = await res.json();
        // The route never fabricates or substitutes a unit: the composer sees the raw slug and refuses.
        expect(body.terminal).toBe("error");
        expect(body.code).toBe("work_unit_not_found");
        expect(composeSpy.mock.calls[0][0].workUnitSlug).toBe("does-not-exist");
    });

    it("a direct work-unit key slug still resolves (hyphen→underscore regression)", async () => {
        const res = await call("enrollment-pipeline");
        const body = await res.json();
        expect(body.terminal).toBe("operational");
        expect(composeSpy.mock.calls[0][0].workUnitSlug).toBe("enrollment_pipeline");
    });

    it("an explicit ?work_view_id on the URL WINS over the slug's implied view (K1 owns intent)", async () => {
        const res = await call("all-leads", "?work_view_id=new_leads");
        const body = await res.json();
        expect(body.terminal).toBe("operational");
        const arg = composeSpy.mock.calls[0][0];
        expect(arg.workUnitSlug).toBe("enrollment_pipeline");
        expect(arg.requestedWorkViewId).toBe("new_leads");
    });

    it("a resolution I/O failure NEVER fails the answer — D1 still produces a terminal", async () => {
        fetchWorkUnitsSpy.mockRejectedValueOnce(new Error("connection reset"));
        const res = await call("all-leads");
        expect(res.status).toBe(200);
        const body = await res.json();
        // Resolution threw → route falls through with the raw slug → D1 returns its own honest terminal.
        expect(composeSpy).toHaveBeenCalledTimes(1);
        expect(composeSpy.mock.calls[0][0].workUnitSlug).toBe("all-leads");
        expect(body.terminal).toBe("error");
    });

    it("subject_id rides through to D1 as the requested subject", async () => {
        await call("all-leads", "?subject_id=opp-42");
        expect(composeSpy.mock.calls[0][0].requestedSubjectId).toBe("opp-42");
    });

    it("a failed gate short-circuits before any resolution or composition", async () => {
        gateSpy.mockResolvedValueOnce({ ok: false, status: 403 });
        const res = await call("all-leads");
        expect(res.status).toBe(403);
        expect(fetchWorkUnitsSpy).not.toHaveBeenCalled();
        expect(composeSpy).not.toHaveBeenCalled();
    });
});
