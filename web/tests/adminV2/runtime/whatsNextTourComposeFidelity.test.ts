import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    isTourPresentationActionKey,
    partitionTourGroupedActions,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/groupTourPresentationActions";
import { withTourInvitationCompanionRefs } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig";
import { resolveCurrentWorkActionButtons } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

function action(key: string, label = key): CurrentWorkActionVM {
    return {
        key,
        label,
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: key,
        resolved: null,
        execution: { status: "executable", blockers: [] },
    };
}

describe("What's Next config fidelity + Tour grouping + Send Invitation compose", () => {
    it("does not invent helpful_actions from stage catalog when Work Template omits them", () => {
        const src = read(
            "lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan.ts",
        );
        expect(src).toContain("helpful_actions = []");
        expect(src).toContain("helpful_actions_explicit = true");
        expect(src).not.toMatch(/else if \(catalogActions\.supporting\.length\)/);
    });

    it("does not fall back to record-header registry for helpful actions", () => {
        const src = read("lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM.ts");
        expect(src).toContain("void args.fromRegistry");
        expect(src).toMatch(/\/\/ Manage-menu \/ header placement actions into What's Next\.\n\s*void args\.fromRegistry;\n\s*return \[\];/);
    });

    it("does not silently truncate configured helpful actions", () => {
        const buttons = resolveCurrentWorkActionButtons({
            primaryAction: action("contact_family", "Contact Family"),
            recordOutcomeAction: null,
            supportingActions: [
                action("schedule_tour", "Schedule tour"),
                action("send_tour_invitation", "Send Tour Invitation"),
                action("quick_message", "Quick message"),
            ],
        });
        expect(buttons.helpful.map((a) => a.key)).toEqual([
            "schedule_tour",
            "send_tour_invitation",
            "quick_message",
        ]);
        expect(read("lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons.ts")).not.toContain(
            "HELPFUL_LIMIT",
        );
    });

    it("partitions Tour presentation actions under Tour ▾", () => {
        expect(isTourPresentationActionKey("send_tour_invitation")).toBe(true);
        expect(isTourPresentationActionKey("quick_message")).toBe(false);
        const { tour, rest } = partitionTourGroupedActions([
            action("quick_message", "Quick message"),
            action("schedule_tour", "Schedule tour"),
            action("send_tour_invitation", "Send Tour Invitation"),
            action("confirm_tour", "Confirm tour"),
        ]);
        expect(rest.map((a) => a.key)).toEqual(["quick_message"]);
        expect(tour.map((a) => a.key)).toEqual([
            "schedule_tour",
            "send_tour_invitation",
            "confirm_tour",
        ]);

        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        const workspace = read("components/admin/focusPanel/cards/CurrentWorkWorkspace.tsx");
        expect(card).toContain("CurrentWorkTourGroupedActions");
        expect(workspace).toContain("CurrentWorkTourGroupedActions");
        expect(read("components/admin/focusPanel/cards/CurrentWorkTourGroupedActions.tsx")).toContain("Tour ▾");
    });

    it("adds Send Tour Invitation beside Schedule Tour in helpful refs", () => {
        expect(
            withTourInvitationCompanionRefs([{ action_ref: "schedule_tour" }])?.map((r) => r.action_ref),
        ).toEqual(["schedule_tour", "send_tour_invitation"]);
        expect(
            withTourInvitationCompanionRefs([
                { action_ref: "schedule_tour" },
                { action_ref: "send_tour_invitation" },
            ])?.map((r) => r.action_ref),
        ).toEqual(["schedule_tour", "send_tour_invitation"]);
        const defaults = read("lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts");
        expect(defaults).toContain('action_ref: "send_tour_invitation"');
    });

    it("Send Tour Invitation opens QuickMessage compose", () => {
        const client = read("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        const start = client.indexOf('actionKey === "send_tour_invitation"');
        expect(start).toBeGreaterThan(-1);
        const branch = client.slice(start, start + 2200);
        expect(branch).toContain("launchContextualQuickMessage");
        expect(branch).toContain('defaultChannel: "email"');
        expect(branch).not.toMatch(/\bwindow\.confirm\b/);
        expect(branch).not.toMatch(/\bwindow\.alert\b/);
    });
});
