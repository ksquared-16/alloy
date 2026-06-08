import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    buildDrawerViewModelShadowServerComposeSummary,
    logOpportunityDrawerViewModelComposeFailureShadowSummary,
    logOpportunityDrawerViewModelComposeShadowSummary,
    safeLogDrawerViewModelShadowServerSummary,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import { OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";

describe("buildDrawerViewModelShadowServerComposeSummary", () => {
    it("includes compose fields with zero diff metrics on server", () => {
        expect(
            buildDrawerViewModelShadowServerComposeSummary({
                opportunity_id: "opp-1",
                generation: "gen-abc",
                structureSettled: true,
                compose_ms: 42,
                skip_reason: null,
            })
        ).toEqual({
            opportunity_id: "opp-1",
            generation: "gen-abc",
            structureSettled: true,
            compose_ms: 42,
            structural_mismatch_count: 0,
            scalar_warning_count: 0,
            mismatch_keys: [],
            cutover_ready: true,
            skip_reason: null,
        });
    });

    it("records skip_reason and cutover_ready false when not settled", () => {
        expect(
            buildDrawerViewModelShadowServerComposeSummary({
                opportunity_id: "opp-2",
                structureSettled: false,
                compose_ms: 12,
                skip_reason: "classic_layout_deferred",
            })
        ).toMatchObject({
            generation: null,
            structureSettled: false,
            cutover_ready: false,
            skip_reason: "classic_layout_deferred",
            mismatch_keys: [],
        });
    });
});

describe("safeLogDrawerViewModelShadowServerSummary", () => {
    const summary = buildDrawerViewModelShadowServerComposeSummary({
        opportunity_id: "opp-1",
        structureSettled: true,
        compose_ms: 10,
    });

    beforeEach(() => {
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("does not log when shadow flag is off", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "false");
        safeLogDrawerViewModelShadowServerSummary(summary);
        expect(console.info).not.toHaveBeenCalled();
    });

    it("logs one summary line when shadow flag is on", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
        safeLogDrawerViewModelShadowServerSummary(summary);
        expect(console.info).toHaveBeenCalledTimes(1);
        expect(console.info).toHaveBeenCalledWith("[drawer-vm-shadow:summary]", summary);
    });

    it("never throws when console.info fails", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
        vi.mocked(console.info).mockImplementation(() => {
            throw new Error("console unavailable");
        });
        expect(() => safeLogDrawerViewModelShadowServerSummary(summary)).not.toThrow();
    });
});

describe("logOpportunityDrawerViewModelComposeShadowSummary", () => {
    beforeEach(() => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("logs settled compose summary once", () => {
        logOpportunityDrawerViewModelComposeShadowSummary(
            "opp-1",
            {
                ok: true,
                viewModel: {
                    generation: "gen-1",
                    structureSettled: true,
                    timing: { compose_ms: 55, phases_ms: {} },
                } as never,
            },
            55
        );

        expect(console.info).toHaveBeenCalledTimes(1);
        expect(console.info).toHaveBeenCalledWith(
            "[drawer-vm-shadow:summary]",
            expect.objectContaining({
                opportunity_id: "opp-1",
                generation: "gen-1",
                structureSettled: true,
                compose_ms: 55,
                skip_reason: null,
            })
        );
    });

    it("logs classic skip summary once", () => {
        logOpportunityDrawerViewModelComposeShadowSummary(
            "opp-2",
            {
                ok: false,
                skipped: {
                    structureSettled: false,
                    reason: "classic_layout_deferred",
                    compose_version: OPPORTUNITY_DRAWER_VM_COMPOSE_VERSION,
                },
            },
            8
        );

        expect(console.info).toHaveBeenCalledTimes(1);
        expect(console.info).toHaveBeenCalledWith(
            "[drawer-vm-shadow:summary]",
            expect.objectContaining({
                opportunity_id: "opp-2",
                structureSettled: false,
                compose_ms: 8,
                skip_reason: "classic_layout_deferred",
            })
        );
    });
});

describe("logOpportunityDrawerViewModelComposeFailureShadowSummary", () => {
    beforeEach(() => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("logs compose_failed without error message payload", () => {
        logOpportunityDrawerViewModelComposeFailureShadowSummary("opp-3", 99);

        expect(console.info).toHaveBeenCalledTimes(1);
        expect(console.info).toHaveBeenCalledWith(
            "[drawer-vm-shadow:summary]",
            expect.objectContaining({
                opportunity_id: "opp-3",
                structureSettled: false,
                compose_ms: 99,
                skip_reason: "compose_failed",
            })
        );
        const payload = vi.mocked(console.info).mock.calls[0]?.[1] as Record<string, unknown>;
        expect(payload).not.toHaveProperty("error");
    });
});
