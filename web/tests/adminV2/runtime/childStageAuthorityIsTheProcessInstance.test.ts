/**
 * A CHILD'S STAGE IS THE CHILD'S PROCESS INSTANCE. NOTHING ELSE MAY ANSWER FOR IT.
 *
 * Three records can be in scope at once when an operator opens a child: the WORK UNIT they arrived
 * through, the FAMILY case that was loaded, and the CHILD who is actually the subject. Only the last
 * one has a stage of its own — `process_instances.stage_key`, written by
 * `moveEnrollmentInstanceStageByScope` and by nothing else, read through the effective-stage rule
 * the queue lanes already coalesce on. The other two were both, at different times, allowed to
 * answer in its place:
 *
 *   the work unit — the lifecycle rail fell back to the lens's own declared stage, so every
 *                   placement candidate opened from Waitlist reported `waitlist`;
 *   the family    — with that gone, an unresolved child stage fell through to the household's rail
 *                   position, which is a different record's answer wearing the child's name.
 *
 * Both substitutions look identical from the outside: the Process card states a stage, confidently,
 * and it is not the subject's. These tests hold each seam to the child's own answer, and to NULL
 * when the child genuinely has none — because an honest absence is the only thing that lets QA tell
 * real membership from the route it was viewed through.
 *
 * MIXED GRAIN IS THE POINT. Enrollment runs family-grain and child-grain stages side by side, so
 * every guard below is paired with its case-grain counterpart: the family's stage must keep
 * resolving from the family's rail, untouched.
 */

import { describe, expect, it } from "vitest";

import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import { overlayChildMissionOntoSettledFocusModel } from "@/lib/adminV2/runtime/focusPanel/overlayChildMissionOntoSettledFocusModel";
import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import {
    NULL_BILLING_SIGNAL,
    type OperationalContext,
} from "@/lib/adminV2/runtime/operationalContext/types";

const RAIL_STAGES = [
    { key: "lead", label: "New Lead" },
    { key: "tour", label: "Tour" },
    { key: "waitlist", label: "Waitlist" },
    { key: "enrolling", label: "Enrolling" },
];

/**
 * The family case as each Work View hands it to the panel. The LENS (`work_unit_id`) and the
 * family's own rail position are independent inputs, so a test can make them disagree the way the
 * live tenant does.
 */
function subjectVmFrom(args: { workUnitKey: string; familyStageKey: string | null }) {
    return {
        entity: { type: "opportunity", id: "opp_1" },
        header: { title: "Kurzman Family" },
        layout: { mode: "workflow_v1" },
        actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
        workspace: {
            department_id: "dept-1",
            work_unit_id: args.workUnitKey,
            queue_definition: null,
            lifecycle_rail: {
                stages: RAIL_STAGES,
                current_stage_key: args.familyStageKey,
                process_name: "Enrollment",
            },
            stage_context: { stage_key: args.familyStageKey, stage_label: null, purpose: "" },
            work_intent_runtime: null,
            stage_work_runtime: null,
            published_stage_inputs: null,
            stage_work: { status: "pending" },
        },
        summaries: {
            tasks: { state: "loaded", open_tasks: [], open_count: 0 },
            active_tour_bookings: [],
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        activity: { communicationsPreviewVm: null },
        above_fold: { render_model: { sections: [] }, record: { id: "opp_1", _record_surface: "full" } },
    };
}

/**
 * The identity a CHILD subject carries. `child.customer_member_id` + `child.process_instance_id` are
 * what make it a stated child at all (the resolver refuses without both); `child.stage_key` is the
 * child's own effective stage, published beside them.
 */
function childTruth(args: {
    memberId?: string | null;
    participationId?: string | null;
    stageKey?: string | null;
    name?: string;
}): Record<string, unknown> {
    const memberId = args.memberId === undefined ? "cm_lennon" : args.memberId;
    const participationId = args.participationId === undefined ? "pi_lennon" : args.participationId;
    return {
        id: "opp_1",
        ...(memberId ? { "child.customer_member_id": memberId } : {}),
        ...(participationId ? { "child.process_instance_id": participationId } : {}),
        ...(args.stageKey ? { "child.stage_key": args.stageKey } : {}),
        "child.display_name": args.name ?? "Lennon Kurzman",
    };
}

function contextFor(args: {
    workUnitKey?: string;
    familyStageKey?: string | null;
    truth?: Record<string, unknown>;
}): OperationalContext {
    return buildOperationalContext({
        subjectVm: subjectVmFrom({
            workUnitKey: args.workUnitKey ?? "waitlist",
            familyStageKey: args.familyStageKey === undefined ? "lead" : args.familyStageKey,
        }),
        subjectId: "opp_1",
        title: "Kurzman Family",
        truth: args.truth ?? {},
        perspective: null,
        statusLabel: null,
        canMutate: true,
    } as never);
}

describe("the Process card's stage, for a stated child subject", () => {
    it("comes from the child, not from the family whose case was loaded", () => {
        // The family sits at Lead. The child's process instance says Enrolling. One of these is
        // about the subject.
        const ctx = contextFor({
            familyStageKey: "lead",
            truth: childTruth({ stageKey: "enrolling" }),
        });
        expect(ctx.businessProcess.stageKey).toBe("enrolling");
        expect(ctx.businessProcess.key).toBe("enrolling");
    });

    it("does not change when the same child is opened through a different lens", () => {
        const truth = childTruth({ stageKey: "lead" });
        const fromWaitlist = contextFor({ workUnitKey: "waitlist", truth });
        const fromAll = contextFor({ workUnitKey: "all", truth });
        expect(fromWaitlist.businessProcess.stageKey).toBe("lead");
        expect(fromAll.businessProcess.stageKey).toBe(fromWaitlist.businessProcess.stageKey);
    });

    /**
     * THE DEFECT, STATED DIRECTLY.
     *
     * A placement candidate opened from the Waitlist work unit whose own process instance is still
     * at Lead must read Lead. Reading `waitlist` here is the bug whatever produced it — the lens
     * directly, or the family's rail standing in for the child.
     */
    it("reports Lead for a placement candidate opened from Waitlist but not yet waitlisted", () => {
        const ctx = contextFor({
            workUnitKey: "waitlist",
            familyStageKey: "waitlist",
            truth: childTruth({ stageKey: "lead" }),
        });
        expect(ctx.businessProcess.stageKey).toBe("lead");
        expect(ctx.businessProcess.stageKey).not.toBe("waitlist");
    });

    it("is NULL when the child has no stage — never the family's", () => {
        const ctx = contextFor({
            familyStageKey: "waitlist",
            truth: childTruth({ stageKey: null }),
        });
        expect(ctx.businessProcess.stageKey).toBeNull();
        expect(ctx.businessProcess.key).toBeNull();
    });

    it("takes its label from the configured stage, so the label cannot disagree with the key", () => {
        const ctx = contextFor({ truth: childTruth({ stageKey: "lead" }) });
        expect(ctx.businessProcess.label).toBe("New Lead");
    });

    it("still publishes the process and its configured rail — only the POSITION is the child's", () => {
        const ctx = contextFor({ truth: childTruth({ stageKey: "enrolling" }) });
        expect(ctx.businessProcess.name).toBe("Enrollment");
        expect(ctx.businessProcess.stages?.map((s) => s.key)).toEqual(RAIL_STAGES.map((s) => s.key));
    });
});

describe("mixed grain — the family's own stage is untouched", () => {
    it("a case subject still resolves from the family's rail", () => {
        const ctx = contextFor({ familyStageKey: "tour", truth: { id: "opp_1" } });
        expect(ctx.businessProcess.stageKey).toBe("tour");
    });

    it("a partially-identified child is NOT a stated child subject, and the case answers", () => {
        // No participation id → not a participation. The subject is still the case, so the case's
        // rail is the right authority and must not be suppressed.
        const ctx = contextFor({
            familyStageKey: "tour",
            truth: childTruth({ participationId: null, stageKey: "waitlist" }),
        });
        expect(ctx.businessProcess.stageKey).toBe("tour");
    });

    it("two children of one family resolve their own different stages", () => {
        const childA = contextFor({
            familyStageKey: "lead",
            truth: childTruth({ memberId: "cm_a", participationId: "pi_a", stageKey: "waitlist" }),
        });
        const childB = contextFor({
            familyStageKey: "lead",
            truth: childTruth({ memberId: "cm_b", participationId: "pi_b", stageKey: "tour" }),
        });
        expect(childA.businessProcess.stageKey).toBe("waitlist");
        expect(childB.businessProcess.stageKey).toBe("tour");
        // ...and neither of them moved the family.
        expect(contextFor({ familyStageKey: "lead", truth: { id: "opp_1" } }).businessProcess.stageKey).toBe("lead");
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

function settledModel(familyStageKey: string): FocusPanelWorkModeModel {
    const context: OperationalContext = {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Kurzman Family" },
        businessProcess: {
            key: familyStageKey,
            label: RAIL_STAGES.find((s) => s.key === familyStageKey)?.label ?? familyStageKey,
            stageKey: familyStageKey,
            stages: RAIL_STAGES,
            name: "Enrollment",
        },
        perspective: null,
        truth: { id: "opp-1" },
        stageWorkRuntime: null,
        publishedStageInputs: null,
        signals: {
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: {
                scheduledSendCount: 0,
                nextFollowUpAt: null,
                hasOutreach: false,
                nextScheduledSendId: null,
            },
            billing: NULL_BILLING_SIGNAL,
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    } as unknown as OperationalContext;
    return {
        source: "drawer_vm",
        phase: "settled",
        mode: "summary",
        subject: { id: "opp-1", type: "opportunity", label: "Kurzman Family" },
        context,
        cardModels: new Map(),
        cardReadiness: new Map(),
        commands: [],
        title: "Kurzman Family",
        statusLabel: null,
        canMutate: true,
        perspective: null,
    } as unknown as FocusPanelWorkModeModel;
}

function childCommit(args: {
    situationStageKey?: string | null;
    identityStageKey?: string | null;
}): FocusPanelCommitCriticalInput {
    return {
        subjectId: "cm_lennon",
        statusKey: null,
        subjectGrain: { grain: "child", subjectType: "child" },
        situation:
            args.situationStageKey ?
                { stageKey: args.situationStageKey, stageLabel: "Situation Label", purpose: null }
            :   null,
        stageWorkRuntime: null,
        publishedStageInputs: null,
        primaryAction: null,
        actionAbsence: null,
        subjectIdentityTruth: {
            "child.display_name": "Lennon Kurzman",
            "child.customer_member_id": "cm_lennon",
            "child.process_instance_id": "pi_lennon",
            ...(args.identityStageKey ? { "child.stage_key": args.identityStageKey } : {}),
        },
    } as unknown as FocusPanelCommitCriticalInput;
}

describe("the child mission overlay never lets the family answer for the child", () => {
    it("uses the child's composed situation when there is one", () => {
        const overlaid = overlayChildMissionOntoSettledFocusModel(
            settledModel("lead"),
            childCommit({ situationStageKey: "waitlist" }),
        );
        expect(overlaid.context.businessProcess.stageKey).toBe("waitlist");
    });

    /**
     * The seam that used to leak. With no `situation`, the overlay spread the SETTLED context —
     * the family's — into the child's Process card.
     */
    it("falls back to the child's OWN published stage, not the family's", () => {
        const overlaid = overlayChildMissionOntoSettledFocusModel(
            settledModel("waitlist"),
            childCommit({ situationStageKey: null, identityStageKey: "lead" }),
        );
        expect(overlaid.context.businessProcess.stageKey).toBe("lead");
        expect(overlaid.context.businessProcess.stageKey).not.toBe("waitlist");
        // The label follows the key through configuration rather than trailing the family's.
        expect(overlaid.context.businessProcess.label).toBe("New Lead");
    });

    it("resolves to NULL when the child has no stage from either route", () => {
        const overlaid = overlayChildMissionOntoSettledFocusModel(
            settledModel("waitlist"),
            childCommit({ situationStageKey: null, identityStageKey: null }),
        );
        expect(overlaid.context.businessProcess.stageKey).toBeNull();
        expect(overlaid.context.businessProcess.key).toBeNull();
    });

    it("keeps the configured rail and the process name — it changes the position, nothing else", () => {
        const overlaid = overlayChildMissionOntoSettledFocusModel(
            settledModel("waitlist"),
            childCommit({ situationStageKey: null, identityStageKey: "lead" }),
        );
        expect(overlaid.context.businessProcess.stages).toEqual(RAIL_STAGES);
        expect(overlaid.context.businessProcess.name).toBe("Enrollment");
    });

    it("scopes the participant to the same stage it reports — they cannot disagree", () => {
        const overlaid = overlayChildMissionOntoSettledFocusModel(
            settledModel("waitlist"),
            childCommit({ situationStageKey: null, identityStageKey: "lead" }),
        );
        expect(overlaid.context.participantScope?.stageKey).toBe("lead");
        expect(overlaid.context.participantScope?.stageKey).toBe(
            overlaid.context.businessProcess.stageKey,
        );
    });
});
