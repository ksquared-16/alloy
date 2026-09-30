import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isGovernedPath, lintDocumentation, parseFrontmatter, resolveLink } from "../../../scripts/docs-lint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function fixtureRoot(name: string) {
    return path.join(repoRoot, "scripts/docs-lint-fixtures", name);
}

describe("docs-lint", () => {
    it("parses valid governed frontmatter", () => {
        const parsed = parseFrontmatter(`---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---
# Title`);
        const data = parsed.data as Record<string, unknown> | null;
        expect(data?.owner).toBe("platform");
        expect(data?.status).toBe("canonical");
        expect(parsed.error).toBeNull();
    });

    it("flags superseded status without superseded_by", () => {
        const parsed = parseFrontmatter(`---
owner: platform
status: superseded
last_reviewed: 2026-07-12
---
# Title`);
        const data = parsed.data as Record<string, unknown> | null;
        expect(data?.status).toBe("superseded");
        expect(data?.superseded_by).toBeUndefined();
    });

    it("resolves relative markdown links", () => {
        const resolved = resolveLink("docs/README.md", "platform/sample.md", fixtureRoot("valid-canonical"));
        expect(resolved.exists).toBe(true);
        expect(resolved.resolved).toBe("docs/platform/sample.md");
    });

    it("reports no violations for valid canonical fixture tree", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("valid-canonical"),
        });
        const blocking = violations.filter((v) => v.type === "broken-link" || v.type === "invalid-root-placement");
        expect(blocking).toEqual([]);
    });

    it("reports broken links in canonical fixture scope", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("broken-link"),
        });
        expect(violations.some((v) => v.type === "broken-link" && v.file === "docs/platform/broken.md")).toBe(true);
    });

    it("reports invalid docs root placement", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("invalid-root"),
        });
        expect(violations.some((v) => v.type === "invalid-root-placement")).toBe(true);
    });

    it("flags retired Operational Expectations doctrine in governed docs (G-Reconciliation guard)", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("retired-doctrine"),
        });
        const retired = violations.filter((v) => v.type === "retired-doctrine-term");
        expect(retired.length).toBeGreaterThan(0);
        expect(retired.every((v) => v.file === "docs/platform/stale.md")).toBe(true);
        expect(retired.every((v) => v.blocking === true)).toBe(true);
    });

    it("does not flag retired doctrine in the clean canonical fixture", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("valid-canonical"),
        });
        expect(violations.some((v) => v.type === "retired-doctrine-term")).toBe(false);
    });

    it("repository baseline file exists with expected debt categories", () => {
        const baselinePath = path.join(repoRoot, "scripts/docs-lint-baseline.json");
        const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
        expect(baseline.summary["broken-link"]).toBeGreaterThan(100);
        // generated-boundary is genuinely cleared: `generated` is now a declared property of a
        // document rather than an assumption about its directory, so docs/api's hand-authored
        // doctrine is no longer flagged as defective generator output.
        expect(baseline.summary["generated-boundary"] ?? 0).toBe(0);
        // duplicate-basename is cleared, but by scoping rather than by moving files: every
        // instance was a pair inside docs/platform/planning/, which is now a declared exception
        // and is no longer compared as active canonical doctrine.
        expect(baseline.summary["duplicate-basename"] ?? 0).toBe(0);
        // canonical-sprint-dependency is NOT cleared. Asserting zero here previously made the
        // test pass by reading a stale baseline file while the repository carried real debt.
        expect(baseline.summary["canonical-sprint-dependency"] ?? 0).toBeGreaterThan(0);
        // The planning exception is deliberately visible, not silent: these three rules exist
        // because of it and must keep reporting.
        expect(baseline.summary["canonical-in-planning"] ?? 0).toBeGreaterThan(0);
        expect(baseline.summary["sprint-artifact-in-platform"] ?? 0).toBeGreaterThan(0);
        expect(baseline.summary["canonical-planning-dependency"] ?? 0).toBeGreaterThan(0);
    });
});

/**
 * Developer Platform documentation authority.
 *
 * The September 2026 census found the frozen external contract in a bad position: 27 dated
 * workstream records under `docs/api/developer-platform/product/` declared `status: canonical`
 * while carrying surface counts the contract had retired — and their `last_reviewed` dates were
 * NEWER than the current guide's, so any recency heuristic picked the stale document. The API
 * corpus also sat outside `GOVERNED_GLOBS`, so docs-lint never checked it, and the canonical
 * documentation map did not mention the public API at all.
 *
 * These assertions lock the repair, not the prose. They say nothing about the contract itself.
 */
describe("Developer Platform documentation authority", () => {
    it("no dated workstream record claims canonical authority", () => {
        const dir = path.join(repoRoot, "docs/api/developer-platform/product");
        const dated = readdirSync(dir).filter((f) => /^\d+-.*\.md$/.test(f));
        expect(dated.length, "the product history set disappeared").toBeGreaterThan(20);
        for (const file of dated) {
            const fm = readFileSync(path.join(dir, file), "utf8").split("\n").slice(0, 12).join("\n");
            expect(fm, `${file} must declare a status`).toMatch(/^status:/m);
            expect(
                fm,
                `${file} is a dated execution record; canonical status makes it outrank the frozen contract`,
            ).not.toMatch(/^status:\s*canonical\s*$/m);
        }
    });

    it("governs the API corpus but never the generated partner members", () => {
        // The six shipped members must stay frontmatter-free: the generator strips it and
        // partnerPackage.test.ts fails if `owner:`/`status:` reaches a partner.
        expect(isGovernedPath("docs/api/developer-platform/external/alloy-developer-platform-specification.md")).toBe(true);
        expect(isGovernedPath("docs/api/developer-platform/guide/integrating.md")).toBe(true);
        expect(isGovernedPath("docs/api/openapi/README.md")).toBe(true);
        expect(isGovernedPath("docs/api/developer-platform/product/15-thread-7-public-api-expansion-handoff.md")).toBe(true);
        expect(isGovernedPath("docs/api/developer-platform/package/01-integrating-with-alloy.md")).toBe(false);
        expect(isGovernedPath("docs/api/developer-platform/package/README.md")).toBe(false);
        // …but their canonical sources are governed.
        expect(isGovernedPath("docs/api/developer-platform/package/source/00-README.md")).toBe(true);
        expect(isGovernedPath("docs/api/developer-platform/package/source/06-mapping-worksheet.md")).toBe(true);
    });

    it("the canonical documentation map reaches the current external contract", () => {
        const readme = readFileSync(path.join(repoRoot, "docs/README.md"), "utf8");
        expect(readme, "docs/README.md must route to the specification that owns the contract")
            .toContain("api/developer-platform/external/alloy-developer-platform-specification.md");
        expect(readme, "and to the integration read").toContain("api/developer-platform/guide/integrating.md");
        expect(readme, "the generated package must not be presented as an authority")
            .toMatch(/package\/[^\n]*\*\*generated\*\*|\*\*generated\*\*[^\n]*package/i);
        const caps = readFileSync(path.join(repoRoot, "docs/platform/foundation/platform-capabilities.md"), "utf8");
        expect(caps, "the capability inventory must carry the Developer Platform")
            .toMatch(/Developer Platform \/ Public API/);
    });
});

/**
 * The internal/external API authority boundary.
 *
 * Packet 2 found three canonical documents that would mislead a reader — or a model — about
 * which API contract governs what. `api-response-contract.md` called itself "the source of
 * truth for new and migrated routes" with an `{ok, data}` / SCREAMING_SNAKE envelope and never
 * mentioned `/api/v1`. `api-architecture.md` claimed to govern "all Alloy API work" while its
 * surface taxonomy had no class for `/api/v1` at all. And `docs/api/README.md` still described
 * the shipped, promoted, frozen Developer Platform as "future work" and "nothing is built".
 *
 * Measurement settled it: zero public response schemas carry `ok` or `correlation_id`, and the
 * `ok: true` inside `/api/v1` routes is `perform()`'s internal discriminant, never an HTTP body.
 * The envelopes are disjoint. These assertions keep that boundary stated rather than inferred.
 */
describe("internal /api/admin and external /api/v1 are bounded against each other", () => {
    const read = (p: string) => readFileSync(path.join(repoRoot, p), "utf8");

    it("the internal response contract says it is internal and points at the public authority", () => {
        const doc = read("docs/api/api-response-contract.md");
        expect(doc, "must scope itself to the internal surface").toMatch(/Scope:\s*Alloy's INTERNAL API only/i);
        expect(doc, "must disclaim the external contract").toMatch(/does\s*\*\*not\*\*\s*define the external Developer Platform contract/i);
        expect(doc, "must route to the public authority")
            .toContain("developer-platform/external/alloy-developer-platform-specification.md");
    });

    it("the API doctrine owner classifies /api/v1 and excludes it from the internal envelope", () => {
        const doc = read("docs/api/api-architecture.md");
        expect(doc, "the surface taxonomy must have a class for the external platform")
            .toMatch(/\*\*External Developer Platform\*\*\s*\|\s*`\/api\/v1\/\*\*`/);
        expect(doc, "the internal envelope must disclaim /api/v1").toMatch(/This envelope is internal/);
        expect(doc, "shared substrate must not be read as a shared contract")
            .toMatch(/shared code is not a shared external[\s]*contract/i);
    });

    it("the canonical API index does not call the shipped platform future work", () => {
        const doc = read("docs/api/README.md");
        expect(doc, "the public platform is no longer future work")
            .not.toMatch(/`\/api\/v1`[^.]*\) is future work/);
        expect(doc, "and is no longer unbuilt").not.toMatch(/Specification only; nothing is built/);
        expect(doc, "the two OpenAPI documents must be distinguished")
            .toContain("alloy-public-api.v1.json");
    });

    it("the 01-07 design series keeps the canonical doctrine authority it declares", () => {
        // Deliberately NOT relabelled: developer-platform/README.md states, dated 2026-09-14,
        // that these documents remain the canonical owner of doctrine while the specification
        // owns the external contract. They carry rejected alternatives and ratification
        // provenance the contract does not restate, and assert no stale surface fact.
        const index = read("docs/api/developer-platform/README.md");
        expect(index, "the doctrine/contract split must stay stated")
            .toMatch(/remain the canonical owner of[\s>]*doctrine/i);
        for (const n of ["01", "02", "03", "04", "05", "06", "07"]) {
            const file = readdirSync(path.join(repoRoot, "docs/api/developer-platform"))
                .find((f) => f.startsWith(`${n}-`) && f.endsWith(".md"));
            expect(file, `design-series document ${n} is missing`).toBeTruthy();
            const fm = read(`docs/api/developer-platform/${file}`).split("\n").slice(0, 10).join("\n");
            expect(fm, `${file} owns doctrine; demoting it removes the only declared owner`)
                .toMatch(/^status:\s*canonical\s*$/m);
        }
    });
});

describe("orphan-canonical follows the documented discoverability chain", () => {
    /*
     * root index -> domain index -> canonical child. Two hops, deliberately not transitive:
     * a document cited only by another deep document is still an orphan.
     */
    it("treats a child cited by a root-cited domain index as discoverable", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("two-hop-discoverable"),
        });
        expect(violations.filter((v: { type: string }) => v.type === "orphan-canonical")).toEqual([]);
    });

    it("still flags a canonical doc that no index reaches", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("two-hop-orphan"),
        });
        const orphans = violations.filter((v: { type: string }) => v.type === "orphan-canonical");
        expect(orphans.map((v: { file: string }) => v.file)).toContain("docs/platform/core/unreachable.md");
    });

    it("does not follow a third hop — deep-only citation is still an orphan", () => {
        const violations = lintDocumentation({
            rootDir: fixtureRoot("two-hop-third-hop"),
        });
        const orphans = violations.filter((v: { type: string }) => v.type === "orphan-canonical");
        expect(orphans.map((v: { file: string }) => v.file)).toContain("docs/platform/core/third-hop.md");
    });
});
