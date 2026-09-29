/**
 * The Runtime Performance freeze must stay discoverable, singular, and anchored to real code.
 *
 * The freeze (`docs/platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md`) records a completed
 * programme: fifteen canonical laws, a load-bearing seam map, the guards that hold each law, and the
 * procedure a future change must follow. It arrived unreferenced from `docs/README.md`, which meant
 * the one document that stops a future worker re-deriving the whole performance audit was reachable
 * only by knowing its filename.
 *
 * Three properties are worth holding mechanically. The freeze stays indexed. Its laws stay stated
 * once — the certification points at §3 rather than restating it, which is what keeps the two from
 * drifting. And the seam map keeps naming files that exist, because a rename would silently detach
 * the contract from the code it constrains. None of this asserts the performance result itself;
 * that is what the freeze's own guards in §6 are for.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(path.join(repoRoot, p), "utf8");
const FREEZE = "docs/platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md";
const CERT = "docs/platform/runtime/operator-runtime-performance-certification.md";

describe("Runtime Performance freeze documentation authority", () => {
    it("is reachable from the canonical documentation index", () => {
        const readme = read("docs/README.md");
        expect(readme, "the freeze must be indexed or it is findable only by filename")
            .toContain("platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md");
        expect(readme, "its certification record belongs in the same chain").toContain(
            "platform/runtime/operator-runtime-performance-certification.md",
        );
    });

    it("stays a freeze record, not re-opened as ordinary doctrine", () => {
        const fm = read(FREEZE).split("\n").slice(0, 8).join("\n");
        expect(fm, "status: frozen is what makes §10's change procedure meaningful")
            .toMatch(/^status:\s*frozen\s*$/m);
    });

    it("states its laws once — the certification points rather than restates", () => {
        const freeze = read(FREEZE);
        expect(freeze, "the freeze must still carry the canonical law list").toMatch(/##\s*3\.\s*Canonical laws/);
        expect(read(CERT), "the certification must reference the freeze instead of copying its laws")
            .toContain("WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md");
    });

    it("the load-bearing seam map still names files that exist", () => {
        // Line numbers drift by the freeze's own instruction; paths must not.
        const seams = [...read(FREEZE).matchAll(/`(web\/[A-Za-z0-9_./-]+\.(?:ts|tsx|css|json))`/g)]
            .map((m) => m[1]);
        const unique = [...new Set(seams)];
        expect(unique.length, "the seam map disappeared").toBeGreaterThanOrEqual(10);
        for (const file of unique) {
            expect(existsSync(path.join(repoRoot, file)), `seam named by the freeze is gone: ${file}`).toBe(true);
        }
    });

    it("the guard suites the freeze relies on still exist", () => {
        const guards = [...read(FREEZE).matchAll(/`(tests\/[A-Za-z0-9_./-]+\.test\.tsx?)`/g)].map((m) => m[1]);
        const unique = [...new Set(guards)];
        expect(unique.length, "the guard table disappeared").toBeGreaterThanOrEqual(5);
        for (const t of unique) {
            expect(existsSync(path.join(repoRoot, "web", t)), `guard named by the freeze is gone: ${t}`).toBe(true);
        }
    });
});
