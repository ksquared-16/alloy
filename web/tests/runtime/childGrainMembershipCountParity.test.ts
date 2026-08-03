/**
 * ROWS AND COUNT ARE THE SAME PROJECTION.
 *
 * The defect: "All Children in Enrollment" rendered thirteen child rows under a pill that said eight.
 * Neither number was fabricated — they answered different questions. The rows came from the child
 * provider (live enrollment participations); the count came from the opportunity base lane, which,
 * because a stage-independent lens has no predicates, was read as include-all and returned the lane's
 * all-records total.
 *
 * These proofs are about the SHAPE of the fix, not the numbers: membership is defined once, and both
 * readings go through it. A count patched to match the rows would satisfy any assertion about 13; only
 * a shared projection makes drift impossible.
 */
import { describe, expect, it, vi } from "vitest";
import {
    childRowMembershipForLens,
    countChildGrainMembersForLens,
    loadChildGrainMembersForLens,
} from "@/lib/runtime/provisioning/childGrainMembership";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

vi.mock("@/lib/runtime/provisioning/childGrainProvisioningRows", () => ({
    loadChildGrainProvisioningRows: vi.fn(async (p: { membership: unknown }) => {
        // Stand in for the provider: the participation rule yields three live children, the
        // stage-scoped rule yields one. The point is WHICH rule was asked for.
        const m = p.membership as { mode: string };
        return m.mode === "participation"
            ? [{ participationId: "pi-1" }, { participationId: "pi-2" }, { participationId: "pi-3" }]
            : [{ participationId: "pi-9" }];
    }),
}));

const view = (over: Partial<WorkViewConfigV1Stored> = {}): WorkViewConfigV1Stored =>
    ({ id: "v", label: "V", ...over }) as WorkViewConfigV1Stored;

const supabase = {} as never;
const scope = { supabase, orgId: "org-1", workUnitId: "wu-1" };

describe("child lens membership — one rule", () => {
    it("a lens with no stage predicate is PARTICIPATION membership, not 'every stage'", () => {
        expect(childRowMembershipForLens(view())).toEqual({ mode: "participation" });
        expect(childRowMembershipForLens(view({ filters_v1: [] }))).toEqual({ mode: "participation" });
    });

    it("a stage-scoped lens keeps stage membership", () => {
        const scoped = view({
            filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "waitlist" }],
        });
        expect(childRowMembershipForLens(scoped)).toEqual({ mode: "stages", stageKeys: ["waitlist"] });
    });

    it("an empty-valued stage predicate is NOT a stage scope — it selects nothing to scope by", () => {
        // The builder and the runtime must not disagree about whether this lens is stage-scoped.
        const blank = view({
            filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "  " }],
        });
        expect(childRowMembershipForLens(blank)).toEqual({ mode: "participation" });
    });
});

describe("count is the row projection, read twice", () => {
    it("count equals the number of members the SAME call returns", async () => {
        const rows = await loadChildGrainMembersForLens({ ...scope, view: view() });
        const count = await countChildGrainMembersForLens({ ...scope, view: view() });
        expect(count).toBe(rows.length);
        expect(count).toBe(3);
    });

    it("a stage-scoped lens counts ITS members, not the participation set", async () => {
        const scoped = view({
            filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "waitlist" }],
        });
        const rows = await loadChildGrainMembersForLens({ ...scope, view: scoped });
        const count = await countChildGrainMembersForLens({ ...scope, view: scoped });
        expect(count).toBe(rows.length);
        expect(count).toBe(1);
    });

    it("an empty membership counts ZERO truthfully — never an opportunity total standing in", async () => {
        const mod = await import("@/lib/runtime/provisioning/childGrainProvisioningRows");
        vi.mocked(mod.loadChildGrainProvisioningRows).mockResolvedValueOnce([]);
        await expect(countChildGrainMembersForLens({ ...scope, view: view() })).resolves.toBe(0);
    });

    it("a provider failure PROPAGATES — the caller must say unknown, never substitute a number", async () => {
        const mod = await import("@/lib/runtime/provisioning/childGrainProvisioningRows");
        vi.mocked(mod.loadChildGrainProvisioningRows).mockRejectedValueOnce(new Error("read failed"));
        await expect(countChildGrainMembersForLens({ ...scope, view: view() })).rejects.toThrow("read failed");
    });
});
