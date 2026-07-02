import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import FocusPanelSummarySkeleton from "@/components/admin/focusPanel/FocusPanelSummarySkeleton";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";

describe("FocusPanelSummarySkeleton (pending Focus Panel)", () => {
    const html = renderToStaticMarkup(<FocusPanelSummarySkeleton mode="summary" />);

    it("renders the SAME published card grid as the resolved body — not a spinner", () => {
        expect(html).toContain('data-focus-panel-card-grid="true"');
        // No canonical loading surface / no "Preparing" spinner text.
        expect(html).not.toContain("data-alloy-canonical-loading");
        expect(html).not.toContain("Preparing");
    });

    it("keeps the pending seam markers on the skeleton root (grid, not spinner)", () => {
        expect(html).toContain('data-testid="inline-focus-panel-skeleton"');
        expect(html).toContain('data-inline-focus-panel-pending="true"');
    });

    it("renders a placeholder cell for every published cell (matches resolved cell count)", () => {
        // Skeleton (no cards) uses ALL published cells — the same count/strategy the resolved
        // grid derives for the same default doc.
        const inputs = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const expectedCells = inputs.gridRows.reduce((n, row) => n + row.cells.length, 0);
        const placeholderCount = (html.match(/data-focus-panel-skeleton-card="true"/g) ?? []).length;
        expect(placeholderCount).toBe(expectedCells);
        // The card shells reuse the real `.alloy-os-ucard` chrome so the box is the card shape.
        expect(html).toContain("alloy-os-ucard");
    });

    it("matches the resolved grid render strategy for the same doc", () => {
        // The composed strategy the grid picks is a pure function of the (record-free) inputs;
        // the skeleton feeds the same inputs, so the rendered strategy attribute matches what a
        // resolved surface with all-visible cards would render.
        const strategyMatch = html.match(/data-fp-render-strategy="([^"]+)"/);
        expect(strategyMatch?.[1]).toBeTruthy();
        // Default doc has no published explicit layout → composed lanes/stack, never legacy grid.
        expect(strategyMatch?.[1]).toContain("composed");
    });

    it("non-summary modes render a stable placeholder (no crash, no grid)", () => {
        const workHtml = renderToStaticMarkup(<FocusPanelSummarySkeleton mode="work" />);
        expect(workHtml).toContain('data-testid="inline-focus-panel-skeleton"');
        expect(workHtml).toContain('data-inline-focus-panel-pending="true"');
        expect(workHtml).not.toContain('data-focus-panel-card-grid="true"');
    });
});
