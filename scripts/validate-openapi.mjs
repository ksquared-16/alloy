#!/usr/bin/env node
/**
 * Lightweight OpenAPI v0 validator for `docs/api/openapi/alloy-api.v0.yaml`.
 *
 * Intentionally dependency-light: it parses the YAML with `js-yaml` (already present in
 * `web/node_modules` as a transitive dep) and runs structural sanity checks rather than a
 * full JSON-Schema validation. Goal: catch broken YAML, dangling `$ref`s, and operations
 * missing responses — the failures that would silently corrupt the spec.
 *
 * Usage:  node scripts/validate-openapi.mjs
 * Exit:   0 = ok, 1 = problems found.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const specPath = path.join(repoRoot, "docs", "api", "openapi", "alloy-api.v0.yaml");

// Resolve js-yaml from web/node_modules without adding a new dependency.
async function loadYamlParser() {
    const webRequire = createRequire(path.join(repoRoot, "web", "package.json"));
    try {
        const resolved = webRequire.resolve("js-yaml");
        const mod = await import(pathToFileURL(resolved).href);
        return mod.default ?? mod;
    } catch (err) {
        console.error("❌ Could not load a YAML parser (js-yaml). Install it under web/ to validate.");
        console.error(`   ${err?.message ?? err}`);
        process.exit(1);
    }
}

const errors = [];
const fail = (msg) => errors.push(msg);

/** Collect every `$ref` string in the document. */
function collectRefs(node, refs) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) collectRefs(item, refs);
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        if (key === "$ref" && typeof value === "string") refs.push(value);
        else collectRefs(value, refs);
    }
}

/** Resolve a local `#/a/b/c` pointer against the root doc. */
function resolvePointer(root, ref) {
    if (!ref.startsWith("#/")) return undefined; // only local refs are used in v0
    const parts = ref
        .slice(2)
        .split("/")
        .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    let cur = root;
    for (const part of parts) {
        if (cur && typeof cur === "object" && part in cur) cur = cur[part];
        else return undefined;
    }
    return cur;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

async function main() {
    const yaml = await loadYamlParser();

    let raw;
    try {
        raw = readFileSync(specPath, "utf8");
    } catch {
        console.error(`❌ Spec not found: ${specPath}`);
        process.exit(1);
    }

    let doc;
    try {
        doc = yaml.load(raw);
    } catch (err) {
        console.error("❌ YAML parse error:");
        console.error(`   ${err?.message ?? err}`);
        process.exit(1);
    }

    if (!doc || typeof doc !== "object") fail("Document root is not a mapping.");

    // openapi version
    if (!doc.openapi || !/^3\.(0|1)\./.test(String(doc.openapi))) {
        fail(`Unexpected/missing openapi version: ${JSON.stringify(doc.openapi)} (want 3.0.x or 3.1.x).`);
    }
    if (!doc.info?.title || !doc.info?.version) fail("info.title and info.version are required.");
    if (!doc.paths || typeof doc.paths !== "object") fail("paths object is required.");

    // Operation-level sanity: every operation needs responses + an operationId.
    const operationIds = new Set();
    let operationCount = 0;
    for (const [p, item] of Object.entries(doc.paths ?? {})) {
        for (const [method, op] of Object.entries(item ?? {})) {
            if (!HTTP_METHODS.has(method)) continue;
            operationCount += 1;
            if (!op || typeof op !== "object") {
                fail(`${method.toUpperCase()} ${p}: operation is not a mapping.`);
                continue;
            }
            if (!op.responses || Object.keys(op.responses).length === 0) {
                fail(`${method.toUpperCase()} ${p}: missing responses.`);
            }
            if (!op.operationId) {
                fail(`${method.toUpperCase()} ${p}: missing operationId.`);
            } else if (operationIds.has(op.operationId)) {
                fail(`Duplicate operationId: ${op.operationId}`);
            } else {
                operationIds.add(op.operationId);
            }
        }
    }

    // Every local $ref must resolve.
    const refs = [];
    collectRefs(doc, refs);
    const uniqueRefs = [...new Set(refs)];
    for (const ref of uniqueRefs) {
        if (resolvePointer(doc, ref) === undefined) fail(`Dangling $ref: ${ref}`);
    }

    if (errors.length) {
        console.error(`❌ OpenAPI validation failed (${errors.length} issue(s)):`);
        for (const e of errors) console.error(`   • ${e}`);
        process.exit(1);
    }

    console.log("✅ OpenAPI v0 spec OK");
    console.log(`   version : ${doc.openapi}`);
    console.log(`   paths   : ${Object.keys(doc.paths).length}`);
    console.log(`   ops     : ${operationCount}`);
    console.log(`   schemas : ${Object.keys(doc.components?.schemas ?? {}).length}`);
    console.log(`   refs    : ${uniqueRefs.length} (all resolve)`);
}

main();
