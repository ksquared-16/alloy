// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { BosWorkspaceScopeSync } from "@/components/presentation/rightRail/BosWorkspaceScopeSync";
import { GlobalAssistantProvider, useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";

/**
 * WORKSPACE → WORK UNIT navigation used to hang React in an infinite update loop.
 *
 * Two surfaces mount this sync at once during a soft navigation: the RETAINED Workspace
 * publishes `work_unit_id: null`, and the Work Unit publishes its id. Both are correct on
 * their own. The defect was the dependency array — the effect depended on the whole assistant
 * CONTEXT, whose identity is memoised over `workspaceScope`, so every write produced a new
 * context object and re-ran the other surface's effect, which wrote its scope back.
 *
 * Measured on the running app before the fix: ~3,300 "Maximum update depth exceeded" errors per
 * Work Unit entry, and the Work Unit surface never committed at all — `WU.SURFACE`, `WU.QUEUE`,
 * `FP.SURFACE` and `RR.SURFACE` were entirely absent. After: zero errors and all of them commit.
 *
 * This test reproduces the two-writer condition and fails if the effect ever again depends on
 * something that changes when the scope is written.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

let renders = 0;
let lastScopeJson: string | null = null;

function ScopeProbe() {
    const assistant = useGlobalAssistantOptional();
    renders += 1;
    lastScopeJson = JSON.stringify(assistant?.workspaceScope ?? null);
    return null;
}

/** Both surfaces mounted at once — exactly what a retained workspace behind a work unit does. */
function TwoWriters() {
    return (
        <GlobalAssistantProvider>
            <ScopeProbe />
            {/* retained Workspace: department only, no work unit */}
            <BosWorkspaceScopeSync departmentId="dept-1" />
            {/* live Work Unit: same department, with a work unit */}
            <BosWorkspaceScopeSync departmentId="dept-1" workUnitId="wu-9" workUnitName="Tours" />
        </GlobalAssistantProvider>
    );
}

function mount(ui: React.ReactElement) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(ui));
}

describe("BosWorkspaceScopeSync — two concurrent scope writers", () => {
    it("settles instead of looping when both surfaces are mounted", () => {
        renders = 0;
        mount(<TwoWriters />);
        // A feedback loop shows up as an unbounded render count. Mount plus a bounded number of
        // scope commits is expected; anything near React's 50-update bailout is the defect.
        expect(renders).toBeLessThan(15);
    });

    it("leaves the MORE SPECIFIC scope in place — the work unit, not the retained workspace", () => {
        mount(<TwoWriters />);
        const scope = JSON.parse(lastScopeJson ?? "null");
        expect(scope).not.toBeNull();
        expect(scope.department_id).toBe("dept-1");
        // Mount order decides, which is what the component's unmount comment always intended:
        // "the next surface will overwrite".
        expect(scope.work_unit_id).toBe("wu-9");
    });

    it("still publishes scope when only one surface is mounted", () => {
        mount(
            <GlobalAssistantProvider>
                <ScopeProbe />
                <BosWorkspaceScopeSync departmentId="dept-2" workUnitId="wu-1" workUnitName="All" />
            </GlobalAssistantProvider>,
        );
        const scope = JSON.parse(lastScopeJson ?? "null");
        expect(scope.department_id).toBe("dept-2");
        expect(scope.work_unit_id).toBe("wu-1");
    });

    it("clears scope when the department goes away", () => {
        mount(
            <GlobalAssistantProvider>
                <ScopeProbe />
                <BosWorkspaceScopeSync departmentId={null} />
            </GlobalAssistantProvider>,
        );
        expect(JSON.parse(lastScopeJson ?? '"x"')).toBeNull();
    });

    it("depends on the stable setter, never the whole assistant context", () => {
        // The loop is only absent while this holds: the context value is memoised over
        // `workspaceScope`, so depending on it re-runs the effect on every scope write.
        const src = require("node:fs").readFileSync(
            require("node:path").join(__dirname, "..", "..", "components/presentation/rightRail/BosWorkspaceScopeSync.tsx"),
            "utf8",
        ) as string;
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        const deps = code.slice(code.lastIndexOf("}, ["), code.lastIndexOf("]);"));
        expect(deps).toContain("setWorkspaceScope");
        expect(deps).not.toMatch(/\bassistant\b/);
    });
});
