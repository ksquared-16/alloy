/**
 * The API Reference describes the API that exists, and only that.
 *
 * Everything it renders is read from the governed OpenAPI document — the same one the drift guard
 * enforces against the running routes. The value of that is not tidiness: it is that this page
 * cannot document an endpoint Alloy does not serve, which is the single most expensive error an API
 * programme can ship, and it cannot quietly fall behind one that changes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { apiReference } from "@/lib/developerDocs/openApiReference";

const WEB = resolve(__dirname, "../..");
const reference = apiReference();
const byId = (id: string) => reference.operations.find((o) => o.id === id)!;

describe("the reference is exactly the implemented surface", () => {
    it("every implemented operation, named", () => {
        expect(reference.operations.map((o) => `${o.method} ${o.path}`).sort()).toEqual([
            "GET /api/v1/attendance-events",
            "GET /api/v1/children",
            "GET /api/v1/context",
            "GET /api/v1/enrollments",
            "GET /api/v1/households",
            "GET /api/v1/locations",
            "GET /api/v1/placements",
            "GET /api/v1/relationships",
            "GET /api/v1/schedule-assignments",
            "GET /api/v1/schedule-days",
            "GET /api/v1/staff",
            "POST /api/v1/attendance-events",
            "POST /api/v1/enrollments",
            "POST /api/v1/enrollments/end",
            "POST /api/v1/oauth/token",
            "POST /api/v1/placements",
            "POST /api/v1/placements/move",
            "POST /api/v1/schedule-assignments",
            "POST /api/v1/schedule-assignments/change",
        ]);
    });

    it("attendance is represented as a read and a fact submission, and nothing else", () => {
        /*
         * Slice 7.4 published the first public write, so "only a read" is no longer the invariant.
         * What must stay true is that the reference shows a partner two ways to touch attendance —
         * read the ledger, append to it — and never a way to edit or delete what is already there.
         */
        const attendance = reference.operations.filter((o) => /attendance/i.test(o.path));
        expect(attendance.map((o) => o.method).sort()).toEqual(["GET", "POST"]);
        expect(attendance.find((o) => o.method === "GET")!.requiredScope).toBe("attendance.read");
        expect(attendance.find((o) => o.method === "POST")!.requiredScope).toBe("attendance.write");
    });

    it("the page derives its content rather than restating it", () => {
        const page = readFileSync(
            resolve(WEB, "app/adminV2/settings/organization/integrations/documentation/api-reference/page.tsx"),
            "utf8",
        );
        expect(page).toContain("apiReference()");
        // No endpoint path, parameter name or status code written into the page by hand.
        expect(page).not.toContain("/api/v1/locations");
        expect(page).not.toContain("client_credentials");
        expect(page).not.toContain("updated_since");
    });
});

describe("each operation carries what a developer needs to call it", () => {
    it("authentication is stated, and the token endpoint says it needs none", () => {
        expect(byId("issueAccessToken").authentication).toMatch(/none/i);
        expect(byId("listLocations").authentication).toMatch(/bearer/i);
    });

    it("the required scope comes from the document", () => {
        expect(byId("listLocations").requiredScope).toBe("locations.read");
        expect(byId("issueAccessToken").requiredScope).toBeNull();
    });

    it("query parameters keep their real names, types and bounds", () => {
        const locations = byId("listLocations");
        const limit = locations.parameters.find((p) => p.name === "limit");
        expect(limit).toBeTruthy();
        expect(limit!.location).toBe("query");
        expect(limit!.type).toContain("integer");
        expect(limit!.constraint).toContain("max 200");
        expect(locations.parameters.map((p) => p.name)).toContain("cursor");
    });

    it("responses include the success case and the refusals", () => {
        const statuses = byId("listLocations").responses.map((r) => r.status);
        expect(statuses).toContain("200");
        expect(statuses).toContain("401");
        expect(statuses).toContain("403");
        expect(statuses).toContain("429");
    });

    it("a request body example is offered where the document defines one", () => {
        const token = byId("issueAccessToken");
        expect(token.requestBody?.required).toBe(true);
        expect(token.requestBody?.example).toBeTruthy();
        expect(JSON.parse(token.requestBody!.example!)).toHaveProperty("grant_type");
    });
});

describe("examples are derived from the schema, never invented", () => {
    it("every key in a generated example is a key the document declares", () => {
        const spec = JSON.parse(
            readFileSync(resolve(WEB, "lib/developerDocs/governedDocuments.generated.ts"), "utf8")
                .match(/export const GOVERNED_OPENAPI_DOCUMENT: string = (".*");/s)![1]
                .replace(/^"/, '"'),
        ) as string;
        const document = JSON.parse(spec) as { components: { schemas: Record<string, unknown> } };
        const declared = new Set<string>();
        const walk = (node: unknown) => {
            if (!node || typeof node !== "object") return;
            const record = node as Record<string, unknown>;
            if (record.properties && typeof record.properties === "object") {
                for (const key of Object.keys(record.properties)) declared.add(key);
            }
            for (const value of Object.values(record)) walk(value);
        };
        walk(document.components.schemas);

        for (const operation of reference.operations) {
            for (const example of [operation.requestBody?.example, operation.successExample]) {
                if (!example) continue;
                const keys: string[] = [];
                const collect = (value: unknown) => {
                    if (Array.isArray(value)) return value.forEach(collect);
                    if (value && typeof value === "object") {
                        for (const [k, v] of Object.entries(value)) { keys.push(k); collect(v); }
                    }
                };
                collect(JSON.parse(example));
                for (const key of keys) {
                    expect(declared.has(key), `${operation.id} example invents "${key}"`).toBe(true);
                }
            }
        }
    });

    it("the curl example carries a bearer token only where one is required", () => {
        expect(byId("listLocations").curl).toContain("authorization: Bearer");
        expect(byId("issueAccessToken").curl).not.toContain("authorization: Bearer");
        expect(byId("issueAccessToken").curl).toContain("content-type: application/json");
    });

    it("the example calls the server the document names", () => {
        expect(reference.server).toBeTruthy();
        expect(byId("getContext").curl).toContain(reference.server!);
    });
});
