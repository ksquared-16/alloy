/**
 * AN EXPANDED DETAIL OR COMMAND IS NOT A CARD, AND MUST NOT WEAR THE CARD'S COLUMN.
 *
 * Two presentations share one Focus Panel and must not share one geometry:
 *
 *   CARD LAYOUT              authored horizontal placement, content-driven height,
 *                            column-aware stacking.
 *   EXPANDED DETAIL/COMMAND  overlays the panel, inherits nothing from the source card,
 *                            and takes a platform-owned width for focused work.
 *
 * The platform already owned the second one: `UniversalCard` declares three modal classes —
 * command 560px, record 880px, workstation 1180px — each centred with
 * `left:0; right:0; margin-inline:auto` and capped at `calc(100% - 32px)`.
 *
 * Both of those resolve against the nearest POSITIONED ancestor. In the `grid` strategy the
 * card wrapper is absolutely positioned, so the wrapper WAS that ancestor and `100%` meant the
 * card's own column. Financials is authored four columns of twelve, so Add charge — a 560px
 * command — resolved to roughly 360px and centred over the right-hand column, and Details, a
 * 1180px workstation, was squeezed into the same slot. Nothing was Financials-specific: any
 * card in a published grid opened its detail inside its own column.
 *
 * So the fix is not a wider Financials modal. It is that while a card is raised, its wrapper
 * takes the CANVAS's box.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const readSrc = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const grid = readSrc("components/admin/focusPanel/FocusPanelCardGrid.tsx");
const hook = readSrc("components/admin/focusPanel/useColumnAwareStack.ts");
const css = readSrc("app/adminV2/components/alloyOsRuntime.css");

describe("the raised card anchors to the canvas, not to its column", () => {
    it("gives the elevated wrapper the canvas box instead of the card box", () => {
        expect(grid).toContain("const elevatedHere = elevatedCellKey != null && elevatedCellKey === area.card;");
        // Canvas box: full width, canvas origin.
        expect(grid).toMatch(/elevatedHere\s*\?\s*\{[\s\S]*?position: "absolute",[\s\S]*?left: 0,[\s\S]*?top: 0,[\s\S]*?width: "100%",/);
    });

    it("still positions every card that is NOT raised from its resolved box", () => {
        expect(grid).toMatch(/:\s*boxOf\s*\n?\s*\?\s*\{[\s\S]*?left: `\$\{boxOf\.left\}px`/);
        expect(grid).toMatch(/top: `\$\{boxOf\.top\}px`/);
    });

    it("marks the raised wrapper so the geometry is inspectable in the DOM", () => {
        expect(grid).toContain('data-fp-grid-area-elevated={elevatedHere ? "true" : undefined}');
    });
});

describe("opening a command or a detail does not move the cards underneath", () => {
    it("holds the raised card's measured height instead of believing its empty wrapper", () => {
        expect(grid).toContain("holdCard: elevatedCellKey ?? null,");
        expect(hook).toContain("holdCard");
        // The held card is skipped by the measurement...
        expect(hook).toContain("if (card === holdCardRef.current) continue;");
        // ...and survives the prune that drops unregistered cards.
        expect(hook).toMatch(/for \(const card of prev\.keys\(\)\) \{\s*\n\s*if \(card === holdCardRef\.current\) continue;/);
    });

    it("reads the held card through a ref, so measure() keeps a stable identity", () => {
        // measure() is the dependency of every per-card ref callback. Rebuilding it would
        // rebuild those, and a ref whose identity changes every render is the render loop
        // that previously crashed the Work Unit.
        expect(hook).toContain("const holdCardRef = useRef<string | null>(holdCard);");
        expect(hook).toMatch(/const measure = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/);
    });
});

describe("the platform owns the expanded widths — no card-specific modal", () => {
    it("keeps one width per modal class, none of them derived from a card's span", () => {
        for (const [cls, token] of [
            ["command", "--alloy-os-focus-panel-command-max-width, 560px"],
            ["record", "--alloy-os-focus-panel-record-max-width, 880px"],
            ["workstation", "--alloy-os-focus-panel-detail-max-width, 1180px"],
        ] as const) {
            const at = css.indexOf(`.alloy-os-ucard[data-universal-card-modal="${cls}"] {`);
            expect(at, cls).toBeGreaterThan(-1);
            expect(css.slice(at, css.indexOf("}", at)), cls).toContain(token);
        }
    });

    it("routes Financials through the shared command and detail runtimes, not copies", () => {
        const card = readSrc("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toContain('import AddChargeCommand from "@/components/operationalCards/AddChargeCommand"');
        expect(card).toContain('import FinancialsDetailCard from "@/components/operationalCards/FinancialsDetailCard"');
        // Both overlays raise the card into the depth layer rather than expanding in place.
        expect(card).toContain('useReportPerspective(coordination, "financials", overlay ? "focused" : "base")');
        // And each declares what it IS, so the platform picks the width.
        expect(readSrc("components/operationalCards/AddChargeCommand.tsx")).toContain('modalClass="command"');
        expect(readSrc("components/operationalCards/FinancialsDetailCard.tsx")).toContain('modalClass="workstation"');
    });
});

describe("card height flows from content, never from the box we drew", () => {
    it("imposes no height of any kind on a placed card", () => {
        const absoluteBranch = grid.slice(grid.indexOf(": boxOf"), grid.indexOf("// First paint"));
        expect(absoluteBranch).not.toContain("minHeight");
        expect(absoluteBranch).not.toContain("height:");
    });

    it("measures the wrapper, which nothing sizes, rather than a stretched child", () => {
        expect(hook).toContain("const measured = el.getBoundingClientRect().height;");
        expect(hook).not.toContain("firstElementChild as HTMLElement).offsetHeight");
    });

    it("observes the wrapper, so a card that swaps its subtree on load stays measured", () => {
        const from = hook.indexOf("const registerCard");
        const register = hook.slice(from, hook.indexOf("useLayoutEffect", from));
        expect(from).toBeGreaterThan(-1);
        expect(register).toContain("ro.observe(node)");
        // The observed target is the wrapper — never whichever child happened to exist at mount.
        expect(register).not.toMatch(/ro\.observe\((?!node\)).*firstElementChild/);
    });

    it("stops the card stretching to any height a wrapper might carry", () => {
        const at = css.indexOf(".alloy-os-fp-grid-area {");
        expect(css.slice(at, css.indexOf("}", at))).toContain("align-items: flex-start");
    });
});
