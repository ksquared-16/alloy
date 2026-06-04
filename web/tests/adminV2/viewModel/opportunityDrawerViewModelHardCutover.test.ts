import { describe, expect, it, vi } from "vitest";

import {
    OpportunityDrawerViewModelHardCutoverError,
    opportunityDrawerViewModelHardCutoverFailureMessage,
    throwOpportunityDrawerViewModelHardCutoverFailure,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelHardCutover";

vi.mock("@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover", () => ({
    drawerViewModelCutoverFlagSnapshot: () => ({
        drawer_vm_cutover_flag_enabled: true,
        drawer_vm_cutover_flag_value: "true",
    }),
    safeLogDrawerViewModelCutover: vi.fn(),
}));

describe("opportunityDrawerViewModelHardCutoverFailureMessage", () => {
    it("describes classic layout skip explicitly", () => {
        expect(
            opportunityDrawerViewModelHardCutoverFailureMessage({
                ok: false,
                reason: "skipped",
                skip_reason: "classic_layout_deferred",
            })
        ).toContain("classic layout");
    });
});

describe("throwOpportunityDrawerViewModelHardCutoverFailure", () => {
    it("throws a typed hard-cutover error", () => {
        expect(() =>
            throwOpportunityDrawerViewModelHardCutoverFailure("opp-1", {
                ok: false,
                reason: "fetch_failed",
            })
        ).toThrow(OpportunityDrawerViewModelHardCutoverError);
    });
});
