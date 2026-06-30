import { describe, expect, it } from "vitest";

import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";
import {
    addCardToRow,
    addRow,
    emptyLayout,
    setCellHeight,
    withPublishedLayoutMetadata,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import { readFocusPanelPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    buildSummaryDocFromOrder,
    readSummaryCardOrder,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";

/**
 * Runtime parity: the layout authored + published in /settings/surfaces must be the
 * SAME metadata the /workspace/work-unit Focus Panel consumes.
 *
 * Root cause of the parity bug: the editor doc carries `focusPanelLayout` (+
 * `focusPanelMode` / `layoutKey`) doc-metadata, but the opportunities/drawer write
 * validator's metadata whitelist rejected them → the API returned "Invalid layout doc"
 * → the published layout never persisted → the runtime fell back to the default doc
 * (auto-composition). These tests pin both halves: the editor doc now VALIDATES (so it
 * persists) and the runtime reads back EXACTLY the authored layout.
 */
describe("Focus Panel runtime parity — editor-published == work-unit-consumed", () => {
    function authoredDoc() {
        const order = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        // Author a non-trivial layout: width + stacking + height (room before expansion).
        let layout = addRow(emptyLayout());
        layout = addCardToRow(layout, 0, "household", "twoThirds");
        layout = addCardToRow(layout, 0, "readiness_kpi", "third");
        layout = setCellHeight(layout, 0, 0, "tall");
        const base = buildSummaryDocFromOrder(order);
        const doc = { ...base, metadata: withPublishedLayoutMetadata(base.metadata, layout) };
        return { doc, layout };
    }

    it("the editor doc passes the write/publish validator (no longer 'Invalid layout doc')", () => {
        const { doc } = authoredDoc();
        // The write path: parseLayoutDoc(doc, { inferSurfaceKey: true }) — what the
        // PATCH / publish routes run before persisting.
        const parsed = parseLayoutDoc(doc, { inferSurfaceKey: true });
        const metadataErrors = parsed.errors.filter((e) => /metadata/.test(e) && /focusPanel|layoutKey/i.test(e));
        expect(metadataErrors).toEqual([]); // the Focus Panel doc-metadata keys are accepted
        expect(parsed.ok).toBe(true);
    });

    it("the validator accepts focusPanelLayout / focusPanelMode / layoutKey doc metadata", () => {
        const { doc } = authoredDoc();
        const result = validateLayoutDocForSurface(doc); // surface resolved from the doc
        const unknownKeyErrors = result.errors.filter((e) => e.includes("unknown metadata key"));
        expect(unknownKeyErrors).toEqual([]);
    });

    it("the runtime reads back EXACTLY the authored layout (width + stacking + height)", () => {
        const { doc, layout } = authoredDoc();
        // What OpportunityFocusPanelModeGrid does: readFocusPanelPublishedLayout(activeDoc).
        const consumed = readFocusPanelPublishedLayout(doc);
        expect(consumed).toEqual(layout);
        expect(consumed!.rows[0]!.cells[0]!.height).toBe("tall");
        expect(consumed!.rows[0]!.cells.map((c) => c.width)).toEqual(["twoThirds", "third"]);
    });
});
