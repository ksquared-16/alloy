import { describe, expect, it } from "vitest";
import { buildQueueRowDisplayPatchFromPersonSave } from "@/lib/admin/opportunityQueueRowDisplayPatch";
import {
    isQueueMembershipMutationActionKey,
    shouldPatchWorkUnitQueueRowsForEvent,
    shouldRefetchWorkUnitQueueRowsForEvent,
    shouldRefreshQueueSummariesForEvent,
} from "@/lib/admin/opportunityQueueRefreshEvent";

describe("opportunityQueueRefreshEvent", () => {
    const personPatch = buildQueueRowDisplayPatchFromPersonSave({
        personId: "p1",
        patch: { email: "patched@example.com" },
        person: { first_name: "Pat", last_name: "Lee", email: "patched@example.com" },
    });

    it("refetches rows when event has no id (legacy broadcast)", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: {},
                visibleOpportunityIds: ["a"],
            })
        ).toBe(true);
    });

    it("treats create_lead as a queue-membership mutation", () => {
        // A new lead changes New Leads lane membership — listeners must refetch, not no-op.
        expect(isQueueMembershipMutationActionKey("create_lead")).toBe(true);
    });

    it("treats stage_work_outcome as a queue-membership mutation", () => {
        expect(isQueueMembershipMutationActionKey("stage_work_outcome")).toBe(true);
    });

    it("refetches lane rows AND summaries for a newly created lead not yet in the visible list", () => {
        const detail = { id: "opp-new", action_key: "create_lead" };
        const visibleOpportunityIds = ["opp-1", "opp-2"]; // new lead is off-screen
        // Row refetch is required so the new lead appears in the lane (not just the count).
        expect(shouldRefetchWorkUnitQueueRowsForEvent({ detail, visibleOpportunityIds })).toBe(true);
        // Counts/pills must refetch too.
        expect(shouldRefreshQueueSummariesForEvent({ detail, visibleOpportunityIds })).toBe(true);
    });

    it("refetches rows when updated id is visible and action is membership (inline_save)", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "opp-1", action_key: "inline_save" },
                visibleOpportunityIds: ["opp-1", "opp-2"],
            })
        ).toBe(true);
        expect(
            shouldPatchWorkUnitQueueRowsForEvent({
                detail: { id: "opp-1", action_key: "inline_save" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
    });

    it("patches visible row for person_contact_save with queue_row_patch (no refetch)", () => {
        const detail = {
            id: "opp-1",
            action_key: "person_contact_save",
            queue_row_patch: personPatch,
        };
        expect(
            shouldPatchWorkUnitQueueRowsForEvent({
                detail,
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(true);
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail,
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
        expect(
            shouldRefreshQueueSummariesForEvent({
                detail,
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
    });

    it("refetches visible row when patch action has no queue_row_patch payload", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "opp-1", action_key: "person_contact_save" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(true);
    });

    it("skips row refetch when id is not visible and action is non-membership", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "other-opp", action_key: "drawer_header_refresh" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
    });

    it("skips row refetch for off-screen person_contact_save", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "other-opp", action_key: "person_contact_save" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(false);
    });

    it("refetches rows for membership mutations even when id not visible", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { id: "other-opp", action_key: "inline_save" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(true);
        expect(isQueueMembershipMutationActionKey("inline_save")).toBe(true);
        expect(isQueueMembershipMutationActionKey("customer_member_inline_save")).toBe(true);
        expect(isQueueMembershipMutationActionKey("family_contacts_registry")).toBe(true);
        expect(isQueueMembershipMutationActionKey("person_employee_updated")).toBe(true);
    });

    it("refetches waitlist rows for person_employee_updated broadcast", () => {
        expect(
            shouldRefetchWorkUnitQueueRowsForEvent({
                detail: { action_key: "person_employee_updated" },
                visibleOpportunityIds: ["opp-1"],
            })
        ).toBe(true);
    });

    // ── PATCH PRECEDENCE ────────────────────────────────────────────────────────────────
    // This replaced a source inspection of
    // `app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`, which asserted the
    // page called `shouldPatchWorkUnitQueueRowsForEvent`, then `patchWorkUnitQueueItemsResult`, then
    // `deleteQueueRowCacheKeysForWorkUnit` only under `if (refreshRows)`.
    //
    // That page was deleted wholesale in 2cdd4a398 ("PRV2: delete legacy presentation tree"), so the
    // assertion read a file that no longer exists and failed on staging for reasons unrelated to any
    // sprint. `patchWorkUnitQueueItemsResult` exists nowhere in the runtime any more, and
    // `deleteQueueRowCacheKeysForWorkUnit` has no runtime call site at all.
    //
    // The INTENT survives, and canonically: a display-only patch handles the visible row in place, and
    // therefore suppresses both the lane refetch and the summary refresh. That is the same ordering
    // guarantee — patch wins over invalidation — expressed as behaviour instead of page source text.
    // Asserting it here binds the invariant to the decision helpers that actually own it, rather than
    // to whichever component happens to consume them.
    describe("patch precedence — a display-only patch suppresses refetch and summary refresh", () => {
        const patchEligible = {
            detail: { id: "opp-1", action_key: "person_contact_save", queue_row_patch: personPatch },
            visibleOpportunityIds: ["opp-1"],
        };

        it("a patch-eligible event is handled through the patch path", () => {
            expect(shouldPatchWorkUnitQueueRowsForEvent(patchEligible)).toBe(true);
        });

        it("when patch handling applies, row refetch is false", () => {
            expect(shouldRefetchWorkUnitQueueRowsForEvent(patchEligible)).toBe(false);
        });

        it("when patch handling applies, summary refresh is false", () => {
            expect(shouldRefreshQueueSummariesForEvent(patchEligible)).toBe(false);
        });

        it("a non-patch event on a visible row still requests refetch", () => {
            const nonPatch = {
                detail: { id: "opp-1", action_key: "stage_work_outcome" },
                visibleOpportunityIds: ["opp-1"],
            };
            expect(shouldPatchWorkUnitQueueRowsForEvent(nonPatch)).toBe(false);
            expect(shouldRefetchWorkUnitQueueRowsForEvent(nonPatch)).toBe(true);
        });

        it("a patch-eligible action carrying NO patch fields still requests refetch", () => {
            const emptyPatch = {
                detail: { id: "opp-1", action_key: "person_contact_save", queue_row_patch: {} },
                visibleOpportunityIds: ["opp-1"],
            };
            expect(shouldPatchWorkUnitQueueRowsForEvent(emptyPatch)).toBe(false);
            expect(shouldRefetchWorkUnitQueueRowsForEvent(emptyPatch)).toBe(true);
        });

        // NEGATIVE CONTROL. The assertions above only prove the invariant holds today; they do not
        // prove they would NOTICE it breaking. `violatesPatchPrecedence` is the predicate those
        // assertions rest on, exercised here against a regressed combination so a green run cannot be
        // vacuous: if patch-eligible events ever start requesting refetch or cache invalidation again,
        // this is the shape that catches it.
        const violatesPatchPrecedence = (v: {
            patch: boolean;
            refetch: boolean;
            summaries: boolean;
        }): boolean => v.patch && (v.refetch || v.summaries);

        it("negative control — the predicate detects a reintroduced refetch on a patch-eligible event", () => {
            expect(violatesPatchPrecedence({ patch: true, refetch: true, summaries: false })).toBe(true);
            expect(violatesPatchPrecedence({ patch: true, refetch: false, summaries: true })).toBe(true);
            expect(violatesPatchPrecedence({ patch: true, refetch: false, summaries: false })).toBe(false);
            // …and the live helpers are on the non-violating side of that predicate.
            expect(
                violatesPatchPrecedence({
                    patch: shouldPatchWorkUnitQueueRowsForEvent(patchEligible),
                    refetch: shouldRefetchWorkUnitQueueRowsForEvent(patchEligible),
                    summaries: shouldRefreshQueueSummariesForEvent(patchEligible),
                })
            ).toBe(false);
        });
    });
});
