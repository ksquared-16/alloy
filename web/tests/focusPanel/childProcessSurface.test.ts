import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    cardAppliesToGrain,
    resolveCardIdentity,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { buildDurableChildOperationalContext } from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import type { DurableChildStageWorkContextInput } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildStageWorkContextInput";

/**
 * A CHILD RUNS A PROCESS OF THEIR OWN, AND THEIR RECORD HAS TO SAY SO.
 *
 * Measured before this slice: the case sat at Decision while the child sat at Enrolling, so the
 * family Process Card correctly refused the child's work — and no other surface claimed it. The
 * child's own record resolved the right context (`Enrollment · Registration`, stage `enrolling`,
 * chip ACTIVE) and rendered nothing operational, because `buildDurableChildOperationalContext`
 * asserted `businessProcess: null` and the contextual card had no branch for a process context.
 */

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const CHILD = "aaaaaaaa-0000-4000-8000-00000000000a";
const OCM = "bbbbbbbb-0000-4000-8000-00000000000b";

const subject = (): DurableChildSubject => ({
    memberId: CHILD,
    personId: null,
    householdId: "hh-1",
    label: "Touree Disposable0913",
    dateOfBirth: null,
    householdName: "Disposable0913 Family",
    isActive: true,
    truth: {},
});

const stageWork = (over: Partial<DurableChildStageWorkContextInput> = {}): DurableChildStageWorkContextInput => ({
    processKey: "enrollment",
    processLabel: "Enrollment",
    stageKey: "enrolling",
    stageLabel: "Enrolling",
    opportunityCustomerMemberId: OCM,
    stageWorkRuntime: {
        stage_key: "enrolling",
        stage_label: "Enrolling",
        purpose: null,
        journey_segment: "child",
        template_keys: ["send_enrollment_packet", "confirm_start_date"],
        primary: null,
        additional: [],
        execution: { department_id: "dept-1" },
    } as never,
    publishedStageInputs: null,
    ...over,
});

describe("explicit child stage membership becomes operational child context", () => {
    it("carries the child's OWN stage, not the family's and not a disposition", () => {
        const ctx = buildDurableChildOperationalContext(subject(), true, null, stageWork());
        expect(ctx.businessProcess.stageKey).toBe("enrolling");
        expect(ctx.businessProcess.key).toBe("enrollment");
        expect(ctx.stageWorkRuntime?.stage_key).toBe("enrolling");
        // The subject stays the child; the grain does not become a case because a process appeared.
        expect(ctx.subject.type).toBe("child");
        expect(ctx.grain).toBe("child");
    });

    it("names the participant, so a child-grain command can resolve its subject", () => {
        const ctx = buildDurableChildOperationalContext(subject(), true, null, stageWork());
        expect(ctx.participantScope?.customerMemberId).toBe(CHILD);
        expect(ctx.participantScope?.participationId).toBe(OCM);
        expect(ctx.participantScope?.stageKey).toBe("enrolling");
    });

    it("a child with no journey keeps the all-null shape it had before", () => {
        // Absence is ordinary — a child added from a phone call has a record long before a journey.
        const ctx = buildDurableChildOperationalContext(subject(), true, null, null);
        expect(ctx.businessProcess).toEqual({ key: null, label: null, stageKey: null });
        expect(ctx.stageWorkRuntime ?? null).toBeNull();
        expect(ctx.participantScope ?? null).toBeNull();
    });

    it("a stage-less journey is the same as no journey — never a fabricated process", () => {
        const ctx = buildDurableChildOperationalContext(subject(), true, null, stageWork({ stageKey: null }));
        expect(ctx.businessProcess.stageKey).toBeNull();
        expect(ctx.businessProcess.key).toBeNull();
    });
});

describe("the same card, because the subject is different", () => {
    it("the Business Process card is declared for the child grain", () => {
        expect(cardAppliesToGrain("business_process", "child")).toBe(true);
        // …and still for the case, which is the host the family keeps.
        expect(cardAppliesToGrain("business_process", "opportunity")).toBe(true);
    });

    it("is NOT declared for a household — two enrollments would be two stages", () => {
        expect(cardAppliesToGrain("business_process", "household")).toBe(false);
    });

    it("the successor key is asked for, never written down", () => {
        expect(resolveCardIdentity("current_work", "child")).toBe("business_process");
        const card = code("components/presentation/durableRecord/DurableRecordContextualCard.tsx");
        expect(card).toContain('resolveCardIdentity("current_work", "child")');
        // The same renderer both hosts use — no child-specific Enrollment card.
        expect(card).toContain("<FocusPanelCardRenderer");
    });

    it("no second Enrollment card was created for the child", () => {
        for (const fork of [
            "components/presentation/durableRecord/ChildEnrollmentProcessCard.tsx",
            "components/admin/focusPanel/cards/ChildProcessCard.tsx",
            "components/presentation/durableRecord/DurableChildProcessCard.tsx",
        ]) {
            let exists = true;
            try {
                readFileSync(join(WEB, fork), "utf8");
            } catch {
                exists = false;
            }
            expect(exists, `${fork} is a second Process card`).toBe(false);
        }
    });

    it("a process context renders the process card, and no stage renders nothing", () => {
        const card = code("components/presentation/durableRecord/DurableRecordContextualCard.tsx");
        expect(card).toContain('option.kind === "process" && subject.kind === "child"');
        expect(card).toContain("const processCard = renderCanonicalProcessCard();");
        // A process context with no stage keeps the Children card it rendered before — the stage is
        // the discriminator, so nothing changes for a child who is not running a process.
        expect(card).toContain("if (processCard) return processCard;");
        // No stage, no card — a card that rendered anyway would assert a process position.
        expect(card).toContain("if (!operationalContext.businessProcess.stageKey) return null;");
    });
});

describe("the child's stage work is projected by the canonical owner", () => {
    const composer = code(
        "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildStageWork.ts",
    );

    it("reuses resolveOpportunityStageWorkSlice rather than projecting its own", () => {
        expect(composer).toContain("resolveOpportunityStageWorkSlice");
        expect(composer).not.toContain("projectStageWorkRuntime(");
    });

    it("reads the explicit stage key and never falls back to a disposition", () => {
        expect(composer).toContain("process_instances");
        expect(composer).toContain("stage_key");
        // The disposition column is a different axis; reading it here is the defect class this
        // whole arc has been closing.
        expect(composer).not.toContain("outcome_status_key");
    });

    it("resolves the acquisition episode through the participation, not by assuming the anchor", () => {
        // A journey anchored to the participation carries an OCM id in `context_id`; assuming it is
        // an opportunity is exactly the defect that class keeps producing.
        expect(composer).toContain("ENROLLMENT_PARTICIPATION_CONTEXT_TYPE");
        expect(composer).toContain("opportunity_customer_members");
    });

    it("an open journey is never displaced by a concluded one", () => {
        expect(composer).toContain("CONCLUDED_ENROLLMENT_PROCESS_STATES");
    });

    it("the durable record composes it beside the record, and a failure costs only the card", () => {
        const route = code("app/api/admin/durable-record/route.ts");
        expect(route).toContain("composeDurableChildStageWork");
        expect(route).toContain("child stage work composition failed");
    });
});
