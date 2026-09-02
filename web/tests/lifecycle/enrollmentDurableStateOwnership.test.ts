/**
 * DURABLE STATE OWNERSHIP, and the next-episode defect this lane uncovered.
 *
 * Two owners, complementary and not competing:
 *
 *   ENROLLMENT PARTICIPATION (OCM)   durable child Enrollment state — `outcome_status_key`
 *   PROCESS INSTANCE                 execution/process lifecycle state
 *
 * Before this, the governed completion outcome wrote only the second. A child who finished
 * Enrollment kept a participation reading `enrolling` forever, so the durable answer to "is this
 * child enrolled?" never changed — and because the episode never concluded, its context-free slot
 * stayed pinned open and the child could never start a second enrollment.
 *
 * These tests exist so neither half can quietly go away again.
 */

import { describe, expect, it } from "vitest";

import {
    PARTICIPATION_REUSE_CONCLUDED_STATUS_KEYS,
    TERMINAL_CHILD_STATUS_KEYS,
    isReusableActiveParticipationStatus,
    ENROLLED_CHILD_STATUS_KEY,
} from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

describe("F — enrolled is terminal for ACTIVE-PARTICIPATION REUSE", () => {
    it("does not let an enrolled participation be reused", () => {
        expect(isReusableActiveParticipationStatus(ENROLLED_CHILD_STATUS_KEY)).toBe(false);
    });

    it("keeps withdrawn and not_enrolling concluded, as already modeled", () => {
        expect(isReusableActiveParticipationStatus("withdrawn")).toBe(false);
        expect(isReusableActiveParticipationStatus("not_enrolling")).toBe(false);
    });

    it("keeps an in-flight episode reusable", () => {
        expect(isReusableActiveParticipationStatus("enrolling")).toBe(true);
        expect(isReusableActiveParticipationStatus("waitlisted")).toBe(true);
    });

    it("treats an UNSET status as active — a fresh participation is the live one", () => {
        // The journey that just created a participation must be able to find it again.
        expect(isReusableActiveParticipationStatus(null)).toBe(true);
        expect(isReusableActiveParticipationStatus(undefined)).toBe(true);
        expect(isReusableActiveParticipationStatus("")).toBe(true);
        expect(isReusableActiveParticipationStatus("   ")).toBe(true);
    });

    it("keeps REUSE and EPISODE-TERMINALITY as different questions", () => {
        /*
         * Conflating these was the bug. `enrolled` is a SUCCESSFUL conclusion: the vocabulary does
         * not mark it terminal, and callers asking "did this child fall out of enrollment" must
         * keep getting false. Only reuse treats it as concluded.
         */
        expect(TERMINAL_CHILD_STATUS_KEYS).not.toContain(ENROLLED_CHILD_STATUS_KEY);
        expect(PARTICIPATION_REUSE_CONCLUDED_STATUS_KEYS).toContain(ENROLLED_CHILD_STATUS_KEY);
        for (const key of TERMINAL_CHILD_STATUS_KEYS) {
            expect(PARTICIPATION_REUSE_CONCLUDED_STATUS_KEYS).toContain(key);
        }
    });

    it("mirrors the index predicate exactly — one rule, expressed twice", async () => {
        const fs = await import("node:fs/promises");
        const sql = await fs.readFile(
            new URL(
                "../../../supabase/migrations/20260902090000_enrolled_ends_the_active_context_free_episode.sql",
                import.meta.url,
            ),
            "utf8",
        );
        /*
         * Comment lines are stripped FIRST. The migration quotes the superseded index in its own
         * explanation, and reading that one would assert the predicate we just replaced — the test
         * would then pass for exactly the wrong reason.
         */
        const executable = sql
            .split("\n")
            .filter((line) => !line.trimStart().startsWith("--"))
            .join("\n");
        const predicate = executable.slice(executable.indexOf("create unique index"));
        const inList = predicate.slice(predicate.indexOf("not in ("));
        const quoted = [...inList.slice(0, inList.indexOf(")")).matchAll(/'([^']+)'/g)].map((m) => m[1]);
        // Exactly the same set, in either direction: the index and the constant are one rule.
        expect(new Set(quoted)).toEqual(new Set(PARTICIPATION_REUSE_CONCLUDED_STATUS_KEYS));
    });
});

describe("the completion outcome writes BOTH owners", () => {
    const source = () =>
        import("node:fs/promises").then((fs) =>
            fs.readFile(
                new URL("../../lib/lifecycle/stageOutcomeRuleTargetExecutor.ts", import.meta.url),
                "utf8",
            ),
        );

    it("A — the enrolled disposition reaches the canonical OCM status writer", async () => {
        const src = await source();
        expect(src).toContain("updateOpportunityCustomerMemberLifecycleStatus");
    });

    it("B — a failed OCM write FAILS the outcome rather than reporting success", async () => {
        const src = await source();
        // Process completion alone is not a correct Enrollment completion.
        expect(src).toContain("Child enrollment status was not updated");
    });

    it("B — an unresolvable participation FAILS rather than silently skipping", async () => {
        const src = await source();
        expect(src).toContain("Could not resolve this child's Enrollment participation");
    });

    it("D — the process-instance write is still there; neither owner replaced the other", async () => {
        const src = await source();
        expect(src).toContain("setEnrollmentInstanceStateByScope");
    });

    it("C — the child outcome does not write the family case / opportunity status", async () => {
        const src = await source();
        const start = src.indexOf('case "update_child_enrollment_status"');
        const end = src.indexOf('case "update_candidate_status"');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const childCase = src.slice(start, end);
        // A decision about ONE child must never move the family's record.
        expect(childCase).not.toContain("updateOpportunityStatusWithEvent");
        expect(childCase).not.toContain("update_family_case_status");
    });

    it("emits the lifecycle event exactly once — the canonical writer emits it, or this does", async () => {
        const src = await source();
        const start = src.indexOf('case "update_child_enrollment_status"');
        const end = src.indexOf('case "update_candidate_status"');
        const childCase = src.slice(start, end);
        /*
         * The direct emit remains as the FALLBACK for the dispositions whose durable write did not
         * land, so those governed flows keep the event they always had. It is guarded on the
         * canonical writer not having emitted already — without that guard every workflow subscribed
         * to child_lifecycle_status_changed would fire twice per enrollment.
         */
        expect(childCase).toContain("!lifecycleEventEmitted");
        expect(childCase).toContain("lifecycleEventEmitted = lifecycle.eventEmitted");
    });

    it("compensates BOTH writes when the transaction unwinds", async () => {
        const src = await source();
        const start = src.indexOf('case "update_child_enrollment_status"');
        const end = src.indexOf('case "update_candidate_status"');
        const childCase = src.slice(start, end);
        // The undo is REPLACED with one that restores the participation status too, and it restores
        // the status the row actually held rather than assuming what it was.
        expect(childCase).toContain("undoProcessState");
        expect(childCase).toContain("restoredStatus");
        expect(childCase).toContain("lifecycle.before.outcome_status_key");
    });

    it("is strict for `enrolled` and declarative for the other dispositions", async () => {
        const src = await source();
        const start = src.indexOf('case "update_child_enrollment_status"');
        const end = src.indexOf('case "update_candidate_status"');
        const childCase = src.slice(start, end);
        /*
         * For `enrolled` the durable write IS the outcome, so it fails and compensates. Family
         * close, waitlist and withdraw predate this and never depended on an OCM write — making
         * their success newly conditional would break closes that work today.
         */
        expect(childCase).toContain('dispositionKey === "enrolled"');
        expect(childCase).toContain("enrollmentIsThePoint");
        expect(childCase).toContain("degradedEffects.push");
    });

    it("never lets the status writer THROW out of the outcome", async () => {
        const src = await source();
        // An escaping exception abandons the outcome with the process write already committed and
        // no compensation offered — strictly worse than a reported failure.
        expect(src).toContain(".catch(");
    });
});

describe("the canonical OCM writer serves a context-free participation", () => {
    const source = () =>
        import("node:fs/promises").then((fs) =>
            fs.readFile(
                new URL("../../lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus.ts", import.meta.url),
                "utf8",
            ),
        );

    it("no longer refuses when there is no acquisition Opportunity", async () => {
        const src = await source();
        expect(src).not.toContain('return { error: { message: "orgId, opportunityId, and opportunityCustomerMemberId are required" } }');
        expect(src).toContain("orgId and opportunityCustomerMemberId are required");
    });

    it("scopes a context-free row with IS NULL, because `=` never matches NULL", async () => {
        const src = await source();
        expect(src).toContain('is("opportunity_id", null)');
    });

    it("skips the acquisition-shaped waitlist placement hook when there is no Opportunity", async () => {
        const src = await source();
        expect(src).toContain("oppId && params.runPlacementHook !== false");
    });
});
