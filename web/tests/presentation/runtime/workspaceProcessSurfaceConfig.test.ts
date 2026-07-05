/**
 * Workspace Process Surface — config model + first-class `workspace` LayoutSurface.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
    LAYOUT_SURFACES,
    RECORD_LAYOUT_SURFACES,
    asRecordLayoutSurface,
    isRecordLayoutSurface,
} from "@/lib/layout/layoutV2";
import {
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    applyTodaysWorkConfig,
    normalizeWorkspaceProcessSurfaceConfig,
    resolveProcessCardConfig,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";

function view(over: Partial<WorkViewLinkModel>): WorkViewLinkModel {
    return { id: "v", label: "V", isActive: false, count: null, href: "#", attentionCount: null, overdueCount: null, ...over };
}
function cfg(over: Partial<WorkspaceProcessSurfaceConfig["todaysWork"]>): WorkspaceProcessSurfaceConfig {
    return { version: 1, todaysWork: { ...DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG.todaysWork, ...over } };
}

describe("workspace is a first-class LayoutSurface", () => {
    it("LAYOUT_SURFACES includes workspace; RECORD_LAYOUT_SURFACES does not", () => {
        expect(LAYOUT_SURFACES).toContain("workspace");
        expect(RECORD_LAYOUT_SURFACES as readonly string[]).not.toContain("workspace");
        expect(isRecordLayoutSurface("workspace")).toBe(false);
        expect(isRecordLayoutSurface("drawer")).toBe(true);
        expect(asRecordLayoutSurface("workspace")).toBe("drawer"); // non-record narrows to drawer
        expect(asRecordLayoutSurface("queue")).toBe("queue");
    });
});

describe("normalizeWorkspaceProcessSurfaceConfig", () => {
    it("defaults when given garbage; coerces valid partials", () => {
        expect(normalizeWorkspaceProcessSurfaceConfig(null)).toEqual(DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG);
        const n = normalizeWorkspaceProcessSurfaceConfig({ todaysWork: { visible: false, maxRows: 2, sort: "count", showCounts: false } });
        expect(n.todaysWork).toEqual({ visible: false, maxRows: 2, sort: "count", showCounts: false });
        // bad sort / negative maxRows fall back
        const b = normalizeWorkspaceProcessSurfaceConfig({ todaysWork: { sort: "nope", maxRows: -3 } });
        expect(b.todaysWork.sort).toBe("attention");
        expect(b.todaysWork.maxRows).toBe(0);
    });

    it("carries the per-process Primary Signal map (ignoring non-string entries)", () => {
        const n = normalizeWorkspaceProcessSurfaceConfig({
            primarySignalByProcess: { enrollment: "enrollment.tour_conversion_rate", forms: 42, financial: "  " },
        });
        expect(n.primarySignalByProcess).toEqual({ enrollment: "enrollment.tour_conversion_rate" });
        // absent map → empty (no hardcoded default signal)
        expect(normalizeWorkspaceProcessSurfaceConfig({}).primarySignalByProcess).toEqual({});
    });

    it("carries per-process card overrides; clamps enums, drops empties, drops all-empty cards", () => {
        const n = normalizeWorkspaceProcessSurfaceConfig({
            cardByProcess: {
                enrollment: {
                    title: "  Family Enrollment  ",
                    subtitle: "",
                    accent: "pine",
                    icon: "leads",
                    supportingSignalKey: "enrollment.tours_scheduled",
                    ctaLabel: "Work leads",
                },
                financial: { accent: "not-a-token", icon: "bogus" }, // invalid enums → dropped → empty card dropped
                forms: "nope", // non-object → dropped
            },
        });
        expect(n.cardByProcess.enrollment).toEqual({
            title: "Family Enrollment", // trimmed
            accent: "pine",
            icon: "leads",
            supportingSignalKey: "enrollment.tours_scheduled",
            ctaLabel: "Work leads",
        });
        expect(n.cardByProcess.enrollment.subtitle).toBeUndefined(); // empty dropped
        expect(n.cardByProcess.financial).toBeUndefined(); // no valid field → whole card dropped
        expect(n.cardByProcess.forms).toBeUndefined();
        // absent map → empty
        expect(normalizeWorkspaceProcessSurfaceConfig({}).cardByProcess).toEqual({});
    });
});

describe("resolveProcessCardConfig", () => {
    it("resolves overrides to safe defaults; unknown/absent process → all defaults", () => {
        const config = normalizeWorkspaceProcessSurfaceConfig({
            cardByProcess: { enrollment: { title: "Family Enrollment", accent: "ember", supportingSignalKey: "x" } },
        });
        expect(resolveProcessCardConfig(config, "enrollment")).toEqual({
            title: "Family Enrollment",
            subtitle: null,
            accent: "ember",
            icon: "generic", // default
            supportingSignalKey: "x",
            ctaLabel: null,
        });
        // unknown process → neutral identity, no overrides
        expect(resolveProcessCardConfig(config, "capacity")).toEqual({
            title: null, subtitle: null, accent: null, icon: "generic", supportingSignalKey: null, ctaLabel: null,
        });
        // null key + missing map → still safe (no throw)
        expect(resolveProcessCardConfig({ ...config, cardByProcess: undefined as never }, null).icon).toBe("generic");
    });
});

describe("applyTodaysWorkConfig", () => {
    const views = [
        view({ id: "a", label: "A", count: 5, attentionCount: null }),
        view({ id: "b", label: "B", count: 20, attentionCount: 3 }),
        view({ id: "c", label: "C", count: 12, overdueCount: 2 }),
    ];

    it("visible=false → empty", () => {
        expect(applyTodaysWorkConfig(views, cfg({ visible: false }))).toEqual([]);
    });

    it("sort=attention → attention, then overdue, then count", () => {
        const out = applyTodaysWorkConfig(views, cfg({ sort: "attention" }));
        expect(out.map((v) => v.id)).toEqual(["b", "c", "a"]);
    });

    it("sort=count → highest count first", () => {
        const out = applyTodaysWorkConfig(views, cfg({ sort: "count" }));
        expect(out.map((v) => v.id)).toEqual(["b", "c", "a"]);
    });

    it("sort=configured → original order preserved", () => {
        const out = applyTodaysWorkConfig(views, cfg({ sort: "configured" }));
        expect(out.map((v) => v.id)).toEqual(["a", "b", "c"]);
    });

    it("maxRows truncates (0 = all)", () => {
        expect(applyTodaysWorkConfig(views, cfg({ sort: "configured", maxRows: 2 })).map((v) => v.id)).toEqual(["a", "b"]);
        expect(applyTodaysWorkConfig(views, cfg({ sort: "configured", maxRows: 0 }))).toHaveLength(3);
    });

    it("never fabricates rows or counts — only orders/slices what it's given", () => {
        expect(applyTodaysWorkConfig([], cfg({}))).toEqual([]);
    });
});

describe("Surface Builder registry: Workspace Processes replaces Workspace Header", () => {
    function src(rel: string): string {
        return readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
    }
    it("surfaceLibrary lists workspace-processes and not workspace-header", () => {
        const s = src("lib/platform/surfaceBuilder/surfaceLibrary.ts");
        expect(s).toContain('id: "workspace-processes"');
        expect(s).not.toContain('id: "workspace-header"');
    });
    it("config settings expose the workspace-processes editor, not workspace-header", () => {
        const s = src("components/adminV2/settings/surfaces/useSurfacesConfigurationSettings.ts");
        expect(s).toContain('editor: "workspace-processes"');
        expect(s).not.toContain('editor: "workspace-header"');
    });
    it("the runtime no longer reads workspace_header placements on the workspace surface", () => {
        // WorkspaceSurface renders no header calculations strip; the hook drops the seed.
        const surface = src("components/presentation/workspace/WorkspaceSurface.tsx");
        expect(surface).not.toContain("WorkspaceHeaderCalculations");
        const hook = src("lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts");
        expect(hook).not.toContain("seedWorkspaceHeaderCalculations");
    });
});
