import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// js-yaml ships no bundled types; load it via require (same approach as the generator/validator
// scripts) and type the one method we use, so we add no @types dependency.
const nodeRequire = createRequire(import.meta.url);
const yaml = nodeRequire("js-yaml") as { load: (input: string) => unknown };

/**
 * Static helpers for the OpenAPI v0 contract suite (`openapiContract.test.ts`).
 *
 * Everything here is filesystem + parse only — no network, no server, no DB. The goal is to
 * detect drift between `docs/api/openapi/alloy-api.v0.yaml`, the route handlers under
 * `web/app/api/**`, the generated types, and the internal client.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// web/tests/api/helpers -> repo root is four levels up.
export const repoRoot = path.resolve(here, "..", "..", "..", "..");
export const specPath = path.join(repoRoot, "docs", "api", "openapi", "alloy-api.v0.yaml");
export const generatedTypesPath = path.join(repoRoot, "web", "lib", "api", "generated", "alloyApiTypes.ts");
export const apiRoot = path.join(repoRoot, "web", "app", "api");

export const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiDoc {
    openapi?: string;
    info?: Record<string, unknown>;
    tags?: Array<{ name: string }>;
    paths?: Record<string, Record<string, unknown>>;
    components?: {
        schemas?: Record<string, unknown>;
        responses?: Record<string, unknown>;
        parameters?: Record<string, unknown>;
        headers?: Record<string, unknown>;
    };
}

export interface OperationEntry {
    pathName: string;
    method: HttpMethod;
    op: Record<string, unknown>;
}

export function loadSpec(): OpenApiDoc {
    return yaml.load(readFileSync(specPath, "utf8")) as OpenApiDoc;
}

/** Flatten the spec into a list of (path, method, operation) tuples. */
export function getOperations(doc: OpenApiDoc): OperationEntry[] {
    const out: OperationEntry[] = [];
    for (const [pathName, item] of Object.entries(doc.paths ?? {})) {
        for (const method of HTTP_METHODS) {
            const op = (item as Record<string, unknown>)[method];
            if (op && typeof op === "object") {
                out.push({ pathName, method, op: op as Record<string, unknown> });
            }
        }
    }
    return out;
}

/**
 * Map an OpenAPI path to its expected Next.js route file.
 * `/api/admin/analytics/metrics/{id}/copy` -> `web/app/api/admin/analytics/metrics/[id]/copy/route.ts`
 */
export function specPathToRouteFile(pathName: string): string {
    const segments = pathName
        .replace(/^\//, "")
        .split("/")
        .map((seg) => seg.replace(/^\{(.+)\}$/, "[$1]"));
    // Drop the leading "api" segment because `apiRoot` already points at web/app/api.
    if (segments[0] === "api") segments.shift();
    return path.join(apiRoot, ...segments, "route.ts");
}

export function routeFileExists(pathName: string): boolean {
    return existsSync(specPathToRouteFile(pathName));
}

/** Read a route file's source (throws if missing — callers should check existence first). */
export function readRouteSource(pathName: string): string {
    return readFileSync(specPathToRouteFile(pathName), "utf8");
}

/** Detect whether a route module exports a handler for the given HTTP method. */
export function routeExportsMethod(source: string, method: HttpMethod): boolean {
    const upper = method.toUpperCase();
    const patterns = [
        new RegExp(`export\\s+async\\s+function\\s+${upper}\\b`),
        new RegExp(`export\\s+function\\s+${upper}\\b`),
        new RegExp(`export\\s+const\\s+${upper}\\b`),
        new RegExp(`export\\s*\\{[^}]*\\b${upper}\\b[^}]*\\}`),
    ];
    return patterns.some((re) => re.test(source));
}

/** Resolve a JSON pointer like `#/components/responses/Unauthorized`. */
export function resolvePointer(doc: OpenApiDoc, ref: string): unknown {
    if (!ref.startsWith("#/")) return undefined;
    const parts = ref.slice(2).split("/");
    let node: unknown = doc;
    for (const raw of parts) {
        const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
        if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
            node = (node as Record<string, unknown>)[key];
        } else {
            return undefined;
        }
    }
    return node;
}

/**
 * Collect the set of component-schema names a schema references, transitively (following
 * `$ref`s into `components.schemas` through `allOf`/`oneOf`/`anyOf`/`properties`/`items`).
 * Cycle-safe.
 */
export function collectSchemaRefsDeep(doc: OpenApiDoc, schema: unknown, seen = new Set<string>()): Set<string> {
    const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        const obj = node as Record<string, unknown>;
        if (typeof obj.$ref === "string") {
            const ref = obj.$ref;
            const name = ref.startsWith("#/components/schemas/") ? ref.split("/").pop()! : null;
            if (name && !seen.has(name)) {
                seen.add(name);
                walk(resolvePointer(doc, ref));
            }
            return;
        }
        for (const value of Object.values(obj)) walk(value);
    };
    walk(schema);
    return seen;
}

/** Resolve a response object (following a top-level `$ref` into components.responses). */
export function resolveResponse(doc: OpenApiDoc, response: unknown): Record<string, unknown> | undefined {
    if (!response || typeof response !== "object") return undefined;
    const ref = (response as { $ref?: string }).$ref;
    if (typeof ref === "string") return resolvePointer(doc, ref) as Record<string, unknown> | undefined;
    return response as Record<string, unknown>;
}

/** Pull the application/json schema node out of a (resolved) response. */
export function responseJsonSchema(response: Record<string, unknown> | undefined): unknown {
    const content = response?.content as Record<string, unknown> | undefined;
    const json = content?.["application/json"] as Record<string, unknown> | undefined;
    return json?.schema;
}

/** Does a (possibly $ref) response's JSON schema transitively reference the given component? */
export function responseReferencesComponent(
    doc: OpenApiDoc,
    response: unknown,
    componentName: string
): boolean {
    const resolved = resolveResponse(doc, response);
    const schema = responseJsonSchema(resolved);
    if (!schema) return false;
    return collectSchemaRefsDeep(doc, schema).has(componentName);
}

/**
 * Allowed OpenAPI v0 route families. A documented path must match exactly one of these, and
 * nothing else may be added without updating this list (and the readiness gate).
 */
export const ALLOWED_FAMILIES: Array<{ name: string; test: (p: string) => boolean }> = [
    { name: "actions", test: (p) => p.startsWith("/api/admin/actions/") },
    { name: "analytics-metrics", test: (p) => p === "/api/admin/analytics/metrics" || p.startsWith("/api/admin/analytics/metrics/") },
    { name: "entity-read", test: (p) => /^\/api\/admin\/entity\/\{[^}]+\}\/\{[^}]+\}$/.test(p) },
    { name: "customer-person-role-types", test: (p) => p === "/api/admin/customer-person-role-types" || p.startsWith("/api/admin/customer-person-role-types/") },
    { name: "person-relationship-type-settings", test: (p) => p === "/api/admin/person-relationship-type-settings" || p.startsWith("/api/admin/person-relationship-type-settings/") },
];

export function familyFor(pathName: string): string | null {
    const match = ALLOWED_FAMILIES.find((f) => f.test(pathName));
    return match ? match.name : null;
}

/** Substrings that must never appear in a v0 path (internal/debug/etc. surfaces). */
export const FORBIDDEN_PATH_SUBSTRINGS = [
    "/debug",
    "/bootstrap",
    "/internal",
    "/experimental",
    "/legacy",
    "/dev/",
    "/_",
    "/test",
];
