import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";

import { resolveFocusPanelModeGrid } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";

/**
 * WORK composition parity — locked at the REAL render seam.
 *
 * Work is the one Focus Panel mode whose composition renders straight from these code grids:
 * `OpportunityFocusPanelModeGrid` passes them to `FocusPanelCardGrid` as `rows` with no
 * `publishedLayout` and no `composeCards`, so the legacy grid path paints them. Only `key`, cell
 * ORDER and `span` reach the DOM there (`resolveFocusPanelCellGridSpan` -> `gridColumn`); `tier`
 * and `density` are dropped by `legacyGridRows`.
 *
 * Summary is deliberately NOT covered here: it resolves from a `LayoutDoc`, so its parity lives in
 * `focusPanelSummaryDefaultComposition.test.ts` plus the browser certification.
 */
type RenderedCell = { key: string; span: 1 | 2 | "row"; row: number };

function rendered(grid: { rows: { cells: { key: string; span: 1 | 2 | "row" }[] }[] }): RenderedCell[] {
    return grid.rows.flatMap((r, row) => r.cells.map((c) => ({ key: c.key, span: c.span, row })));
}

const EXPECTED_WORK: RenderedCell[] = [
    { key: "attention", span: "row", row: 0 },
    { key: "workflow_steps", span: 1, row: 1 },
    { key: "required_information", span: 1, row: 1 },
    { key: "work_launcher", span: 1, row: 2 },
    { key: "tasks", span: 1, row: 3 },
    { key: "automations", span: 1, row: 3 },
    { key: "primary_next_action", span: "row", row: 4 },
];

describe("Focus Panel Work composition — rendered parity", () => {
    it("Work SPLIT renders the authored order and full-row emphasis", () => {
        expect(rendered(resolveFocusPanelModeGrid("work", false))).toEqual(EXPECTED_WORK);
    });

    it("Work ACTIVE renders identically to SPLIT", () => {
        expect(rendered(resolveFocusPanelModeGrid("work", true))).toEqual(EXPECTED_WORK);
    });

    it("the two Work grids differ ONLY in a field the renderer drops", () => {
        // Guards the collapse: if a future edit gives ACTIVE a different key/order/span, this fails
        // and the single canonical Work composition must be revisited.
        const split = resolveFocusPanelModeGrid("work", false);
        const active = resolveFocusPanelModeGrid("work", true);
        expect(rendered(active)).toEqual(rendered(split));
    });
});

/**
 * COLLAPSE EVIDENCE (Step 2 certification, item 4).
 *
 * Work-ACTIVE could not be reached in the browser (no current subject exposes an open work intent,
 * and no safe fixture process exists to create one). The collapse is therefore certified here, at
 * the renderer: the ONLY difference between the retired WORK_GRID_SPLIT and WORK_GRID_ACTIVE was
 * `workflow_steps.density` ("compact" -> "standard"), and the legacy grid path — the path Work
 * renders through — never reads a cell's density.
 */
describe("Work collapse — the retired difference was non-rendering", () => {
    const rows = (density: "compact" | "standard") => [
        { cells: [{ key: "attention", span: "row" as const, density: "compact" as const }] },
        {
            cells: [
                { key: "workflow_steps", span: 1 as const, density },
                { key: "required_information", span: 1 as const, density: "compact" as const },
            ],
        },
        { cells: [{ key: "primary_next_action", span: "row" as const, density: "compact" as const }] },
    ];

    const render = (density: "compact" | "standard") =>
        renderToStaticMarkup(
            <FocusPanelCardGrid
                rows={rows(density)}
                className="alloy-os-focus-panel-grid--work"
                dataFocusPanelSplitLayout="true"
                renderCell={(key) => <span data-cell={key} />}
            />,
        );

    it("the legacy grid path renders byte-identical markup for compact vs standard density", () => {
        // This is the whole justification for collapsing two declarations into one.
        expect(render("standard")).toBe(render("compact"));
    });

    it("renders the legacy grid strategy and carries span — not density — to the DOM", () => {
        const html = render("compact");
        expect(html).toContain('data-fp-render-strategy="legacy-grid"');
        expect(html).toContain('data-focus-panel-grid-span="row"');
        expect(html).not.toContain("--fp-card-density");
    });
});
