import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";

// The skeleton gates the composed grid on the published doc having SETTLED — until then it
// cannot know the org's real layout and must not commit to one (that would reflow on load).
// Mock the doc-state hook so we can drive settled vs pre-settle deterministically.
const docState = vi.hoisted(() => ({ value: { doc: null as unknown, loaded: false } }));
vi.mock("@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc", () => ({
    usePublishedFocusPanelSummaryDocState: () => docState.value,
    usePublishedFocusPanelSummaryDoc: () => docState.value.doc,
}));

// eslint-disable-next-line import/first
import FocusPanelSummarySkeleton from "@/components/admin/focusPanel/FocusPanelSummarySkeleton";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("FocusPanelSummarySkeleton (pending Focus Panel)", () => {
    describe("published doc SETTLED → renders the same grid as the resolved body", () => {
        beforeEach(() => {
            docState.value = { doc: null, loaded: true }; // settled, no custom doc → default
        });
        const render = () => renderToStaticMarkup(<FocusPanelSummarySkeleton mode="summary" />);

        it("renders the published card grid, not a spinner", () => {
            const html = render();
            expect(html).toContain('data-focus-panel-card-grid="true"');
            expect(html).not.toContain("data-alloy-canonical-loading");
            expect(html).not.toContain("Preparing");
            expect(html).toContain('data-testid="inline-focus-panel-skeleton"');
            expect(html).toContain('data-inline-focus-panel-pending="true"');
        });

        it("renders a placeholder cell for every published cell (matches resolved cell count)", () => {
            const inputs = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
            const expectedCells = inputs.gridRows.reduce((n, row) => n + row.cells.length, 0);
            const html = render();
            const placeholderCount = (html.match(/data-focus-panel-skeleton-card="true"/g) ?? []).length;
            expect(placeholderCount).toBe(expectedCells);
            expect(html).toContain("alloy-os-ucard");
        });

        it("matches the resolved grid render strategy for the same doc", () => {
            const strategyMatch = render().match(/data-fp-render-strategy="([^"]+)"/);
            expect(strategyMatch?.[1]).toBeTruthy();
            expect(strategyMatch?.[1]).toContain("composed"); // default doc → composed, never legacy grid
        });
    });

    it("published doc NOT yet settled → stable neutral placeholder, NEVER a committed grid", () => {
        docState.value = { doc: null, loaded: false };
        const html = renderToStaticMarkup(<FocusPanelSummarySkeleton mode="summary" />);
        // No grid before the doc settles — so it can never reflow from the default to the
        // published layout on load (the flash we removed).
        expect(html).not.toContain('data-focus-panel-card-grid="true"');
        expect(html).toContain('data-inline-focus-panel-pending="true"');
        expect(html).toContain("alloy-os-ucard"); // still a stable card-shaped placeholder
        expect(html).not.toContain("Preparing");
    });

    it("non-summary modes render a stable placeholder (no crash, no grid)", () => {
        docState.value = { doc: null, loaded: true };
        const workHtml = renderToStaticMarkup(<FocusPanelSummarySkeleton mode="work" />);
        expect(workHtml).toContain('data-testid="inline-focus-panel-skeleton"');
        expect(workHtml).toContain('data-inline-focus-panel-pending="true"');
        expect(workHtml).not.toContain('data-focus-panel-card-grid="true"');
    });
});
