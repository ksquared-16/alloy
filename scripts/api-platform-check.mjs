#!/usr/bin/env node
/**
 * Alloy API Platform check — the self-governing entry point for the internal API platform.
 *
 * Runs the full guard chain so the contract, generated artifacts, and typed client cannot
 * silently regress:
 *
 *   1. OpenAPI validation        — spec parses and is structurally sane.
 *   2. Generated types freshness — committed types match a fresh render of the spec.
 *   3. Determinism               — the renderer is deterministic (two renders are identical).
 *   4. OpenAPI contract tests    — spec ↔ routes ↔ families ↔ client (openapiContract.test.ts).
 *   5. API envelope tests        — normalized routes emit the standard envelope (contractRoutes).
 *   6. Typed client tests        — client unwrap/error behavior + first-consumer migration.
 *
 * Static only: no server, no DB, no network. Step 2/3 are computed in-process and do NOT write
 * to disk, so the command is safe to run in CI without dirtying the working tree.
 *
 * Usage:
 *   node scripts/api-platform-check.mjs
 *   cd web && npm run api:check
 *
 * Exits non-zero on: invalid OpenAPI, stale generated types, non-deterministic generation,
 * contract violations, envelope violations, or orphan operations (surfaced by the test suites).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

import { renderTypeModule } from "./generate-openapi-types.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const webDir = path.join(repoRoot, "web");
const specPath = path.join(repoRoot, "docs", "api", "openapi", "alloy-api.v0.yaml");
const generatedTypesPath = path.join(webDir, "lib", "api", "generated", "alloyApiTypes.ts");

const results = [];
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    const icon = ok ? "✅" : "❌";
    console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

function loadYaml() {
    const webRequire = createRequire(path.join(webDir, "package.json"));
    const mod = webRequire("js-yaml");
    return mod.default ?? mod;
}

/** Run a child process step; returns true on exit code 0. Streams output through. */
function runStep(name, command, args, cwd) {
    console.log(`\n▶ ${name}: ${command} ${args.join(" ")}`);
    const res = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
    const ok = res.status === 0;
    record(name, ok, ok ? undefined : `exit ${res.status ?? "signal " + res.signal}`);
    return ok;
}

function step1ValidateOpenApi() {
    return runStep("1. OpenAPI validation", "node", ["scripts/validate-openapi.mjs"], repoRoot);
}

function step2And3TypesFreshnessAndDeterminism() {
    let doc;
    try {
        const yaml = loadYaml();
        doc = yaml.load(readFileSync(specPath, "utf8"));
    } catch (err) {
        record("2. Generated types freshness", false, `could not parse spec: ${err?.message ?? err}`);
        record("3. Generation determinism", false, "skipped (spec parse failed)");
        return false;
    }

    let render1;
    let render2;
    try {
        render1 = renderTypeModule(doc);
        render2 = renderTypeModule(doc);
    } catch (err) {
        record("2. Generated types freshness", false, `render failed: ${err?.message ?? err}`);
        record("3. Generation determinism", false, "skipped (render failed)");
        return false;
    }

    const deterministic = render1 === render2;
    record("3. Generation determinism", deterministic, deterministic ? "two renders identical" : "renders differ");

    let committed = "";
    try {
        committed = readFileSync(generatedTypesPath, "utf8");
    } catch {
        record("2. Generated types freshness", false, "committed types file missing");
        return false;
    }
    const fresh = committed === render1;
    record(
        "2. Generated types freshness",
        fresh,
        fresh ? "committed types match spec" : "STALE — run `node scripts/generate-openapi-types.mjs`"
    );
    return deterministic && fresh;
}

function step4ContractTests() {
    return runStep(
        "4. OpenAPI contract tests",
        "npx",
        ["vitest", "run", "tests/api/openapiContract.test.ts"],
        webDir
    );
}

function step5EnvelopeTests() {
    return runStep("5. API envelope contract tests", "npx", ["vitest", "run", "tests/api/contractRoutes.test.ts"], webDir);
}

function step6ClientTests() {
    return runStep(
        "6. Typed client tests",
        "npx",
        [
            "vitest",
            "run",
            "tests/api/alloyApiClient.test.ts",
            "tests/api/customerPersonRolesClientMigration.test.ts",
        ],
        webDir
    );
}

function main() {
    console.log("═══════════════════════════════════════════");
    console.log(" Alloy API Platform check");
    console.log("═══════════════════════════════════════════");

    // Static checks first (fast, no test runner). Then the test suites.
    const ok1 = step1ValidateOpenApi();
    const ok23 = step2And3TypesFreshnessAndDeterminism();
    const ok4 = step4ContractTests();
    const ok5 = step5EnvelopeTests();
    const ok6 = step6ClientTests();

    const allOk = ok1 && ok23 && ok4 && ok5 && ok6;

    console.log("\n═══════════════════════════════════════════");
    console.log(" Summary");
    console.log("═══════════════════════════════════════════");
    for (const r of results) {
        console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }

    if (allOk) {
        console.log("\n✅ API Platform check passed. Contract, generated types, and client are in sync.");
        process.exit(0);
    } else {
        console.error("\n❌ API Platform check FAILED. See failures above.");
        process.exit(1);
    }
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) main();
