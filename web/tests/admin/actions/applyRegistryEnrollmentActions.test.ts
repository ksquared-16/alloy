import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW,
    ADMINV2_OPPORTUNITY_FOCUS_INQUIRY_CHILDREN,
} from "@/lib/admin/actions/enrollmentActionClient";

function host() {
    return {
        router: { push: vi.fn(), refresh: vi.fn() },
        focusRecord: vi.fn(),
        entityId: "opp-1",
        context: { surface: "record_header" },
    };
}

function action(key: string, payload: Record<string, unknown>): ResolvedActionForClient {
    return {
        key,
        label: key,
        description: null,
        action_type: "ui_intent",
        icon: null,
        style: null,
        display_style: "button",
        payload,
        workflow_id: null,
    };
}

describe("applyRegistryResolvedActionClient enrollment actions", () => {
    const dispatchEvent = vi.fn();

    beforeEach(() => {
        dispatchEvent.mockReset();
        vi.stubGlobal("window", {
            alert: vi.fn(),
            location: { href: "" },
            dispatchEvent,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
    });

    it("review_enrollment_packet dispatches packet review open event", async () => {
        const out = await applyRegistryResolvedActionClient(
            action("review_enrollment_packet", { intent: "review_enrollment_packet" }),
            host()
        );
        expect(out.ok).toBe(true);
        expect(dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW,
                detail: { opportunity_id: "opp-1" },
            })
        );
    });

    it("request_missing_information opens send-form composer", async () => {
        const out = await applyRegistryResolvedActionClient(
            action("request_missing_information", { intent: "request_missing_information", composer: "send_form" }),
            host()
        );
        expect(out.ok).toBe(true);
        expect(dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "adminv2:open-send-form",
                detail: { opportunity_id: "opp-1" },
            })
        );
    });

    it("assign_classroom focuses inquiry children room field", async () => {
        const out = await applyRegistryResolvedActionClient(
            action("assign_classroom", { intent: "assign_classroom", focus_field: "program_room_cohort_key" }),
            host()
        );
        expect(out.ok).toBe(true);
        expect(dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: ADMINV2_OPPORTUNITY_FOCUS_INQUIRY_CHILDREN,
                detail: { opportunity_id: "opp-1", field: "program_room_cohort_key" },
            })
        );
    });

    it("assign_schedule defaults focus_field to schedule_type", async () => {
        await applyRegistryResolvedActionClient(action("assign_schedule", { intent: "assign_schedule" }), host());
        expect(dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: expect.objectContaining({ field: "schedule_type" }),
            })
        );
    });

    it("set_start_date defaults focus_field to start_date", async () => {
        await applyRegistryResolvedActionClient(action("set_start_date", { intent: "set_start_date" }), host());
        expect(dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: expect.objectContaining({ field: "start_date" }),
            })
        );
    });
});
