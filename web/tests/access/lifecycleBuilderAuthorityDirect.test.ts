/**
 * DIRECT CERTIFICATION — Lifecycle Builder configuration mutations.
 *
 * These two handlers have no mounted QA interface of their own: they are the save path behind
 * Settings -> Business Process, driven by `BusinessProcessParticipationCard` and
 * `WorkViewsConfigurationContext`. So they are certified directly, against the real handler.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every case below asserts the DURABLE EFFECT: on success the
 * department row is actually written with the configuration payload, and on every refusal no write
 * is attempted at all. A handler that returned 403 after having already written would pass a
 * status-only test and fail these.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetAdminContext, mockGetAdminAccessContext, persistParticipation, persistWorkViews, mockFrom } =
    vi.hoisted(() => ({
        mockGetAdminContext: vi.fn(),
        mockGetAdminAccessContext: vi.fn(),
        persistParticipation: vi.fn(),
        persistWorkViews: vi.fn(),
        mockFrom: vi.fn(),
    }));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContext: mockGetAdminContext, getAdminContextCached: mockGetAdminContext };
});

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return {
        ...actual,
        getAdminAccessContext: mockGetAdminAccessContext,
        getAdminAccessContextCached: mockGetAdminAccessContext,
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ from: mockFrom }) }));

/*
 * THE DURABLE WRITE IS MOCKED AT THE SEAM THAT PERFORMS IT.
 *
 * Both handlers delegate their write to a persist helper. Asserting on those is what makes "did the
 * durable state change?" answerable exactly, rather than inferred from a status code or from a
 * hand-built Supabase double deep enough to satisfy the whole chain — which is fragile and, when it
 * breaks, fails the SUCCESS cases while every refusal still passes, i.e. certifies nothing.
 *
 * The helpers' own correctness is covered by their own suites; what is certified here is whether
 * authority lets the write be attempted at all.
 */
vi.mock("@/lib/lifecycle/persistParticipationV1", () => ({
    persistParticipationForProcessSave: persistParticipation,
}));
vi.mock("@/lib/lifecycle/persistWorkViewsV1", () => ({
    persistWorkViewsForProcessSave: persistWorkViews,
}));

import { POST as POST_PARTICIPATION } from "@/app/api/admin/lifecycle-builder/process-participation/route";
import { POST as POST_WORK_VIEWS } from "@/app/api/admin/lifecycle-builder/process-work-views/route";
import { BUSINESS_PROCESS_ACTIVATE, BUSINESS_PROCESS_CONFIGURE } from "@/lib/access/businessProcessAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const DEPT = "22222222-2222-4222-8222-222222222222";
const FOREIGN_DEPT = "33333333-3333-4333-8333-333333333333";
const PROCESS = "44444444-4444-4444-8444-444444444444";

/** The department row the handler reads before it writes. */
function departmentRow(orgId = ORG) {
    return { id: DEPT, org_id: orgId, name: "Enrollment", metadata: {} };
}

/**
 * A minimal Supabase double that RECORDS writes rather than performing them, so "did the durable
 * state change?" is answerable instead of inferred.
 */
function installClient({ row = departmentRow() as Record<string, unknown> | null } = {}) {
    persistParticipation.mockReset();
    persistWorkViews.mockReset();
    persistParticipation.mockResolvedValue({ ok: true, participation_v1: {} });
    persistWorkViews.mockResolvedValue({ ok: true, work_views_v1: [] });
    mockFrom.mockReset();
    /*
     * THE DOUBLE HONOURS `.eq()`, so tenant isolation is MEASURED rather than assumed.
     *
     * An earlier version returned the seeded row whatever was filtered, which made
     * "a foreign organization's department is unreachable" unprovable: the handler's own
     * `.eq("org_id", ctx.orgId)` had no effect, and the case passed or failed for reasons
     * unrelated to isolation. Filters are now applied to the row before it is returned.
     */
    mockFrom.mockImplementation(() => {
        const filters: Array<[string, unknown]> = [];
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        const resolve = async () => {
            if (row == null) return { data: null, error: null };
            const matches = filters.every(([col, val]) => (row as Record<string, unknown>)[col] === val);
            return { data: matches ? row : null, error: null };
        };
        Object.assign(builder, {
            select: chain,
            in: chain,
            order: chain,
            limit: chain,
            eq: (col: string, val: unknown) => {
                filters.push([col, val]);
                return builder;
            },
            maybeSingle: resolve,
            single: resolve,
        });
        return builder;
    });
}

/** Every durable write this slice's two handlers can perform. */
const wrote = () =>
    persistParticipation.mock.calls.length + persistWorkViews.mock.calls.length;

function post(handler: typeof POST_PARTICIPATION, url: string, body: unknown) {
    return handler(
        new NextRequest(`http://localhost${url}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

const CASES = [
    {
        name: "process-participation",
        handler: POST_PARTICIPATION,
        url: "/api/admin/lifecycle-builder/process-participation",
        body: {
            department_id: DEPT,
            process_id: PROCESS,
            participation_v1: { version: 1, subject_type: "child", context_type: "family", available_views: [] },
        },
    },
    {
        name: "process-work-views",
        handler: POST_WORK_VIEWS,
        url: "/api/admin/lifecycle-builder/process-work-views",
        body: { department_id: DEPT, process_id: PROCESS, work_views_v1: [] },
    },
] as const;

beforeEach(() => {
    mockGetAdminContext.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
    installClient();
});

describe.each(CASES)("$name — direct certification", ({ handler, url, body }) => {
    /*
     * THE REAL SCOPE SHAPE, NOT A GUESSED ONE.
     *
     * `scopeDimensionsFromAccess` reads `departmentScope` and `allowedDepartmentIds`. A fixture
     * carrying an invented `departmentIds` field produced a 404 on the SUCCESS cases while every
     * refusal still passed — which would have read as "the capability gate refuses everyone" and
     * certified nothing.
     */
    const access = (permissionKeys: string[], roleKeys: string[] = [], orgId = ORG) => ({
        ok: true,
        orgId,
        userId: "u1",
        permissionKeys,
        roleKeys,
        departmentScope: "selected" as const,
        allowedDepartmentIds: [DEPT],
        siteScope: "all" as const,
        allowedSiteLocationIds: [] as string[],
    });

    it("CONFIGURER succeeds AND the configuration is actually written", async () => {
        mockGetAdminAccessContext.mockResolvedValue(access([BUSINESS_PROCESS_CONFIGURE], ["bp_configurer"]));
        const res = await post(handler, url, body);
        /*
         * A 400 HERE IS A BROKEN FIXTURE, NOT A REFUSAL — said out loud, because a payload the
         * validator rejects produces a non-200 on every case and makes the refusal assertions pass
         * for the wrong reason. This suite certified nothing until the real shapes were read out of
         * parseParticipationConfigV1 and parseWorkViewsV1.
         */
        expect(res.status, `expected the configuration to be accepted; body was ${JSON.stringify(body)}`).not.toBe(400);
        expect(res.status).toBe(200);
        // The durable effect, not the status.
        expect(wrote()).toBe(1);
    });

    it("ACTIVATOR is refused AND nothing is written", async () => {
        mockGetAdminAccessContext.mockResolvedValue(access([BUSINESS_PROCESS_ACTIVATE], ["bp_activator"]));
        const res = await post(handler, url, body);
        expect(res.status).toBe(403);
        expect(wrote()).toBe(0);
    });

    it("PORTAL ONLY is refused AND nothing is written", async () => {
        mockGetAdminAccessContext.mockResolvedValue(access([], []));
        const res = await post(handler, url, body);
        expect(res.status).toBe(403);
        expect(wrote()).toBe(0);
    });

    it("TITULAR ADMIN — the label carries no authority, and nothing is written", async () => {
        mockGetAdminContext.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
        mockGetAdminAccessContext.mockResolvedValue(access([], ["admin"]));
        const res = await post(handler, url, body);
        expect(res.status).toBe(403);
        expect(wrote()).toBe(0);
    });

    it("COMPOSED holds both capabilities and succeeds", async () => {
        mockGetAdminAccessContext.mockResolvedValue(
            access([BUSINESS_PROCESS_CONFIGURE, BUSINESS_PROCESS_ACTIVATE], ["bp_both"]),
        );
        const res = await post(handler, url, body);
        expect(res.status).toBe(200);
        expect(wrote()).toBe(1);
    });

    it("SCOPE — a configurer may not edit a department outside their scope, and nothing is written", async () => {
        mockGetAdminAccessContext.mockResolvedValue({
            ...access([BUSINESS_PROCESS_CONFIGURE], ["bp_configurer"]),
            allowedDepartmentIds: [FOREIGN_DEPT],
        });
        const res = await post(handler, url, body);
        expect(res.status).toBe(404);
        expect(wrote()).toBe(0);
    });

    it("TENANT — a department this org cannot see is not found, and nothing is written", async () => {
        // The lookup is org-scoped, so a row belonging elsewhere simply is not there.
        installClient({ row: null });
        mockGetAdminAccessContext.mockResolvedValue(access([BUSINESS_PROCESS_CONFIGURE], ["bp_configurer"], ORG));
        const res = await post(handler, url, body);
        expect(res.status).toBe(404);
        expect(wrote()).toBe(0);
    });

    it("capability authority is not tenant isolation — the row belongs to another org", async () => {
        /*
         * A full Configurer, whose target department exists but belongs to ANOTHER organization.
         * The capability is satisfied and the department is in scope; only the org filter stands
         * between the caller and a foreign write. Foreign state must be unchanged.
         */
        installClient({ row: departmentRow(OTHER_ORG) });
        mockGetAdminAccessContext.mockResolvedValue(access([BUSINESS_PROCESS_CONFIGURE], ["bp_configurer"]));
        const res = await post(handler, url, body);
        expect(res.status).toBe(404);
        expect(wrote()).toBe(0);
    });
});
