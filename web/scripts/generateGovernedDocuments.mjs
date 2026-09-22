#!/usr/bin/env node
/**
 * Embed the governed Developer Platform sources into the application bundle.
 *
 * ── WHY THIS EXISTS ──
 *
 * The documentation routes read their canonical Markdown, and the API reference route reads the
 * governed OpenAPI document, with `readFileSync(path.join(process.cwd(), "..", …))`. Both facts
 * defeat Next's file tracer at once: the path is built at runtime, so the tracer cannot see it, and
 * it resolves OUTSIDE `outputFileTracingRoot`, which is `web/`, so it could not be included even if
 * it could be seen. In development the whole repository is on disk and everything works. In a
 * deployed serverless runtime the files are simply absent — `loadDocument` returns null, the page
 * calls `notFound()`, and every documentation destination and the API Reference answer 404.
 *
 * This is the same failure class `next.config.ts` already documents for the OCR model two lines
 * above the include that fixes it. The difference is that OCR could be force-included; these files
 * live outside the trace root entirely.
 *
 * ── WHAT THIS IS, AND IS NOT ──
 *
 * It is a BUILD ARTIFACT, generated from the canonical files and never edited. The `.md` files under
 * `docs/api/developer-platform/**` and the governed `alloy-public-api.v1.json` remain the only
 * authored source; nothing here rewrites, summarises, or reformats them — the bytes are carried
 * across verbatim, which is what keeps code examples exact. `checkGovernedDocuments.mjs` regenerates
 * and compares on every build, so the artifact cannot drift from the sources it was made from.
 *
 * It is NOT a second documentation authority. Editing the generated file is meaningless: the guard
 * fails, and the next generation overwrites it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(WEB, "..");

export const OUTPUT_PATH = join(WEB, "lib/developerDocs/governedDocuments.generated.ts");

/**
 * Every governed file the product serves, named explicitly.
 *
 * A glob would quietly start publishing whatever someone adds to the directory next. The external
 * boundary is a decision, so it is a list.
 */
export const GOVERNED_FILES = Object.freeze([
    "docs/api/developer-platform/guide/README.md",
    "docs/api/developer-platform/guide/locations.md",
    "docs/api/developer-platform/guide/conventions.md",
    "docs/api/developer-platform/guide/integrating.md",
    "docs/api/developer-platform/external/alloy-developer-platform-specification.md",
]);

export const GOVERNED_OPENAPI_FILE = "docs/api/openapi/alloy-public-api.v1.json";

/** Read the canonical sources. Throws if one is missing — a silent gap is the defect being fixed. */
export function readGovernedSources(repoRoot = REPO) {
    const documents = {};
    for (const file of GOVERNED_FILES) {
        documents[file] = readFileSync(join(repoRoot, file), "utf8");
    }
    return { documents, openapi: readFileSync(join(repoRoot, GOVERNED_OPENAPI_FILE), "utf8") };
}

/** Render the module. Deterministic: the same sources always produce the same bytes. */
export function renderModule({ documents, openapi }) {
    const entries = Object.keys(documents)
        .sort()
        .map((file) => `    ${JSON.stringify(file)}: ${JSON.stringify(documents[file])},`)
        .join("\n");

    return `/**
 * GENERATED — DO NOT EDIT.
 *
 * Produced by \`scripts/generateGovernedDocuments.mjs\` from the canonical sources under
 * \`docs/api/developer-platform/**\` and the governed OpenAPI document. Regenerate with:
 *
 *     npm run generate:governed-documents
 *
 * The bytes are carried across verbatim so code examples stay exact. \`npm run
 * check:governed-documents\` fails the build if this file and its sources disagree.
 *
 * It exists because those files live outside \`outputFileTracingRoot\` and were read by a runtime
 * path the file tracer cannot see, so a deployed serverless runtime did not have them and every
 * documentation destination answered 404.
 */

/** Canonical Markdown, keyed by repository-relative path. */
export const GOVERNED_DOCUMENT_SOURCES: Readonly<Record<string, string>> = Object.freeze({
${entries}
});

/** The governed public OpenAPI document, exactly as authored. */
export const GOVERNED_OPENAPI_DOCUMENT: string = ${JSON.stringify(openapi)};
`;
}

function main() {
    const sources = readGovernedSources();
    const module = renderModule(sources);
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, module, "utf8");
    const bytes = Object.values(sources.documents).reduce((n, s) => n + s.length, 0);
    process.stdout.write(
        `Governed documents embedded — ${GOVERNED_FILES.length} documents (${bytes} chars) + OpenAPI\n`
        + `  → ${OUTPUT_PATH.replace(`${WEB}/`, "")}\n`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
