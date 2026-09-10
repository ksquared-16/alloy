/**
 * The public contract and the running code must not disagree.
 *
 * Thread 3 found the internal estate had 14 of 613 routes in OpenAPI precisely
 * because coverage was advisory. The public surface starts with it enforced, and
 * enforcement runs in BOTH directions: a documented endpoint that does not exist
 * is a lie to an integrator, and an undocumented endpoint that does exist is an
 * unsupported surface people will discover and depend on anyway.
 *
 * There is ONE truth — the spec — and this test is what makes that claim real
 * rather than aspirational.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const repoRoot = path.resolve(webRoot, "..");
const SPEC_PATH = path.join(repoRoot, "docs/api/openapi/alloy-public-api.v1.json");
const V1_ROOT = path.join(webRoot, "app/api/v1");

type Spec = {
    openapi: string;
    info: { version: string; "x-spec-status"?: string };
    paths: Record<string, Record<string, { operationId?: string }>>;
    components?: { schemas?: Record<string, unknown>; securitySchemes?: Record<string, unknown> };
};

const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as Spec;

/** Every route.ts under app/api/v1, as its URL path. */
function actualRoutes(): { urlPath: string; methods: string[] }[] {
    const out: { urlPath: string; methods: string[] }[] = [];
    if (!existsSync(V1_ROOT)) return out;

    const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
            const full = path.join(dir, entry);
            if (statSync(full).isDirectory()) {
                walk(full);
                continue;
            }
            if (entry !== "route.ts") continue;
            const rel = path.relative(webRoot, path.dirname(full)).replace(/\\/g, "/");
            const urlPath = "/" + rel.replace(/^app\//, "");
            const source = readFileSync(full, "utf8");
            const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].filter((m) =>
                new RegExp(`export\\s+async\\s+function\\s+${m}\\b|export\\s+function\\s+${m}\\b`).test(source),
            );
            out.push({ urlPath, methods });
        }
    };
    walk(V1_ROOT);
    return out;
}

describe("public OpenAPI drift guard", () => {
    const routes = actualRoutes();

    it("the artifact parses and declares itself public v1", () => {
        expect(spec.openapi).toMatch(/^3\.1/);
        expect(spec.info["x-spec-status"]).toBe("public-v1");
        expect(spec.info.version).toMatch(/^1\./);
    });

    it("every documented path exists as a route, with the documented method", () => {
        for (const [docPath, operations] of Object.entries(spec.paths)) {
            const route = routes.find((r) => r.urlPath === docPath);
            expect(route, `documented path has no route file: ${docPath}`).toBeTruthy();
            for (const method of Object.keys(operations)) {
                expect(
                    route!.methods,
                    `${docPath} documents ${method.toUpperCase()} but the route does not export it`,
                ).toContain(method.toUpperCase());
            }
        }
    });

    it("every /api/v1 route is documented — no undocumented public surface", () => {
        for (const route of routes) {
            const documented = spec.paths[route.urlPath];
            expect(documented, `route exists but is undocumented: ${route.urlPath}`).toBeTruthy();
            for (const method of route.methods) {
                expect(
                    Object.keys(documented!).map((m) => m.toUpperCase()),
                    `${route.urlPath} exports ${method} but the spec does not document it`,
                ).toContain(method);
            }
        }
    });

    it("documents only /api/v1 and never resurrects /api/public/v1", () => {
        for (const docPath of Object.keys(spec.paths)) {
            expect(docPath.startsWith("/api/v1/")).toBe(true);
            expect(docPath).not.toContain("/api/public/v1");
        }
        // The whole artifact, not only the path keys — Thread 4 ratified /api/v1
        // in Phase H and three files had to be corrected in Slice A when an
        // earlier draft's prefix survived. It must not come back.
        expect(readFileSync(SPEC_PATH, "utf8")).not.toContain("/api/public/v1");
    });

    it("admits no internal AdminV2 surface", () => {
        for (const docPath of Object.keys(spec.paths)) {
            expect(docPath).not.toContain("/api/admin");
            expect(docPath).not.toContain("adminV2");
        }
    });

    it("defines the error envelope and the auth scheme every operation relies on", () => {
        expect(spec.components?.schemas?.Error).toBeTruthy();
        expect(spec.components?.securitySchemes?.bearerAuth).toBeTruthy();
    });

    it("gives every operation a stable operationId", () => {
        const ids: string[] = [];
        for (const operations of Object.values(spec.paths)) {
            for (const op of Object.values(operations)) {
                expect(op.operationId).toBeTruthy();
                ids.push(op.operationId!);
            }
        }
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("currently describes exactly the two endpoints B.2 implemented", () => {
        // A deliberate tripwire. Adding a public endpoint must be a decision that
        // updates this expectation, not something that happens quietly.
        expect(Object.keys(spec.paths).sort()).toEqual(["/api/v1/context", "/api/v1/oauth/token"]);
    });
});
