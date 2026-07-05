/**
 * Universal nested-surface drill-in: registry launchers, canvas affordance, runtime consumption.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
    ensureRuntimeSurfacesRegistered,
    focusPanelNestedLaunchers,
    focusPanelNestedSurfaceByCardKey,
    nestedLaunchersForSurface,
    nestedLauncherForFocusPanelCard,
} from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import {
    getSurface,
    resolveOpenSurface,
    __resetSurfaceRegistry,
    registerSurface,
} from "@/lib/platform/surfaceComposition/surfaceRegistry";
import {
    CHILDREN_SURFACE_ID,
    FINANCIAL_CONFIG_SURFACE_ID,
    FOCUS_PANEL_SURFACE_ID,
    focusPanelSurface,
} from "@/lib/platform/surfaceComposition/definitions/recursiveSurfaceProofs";
import { surfaceComponents, type SurfaceSpec } from "@/lib/platform/surfaceComposition/universalSurfaceModel";
import {
    childrenDetailFieldKeysFromNestedConfig,
    readChildrenNestedConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import {
    buildFinancialNestedSurfaceGroups,
    readFinancialNestedSurfaceGroupsFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/billingPreview/financialNestedSurfaceRuntime";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

describe("nested navigation via the surface registry (resolveOpenSurface)", () => {
    beforeEach(() => {
        __resetSurfaceRegistry();
    });

    it("registers the nested surfaces and resolveOpenSurface reaches children_surface", () => {
        ensureRuntimeSurfacesRegistered();
        expect(getSurface(CHILDREN_SURFACE_ID)).not.toBeNull();
        expect(getSurface(FOCUS_PANEL_SURFACE_ID)).not.toBeNull();

        const childrenComponent = surfaceComponents(focusPanelSurface).find((c) => c.id === "children_card")!;
        const nested = resolveOpenSurface(childrenComponent, "expanded");
        expect(nested?.id).toBe(CHILDREN_SURFACE_ID);
    });

    it("derives Focus Panel nested launchers from the registry (not a hardcoded list)", () => {
        const launchers = focusPanelNestedLaunchers();
        const surfaceIds = launchers.map((l) => l.surfaceId);
        expect(surfaceIds).toContain(CHILDREN_SURFACE_ID);
        expect(surfaceIds).toContain(FINANCIAL_CONFIG_SURFACE_ID);
        const children = launchers.find((l) => l.surfaceId === CHILDREN_SURFACE_ID)!;
        expect(children.cardLabel).toBe("Children");
    });

    it("nestedLaunchersForSurface works for a non-Focus-Panel parent surface", () => {
        ensureRuntimeSurfacesRegistered();
        const parent: SurfaceSpec = {
            id: "parent_operational_surface",
            label: "Parent Operational",
            category: "operational_config",
            canvas: {
                rows: [
                    {
                        id: "row-1",
                        components: [
                            {
                                id: "nested_host",
                                label: "Host Panel",
                                componentType: "config_panel",
                                depth: { workspace: { openSurfaceId: FINANCIAL_CONFIG_SURFACE_ID } },
                                evidenceGroups: [{ key: "host", label: "Host Summary", items: [] }],
                            },
                        ],
                    },
                ],
            },
        };
        registerSurface(parent);
        const launchers = nestedLaunchersForSurface(parent);
        expect(launchers).toHaveLength(1);
        expect(launchers[0]!.surfaceId).toBe(FINANCIAL_CONFIG_SURFACE_ID);
        expect(launchers[0]!.depth).toBe("workspace");
    });

    it("maps Focus Panel canvas card keys to nested surface ids", () => {
        ensureRuntimeSurfacesRegistered();
        expect(focusPanelNestedSurfaceByCardKey().children?.surfaceId).toBe(CHILDREN_SURFACE_ID);
        expect(focusPanelNestedSurfaceByCardKey().billing_preview?.surfaceId).toBe(FINANCIAL_CONFIG_SURFACE_ID);
        expect(nestedLauncherForFocusPanelCard("children")?.surfaceId).toBe(CHILDREN_SURFACE_ID);
    });
});

describe("runtime reads the published nested config off the doc", () => {
    function docWithNestedConfig(surfaceId: string, config: NestedSurfaceConfig): LayoutDoc {
        return { surfaces: {}, metadata: { nestedSurfaces: { [surfaceId]: config } } } as unknown as LayoutDoc;
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
        const config = readChildrenNestedConfigFromDoc(docWithNestedConfig(CHILDREN_SURFACE_ID, published));
        expect(config).not.toBeNull();
        const placement = config!.groups.find((g) => g.key === "placement")!;
        expect(placement.selectedFieldKeys).toEqual(["child.room", "inquiry_child.program"]);
    });

    it("flattens config groups into an ordered field-key list", () => {
        const config: NestedSurfaceConfig = {
            surfaceId: CHILDREN_SURFACE_ID,
            groups: [
                { key: "placement", selectedFieldKeys: ["child.room", "inquiry_child.program"] },
                { key: "identity", selectedFieldKeys: ["child.name"] },
            ],
        };
        expect(childrenDetailFieldKeysFromNestedConfig(config)).toEqual([
            "child.room",
            "inquiry_child.program",
            "child.name",
        ]);
    });
});

describe("children evidence builder consumes the published field order", () => {
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
        const ev = buildChildrenCardEvidence(contextWithOneChild(), {
            childDetailFieldKeys: ["child.room", "inquiry_child.program"],
        });
        expect(ev.children[0]!.detailLine).toBe("North Room · Preschool");
    });
});

describe("Financial Configuration consumes published nested-surface fields", () => {
    const context = {
        signals: {
            billing: {
                billingConfigured: true,
                billingContactName: "Jordan Lee",
                billingContactEmail: null,
                tuitionRateLabel: "$1,200/mo",
                feeBalanceCents: 0,
            },
        },
        truth: {},
    } as unknown as OperationalContext;

    it("renders configured financial nested-surface groups from the doc", () => {
        const doc = {
            surfaces: {},
            metadata: {
                nestedSurfaces: {
                    [FINANCIAL_CONFIG_SURFACE_ID]: {
                        surfaceId: FINANCIAL_CONFIG_SURFACE_ID,
                        groups: [
                            {
                                key: "current_configuration",
                                selectedFieldKeys: ["billing.tuition_rate", "billing.resolved_total"],
                            },
                        ],
                    },
                },
            },
        } as unknown as LayoutDoc;

        const groups = readFinancialNestedSurfaceGroupsFromDoc(doc, context, null);
        expect(groups).not.toBeNull();
        expect(groups![0]!.key).toBe("current_configuration");
        expect(groups![0]!.fields.map((f) => f.key)).toEqual(["billing.tuition_rate", "billing.resolved_total"]);
        expect(groups![0]!.fields[0]!.value).toBe("$1,200/mo");
    });

    it("buildFinancialNestedSurfaceGroups skips fields with no truth (never fabricated)", () => {
        const config: NestedSurfaceConfig = {
            surfaceId: FINANCIAL_CONFIG_SURFACE_ID,
            groups: [{ key: "current_configuration", selectedFieldKeys: ["billing.discounts"] }],
        };
        const groups = buildFinancialNestedSurfaceGroups(config, context, null);
        expect(groups).toHaveLength(0);
    });
});

describe("builder + runtime seams", () => {
    function src(rel: string): string {
        return readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");
    }

    it("canvas card affordance sets nestedSurfaceId via data-open-nested-surface", () => {
        const builder = src("components/admin/focusPanel/FocusPanelGridCanvasBuilder.tsx");
        expect(builder).toContain("data-nested-surface-affordance");
        expect(builder).toContain("data-open-nested-surface");
        expect(builder).toContain("Configure expansion →");
        expect(builder).toContain("onOpenNestedSurface");
    });

    it("Surfaces page wires canvas drill-in to nestedSurfaceId state", () => {
        const page = src("components/adminV2/settings/surfaces/SurfacesConfigurationPage.tsx");
        expect(page).toContain("onOpenNestedSurface={setNestedSurfaceId}");
    });

    it("runtime ChildrenCard consumes the published nested config (no parallel persistence)", () => {
        const s = src("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(s).toContain("readChildrenNestedConfigFromDoc");
        expect(s).toContain("childDetailFieldKeys");
    });

    it("runtime BillingPreviewCard consumes published financial nested config", () => {
        const s = src("components/admin/focusPanel/cards/BillingPreviewCard.tsx");
        expect(s).toContain("readFinancialNestedSurfaceGroupsFromDoc");
        expect(s).toContain("data-financial-nested-group");
    });

    it("nested config persistence still targets metadata.nestedSurfaces (existing service)", () => {
        const s = src("lib/adminV2/settings/surfaces/nestedSurfaceConfigService.ts");
        expect(s).toContain("nestedSurfaces");
        expect(s).toContain("publishFocusPanelSummary");
    });

    it("groupDefsFor has no NESTED_SURFACE_DEFS parallel map", () => {
        const s = src("lib/adminV2/settings/surfaces/nestedSurfaceEditorModel.ts");
        expect(s).not.toMatch(/export const NESTED_SURFACE_DEFS/);
        expect(s).toContain("groupDefsFor");
        expect(s).toContain("getSurface");
    });
});
