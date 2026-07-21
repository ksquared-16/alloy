import { describe, expect, it } from "vitest";

import {
    adaptiveMetricDensity,
    adaptiveQueueWidthRem,
    deriveActivityCommsCompositionState,
    deriveAdaptiveWorkspacePresentation,
    deriveWorkUnitSelectionMode,
    shouldShowActivityTopicRail,
    ADAPTIVE_WORKSPACE_COMPACT_MIN_PX,
    ADAPTIVE_WORKSPACE_EXPANDED_MIN_PX,
    WORK_UNIT_TWO_PANE_FLOOR_PX,
} from "@/lib/presentation/adaptiveWorkspacePresentation";
import {
    canHonorPinnedReserve,
    deriveBosPresentation,
    recommendBosPresentation,
    BOS_PINNED_PRIMARY_MIN_PX,
} from "@/lib/bos/bosPresentationState";
import { clampBosPinnedWidthPx } from "@/lib/bos/bosPresentationPreference";
import { buildBosContextPills } from "@/lib/bos/buildBosContextPills";
import {
    ADAPTIVE_REGION_PRIORITY,
    adaptiveRegionDomAttrs,
} from "@/lib/presentation/adaptiveWorkspaceSystem";

function expectActionsIndependentOfBos(preferred: "closed" | "floating" | "pinned") {
    const d = deriveBosPresentation({
        preferred,
        canvas: "expanded",
        ambientWidthPx: 1600,
        preferredPinnedWidthPx: 400,
    });
    // Assistant reserve changes; action inventory ownership is not part of this derivation.
    expect(["closed", "floating", "pinned"]).toContain(d.effective);
    if (preferred === "closed") expect(d.reservedWidthPx).toBe(0);
    if (preferred === "floating") expect(d.reservedWidthPx).toBe(0);
    if (preferred === "pinned") expect(d.reservedWidthPx).toBeGreaterThan(0);
}

describe("adaptiveWorkspacePresentation", () => {
    it("derives Expanded / Compact / Constrained from ambient width", () => {
        expect(deriveAdaptiveWorkspacePresentation(1728)).toBe("expanded");
        expect(deriveAdaptiveWorkspacePresentation(ADAPTIVE_WORKSPACE_EXPANDED_MIN_PX)).toBe("expanded");
        expect(deriveAdaptiveWorkspacePresentation(ADAPTIVE_WORKSPACE_EXPANDED_MIN_PX - 1)).toBe("compact");
        expect(deriveAdaptiveWorkspacePresentation(ADAPTIVE_WORKSPACE_COMPACT_MIN_PX)).toBe("compact");
        expect(deriveAdaptiveWorkspacePresentation(ADAPTIVE_WORKSPACE_COMPACT_MIN_PX - 1)).toBe(
            "constrained",
        );
    });

    it("uses compact metric density below Expanded", () => {
        expect(adaptiveMetricDensity("expanded")).toBe("standard");
        expect(adaptiveMetricDensity("compact")).toBe("compact");
    });

    it("clamps queue width by presentation state", () => {
        expect(adaptiveQueueWidthRem("expanded")).toBe(24);
        expect(adaptiveQueueWidthRem("compact")).toBe(18);
        expect(adaptiveQueueWidthRem("constrained")).toBe(16);
    });

    it("keeps Work Unit side-by-side until the two-pane floor", () => {
        expect(deriveWorkUnitSelectionMode(WORK_UNIT_TWO_PANE_FLOOR_PX)).toBe("rail");
        expect(deriveWorkUnitSelectionMode(WORK_UNIT_TWO_PANE_FLOOR_PX - 1)).toBe("temporary");
        expect(deriveWorkUnitSelectionMode(1100)).toBe("rail");
    });

    it("derives Activity Communications composition", () => {
        expect(
            deriveActivityCommsCompositionState({
                conversationCount: 0,
                selectedThreadId: null,
                isNewMessageMode: false,
                replyComposerExpanded: false,
            }),
        ).toBe("empty");
        expect(
            deriveActivityCommsCompositionState({
                conversationCount: 2,
                selectedThreadId: "t1",
                isNewMessageMode: false,
                replyComposerExpanded: true,
            }),
        ).toBe("composing");
        expect(shouldShowActivityTopicRail("reading")).toBe(true);
        expect(shouldShowActivityTopicRail("empty")).toBe(false);
        expect(shouldShowActivityTopicRail("composing")).toBe(false);
    });
});

describe("Adaptive Workspace System — BOS three states", () => {
    it("defaults recommendation to floating (not pinned)", () => {
        expect(recommendBosPresentation("expanded")).toBe("floating");
        expect(recommendBosPresentation("compact")).toBe("floating");
        expect(recommendBosPresentation("constrained")).toBe("floating");
    });

    it("closed and floating reserve no width", () => {
        for (const preferred of ["closed", "floating"] as const) {
            const d = deriveBosPresentation({
                preferred,
                canvas: "expanded",
                ambientWidthPx: 1600,
                preferredPinnedWidthPx: 400,
            });
            expect(d.effective).toBe(preferred);
            expect(d.reservedWidthPx).toBe(0);
            expect(d.temporaryFallback).toBe(false);
        }
    });

    it("pinned reserves width when ambient allows", () => {
        const d = deriveBosPresentation({
            preferred: "pinned",
            canvas: "expanded",
            ambientWidthPx: 1600,
            preferredPinnedWidthPx: 400,
        });
        expect(d.effective).toBe("pinned");
        expect(d.reservedWidthPx).toBe(400);
        expect(d.temporaryFallback).toBe(false);
    });

    it("temporarily falls back pinned → floating without rewriting preference", () => {
        expect(canHonorPinnedReserve(BOS_PINNED_PRIMARY_MIN_PX + 200, 400)).toBe(false);
        const d = deriveBosPresentation({
            preferred: "pinned",
            canvas: "constrained",
            ambientWidthPx: BOS_PINNED_PRIMARY_MIN_PX + 200,
            preferredPinnedWidthPx: 400,
        });
        expect(d.preferred).toBe("pinned");
        expect(d.effective).toBe("floating");
        expect(d.temporaryFallback).toBe(true);
        expect(d.reservedWidthPx).toBe(0);
    });

    it("clamps pinned widths", () => {
        expect(clampBosPinnedWidthPx(100)).toBe(320);
        expect(clampBosPinnedWidthPx(900)).toBe(560);
        expect(clampBosPinnedWidthPx(400)).toBe(400);
    });

    it("assistant reserve changes by state without owning action inventory", () => {
        expectActionsIndependentOfBos("closed");
        expectActionsIndependentOfBos("floating");
        expectActionsIndependentOfBos("pinned");
    });
});

describe("Adaptive Workspace System — regions", () => {
    it("orders region priority primary → selection → supporting → assistant", () => {
        expect(ADAPTIVE_REGION_PRIORITY).toEqual([
            "primary",
            "selection",
            "supporting",
            "assistant",
        ]);
        expect(adaptiveRegionDomAttrs("primary")["data-adaptive-region"]).toBe("primary");
    });
});

describe("buildBosContextPills", () => {
    it("builds quiet process/subject pills from runtime context", () => {
        const pills = buildBosContextPills({
            currentContext: {
                entity_type: "opportunities",
                entity_id: "opp-1",
                label: "Wenc Family",
                source_surface: "queue",
            },
            workspaceScope: {
                department_id: "d1",
                department_name: "Enrollment",
                work_unit_id: "wu1",
                work_unit_name: "Enrollment",
            },
            surfaceOperationalLabel: null,
            workViewLabel: "New Leads",
        });
        expect(pills.map((p) => p.label)).toEqual([
            "Business Process: Enrollment",
            "Work View: New Leads",
            "Subject: Wenc Family",
        ]);
    });
});
