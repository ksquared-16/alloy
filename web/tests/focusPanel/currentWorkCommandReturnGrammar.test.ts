import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R-014 — every command destination must be dismissable, and dismissing it must not cost the card.
 *
 * Message, Send form and every Tour ▾ item resolve to ONE shared slot (`activePanelAction`) and one
 * replace point (`hasPanel` in the focused surface). The destination fully unmounts the launcher
 * row, and the surface used to suppress its own topbar in exactly that state — so the operator who
 * opened a command had no return control and no close control, only the backdrop or the browser.
 *
 * `closeActionPanel` — the setter that returns to the launchers WITHOUT collapsing the card — had
 * existed since the panel slot was written and was reachable from no UI control. These tests lock
 * the two halves of the grammar: the control exists in panel mode, and it is bound to the setter
 * that preserves the card rather than to `closeWorkspace`.
 *
 * Source-level because this repo has no DOM-rendering test harness for the Focus Panel cards; the
 * assertions are therefore written against structure that cannot be satisfied by a coincidence.
 */

const WEB = process.cwd();
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
/** Comments quote the very identifiers under test, so they are stripped before matching. */
const code = (rel: string) =>
    read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const SURFACE = "components/admin/focusPanel/cards/CurrentWorkFocusedSurface.tsx";
const CARD = "components/admin/focusPanel/cards/CurrentWorkCard.tsx";

describe("a command destination can always be left", () => {
    it("renders the topbar in capability mode instead of suppressing it", () => {
        const src = code(SURFACE);
        // The regression this replaces: `{hasPanel ? null : <div className="…focused-topbar">}`.
        expect(src).not.toMatch(/hasPanel\s*\?\s*\n?\s*null\s*\n?\s*:\s*<div className="alloy-os-currentwork__focused-topbar"/);
        expect(src).toContain('data-work-topbar-mode={hasPanel ? "panel" : "default"}');
    });

    it("offers a return control whenever a destination owns the body", () => {
        const src = code(SURFACE);
        const topbar = src.slice(
            src.indexOf("alloy-os-currentwork__focused-topbar"),
            src.indexOf("alloy-os-currentwork__focused-panel-host"),
        );
        expect(topbar).toContain("hasPanel && onDismissPanel");
        expect(topbar).toContain('data-work-action="back-to-actions"');
        // The card's own exit survives in capability mode too — it was suppressed with the topbar.
        expect(topbar).toContain('data-work-action="close-focused"');
    });

    it("keeps the close control bound to onClose and the return control to onDismissPanel", () => {
        const src = code(SURFACE);
        expect(src).toMatch(/data-work-action="back-to-actions"[\s\S]{0,120}onClick=\{onDismissPanel\}/);
        expect(src).toMatch(/onClick=\{onClose\}[\s\S]{0,160}data-work-action="close-focused"/);
    });
});

describe("returning from a destination is not the same gesture as closing the card", () => {
    it("wires onDismissPanel to closeActionPanel, not closeWorkspace", () => {
        const src = code(CARD);
        expect(src).toContain("onDismissPanel={closeActionPanel}");
        expect(src).not.toContain("onDismissPanel={closeWorkspace}");
    });

    it("closeActionPanel clears the destination without collapsing the workspace", () => {
        const src = code(CARD);
        const body = src.slice(
            src.indexOf("const closeActionPanel"),
            src.indexOf("const handleViewFullActivity"),
        );
        expect(body).toContain("setActivePanelAction(null)");
        expect(body).toContain("clearCurrentWorkWorkspaceIntent");
        // Collapsing the card here would make the return control indistinguishable from ✕.
        expect(body).not.toContain("closeCurrentWorkWorkspace");
    });

    it("still collapses the card when the operator asks for that", () => {
        const src = code(CARD);
        const body = src.slice(src.indexOf("const closeWorkspace"), src.indexOf("const handleActionPanelComplete"));
        expect(body).toContain("closeActionPanel()");
        expect(body).toContain("closeCurrentWorkWorkspace");
    });
});
