import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import { createAlloyApiClient } from "@/lib/api/alloyApiClient";
import { renderTypeModule } from "../../../scripts/generate-openapi-types.mjs";
import {
    loadSpec,
    getOperations,
    routeFileExists,
    specPathToRouteFile,
    readRouteSource,
    routeExportsMethod,
    responseReferencesComponent,
    resolveResponse,
    familyFor,
    ALLOWED_FAMILIES,
    FORBIDDEN_PATH_SUBSTRINGS,
    generatedTypesPath,
    type OperationEntry,
} from "./helpers/openapiTestUtils";

/**
 * OpenAPI v0 contract suite (Phase 3D).
 *
 * Static / structural only — no server, no DB, no network. Guards the v0 spec
 * (`docs/api/openapi/alloy-api.v0.yaml`) against drift from the route handlers, the generated
 * types, and the internal client. If a route family is added/removed or an envelope regresses,
 * a test here fails.
 *
 * @see docs/api/openapi/README.md
 * @see docs/api/openapi-readiness.md
 * @see docs/api/internal-typescript-client.md
 */

const doc = loadSpec();
const operations = getOperations(doc);
const SUCCESS_STATUSES = ["200", "201"];

function describeOp(entry: OperationEntry): string {
    return `${entry.method.toUpperCase()} ${entry.pathName}`;
}

function successResponse(entry: OperationEntry): [string, unknown] | null {
    const responses = (entry.op.responses ?? {}) as Record<string, unknown>;
    for (const status of SUCCESS_STATUSES) {
        if (responses[status]) return [status, responses[status]];
    }
    return null;
}

function errorResponseStatuses(entry: OperationEntry): string[] {
    const responses = (entry.op.responses ?? {}) as Record<string, unknown>;
    return Object.keys(responses).filter((s) => /^\d+$/.test(s) && Number(s) >= 400);
}

describe("OpenAPI v0 — document validity", () => {
    it("parses and declares a 3.0.x / 3.1.x version", () => {
        expect(doc).toBeTruthy();
        expect(String(doc.openapi)).toMatch(/^3\.(0|1)\./);
    });

    it("has info.title and info.version", () => {
        expect(typeof doc.info?.title).toBe("string");
        expect(typeof doc.info?.version).toBe("string");
    });

    it("defines the shared envelope + correlation components", () => {
        const schemas = doc.components?.schemas ?? {};
        for (const name of ["ApiSuccess", "ApiFailure", "ApiError", "CorrelationId"]) {
            expect(schemas, `missing component schema ${name}`).toHaveProperty(name);
        }
    });

    it("wires correlation_id into both envelopes", () => {
        const success = doc.components?.schemas?.ApiSuccess as Record<string, any>;
        const failure = doc.components?.schemas?.ApiFailure as Record<string, any>;
        expect(success.properties?.correlation_id?.$ref).toBe("#/components/schemas/CorrelationId");
        expect(failure.properties?.correlation_id?.$ref).toBe("#/components/schemas/CorrelationId");
    });

    it("has at least one operation", () => {
        expect(operations.length).toBeGreaterThan(0);
    });
});

describe("OpenAPI v0 — every operation is well-formed", () => {
    it("has unique operationIds across the whole spec", () => {
        const ids = operations.map((e) => e.op.operationId).filter(Boolean) as string[];
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        expect(ids).toHaveLength(operations.length); // every op has an id
        expect(dupes, `duplicate operationIds: ${dupes.join(", ")}`).toHaveLength(0);
    });

    it.each(operations.map((e) => [describeOp(e), e] as const))(
        "%s declares operationId, tags, and responses",
        (_label, entry) => {
            expect(typeof entry.op.operationId, "operationId").toBe("string");
            expect(Array.isArray(entry.op.tags) && (entry.op.tags as unknown[]).length > 0, "tags").toBe(true);
            expect(entry.op.responses && typeof entry.op.responses === "object", "responses").toBe(true);
        }
    );

    it.each(operations.map((e) => [describeOp(e), e] as const))(
        "%s success response uses the normalized ApiSuccess + CorrelationId envelope",
        (_label, entry) => {
            const success = successResponse(entry);
            if (!success) {
                // 405-only operations (DELETE) have no success body — covered by the failure check.
                expect(errorResponseStatuses(entry).length).toBeGreaterThan(0);
                return;
            }
            const [, response] = success;
            expect(responseReferencesComponent(doc, response, "ApiSuccess"), "refs ApiSuccess").toBe(true);
            expect(responseReferencesComponent(doc, response, "CorrelationId"), "refs CorrelationId").toBe(true);
            // success responses must expose the correlation id header
            const resolved = resolveResponse(doc, response);
            const headers = (resolved?.headers ?? {}) as Record<string, unknown>;
            expect("x-correlation-id" in headers, "x-correlation-id header").toBe(true);
        }
    );

    it.each(operations.map((e) => [describeOp(e), e] as const))(
        "%s declares failure responses on the normalized ApiFailure envelope",
        (_label, entry) => {
            const statuses = errorResponseStatuses(entry);
            expect(statuses.length, "has >=1 error response").toBeGreaterThan(0);
            const responses = (entry.op.responses ?? {}) as Record<string, unknown>;
            for (const status of statuses) {
                expect(
                    responseReferencesComponent(doc, responses[status], "ApiFailure"),
                    `status ${status} refs ApiFailure`
                ).toBe(true);
            }
        }
    );
});

describe("OpenAPI v0 — paths map to real route handlers", () => {
    const pathNames = Object.keys(doc.paths ?? {});

    it.each(pathNames.map((p) => [p] as const))("%s resolves to an existing route.ts", (pathName) => {
        expect(routeFileExists(pathName), `expected ${specPathToRouteFile(pathName)}`).toBe(true);
    });

    it.each(operations.map((e) => [describeOp(e), e] as const))(
        "%s is exported by its route handler",
        (_label, entry) => {
            const source = readRouteSource(entry.pathName);
            expect(routeExportsMethod(source, entry.method), `route should export ${entry.method.toUpperCase()}`).toBe(
                true
            );
        }
    );
});

describe("OpenAPI v0 — only allowed families, no forbidden surfaces", () => {
    const pathNames = Object.keys(doc.paths ?? {});

    it.each(pathNames.map((p) => [p] as const))("%s belongs to an allowed v0 family", (pathName) => {
        expect(familyFor(pathName), `${pathName} is not in an allowed family`).not.toBeNull();
    });

    it.each(pathNames.map((p) => [p] as const))("%s contains no internal/debug/legacy markers", (pathName) => {
        const hit = FORBIDDEN_PATH_SUBSTRINGS.find((s) => pathName.includes(s));
        expect(hit, `forbidden marker "${hit}" in ${pathName}`).toBeUndefined();
    });

    it("covers exactly the five documented v0 families", () => {
        const present = new Set(pathNames.map((p) => familyFor(p)));
        present.delete(null);
        expect([...present].sort()).toEqual(ALLOWED_FAMILIES.map((f) => f.name).sort());
    });
});

describe("OpenAPI v0 — generated types stay in sync", () => {
    it("the committed alloyApiTypes.ts matches a fresh render of the spec (deterministic)", () => {
        const expected = renderTypeModule(doc as unknown as Record<string, unknown>);
        const actual = readFileSync(generatedTypesPath, "utf8");
        expect(actual).toBe(expected);
    });
});

describe("OpenAPI v0 — internal client exposes exactly the v0 families", () => {
    const api = createAlloyApiClient({ fetch: (async () => ({})) as never });

    it("exposes only the expected top-level surfaces (no legacy families)", () => {
        const surfaces = Object.keys(api).sort();
        expect(surfaces).toEqual(["actions", "entity", "metrics", "referenceData", "request"].sort());
    });

    it("actions exposes inventory/preflight/execute", () => {
        expect(Object.keys(api.actions).sort()).toEqual(["execute", "inventory", "preflight"].sort());
    });

    it("metrics exposes the documented metric operations", () => {
        expect(Object.keys(api.metrics).sort()).toEqual(
            ["copy", "create", "get", "list", "preview", "snapshot", "trend", "update"].sort()
        );
    });

    it("entity exposes get", () => {
        expect(Object.keys(api.entity)).toEqual(["get"]);
    });

    it("referenceData exposes exactly the two reference-data families, each CRUD-shaped", () => {
        expect(Object.keys(api.referenceData).sort()).toEqual(
            ["customerPersonRoleTypes", "personRelationshipTypeSettings"].sort()
        );
        for (const resource of Object.values(api.referenceData)) {
            expect(Object.keys(resource).sort()).toEqual(["create", "list", "remove", "update"].sort());
        }
    });
});
