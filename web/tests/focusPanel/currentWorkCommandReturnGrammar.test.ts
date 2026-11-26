import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R-014 — every command destination must be DISMISSABLE. That invariant stands.
 *
 * ── WHAT CHANGED, AND WHY THE TEST CHANGED WITH IT ──
 *
 * R-014's fix added "← Back to actions" because a command destination unmounted the launcher row
 * and left the operator no visible exit at all. It also locked a second, softer property: that
 * leaving a destination must not collapse the card.
 *
 * The compact-command-workspace amendment supersedes that softer half deliberately. A command
 * workspace now names the COMMAND and offers ONE way out, because two exits to nearly the same
 * place cost a row of chrome above every command and asked the operator to choose between them
 * with no visible difference. `✕` returns to the Focus Panel, which the amendment defines as the
 * return path.
 *
 * The hard invariant is unchanged and still locked below: a destination is never a dead end.
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

    it("titles the workspace with the command's own operator label", () => {
        const card = code(CARD);
        // The registered action's label, not the card's — "Tour invitation", not "What's Next".
        expect(card).toContain("panelTitle={activePanelAction?.label ?? null}");
    });

    it("stops the card restating its own identity while a command owns the surface", () => {
        const card = code(CARD);
        expect(card).toContain('title={capabilityActive ? "" : vm.microLabel}');
        expect(card).toContain('insight={capabilityActive ? "" : cardInsight}');
        expect(card).toContain("statusChip={capabilityActive ? null : statusChip}");
    });

    it("reserves Back for genuine nesting inside a command, not for the root", () => {
        const src = code(SURFACE);
        const topbar = src.slice(
            src.indexOf("alloy-os-currentwork__focused-topbar"),
            src.indexOf("alloy-os-currentwork__focused-panel-host"),
        );
        // No root-level Back beside the close…
        expect(topbar).not.toContain('data-work-action="back-to-actions"');
        // …but outcome mode still steps down from the action list, so it keeps one.
        expect(src).toContain('data-work-action="back-to-actions"');
    });

    it("names the command and always offers the exit when a destination owns the body", () => {
        const src = code(SURFACE);
        const topbar = src.slice(
            src.indexOf("alloy-os-currentwork__focused-topbar"),
            src.indexOf("alloy-os-currentwork__focused-panel-host"),
        );
        // The command identifies itself — the card and stage behind the scrim are not restated.
        expect(topbar).toContain('data-work-command-title="true"');
        // THE HARD INVARIANT: a destination is never a dead end.
        expect(topbar).toContain('data-work-action="close-focused"');
    });

    it("keeps the exit bound to onClose", () => {
        const src = code(SURFACE);
        expect(src).toMatch(/onClick=\{onClose\}[\s\S]{0,160}data-work-action="close-focused"/);
    });
});

describe("the card keeps the two gestures distinct internally", () => {
    it("still wires onDismissPanel to closeActionPanel, not closeWorkspace", () => {
        // The capability survives even though the root no longer surfaces a control for it: nested
        // steps and completion handlers still return to the launchers without collapsing.
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
