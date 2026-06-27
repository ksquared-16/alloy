import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import FocusPanelSummaryEditBar from "@/components/admin/focusPanel/FocusPanelSummaryEditBar";
import FocusPanelEditableCardFrame from "@/components/admin/focusPanel/FocusPanelEditableCardFrame";
import {
    buildFocusPanelEditExitQuery,
    FOCUS_PANEL_EDIT_PARAM,
    isFocusPanelEditModeRequested,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelEditMode";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
function readSrc(rel: string): string {
    return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("focus panel edit mode — ?edit=1 detection", () => {
    it("is requested only for edit=1", () => {
        expect(isFocusPanelEditModeRequested(new URLSearchParams("edit=1"))).toBe(true);
        expect(isFocusPanelEditModeRequested(new URLSearchParams("edit=1&queue=tours"))).toBe(true);
        expect(isFocusPanelEditModeRequested(new URLSearchParams("edit=0"))).toBe(false);
        expect(isFocusPanelEditModeRequested(new URLSearchParams("edit=true"))).toBe(false);
        expect(isFocusPanelEditModeRequested(new URLSearchParams(""))).toBe(false);
        expect(isFocusPanelEditModeRequested(null)).toBe(false);
        expect(isFocusPanelEditModeRequested(undefined)).toBe(false);
    });

    it("uses the canonical `edit` param key", () => {
        expect(FOCUS_PANEL_EDIT_PARAM).toBe("edit");
    });
});

describe("focus panel edit mode — Done exits by dropping ?edit=1", () => {
    it("removes only the edit param and preserves the rest", () => {
        expect(buildFocusPanelEditExitQuery("edit=1&queue=tours&mode=summary")).toBe("queue=tours&mode=summary");
        expect(buildFocusPanelEditExitQuery(new URLSearchParams("queue=tours&edit=1"))).toBe("queue=tours");
    });

    it("returns an empty string when edit was the only param", () => {
        expect(buildFocusPanelEditExitQuery("edit=1")).toBe("");
        expect(buildFocusPanelEditExitQuery("")).toBe("");
    });
});

describe("FocusPanelSummaryEditBar — contextual editing (no Content mode)", () => {
    const html = renderToStaticMarkup(<FocusPanelSummaryEditBar onExit={() => {}} onUndo={() => {}} onReset={() => {}} />);

    it("renders the edit bar with a local working-copy indicator", () => {
        expect(html).toContain('data-testid="focus-panel-summary-edit-bar"');
        expect(html).toContain('data-focus-panel-working-copy-indicator="true"');
        expect(html).toContain("Working copy");
    });

    it("no longer renders a Structure / Content toggle (editing is contextual)", () => {
        expect(html).not.toContain("data-focus-panel-edit-surface-option");
        expect(html).toContain("select a card to inspect");
    });

    it("renders Undo, Reset, and Done controls", () => {
        expect(html).toContain('data-testid="focus-panel-edit-undo"');
        expect(html).toContain('data-testid="focus-panel-edit-reset"');
        expect(html).toContain('data-testid="focus-panel-edit-done"');
    });
});

describe("FocusPanelEditableCardFrame — visual parity + structure controls", () => {
    const childMarker = '<div data-test-card="children">card body</div>';
    const structureControls = {
        span: 1 as const,
        canMovePrev: true,
        canMoveNext: true,
        onMovePrev: () => {},
        onMoveNext: () => {},
        onCycleSpan: () => {},
        onDuplicate: () => {},
        onRemove: () => {},
    };

    it("renders the card unchanged and adds an Inspect handle (not selected)", () => {
        const html = renderToStaticMarkup(
            <FocusPanelEditableCardFrame cardKey="children" selected={false} onSelect={() => {}}>
                <div data-test-card="children">card body</div>
            </FocusPanelEditableCardFrame>,
        );
        expect(html).toContain(childMarker);
        expect(html).toContain('data-focus-panel-editable-card="children"');
        expect(html).toContain('data-focus-panel-edit-handle="children"');
        expect(html).toContain('data-focus-panel-edit-selected="false"');
        // Overlay outline must not intercept pointer events on the real card.
        expect(html).toContain("pointer-events-none");
    });

    it("renders move / resize / duplicate / remove when structure controls are provided", () => {
        const html = renderToStaticMarkup(
            <FocusPanelEditableCardFrame
                cardKey="children"
                selected
                onSelect={() => {}}
                structureControls={structureControls}
            >
                <div data-test-card="children">card body</div>
            </FocusPanelEditableCardFrame>,
        );
        expect(html).toContain('data-focus-panel-edit-selected="true"');
        expect(html).toContain('data-focus-panel-card-move-prev="children"');
        expect(html).toContain('data-focus-panel-card-duplicate="children"');
        expect(html).toContain('data-focus-panel-card-remove="children"');
    });
});

describe("OpportunityFocusPanelModeGrid — clean operator runtime, config-driven", () => {
    const grid = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");

    it("does NOT read ?edit=1 from the operator URL (editor lives in /settings/surfaces)", () => {
        expect(grid).not.toContain("useSearchParams");
        expect(grid).not.toContain("usePathname");
        expect(grid).not.toContain("router.replace");
        expect(grid).not.toContain("isFocusPanelEditModeRequested");
    });

    it("keeps the operator frontend clean — no edit chrome on the live surface", () => {
        expect(grid).not.toContain("FocusPanelSummaryEditBar");
        expect(grid).not.toContain("FocusPanelEditableCardFrame");
    });

    it("reads the published Summary doc and applies per-card config through the shared renderer", () => {
        expect(grid).toContain("usePublishedFocusPanelSummaryDoc");
        expect(grid).toContain("publishedDoc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC");
        expect(grid).toContain("deriveFocusPanelInstanceMap");
        expect(grid).toContain("composeEffectiveCardModel");
    });
});
