import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());

function readSrc(relativePath: string): string {
    return readFileSync(join(webRoot, relativePath), "utf8");
}

function exists(relativePath: string): boolean {
    return existsSync(join(webRoot, relativePath));
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

    it("Activity mode is the composed cockpit (canonical)", () => {
        const workspace = readSrc("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        // Canonical Activity mode: one-viewport operational cockpit.
        expect(workspace).toContain('data-focus-panel-cockpit="true"');
        expect(workspace).toContain("alloy-os-activity-cockpit");
        // Focus Panel identity marker retained on the cockpit root.
        expect(workspace).toContain("data-focus-panel-embedded-workspace");
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
        expect(doc).toContain("Activity Cockpit");
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

describe("Phase D0 — card layer consumes Operational Context", () => {
    it("no product-level Person Focus Panel surfaces exist", () => {
        // There is ONE Focus Panel. Person/child are subjects, not surfaces.
        expect(exists("components/admin/focusPanel/PersonFocusPanelModeBody.tsx")).toBe(false);
        expect(exists("components/admin/focusPanel/PersonFocusPanelHeader.tsx")).toBe(false);
    });

    it("card renderer derives subject identity + truth from Operational Context", () => {
        const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer).toContain("context: OperationalContext");
        expect(renderer).toContain("const drawerId = context.subject.id");
        expect(renderer).toContain("const record = context.truth");
        // The card contract no longer accepts a standalone drawerId / record prop.
        expect(renderer).not.toContain("drawerId: string;");
        expect(renderer).not.toContain("record: Record<string, unknown>;");
    });

    it("Household card observes the Operational Context, not the drawer VM", () => {
        const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer).toContain("<HouseholdCard model={model} context={context}");
    });

    it("both renderer callers build the context via the sanctioned adapter", () => {
        const grid = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        const editor = readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");
        expect(grid).toContain("buildOperationalContext");
        expect(grid).toContain("context={operationalContext}");
        expect(editor).toContain("buildOperationalContext");
        expect(editor).toContain("context={previewContext}");
    });
});

describe("Phase D1/D2 — card renderer contract is context-first, compat isolated", () => {
    const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");

    it("drops stale card-facing props (opportunitySingular, canMutate)", () => {
        expect(renderer).not.toContain("opportunitySingular");
        expect(renderer).not.toContain("canMutate");
    });

    it("does not expose drawer-shaped props on the main card contract", () => {
        // Inspect ONLY the `type Props = { ... }` block; match prop DECLARATIONS
        // (line-anchored `name:`), not comment prose that references the terms.
        const start = renderer.indexOf("type Props = {");
        const propsBlock = renderer.slice(start, renderer.indexOf("};", start) + 2);
        expect(start).toBeGreaterThan(-1);
        for (const banned of [
            "displayVm",
            "onSelectTab",
            "drawerId",
            "record",
            "opportunitySingular",
            "canMutate",
        ]) {
            expect(propsBlock).not.toMatch(new RegExp(`^\\s*${banned}\\??:`, "m"));
        }
        // The only sanctioned compatibility entry on the contract is the wrapper.
        expect(propsBlock).toContain("compat: FocusPanelCardCompat");
    });

    it("isolates compatibility behind an explicit FocusPanelCardCompat wrapper", () => {
        expect(renderer).toContain("export type FocusPanelCardCompat");
        expect(renderer).toContain("subjectVm: OperationalSubjectViewModel");
        expect(renderer).toContain("compat: FocusPanelCardCompat");
        // Drill cards read the wrapper, not loose props.
        expect(renderer).toContain("displayVm: compat.subjectVm");
        expect(renderer).toContain("onSelectTab={compat.onSelectTab}");
    });

    it("pure Household path needs only model + context (no compat, no drawer terms)", () => {
        // Household returns before any compat / drawerId / record access.
        const householdIdx = renderer.indexOf('if (model.key === "household")');
        const drawerIdIdx = renderer.indexOf("const drawerId = context.subject.id");
        expect(householdIdx).toBeGreaterThan(-1);
        expect(drawerIdIdx).toBeGreaterThan(householdIdx);
        expect(renderer).toContain("<HouseholdCard model={model} context={context}");
    });

    it("HouseholdCard component contract excludes drawer/opportunity terminology", () => {
        const card = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        expect(card).toContain("OperationalContext");
        expect(card).not.toContain("displayVm");
        expect(card).not.toContain("drawerId");
        expect(card).not.toContain("DrawerTabKey");
        expect(card).not.toContain("LayoutDoc");
    });

    it("both renderer callers pass the compat wrapper, not loose drawer props", () => {
        const grid = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        const editor = readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");
        expect(grid).toContain("compat={{ subjectVm: displayVm, onSelectTab }}");
        expect(editor).toContain("compat={{ subjectVm: vm, onSelectTab: () => {} }}");
    });
});

describe("Phase D3 — Core Four are pure cards on the Operational Context", () => {
    const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");

    it("renderer wires Children / Current Work / Readiness as pure cards (model + context)", () => {
        expect(renderer).toContain("<ChildrenCard model={model} context={context}");
        expect(renderer).toContain("<CurrentWorkCard model={model} context={context}");
        expect(renderer).toContain("<ReadinessCard model={model} context={context}");
    });

    it("pure card paths return before any compat / drawer access", () => {
        const drawerIdIdx = renderer.indexOf("const drawerId = context.subject.id");
        for (const key of ['model.key === "children"', 'model.key === "current_work"', 'model.key === "readiness_kpi"']) {
            const idx = renderer.indexOf(key);
            expect(idx).toBeGreaterThan(-1);
            expect(drawerIdIdx).toBeGreaterThan(idx);
        }
    });

    it.each([
        "components/admin/focusPanel/cards/ChildrenCard.tsx",
        "components/admin/focusPanel/cards/CurrentWorkCard.tsx",
        "components/admin/focusPanel/cards/ReadinessCard.tsx",
    ])("%s observes OperationalContext and excludes drawer terminology", (file) => {
        const card = readSrc(file);
        expect(card).toContain("OperationalContext");
        expect(card).not.toContain("displayVm");
        expect(card).not.toContain("drawerId");
        expect(card).not.toContain("DrawerTabKey");
        expect(card).not.toContain("LayoutDoc");
    });

    it("adapter projects work / attention / tour signals onto the context", () => {
        const adapter = readSrc("lib/adminV2/runtime/operationalContext/buildOperationalContext.ts");
        expect(adapter).toContain("buildOperationalContextSignals");
        expect(adapter).toContain("signals:");
        const types = readSrc("lib/adminV2/runtime/operationalContext/types.ts");
        expect(types).toContain("OperationalContextSignals");
        expect(types).toContain("signals: OperationalContextSignals");
    });
});
