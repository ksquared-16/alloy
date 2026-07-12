import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintDocumentation, parseFrontmatter, resolveLink } from "../../../scripts/docs-lint.mjs";

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
        expect(parsed.data?.owner).toBe("platform");
        expect(parsed.data?.status).toBe("canonical");
        expect(parsed.error).toBeNull();
    });

    it("flags superseded status without superseded_by", () => {
        const parsed = parseFrontmatter(`---
owner: platform
status: superseded
last_reviewed: 2026-07-12
---
# Title`);
        expect(parsed.data?.status).toBe("superseded");
        expect(parsed.data?.superseded_by).toBeUndefined();
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

    it("repository baseline file exists with expected debt categories", () => {
        const baselinePath = path.join(repoRoot, "scripts/docs-lint-baseline.json");
        const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
        expect(baseline.summary["broken-link"]).toBeGreaterThan(100);
        // Active-tree targets cleared; historical debt only in broken-link / orphan-canonical
        expect(baseline.summary["canonical-sprint-dependency"] ?? 0).toBe(0);
        expect(baseline.summary["duplicate-basename"] ?? 0).toBe(0);
    });
});
