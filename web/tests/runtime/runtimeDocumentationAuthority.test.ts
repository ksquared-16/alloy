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

/**
 * The freeze depends on a document in an ungoverned tree, and that dependency must not break quietly.
 *
 * Law 9 names `docs/runtime/CARD-READINESS-LIFECYCLE.md` §8 as the canonical definition of
 * `ALL_FIRST_ORDER_READY`. That file sits in `docs/runtime/`, which is deliberately NOT inside
 * `GOVERNED_GLOBS`: all 52 of its files would fail governance today (33 declare a status outside the
 * seven-value vocabulary, 19 carry no frontmatter), and prior-audit D9 records the real blocker —
 * 18 `web/` source and test files cite that tree, including the live work-unit route, so relocating
 * it without rewriting those citations breaks the doc-to-code binding silently.
 *
 * Until that scheduled refactor happens, the cross-tree dependency is held here instead of by lint.
 * The document must exist, the section must still define the term, and the registry the definition
 * names must still be there. This asserts the CITATION resolves — not what readiness means, which is
 * the freeze's and §8's business.
 *
 * Note for whoever governs `docs/runtime/` later: the file carries two sections numbered 8. The one
 * that owns the definition is the second (added 2026-09-25 from the OX J5 convergence run), not the
 * "Open questions" section earlier in the file.
 */
describe("the freeze's cross-tree readiness dependency resolves", () => {
    const READINESS = "docs/runtime/CARD-READINESS-LIFECYCLE.md";

    it("the document Law 9 cites still exists", () => {
        expect(existsSync(path.join(repoRoot, READINESS)), `${READINESS} is named by a frozen law`).toBe(true);
    });

    it("a section still defines ALL_FIRST_ORDER_READY, and the freeze still points at it", () => {
        const doc = read(READINESS);
        expect(doc, "the term must still be defined in the cited document").toMatch(
            /^##\s*8\.\s*`?ALL_FIRST_ORDER_READY`?/m,
        );
        expect(doc, "the definition's terminal states must still be stated").toMatch(
            /`ready`\s*or\s*`self_loading`/,
        );
        expect(read(FREEZE), "Law 9 must still cite the document").toContain("CARD-READINESS-LIFECYCLE.md");
    });

    it("the registry the definition names still exists", () => {
        // "First-order means the commit-critical registry (`focusPanelCommitCriticalCards.ts`)".
        expect(
            existsSync(path.join(repoRoot, "web/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards.ts")),
            "the definition of first-order depends on this registry",
        ).toBe(true);
    });

    it("being governed is not the same as being a context owner", () => {
        // docs/runtime/ is ungoverned by evidence, not by oversight; docs/platform/runtime/ is governed
        // but holds proposed and historical files too. Neither glob membership decides authority — the
        // freeze's chain does. This asserts the asymmetry is real so it is not "tidied" unexamined.
        const lint = read("scripts/docs-lint.mjs");
        expect(lint, "docs/platform IS governed").toMatch(/\/\^docs\\\/platform\\\//);
        expect(
            /\/\^docs\\\/runtime\\\//.test(lint),
            "docs/runtime is intentionally ungoverned pending D9's citation refactor; governing it " +
                "without rewriting the 18 code citations breaks the doc-to-code binding",
        ).toBe(false);
    });
});
