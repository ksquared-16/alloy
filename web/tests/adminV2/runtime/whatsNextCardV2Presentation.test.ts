/**
 * What's Next Card V2 — data-driven presentation scenario pressure tests.
 *
 * Proves the reusable model expresses Contact Family / Tour / Billing / Assignment /
 * Enrollment / Waitlist without hardcoding scenario names in the progress renderer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildWhatsNextCardPresentation } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildWhatsNextCardPresentation";
import {
    buildWhatsNextProgressPresentation,
    selectCompactProgressSequence,
    sequenceStepsFromAttemptPolicy,
    type WhatsNextSequenceStep,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/buildWhatsNextProgressPresentation";
import { resolveCurrentWorkActionButtons } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons";
import type {
    CurrentWorkActionVM,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { OperationalContextSignals } from "@/lib/adminV2/runtime/operationalContext/types";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

function action(key: string, label: string): CurrentWorkActionVM {
    return {
        key,
        label,
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: key,
        resolved: null,
        execution: { status: "executable", blockers: [] },
    };
}

function workItem(partial: Partial<StageWorkItemProjection> & Pick<StageWorkItemProjection, "template_key" | "label" | "state">): StageWorkItemProjection {
    return {
        role: "primary",
        requires_outcome_picker: false,
        work_id: null,
        due_at: null,
        due_urgency: "none",
        attempt_count: 0,
        last_outcome: null,
        completed_at: null,
        outcomes: [],
        completion_policy_summary: null,
        completion_policy_min_attempts: null,
        completion_policy_max_attempts: null,
        outcome_automation_preview: [],
        ...partial,
    };
}

function runtime(args: {
    stageKey?: string;
    primary: StageWorkItemProjection | null;
    additional?: StageWorkItemProjection[];
}): StageWorkRuntimeProjection {
    const items = [args.primary, ...(args.additional ?? [])].filter(Boolean) as StageWorkItemProjection[];
    return {
        stage_key: args.stageKey ?? "lead",
        stage_label: "Stage",
        purpose: null,
        journey_segment: "family",
        template_keys: items.map((i) => i.template_key),
        primary: args.primary,
        additional: args.additional ?? [],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: false,
        },
    };
}

function emptyReadiness(): CurrentWorkSurfaceVM["readiness"] {
    return { state: "in_progress", reasonCodes: [], reasonLabel: null };
}

function surfaceStub(partial: Partial<CurrentWorkSurfaceVM> & Pick<CurrentWorkSurfaceVM, "title">): CurrentWorkSurfaceVM {
    return {
        id: "cw-1",
        recordId: "opp-1",
        processKey: "enrollment",
        stageKey: "lead",
        workKey: "work",
        description: null,
        status: "in_progress",
        statusLabel: "Open",
        readiness: emptyReadiness(),
        progress: { completed: 0, total: 0, percent: 0 },
        checklist: [],
        supportingActions: [],
        alternatePaths: [],
        administrativeActions: [],
        communicationActions: [],
        bosRecommendations: [],
        showOutcomeCompletion: false,
        outcomeCompletionBlockReason: null,
        completionOutcomes: [],
        resolutions: [],
        primaryWorkItem: null,
        primaryProjection: null,
        runtime: null,
        isEmpty: false,
        ...partial,
    };
}

const NULL_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
    communications: {
        scheduledSendCount: 0,
        nextFollowUpAt: null,
        hasOutreach: false,
        nextScheduledSendId: null,
    },
    billing: {
        billingConfigured: false,
        billingContactName: null,
        billingContactEmail: null,
        tuitionRateLabel: null,
        feeBalanceCents: null,
    },
};

describe("What's Next Card V2 progress selection", () => {
    it("Mode B — attempt policy derives N attempts (not hardcoded 3)", () => {
        const item = workItem({
            template_key: "contact_family",
            label: "Contact Family",
            state: "open",
            attempt_count: 2,
            completion_policy_max_attempts: 5,
        });
        const steps = sequenceStepsFromAttemptPolicy(item);
        expect(steps).toHaveLength(5);
        expect(steps.map((s) => s.label)).toEqual([
            "Attempt 1",
            "Attempt 2",
            "Attempt 3",
            "Attempt 4",
            "Attempt 5",
        ]);
        expect(steps.filter((s) => s.state === "completed")).toHaveLength(2);
        expect(steps.find((s) => s.state === "current")?.label).toBe("Attempt 3");

        const progress = selectCompactProgressSequence(steps)!;
        expect(progress.mode).toBe("repeated");
        expect(progress.repeatedHeadline).toBe("2 of 5 attempts");
        expect(progress.collapsedEarlierLabel).toMatch(/earlier attempt/);
        expect(progress.items.map((i) => i.label)).toEqual(["Attempt 2", "Attempt 3", "Attempt 4"]);
    });

    it("Mode B — three configured attempts without hardcoding Contact Family", () => {
        const item = workItem({
            template_key: "outreach_cycle",
            label: "Outreach",
            state: "open",
            attempt_count: 2,
            completion_policy_max_attempts: 3,
        });
        const progress = buildWhatsNextProgressPresentation({
            runtime: runtime({ primary: item }),
            primaryWorkItem: item,
        })!;
        expect(progress.mode).toBe("repeated");
        expect(progress.repeatedHeadline).toBe("2 of 3 attempts");
        expect(progress.items.some((i) => i.role === "current" && i.label === "Attempt 3")).toBe(true);
    });

    it("Mode A — sequential milestones from distinct work templates", () => {
        const schedule = workItem({
            template_key: "schedule_tour",
            label: "Schedule Tour",
            state: "completed",
            role: "secondary",
            completed_at: "2026-08-06T18:20:00.000Z",
        });
        const confirm = workItem({
            template_key: "confirm_tour",
            label: "Confirm Tour",
            state: "open",
            description: "Confirm the tour with the family.",
        });
        const conduct = workItem({
            template_key: "conduct_tour",
            label: "Conduct Tour",
            state: "planned",
            role: "secondary",
            description: "Conduct the tour and collect feedback.",
        });
        // Configured sequence order: schedule → confirm → conduct
        const ordered = runtime({
            primary: { ...schedule, state: "completed" },
            additional: [
                { ...confirm, state: "open" },
                { ...conduct, state: "planned" },
            ],
        });
        const orderedProgress = buildWhatsNextProgressPresentation({ runtime: ordered })!;
        expect(orderedProgress.mode).toBe("sequential");
        expect(orderedProgress.items.map((i) => i.label)).toEqual([
            "Schedule Tour",
            "Confirm Tour",
            "Conduct Tour",
        ]);
        expect(orderedProgress.items.map((i) => i.role)).toEqual(["completed", "current", "upcoming"]);
        expect(orderedProgress.currentDetail).toContain("Confirm the tour");
    });

    it("collapses long sequential history", () => {
        const steps: WhatsNextSequenceStep[] = [
            { key: "1", label: "Step 1", state: "completed", templateKey: "s1" },
            { key: "2", label: "Step 2", state: "completed", templateKey: "s2" },
            { key: "3", label: "Step 3", state: "completed", templateKey: "s3" },
            { key: "4", label: "Step 4", state: "current", templateKey: "s4" },
            { key: "5", label: "Step 5", state: "upcoming", templateKey: "s5" },
        ];
        const progress = selectCompactProgressSequence(steps)!;
        expect(progress.items.map((i) => i.label)).toEqual(["Step 3", "Step 4", "Step 5"]);
        expect(progress.collapsedEarlierLabel).toBe("2 earlier steps completed");
    });

    it("terminal completion shows completion only", () => {
        const steps: WhatsNextSequenceStep[] = [
            { key: "1", label: "Done A", state: "completed", templateKey: "a" },
            { key: "2", label: "Done B", state: "completed", templateKey: "b" },
        ];
        const progress = selectCompactProgressSequence(steps)!;
        expect(progress.items).toHaveLength(1);
        expect(progress.items[0]?.label).toBe("Done B");
        expect(progress.items[0]?.role).toBe("completed");
    });
});

describe("What's Next Card V2 scenario presentations", () => {
    it("Scenario 1 — Contact Family / attempts + still needed + activity", () => {
        const primary = workItem({
            template_key: "contact_family",
            label: "Contact Family",
            state: "open",
            work_id: "w1",
            attempt_count: 2,
            completion_policy_max_attempts: 3,
            description: "Reach the family, understand their needs, and decide the next step.",
        });
        const surface = surfaceStub({
            title: "Contact Family",
            description: primary.description,
            workKey: "contact_family",
            primaryWorkItem: primary,
            runtime: runtime({ primary }),
            primaryAction: action("quick_message", "Contact Family"),
            supportingActions: [
                action("schedule_tour", "Schedule Tour"),
                action("add_child", "Add Child"),
            ],
            recordOutcomeAction: action("record_outcome", "Record outcome"),
            readiness: {
                state: "in_progress",
                reasonCodes: ["missing_program"],
                reasonLabel: "Program preference needed",
                requirements: {
                    complete: 0,
                    total: 1,
                    remaining: 1,
                    items: [
                        {
                            key: "program_preference",
                            label: "Program preference for Lennon and Wrigley",
                            status: "missing",
                        },
                    ],
                },
            },
        });
        const card = buildWhatsNextCardPresentation({
            surface,
            context: {
                truth: { "person.primary_contact_name": "Kelly Kurzman" },
                signals: NULL_SIGNALS,
                stageWorkRuntime: surface.runtime,
            },
            activityItems: [{ label: "SMS sent to Kelly Kurzman", occurredAt: "just now", kind: "sms" }],
        });
        expect(card.title).toBe("Contact Family");
        expect(card.summaryLine).toMatch(/Reach the family/);
        expect(card.summarySource).toBe("deterministic");
        expect(card.progress?.mode).toBe("repeated");
        expect(card.progress?.items.some((i) => i.label === "Attempt 3" && i.role === "current")).toBe(true);
        expect(card.stillNeeded.map((i) => i.label)).toEqual([
            "Program preference for Lennon and Wrigley",
        ]);
        expect(card.recentActivity).toHaveLength(1);
        expect(card.recentActivity[0]?.label).toContain("SMS sent");
        expect(card.contextFacts.some((f) => f.value === "Kelly Kurzman")).toBe(true);

        const buttons = resolveCurrentWorkActionButtons(surface);
        expect(buttons.dominant?.label).toBe("Contact Family");
        expect(buttons.helpful.map((a) => a.label)).toEqual(["Schedule Tour", "Add Child"]);
        expect(buttons.subordinateOutcome?.label).toBe("Record outcome");
    });

    it("Scenario 2 — Tour confirmation with scheduled context facts", () => {
        const schedule = workItem({
            template_key: "schedule_tour",
            label: "Schedule Tour",
            state: "completed",
            completed_at: "2026-08-06T18:20:00.000Z",
        });
        const confirm = workItem({
            template_key: "confirm_tour",
            label: "Confirm Tour",
            state: "open",
            description: "Confirm the tour with the family.",
        });
        const conduct = workItem({
            template_key: "conduct_tour",
            label: "Conduct Tour",
            state: "planned",
            description: "Conduct the tour and collect feedback.",
        });
        const rt = runtime({
            stageKey: "tour",
            primary: schedule,
            additional: [confirm, conduct],
        });
        // Ensure sequence order schedule → confirm → conduct with confirm current
        rt.primary = { ...schedule, state: "completed" };
        rt.additional = [
            { ...confirm, state: "open" },
            { ...conduct, state: "planned" },
        ];
        const surface = surfaceStub({
            title: "Tour",
            description: "Guide the family through a tour and confirm next steps.",
            stageKey: "tour",
            workKey: "confirm_tour",
            primaryWorkItem: confirm,
            runtime: rt,
            primaryAction: action("confirm_tour", "Confirm Tour"),
            supportingActions: [
                action("reschedule_tour", "Reschedule"),
                action("cancel_tour", "Cancel"),
                action("send_tour_invitation", "Send Invitation"),
            ],
            recordOutcomeAction: action("record_outcome", "Record outcome"),
        });
        const card = buildWhatsNextCardPresentation({
            surface,
            context: {
                truth: {},
                signals: {
                    ...NULL_SIGNALS,
                    tour: {
                        scheduled: true,
                        startAt: "2026-08-13T17:00:00.000Z",
                        statusLabel: "Invitation sent",
                        bookingId: "bk-1",
                    },
                },
                stageWorkRuntime: rt,
            },
            timeZone: "America/Los_Angeles",
        });
        expect(card.progress?.mode).toBe("sequential");
        expect(card.progress?.items.map((i) => i.label)).toEqual([
            "Schedule Tour",
            "Confirm Tour",
            "Conduct Tour",
        ]);
        expect(card.contextFacts.some((f) => /Aug 13/i.test(f.value))).toBe(true);
        expect(card.contextFacts.some((f) => f.value === "Invitation sent")).toBe(true);
        expect(resolveCurrentWorkActionButtons(surface).dominant?.label).toBe("Confirm Tour");
        expect(resolveCurrentWorkActionButtons(surface).helpful.map((a) => a.key)).toEqual([
            "reschedule_tour",
            "cancel_tour",
            "send_tour_invitation",
        ]);
    });

    it("Scenario 3 — Tour unscheduled: no fake date; no reschedule unless configured", () => {
        const schedule = workItem({
            template_key: "schedule_tour",
            label: "Schedule Tour",
            state: "open",
        });
        const confirm = workItem({
            template_key: "confirm_tour",
            label: "Confirm Tour",
            state: "planned",
            role: "secondary",
        });
        const rt = runtime({ primary: schedule, additional: [confirm] });
        const surface = surfaceStub({
            title: "Tour",
            description: "Schedule a visit with the family.",
            primaryWorkItem: schedule,
            runtime: rt,
            primaryAction: action("schedule_tour", "Schedule Tour"),
            supportingActions: [action("quick_message", "Quick message")],
        });
        const card = buildWhatsNextCardPresentation({
            surface,
            context: {
                truth: {},
                signals: NULL_SIGNALS,
                stageWorkRuntime: rt,
            },
        });
        expect(resolveCurrentWorkActionButtons(surface).dominant?.label).toBe("Schedule Tour");
        expect(card.contextFacts.some((f) => f.key === "scheduled_at")).toBe(false);
        expect(resolveCurrentWorkActionButtons(surface).helpful.map((a) => a.key)).not.toContain(
            "reschedule_tour",
        );
        expect(resolveCurrentWorkActionButtons(surface).helpful.map((a) => a.key)).not.toContain(
            "cancel_tour",
        );
    });

    it("Scenario 4 — Billing sequential + amount context", () => {
        const invoice = workItem({
            template_key: "invoice_sent",
            label: "Invoice sent",
            state: "completed",
        });
        const receive = workItem({
            template_key: "receive_payment",
            label: "Receive payment",
            state: "open",
            description: "Payment completes enrollment activation.",
        });
        const active = workItem({
            template_key: "enrollment_active",
            label: "Enrollment Active",
            state: "planned",
            description: "Once payment is received, enrollment becomes active.",
        });
        const rt = runtime({
            primary: invoice,
            additional: [receive, active],
        });
        rt.primary = { ...invoice, state: "completed" };
        rt.additional = [
            { ...receive, state: "open" },
            { ...active, state: "planned" },
        ];
        const surface = surfaceStub({
            title: "Billing",
            description: "Collect first payment to activate enrollment.",
            primaryWorkItem: receive,
            runtime: rt,
            primaryAction: action("record_payment", "Record Payment"),
            supportingActions: [
                action("resend_invoice", "Resend Invoice"),
                action("update_payment_info", "Update Payment Info"),
            ],
        });
        const card = buildWhatsNextCardPresentation({
            surface,
            context: {
                truth: {},
                signals: {
                    ...NULL_SIGNALS,
                    billing: {
                        ...NULL_SIGNALS.billing,
                        feeBalanceCents: 125000,
                    },
                },
                stageWorkRuntime: rt,
            },
        });
        expect(card.progress?.items.map((i) => i.label)).toEqual([
            "Invoice sent",
            "Receive payment",
            "Enrollment Active",
        ]);
        expect(card.contextFacts.some((f) => f.value.includes("1,250"))).toBe(true);
        expect(card.stillNeeded).toEqual([]);
        expect(resolveCurrentWorkActionButtons(surface).dominant?.label).toBe("Record Payment");
    });

    it("Scenario 5 — Assignment with room still needed", () => {
        const prefs = workItem({
            template_key: "collect_preferences",
            label: "Collect Preferences",
            state: "completed",
        });
        const assign = workItem({
            template_key: "make_assignment",
            label: "Make Assignment",
            state: "open",
            description: "Assign classroom and schedule.",
        });
        const start = workItem({
            template_key: "confirm_start",
            label: "Confirm Start",
            state: "planned",
        });
        const rt = runtime({ primary: prefs, additional: [assign, start] });
        rt.primary = { ...prefs, state: "completed" };
        rt.additional = [
            { ...assign, state: "open" },
            { ...start, state: "planned" },
        ];
        const surface = surfaceStub({
            title: "Assignment",
            description: "Place children in their classroom and complete start details.",
            primaryWorkItem: assign,
            runtime: rt,
            primaryAction: action("make_assignment", "Make Assignment"),
            readiness: {
                state: "blocked",
                reasonCodes: ["room"],
                reasonLabel: null,
                requirements: {
                    complete: 0,
                    total: 2,
                    remaining: 2,
                    items: [
                        { key: "room_lennon", label: "Classroom assignment for Lennon", status: "missing" },
                        { key: "room_wrigley", label: "Classroom assignment for Wrigley", status: "missing" },
                    ],
                },
            },
        });
        const card = buildWhatsNextCardPresentation({
            surface,
            context: { truth: {}, signals: NULL_SIGNALS, stageWorkRuntime: rt },
        });
        expect(card.progress?.items.map((i) => i.label)).toEqual([
            "Collect Preferences",
            "Make Assignment",
            "Confirm Start",
        ]);
        expect(card.stillNeeded).toHaveLength(2);
        expect(resolveCurrentWorkActionButtons(surface).dominant?.label).toBe("Make Assignment");
    });

    it("Scenario 6 — Enrollment paperwork", () => {
        const forms = workItem({
            template_key: "submit_forms",
            label: "Submit Forms",
            state: "completed",
        });
        const docs = workItem({
            template_key: "upload_documents",
            label: "Upload Documents",
            state: "open",
            description: "Upload remaining documents.",
        });
        const finalize = workItem({
            template_key: "finalize_enrollment",
            label: "Finalize Enrollment",
            state: "planned",
        });
        const rt = runtime({ primary: forms, additional: [docs, finalize] });
        rt.primary = { ...forms, state: "completed" };
        rt.additional = [
            { ...docs, state: "open" },
            { ...finalize, state: "planned" },
        ];
        const surface = surfaceStub({
            title: "Enrollment",
            description: "Complete paperwork and required documents.",
            primaryWorkItem: docs,
            runtime: rt,
            primaryAction: action("upload_document", "Upload Document"),
            readiness: {
                state: "in_progress",
                reasonCodes: [],
                reasonLabel: null,
                requirements: {
                    complete: 0,
                    total: 2,
                    remaining: 2,
                    items: [
                        { key: "birth", label: "Proof of Birth", status: "missing", targetLabel: "Wrigley" },
                        {
                            key: "imm",
                            label: "Immunization Record",
                            status: "missing",
                            targetLabel: "Wrigley",
                        },
                    ],
                },
            },
        });
        const card = buildWhatsNextCardPresentation({
            surface,
            context: { truth: {}, signals: NULL_SIGNALS, stageWorkRuntime: rt },
        });
        expect(card.progress?.items.map((i) => i.label)).toEqual([
            "Submit Forms",
            "Upload Documents",
            "Finalize Enrollment",
        ]);
        expect(card.stillNeeded.map((i) => i.label)).toEqual([
            "Proof of Birth (Wrigley)",
            "Immunization Record (Wrigley)",
        ]);
        expect(resolveCurrentWorkActionButtons(surface).dominant?.label).toBe("Upload Document");
    });

    it("Scenario 7 — Waitlist with no due date", () => {
        const added = workItem({
            template_key: "added_waitlist",
            label: "Added to Waitlist",
            state: "completed",
        });
        const confirm = workItem({
            template_key: "confirm_interest",
            label: "Confirm Interest",
            state: "open",
            description: "Let us know you’d like to remain on the waitlist.",
            due_at: null,
        });
        const offer = workItem({
            template_key: "offer_enroll",
            label: "Offer & Enrollment",
            state: "planned",
        });
        const rt = runtime({ primary: added, additional: [confirm, offer] });
        rt.primary = { ...added, state: "completed" };
        rt.additional = [
            { ...confirm, state: "open" },
            { ...offer, state: "planned" },
        ];
        const surface = surfaceStub({
            title: "Waitlist",
            description: "Hold your spot and confirm when a space opens.",
            primaryWorkItem: confirm,
            runtime: rt,
            primaryAction: action("confirm_interest", "Confirm Interest"),
        });
        const card = buildWhatsNextCardPresentation({
            surface,
            context: { truth: {}, signals: NULL_SIGNALS, stageWorkRuntime: rt },
        });
        expect(card.dueChip).toBeNull();
        expect(card.progress?.items.map((i) => i.label)).toEqual([
            "Added to Waitlist",
            "Confirm Interest",
            "Offer & Enrollment",
        ]);
        expect(resolveCurrentWorkActionButtons(surface).dominant?.label).toBe("Confirm Interest");
    });

    it("omits Still Needed when empty; caps recent activity at 2; BOS summary seam", () => {
        const surface = surfaceStub({
            title: "Work",
            description: "Deterministic purpose.",
            primaryAction: action("do_it", "Do it"),
        });
        const deterministic = buildWhatsNextCardPresentation({
            surface,
            activityItems: [
                { label: "One", occurredAt: "a" },
                { label: "Two", occurredAt: "b" },
                { label: "Three", occurredAt: "c" },
            ],
        });
        expect(deterministic.stillNeeded).toEqual([]);
        expect(deterministic.recentActivity.map((i) => i.label)).toEqual(["One", "Two"]);
        expect(deterministic.summarySource).toBe("deterministic");

        const contextual = buildWhatsNextCardPresentation({
            surface,
            contextualSummary: "Family is waiting on a callback about tuition.",
        });
        expect(contextual.summarySource).toBe("contextual");
        expect(contextual.summaryLine).toContain("tuition");
    });

    it("never renders outcomes inline on the presentation DTO", () => {
        const surface = surfaceStub({
            title: "Contact Family",
            completionOutcomes: [
                {
                    outcome_key: "reached_family",
                    label: "Reached Family",
                    successful: true,
                },
            ],
            recordOutcomeAction: action("record_outcome", "Record outcome"),
            primaryAction: action("contact_family", "Contact Family"),
        });
        const card = buildWhatsNextCardPresentation({ surface });
        expect(JSON.stringify(card)).not.toContain("reached_family");
        expect(JSON.stringify(card)).not.toContain("Reached Family");
        expect(resolveCurrentWorkActionButtons(surface).subordinateOutcome?.label).toBe("Record outcome");
    });
});

describe("What's Next Card V2 composition discipline", () => {
    it("summary card wires presentation builder without domain title/stage branches", () => {
        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("buildWhatsNextCardPresentation");
        expect(card).toContain("CurrentWorkProgressSummary");
        expect(card).toContain('data-whats-next-card="v2"');
        expect(card).not.toMatch(/workTitle\s*===\s*["']Contact Family["']/);
        expect(card).not.toMatch(/stage(?:Key)?\s*===\s*["']tour["']/);

        const progressUi = read("components/admin/focusPanel/cards/CurrentWorkProgressSummary.tsx");
        expect(progressUi).not.toMatch(/Contact Family|Tour|Billing|Waitlist/);
        expect(progressUi).toContain('data-work-progress-mode="sequential"');
        expect(progressUi).toContain('data-work-progress-mode="repeated"');
    });
});
