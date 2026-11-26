import { describe, expect, it } from "vitest";

import { canConfirmStatusesStep } from "@/lib/lifecycle/lifecycleActivationStep3";
import { resolveStatusesSaveDisabledReason } from "@/lib/lifecycle/lifecycleStatusesCardState";
import {
    effectiveLifecycleStageStatusKeys,
    resolvePlatformManagedStatusKeysForStage,
    stageRequiresManualStatusSelection,
} from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

describe("stage status requirement — participation model", () => {
    it("tour stage is platform-managed and does not require manual status selection", () => {
        expect(stageRequiresManualStatusSelection("tour")).toBe(false);
        expect(resolvePlatformManagedStatusKeysForStage("tour")).toEqual(["open"]);
    });

    it("waitlist child stage resolves platform-managed disposition keys", () => {
        expect(resolvePlatformManagedStatusKeysForStage("waitlist")).toEqual(["waitlisted"]);
    });

    it("unknown custom stage requires manual status selection", () => {
        expect(stageRequiresManualStatusSelection("payment_follow_up")).toBe(true);
        expect(resolvePlatformManagedStatusKeysForStage("payment_follow_up")).toBeNull();
    });

    it("effective keys prefer explicit selection over platform-managed defaults", () => {
        expect(effectiveLifecycleStageStatusKeys("tour", ["closed"])).toEqual(["closed"]);
        expect(effectiveLifecycleStageStatusKeys("tour", [])).toEqual(["open"]);
    });

    it("save disabled reason clears for platform-managed stage with empty draft", () => {
        expect(
            resolveStatusesSaveDisabledReason({
                normalizedStageKey: "tour",
                draftCount: 0,
                statusesLoading: false,
                statusesSaving: false,
                stageKey: "tour",
            }),
        ).toBeNull();
    });

    it("save disabled reason remains for custom stage with empty draft", () => {
        expect(
            resolveStatusesSaveDisabledReason({
                normalizedStageKey: "payment_follow_up",
                draftCount: 0,
                statusesLoading: false,
                statusesSaving: false,
                stageKey: "payment_follow_up",
            }),
        ).toBe("no_status_selected");
    });

    it("can confirm statuses step for platform-managed stage without draft", () => {
        expect(
            canConfirmStatusesStep({
                statusesLoading: false,
                statusesSaving: false,
                draftCount: 0,
                stageKey: "tour",
            }),
        ).toBe(true);
    });
});
