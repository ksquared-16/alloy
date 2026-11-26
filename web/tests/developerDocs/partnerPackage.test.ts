/**
 * The offline partner package.
 *
 * ── WHAT THIS GUARDS ──
 *
 * The package exists to be handed to an engineering team that has no access to Alloy — no
 * repository, no login, no one to ask. Everything that makes that safe is invisible from inside
 * Alloy, where all of those things are available, so it has to be asserted rather than reviewed:
 *
 *   · it is CURRENT — a specification edit that leaves a stale copy behind is the failure mode,
 *     because the partner reads the copy;
 *   · it leaks NOTHING — no repository paths, no internal table names, no governance frontmatter,
 *     no certification vocabulary;
 *   · it is COMPLETE — every public operation the runtime serves is in the contract it ships;
 *   · it does not INVENT the provider's model.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { apiReference } from "@/lib/developerDocs/openApiReference";
import { GOVERNED_OPENAPI_DOCUMENT } from "@/lib/developerDocs/governedDocuments.generated";

const WEB = path.resolve(__dirname, "../..");
const REPO = path.dirname(WEB);
const PKG = path.join(REPO, "docs/api/developer-platform/package");

const read = (rel: string) => readFileSync(path.join(PKG, rel), "utf8");

const FILES = [
    "README.md",
    "01-integrating-with-alloy.md",
    "02-technical-specification.md",
    "03-openapi/alloy-public-api.v1.json",
    "06-mapping-worksheet.md",
    "07-discovery-questions.md",
];

/** Everything a partner must never receive, as it would actually appear. */
const FORBIDDEN: Array<[RegExp, string]> = [
    [/\b(web|src)\/[A-Za-z0-9_./-]+\.(ts|tsx|mjs|sql|json)\b/, "a repository path"],
    [/\bsupabase\b/i, "the word supabase"],
    [/\bmigration\b/i, "migration language"],
    [/\b(customer_members|person_child_relationships|child_enrollment_agreements|schedule_assignments|child_attendance_events|integration_resource_refs|app_installations|employments)\b/,
        "an internal table name"],
    [/\blist_external_[a-z_]+\b/, "an internal function name"],
    [/\bcertif(y|ied|ication)\b/i, "certification vocabulary"],
    [/^(owner|status|last_reviewed|supersedes|classification|audience):/m, "governance frontmatter"],
    [/\bPR #\d+\b/, "a pull request reference"],
    [/\badminV2\b/i, "internal admin transport"],
];

describe("the offline partner package", () => {
    it("ships every file the cover promises", () => {
        for (const file of FILES) {
            expect(existsSync(path.join(PKG, file)), `missing: ${file}`).toBe(true);
            expect(statSync(path.join(PKG, file)).size, `empty: ${file}`).toBeGreaterThan(0);
        }
    });

    it("is current with the canonical sources it was assembled from", () => {
        // The same comparison `npm run check:partner-package` makes, asserted here so an edit that
        // leaves the package stale fails the ordinary test run rather than waiting for a build.
        const strip = (text: string) => {
            if (!text.startsWith("---\n")) return text;
            const end = text.indexOf("\n---\n", 4);
            return end === -1 ? text : text.slice(end + 5).replace(/^\n+/, "");
        };
        const pairs: Array<[string, string, boolean]> = [
            ["README.md", "docs/api/developer-platform/package/source/00-README.md", false],
            ["01-integrating-with-alloy.md", "docs/api/developer-platform/guide/integrating.md", false],
            ["02-technical-specification.md",
                "docs/api/developer-platform/external/alloy-developer-platform-specification.md", false],
            ["03-openapi/alloy-public-api.v1.json", "docs/api/openapi/alloy-public-api.v1.json", true],
            ["06-mapping-worksheet.md", "docs/api/developer-platform/package/source/06-mapping-worksheet.md", false],
            ["07-discovery-questions.md", "docs/api/developer-platform/package/source/07-discovery-questions.md", false],
        ];
        for (const [out, from, raw] of pairs) {
            const source = readFileSync(path.join(REPO, from), "utf8");
            expect(read(out), `${out} is stale — run: npm run build:partner-package`)
                .toBe(raw ? source : strip(source));
        }
    });

    it("leaks nothing a partner must not receive", () => {
        for (const file of FILES) {
            const body = read(file);
            for (const [pattern, label] of FORBIDDEN) {
                expect(pattern.test(body), `${file} contains ${label}`).toBe(false);
            }
        }
    });

    it("carries the governed contract, identical to the one the product serves", () => {
        const shipped = read("03-openapi/alloy-public-api.v1.json");
        expect(JSON.parse(shipped)).toEqual(JSON.parse(GOVERNED_OPENAPI_DOCUMENT));
    });

    it("documents every operation the runtime actually serves", () => {
        const spec = JSON.parse(read("03-openapi/alloy-public-api.v1.json")) as {
            paths: Record<string, Record<string, { operationId?: string }>>;
        };
        const shipped = new Set<string>();
        for (const [p, ops] of Object.entries(spec.paths)) {
            for (const [method, op] of Object.entries(ops)) {
                shipped.add(`${method.toUpperCase()} ${p}`);
                expect(op.operationId, `${method} ${p} has no operationId`).toBeTruthy();
            }
        }
        const served = new Set(apiReference().operations.map((o) => `${o.method} ${o.path}`));
        expect([...shipped].sort()).toEqual([...served].sort());
    });

    it("names each resource in the prose a reader is told to start with", () => {
        const guide = read("01-integrating-with-alloy.md");
        for (const route of [
            "/api/v1/locations", "/api/v1/children", "/api/v1/households", "/api/v1/relationships",
            "/api/v1/enrollments", "/api/v1/placements", "/api/v1/schedule-assignments",
            "/api/v1/schedule-days", "/api/v1/staff", "/api/v1/attendance-events",
            "/api/v1/context", "/api/v1/oauth/token",
        ]) {
            expect(guide, `the guide never mentions ${route}`).toContain(route);
        }
    });

    it("states each exclusion the partner would otherwise plan around", () => {
        const cover = read("README.md").toLowerCase();
        for (const exclusion of ["communications", "financials", "webhook", "safeguarding", "correlation"]) {
            expect(cover, `the cover does not state that ${exclusion} is excluded`).toContain(exclusion);
        }
    });

    it("asks the provider rather than assuming them", () => {
        const worksheet = read("06-mapping-worksheet.md");
        /*
         * Every provider column is explicitly unanswered. If this count ever collapses, someone has
         * filled the provider's side in from imagination — which is the one thing the worksheet
         * exists to avoid.
         */
        const unknowns = worksheet.match(/Provider confirmation required/g) ?? [];
        expect(unknowns.length, "the worksheet should be mostly unanswered on the provider side")
            .toBeGreaterThan(60);
        expect(worksheet).toContain("we have deliberately not guessed");

        const questions = read("07-discovery-questions.md");
        const numbered = questions.match(/^\d+\.\s\*\*/gm) ?? [];
        expect(numbered.length, "the discovery list should be substantive").toBeGreaterThanOrEqual(20);
    });

    it("contains no file nobody generates", () => {
        const allowed = new Set(["source", ...FILES.map((f) => f.split("/")[0])]);
        for (const entry of readdirSync(PKG)) {
            expect(allowed.has(entry), `unexpected file in the package: ${entry}`).toBe(true);
        }
    });
});
