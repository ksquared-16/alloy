/** @vitest-environment jsdom */

/**
 * BP V2 Slice 4 — the EXISTING Scheduling card, rendered through the EXISTING durable contextual card,
 * lands on the assignment a Work View row named. The projection is built by the canonical pure builder;
 * nothing about the card is mocked. Without a source the card behaves exactly as before.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import DurableRecordContextualCard from "@/components/presentation/durableRecord/DurableRecordContextualCard";
import { buildChildScheduling, type AssignmentInput } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import type { DurableRecordContextOption } from "@/lib/context/durableRecordContextOptions";
import type { DurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PERSON = "person-jane";
const SITE = "site-r";
const ASOF = "2026-10-20";

function row(id: string, over: Partial<ScheduleAssignmentRow> = {}): ScheduleAssignmentRow {
    return {
        id,
        org_id: "org-1",
        subject_type: "staff",
        enrollment_agreement_id: null,
        schedule_pattern_id: "pat-1",
        customer_member_id: null,
        subject_person_id: PERSON,
        site_location_id: SITE,
        room_location_id: null,
        program_category_id: null,
        operational_assignment_type_id: "type-1",
        is_primary: false,
        start_date: "2026-09-01",
        end_date: null,
        status: "active",
        assignment_kind: "base",
        source_key: "operator",
        supersedes_assignment_id: null,
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
        ...over,
    } as ScheduleAssignmentRow;
}
const input = (r: ScheduleAssignmentRow, room: string): AssignmentInput => ({
    row: r,
    weekdays: [1, 2, 3, 4, 5],
    patternResolved: true,
    patternLabel: "Full Time",
    arriveTime: "08:00",
    departTime: "16:00",
    room: { id: `room-${room}`, name: room, program: null },
    assignmentType: { id: "type-1", key: "classroom", label: "Classroom", iconKey: null, visualTone: null, billingParticipation: null, attendanceParticipation: null, staffingParticipation: "supply" },
});

const projection = buildChildScheduling({
    subject: { id: PERSON, name: "Jane Doe", program: null, ageGroup: null, siteId: SITE, siteName: "Riverside" },
    agreementStatus: null,
    asOf: ASOF,
    assignments: [
        input(row("sa-1", { is_primary: true, start_date: "2026-08-01" }), "Sunshine"),
        input(row("sa-2", { end_date: "2026-10-29" }), "Rainbow"),
        input(row("sa-3"), "Meadow"),
        input(row("sa-up", { start_date: "2026-10-30", status: "planned" }), "Orchard"),
    ],
});
const schedulingProjection = { byMemberId: { [PERSON]: projection }, operatingDays: [1, 2, 3, 4, 5] } as never;
const option = { key: "schedule", kind: "schedule", label: "Assignment", surface: "canonical_operational", siteLocationId: SITE } as unknown as DurableRecordContextOption;
const person = { personId: PERSON, label: "Jane Doe", truth: {}, imageUrl: null } as unknown as DurablePersonSubject;

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}
beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
});
afterEach(() => {
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
});
const card = (focusSource: { kind: string; id: string; reason: string | null } | null) => (
    <DurableRecordContextualCard option={option} subject={{ kind: "staff", person }} schedulingProjection={schedulingProjection} focusSource={focusSource} />
);

describe("the existing Scheduling card lands on the Work View row's source", () => {
    it("the projection really holds three current assignments and one upcoming (precondition)", () => {
        expect(projection.current?.assignments.map((a) => a.id).sort()).toEqual(["sa-1", "sa-2", "sa-3"]);
        expect(projection.upcoming.flatMap((v) => v.assignments.map((a) => a.id))).toEqual(["sa-up"]);
    });

    it("a current assignment among siblings opens THAT assignment's detail (not the first or the primary)", () => {
        const el = render(card({ kind: "schedule_assignment", id: "sa-2", reason: "Ends Oct 29 · in 9 days" }));
        const detail = el.querySelector("[data-assignment-surface='detail']");
        expect(detail?.getAttribute("data-assignment-detail-id")).toBe("sa-2");
        expect(detail?.getAttribute("data-scheduling-focus")).toBe("assignment");
        expect(el.querySelector("[data-scheduling-focus-notice]")).toBeNull();
    });

    it("a FUTURE assignment (not in the card's current list) opens its own detail", () => {
        const el = render(card({ kind: "schedule_assignment", id: "sa-up", reason: "Primary change starts Oct 30" }));
        expect(el.querySelector("[data-assignment-surface='detail']")?.getAttribute("data-assignment-detail-id")).toBe("sa-up");
    });

    it("a stale source is SAID; the card shows its current list and selects nothing", () => {
        const el = render(card({ kind: "schedule_assignment", id: "sa-gone", reason: null }));
        expect(el.querySelector("[data-assignment-surface='detail']")).toBeNull();
        expect(el.querySelector("[data-assignment-list-surface]")).not.toBeNull();
        expect(el.querySelector("[data-scheduling-focus-notice]")?.getAttribute("data-scheduling-focus-notice")).toBe("assignment_gone");
    });

    it("no source: the card behaves exactly as before (list, no notice, no selection)", () => {
        const el = render(card(null));
        expect(el.querySelector("[data-assignment-surface='detail']")).toBeNull();
        expect(el.querySelector("[data-assignment-list-surface]")?.getAttribute("data-scheduling-focus")).toBe("none");
        expect(el.querySelector("[data-scheduling-focus-notice]")).toBeNull();
    });
});
