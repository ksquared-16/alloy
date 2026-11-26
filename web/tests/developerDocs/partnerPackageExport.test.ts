/**
 * The partner package export.
 *
 * An export is the moment a stale or over-stuffed package does damage: it leaves the building and
 * nobody can correct it afterwards. So the archive is rebuilt from canonical sources, verified,
 * and then checked for what it actually contains rather than what we believe we put in it.
 *
 * This suite runs the real exporter and inspects the real archive.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, beforeAll } from "vitest";

const WEB = path.resolve(__dirname, "../..");
const REPO = path.dirname(WEB);
const ARCHIVE = path.join(REPO, "dist/alloy-classroom-coach-partner-package.zip");

const EXPECTED = [
    "alloy-classroom-coach-partner-package/README.md",
    "alloy-classroom-coach-partner-package/01-integrating-with-alloy.md",
    "alloy-classroom-coach-partner-package/02-technical-specification.md",
    "alloy-classroom-coach-partner-package/03-openapi/alloy-public-api.v1.json",
    "alloy-classroom-coach-partner-package/06-mapping-worksheet.md",
    "alloy-classroom-coach-partner-package/07-discovery-questions.md",
];

let listing: string[] = [];

describe("exporting the partner package", () => {
    beforeAll(() => {
        execFileSync("node", ["scripts/exportPartnerPackage.mjs"], { cwd: WEB, stdio: "pipe" });
        listing = execFileSync("unzip", ["-Z1", ARCHIVE], { encoding: "utf8" })
            .split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !l.endsWith("/"));
    }, 300_000);

    it("produces an archive at a deterministic path", () => {
        expect(existsSync(ARCHIVE)).toBe(true);
        expect(statSync(ARCHIVE).size).toBeGreaterThan(1024);
    });

    it("contains exactly the six partner files, and nothing else", () => {
        // Copy before sorting: Array.prototype.sort mutates, and EXPECTED is shared
        // with the assertions below.
        expect([...listing].sort()).toEqual([...EXPECTED].sort());
    });

    it("ships no authoring source, repository metadata or platform noise", () => {
        // `source/` is where the cover, worksheet and questions are authored. A partner receiving
        // it would be reading Alloy's drafts, and would not know which copy was the real one.
        for (const forbidden of [/\/source\//, /\.DS_Store/, /__MACOSX/, /\.git/, /node_modules/, /\.test\./]) {
            expect(listing.some((l) => forbidden.test(l)), `archive contains ${forbidden}`).toBe(false);
        }
    });

    it("ships a contract that parses", () => {
        const contract = EXPECTED.find((f) => f.endsWith(".json"))!;
        const json = execFileSync("unzip", ["-p", ARCHIVE, contract], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
        const spec = JSON.parse(json) as { openapi: string; paths: Record<string, unknown> };
        expect(spec.openapi).toMatch(/^3\./);
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });

    it("is never committed — a generated binary belongs in dist, not in history", () => {
        const tracked = execFileSync("git", ["ls-files", "dist"], { cwd: REPO, encoding: "utf8" }).trim();
        expect(tracked, "something under dist/ is tracked by git").toBe("");
        const ignore = readFileSync(path.join(REPO, ".gitignore"), "utf8");
        expect(ignore).toMatch(/^\/dist\/$/m);
    });
});
