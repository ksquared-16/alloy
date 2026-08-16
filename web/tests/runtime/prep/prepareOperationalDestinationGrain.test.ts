/** @vitest-environment node */

import { describe, expect, it, vi } from "vitest";

// Declares the id parameter so the mock's signature matches the call on the next line. Vitest does
// not typecheck, so an untyped 0-arg mock passes here and only fails under `typecheck:tests`.
const prewarm = vi.fn(async (_id: string) => {});
vi.mock("@/lib/presentation/runtime/useRecordWorkRuntime", () => ({
    prewarmRecordWork: (id: string) => prewarm(id),
}));

const { prepareOperationalDestination } = await import("@/lib/runtime/prep/prepareOperationalDestination");

/**
 * A child-grain destination must not prewarm the OPPORTUNITY record-work VM.
 *
 * `prewarmRecordWork` loads `/api/admin/view-models/drawer/opportunity/<id>`. On a child-grain
 * work view `recordOfAttention` is a child PARTICIPATION, so preparing that destination 404'd —
 * observed on Firefly's Waitlist view on every entry that prepared it, including from All, which
 * never opens that subject.
 */
const kernel = (snapshot: unknown) => ({
    provisioning: { prepare: async () => ({ snapshot }) as never },
});

describe("prepareOperationalDestination — subject grain", () => {
    it("prewarms an opportunity destination", async () => {
        prewarm.mockClear();
        await prepareOperationalDestination(
            kernel({ terminal: "operational", recordOfAttention: { id: "opp-1" }, subjectGrain: { grain: "case", subjectType: "opportunity" } }) as never,
            {} as never,
        );
        expect(prewarm).toHaveBeenCalledWith("opp-1");
    });

    it("does NOT prewarm a child-grain destination", async () => {
        prewarm.mockClear();
        await prepareOperationalDestination(
            kernel({ terminal: "operational", recordOfAttention: { id: "participation-1" }, subjectGrain: { grain: "child", subjectType: "child" } }) as never,
            {} as never,
        );
        expect(prewarm).not.toHaveBeenCalled();
    });

    it("keeps prior behaviour when the answer states no subject type", async () => {
        prewarm.mockClear();
        await prepareOperationalDestination(
            kernel({ terminal: "operational", recordOfAttention: { id: "opp-2" } }) as never,
            {} as never,
        );
        expect(prewarm).toHaveBeenCalledWith("opp-2");
    });

    it("does not prewarm a non-operational terminal", async () => {
        prewarm.mockClear();
        await prepareOperationalDestination(
            kernel({ terminal: "empty", recordOfAttention: { id: "opp-3" }, subjectGrain: { grain: "case", subjectType: "opportunity" } }) as never,
            {} as never,
        );
        expect(prewarm).not.toHaveBeenCalled();
    });
});
