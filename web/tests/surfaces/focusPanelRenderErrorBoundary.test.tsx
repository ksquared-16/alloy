/**
 * THE FLOOR UNDER THE FOCUS PANEL RUNTIME.
 *
 * The published-layout crash reached the operator as Next's "a client-side exception has
 * occurred" — the WHOLE Work Unit, for one defect in one composition. The contract fix
 * removes that particular defect; this boundary removes the class of outcome, so the next
 * one costs a card instead of a page.
 *
 * These assertions are structural on purpose. The boundary's value is entirely in WHERE it
 * is mounted — inside the cell (so a failing card keeps its authored geometry) and around
 * each host of the mode grid (so a composition that throws before any card renders still
 * leaves the Work Unit standing). A boundary that exists but is not wired at those seams
 * is worth nothing, and only the call sites can show that it is.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import FocusPanelRenderErrorBoundary from "@/components/admin/focusPanel/FocusPanelRenderErrorBoundary";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const readSrc = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

describe("FocusPanelRenderErrorBoundary", () => {
    it("renders its children untouched while nothing has failed", () => {
        const html = renderToStaticMarkup(
            <FocusPanelRenderErrorBoundary scope="card" label="children">
                <p>the card</p>
            </FocusPanelRenderErrorBoundary>,
        );
        expect(html).toContain("the card");
        expect(html).not.toContain("could not be displayed");
    });

    it("states the failure plainly and never claims configuration changed", () => {
        const boundary = readSrc("components/admin/focusPanel/FocusPanelRenderErrorBoundary.tsx");
        expect(boundary).toContain("static getDerivedStateFromError");
        expect(boundary).toContain("componentDidCatch");
        // The fallback tells the operator what is and is not affected.
        expect(boundary).toContain("This card could not be displayed.");
        expect(boundary).toContain("This surface could not be composed.");
        expect(boundary).toContain("published configuration is unchanged");
        // A caught failure is still reported — a silent boundary hides the defect it bounds.
        expect(boundary).toContain("console.error");
        // It must not quietly substitute some other composition for the authored one: a
        // boundary that can render a DIFFERENT layout is a silent fallback, so it imports
        // no composition engine and no published-layout model at all.
        const imports = boundary.match(/^import .*$/gm) ?? [];
        expect(imports.join("\n")).not.toMatch(/focusPanel(Published|Grid|Card)|composition\//);
    });

    it("bounds each cell INSIDE the grid, so a failing card keeps its placement", () => {
        const grid = readSrc("components/admin/focusPanel/FocusPanelCardGrid.tsx");
        // The boundary wraps the cell's CONTENT, not the cell — the authored width, column
        // and reserved height live on the element outside it.
        expect(grid).toMatch(
            /<FocusPanelRenderErrorBoundary scope="card" label=\{key\}>\s*\{renderCell\(key\)\}\s*<\/FocusPanelRenderErrorBoundary>/,
        );
        // renderCellBox is the single shared cell for the grid, lanes, rows and composition
        // paths, so wrapping it there covers every strategy exactly once.
        expect(grid.match(/<FocusPanelRenderErrorBoundary/g)?.length).toBe(1);
        expect(grid).toContain("renderCellBox");
    });

    it("bounds the whole composition at every production host of the mode grid", () => {
        for (const host of [
            "components/admin/focusPanel/OpportunityFocusPanelBody.tsx",
            "components/presentation/durableRecord/DurableRecordSurface.tsx",
        ]) {
            const src = readSrc(host);
            expect(src, host).toContain('<FocusPanelRenderErrorBoundary scope="surface"');
            // The grid is INSIDE the boundary — a derivation that throws before any card
            // renders is caught here or not at all.
            const open = src.indexOf('<FocusPanelRenderErrorBoundary scope="surface"');
            const gridAt = src.indexOf("<OpportunityFocusPanelModeGrid", open);
            const close = src.indexOf("</FocusPanelRenderErrorBoundary>", open);
            expect(gridAt, `${host}: grid inside boundary`).toBeGreaterThan(open);
            expect(close, `${host}: boundary closes after grid`).toBeGreaterThan(gridAt);
        }
    });
});
