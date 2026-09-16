// @vitest-environment jsdom
/**
 * SLICE 19 / S19-1 — WORKSPACE PROGRESSIVE REVEAL.
 *
 * The shell paints in ~8 ms and global nav and search are usable at once, but the Workspace's own
 * content takes ~2.7 s — measured twice, and unmoved by the Work View fan-out repair, so it is
 * legitimate composition work. What the operator saw for that window was a centred "Thinking…" with
 * no identity, then everything at once. This is a continuity repair; it does not claim to make the
 * composition faster.
 *
 * The rules being locked are the ones that make a pending state honest: identity may be shown because
 * it is already known, the published header may NOT because it has not resolved, and "no business
 * processes" may never appear before the answer is settled.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { WorkspacePendingSurface } from "@/components/presentation/workspace/WorkspacePendingSurface";

const SURFACE = join(process.cwd(), "components/presentation/workspace/WorkspaceSurface.tsx");
const PENDING = join(process.cwd(), "components/presentation/workspace/WorkspacePendingSurface.tsx");
const GRID = join(process.cwd(), "components/presentation/workspace/ProcessGrid.tsx");
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function mount(ui: Parameters<typeof createRoot>[0] extends never ? never : React.ReactElement) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, unmount: () => act(() => root.unmount()) };
}

describe("S19-1 — the pending Workspace", () => {
    it("renders the organisation identity it already knows", () => {
        const { container, unmount } = mount(
            createElement(WorkspacePendingSurface, { orgName: "Firefly Early Learning" }),
        );
        expect(container.textContent).toContain("Firefly Early Learning");
        expect(container.querySelector("[data-workspace-pending='true']")).toBeTruthy();
        unmount();
    });

    it("reserves the process-surface geometry", () => {
        const { container, unmount } = mount(createElement(WorkspacePendingSurface, { orgName: "X" }));
        const region = container.querySelector("[data-workspace-pending-region='true']") as HTMLElement;
        expect(region, "the region that replaces the process grid must exist").toBeTruthy();
        expect(region.style.minHeight, "a reserved footprint, not zero").toBeTruthy();
        expect(region.querySelectorAll("[data-workspace-pending-slot='true']").length).toBeGreaterThan(0);
        unmount();
    });

    it("NEVER renders the empty state — pending is not 'no business processes'", () => {
        const { container, unmount } = mount(createElement(WorkspacePendingSurface, { orgName: "X" }));
        const text = container.textContent ?? "";
        expect(text).not.toMatch(/No active business processes/i);
        expect(text).not.toMatch(/no work|nothing here|not configured/i);
        // The settled empty copy lives in ProcessGrid, behind a settled model — not here.
        expect(read(GRID)).toMatch(/No active business processes/);
        unmount();
    });

    it("claims no published header values it has not resolved", () => {
        const { container, unmount } = mount(createElement(WorkspacePendingSurface, { orgName: "X" }));
        const code = strip(read(PENDING));
        expect(code, "the published header must commit atomically with the tiles").not.toMatch(/model\.header/);
        expect(code).not.toMatch(/WorkspaceHeader/);
        // No fabricated business values in the reserved slots.
        expect(container.querySelector("[data-workspace-pending-slot='true']")?.textContent).toBe("");
        unmount();
    });

    it("carries no truth of its own — orgName in, nothing fetched", () => {
        const code = strip(read(PENDING));
        expect(code).not.toMatch(/fetch\(|useEffect|useState|useQuery/);
    });
});

describe("S19-1 — the surface wiring", () => {
    it("the pending region replaces the boot shell, not the application shell", () => {
        const code = strip(read(SURFACE));
        expect(code).toMatch(/<WorkspacePendingSurface orgName=\{orgName\} \/>/);
        expect(code, "the centred boot shell was the thing being replaced").not.toMatch(
            /AlloyOperationalBootShell/,
        );
        // The scrollport, labels and ready-gated content are untouched around it.
        expect(code).toMatch(/useRetainedScroll/);
        expect(code).toMatch(/model\.ready \?/);
    });

    it("settled Workspace behaviour is unchanged", () => {
        const code = strip(read(SURFACE));
        expect(code).toMatch(/<WorkspaceHeader/);
        expect(code).toMatch(/<ProcessGrid processes=\{model\.processes\} config=\{model\.processConfig\} \/>/);
        expect(code).toMatch(/motion-surface-enter-back/);
    });

    it("introduces no second reveal runtime", () => {
        const code = read(PENDING) + read(SURFACE);
        for (const forbidden of ["useWorkspaceReveal", "WorkspaceRevealCache", "setTimeout(", "requestIdleCallback"]) {
            expect(code, `${forbidden} would be a competing reveal owner`).not.toContain(forbidden);
        }
    });

    it("identity comes from the org context the shell already holds", () => {
        const code = strip(read(SURFACE));
        expect(code).toMatch(/const \{ orgId, orgName \} = useWorkspaceOrg\(\);/);
    });
});
