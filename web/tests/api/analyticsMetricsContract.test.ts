import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contract tests for the migrated Analytics Metrics API family (Phase 2B).
 *
 * Every route emits the standard envelope:
 *   success → { ok: true, data, correlation_id }
 *   failure → { ok: false, error: { code, message, details? }, correlation_id }
 *
 * Auth-gate responses remain owned by the shared analytics admin gate.
 * @see docs/api/api-response-contract.md
 * @see docs/api/api-contract-migration-status.md
 */

// --- shared mocks -----------------------------------------------------------
function makeQuery(result: { data: unknown; error: unknown }) {
    const proxy: unknown = new Proxy(function () {}, {
        get(_t, prop) {
            if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
            return () => proxy;
        },
        apply() {
            return proxy;
        },
    });
    return proxy;
}

let insertResult: { data: unknown; error: unknown } = { data: { id: "m-1", status: "draft" }, error: null };
const supabaseStub = { from: () => makeQuery(insertResult) };

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => supabaseStub) }));
vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(async () => ({ ok: true, orgId: "org-1", userId: "user-1", role: "admin" })),
    adminContextFailureResponse: vi.fn(() => new Response(JSON.stringify({ error: "auth" }), { status: 401 })),
}));
vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/admin/accessScope", () => ({ scopeDimensionsFromAccess: vi.fn(() => ({})) }));

vi.mock("@/lib/metrics/platform/metricDefinitionSchema", () => ({
    validateMetricDefinitionCreate: vi.fn((b: unknown) => b),
    validateMetricDefinitionUpdate: vi.fn((b: unknown) => b),
}));
vi.mock("@/lib/metrics/platform/metricSourceRegistry", () => ({
    validateSourceAggregation: vi.fn(),
    validateSourceFilters: vi.fn(),
    validateSourceDimensions: vi.fn(),
    listMetricSourceAdapters: vi.fn(() => [{ key: "adapter-1" }]),
}));
vi.mock("@/lib/metrics/platform/placementResolver", () => ({
    loadMetricDefinitionsForOrg: vi.fn(async () => [{ id: "m-1" }]),
    loadMetricDefinitionById: vi.fn(async () => ({ id: "m-1", org_id: "org-1", source_key: "s", aggregation: "sum" })),
}));
vi.mock("@/lib/metrics/platform/copyTemplate", () => ({
    copyGlobalMetricToOrg: vi.fn(async () => ({ item: { id: "m-copy" }, copied: true, error: null })),
}));
vi.mock("@/lib/metrics/platform/metricEvaluator", () => ({
    evaluateMetricDefinition: vi.fn(async () => ({ value: 42 })),
}));

import { POST as metricsPOST } from "@/app/api/admin/analytics/metrics/route";
import { GET as metricGET, PATCH as metricPATCH } from "@/app/api/admin/analytics/metrics/[id]/route";
import { POST as copyPOST } from "@/app/api/admin/analytics/metrics/[id]/copy/route";
import { POST as previewPOST } from "@/app/api/admin/analytics/metrics/[id]/preview/route";
import { CORRELATION_ID_HEADER } from "@/lib/api/correlationId";
import { validateMetricDefinitionCreate } from "@/lib/metrics/platform/metricDefinitionSchema";
import { loadMetricDefinitionById } from "@/lib/metrics/platform/placementResolver";
import { copyGlobalMetricToOrg } from "@/lib/metrics/platform/copyTemplate";

function jsonReq(body: unknown, headers?: Record<string, string>) {
    const url = "https://alloy.test/api";
    if (typeof body === "string") {
        return new Request(url, { method: "POST", body, headers }) as never;
    }
    return new Request(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...(headers ?? {}) },
    }) as never;
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    insertResult = { data: { id: "m-1", status: "draft" }, error: null };
});

describe("POST /api/admin/analytics/metrics", () => {
    it("returns 201 with ok:true, data.item, correlation id", async () => {
        const res = await metricsPOST(jsonReq({ key: "k", label: "L", source_type: "t", source_key: "s", aggregation: "sum" }));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.item.id).toBe("m-1");
        expect(typeof body.correlation_id).toBe("string");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(body.correlation_id);
    });

    it("returns BAD_REQUEST envelope for invalid JSON", async () => {
        const res = await metricsPOST(jsonReq("{not json"));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message).toBe("Invalid JSON");
    });

    it("returns VALIDATION_ERROR envelope (with real message) when validation throws", async () => {
        vi.mocked(validateMetricDefinitionCreate).mockImplementationOnce(() => {
            throw new Error("key is required");
        });
        const res = await metricsPOST(jsonReq({}));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.message).toBe("key is required");
        expect(typeof body.error).toBe("object"); // never a bare string
    });

    it("maps a database error to a BAD_REQUEST envelope", async () => {
        insertResult = { data: null, error: { message: "duplicate key" } };
        const res = await metricsPOST(jsonReq({ key: "k", label: "L", source_type: "t", source_key: "s", aggregation: "sum" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message).toBe("duplicate key");
    });
});

describe("GET/PATCH /api/admin/analytics/metrics/[id]", () => {
    it("GET returns NOT_FOUND envelope when missing", async () => {
        vi.mocked(loadMetricDefinitionById).mockResolvedValueOnce(null as never);
        const res = await metricGET(jsonReq({}) , params("missing"));
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("NOT_FOUND");
        expect(typeof body.correlation_id).toBe("string");
    });

    it("GET returns ok:true with data.item on success", async () => {
        const res = await metricGET(jsonReq({}), params("m-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.item.id).toBe("m-1");
    });

    it("PATCH returns FORBIDDEN envelope for a global template (org_id null)", async () => {
        vi.mocked(loadMetricDefinitionById).mockResolvedValueOnce({ id: "g-1", org_id: null } as never);
        const res = await metricPATCH(jsonReq({ label: "x" }), params("g-1"));
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("FORBIDDEN");
    });

    it("PATCH returns NOT_FOUND envelope when missing", async () => {
        vi.mocked(loadMetricDefinitionById).mockResolvedValueOnce(null as never);
        const res = await metricPATCH(jsonReq({ label: "x" }), params("missing"));
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.code).toBe("NOT_FOUND");
    });
});

describe("POST /api/admin/analytics/metrics/[id]/{copy,preview}", () => {
    it("copy returns ok:true with data.item + copied", async () => {
        const res = await copyPOST(jsonReq({}), params("m-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.item.id).toBe("m-copy");
        expect(body.data.copied).toBe(true);
    });

    it("copy returns BAD_REQUEST envelope when the copy fails with no item", async () => {
        vi.mocked(copyGlobalMetricToOrg).mockResolvedValueOnce({ item: null, copied: false, error: "cannot copy" } as never);
        const res = await copyPOST(jsonReq({}), params("m-1"));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message).toBe("cannot copy");
    });

    it("preview returns ok:true with data.evaluation", async () => {
        const res = await previewPOST(jsonReq({ site_id: "site-1" }), params("m-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.evaluation.value).toBe(42);
    });

    it("preview returns NOT_FOUND envelope when missing", async () => {
        vi.mocked(loadMetricDefinitionById).mockResolvedValueOnce(null as never);
        const res = await previewPOST(jsonReq({}), params("missing"));
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.code).toBe("NOT_FOUND");
    });
});
