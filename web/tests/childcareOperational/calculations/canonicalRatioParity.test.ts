import { describe, expect, it } from "vitest";
import { requiredStaffForChildren, type RatioTier } from "@/lib/childcareOperational/config/ratioRules";
import { resolveRequiredStaffForChildren } from "@/lib/childcareOperational/capacity/resolveRatio";

/**
 * Parity gate for the staffing-seam convergence (Phase 6, Step 2).
 *
 * Production expected/actual staffing read-models are being routed off the raw
 * `config/ratioRules#requiredStaffForChildren` primitive and onto the canonical
 * `capacity/resolveRatio#resolveRequiredStaffForChildren` surface. Those two must
 * be byte-identical for the single-room (single-age) tier lists the read-models
 * pass, so the swap cannot change any resolved number. This test proves it across
 * a matrix; if it ever fails, the convergence is unsafe and must stop.
 */

const TIER_SETS: readonly (readonly RatioTier[])[] = [
    [],
    [{ max_children: 5, required_staff: 1 }],
    [
        { max_children: 11, required_staff: 2 },
        { max_children: 5, required_staff: 1 },
        { max_children: 16, required_staff: 3 },
    ],
    [
        { max_children: 4, required_staff: 1 },
        { max_children: 8, required_staff: 2 },
    ],
];

const COUNTS = [-1, 0, 1, 4, 5, 6, 8, 11, 12, 16, 17, 50];

describe("canonical ratio surface parity (seam convergence gate)", () => {
    it("resolveRequiredStaffForChildren === requiredStaffForChildren across the tier/count matrix", () => {
        for (const tiers of TIER_SETS) {
            for (const count of COUNTS) {
                const primitive = requiredStaffForChildren(tiers, count);
                const canonical = resolveRequiredStaffForChildren(tiers, count);
                expect(canonical, `tiers=${JSON.stringify(tiers)} count=${count}`).toEqual(primitive);
            }
        }
    });
});
