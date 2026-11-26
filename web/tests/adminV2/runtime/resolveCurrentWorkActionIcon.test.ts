import { describe, expect, it } from "vitest";

import { resolveCurrentWorkActionIcon } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionIcon";

describe("resolveCurrentWorkActionIcon", () => {
    it("resolves icons for Message, Schedule tour, Send form, Record outcome", () => {
        expect(
            resolveCurrentWorkActionIcon({
                key: "quick_message",
                label: "Message",
                handlerKey: "quick_message",
            }),
        ).not.toBeNull();
        expect(
            resolveCurrentWorkActionIcon({
                key: "schedule_tour",
                label: "Schedule tour",
                handlerKey: "schedule_tour",
            }),
        ).not.toBeNull();
        expect(
            resolveCurrentWorkActionIcon({
                key: "send_form",
                label: "Send form",
                handlerKey: "send_form",
            }),
        ).not.toBeNull();
        expect(
            resolveCurrentWorkActionIcon({
                key: "record_outcome",
                label: "Record outcome",
                handlerKey: "record_outcome",
            }),
        ).not.toBeNull();
    });

    it("returns null for unknown actions (label-only, never invent decoration)", () => {
        expect(
            resolveCurrentWorkActionIcon({
                key: "custom_org_action",
                label: "Custom workflow",
                handlerKey: "custom_org_action",
            }),
        ).toBeNull();
    });
});
