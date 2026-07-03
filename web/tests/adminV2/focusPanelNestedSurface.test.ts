/**
 * Phase 4 — Focus Panel nested surface: authoring model → runtime consumption.
 *
 * Proves the connection end to end using the EXISTING pieces (no new persistence,
 * no new renderer):
 *   1. nested navigation resolves through the surface registry / resolveOpenSurface
 *      (Focus Panel "Children" component → children_surface)
 *   2. the published nested config is read + reconciled off the Focus Panel summary doc
 *      (metadata.nestedSurfaces["children_surface"])
 *   3. that config flattens to an ordered field-key list
 *   4. the runtime children evidence builder consumes those keys — order + selection of
 *      the child detail line follow the published config
 */

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
    ensureRuntimeSurfacesRegistered,
    focusPanelNestedLaunchers,
} from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import {
    getSurface,
    resolveOpenSurface,
    __resetSurfaceRegistry,
} from "@/lib/platform/surfaceComposition/surfaceRegistry";
import {
    CHILDREN_SURFACE_ID,
    FOCUS_PANEL_SURFACE_ID,
    focusPanelSurface,
} from "@/lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs";
import { surfaceComponents } from "@/lib/platform/surfaceComposition/universalSurfaceModel";
import {
    childrenDetailFieldKeysFromNestedConfig,
    readChildrenNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

describe("Phase 4 — nested navigation via the surface registry (resolveOpenSurface)", () => {
    beforeEach(() => {
        __resetSurfaceRegistry();
    });

    it("registers the nested surfaces and resolveOpenSurface reaches children_surface", () => {
        ensureRuntimeSurfacesRegistered();
        expect(getSurface(CHILDREN_SURFACE_ID)).not.toBeNull();
        expect(getSurface(FOCUS_PANEL_SURFACE_ID)).not.toBeNull();

        const childrenComponent = surfaceComponents(focusPanelSurface).find(
            (c) => c.id === "children_card",
        )!;
        const nested = resolveOpenSurface(childrenComponent, "expanded");
        expect(nested?.id).toBe(CHILDREN_SURFACE_ID);
    });

    it("derives the Focus Panel nested launchers from the registry (not a hardcoded list)", () => {
        const launchers = focusPanelNestedLaunchers();
        const surfaceIds = launchers.map((l) => l.surfaceId);
        expect(surfaceIds).toContain(CHILDREN_SURFACE_ID);
        // the launcher label comes from the resolved component, not a literal
        const children = launchers.find((l) => l.surfaceId === CHILDREN_SURFACE_ID)!;
        expect(children.cardLabel).toBe("Children");
    });
});

describe("Phase 4 — runtime reads the published nested config off the doc", () => {
    function docWithChildrenConfig(config: NestedSurfaceConfig): LayoutDoc {
        return { surfaces: {}, metadata: { nestedSurfaces: { [CHILDREN_SURFACE_ID]: config } } } as unknown as LayoutDoc;
    }

    it("returns null when the doc has no nested config (default order)", () => {
        expect(readChildrenNestedConfigFromDoc(null)).toBeNull();
        expect(readChildrenNestedConfigFromDoc({ surfaces: {} } as unknown as LayoutDoc)).toBeNull();
    });

    it("reads + reconciles the published children_surface config", () => {
        const published: NestedSurfaceConfig = {
            surfaceId: CHILDREN_SURFACE_ID,
            groups: [{ key: "placement", selectedFieldKeys: ["child.room", "inquiry_child.program"] }],
        };
        const config = readChildrenNestedConfigFromDoc(docWithChildrenConfig(published));
        expect(config).not.toBeNull();
        // reconcile keeps the placement selection and re-adds the registry's other groups
        const placement = config!.groups.find((g) => g.key === "placement")!;
        expect(placement.selectedFieldKeys).toEqual(["child.room", "inquiry_child.program"]);
    });

    it("flattens config groups into an ordered field-key list", () => {
        const config: NestedSurfaceConfig = {
            surfaceId: CHILDREN_SURFACE_ID,
            groups: [
                { key: "placement", selectedFieldKeys: ["child.room", "inquiry_child.program"] },
                { key: "schedule", selectedFieldKeys: ["inquiry_child.schedule_type"] },
            ],
        };
        expect(childrenDetailFieldKeysFromNestedConfig(config)).toEqual([
            "child.room",
            "inquiry_child.program",
            "inquiry_child.schedule_type",
        ]);
        expect(childrenDetailFieldKeysFromNestedConfig(null)).toEqual([]);
    });
});

describe("Phase 4 — children evidence builder consumes the published field order", () => {
    /** One inquiry child with program, room, schedule, and a start date all present. */
    function contextWithOneChild(): OperationalContext {
        return {
            truth: {
                _inquiry_children: [
                    {
                        id: "child-1",
                        display_name: "Ari Smith",
                        desired_program_label: "Preschool",
                        program_room_cohort_label: "North Room",
                        desired_schedule_label: "M–F",
                        start_date: "Aug 2026",
                        outcome_status_key: "in_progress",
                    },
                ],
            },
        } as unknown as OperationalContext;
    }

    it("default (no config) → program · room · schedule · starts order", () => {
        const ev = buildChildrenCardEvidence(contextWithOneChild());
        expect(ev.children[0]!.detailLine).toBe("Preschool · North Room · M–F · starts Aug 2026");
    });

    it("published config drives which detail facts appear and their order", () => {
        // Operator configured: room first, then program, and NO schedule/start.
        const ev = buildChildrenCardEvidence(contextWithOneChild(), {
            childDetailFieldKeys: ["child.room", "inquiry_child.program"],
        });
        expect(ev.children[0]!.detailLine).toBe("North Room · Preschool");
    });

    it("config keys with no value for a child are skipped (never fabricated)", () => {
        const ctx = {
            truth: { _inquiry_children: [{ id: "c", display_name: "Bo", desired_program_label: "Toddler" }] },
        } as unknown as OperationalContext;
        const ev = buildChildrenCardEvidence(ctx, {
            childDetailFieldKeys: ["child.room", "inquiry_child.program", "inquiry_child.schedule_type"],
        });
        // only program has a value → detail line is just that
        expect(ev.children[0]!.detailLine).toBe("Toddler");
    });
});

describe("Phase 4 — seams: builder renders real presenter, runtime consumes published config", () => {
    function src(rel: string): string {
        return readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
    }

    it("Focus Panel builder canvas renders the real FocusPanelCardRenderer (not a mock)", () => {
        const s = src("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");
        expect(s).toContain("FocusPanelCardRenderer");
        expect(s).toContain("FocusPanelGridCanvasBuilder");
    });

    it("runtime ChildrenCard consumes the published nested config (no parallel persistence)", () => {
        const s = src("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(s).toContain("usePublishedFocusPanelSummaryDoc");
        expect(s).toContain("readChildrenNestedConfigFromDoc");
        expect(s).toContain("childDetailFieldKeys");
    });

    it("the Children roster fields follow the published config order (reuses existing config)", () => {
        const s = src("components/admin/focusPanel/cards/ChildrenCard.tsx");
        // Roster field→icon map keyed by the same nested-surface field keys as the detail line.
        expect(s).toContain("ROSTER_FIELD_META");
        expect(s).toContain('"inquiry_child.program"');
        // The roster rows receive the published field order.
        expect(s).toContain("fieldKeys={childDetailFieldKeys}");
    });

    it("nested config persistence still targets metadata.nestedSurfaces (existing service)", () => {
        const s = src("lib/adminV2/settings/surfaces/nestedSurfaceConfigService.ts");
        expect(s).toContain("nestedSurfaces");
        expect(s).toContain("publishFocusPanelSummary");
    });
});
