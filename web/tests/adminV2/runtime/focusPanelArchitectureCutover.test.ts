import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());

function readSrc(relativePath: string): string {
    return readFileSync(join(webRoot, relativePath), "utf8");
}

describe("Focus Panel architecture cutover vocabulary", () => {
    it("canonical EmbeddedWorkspace module exports tab registry", async () => {
        const mod = await import("@/lib/adminV2/runtime/focusPanel/embeddedWorkspaceTabs");
        expect(mod.EMBEDDED_WORKSPACE_TABS.length).toBeGreaterThan(0);
        expect(mod.DEFAULT_EMBEDDED_WORKSPACE_TAB).toBe("timeline");
    });

    it("activityWorkspaceTabs re-exports EmbeddedWorkspace symbols for compat", async () => {
        const legacy = await import("@/lib/adminV2/runtime/focusPanel/activityWorkspaceTabs");
        const canonical = await import("@/lib/adminV2/runtime/focusPanel/embeddedWorkspaceTabs");
        expect(legacy.ACTIVITY_WORKSPACE_TABS).toEqual(canonical.EMBEDDED_WORKSPACE_TABS);
    });

    it("ModeGrid renders EmbeddedWorkspace for activity mode", () => {
        const modeGrid = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        expect(modeGrid).toContain("OpportunityFocusPanelEmbeddedWorkspace");
        expect(modeGrid).not.toContain("OpportunityFocusPanelActivityWorkspace");
    });

    it("EmbeddedWorkspace component is canonical implementation", () => {
        const workspace = readSrc("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        expect(workspace).toContain("data-focus-panel-embedded-workspace");
        expect(workspace).toContain("EMBEDDED_WORKSPACE_TABS");
    });

    it("ActivityWorkspace file is a thin compat re-export", () => {
        const legacy = readSrc("components/admin/focusPanel/OpportunityFocusPanelActivityWorkspace.tsx");
        expect(legacy).toContain("OpportunityFocusPanelEmbeddedWorkspace");
        expect(legacy).not.toContain("export default function");
    });

    it("useFocusPanelDocked aliases runtime split hook", async () => {
        const docked = await import("@/lib/adminV2/runtime/useFocusPanelDocked");
        const split = await import("@/lib/adminV2/runtime/useAlloyOsRuntimeSplitActive");
        expect(docked.useFocusPanelDocked).toBe(split.useAlloyOsRuntimeSplitActive);
    });

    it("SubjectComposition type is exported from focus panel runtime", async () => {
        const mod = await import("@/lib/adminV2/runtime/focusPanel/subjectComposition");
        const sample: import("@/lib/adminV2/runtime/focusPanel/subjectComposition").SubjectComposition = {
            mode: "work",
            cards: [],
        };
        expect(sample.mode).toBe("work");
        expect(mod).toBeDefined();
    });

    it("OpportunityFocusPanelViewModel aliases drawer VM type", () => {
        const typesSrc = readSrc("lib/adminV2/viewModel/drawer/types.ts");
        expect(typesSrc).toContain("export type OpportunityFocusPanelViewModel = OpportunityDrawerViewModel");
    });

    it("vocabulary doctrine doc names canonical terms", () => {
        const doc = readFileSync(
            join(webRoot, "../docs/platform/operator/focus-panel-architecture-vocabulary.md"),
            "utf8",
        );
        expect(doc).toContain("Focus Panel");
        expect(doc).toContain("Operational Subject");
        expect(doc).toContain("Subject Composition");
        expect(doc).toContain("Embedded Workspace");
    });
});
