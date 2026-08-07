/** @vitest-environment jsdom */

/**
 * Processing Studio and the Mailroom Work surfaces render INSIDE AdminV2WorkspaceBosModalShell
 * (panel z=97 / backdrop z=96). Any dialog they open that portals to `document.body` escapes that
 * stacking context, so a z-index below the shell puts the dialog BEHIND it — the operator clicks
 * the button, state updates, the overlay renders, and nothing is visible or clickable.
 *
 * This has now shipped twice: ProcessingAlloyDialog at z-[80] ("Import document" did nothing,
 * 395026bf8) and ProcessingFormBuilderLibraryPanel at z-[70] ("+ Add question" did nothing).
 * This contract fails the build on the third.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ADMINV2_WORKSPACE_BOS_BACKDROP_Z,
    ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z,
    ADMINV2_WORKSPACE_BOS_PANEL_Z,
} from "@/components/admin/Drawer";
import ProcessingAlloyDialog from "@/app/adminV2/pos/ProcessingAlloyDialog";
import ProcessingFormBuilderLibraryPanel from "@/app/adminV2/pos/ProcessingFormBuilderLibraryPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const posDir = join(dirname(fileURLToPath(import.meta.url)), "../../app/adminV2/pos");

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
});

/** Effective stacking value of the portaled overlay actually written to the DOM. */
function portaledOverlayZ(selector: string): number {
    const node = document.body.querySelector<HTMLElement>(selector);
    expect(node, `no portaled overlay matched ${selector}`).not.toBeNull();
    return Number(node!.style.zIndex);
}

describe("Processing nested overlay layering (portals must clear the BOS modal shell)", () => {
    it("the nested-overlay z-index sits above the shell panel and backdrop", () => {
        expect(ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z).toBeGreaterThan(ADMINV2_WORKSPACE_BOS_PANEL_Z);
        expect(ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z).toBeGreaterThan(ADMINV2_WORKSPACE_BOS_BACKDROP_Z);
    });

    it("the form-builder question library renders above the shell (the '+ Add question' repair)", () => {
        act(() => {
            root!.render(
                <ProcessingFormBuilderLibraryPanel
                    open
                    sectionLabel="Add to Section"
                    questionTypes={[{ type: "short_text", label: "Short text", meta: "Single line", category: "basic" }]}
                    questionCategoryLabels={{ basic: "Basic" }}
                    onPickQuestionType={vi.fn()}
                    onPickCanonicalField={vi.fn()}
                    onClose={vi.fn()}
                />
            );
        });

        expect(document.body.querySelector('[data-testid="processing-form-builder-library"]')).not.toBeNull();
        expect(portaledOverlayZ('[role="dialog"][aria-label="Add question"]')).toBeGreaterThan(
            ADMINV2_WORKSPACE_BOS_PANEL_Z
        );
    });

    it("Processing Alloy dialogs stay above the shell", () => {
        act(() => {
            root!.render(
                <ProcessingAlloyDialog open onClose={vi.fn()} title="Import document" testId="alloy-dialog-probe">
                    <p>body</p>
                </ProcessingAlloyDialog>
            );
        });

        const overlay = document.body
            .querySelector('[data-testid="alloy-dialog-probe"]')!
            .closest<HTMLElement>('[role="presentation"]');
        expect(overlay).not.toBeNull();
        expect(Number(overlay!.style.zIndex)).toBeGreaterThan(ADMINV2_WORKSPACE_BOS_PANEL_Z);
    });

    it("no Processing component portals a full-viewport overlay below the shell", () => {
        const violations: string[] = [];
        for (const file of readdirSync(posDir).filter((f) => f.endsWith(".tsx"))) {
            const src = readFileSync(join(posDir, file), "utf8");
            if (!src.includes("createPortal")) continue;
            for (const match of src.matchAll(/fixed inset-0[^"'`]*?\bz-\[(\d+)\]/g)) {
                const z = Number(match[1]);
                if (z <= ADMINV2_WORKSPACE_BOS_PANEL_Z) {
                    violations.push(`${file}: z-[${z}] is at or below the shell panel (${ADMINV2_WORKSPACE_BOS_PANEL_Z})`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
