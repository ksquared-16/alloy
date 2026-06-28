#!/usr/bin/env node
/**
 * Generate TypeScript types from `docs/api/openapi/alloy-api.v0.yaml`.
 *
 * Intentionally dependency-light: parses the spec with the `js-yaml` already present in
 * `web/node_modules` (no new dependency) and emits a focused, deterministic types module
 * from `components.schemas`. It is **not** a full OpenAPI codegen — it handles exactly the
 * schema features the v0 spec uses ($ref, allOf, enum, const, type arrays incl. null,
 * objects with properties/required/additionalProperties, arrays, primitives).
 *
 * Output: web/lib/api/generated/alloyApiTypes.ts (overwritten; do not hand-edit).
 *
 * Usage:  node scripts/generate-openapi-types.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const specPath = path.join(repoRoot, "docs", "api", "openapi", "alloy-api.v0.yaml");
const outDir = path.join(repoRoot, "web", "lib", "api", "generated");
const outPath = path.join(outDir, "alloyApiTypes.ts");

async function loadYaml() {
    const webRequire = createRequire(path.join(repoRoot, "web", "package.json"));
    const resolved = webRequire.resolve("js-yaml");
    const mod = await import(pathToFileURL(resolved).href);
    return mod.default ?? mod;
}

const refName = (ref) => ref.split("/").pop();
const isIdent = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);
const quoteKey = (k) => (isIdent(k) ? k : JSON.stringify(k));

/** Map a primitive OpenAPI type token to a TS type. */
function primitive(t) {
    switch (t) {
        case "string":
            return "string";
        case "integer":
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "null":
            return "null";
        case "object":
            return "Record<string, unknown>";
        case "array":
            return "unknown[]";
        default:
            return "unknown";
    }
}

/** Convert a schema node to a TS type expression. `depth` controls indentation of objects. */
function toType(schema, indent = 0) {
    if (!schema || typeof schema !== "object") return "unknown";

    if (schema.$ref) return refName(schema.$ref);

    if (Array.isArray(schema.allOf)) {
        return schema.allOf.map((s) => wrapIntersectionMember(toType(s, indent))).join(" & ");
    }
    if (Array.isArray(schema.oneOf)) {
        return schema.oneOf.map((s) => toType(s, indent)).join(" | ");
    }
    if (Array.isArray(schema.anyOf)) {
        return schema.anyOf.map((s) => toType(s, indent)).join(" | ");
    }

    if (schema.const !== undefined) return JSON.stringify(schema.const);

    if (Array.isArray(schema.enum)) {
        return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
    }

    // type can be a string or an array (e.g. ["string", "null"]).
    if (Array.isArray(schema.type)) {
        return schema.type.map((t) => primitive(t)).join(" | ");
    }

    if (schema.type === "array") {
        const item = toType(schema.items ?? {}, indent);
        return /[ |&]/.test(item) ? `Array<${item}>` : `${item}[]`;
    }

    const hasProps = schema.properties && Object.keys(schema.properties).length > 0;
    if (schema.type === "object" || hasProps) {
        if (!hasProps) {
            return "Record<string, unknown>";
        }
        const required = new Set(schema.required ?? []);
        const pad = "  ".repeat(indent + 1);
        const closePad = "  ".repeat(indent);
        const lines = [];
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            const optional = required.has(key) ? "" : "?";
            const t = toType(propSchema, indent + 1);
            lines.push(`${pad}${quoteKey(key)}${optional}: ${t};`);
        }
        if (schema.additionalProperties === true) {
            lines.push(`${pad}[key: string]: unknown;`);
        }
        return `{\n${lines.join("\n")}\n${closePad}}`;
    }

    if (typeof schema.type === "string") return primitive(schema.type);

    // additionalProperties-only object with no declared type.
    if (schema.additionalProperties === true) return "Record<string, unknown>";

    return "unknown";
}

/** allOf members that are unions must be parenthesised before `&`. */
function wrapIntersectionMember(t) {
    return /\|/.test(t) && !t.startsWith("{") ? `(${t})` : t;
}

function jsdoc(schema) {
    const desc = typeof schema?.description === "string" ? schema.description.trim() : "";
    if (!desc) return "";
    const oneLine = desc.replace(/\s+/g, " ");
    return `/** ${oneLine} */\n`;
}

async function main() {
    const yaml = await loadYaml();
    const doc = yaml.load(readFileSync(specPath, "utf8"));
    const schemas = doc?.components?.schemas ?? {};
    const names = Object.keys(schemas);

    const header = `/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Source : docs/api/openapi/alloy-api.v0.yaml (OpenAPI ${doc.openapi}, ${doc.info?.["x-spec-status"] ?? "internal-v0"})
 * Regen  : node scripts/generate-openapi-types.mjs
 *
 * Internal v0 types for Alloy's normalized API surface. Partial by design — only
 * gate-passing route families are represented. See docs/api/internal-typescript-client.md.
 */

/* eslint-disable */
`;

    const blocks = names.map((name) => {
        const schema = schemas[name];
        return `${jsdoc(schema)}export type ${name} = ${toType(schema, 0)};`;
    });

    const body = `${header}\n${blocks.join("\n\n")}\n`;

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, body, "utf8");

    console.log("✅ Generated TypeScript types");
    console.log(`   source : docs/api/openapi/alloy-api.v0.yaml`);
    console.log(`   output : web/lib/api/generated/alloyApiTypes.ts`);
    console.log(`   types  : ${names.length}`);
}

main().catch((err) => {
    console.error("❌ Type generation failed:");
    console.error(`   ${err?.stack ?? err}`);
    process.exit(1);
});
