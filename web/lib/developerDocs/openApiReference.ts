/**
 * The API reference, read from the governed OpenAPI document.
 *
 * ONE SOURCE OF TRUTH. Nothing here restates a contract. Every method, path, parameter, response,
 * scope and field name is read out of `alloy-public-api.v1.json` — the same document the drift
 * guard enforces against the running routes — so the reference cannot describe an operation that
 * does not exist, and cannot fall behind one that changes.
 *
 * EXAMPLES ARE DERIVED, NOT WRITTEN. The spec carries no `example` values, and inventing them by
 * hand would create exactly the second source of truth this avoids. So a request and response
 * example is SYNTHESIZED from the schema: real property names, real enum members, real defaults,
 * and an obvious placeholder for anything free-form. An example built this way cannot name a field
 * the API does not have.
 *
 * It is deliberately small. Three operations do not need a bespoke reference engine — but the shape
 * below is per-operation and schema-driven, so the next resources to be externalized appear here by
 * being added to the governed document rather than by anyone writing a page.
 */

import { GOVERNED_OPENAPI_DOCUMENT } from "@/lib/developerDocs/governedDocuments.generated";

type Json = Record<string, unknown>;

export type ReferenceParameter = {
    name: string;
    location: string;
    required: boolean;
    type: string;
    description: string | null;
    constraint: string | null;
};

export type ReferenceResponse = {
    status: string;
    description: string;
    /** The named schema the body conforms to, when the document names one. */
    schema: string | null;
};

export type ReferenceOperation = {
    id: string;
    method: string;
    path: string;
    summary: string;
    description: string | null;
    /** "None — this is how a client obtains a token" or the scheme the document names. */
    authentication: string;
    requiredScope: string | null;
    parameters: ReferenceParameter[];
    requestBody: { required: boolean; mediaTypes: string[]; example: string | null } | null;
    responses: ReferenceResponse[];
    successExample: string | null;
    curl: string;
};

export type ApiReference = {
    title: string;
    version: string;
    server: string | null;
    operations: ReferenceOperation[];
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function spec(): Json {
    return JSON.parse(GOVERNED_OPENAPI_DOCUMENT) as Json;
}

/** Resolve a local `$ref`. Anything else is left alone — this reader follows no network. */
function deref(document: Json, node: unknown): Json | null {
    if (!node || typeof node !== "object") return null;
    const ref = (node as Json).$ref;
    if (typeof ref !== "string") return node as Json;
    if (!ref.startsWith("#/")) return null;
    let current: unknown = document;
    for (const segment of ref.slice(2).split("/")) {
        if (!current || typeof current !== "object") return null;
        current = (current as Json)[segment];
    }
    return (current ?? null) as Json | null;
}

/** A human phrase for a schema's type, kept faithful to what the document says. */
function typeOf(schema: Json | null): string {
    if (!schema) return "string";
    const type = typeof schema.type === "string" ? schema.type : null;
    if (Array.isArray(schema.enum)) return `${type ?? "string"} (${schema.enum.join(" | ")})`;
    if (type === "array") {
        const items = schema.items && typeof schema.items === "object" ? (schema.items as Json) : null;
        return `array of ${typeof items?.type === "string" ? items.type : "object"}`;
    }
    return type ?? "object";
}

/** Bounds and defaults, stated only when the document states them. */
function constraintOf(schema: Json | null): string | null {
    if (!schema) return null;
    const parts: string[] = [];
    if (typeof schema.default !== "undefined") parts.push(`default ${JSON.stringify(schema.default)}`);
    if (typeof schema.minimum === "number") parts.push(`min ${schema.minimum}`);
    if (typeof schema.maximum === "number") parts.push(`max ${schema.maximum}`);
    if (typeof schema.format === "string") parts.push(String(schema.format));
    return parts.length ? parts.join(" · ") : null;
}

/**
 * Build an example value from a schema.
 *
 * Every key is a key the document declares. A string with no enum becomes a placeholder naming its
 * own field, which is honest: the reference does not know your data, and pretending to would put
 * invented identifiers in front of a developer.
 */
function exampleFor(document: Json, node: unknown, depth = 0): unknown {
    const schema = deref(document, node);
    if (!schema || depth > 4) return null;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    if (typeof schema.default !== "undefined") return schema.default;

    switch (schema.type) {
        case "integer":
        case "number":
            return typeof schema.minimum === "number" ? schema.minimum : 1;
        case "boolean":
            return true;
        case "array":
            return [exampleFor(document, schema.items, depth + 1)].filter((v) => v !== null);
        case "object":
        default: {
            const properties = schema.properties && typeof schema.properties === "object"
                ? (schema.properties as Json)
                : null;
            if (!properties) {
                if (schema.type === "string") return schema.format === "date-time" ? "2026-01-31T09:00:00Z" : "…";
                return null;
            }
            const out: Json = {};
            for (const [key, value] of Object.entries(properties)) {
                const child = deref(document, value);
                out[key] =
                    child && child.type === "string" && !Array.isArray(child.enum) ?
                        child.format === "date-time" ? "2026-01-31T09:00:00Z" : `<${key}>`
                    :   exampleFor(document, value, depth + 1);
            }
            return out;
        }
    }
}

/** The one call a developer copies first, assembled from the operation itself. */
function curlFor(
    operation: { method: string; path: string; authentication: string },
    server: string | null,
    requestExample: string | null,
): string {
    const base = server ?? "https://app.alloy.example";
    const lines = [`curl -sS -X ${operation.method} "${base}${operation.path}"`];
    if (requestExample) {
        lines.push(`  -H "content-type: application/json"`);
    }
    if (!/^none/i.test(operation.authentication)) {
        lines.push(`  -H "authorization: Bearer $ALLOY_ACCESS_TOKEN"`);
    }
    if (requestExample) {
        lines.push(`  -d '${requestExample.replace(/\n\s*/g, "")}'`);
    }
    return lines.join(" \\\n");
}

export function apiReference(): ApiReference {
    const document = spec();
    const info = (document.info ?? {}) as Json;
    const servers = Array.isArray(document.servers) ? (document.servers as Json[]) : [];
    const server = servers.length && typeof servers[0].url === "string" ? String(servers[0].url) : null;
    const paths = (document.paths ?? {}) as Record<string, Json>;

    const operations: ReferenceOperation[] = [];

    for (const [route, methods] of Object.entries(paths)) {
        for (const method of METHODS) {
            const raw = methods[method] as Json | undefined;
            if (!raw) continue;

            const security = Array.isArray(raw.security) ? raw.security : (document.security as unknown[] | undefined);
            const schemes = Array.isArray(security)
                ? security.flatMap((entry) => Object.keys((entry ?? {}) as Json))
                : [];
            const authentication =
                schemes.length === 0 ?
                    "None — this is how a client obtains a token"
                :   schemes.map((s) => (s === "bearerAuth" ? "Bearer access token" : s)).join(", ");

            const parameters: ReferenceParameter[] = (Array.isArray(raw.parameters) ? raw.parameters : [])
                .map((entry) => deref(document, entry))
                .filter((p): p is Json => Boolean(p))
                .map((p) => {
                    const schema = deref(document, p.schema);
                    return {
                        name: String(p.name ?? ""),
                        location: String(p.in ?? "query"),
                        required: p.required === true,
                        type: typeOf(schema),
                        description: typeof p.description === "string" ? p.description : null,
                        constraint: constraintOf(schema),
                    };
                });

            const bodyNode = raw.requestBody && typeof raw.requestBody === "object" ? (raw.requestBody as Json) : null;
            const bodyContent = bodyNode?.content && typeof bodyNode.content === "object"
                ? (bodyNode.content as Record<string, Json>)
                : null;
            const jsonBody = bodyContent?.["application/json"];
            const requestExample = jsonBody
                ? JSON.stringify(exampleFor(document, jsonBody.schema), null, 2)
                : null;
            const requestBody = bodyNode
                ? {
                    required: bodyNode.required === true,
                    mediaTypes: bodyContent ? Object.keys(bodyContent) : [],
                    example: requestExample,
                }
                : null;

            const responseEntries = (raw.responses ?? {}) as Record<string, Json>;
            const responses: ReferenceResponse[] = Object.entries(responseEntries).map(([status, node]) => {
                const resolved = deref(document, node) ?? {};
                const content = resolved.content && typeof resolved.content === "object"
                    ? (resolved.content as Record<string, Json>)
                    : null;
                const schemaRef = content?.["application/json"]?.schema as Json | undefined;
                const named = typeof schemaRef?.$ref === "string" ? String(schemaRef.$ref).split("/").pop() ?? null : null;
                return {
                    status,
                    description: typeof resolved.description === "string" ? resolved.description : "",
                    schema: named,
                };
            });

            const success = Object.entries(responseEntries).find(([status]) => status.startsWith("2"));
            const successSchema = success
                ? ((deref(document, success[1])?.content as Record<string, Json> | undefined)?.["application/json"]
                    ?.schema)
                : undefined;
            const successExample = successSchema
                ? JSON.stringify(exampleFor(document, successSchema), null, 2)
                : null;

            const base = {
                method: method.toUpperCase(),
                path: route,
                authentication,
            };

            operations.push({
                id: String(raw.operationId ?? `${method}-${route}`),
                ...base,
                summary: String(raw.summary ?? ""),
                description: typeof raw.description === "string" ? raw.description : null,
                requiredScope: typeof raw["x-required-scope"] === "string" ? String(raw["x-required-scope"]) : null,
                parameters,
                requestBody,
                responses,
                successExample,
                curl: curlFor(base, server, requestExample),
            });
        }
    }

    return {
        title: String(info.title ?? "Alloy Public API"),
        version: String(info.version ?? ""),
        server,
        operations,
    };
}
