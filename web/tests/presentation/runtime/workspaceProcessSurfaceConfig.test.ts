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
    resolveWorkViewIcon,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import type { WorkViewLinkModel } from "@/lib/presentation/runtime";

function view(over: Partial<WorkViewLinkModel>): WorkViewLinkModel {
    return {
        id: "v",
        label: "V",
        isActive: false,
        count: null,
        href: "#",
        attentionCount: null,
        overdueCount: null,
        primaryGrainCount: null,
        supportingGrainCount: null,
        primaryGrainKind: null,
        supportingGrainKind: null,
        primaryGrainLabel: null,
        supportingGrainLabel: null,
        ...over,
    };
}
function cfg(over: Partial<WorkspaceProcessSurfaceConfig["todaysWork"]>): WorkspaceProcessSurfaceConfig {
    return {
        ...DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
        todaysWork: { ...DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG.todaysWork, ...over },
    };
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
        expect(b.todaysWork.sort).toBe("configured");
        expect(b.todaysWork.maxRows).toBe(0);
    });

    /**
     * The default answers "the operator said nothing", and it used to answer it with `attention` —
     * the same value it gave a surface that had explicitly CHOSEN attention-first. Those are
     * different facts, and collapsing them meant every surface published before the field existed was
     * attention-sorted without anyone asking for it, which reads as the tile ignoring the configured
     * Work View order rather than as a setting.
     */
    describe("todaysWork.sort — declared order wins unless attention was chosen", () => {
        it("an ABSENT sort is the operator's configured order", () => {
            expect(normalizeWorkspaceProcessSurfaceConfig({ todaysWork: {} }).todaysWork.sort).toBe("configured");
            expect(normalizeWorkspaceProcessSurfaceConfig({}).todaysWork.sort).toBe("configured");
            expect(normalizeWorkspaceProcessSurfaceConfig(null).todaysWork.sort).toBe("configured");
        });

        it("an EXPLICIT attention-first surface keeps attention-first — this change does not touch it", () => {
            const kept = normalizeWorkspaceProcessSurfaceConfig({
                todaysWork: { visible: true, maxRows: 4, sort: "attention", showCounts: true },
            });
            expect(kept.todaysWork.sort).toBe("attention");
            // and the rest of that surface's choices survive alongside it
            expect(kept.todaysWork).toEqual({ visible: true, maxRows: 4, sort: "attention", showCounts: true });
        });

        it("every recognized mode round-trips", () => {
            for (const sort of ["attention", "count", "configured"] as const) {
                expect(normalizeWorkspaceProcessSurfaceConfig({ todaysWork: { sort } }).todaysWork.sort).toBe(sort);
            }
        });

        it("an unrecognized mode is not silently read as attention", () => {
            expect(
                normalizeWorkspaceProcessSurfaceConfig({ todaysWork: { sort: "needs_attention" } }).todaysWork.sort,
            ).toBe("configured");
        });
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
                    icon: "users",
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
            icon: "users",
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
            icon: "grid", // default
            supportingSignalKey: "x",
            ctaLabel: null,
            primarySignalLabel: null,
            supportingSignalLabel: null,
            metricPresentation: "inline", // default
        });
        // unknown process → neutral identity, no overrides
        expect(resolveProcessCardConfig(config, "capacity")).toEqual({
            title: null, subtitle: null, accent: null, icon: "grid", supportingSignalKey: null, ctaLabel: null,
            primarySignalLabel: null, supportingSignalLabel: null, metricPresentation: "inline",
        });
        // null key + missing map → still safe (no throw)
        expect(resolveProcessCardConfig({ ...config, cardByProcess: undefined as never }, null).icon).toBe("grid");
    });
});

describe("metric presentation (inline | stacked) — presentation-only config", () => {
    it("carries a valid metricPresentation and drops invalid values", () => {
        const stacked = normalizeWorkspaceProcessSurfaceConfig({
            cardByProcess: { enrollment: { metricPresentation: "stacked" } },
        });
        expect(stacked.cardByProcess.enrollment.metricPresentation).toBe("stacked");
        const bad = normalizeWorkspaceProcessSurfaceConfig({
            cardByProcess: { enrollment: { metricPresentation: "diagonal" } },
        });
        // invalid enum → dropped → whole card is empty → dropped
        expect(bad.cardByProcess.enrollment).toBeUndefined();
    });

    it("resolves to inline by default", () => {
        expect(resolveProcessCardConfig(DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG, "enrollment").metricPresentation).toBe(
            "inline",
        );
    });
});

describe("workViewIconById — Work-View-owned row glyph (config-driven)", () => {
    it("normalizes the map, dropping empty keys and non-vocabulary icons", () => {
        const n = normalizeWorkspaceProcessSurfaceConfig({
            workViewIconById: { new_leads: "users", waitlist: "clipboard", bogus: "not-an-icon", "  ": "grid" },
        });
        expect(n.workViewIconById).toEqual({ new_leads: "users", waitlist: "clipboard" });
        expect(normalizeWorkspaceProcessSurfaceConfig({}).workViewIconById).toEqual({});
    });

    it("resolveWorkViewIcon prefers work_view_id, falls back to platformKey, else null", () => {
        const config = normalizeWorkspaceProcessSurfaceConfig({
            workViewIconById: { new_leads: "users", "stage:tour": "calendar" },
        });
        expect(resolveWorkViewIcon(config, { workViewId: "new_leads", platformKey: "x" })).toBe("users");
        expect(resolveWorkViewIcon(config, { workViewId: null, platformKey: "stage:tour" })).toBe("calendar");
        expect(resolveWorkViewIcon(config, { workViewId: "unknown", platformKey: "also_unknown" })).toBeNull();
        // never name-derived: an unmapped view is fallback (null), not guessed from label
        expect(resolveWorkViewIcon(config, { workViewId: "waitlist", platformKey: "waitlist" })).toBeNull();
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

    it("truncation happens AFTER the sort, never before it", () => {
        // Order matters and the sequence is deliberate: resolve every eligible view → sort → slice.
        // Slicing first would sort an arbitrary pre-sort subset, so the tile would show the top of the
        // wrong set. Under attention-first with a row limit, a low-attention view dropping off the
        // tile is the operator's stated intent, not a defect.
        const out = applyTodaysWorkConfig(views, cfg({ sort: "attention", maxRows: 1 }));
        expect(out.map((v) => v.id)).toEqual(["b"]); // the highest-attention view, not the first-configured
    });

    it("never fabricates rows or counts — only orders/slices what it's given", () => {
        expect(applyTodaysWorkConfig([], cfg({}))).toEqual([]);
    });
});

describe("Surface Builder registry: Workspaces section (header + process summaries)", () => {
    function src(rel: string): string {
        return readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
    }
    it("loads workspace summaries from lifecycle catalog (not hardcoded domains)", () => {
        const catalog = src("lib/adminV2/settings/surfaces/workspaceProcessCatalog.ts");
        expect(catalog).toContain("LifecycleCatalogEntry");
        expect(catalog).not.toContain("WORKSPACE_SIGNAL_BUSINESS_PROCESSES");
        const hook = src("components/adminV2/settings/surfaces/useWorkspaceProcessCatalog.ts");
        expect(hook).toContain("/api/admin/lifecycle-catalog");
    });
    it("runtime header consumes entity_layouts workspace_header config (not metric_placements)", () => {
        const surface = src("components/presentation/workspace/WorkspaceSurface.tsx");
        expect(surface).toContain("model.processConfig");
        expect(surface).toContain("model.header");
        expect(surface).not.toContain("useWorkspaceProcessSurfaceConfig()");
        const hook = src("lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts");
        expect(hook).not.toContain("seedWorkspaceHeaderCalculations");
        expect(hook).toContain("useWorkspaceProcessSurfaceConfigState");
        expect(hook).toContain("useWorkspaceHeaderSurfaceConfigState");
        expect(hook).toContain("buildWorkspaceHeaderPresentation");
        expect(hook).toContain("selectWorkspaceProcessTileSnapshot");
    });
});
