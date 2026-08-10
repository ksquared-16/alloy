import { describe, expect, it } from "vitest";

import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import { resolveOpportunityTourScheduleFromTruth } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveOpportunityTourScheduleFromTruth";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

function action(partial: Partial<CurrentWorkActionVM> & Pick<CurrentWorkActionVM, "key" | "label">): CurrentWorkActionVM {
    return {
        category: "supporting",
        placement: "current_work_supporting",
        ...partial,
    };
}

function resolvedAction(key: string): ResolvedActionForClient {
    return {
        key,
        label: key,
        description: null,
        action_type: "registry",
        icon: null,
        style: null,
        display_style: "outline",
        payload: {},
        workflow_id: null,
    };
}

describe("resolveCurrentWorkActionSurface", () => {
    it("routes schedule_tour and reschedule_tour to inline_form", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({ key: "schedule_tour", label: "Schedule tour", actionRef: "schedule_tour" }),
            ),
        ).toBe("inline_form");
        expect(
            resolveCurrentWorkActionSurface(
                action({ key: "reschedule_tour", label: "Reschedule tour", actionRef: "reschedule_tour" }),
            ),
        ).toBe("inline_form");
    });

    it("routes communication actions to communications_composer", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({
                    key: "quick_message",
                    label: "Quick message",
                    category: "communication",
                    resolved: resolvedAction("quick_message"),
                }),
            ),
        ).toBe("communications_composer");
    });

    it("delegates status lifecycle and relationship actions to header_delegate", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({
                    key: "close_lead",
                    label: "Close lead",
                    resolved: resolvedAction("close_lead"),
                }),
            ),
        ).toBe("header_delegate");
        expect(
            resolveCurrentWorkActionSurface(
                action({
                    key: "add_child",
                    label: "Add child",
                    resolved: resolvedAction("add_child"),
                }),
            ),
        ).toBe("inline_form");
    });

    it("returns unsupported for BOS recommendations and unknown keys without resolved action", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({ key: "bos_suggest_follow_up", label: "Follow up", category: "bos_recommended" }),
            ),
        ).toBe("unsupported");
        expect(
            resolveCurrentWorkActionSurface(action({ key: "unknown_custom_action", label: "Unknown" })),
        ).toBe("unsupported");
    });


    it("uses handlerKey for registry lookup when intent ref differs from execution key", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({
                    key: "move_to_waitlist",
                    label: "Move to Waitlist",
                    actionRef: "move_to_waitlist",
                    handlerKey: "waitlist_child",
                    resolved: resolvedAction("waitlist_child"),
                }),
            ),
        ).toBe("header_delegate");
    });

    it("routes enrollment-child related-subject actions to subject_selector", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({
                    key: "waitlist_child",
                    label: "Move to Waitlist",
                    actionRef: "move_to_waitlist",
                    handlerKey: "waitlist_child",
                    relatedSubjectResolution: "enrollment_child",
                    resolved: resolvedAction("waitlist_child"),
                }),
            ),
        ).toBe("subject_selector");
    });

    it("falls back to header_delegate when resolved registry action exists without inline surface", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({
                    key: "create_task",
                    label: "Create task",
                    resolved: resolvedAction("create_task"),
                }),
            ),
        ).toBe("header_delegate");
    });

    it("routes send_form to its declared form_delivery host (metadata, not the action name)", () => {
        expect(
            resolveCurrentWorkActionSurface(
                action({ key: "send_form", label: "Send form", resolved: resolvedAction("send_form") }),
            ),
        ).toBe("form_delivery");
    });

    // Slice B proof: host comes from capability metadata, never the action name/label.
    it("resolves two differently-named capabilities with the same declared host to the same host", () => {
        const a = resolveCurrentWorkActionSurface(
            action({ key: "schedule_tour", label: "Schedule tour", actionRef: "schedule_tour" }),
        );
        const b = resolveCurrentWorkActionSurface(
            action({ key: "reschedule_tour", label: "Reschedule tour", actionRef: "reschedule_tour" }),
        );
        // Both declare interactionHost="inline_form" in capability metadata → same host, different names.
        expect(a).toBe("inline_form");
        expect(b).toBe("inline_form");
        expect(a).toBe(b);
    });

    it("gives no special treatment to labels containing tour/message/form/enrollment without metadata", () => {
        // A key with no canonical capability, no resolved handler, and no communication category is
        // unsupported no matter what its label says — routing is metadata-driven, never label text.
        for (const label of [
            "Schedule the tour now",
            "Send a message",
            "Share the intake form",
            "Enroll the child / waitlist",
        ]) {
            expect(
                resolveCurrentWorkActionSurface(action({ key: "custom_unmapped_action", label })),
            ).toBe("unsupported");
        }
    });
});

describe("resolveOpportunityTourScheduleFromTruth", () => {
    it("reads location and metadata tour fields from operational truth", () => {
        expect(
            resolveOpportunityTourScheduleFromTruth({
                location_id: "loc-1",
                metadata: { tour_date: "2026-07-15", tour_time: "10:30" },
            }),
        ).toEqual({
            locationId: "loc-1",
            initialTourDate: "2026-07-15",
            initialTourTime: "10:30",
        });
    });
});
