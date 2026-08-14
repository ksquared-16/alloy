/**
 * Reaction-chain coverage: Tour activity projection + Tour command booking alignment.
 */

import { describe, expect, it } from "vitest";

import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import {
    collapseTourActivityDuplicates,
    OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES,
} from "@/lib/admin/opportunityTourActivityEvents";
import {
    alignTourScheduleActionForBookingState,
    alignTourSupportingActionsForBookingState,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { planCurrentWorkActionExecution } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import {
    buildCurrentWorkActivityPreviewItems,
    resolveCanonicalCurrentWorkActivityEntries,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import {
    buildWhatsNextCardPresentation,
    buildWhatsNextContextFacts,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/buildWhatsNextCardPresentation";
import { resolveLayoutRuntimeActivityTimeline } from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";

function action(partial: Partial<CurrentWorkActionVM> & Pick<CurrentWorkActionVM, "key" | "label">): CurrentWorkActionVM {
    return {
        description: null,
        category: "supporting",
        placement: "current_work_supporting",
        handlerKey: partial.key,
        actionRef: partial.key,
        resolved: null,
        ...partial,
    };
}

describe("Tour activity projection", () => {
    it("includes tour event types in the related opportunity activity set", () => {
        expect(OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES).toContain("tour_invitation_activated");
        expect(OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES).toContain("tour_booked");
        expect(OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES).toContain("tour_confirmed");
        expect(OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES).toContain("tour_rescheduled");
        expect(OPPORTUNITY_RELATED_TOUR_ACTIVITY_EVENT_TYPES).toContain("tour_canceled");
    });

    it("formats tour invitation / scheduled with operator copy", () => {
        expect(
            formatOpportunityActivityTimelineEvent({
                event_type: "tour_invitation_activated",
                payload: {
                    opportunity_id: "opp-1",
                    channel: "email",
                    recipient_display_name: "Kelly Kurzman",
                },
            }),
        ).toMatchObject({
            title: "Tour invitation sent",
            detail: "Email to Kelly Kurzman",
        });

        const scheduled = formatOpportunityActivityTimelineEvent({
            event_type: "tour_confirmed",
            payload: {
                opportunity_id: "opp-1",
                start_at: "2026-08-14T16:00:00.000Z",
                timezone: "America/Los_Angeles",
            },
        });
        expect(scheduled.title).toBe("Tour scheduled");
        expect(scheduled.detail).toMatch(/Aug/);
        expect(scheduled.detail).toMatch(/9:00/);
    });

    it("formats generic communication as Message/Email sent — not a work template", () => {
        expect(
            formatOpportunityActivityTimelineEvent({
                event_type: "message_sent",
                payload: { channel: "email", recipient_display_name: "Kelly Kurzman" },
            }),
        ).toMatchObject({
            title: "Email sent",
            detail: "Email to Kelly Kurzman",
        });
        expect(
            formatOpportunityActivityTimelineEvent({
                event_type: "message_sent",
                payload: { channel: "sms" },
            }).title,
        ).toBe("SMS sent");
        expect(
            formatOpportunityActivityTimelineEvent({
                event_type: "action_executed",
                payload: { action_key: "contact_family" },
            }).title,
        ).toBe("Contact attempt");
        expect(
            formatOpportunityActivityTimelineEvent({
                event_type: "action_executed",
                payload: { action_key: "send_tour_invitation" },
            }).title,
        ).toBe("Tour invitation sent");
    });

    it("collapses tour invitation + message + Contact Family into one primary fact", () => {
        const rows = collapseTourActivityDuplicates([
            {
                event_type: "tour_invitation_activated",
                occurred_at: "2026-08-12T20:00:00Z",
                payload: { channel: "email" },
            },
            { event_type: "message_queued", occurred_at: "2026-08-12T20:00:01Z", payload: {} },
            { event_type: "message_sent", occurred_at: "2026-08-12T20:00:02Z", payload: { channel: "email" } },
            {
                event_type: "action_executed",
                occurred_at: "2026-08-12T20:00:03Z",
                payload: { action_key: "contact_family" },
            },
            {
                event_type: "action_executed",
                occurred_at: "2026-08-12T20:00:04Z",
                payload: { action_key: "send_tour_invitation" },
            },
            {
                event_type: "stage_work_outcome_recorded",
                occurred_at: "2026-08-12T20:00:05Z",
                payload: {
                    communication_trace: true,
                    outcome_label: "Left Message",
                },
            },
        ]);
        expect(rows.map((r) => r.event_type)).toEqual([
            "tour_invitation_activated",
            "stage_work_outcome_recorded",
        ]);
        expect(
            formatOpportunityActivityTimelineEvent({
                event_type: "stage_work_outcome_recorded",
                payload: { communication_trace: true, outcome_label: "Left Message" },
            }),
        ).toMatchObject({
            title: "Contact attempt recorded",
            detail: "Left Message",
        });
    });

    it("child-grain activity names the child; family stage move does not invent a child", () => {
        const child = formatOpportunityActivityTimelineEvent({
            event_type: "child_lifecycle_status_changed",
            payload: {
                previous_status_key: "lead",
                next_status_key: "waitlist",
                child_display_name: "Wrigley Kurzman",
                row_grain: "child",
            },
        });
        expect(child.title).toBe("Wrigley Kurzman moved to Waitlist");

        const family = formatOpportunityActivityTimelineEvent({
            event_type: "opportunity_status_changed",
            payload: {
                old_status_key: "lead",
                new_status_key: "tour",
            },
        });
        expect(family.title).toBe("Moved to Tour");
        expect(family.title).not.toMatch(/Wrigley|Lennon/i);
    });

    it("maps waitlisted status key to Waitlist with child identity", () => {
        const child = formatOpportunityActivityTimelineEvent({
            event_type: "child_lifecycle_status_changed",
            payload: {
                previous_status_key: null,
                next_status_key: "waitlisted",
                child_display_name: "Wrigley Kurzman",
            },
        });
        expect(child.title).toBe("Wrigley Kurzman moved to Waitlist");
    });

    it("initial New/lead entry uses Lead created — not bare New / Process progression as headline", () => {
        const lead = formatOpportunityActivityTimelineEvent({
            event_type: "opportunity_status_changed",
            payload: {
                previous_status_key: null,
                next_status_key: "new_inquiry",
            },
        });
        expect(lead.title).toBe("Lead created");
        expect(lead.detail).toBe("Process progression");
    });

    it("What's Next preview keeps title as headline (does not promote detail/work template)", () => {
        const record = {
            id: "opp-1",
            _activity_timeline_events: [
                {
                    id: "e1",
                    occurred_at: "2026-08-12T20:00:00Z",
                    event_type: "tour_invitation_activated",
                    payload: {
                        opportunity_id: "opp-1",
                        channel: "email",
                        recipient_display_name: "Kelly Kurzman",
                    },
                },
                {
                    id: "e2",
                    occurred_at: "2026-08-10T20:00:00Z",
                    event_type: "child_lifecycle_status_changed",
                    payload: {
                        previous_status_key: "lead",
                        next_status_key: "waitlist",
                        child_display_name: "Wrigley Kurzman",
                    },
                },
                {
                    id: "e3",
                    occurred_at: "2026-08-07T20:00:00Z",
                    event_type: "opportunity_status_changed",
                    payload: { next_status_key: "new_inquiry" },
                },
                {
                    id: "e4",
                    occurred_at: "2026-08-06T20:00:00Z",
                    event_type: "note_added",
                    payload: { summary: "Older note" },
                },
            ],
        };
        const focus = resolveLayoutRuntimeActivityTimeline({
            record,
            surfaceKey: "opportunity_drawer",
        });
        const whatsNext = resolveCanonicalCurrentWorkActivityEntries(record, { limit: 3 });
        expect(focus[0]?.title).toBe("Tour invitation sent");
        expect(whatsNext[0]?.label).toBe("Tour invitation sent");
        expect(whatsNext[0]?.detail).toBe("Email to Kelly Kurzman");
        expect(whatsNext).toHaveLength(3);
        expect(whatsNext.map((e) => e.label)).toEqual([
            "Tour invitation sent",
            "Wrigley Kurzman moved to Waitlist",
            "Lead created",
        ]);

        const preview = buildCurrentWorkActivityPreviewItems({
            activityItems: whatsNext,
            context: { truth: record, signals: { tour: { scheduled: false } } } as never,
            limit: 3,
        });
        expect(preview[0]?.label).toBe("Tour invitation sent");
        expect(preview[0]?.label).not.toBe("Contact Family");
        expect(preview[0]?.detail).toBe("Email to Kelly Kurzman");
        expect(preview).toHaveLength(3);

        // Same source feeds What's Next compact slice (3) — no work-template headline swap.
        const card = buildWhatsNextCardPresentation({
            surface: {
                description: null,
                operatorGuidance: null,
                title: "What's Next",
                runtime: null,
                checklist: [],
                primaryWorkItem: null,
                readiness: { requirements: { items: [] } },
            } as never,
            activityItems: preview,
        });
        expect(card.recentActivity).toHaveLength(3);
        expect(card.recentActivity[0]?.label).toBe("Tour invitation sent");
    });

    it("surfaces Tour scheduled in Recent Activity even when invitation rows are newer", () => {
        const record = {
            id: "opp-1",
            _activity_timeline_events: [
                {
                    id: "inv-3",
                    occurred_at: "2026-08-13T18:07:00Z",
                    event_type: "tour_invitation_activated",
                    payload: { opportunity_id: "opp-1", invitation_id: "i3", channel: "email" },
                },
                {
                    id: "inv-2",
                    occurred_at: "2026-08-13T18:04:00Z",
                    event_type: "tour_invitation_activated",
                    payload: { opportunity_id: "opp-1", invitation_id: "i2", channel: "email" },
                },
                {
                    id: "inv-1",
                    occurred_at: "2026-08-13T18:01:00Z",
                    event_type: "tour_invitation_activated",
                    payload: { opportunity_id: "opp-1", invitation_id: "i1", channel: "email" },
                },
                {
                    id: "book-1",
                    occurred_at: "2026-08-13T17:58:58Z",
                    event_type: "tour_confirmed",
                    payload: {
                        opportunity_id: "opp-1",
                        start_at: "2026-08-14T16:00:00.000Z",
                        timezone: "America/Los_Angeles",
                    },
                },
            ],
        };
        const whatsNext = resolveCanonicalCurrentWorkActivityEntries(record, {
            limit: 3,
            timeZone: "America/Los_Angeles",
        });
        expect(whatsNext.map((e) => e.label)).toContain("Tour scheduled");
        expect(whatsNext.some((e) => e.label === "Tour invitation sent")).toBe(true);
        // Local wall time — not raw UTC hour from the ISO string.
        const when = whatsNext.find((e) => e.label === "Tour invitation sent")?.at ?? "";
        expect(when).toMatch(/AM|PM/);
        expect(when).not.toMatch(/T18:/);
    });

    it("collapses near-duplicate tour_invitation_activated rows from the same invitation", () => {
        const rows = collapseTourActivityDuplicates([
            {
                event_type: "tour_invitation_activated",
                occurred_at: "2026-08-13T18:18:06Z",
                payload: { invitation_id: "inv-1", channel: "email" },
            },
            {
                event_type: "tour_invitation_activated",
                occurred_at: "2026-08-13T18:18:05Z",
                payload: { invitation_id: "inv-1", channel: "sms" },
            },
            {
                event_type: "tour_confirmed",
                occurred_at: "2026-08-13T17:58:00Z",
                payload: { start_at: "2026-08-14T16:00:00.000Z", timezone: "America/Los_Angeles" },
            },
        ]);
        expect(rows.filter((r) => r.event_type === "tour_invitation_activated")).toHaveLength(1);
        expect(rows.some((r) => r.event_type === "tour_confirmed")).toBe(true);
    });
});

describe("What's Next Tour context facts", () => {
    it("labels Scheduled Tour and never puts confirmed under Primary contact", () => {
        const facts = buildWhatsNextContextFacts({
            surface: {
                primaryWorkItem: null,
            } as never,
            context: {
                truth: {
                    _location_label: "North Campus",
                    "person.primary_contact_name": "Kelly Kurzman",
                },
                signals: {
                    tour: {
                        scheduled: true,
                        startAt: "2026-08-14T16:00:00.000Z",
                        statusLabel: "confirmed",
                    },
                } as never,
            },
            timeZone: "America/Los_Angeles",
        });
        expect(facts.find((f) => f.key === "scheduled_tour")).toMatchObject({
            label: "Scheduled Tour",
            value: expect.stringMatching(/Aug 14/),
        });
        expect(facts.find((f) => f.key === "scheduled_tour")?.value).toMatch(/·/);
        expect(facts.some((f) => f.key === "booking_status")).toBe(false);
        expect(facts.some((f) => /confirmed/i.test(f.value) && f.key === "primary_contact")).toBe(false);
        expect(facts.find((f) => f.key === "primary_contact")?.value).toBe("Kelly Kurzman");
    });
});

describe("Tour command booking alignment", () => {
    it("rewrites Schedule → Reschedule and injects Cancel when a booking exists", () => {
        const aligned = alignTourSupportingActionsForBookingState(
            [
                action({ key: "schedule_tour", label: "Schedule Tour" }),
                action({ key: "send_tour_invitation", label: "Send Tour Invitation" }),
            ],
            { scheduled: true, bookingId: "booking-1" },
        );
        const keys = aligned.map((a) => a.key);
        expect(keys).toContain("reschedule_tour");
        expect(keys).toContain("cancel_tour");
        expect(keys).not.toContain("schedule_tour");
        expect(aligned.find((a) => a.key === "cancel_tour")?.actionRef).toBe("booking-1");
        expect(aligned.find((a) => a.key === "reschedule_tour")?.label).toBe("Reschedule Tour");
    });

    it("keeps Schedule and removes Reschedule/Cancel when no booking exists", () => {
        const aligned = alignTourSupportingActionsForBookingState(
            [
                action({ key: "schedule_tour", label: "Schedule Tour" }),
                action({ key: "reschedule_tour", label: "Reschedule Tour" }),
                action({ key: "cancel_tour", label: "Cancel Tour", actionRef: "old" }),
            ],
            { scheduled: false, bookingId: null },
        );
        const keys = aligned.map((a) => a.key);
        expect(keys).toEqual(["schedule_tour"]);
    });

    it("alignTourScheduleActionForBookingState still rewrites a single schedule action", () => {
        const out = alignTourScheduleActionForBookingState(
            action({ key: "schedule_tour", label: "Schedule Tour" }),
            true,
        );
        expect(out.key).toBe("reschedule_tour");
        expect(out.label).toBe("Reschedule Tour");
    });

    it("plans cancel_tour against the booking id without a client-only synthetic host", () => {
        const plan = planCurrentWorkActionExecution(
            action({ key: "cancel_tour", label: "Cancel Tour", actionRef: "booking-9" }),
        );
        expect(plan).toEqual({ kind: "cancel_tour", bookingId: "booking-9" });
    });
});

describe("Child Settlement family opportunity locator", () => {
    it("seeds familyOpportunityId from queue drawer_open for child Attention", async () => {
        const { focusPanelSeedFromQueueRow } = await import(
            "@/lib/presentation/runtime/focusPanelSeedFromQueueRow"
        );
        const seed = focusPanelSeedFromQueueRow(
            {
                entityId: "pi-child-1",
                entityType: "opportunity",
                context: {
                    row_subject: { subject_type: "child", subject_id: "cm-1" },
                    drawer_open: { entity_type: "opportunities", entity_id: "opp-family-1" },
                    case_context: { case_id: "opp-family-1", display_name: "Kurzman Family" },
                    row_stage: "waitlist",
                },
                focus: { primary: { display_name: "Lennon Kurzman" } },
            } as never,
            null,
        );
        expect(seed?.familyOpportunityId).toBe("opp-family-1");
        expect(seed?.title).toMatch(/Lennon|Kurzman/i);
    });
});
