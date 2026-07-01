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
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("does not log when shadow flag is off", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "false");
        safeLogDrawerViewModelShadowServerSummary(summary);
        expect(console.warn).not.toHaveBeenCalled();
    });

    it("logs one summary line when shadow flag is on", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
        safeLogDrawerViewModelShadowServerSummary(summary);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledWith(
            "[perf:drawer]",
            expect.objectContaining({ entity_id: "opp-1", phase: "vm_shadow_compose" })
        );
    });

    it("never throws when console.warn fails", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
        vi.mocked(console.warn).mockImplementation(() => {
            throw new Error("console unavailable");
        });
        expect(() => safeLogDrawerViewModelShadowServerSummary(summary)).not.toThrow();
    });
});

describe("logOpportunityDrawerViewModelComposeShadowSummary", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
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

        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledWith(
            "[perf:drawer]",
            expect.objectContaining({
                entity_id: "opp-1",
                phase: "vm_shadow_compose",
                compose_ms: 55,
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

        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledWith(
            "[perf:drawer]",
            expect.objectContaining({
                entity_id: "opp-2",
                phase: "vm_shadow_compose",
                compose_ms: 8,
            })
        );
    });
});

describe("logOpportunityDrawerViewModelComposeFailureShadowSummary", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("logs compose_failed without error message payload", () => {
        logOpportunityDrawerViewModelComposeFailureShadowSummary("opp-3", 99);

        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledWith(
            "[perf:drawer]",
            expect.objectContaining({
                entity_id: "opp-3",
                phase: "vm_shadow_compose",
                compose_ms: 99,
            })
        );
        const payload = vi.mocked(console.warn).mock.calls[0]?.[1] as Record<string, unknown>;
        expect(payload).not.toHaveProperty("error");
    });
});
