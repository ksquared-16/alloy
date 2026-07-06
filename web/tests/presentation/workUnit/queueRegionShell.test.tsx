/** @vitest-environment jsdom */

/**
 * WU shell — the Queue Region is one bordered pane (title, filters, rows) aligned as a sibling
 * to the Focus Panel; rows are not nested in a second bordered container.
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

describe("QueueRegion — pane shell (title + filters + rows in one border)", () => {
    it("empty state has title, count, and a single outer bordered pane", () => {
        render(<QueueRegion queue={queue({ rows: [], totalCount: 3 })} title="Active Pipeline" />);
        expect(q("[data-queue-region-title]")?.textContent).toBe("Active Pipeline");
        expect(q("[data-queue-region-count]")?.textContent).toContain("3 records");
        const pane = q("[data-queue-region-boundary]");
        expect(pane).not.toBeNull();
        expect(pane?.className).toMatch(/\bborder\b/);
        expect(q("[data-queue-panel-body]")).not.toBeNull();
        expect(q("[data-queue-empty]")).not.toBeNull();
        expect(pane?.contains(q("[data-queue-region-title]")!)).toBe(true);
    });

    it("falls back to 'Queue' when no work-view title is given", () => {
        render(<QueueRegion queue={queue({})} />);
        expect(q("[data-queue-region-title]")?.textContent).toBe("Queue");
    });

    it("populated state renders rows inside the pane body without a nested border", () => {
        const row: QueueRowModel = { context: null, entityType: "opportunity", entityId: "opp-1" };
        render(<QueueRegion queue={queue({ rows: [row], totalCount: 1 })} title="Tours" />);
        const pane = q("[data-queue-region-boundary]");
        expect(pane).not.toBeNull();
        expect(pane?.className).toMatch(/\bborder\b/);
        expect(pane?.querySelector('[data-entity-id="opp-1"]')).not.toBeNull();
        expect(q("[data-queue-region-count]")?.textContent).toContain("1 record");
        expect(q("[data-queue-panel-body]")?.className).not.toMatch(/\bborder\b/);
    });
});
