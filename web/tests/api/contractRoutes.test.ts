import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contract tests for the Phase 2 migrated route slice.
 *
 * Runtime checks exercise the real handlers with mocked auth + a chainable
 * Supabase stub. Static checks assert envelope adoption + the "no bare-string
 * error body" rule for routes whose full runtime exercise needs a DB.
 *
 * @see docs/api/api-response-contract.md
 */

const WEB_ROOT = path.resolve(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// Shared mocks (apply to every route imported in this file).
// ---------------------------------------------------------------------------
function makeQuery(result: { data: unknown; error: unknown }) {
    const proxy: unknown = new Proxy(function () {}, {
        get(_t, prop) {
            if (prop === "then") {
                return (resolve: (v: unknown) => void) => resolve(result);
            }
            return () => proxy;
        },
        apply() {
            return proxy;
        },
    });
    return proxy;
}

const supabaseStub = { from: () => makeQuery({ data: [], error: null }) };

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: vi.fn(async () => null) }));
vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(async () => ({ ok: true, orgId: "org-1", userId: "user-1", role: "admin" })),
    adminContextFailureResponse: vi.fn(() => new Response(JSON.stringify({ error: "auth" }), { status: 401 })),
}));
vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/admin/accessScope", () => ({
    assertEntityDrawerRecordReadable: vi.fn(async () => false),
    scopeDimensionsFromAccess: vi.fn(() => ({})),
    assertOpportunityInAccessScope: vi.fn(async () => true),
}));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => supabaseStub) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

// preflight deps
vi.mock("@/lib/admin/actions/adminActionPreflight", () => ({
    runOpportunityActionPreflight: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/completion/evaluateEffectiveRequirements", () => ({
    effectiveRequirementsToValidationResult: vi.fn(() => ({ ok: true })),
}));
vi.mock("@/lib/completion/bosIntegration", () => ({
    toBosCompletionRequirementPayload: vi.fn(() => ({ requirements: [] })),
}));

// execute deps
vi.mock("@/lib/adminV2/actions/actionRegistry", () => ({ getRegisteredAction: vi.fn(() => null) }));
vi.mock("@/lib/adminV2/actions/actionExecutor", () => ({ runRegisteredAction: vi.fn() }));
vi.mock("@/lib/admin/actions/executeAdminAction", () => ({
    executeAdminAction: vi.fn(async () => ({
        ok: true,
        correlation_id: "exec-cid",
        execution_result: { kind: "noop" },
    })),
}));
vi.mock("@/lib/admin/actions/cacheTags", () => ({ adminActionsOrgTag: () => "tag" }));

import { POST as preflightPOST } from "@/app/api/admin/actions/preflight/route";
import { GET as inventoryGET } from "@/app/api/admin/actions/inventory/route";
import { POST as executePOST } from "@/app/api/admin/actions/execute/route";
import { GET as entityGET } from "@/app/api/admin/entity/[type]/[id]/route";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { CORRELATION_ID_HEADER } from "@/lib/api/correlationId";

type AnyReq = Parameters<typeof preflightPOST>[0];

function jsonReq(body: unknown, headers?: Record<string, string>): AnyReq {
    const url = "https://alloy.test/api";
    if (typeof body === "string") {
        return new Request(url, { method: "POST", body, headers }) as unknown as AnyReq;
    }
    return new Request(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...(headers ?? {}) },
    }) as unknown as AnyReq;
}

function getReq(headers?: Record<string, string>): AnyReq {
    return new Request("https://alloy.test/api/admin/actions/inventory", { headers }) as unknown as AnyReq;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("POST /api/admin/actions/preflight (full contract)", () => {
    it("returns ok: true with data + correlation id on success", async () => {
        const res = await preflightPOST(
            jsonReq({ action_key: "confirm_tour", entity_type: "opportunity", entity_id: "opp-1" })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data).toBeTruthy();
        expect(body.data.executable).toBe(true);
        expect(typeof body.correlation_id).toBe("string");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(body.correlation_id);
    });

    it("returns ok: false with VALIDATION_ERROR on schema failure", async () => {
        const res = await preflightPOST(jsonReq({}));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(typeof body.correlation_id).toBe("string");
    });

    it("returns BAD_REQUEST for unsupported entity type", async () => {
        const res = await preflightPOST(
            jsonReq({ action_key: "x", entity_type: "job", entity_id: "j-1" })
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("returns BAD_REQUEST (not a bare string) for invalid JSON", async () => {
        const res = await preflightPOST(jsonReq("{not json"));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(typeof body).toBe("object");
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
    });
});

describe("GET /api/admin/actions/inventory (full contract)", () => {
    it("returns ok: true with data.items on success", async () => {
        const res = await inventoryGET(getReq());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.data.items)).toBe(true);
        expect(typeof body.correlation_id).toBe("string");
    });

    it("propagates an incoming correlation id", async () => {
        const res = await inventoryGET(getReq({ [CORRELATION_ID_HEADER]: "trace-xyz" }));
        const body = await res.json();
        expect(body.correlation_id).toBe("trace-xyz");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe("trace-xyz");
    });
});

describe("POST /api/admin/actions/execute (full contract)", () => {
    it("success returns ok: true with canonical data + correlation id (no legacy top-level)", async () => {
        const res = await executePOST(
            jsonReq({ action_key: "noop_action", entity_type: "opportunity", entity_id: "opp-1" })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.execution_result).toEqual({ kind: "noop" });
        // Phase 2B: legacy top-level mirror is gone — data is the only payload location.
        expect(body.execution_result).toBeUndefined();
        expect(body.correlation_id).toBe("exec-cid");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe("exec-cid");
    });

    it("validation failure (missing fields) returns a normalized error envelope", async () => {
        const res = await executePOST(jsonReq({}));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(typeof body).toBe("object");
        expect(body).not.toBeNull();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(typeof body.error.message).toBe("string");
        // never a bare string error
        expect(typeof body.error).toBe("object");
        expect(typeof body.correlation_id).toBe("string");
    });

    it("invalid JSON returns a normalized error envelope (never a bare string)", async () => {
        const res = await executePOST(jsonReq("{not json"));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.message).toBe("Invalid JSON");
    });

    it("execution failure returns the normalized envelope with preserved status + details", async () => {
        vi.mocked(executeAdminAction).mockResolvedValueOnce({
            ok: false,
            correlation_id: "exec-cid",
            error: "Not found",
            status: 404,
            completion_requirements: { ok: false, requirements: [] } as never,
        });
        const res = await executePOST(
            jsonReq({ action_key: "noop_action", entity_type: "opportunity", entity_id: "missing" })
        );
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.ok).toBe(false);
        // carries completion context → stable ACTION_BLOCKED code
        expect(body.error.code).toBe("ACTION_BLOCKED");
        expect(body.error.message).toBe("Not found");
        expect(body.error.details.completion_requirements).toBeTruthy();
        expect(body.correlation_id).toBe("exec-cid");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe("exec-cid");
    });

    it("plain execution failure (no requirements) maps status to a stable code", async () => {
        vi.mocked(executeAdminAction).mockResolvedValueOnce({
            ok: false,
            correlation_id: "exec-cid",
            error: "Unsupported entity_type",
            status: 400,
        });
        const res = await executePOST(
            jsonReq({ action_key: "noop_action", entity_type: "opportunity", entity_id: "opp-1" })
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
        expect(body.error.details).toBeUndefined();
    });
});

describe("GET /api/admin/entity/[type]/[id] (error envelope)", () => {
    it("returns NOT_FOUND envelope (not a bare string) when record is unreadable", async () => {
        const res = await entityGET(getReq(), { params: Promise.resolve({ type: "persons", id: "missing" }) });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(typeof body).toBe("object");
        expect(body).not.toBeNull();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("NOT_FOUND");
        expect(typeof body.correlation_id).toBe("string");
    });

    it("returns BAD_REQUEST envelope for an invalid entity type", async () => {
        const res = await entityGET(getReq(), { params: Promise.resolve({ type: "bogus", id: "x" }) });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("returns the success envelope { ok, data: { entity }, correlation_id } for a new-record sentinel", async () => {
        // `persons/new` short-circuits the drawer scope gate and returns the `_create`
        // sentinel — the simplest success path that needs no DB row.
        const res = await entityGET(getReq(), { params: Promise.resolve({ type: "persons", id: "new" }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.data.entity).toEqual({ _create: true });
        expect(typeof body.correlation_id).toBe("string");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(body.correlation_id);
    });

    it("propagates an incoming correlation id on the success envelope", async () => {
        const res = await entityGET(getReq({ [CORRELATION_ID_HEADER]: "trace-entity" }), {
            params: Promise.resolve({ type: "persons", id: "new" }),
        });
        const body = await res.json();
        expect(body.correlation_id).toBe("trace-entity");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe("trace-entity");
    });
});

// ---------------------------------------------------------------------------
// Static source contract assertions (no DB needed).
// ---------------------------------------------------------------------------
describe("static contract: migrated routes", () => {
    const read = (rel: string) => readFileSync(path.join(WEB_ROOT, rel), "utf8");

    it("analytics metrics family emits the envelope via apiOk/apiError (fully migrated)", () => {
        const files = [
            "app/api/admin/analytics/metrics/route.ts",
            "app/api/admin/analytics/metrics/[id]/route.ts",
            "app/api/admin/analytics/metrics/[id]/copy/route.ts",
            "app/api/admin/analytics/metrics/[id]/preview/route.ts",
            "app/api/admin/analytics/metrics/[id]/snapshot/route.ts",
            "app/api/admin/analytics/metrics/[id]/trend/route.ts",
        ];
        for (const rel of files) {
            const src = read(rel);
            expect(src).toContain('from "@/lib/api/apiResponse"');
            expect(src).toContain("apiOk(");
            // No legacy bare `{ error: string }` bodies remain.
            expect(src).not.toMatch(/NextResponse\.json\(\s*\{\s*error:\s*"/);
        }
    });

    it("migrated error routes never serialize a bare string error body", () => {
        const files = [
            "app/api/admin/actions/preflight/route.ts",
            "app/api/admin/actions/inventory/route.ts",
            "app/api/admin/actions/execute/route.ts",
            "app/api/admin/entity/[type]/[id]/route.ts",
            "lib/admin/opportunityEntityRecord.ts",
            "app/api/admin/analytics/metrics/route.ts",
            "app/api/admin/analytics/metrics/[id]/route.ts",
        ];
        for (const rel of files) {
            const src = read(rel);
            // A bare-string error body looks like NextResponse.json("...", { status }) or
            // NextResponse.json(<expr> || "Not found", { status }). Those are all migrated.
            expect(src).not.toMatch(/NextResponse\.json\(\s*"Not found"/);
            expect(src).not.toMatch(/NextResponse\.json\([^,{)]*\|\| "Not found"/);
        }
    });

    it("entity read emits the success envelope via entityOk/apiOk (data.entity, no bare record)", () => {
        const route = read("app/api/admin/entity/[type]/[id]/route.ts");
        expect(route).toContain('from "@/lib/api/apiResponse"');
        // Success path wraps the record in { entity } via the local entityOk helper.
        expect(route).toContain("apiOk({ entity }");
        expect(route).toContain("entityOk(");
        // No success path returns a bare record via NextResponse.json anymore.
        expect(route).not.toMatch(/NextResponse\.json\(/);

        // The opportunity surfaces helper wraps every surface in the envelope too.
        const opp = read("lib/admin/opportunityEntityRecord.ts");
        expect(opp).toContain('from "@/lib/api/apiResponse"');
        expect(opp).toContain("apiOk(");
        // The `full` surface builds the envelope JSON string directly (single serialize).
        expect(opp).toContain('"ok":true,"data":{"entity":');
    });

    it("execute route emits the envelope via apiOk/apiError and no legacy { error: string } body", () => {
        const src = read("app/api/admin/actions/execute/route.ts");
        expect(src).toContain('from "@/lib/api/apiResponse"');
        expect(src).toContain("apiOk(");
        expect(src).toContain("apiError(");
        // No bare-string error responses remain.
        expect(src).not.toMatch(/NextResponse\.json\(\s*\{\s*error:\s*"/);
    });
});
