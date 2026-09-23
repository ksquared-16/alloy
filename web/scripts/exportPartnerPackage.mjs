#!/usr/bin/env node
/**
 * Export the offline partner package as a single portable archive.
 *
 * ── WHY THIS EXISTS ──
 *
 * The package is canonical in the repository, which is the right place for it and the wrong place
 * to read it from. Getting a current copy onto another machine should not require knowing how this
 * repository is laid out, which files are partner-facing and which are authoring sources, or that
 * `source/` must not ship.
 *
 * So: one command, one archive, one absolute path printed at the end.
 *
 * It rebuilds the package from canonical sources first and then verifies it, because an export is
 * exactly the moment a stale copy does damage — it leaves the building and nobody can correct it
 * afterwards.
 *
 * The archive is written under `dist/`, which is git-ignored. Generated binaries are not committed.
 *
 *   node scripts/exportPartnerPackage.mjs
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REPO = path.dirname(WEB);
const PKG = path.join(REPO, "docs/api/developer-platform/package");
const DIST = path.join(REPO, "dist");
const NAME = "alloy-classroom-coach-partner-package";
const STAGE = path.join(DIST, NAME);
const ARCHIVE = path.join(DIST, `${NAME}.zip`);

/** Exactly what a partner receives. `source/` is authoring material and never ships. */
const CONTENTS = [
    "README.md",
    "01-integrating-with-alloy.md",
    "02-technical-specification.md",
    "03-openapi/alloy-public-api.v1.json",
    "06-mapping-worksheet.md",
    "07-discovery-questions.md",
];

const run = (args) => execFileSync("node", args, { cwd: WEB, stdio: "inherit" });

console.log("Rebuilding the package from canonical sources…");
run(["scripts/buildPartnerPackage.mjs"]);
console.log("Verifying it is current…");
run(["scripts/buildPartnerPackage.mjs", "--check"]);

rmSync(STAGE, { recursive: true, force: true });
rmSync(ARCHIVE, { force: true });
mkdirSync(STAGE, { recursive: true });

for (const rel of CONTENTS) {
    const from = path.join(PKG, rel);
    if (!existsSync(from)) {
        console.error(`Missing package file: ${rel}`);
        process.exit(1);
    }
    const to = path.join(STAGE, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to);
}

/*
 * -X drops the extended attributes and resource forks macOS would otherwise bury in the archive,
 * so what a recipient unzips is the six files and nothing else. The exclusions are belt-and-braces:
 * nothing in the staging directory should match them, and if something ever does, it still must not
 * leave the building.
 */
execFileSync(
    "zip",
    ["-r", "-X", "-q", ARCHIVE, NAME, "-x", "*.DS_Store", "-x", "__MACOSX/*", "-x", "*/.git/*"],
    { cwd: DIST, stdio: "inherit" },
);

// Verify what actually ended up inside, rather than what we believe we put there.
const listing = execFileSync("unzip", ["-Z1", ARCHIVE], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.endsWith("/"));

const expected = new Set(CONTENTS.map((c) => `${NAME}/${c}`));
const actual = new Set(listing);
const missing = [...expected].filter((e) => !actual.has(e));
const unexpected = [...actual].filter((a) => !expected.has(a));

if (missing.length || unexpected.length) {
    if (missing.length) console.error("Missing from archive:\n" + missing.map((m) => `  - ${m}`).join("\n"));
    if (unexpected.length) console.error("Unexpected in archive:\n" + unexpected.map((u) => `  - ${u}`).join("\n"));
    process.exit(1);
}

// A partner reading a contract that does not parse has been sent nothing.
JSON.parse(readFileSync(path.join(STAGE, "03-openapi/alloy-public-api.v1.json"), "utf8"));

rmSync(STAGE, { recursive: true, force: true });

const size = statSync(ARCHIVE).size;
console.log("");
console.log(`Partner package archived — ${listing.length} files, ${(size / 1024).toFixed(0)} KB`);
console.log("");
console.log(ARCHIVE);
