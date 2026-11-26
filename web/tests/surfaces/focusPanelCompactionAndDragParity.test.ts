import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/*
 * The compaction cases that used to open this file exercised `compactGridRows` and
 * `resolveDropPlacement` — the row-era gravity and the pointer→row→order inference.
 * Both are gone: rows are no longer a shared coordinate system, so there are no
 * phantom row tracks left to compact away. What remains is the part that was never
 * about rows — that every card activates a drag the same way.
 */

describe("drag activation is the same on every card", () => {
    const css = source("app/adminV2/components/alloyOsRuntime.css");
    const canvas = source("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");

    it("makes card content inert while composing, and live while configuring", () => {
        /*
         * Inert only while `.is-arranging` meant activation depended on what the card
         * drew under the pointer: a control-heavy card (Attendance) swallowed the press
         * and never dragged, while a text-heavy one (Process) did.
         *
         * It must not be inert ALWAYS either — a selected card is being configured and
         * its controls have to work. So the two coexist deliberately: content is inert
         * on unselected cards (uniform drag activation everywhere), live on the selected
         * one, where the chrome drag bar remains the handle.
         */
        expect(css).toContain(
            ".alloy-os-fp-composer-cell:not(.is-selected) > :first-child {\n  pointer-events: none;",
        );
        expect(css).not.toContain(".alloy-os-fp-composer-cell.is-arranging > :first-child");
        // The handle is generous and present in every mode.
        expect(css).toContain("height: 44px;");
    });

    it("has no second coordinate system for the preview", () => {
        // The dragged card marks itself in the resolved layout; a floating ghost
        // rectangle measured against the pre-drop canvas is what used to lie.
        expect(canvas).toContain('data-fp-composer-dragging={dragging ? "true" : undefined}');
        expect(canvas).not.toContain('className="alloy-os-fp-composer__ghost"');
        expect(canvas).toContain("const renderGrid = previewGrid ?? grid;");
    });

    it("routes every drag through the one grip on the one composer shell", () => {
        expect(canvas).toContain('className="alloy-os-fp-composer-cell__grip"');
        // One shell renders every card in the composer — no per-card drag wrapper.
        expect(canvas.match(/function ComposerCellShell/g)?.length).toBe(1);
    });

    it("keeps composer chrome clickable, and gives the grip a real target", () => {
        expect(css).toContain(".alloy-os-fp-composer-cell__chrome");
        // 44x44: the platform's minimum comfortable target, identical on every card.
        expect(css).toContain("width: 44px; height: 44px;");
    });
});
