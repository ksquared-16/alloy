import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    accountHelpfulActionPresentation,
    helpfulActionPresentationKey,
    isTourPresentationActionKey,
    partitionTourGroupedActions,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/groupTourPresentationActions";
import { resolvedHelpfulActionRefs } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig";
import { resolveCurrentWorkActionButtons } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import { resolveCurrentWorkTemplateAction } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateAction";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

function action(
    key: string,
    label = key,
    extras: Partial<CurrentWorkActionVM> = {},
): CurrentWorkActionVM {
    return {
        key,
        label,
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: key,
        resolved: null,
        execution: { status: "executable", blockers: [] },
        ...extras,
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

    it("projects blocked helpful commands instead of dropping them", () => {
        const buttons = resolveCurrentWorkActionButtons({
            primaryAction: action("quick_message", "Contact Family"),
            recordOutcomeAction: null,
            supportingActions: [
                action("waitlist_child", "Move to Waitlist", {
                    actionRef: "move_to_waitlist",
                    disabled: true,
                    disabledReason: "Add a child to this family before moving them to Waitlist.",
                    blockedReason: "Add a child to this family before moving them to Waitlist.",
                    execution: {
                        status: "blocked",
                        blockers: [
                            {
                                code: "blocked",
                                message: "Add a child to this family before moving them to Waitlist.",
                            },
                        ],
                    },
                    relatedSubjectResolution: "enrollment_child",
                }),
                action("add_child", "Add Child"),
            ],
        });
        expect(buttons.helpful.map((a) => a.key)).toEqual(["waitlist_child", "add_child"]);
        expect(buttons.helpful[0]?.disabled).toBe(true);
    });

    it("accounts for every configured helpful command after Tour grouping (Lead fixture)", () => {
        const configured = [
            action("schedule_tour", "Schedule tour"),
            action("send_tour_invitation", "Send Tour Invitation"),
            action("waitlist_child", "Move to Waitlist", {
                actionRef: "move_to_waitlist",
                relatedSubjectResolution: "enrollment_child",
                requiresSubjectPicker: true,
            }),
            action("add_child", "Add Child"),
        ];
        const buttons = resolveCurrentWorkActionButtons({
            primaryAction: action("quick_message", "Contact Family"),
            recordOutcomeAction: null,
            supportingActions: configured,
        });
        const account = accountHelpfulActionPresentation(buttons.helpful);
        expect(account.accounted).toHaveLength(configured.length);
        expect(account.accounted.map(helpfulActionPresentationKey).sort()).toEqual(
            configured.map(helpfulActionPresentationKey).sort(),
        );
        expect(account.tour.map((a) => a.key)).toEqual(["schedule_tour", "send_tour_invitation"]);
        expect(account.standalone.map((a) => a.key)).toEqual(["waitlist_child", "add_child"]);
        expect(account.standalone.some((a) => isTourPresentationActionKey(a.key))).toBe(false);
    });

    it("Move to Waitlist stays executable when Focus Panel truth omits children", () => {
        const resolved = resolveCurrentWorkTemplateAction({
            actionRef: "move_to_waitlist",
            truth: { opportunity_id: "opp-1" },
        });
        expect(resolved?.blockedReason).toBeNull();
        expect(resolved?.handlerKey).toBe("waitlist_child");
        expect(
            resolveCurrentWorkActionSurface({
                key: resolved!.handlerKey,
                handlerKey: resolved!.handlerKey,
                category: "supporting",
                actionRef: resolved!.actionRef,
                resolved: null,
                relatedSubjectResolution: resolved!.relatedSubjectResolution,
                requiresSubjectPicker: resolved!.requiresSubjectPicker,
            }),
        ).toBe("subject_selector");
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

    it("does not invent Send Tour Invitation beside Schedule Tour", () => {
        expect(
            resolvedHelpfulActionRefs({
                work_key: "contact_family",
                helpful_actions: [{ action_ref: "schedule_tour" }],
                helpful_actions_explicit: true,
            })?.map((r) => r.action_ref),
        ).toEqual(["schedule_tour"]);
        expect(
            resolvedHelpfulActionRefs({
                work_key: "contact_family",
                helpful_actions: [
                    { action_ref: "schedule_tour" },
                    { action_ref: "send_tour_invitation" },
                ],
                helpful_actions_explicit: true,
            })?.map((r) => r.action_ref),
        ).toEqual(["schedule_tour", "send_tour_invitation"]);
        const templateConfig = read(
            "lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig.ts",
        );
        expect(templateConfig).not.toContain("withTourInvitationCompanionRefs");
        const defaults = read("lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts");
        expect(defaults).toContain('action_ref: "send_tour_invitation"');
    });

    it("Send Tour Invitation is registry-wired and projects as header_delegate when configured", () => {
        const def = canonicalActionDefinition("send_tour_invitation");
        expect(def?.runtimeWired).toBe(true);
        expect(def?.interactionHost).toBe("header_delegate");
        expect(
            resolveCurrentWorkActionSurface({
                key: "send_tour_invitation",
                handlerKey: "send_tour_invitation",
                category: "supporting",
                actionRef: "send_tour_invitation",
                resolved: null,
            }),
        ).toBe("header_delegate");
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
