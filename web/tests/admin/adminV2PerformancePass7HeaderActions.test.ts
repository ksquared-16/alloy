import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    OPPORTUNITY_DRAWER_HEADER_ACTIONS_RAIL_MIN_H_CLASS,
    OPPORTUNITY_DRAWER_HEADER_ACTIONS_SKELETON_BUTTON_CLASSES,
    opportunityDrawerHeaderActionsExpectRegistry,
    opportunityDrawerHeaderActionsShowSkeleton,
} from "@/lib/admin/drawer/opportunityDrawerLayoutStability";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 performance pass 7.5 — header action rail", () => {
    it("expects registry header actions on adminV2 inquiry workflow", () => {
        expect(
            opportunityDrawerHeaderActionsExpectRegistry({
                drawerShellVariant: "adminV2",
                bootstrapEnabled: true,
                bootstrapLegacy: false,
                inquiryWorkflow: true,
            })
        ).toBe(true);
        expect(
            opportunityDrawerHeaderActionsExpectRegistry({
                drawerShellVariant: "adminV2",
                bootstrapEnabled: true,
                bootstrapLegacy: false,
                inquiryWorkflow: false,
            })
        ).toBe(false);
    });

    it("shows skeleton until record_header resolves — not after", () => {
        expect(
            opportunityDrawerHeaderActionsShowSkeleton({
                expectRegistry: true,
                headerActionsLoading: true,
                headerActionsReady: false,
            })
        ).toBe(true);
        expect(
            opportunityDrawerHeaderActionsShowSkeleton({
                expectRegistry: true,
                headerActionsLoading: false,
                headerActionsReady: true,
            })
        ).toBe(false);
        expect(
            opportunityDrawerHeaderActionsShowSkeleton({
                expectRegistry: false,
                headerActionsLoading: true,
                headerActionsReady: false,
            })
        ).toBe(false);
    });

    it("skeleton button widths match reserved rail geometry", () => {
        expect(OPPORTUNITY_DRAWER_HEADER_ACTIONS_SKELETON_BUTTON_CLASSES).toHaveLength(3);
        expect(OPPORTUNITY_DRAWER_HEADER_ACTIONS_RAIL_MIN_H_CLASS).toBe("min-h-[2.75rem]");
    });
});
