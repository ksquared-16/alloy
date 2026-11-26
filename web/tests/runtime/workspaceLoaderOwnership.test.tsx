// @vitest-environment jsdom
/**
 * POST-DEPLOYMENT REPAIR SLICE 1 — P0-1 and P0-5.
 *
 * P0-1. The Workspace pending state belongs to ONE canonical owner. A previous slice replaced it
 * with a surface-local composition — org name, "Preparing your workspace…", two reserved blocks
 * whose `bg-white/60` on white made them invisible — which on deployed staging holds for 5–7 s and
 * reads as a caption on an empty page. That is the faint-empty-canvas treatment the product had
 * already ruled out. These locks bind the owner, not the copy, so the regression cannot return under
 * a different sentence.
 *
 * P0-5. The pill could not look selected until the resolved model said so, which on deployed staging
 * meant ~5 s of no feedback at all. Acknowledgement is now the operator's intent; the model stays the
 * only source of truth for routing and content, and the acknowledged pill is explicitly marked as
 * awaiting its destination so it can never read as loaded.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { WorkViewPillStrip } from "@/components/presentation/workUnit/WorkViewPillStrip";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";

const SURFACE = join(process.cwd(), "components/presentation/workspace/WorkspaceSurface.tsx");
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("P0-1 — the Workspace pending state has one canonical owner", () => {
    it("renders AlloyOperationalBootShell in content mode while pending", () => {
        const code = strip(read(SURFACE));
        expect(code).toMatch(/<AlloyOperationalBootShell variant="workspace" chrome="content" \/>/);
        expect(code).toMatch(/!model\.ready \?/);
    });

    it("has no surface-local pending replacement", () => {
        const code = strip(read(SURFACE));
        expect(code, "the per-surface composition is what regressed").not.toMatch(/WorkspacePendingSurface/);
        // No locally-authored pending treatment of any kind in this file.
        expect(code).not.toMatch(/Preparing your workspace/);
        expect(code).not.toMatch(/data-workspace-pending/);
        expect(code).not.toMatch(/minHeight/);
    });

    it("the deleted component is gone, not merely unreferenced", () => {
        let existed = true;
        try { read(join(process.cwd(), "components/presentation/workspace/WorkspacePendingSurface.tsx")); }
        catch { existed = false; }
        expect(existed, "a dead second owner invites the same regression back").toBe(false);
    });

    it("settled Workspace behaviour is untouched", () => {
        const code = strip(read(SURFACE));
        expect(code).toMatch(/<WorkspaceHeader/);
        expect(code).toMatch(/<ProcessGrid processes=\{model\.processes\} config=\{model\.processConfig\} \/>/);
        expect(code).toMatch(/motion-surface-enter-back/);
        expect(code).toMatch(/useRetainedScroll/);
    });

    it("no readiness or fetch contract changed here", () => {
        const code = read(SURFACE);
        for (const forbidden of ["fetch(", "useEffect", "useState", "setTimeout"]) {
            expect(code, `${forbidden} would be a new owner in the render site`).not.toContain(forbidden);
        }
    });
});

function view(id: string, isActive: boolean): WorkViewLinkModel {
    return { id, label: id, isActive, count: null } as unknown as WorkViewLinkModel;
}
function mount(ui: React.ReactElement) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return {
        container,
        rerender: (next: React.ReactElement) => act(() => root.render(next)),
        unmount: () => act(() => root.unmount()),
        pill: (id: string) => container.querySelector(`[data-work-view-id="${id}"]`) as HTMLButtonElement,
        selected: () => container.querySelector("[aria-selected='true']")?.getAttribute("data-work-view-id") ?? null,
    };
}
const strip3 = (activeId: string, onSelect: (id: string) => void) =>
    createElement(WorkViewPillStrip, {
        workViews: [view("a", activeId === "a"), view("b", activeId === "b"), view("c", activeId === "c")],
        onSelect,
    });

describe("P0-5 — the pill acknowledges intent before the destination resolves", () => {
    it("selection moves on click, with the model still on the old view", () => {
        const onSelect = vi.fn();
        const m = mount(strip3("a", onSelect));
        expect(m.selected()).toBe("a");

        act(() => { m.pill("b").click(); });

        // The model has NOT moved — this render still says a is active.
        expect(m.selected(), "acknowledgement must not wait for the destination").toBe("b");
        expect(onSelect).toHaveBeenCalledWith("b");
        m.unmount();
    });

    it("the acknowledged pill says it is still waiting — it never reads as loaded", () => {
        const m = mount(strip3("a", () => {}));
        act(() => { m.pill("b").click(); });
        expect(m.pill("b").getAttribute("data-work-view-intent")).toBe("pending");
        expect(m.pill("b").getAttribute("aria-busy")).toBe("true");
        m.unmount();
    });

    it("the mark clears once the model agrees", () => {
        const m = mount(strip3("a", () => {}));
        act(() => { m.pill("b").click(); });
        m.rerender(strip3("b", () => {}));
        expect(m.selected()).toBe("b");
        expect(m.pill("b").getAttribute("data-work-view-intent")).toBeNull();
        expect(m.pill("b").getAttribute("aria-busy")).toBeNull();
        m.unmount();
    });

    it("latest click wins under rapid switching", () => {
        const onSelect = vi.fn();
        const m = mount(strip3("a", onSelect));
        act(() => { m.pill("b").click(); });
        act(() => { m.pill("c").click(); });
        expect(m.selected()).toBe("c");
        expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["b", "c"]);
        m.unmount();
    });

    it("a move the model resolves ELSEWHERE takes the highlight back", () => {
        // Refused or redirected navigation: the model lands somewhere other than the request.
        const m = mount(strip3("a", () => {}));
        act(() => { m.pill("b").click(); });
        expect(m.selected()).toBe("b");
        m.rerender(strip3("c", () => {}));
        expect(m.selected(), "intent is spent the moment the model moves at all").toBe("c");
        expect(m.container.querySelector("[data-work-view-intent='pending']")).toBeNull();
        m.unmount();
    });

    it("acknowledgement introduces no request of its own", () => {
        const code = read(join(process.cwd(), "components/presentation/workUnit/WorkViewPillStrip.tsx"));
        // `onPrefetch(` is the existing hover-intent callback and stays — the assertion is that no
        // NEW request is issued for acknowledgement, not that the word never appears.
        expect(code).not.toMatch(/(?<!Pre|pre)fetch\(/);
        expect(code, "the strip must not acquire a second route/query owner").not.toMatch(/router\.|useRouter|searchParams/);
    });
});
