/** @vitest-environment jsdom */

/**
 * WU shell — Queue Region is one bordered pane: compact Search/Filters utility bar, then
 * rows. No redundant title or record-count (the selected Work View pill names the queue).
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { QueueRowModel, WorkUnitSurfaceModel } from "@/lib/presentation/runtime";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/presentation/workUnit/FocusPanelSurface", () => ({
    useFocusPanelOpen: () => ({ openRecord: vi.fn(), prefetchRecord: vi.fn() }),
}));

import { QueueRegion } from "@/components/presentation/workUnit/QueueRegion";

const slots = {
    subject: { visible: true, label: null },
    status: { visible: true, label: null },
    contact: { visible: true, label: null },
    attention: { visible: true, label: null },
    work: { visible: true, label: null },
    groupCount: { visible: true, label: null },
};
function queue(over: Partial<WorkUnitSurfaceModel["queue"]>): WorkUnitSurfaceModel["queue"] {
    return { rows: [], totalCount: 0, loading: false, error: null, rowConfig: slots, ...over };
}

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
function render(node: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(node));
}
afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    if (container) container.remove();
    container = null;
});
const q = (sel: string) => container!.querySelector(sel);

describe("QueueRegion — compact utility bar + rows (no title/count)", () => {
    it("empty state has Search/Filters utility bar and a single outer bordered pane", () => {
        render(<QueueRegion queue={queue({ rows: [], totalCount: 3 })} title="Active Pipeline" />);
        expect(q("[data-queue-region-title]")).toBeNull();
        expect(q("[data-queue-region-count]")).toBeNull();
        expect(q("[data-queue-region-controls]")).not.toBeNull();
        expect(q("[data-testid=\"work-unit-queue-record-filter-bar\"]")).not.toBeNull();
        const pane = q("[data-queue-region-boundary]");
        expect(pane).not.toBeNull();
        expect(pane?.className).toMatch(/\bborder\b/);
        expect(q("[data-queue-panel-body]")).not.toBeNull();
        expect(q("[data-queue-empty]")).not.toBeNull();
        expect(pane?.getAttribute("data-work-view-name")).toBe("Active Pipeline");
        expect(pane?.getAttribute("aria-label")).toBe("Queue: Active Pipeline");
    });

    it("uses neutral aria-label when no work-view title is given", () => {
        render(<QueueRegion queue={queue({})} />);
        expect(q("[data-queue-region-boundary]")?.getAttribute("aria-label")).toBe("Queue");
        expect(q("[data-queue-region-title]")).toBeNull();
    });

    it("populated state renders rows immediately under the utility bar without a nested border", () => {
        const row: QueueRowModel = { context: null, entityType: "opportunity", entityId: "opp-1" };
        render(<QueueRegion queue={queue({ rows: [row], totalCount: 1 })} title="Tours" />);
        const pane = q("[data-queue-region-boundary]");
        expect(pane).not.toBeNull();
        expect(pane?.className).toMatch(/\bborder\b/);
        expect(pane?.querySelector('[data-entity-id="opp-1"]')).not.toBeNull();
        expect(q("[data-queue-region-count]")).toBeNull();
        expect(q("[data-queue-panel-body]")?.className).not.toMatch(/\bborder\b/);
        // Utility bar precedes the row list inside the pane.
        const controls = q("[data-queue-region-controls]");
        const body = q("[data-queue-panel-body]");
        expect(controls).not.toBeNull();
        expect(body).not.toBeNull();
        expect(
            Boolean(controls && body && controls.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING),
        ).toBe(true);
    });
});
