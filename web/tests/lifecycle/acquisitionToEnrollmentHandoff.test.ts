/**
 * THE ACQUISITION → ENROLLMENT HANDOFF, and the grain boundary it exists to respect.
 *
 * The configured operating plans declare `enrolling` a FAMILY stage and `enrollment` a CHILD stage —
 * adjacent names at opposite grains. Create Lead used to create a CHILD Enrollment journey during
 * intake, which put that journey into the family `lead` stage; the child then reported "Stage lead
 * requires no Forms" and could never realize a participant objective. Two symptoms, one grain error.
 *
 * These pin the corrected boundary: intake owns family acquisition and the child's participation
 * bridge; the governed family decision owns the moment the child's Enrollment execution begins.
 */

import { describe, expect, it } from "vitest";

import { ENROLLING_CHILD_STATUS_KEY } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import { ENROLLMENT_START_ENTRY_INTENT } from "@/lib/lifecycle/processEntryPointsV1";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

const read = (rel: string) =>
    import("node:fs/promises").then((fs) => fs.readFile(new URL(rel, import.meta.url), "utf8"));

describe("the two grains are named separately and cannot be typed interchangeably", () => {
    it("`enrolling` is configured FAMILY-grain and `enrollment` CHILD-grain", () => {
        expect(defaultStageOperatingPlanForEnrollmentStage("enrolling")?.journey_segment).toBe("family");
        expect(defaultStageOperatingPlanForEnrollmentStage("enrollment")?.journey_segment).toBe("child");
    });

    it("`lead` is family-grain, which is why a child journey may never sit there", () => {
        expect(defaultStageOperatingPlanForEnrollmentStage("lead")?.journey_segment).toBe("family");
    });
});

describe("Create Lead does not begin a child's Enrollment execution", () => {
    it("the household commit path creates no child Enrollment journey", async () => {
        const src = await read("../../lib/admin/actions/createLeadChildOcmPersistence.ts");
        expect(src).not.toContain("createEnrollmentProcessInstance");
        expect(src).toContain("process_instance_id: null");
    });

    it("the Processing INGEST port creates no child Enrollment journey either", async () => {
        // Both seams, or the defect simply moves to whichever one was left alone.
        const src = await read("../../lib/pos/processingIdentity/commands/ports.ts");
        const start = src.indexOf("async createProcessParticipation");
        const body = src.slice(start, src.indexOf("async updateProcessParticipation"));
        expect(body).not.toContain("createEnrollmentProcessInstance");
    });

    it("but BOTH still establish the child's participation bridge", async () => {
        for (const rel of [
            "../../lib/admin/actions/createLeadChildOcmPersistence.ts",
            "../../lib/pos/processingIdentity/commands/ports.ts",
        ]) {
            expect(await read(rel)).toContain("ensureOpportunityCustomerMemberParticipation");
        }
    });
});

describe("the family decision carries a declared child-grain effect", () => {
    const decision = defaultStageOperatingPlanForEnrollmentStage("decision")!;
    const rule = decision.outcome_rules.find((r) => r.when_outcome_key === "family_enrolling")!;

    it("moves the FAMILY to enrolling", () => {
        const move = rule.targets.find((t) => t.kind === "move_to_stage");
        expect(move?.transition_ref).toBe("decision_to_enrolling");
    });

    it("and separately begins the CHILD's Enrollment", () => {
        const enter = rule.targets.find((t) => t.kind === "enter_child_enrollment");
        expect(enter).toBeTruthy();
    });

    it("names NO stage, leaving the declared entry stage the only answer", () => {
        /*
         * A stage_key here would win over `entry_points_v1.by_intent.enrollment_start` at runtime,
         * because a persisted stage always beats the declaration. That is how this path came to sit
         * on a stage carrying no Form requirements while Start Enrollment realized its objective.
         */
        const enter = rule.targets.find((t) => t.kind === "enter_child_enrollment");
        expect(enter?.stage_key ?? null).toBeNull();
    });

    it("states the two effects separately rather than collapsing them into one stage", () => {
        const kinds = rule.targets.map((t) => t.kind);
        expect(kinds).toContain("move_to_stage");
        expect(kinds).toContain("enter_child_enrollment");
    });
});

describe("the handoff refuses rather than advancing siblings implicitly", () => {
    const body = async () => {
        const src = await read("../../lib/lifecycle/stageOutcomeRuleTargetExecutor.ts");
        const start = src.indexOf('case "enter_child_enrollment"');
        return src.slice(start, src.indexOf('case "update_candidate_status"', start));
    };

    it("refuses when the family has several children and the decision does not say which", async () => {
        expect(await body()).toContain("childIds.length > 1");
        expect(await body()).toContain("Record the decision per child");
    });

    it("refuses when there is no child to enrol, rather than silently doing nothing", async () => {
        expect(await body()).toContain("childIds.length === 0");
    });

    it("anchors the one journey to the participation", async () => {
        const b = await body();
        expect(b).toContain("contextType: ENROLLMENT_PARTICIPATION_CONTEXT_TYPE");
        expect(b).toContain("contextId: participation.ocmId");
    });

    it("stamps no stage and carries the enrollment_start intent, exactly as Start Enrollment does", async () => {
        const b = await body();
        expect(b).toContain("stageKey: null");
        expect(b).toContain("source: ENROLLMENT_START_ENTRY_INTENT");
        expect(ENROLLMENT_START_ENTRY_INTENT).toBe("enrollment_start");
        // The intent Start Enrollment writes, so both doors resolve one declared stage.
        const startEnrollment = await read("../../lib/records/startEnrollmentService.ts");
        expect(startEnrollment).toContain(`source: "${ENROLLMENT_START_ENTRY_INTENT}"`);
    });

    it("sets durable child status through the canonical writer, never a direct patch", async () => {
        const b = await body();
        expect(b).toContain("updateOpportunityCustomerMemberLifecycleStatus");
        expect(b).toContain(ENROLLING_CHILD_STATUS_KEY);
        expect(b).not.toMatch(/from\("opportunity_customer_members"\)\s*\.update/);
    });
});

describe("Path A is unaffected", () => {
    it("context-free Start Enrollment still anchors to the participation with no Opportunity", async () => {
        const src = await read("../../lib/records/startEnrollmentService.ts");
        expect(src).toContain("ENROLLMENT_PARTICIPATION_CONTEXT_TYPE");
        expect(src).toContain("contextId: participation.ocmId");
        // It must not have acquired a dependency on any family decision.
        expect(src).not.toContain("family_enrolling");
    });
});

describe("legacy history still resolves", () => {
    it("the journey resolver still reads all three context shapes", async () => {
        /*
         * Carried over from createLeadParticipationAnchor.test.ts, which pinned the earlier step of
         * this correction (Create Lead anchoring its journey to the participation). That behaviour is
         * superseded -- Create Lead now creates no child journey at all -- but this half is not:
         * concluded Opportunity-anchored history is never migrated for uniformity, so the resolver
         * must keep reading the older shape. A fix that made new writes canonical by making old ones
         * unreadable would trade one defect for a worse one.
         */
        const src = await read("../../lib/enrollment/completion/resolveEnrollmentJourneyContext.ts");
        expect(src).toContain("ENROLLMENT_PARTICIPATION_CONTEXT_TYPE");
        expect(src).toContain("ENROLLMENT_CONTEXT_TYPE");
        expect(src).toContain("subject_lookup");
    });
});
