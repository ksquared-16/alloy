/**
 * SOURCE PRESENCE IS NOT RUNTIME BEHAVIOUR.
 *
 * A certification test that reads a component's source and asserts `toContain("…")` proves the
 * markup was TYPED. It does not prove the component renders, and it cannot tell the difference
 * between the component the product mounts and one that merely looks like it.
 *
 * That difference cost this repository two merge-and-deploy cycles. Three components all looked
 * like "Current Work":
 *
 *   CurrentWorkWorkspace.tsx        legacy; imported by NO product code — since DELETED
 *   CurrentWorkCard -> SummaryBody  superseded wherever the Process Card owns the region
 *   CurrentWorkFocusedSurface       what the focused workspace actually renders
 *
 * Secondary work was implemented in the first two. Their source guards were green the whole time,
 * and the feature was unreachable on staging in both cases.
 *
 * This file locks the SHAPE of that failure rather than the incident. It is deliberately two tests:
 * the first reproduces the false positive so it can be seen failing-to-fail, and the second is the
 * generic invariant that makes it impossible to repeat quietly.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

const REPO = resolve(__dirname, "../..");
const CARDS = resolve(REPO, "components/admin/focusPanel/cards");

/* ────────────────────────────── the false positive, reproduced ───────────────────────────── */

/** Contains the marker. Never mounted — this is the shape of the component that fooled us. */
function UnmountedLookalike() {
    return <div data-testid="the-contract-marker">Secondary work</div>;
}

/** What the runtime actually renders. Does NOT contain the marker. */
function ActuallyRendered() {
    return <div data-testid="something-else">Primary work</div>;
}

describe("the false positive, reproduced", () => {
    it("a source-presence assertion passes against a component nothing renders", () => {
        // Exactly the assertion shape used across focus-panel certification.
        const source = readFileSync(__filename, "utf8");
        expect(source).toContain("the-contract-marker");
        // Green. And it has told us nothing about what an operator sees.
    });

    it("rendering the path that actually runs correctly fails the same claim", () => {
        const html = renderToStaticMarkup(<ActuallyRendered />);
        expect(html).not.toContain("the-contract-marker");
    });

    it("the marker only appears when the component carrying it is the one mounted", () => {
        expect(renderToStaticMarkup(<UnmountedLookalike />)).toContain("the-contract-marker");
    });
});

/* ────────────────────────── the invariant that prevents the repeat ───────────────────────── */

/**
 * A focus-panel card that no product code imports cannot certify anything.
 *
 * `CurrentWorkWorkspace.tsx` was 644 lines whose only importer in the entire repository was the
 * test that certified it. A component in that state keeps satisfying source guards forever while
 * the product renders something else entirely, and nothing in CI notices. It has since been
 * deleted, along with `AssignmentCardSections` and `AssignmentProposalControls`; this check is what
 * keeps the next one from lasting as long.
 *
 * Scoped to focus-panel cards on purpose: this is the surface where the confusion actually
 * happened, and a repo-wide version would be a different, much noisier test.
 */
function productImportersOf(componentName: string): string[] {
    const roots = [resolve(REPO, "components"), resolve(REPO, "app"), resolve(REPO, "lib")];
    const hits: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name === ".next") continue;
                walk(full);
                continue;
            }
            if (!/\.tsx?$/.test(entry.name)) continue;
            if (full.endsWith(`cards/${componentName}.tsx`)) continue; // not its own importer
            const src = readFileSync(full, "utf8");
            /*
             * Both import forms count. A card can be reached by a static `from "…"` or by a dynamic
             * `import("…")` — `CurrentWorkAddChildPanel` is preloaded as a chunk exactly that way,
             * and an importer check that only understood the static form would have condemned five
             * live components as dead on its first run.
             */
            // Three spellings all count as reachable. Requiring `cards/` in the path missed
            // `FinancialsCard`'s relative sibling import of `CardCollectionField`, and matching only
            // `from` missed the dynamic chunk preloads — each near-miss would have condemned a live
            // component. An importer check that is wrong in this direction is worse than none.
            const path = `(?:[^"']*cards/|\\./)${componentName}`;
            const reachable =
                new RegExp(`from\\s+["']${path}["']`).test(src)
                || new RegExp(`import\\(\\s*["']${path}["']`).test(src);
            if (reachable) hits.push(full);
        }
    };
    for (const r of roots) walk(r);
    return hits;
}

describe("a focus-panel card that nothing renders cannot certify anything", () => {
    const cards = readdirSync(CARDS)
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => f.replace(/\.tsx$/, ""));

    it("finds the cards it is meant to police", () => {
        expect(cards).toContain("CurrentWorkCard");
        expect(cards).toContain("CurrentWorkFocusedSurface");
    });

    /*
     * The known-dead component is named, and named ONLY here.
     *
     * It is not deleted in this slice — deletion is a separate decision with its own blast radius —
     * but it is recorded as unreachable so that the list cannot grow silently. A card that becomes
     * dead later fails this test; a card that is revived can simply be removed from this set.
     */
    /*
     * EMPTY, AND THAT IS THE POINT.
     *
     * This began as a three-name graveyard: CurrentWorkWorkspace (644 lines whose only importer was
     * a test), AssignmentCardSections and AssignmentProposalControls. All three are now deleted, so
     * the exception list costs nothing to keep at zero.
     *
     * It stays as a mechanism rather than being removed with its entries, because the failure it
     * catches is not "these three files" — it is a card drifting out of the runtime while its
     * markup keeps satisfying certification. A new name appearing here should be a deliberate,
     * explained decision, not a quiet default.
     */
    const KNOWN_UNREACHABLE = new Set<string>([]);

    it.each(cards)("%s is imported by product code, or is a known-unreachable card", (card) => {
        const importers = productImportersOf(card);
        if (KNOWN_UNREACHABLE.has(card)) {
            expect(
                importers,
                `${card} is listed as unreachable but product code now imports it — remove it from KNOWN_UNREACHABLE`,
            ).toEqual([]);
            return;
        }
        expect(
            importers.length,
            `${card} is imported by no product code, so any source guard against it certifies nothing. `
            + "Either mount it, delete it, or add it to KNOWN_UNREACHABLE with a reason.",
        ).toBeGreaterThan(0);
    });

    it("the graveyard is empty — an exception must be argued for, not inherited", () => {
        /*
         * If this fails, a card became unreachable and someone listed it instead of deleting or
         * mounting it. That may well be right — but it is a decision, and this is where it has to
         * be defended. The three original entries were deleted rather than kept, which is the
         * outcome this list exists to push toward.
         */
        expect([...KNOWN_UNREACHABLE]).toEqual([]);
    });

    it("the components that caused the false positives are gone, not merely unlisted", () => {
        const gone = ["CurrentWorkWorkspace", "AssignmentCardSections", "AssignmentProposalControls"];
        for (const name of gone) {
            expect(cards, `${name} was deleted as unreachable and must not return unnoticed`).not.toContain(name);
        }
    });
});
