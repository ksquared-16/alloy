#!/usr/bin/env node
/**
 * The embedded governed documents must still be the governed documents.
 *
 * `governedDocuments.generated.ts` is a build artifact carrying the canonical Markdown and the
 * governed OpenAPI document into the application bundle, because those files live outside
 * `outputFileTracingRoot` and a deployed runtime cannot read them. An artifact that can drift from
 * its source is a second source of truth wearing a disguise, so this regenerates from the canonical
 * files and refuses the build if a single byte differs.
 *
 * WHEN THE SOURCES ARE ABSENT. A build environment that checked out only the application directory
 * has nothing to compare against. That is reported and skipped rather than failed: CI checks out the
 * whole repository and is where drift is caught, and failing here would turn "cannot verify" into
 * "is wrong", which are different facts.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    GOVERNED_FILES,
    GOVERNED_OPENAPI_FILE,
    OUTPUT_PATH,
    readGovernedSources,
    renderModule,
} from "./generateGovernedDocuments.mjs";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(WEB, "..");

const missing = [...GOVERNED_FILES, GOVERNED_OPENAPI_FILE].filter((f) => !existsSync(join(REPO, f)));

process.stdout.write(`Governed document embedding — ${GOVERNED_FILES.length} documents + OpenAPI\n\n`);

if (missing.length) {
    process.stdout.write(
        `  canonical sources are not present in this checkout (${missing.length} of `
        + `${GOVERNED_FILES.length + 1}); drift is verified in CI, which checks out the repository.\n`,
    );
    process.stdout.write("\n✓ skipped — nothing to compare against.\n");
    process.exit(0);
}

if (!existsSync(OUTPUT_PATH)) {
    process.stdout.write("✗ the embedded artifact does not exist.\n\n  Run: npm run generate:governed-documents\n");
    process.exit(1);
}

const expected = renderModule(readGovernedSources(REPO));
const actual = readFileSync(OUTPUT_PATH, "utf8");

if (expected === actual) {
    process.stdout.write("✓ the embedded documents match their canonical sources byte for byte.\n");
    process.exit(0);
}

process.stdout.write(
    "✗ the embedded documents no longer match their canonical sources.\n\n"
    + "  The canonical Markdown or the governed OpenAPI document changed and the artifact the\n"
    + "  product serves did not. Regenerate it — never edit it by hand:\n\n"
    + "      npm run generate:governed-documents\n",
);
process.exit(1);
