/**
 * Evidence: Lead Work View membership after Move to Waitlist (child-grain).
 *
 * Published Enrollment queue-membership defaults keep Lead as case/family grain.
 * `waitlist_child` advances child Enrollment stage/disposition only and never rewrites
 * family `opportunities.stage_key`. Therefore a family whose case stage remains Lead still
 * matches the Lead Work View after all children are waitlisted — by configured semantics,
 * not by stale projection.
 *
 * Product gap (do not hardcode): if operators expect "all children waitlisted → leave Lead",
 * that requires a published family-level outcome/transition, not client math.
 */

import { describe, expect, it } from "vitest";

import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import {
    isQueueMembershipMutationActionKey,
    shouldRefetchWorkUnitQueueRowsForEvent,
    shouldRefreshQueueSummariesForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import {
    clearEligibleEnrollmentChildrenWarmCacheForTests,
    invalidateEligibleEnrollmentChildren,
    peekEligibleEnrollmentChildren,
    prefetchEligibleEnrollmentChildren,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/eligibleEnrollmentChildrenWarmCache";

describe("Lead Work View membership after waitlist_child (published config)", () => {
    it("Lead stage membership is case/family grain, not candidate/child", () => {
        const lead = defaultEnrollmentQueueMembershipForStage("lead");
        expect(lead).toBeTruthy();
        expect(lead!.subject_type).toBe("case");
        expect(lead!.count_unit).toBe("cases");
    });

    it("Waitlist stage membership is candidate grain with candidate counts", () => {
        const waitlist = defaultEnrollmentQueueMembershipForStage("waitlist");
        expect(waitlist).toBeTruthy();
        expect(waitlist!.subject_type).toBe("candidate");
        expect(waitlist!.count_unit).toBe("candidates");
    });

    it("documents that family Lead membership is independent of child waitlist grain", () => {
        const lead = defaultEnrollmentQueueMembershipForStage("lead")!;
        const waitlist = defaultEnrollmentQueueMembershipForStage("waitlist")!;
        // Different subject grains — moving children onto Waitlist does not, by itself, remove
        // the family from the Lead cohort under these defaults.
        expect(lead.subject_type).not.toBe(waitlist.subject_type);
        expect(lead.subject_type).toBe("case");
    });
});

describe("waitlist_child queue membership refresh", () => {
    it("classifies waitlist_child / move_to_waitlist as membership mutations", () => {
        expect(isQueueMembershipMutationActionKey("waitlist_child")).toBe(true);
        expect(isQueueMembershipMutationActionKey("move_to_waitlist")).toBe(true);
    });

    it("refetches Waitlist lane rows when family opportunity id is not in visible child subjects", () => {
        const detail = { id: "family-opp", action_key: "waitlist_child" };
        // Waitlist queue subjects are child/candidate ids — family opp is off-screen.
        const visibleOpportunityIds = ["ocm-lennon", "ocm-wrigley"];
        expect(shouldRefetchWorkUnitQueueRowsForEvent({ detail, visibleOpportunityIds })).toBe(true);
        expect(shouldRefreshQueueSummariesForEvent({ detail, visibleOpportunityIds })).toBe(true);
    });
});

describe("eligible enrollment children warm cache", () => {
    it("peeks only after a successful warm populate", async () => {
        clearEligibleEnrollmentChildrenWarmCacheForTests();
        expect(peekEligibleEnrollmentChildren("opp-warm")).toBeNull();

        const originalFetch = globalThis.fetch;
        const hadWindow = typeof globalThis.window !== "undefined";
        if (!hadWindow) {
            (globalThis as { window?: unknown }).window = globalThis;
        }
        globalThis.fetch = (async () =>
            new Response(
                JSON.stringify({
                    ok: true,
                    data: {
                        status: "multiple",
                        subjects: [
                            { id: "ocm-1", label: "Lennon · North Campus" },
                            { id: "ocm-2", label: "Wrigley · North Campus" },
                        ],
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            )) as typeof fetch;

        try {
            const promise = prefetchEligibleEnrollmentChildren("opp-warm");
            expect(promise).toBeTruthy();
            const value = await promise;
            expect(value?.subjects).toHaveLength(2);
            const peeked = peekEligibleEnrollmentChildren("opp-warm");
            expect(peeked?.subjects.map((s) => s.id)).toEqual(["ocm-1", "ocm-2"]);
            invalidateEligibleEnrollmentChildren("opp-warm");
            expect(peekEligibleEnrollmentChildren("opp-warm")).toBeNull();
        } finally {
            globalThis.fetch = originalFetch;
            if (!hadWindow) {
                delete (globalThis as { window?: unknown }).window;
            }
            clearEligibleEnrollmentChildrenWarmCacheForTests();
        }
    });
});
