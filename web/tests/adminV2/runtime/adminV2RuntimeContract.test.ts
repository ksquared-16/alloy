import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { composeAdminV2DrawerRuntime } from "@/lib/adminV2/runtime/contract/drawerComposerPolicy";
import {
    validateDrawerSectionContract,
    validateDrawerSectionRegistry,
} from "@/lib/adminV2/runtime/contract/drawerSectionContract";
import {
    adminV2DrawerHeaderActionsTabIndependent,
    adminV2DrawerTabsPremountWhenSurfaceReady,
} from "@/lib/adminV2/runtime/contract/drawerTabsContract";
import {
    adminV2QueueMayShowRowSkeleton,
    adminV2WorkUnitRouteRevealMode,
    workUnitPageContentReady,
} from "@/lib/adminV2/runtime/contract/routeRevealPolicy";
import { ALL_ADMINV2_DRAWER_SECTION_REGISTRY } from "@/lib/adminV2/runtime/contract/registry";
import {
    resolveWorkUnitQueueLaneRevealState,
    workUnitQueueLaneRevealSettled,
} from "@/lib/workspace/workUnitQueueLaneRevealState";

const webRoot = join(__dirname, "../../..");

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("AdminV2 drawer section registry contract", () => {
    it("all registered above-fold sections declare reserved geometry or seed render", () => {
        const issues = validateDrawerSectionRegistry(ALL_ADMINV2_DRAWER_SECTION_REGISTRY);
        const aboveFoldIssues = issues.filter((i) => i.code === "above_fold_missing_reserve");
        expect(aboveFoldIssues).toEqual([]);
    });

    it("accepts above-fold block-drawer-reveal without reserve geometry", () => {
        const issues = validateDrawerSectionContract({
            sectionKey: "composed_section",
            surface: "generic",
            canRenderFromSeed: false,
            blocksFirstPaint: true,
            hasRenderableData: () => false,
            renderReady: () => false,
            fallbackMode: "block-drawer-reveal",
        });
        expect(issues.some((i) => i.code === "above_fold_missing_reserve")).toBe(false);
    });

    it("rejects above-fold block without reserve, seed, or block-drawer-reveal contract", () => {
        const issues = validateDrawerSectionContract({
            sectionKey: "bad_section",
            surface: "generic",
            canRenderFromSeed: false,
            blocksFirstPaint: true,
            hasRenderableData: () => false,
            renderReady: () => false,
            fallbackMode: "reserved",
        });
        expect(issues.some((i) => i.code === "above_fold_missing_reserve")).toBe(true);
    });
});

describe("AdminV2 drawer composer policy", () => {
    const baseRecord = {
        id: "opp-1",
        _record_surface: "drawer_primary",
        metadata: { tour_date: "2026-06-01" },
        _customer_name: "Test Family",
    };

    it("typed opportunity snapshot blocks reveal until above-fold sections render", () => {
        const plan = composeAdminV2DrawerRuntime({
            entityType: "opportunities",
            surface: "opportunity",
            drawerId: "opp-1",
            activeTab: "overview",
            record: baseRecord,
            error: null,
            typedSnapshot: true,
            bodyHydrated: false,
            fullHydrateReady: false,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: true,
            inquiryWorkflow: true,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(false);
        expect(plan.sectionsBlocking.length).toBeGreaterThan(0);
    });

    it("child drawer without hydrate blocks frame until sections are composed", () => {
        const plan = composeAdminV2DrawerRuntime({
            entityType: "persons",
            surface: "child",
            drawerId: "person-1",
            activeTab: "overview",
            record: { id: "person-1", role_type: "child" },
            error: null,
            typedSnapshot: false,
            bodyHydrated: false,
            fullHydrateReady: false,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: false,
            inquiryWorkflow: false,
            belowFoldRevealed: true,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealDrawerFrame).toBe(false);
        expect(plan.sectionsBlocking.length).toBeGreaterThan(0);
        expect(plan.sectionsReserved).toEqual([]);
    });
});

describe("AdminV2 drawer tabs contract", () => {
    it("inquiry workflow header actions are tab-independent", () => {
        expect(adminV2DrawerHeaderActionsTabIndependent({ inquiryWorkflow: true })).toBe(true);
    });

    it("can reveal header actions on communications tab before below-fold without blocking on tab", () => {
        const plan = composeAdminV2DrawerRuntime({
            entityType: "opportunities",
            surface: "opportunity",
            drawerId: "opp-1",
            activeTab: "communications",
            record: {
                id: "opp-1",
                _record_surface: "drawer_primary",
                metadata: { tour_date: "2026-06-01" },
                _customer_name: "Test",
                next_follow_up_at: "2026-06-15T10:00:00Z",
                _inquiry_children: [{ person_id: "c1", display_name: "Child", desired_program_label: "Toddler" }],
            },
            error: null,
            typedSnapshot: false,
            bodyHydrated: true,
            fullHydrateReady: false,
            frameReady: true,
            headerActionsResolved: true,
            headerActionsLoading: false,
            headerActionsExpectRegistry: true,
            inquiryWorkflow: true,
            belowFoldRevealed: false,
            presentationReady: true,
            primaryContractReady: true,
            needsBackgroundHydrate: false,
        });
        expect(plan.canRevealHeaderActions).toBe(true);
    });

    it("workflow tabs pre-mount when drawer surface is ready", () => {
        expect(
            adminV2DrawerTabsPremountWhenSurfaceReady({
                inquiryWorkflow: true,
                drawerSurfaceReady: true,
                activeTab: "communications",
            })
        ).toBe(true);
    });
});

describe("AdminV2 route / queue reveal contract", () => {
    it("never shows row skeleton as settled queue display", () => {
        expect(adminV2QueueMayShowRowSkeleton("hidden_until_settled")).toBe(false);
        expect(adminV2QueueMayShowRowSkeleton("ready_empty")).toBe(false);
    });

    it("settled empty lane is reveal-ready", () => {
        const state = resolveWorkUnitQueueLaneRevealState({
            lane_authority_ready: true,
            work_unit_id: "wu-1",
            selected_queue_key: "waitlist",
            active_queue_key: "waitlist",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            view_scope_fingerprint: "scope:a",
            cache: new Map(),
            queue_items: { items: [], queue: { key: "waitlist" } },
            queue_items_loading: false,
            queue_items_error: null,
        });
        expect(state).toBe("ready_empty");
        expect(workUnitQueueLaneRevealSettled(state)).toBe(true);
    });

    it("warm work unit uses composed page only after critical bundle is ready", () => {
        expect(
            adminV2WorkUnitRouteRevealMode({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            })
        ).toBe("full_page_gate");
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            })
        ).toBe(false);
    });
});
