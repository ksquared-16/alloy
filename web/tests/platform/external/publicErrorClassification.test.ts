/**
 * The coarse class attached to every public refusal, driven through the real route.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * A documentation reconciliation measured deployed staging and found 404 answering with
 * `type: "invalid_request"`. The OpenAPI enum already declared `not_found` and the Technical
 * Specification already documented 404 as `not_found`; the runtime was the stale side, and
 * `not_found` was dead on the public surface — declared, documented, never emitted.
 *
 * It was not catchable by reading either side alone. The status was right, the code was right, the
 * message was right; only the class was wrong, and the class is what a client switches on when it
 * decides whether to fix its request or stop asking. So the mapping is asserted here THROUGH
 * `externalOperationRoute` rather than against a copy of its table — a test that re-implemented the
 * ternary would have passed against the bug.
 *
 * The 404 cases also carry a security property: "no such resource" and "real, but outside your
 * authority" must be one answer, because a caller who can read the difference can enumerate what
 * exists. That indistinguishability is asserted on the whole envelope, not just the status.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OperationRefusal } from "@/lib/platform/external/operationRoute";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));

vi.mock("@/lib/platform/external/apiActivity", () => ({
    outcomeForStatus: () => "refused",
    recordApiActivity: async () => undefined,
}));

vi.mock("@/lib/platform/external/rateLimit", () => ({
    authenticatedRateLimit: () => ({ bucketKey: "k", policy: { limit: 120, windowSeconds: 60 } }),
    consumeRateLimit: async () => ({ allowed: true, limit: 120, remaining: 119, resetSeconds: 60 }),
}));

vi.mock("@/lib/platform/principal/attendanceAuthorityAdapter", () => ({
    resolveBoundarySites: async () => ({ ok: true, siteIds: ["site-1"] }),
}));

/** A principal that holds every scope, so scope is never what refuses in these cases. */
vi.mock("@/lib/platform/external/externalRequest", () => ({
    requireExternalPrincipal: async () => ({
        ok: true,
        context: {
            organizationId: "org-1",
            applicationId: "app-1",
            installationId: "inst-1",
            tokenId: "tok-1",
            principal: {
                applicationSlug: "test-app",
                boundary: { mode: "locations", locationIds: ["site-1"] },
                grantedScopes: ["enrollment.write", "schedule.write"],
            },
        },
    }),
}));

vi.mock("@/lib/platform/external/scopeCatalog", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/platform/external/scopeCatalog")>();
    return { ...actual, requireOperationScope: () => ({ ok: true }) };
});

const { externalOperationRoute, TYPE_FOR_STATUS } = await import("@/lib/platform/external/operationRoute");

type Envelope = {
    status: number;
    type?: string;
    code?: string;
    message?: string;
    requestId?: string;
};

/** Drive the real route with a `perform` that refuses, or throws, in one specific way. */
async function refuse(
    perform: (body: Record<string, unknown>) => Promise<{ ok: false; error: OperationRefusal }> | never,
): Promise<Envelope> {
    const POST = externalOperationRoute({
        route: "/api/v1/placements/move",
        operationId: "movePlacement",
        subject: "The placement",
        perform: perform as never,
    });
    const response = await POST(
        new NextRequest("https://example.test/api/v1/placements/move", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer t" },
            body: JSON.stringify({ enrollment_id: "e" }),
        }),
    );
    const body = (await response.json()) as { error?: Record<string, string> };
    return {
        status: response.status,
        type: body.error?.type,
        code: body.error?.code,
        message: body.error?.message,
        requestId: body.error?.request_id,
    };
}

/** The one refusal the shared resolver returns for anything a caller cannot reach. */
const OUTSIDE: OperationRefusal = {
    code: "not_found",
    message: "No such resource is available to this installation.",
    status: 404,
};

/** A canonical service raising a domain error, which reaches the route by throwing. */
const thrown = (code: string, message: string) => () => {
    throw Object.assign(new Error(message), { code, message });
};

describe("a public 404 is classified as not_found", () => {
    beforeEach(() => vi.clearAllMocks());

    it("answers an unknown resource with 404 not_found/not_found", async () => {
        const e = await refuse(async () => ({ ok: false, error: OUTSIDE }));
        expect(e.status).toBe(404);
        expect(e.type).toBe("not_found");
        expect(e.code).toBe("not_found");
    });

    it("answers a real resource outside the installation's authority the same way", async () => {
        // The resolver cannot tell the route which of the two it was, and that is the point: it
        // returns one refusal for both, so there is nothing here for the route to leak.
        const e = await refuse(async () => ({ ok: false, error: { ...OUTSIDE } }));
        expect(e.status).toBe(404);
        expect(e.type).toBe("not_found");
        expect(e.code).toBe("not_found");
    });

    it("keeps the two indistinguishable across the WHOLE envelope", async () => {
        const unknown = await refuse(async () => ({ ok: false, error: OUTSIDE }));
        const outside = await refuse(async () => ({ ok: false, error: { ...OUTSIDE } }));
        const comparable = (e: Envelope) => ({ ...e, requestId: undefined });
        expect(comparable(unknown)).toEqual(comparable(outside));
        expect(unknown.message).toBe("No such resource is available to this installation.");
        expect(unknown.message, "the message must not say which of the two it was")
            .not.toMatch(/exist|boundary|authoriz|another organization|outside/i);
    });

    it("classifies a THROWN domain not_found the same as a returned one", async () => {
        // Two branches reach a refusal — a returned one and a thrown canonical error — and both
        // mapped 404 to `invalid_request` before this was centralized.
        const e = await refuse(thrown("not_found", "No such resource is available to this installation."));
        expect(e.status).toBe(404);
        expect(e.type).toBe("not_found");
    });

    it("still carries a request id, as every public error does", async () => {
        const e = await refuse(async () => ({ ok: false, error: OUTSIDE }));
        expect(e.requestId).toBeTruthy();
    });
});

describe("repairing 404 changed nothing else", () => {
    it("malformed input remains 400 invalid_request", async () => {
        const e = await refuse(async () => ({
            ok: false,
            error: { code: "invalid_input", message: "enrollment_id is required.", status: 400 },
        }));
        expect([e.status, e.type]).toEqual([400, "invalid_request"]);
    });

    it("a refusal with no status at all is still a 400 invalid_request", async () => {
        const e = await refuse(async () => ({ ok: false, error: { code: "invalid_input", message: "x" } }));
        expect([e.status, e.type]).toEqual([400, "invalid_request"]);
    });

    it("a boundary refusal remains 403 forbidden_scope", async () => {
        const e = await refuse(async () => ({
            ok: false,
            error: { code: "outside_boundary", message: "Not authorized here.", status: 403 },
        }));
        expect([e.status, e.type]).toEqual([403, "forbidden_scope"]);
    });

    it("a lifecycle conflict remains 409 conflict", async () => {
        const e = await refuse(async () => ({
            ok: false,
            error: { code: "invalid_state", message: "It has already ended.", status: 409 },
        }));
        expect([e.status, e.type]).toEqual([409, "conflict"]);
        const throwing = await refuse(thrown("invalid_state", "It has already ended."));
        expect([throwing.status, throwing.type]).toEqual([409, "conflict"]);
    });

    it("semantic validation remains 422 invalid_request with code validation_failed", async () => {
        /*
         * MEASURED on deployed staging before the 404 repair, across three paths: 422 carries
         * `type: invalid_request` and `code: validation_failed`. 422 is the caller's values to
         * correct, so `invalid_request` is right; the code is what separates it from a 400.
         */
        const e = await refuse(thrown("validation_failed", "new start_date must be after prior placement start"));
        expect(e.status).toBe(422);
        expect(e.type).toBe("invalid_request");
        expect(e.code).toBe("validation_failed");
    });

    it("an unrecognised throw remains a 500 that discloses nothing", async () => {
        const e = await refuse(() => {
            throw new Error('duplicate key value violates unique constraint "child_placements_pkey"');
        });
        expect([e.status, e.type]).toEqual([500, "internal_error"]);
        expect(e.message).not.toMatch(/constraint|child_placements|duplicate/i);
    });
});


/**
 * The three sides of the error contract must agree: the runtime's table, the published enum, and the
 * specification's prose. Each was individually plausible while 404 disagreed across all three.
 */
describe("the runtime, the schema and the specification agree on every class", () => {
    const REPO = resolve(__dirname, "../../../..");
    const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
    const OPENAPI = "docs/api/openapi/alloy-public-api.v1.json";
    const SPEC = "docs/api/developer-platform/external/alloy-developer-platform-specification.md";

    const enumValues: string[] = JSON.parse(read(OPENAPI))
        .components.schemas.Error.properties.error.properties.type.enum;

    /** The specification's `| status | type | ... |` rows. */
    const documented = new Map(
        [...read(SPEC).matchAll(/^\|\s*(\d{3})\s*\|\s*`([a-z_]+)`\s*\|/gm)].map(
            ([, status, type]) => [Number(status), type] as const,
        ),
    );

    it("finds both sources, so nothing below is vacuous", () => {
        expect(enumValues.length).toBeGreaterThanOrEqual(8);
        expect(documented.size).toBeGreaterThanOrEqual(7);
        expect(Object.keys(TYPE_FOR_STATUS).length).toBeGreaterThanOrEqual(5);
    });

    it("every class the route can emit is declared in the schema", () => {
        for (const [status, type] of Object.entries(TYPE_FOR_STATUS)) {
            expect(enumValues, `HTTP ${status} emits \`${type}\`, which the Error.type enum omits`)
                .toContain(type);
        }
    });

    it("the specification names the class the runtime actually emits, status by status", () => {
        // This is the assertion that was missing. 404 was documented `not_found`, emitted
        // `invalid_request`, and both sides read correctly on their own.
        for (const [status, type] of Object.entries(TYPE_FOR_STATUS)) {
            const row = documented.get(Number(status));
            if (!row) continue;
            expect(row, `the specification documents HTTP ${status} as \`${row}\`, the runtime emits \`${type}\``)
                .toBe(type);
        }
    });

    it("not_found is no longer a declared class that nothing emits", () => {
        expect(Object.values(TYPE_FOR_STATUS)).toContain("not_found");
        expect(TYPE_FOR_STATUS[404]).toBe("not_found");
    });
});
