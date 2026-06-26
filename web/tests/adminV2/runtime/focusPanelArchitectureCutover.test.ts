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

describe("Phase C — Subject Surface presentation shims", () => {
    const SHIM_TARGETS: Array<{ file: string; target: string }> = [
        {
            file: "components/admin/subjectSurface/EnrollmentSubjectSurfaceRuntime.tsx",
            target: '@/components/admin/vmDrawer/OpportunityDrawerVmRuntime',
        },
        {
            file: "components/admin/subjectSurface/PersonSubjectSurfaceRuntime.tsx",
            target: '@/components/admin/vmDrawer/PersonsDrawerVmRuntime',
        },
        {
            file: "components/admin/subjectSurface/SubjectSurfaceRuntime.tsx",
            target: '@/components/admin/AdminEntityDrawer',
        },
        {
            file: "components/admin/subjectSurface/FocusPanelShell.tsx",
            target: '@/components/admin/drawer/EntityDrawerOperatingShell',
        },
    ];

    it.each(SHIM_TARGETS)("$file re-exports its implementation unchanged", ({ file, target }) => {
        const src = readSrc(file);
        expect(src).toContain(`export { default } from "${target}"`);
        // Shims must not contain implementation — no component bodies.
        expect(src).not.toContain("export default function");
        expect(src).not.toContain("useState");
    });

    it("barrel exposes canonical names and deprecated compat aliases to the same modules", () => {
        const barrel = readSrc("components/admin/subjectSurface/index.ts");
        expect(barrel).toContain("EnrollmentSubjectSurfaceRuntime");
        expect(barrel).toContain("PersonSubjectSurfaceRuntime");
        expect(barrel).toContain("SubjectSurfaceRuntime");
        expect(barrel).toContain("FocusPanelRuntime");
        expect(barrel).toContain("FocusPanelShell");
        expect(barrel).toContain("OperationalSubjectViewModel");
        expect(barrel).toContain("SubjectComposition");

        // Deprecated compat names route through the canonical shims (same module).
        expect(barrel).toContain("@deprecated");
        expect(barrel).toMatch(
            /OpportunityDrawerVmRuntime[\s\S]*subjectSurface\/EnrollmentSubjectSurfaceRuntime/,
        );
        expect(barrel).toMatch(
            /PersonsDrawerVmRuntime[\s\S]*subjectSurface\/PersonSubjectSurfaceRuntime/,
        );
    });

    it("FocusPanelRuntime and SubjectSurfaceRuntime resolve to the same router module", () => {
        const barrel = readSrc("components/admin/subjectSurface/index.ts");
        const subjectRuntime = barrel.match(
            /as SubjectSurfaceRuntime\s*\}\s*from\s*["']([^"']+)["']/,
        )?.[1];
        const focusRuntime = barrel.match(
            /as FocusPanelRuntime\s*\}\s*from\s*["']([^"']+)["']/,
        )?.[1];
        expect(subjectRuntime).toBeDefined();
        expect(focusRuntime).toBe(subjectRuntime);
    });

    it("router imports canonical Subject Surface runtime names (no vmDrawer runtime imports)", () => {
        const router = readSrc("components/admin/AdminEntityDrawer.tsx");
        expect(router).toContain(
            'import EnrollmentSubjectSurfaceRuntime from "@/components/admin/subjectSurface/EnrollmentSubjectSurfaceRuntime"',
        );
        expect(router).toContain(
            'import PersonSubjectSurfaceRuntime from "@/components/admin/subjectSurface/PersonSubjectSurfaceRuntime"',
        );
        expect(router).toContain("<EnrollmentSubjectSurfaceRuntime />");
        expect(router).toContain("<PersonSubjectSurfaceRuntime />");
        expect(router).not.toContain('from "@/components/admin/vmDrawer/OpportunityDrawerVmRuntime"');
        expect(router).not.toContain('from "@/components/admin/vmDrawer/PersonsDrawerVmRuntime"');
    });

    it("vmDrawer runtime implementations carry deprecation pointers to canonical names", () => {
        const opp = readSrc("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const person = readSrc("components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx");
        expect(opp).toContain("@deprecated");
        expect(opp).toContain("EnrollmentSubjectSurfaceRuntime");
        expect(person).toContain("@deprecated");
        expect(person).toContain("PersonSubjectSurfaceRuntime");
        // Implementation is still here — behavior unchanged.
        expect(opp).toContain("export default function OpportunityDrawerVmRuntime()");
        expect(person).toContain("export default function PersonsDrawerVmRuntime()");
    });

    it("OperationalSubjectViewModel aliases the drawer VM type", () => {
        const typesSrc = readSrc("lib/adminV2/viewModel/drawer/types.ts");
        expect(typesSrc).toContain(
            "export type OperationalSubjectViewModel = OpportunityDrawerViewModel",
        );
        expect(typesSrc).toContain(
            "export type OperationalSubjectViewModelResult = OpportunityDrawerViewModelResult",
        );
    });

    it("vocabulary doc documents the Phase C subject surface map", () => {
        const doc = readFileSync(
            join(webRoot, "../docs/platform/operator/focus-panel-architecture-vocabulary.md"),
            "utf8",
        );
        expect(doc).toContain("Subject Surface presentation layer (Phase C)");
        expect(doc).toContain("EnrollmentSubjectSurfaceRuntime");
        expect(doc).toContain("PersonSubjectSurfaceRuntime");
        expect(doc).toContain("FocusPanelShell");
    });
});
