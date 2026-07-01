import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLifecycleFieldPaletteDisplayLabel } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import {
    buildLifecycleActionConditionConfig,
    isLifecycleBuilderConfiguredPlacement,
    LIFECYCLE_ACTION_SCOPE_LABELS,
} from "@/lib/lifecycle/lifecycleStageActionScope";
import { buildLifecycleConfiguredActionRows } from "@/lib/lifecycle/lifecycleConfiguredActionRows";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle actions model simplification", () => {
    it("guided cards use consistent fixed height and scrollable body", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain("GUIDED_CARD_HEIGHT_CLASS");
        expect(guided).toContain("h-[380px]");
        expect(guided).toContain("lifecycle-guided-card-body");
        expect(guided).toContain("overflow-y-auto");
        expect(guided).toContain("overscroll-contain");
        expect(guided).not.toContain("lifecycle-guided-statuses-scroll");
        expect(guided).not.toContain("lifecycle-guided-validation-scroll");
    });

    it("bootstrap loads only lifecycle-builder-configured actions", () => {
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain(
            "loadLifecycleBuilderConfiguredActions"
        );
        expect(read("lib/lifecycle/loadLifecycleBuilderConfiguredActions.ts")).toContain(
            "isLifecycleBuilderConfiguredPlacement"
        );
        expect(read("lib/lifecycle/loadLifecycleBuilderConfiguredActions.ts")).not.toContain(
            "buildEnrollmentProcessStageActionRows"
        );
    });

    it("configured actions start empty when no builder placements exist", () => {
        const rows = buildLifecycleConfiguredActionRows([]);
        expect(rows).toEqual([]);
    });

    it("actions matrix replaces per-stage add-action card", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain("LifecycleBuilderActionsCard");
        expect(read("components/adminV2/settings/lifecycle/LifecycleActionsMatrix.tsx")).toContain(
            "Stage restrictions are optional"
        );
    });

    it("Save Action persists via lifecycle_builder_configured marker", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-actions-matrix/route.ts");
        expect(route).toContain("saveLifecycleActionsMatrix");
        expect(read("lib/lifecycle/lifecycleStageActionScope.ts")).toContain(
            "LIFECYCLE_BUILDER_CONFIGURED_KEY"
        );
        const cfg = buildLifecycleActionConditionConfig("lifecycle", []);
        expect(cfg.lifecycle_builder_configured).toBe(true);
        expect(isLifecycleBuilderConfiguredPlacement(cfg)).toBe(true);
    });

    it("lifecycle-wide and stage-specific scope labels remain in scope module", () => {
        expect(LIFECYCLE_ACTION_SCOPE_LABELS.lifecycle).toBe("Lifecycle-wide");
        expect(LIFECYCLE_ACTION_SCOPE_LABELS.stage).toBe("Stage-specific");
    });

    it("phone field displays configured label not legacy Mobile", () => {
        expect(resolveLifecycleFieldPaletteDisplayLabel("Phone", "phone", "Mobile")).toBe("Phone");
    });
});
