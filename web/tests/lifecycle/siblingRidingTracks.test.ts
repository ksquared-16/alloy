/**
 * When a family's first child branches, each sibling without a journey gets one that rides the family:
 * no stage, no state — their position becomes countable, and nothing about it changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const created: Array<Record<string, unknown>> = [];
const existing = new Map<string, string>();

vi.mock("@/lib/process/processInstances", () => ({
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE: "enrollment_participation",
    resolveEnrollmentInstanceIdForScope: vi.fn(async (_s: unknown, args: { customerMemberId: string }) => ({
        id: existing.get(args.customerMemberId) ?? null,
        ambiguous: false,
    })),
    createEnrollmentProcessInstance: vi.fn(async (_s: unknown, args: Record<string, unknown>) => {
        created.push(args);
        existing.set(String(args.subjectId), `pi-${String(args.subjectId)}`);
        return { id: `pi-${String(args.subjectId)}` };
    }),
}));
vi.mock("@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation", () => ({
    ensureOpportunityCustomerMemberParticipation: vi.fn(async () => ({ ocmId: "ocm-ava" })),
}));

import { ensureChildEnrollmentTrack } from "@/lib/lifecycle/ensureChildEnrollmentTrack";

const supabase = {
    from: () => {
        const b: Record<string, unknown> = {
            select: () => b,
            eq: () => b,
            then: (resolve: (r: unknown) => void) =>
                resolve({
                    data: [
                        { id: "ocm-ava", customer_member_id: "ava" },
                        { id: "ocm-ben", customer_member_id: "ben" },
                        { id: "ocm-cal", customer_member_id: "cal" },
                    ],
                    error: null,
                }),
        };
        return b;
    },
} as never;

describe("first branch begins riding tracks for siblings", () => {
    beforeEach(() => {
        created.length = 0;
        existing.clear();
    });

    it("creates the brancher's track and a stageless, stateless track for each sibling without one", async () => {
        existing.set("cal", "pi-cal");
        const r = await ensureChildEnrollmentTrack(supabase, { orgId: "org", opportunityId: "opp", customerMemberId: "ava", opportunityCustomerMemberId: "ocm-ava" });
        expect(r).toMatchObject({ ok: true, created: true, instanceId: "pi-ava" });
        const siblings = created.filter((c) => c.subjectId !== "ava");
        expect(siblings).toEqual([
            expect.objectContaining({ subjectId: "ben", contextId: "ocm-ben", stageKey: null, state: null, source: "sibling_branched" }),
        ]);
    });

    it("does nothing to siblings when the child already had a track", async () => {
        existing.set("ava", "pi-ava");
        await ensureChildEnrollmentTrack(supabase, { orgId: "org", opportunityId: "opp", customerMemberId: "ava" });
        expect(created).toEqual([]);
    });
});
