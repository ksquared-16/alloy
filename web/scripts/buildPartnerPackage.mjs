#!/usr/bin/env node
/**
 * Assemble the offline partner technical package.
 *
 * ── WHY THIS IS GENERATED AND NOT HAND-ASSEMBLED ──
 *
 * The package has to work offline, which means the specification, the guide and the OpenAPI
 * artifact are physically inside it rather than linked. That is two copies of every document, and
 * two copies of a document is how a partner ends up integrating against the older one. So the
 * package is a BUILD ARTIFACT: edit the canonical sources, run this, and the copies follow.
 *
 * `--check` verifies the committed package matches its sources and exits non-zero if not, which is
 * what stops a specification edit from silently leaving a stale package behind.
 *
 * Internal governance frontmatter (owner, status, review dates) is stripped on the way in. It is
 * how Alloy tracks a document, not something a partner should receive.
 *
 *   node scripts/buildPartnerPackage.mjs [--check]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO = path.dirname(WEB);
const PKG = path.join(REPO, "docs/api/developer-platform/package");
const SRC = path.join(PKG, "source");

/** Governance frontmatter is Alloy's bookkeeping, not the partner's. */
function stripFrontmatter(text) {
    if (!text.startsWith("---\n")) return text;
    const end = text.indexOf("\n---\n", 4);
    return end === -1 ? text : text.slice(end + 5).replace(/^\n+/, "");
}

const PARTS = [
    { out: "README.md", from: path.join(SRC, "00-README.md") },
    { out: "01-integrating-with-alloy.md", from: path.join(REPO, "docs/api/developer-platform/guide/integrating.md") },
    {
        out: "02-technical-specification.md",
        from: path.join(REPO, "docs/api/developer-platform/external/alloy-developer-platform-specification.md"),
    },
    {
        out: "03-openapi/alloy-public-api.v1.json",
        from: path.join(REPO, "docs/api/openapi/alloy-public-api.v1.json"),
        raw: true,
    },
    { out: "06-mapping-worksheet.md", from: path.join(SRC, "06-mapping-worksheet.md") },
    { out: "07-discovery-questions.md", from: path.join(SRC, "07-discovery-questions.md") },
];

const check = process.argv.includes("--check");
const problems = [];
let written = 0;

for (const part of PARTS) {
    if (!existsSync(part.from)) {
        problems.push(`missing source: ${path.relative(REPO, part.from)}`);
        continue;
    }
    const source = readFileSync(part.from, "utf8");
    const content = part.raw ? source : stripFrontmatter(source);
    const target = path.join(PKG, part.out);

    if (check) {
        if (!existsSync(target)) {
            problems.push(`package file missing: ${part.out} — run: npm run build:partner-package`);
        } else if (readFileSync(target, "utf8") !== content) {
            problems.push(`package file is stale: ${part.out} — run: npm run build:partner-package`);
        }
        continue;
    }

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    written += 1;
}

// A file nobody generates is a file nobody maintains; it must not ship in a partner package.
const expected = new Set(["source", ...PARTS.map((p) => p.out.split("/")[0])]);
if (existsSync(PKG)) {
    for (const entry of readdirSync(PKG)) {
        if (expected.has(entry)) continue;
        if (check) problems.push(`unexpected file in package: ${entry}`);
        else rmSync(path.join(PKG, entry), { recursive: true, force: true });
    }
}

if (problems.length > 0) {
    console.error("Partner package is not current:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
}
console.log(
    check
        ? `Partner package is current — ${PARTS.length} files verified.`
        : `Partner package assembled — ${written} files → docs/api/developer-platform/package/`,
);
