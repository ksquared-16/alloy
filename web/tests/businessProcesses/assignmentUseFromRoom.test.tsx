/** @vitest-environment jsdom */

/**
 * Assignment UX convergence — Add Assignment opens the EXISTING Assignment card directly, and the
 * use is read from the room's configured Space Uses inside it.
 *
 * Rendered through the EXISTING durable contextual card with a projection from the canonical pure
 * builder, as the S4 and D8 suites are. Nothing about the card is mocked; fetch is recorded.
 */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
        operational_assignment_type_id: "type-lead",
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
const input = (r: ScheduleAssignmentRow, roomId: string, roomName: string, type: { id: string; label: string }): AssignmentInput => ({
    row: r,
    weekdays: [1, 2, 3, 4, 5],
    patternResolved: true,
    patternLabel: "Full Time",
    arriveTime: "08:00",
    departTime: "16:00",
    room: { id: roomId, name: roomName, program: null },
    assignmentType: { id: type.id, key: type.id, label: type.label, iconKey: null, visualTone: null, billingParticipation: null, attendanceParticipation: null, staffingParticipation: "supply" },
});

const LEAD = { id: "type-lead", label: "Lead Teacher" };
const PREP = { id: "type-prep", label: "Prep Time" };
const BUS = { id: "type-bus", label: "Bus Duty", behavior: { roomRequirement: "not_used" } };

const rooms = [
    // One use — resolves.
    { roomId: "room-sun", roomName: "Sunshine", unitRole: "operational_group", spaceUses: ["type-lead"], active: true, programCategoryId: null, supportedProgramCategoryIds: null, containingSpaceLocationId: null },
    // Two uses — the operator chooses.
    { roomId: "room-two", roomName: "Two Use Room", unitRole: "operational_group", spaceUses: ["type-prep", "type-lead"], active: true, programCategoryId: null, supportedProgramCategoryIds: null, containingSpaceLocationId: null },
    // No staff use is possible here — a shared space, and an explicit empty list.
    { roomId: "room-gym", roomName: "Gym", unitRole: "shared_space", spaceUses: ["type-lead"], active: true, programCategoryId: null, supportedProgramCategoryIds: null, containingSpaceLocationId: null },
    { roomId: "room-none", roomName: "Storage Class", unitRole: "operational_group", spaceUses: [], active: true, programCategoryId: null, supportedProgramCategoryIds: null, containingSpaceLocationId: null },
];

const projection = buildChildScheduling({
    subject: { id: PERSON, name: "Jane Doe", program: null, ageGroup: null, siteId: SITE, siteName: "Riverside" },
    agreementStatus: null,
    asOf: ASOF,
    assignments: [
        input(row("sa-1", { is_primary: true, start_date: "2026-08-01", room_location_id: "room-sun" }), "room-sun", "Sunshine", LEAD),
        input(row("sa-3", { room_location_id: "room-two", operational_assignment_type_id: "type-prep" }), "room-two", "Two Use Room", PREP),
    ],
});
const schedulingProjection = {
    byMemberId: { [PERSON]: projection },
    operatingDays: [1, 2, 3, 4, 5],
    patterns: [{ id: "pat-1", label: "Full week", weekdays: [1, 2, 3, 4, 5], scheduleTypeKey: "full_time", defaultHours: null, defaultOpenEnded: true }],
    assignmentTypes: [LEAD, PREP, BUS],
    operationalRooms: rooms,
} as never;
const option = { key: "schedule", kind: "schedule", label: "Assignment", surface: "canonical_operational", siteLocationId: SITE } as unknown as DurableRecordContextOption;
const person = { personId: PERSON, label: "Jane Doe", truth: {}, imageUrl: null } as unknown as DurablePersonSubject;

let container: HTMLElement | null = null;
let root: Root | null = null;
const requests: Array<{ method: string; url: string; body: unknown }> = [];
function render(): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<DurableRecordContextualCard option={option} subject={{ kind: "staff", person }} schedulingProjection={schedulingProjection} />));
    return container;
}
const click = (el: Element | null | undefined) => {
    expect(el, "control to click").toBeTruthy();
    act(() => (el as HTMLElement).click());
};
const byText = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) ?? null;
const useState = (el: HTMLElement) => el.querySelector("[data-assignment-use]")?.getAttribute("data-assignment-use") ?? null;
const commit = (el: HTMLElement) => el.querySelector<HTMLButtonElement>("[data-schedule-commit='true']");
const pickRoom = async (el: HTMLElement, roomId: string) => {
    click(el.querySelector("[data-room-change='true']"));
    await act(async () => {});
    click(el.querySelector(`[data-room-option='${roomId}']`));
};
const chooseUse = (el: HTMLElement, testId: string, value: string) => {
    click(el.querySelector(`[data-testid='${testId}']`));
    click(document.querySelector(`[data-option-value='${value}']`));
};
const setDate = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
};
const writes = () => requests.filter((r) => r.method !== "GET");

beforeEach(() => {
    requests.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
        requests.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ ok: true, options: [] }), { status: 200 });
    }));
});
afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

describe("Add Assignment opens the card directly", () => {
    it("no category step: the editor is open with the room, days, hours and dates — and nothing is written", () => {
        const el = render();
        click(el.querySelector("[data-schedule-create-new='true']"));
        expect(el.querySelector("[data-assignment-type-picker]")).toBeNull();
        expect(el.textContent).not.toContain("What category of assignment is this?");
        expect(el.querySelector("[data-schedule-editor='true']")).not.toBeNull();
        expect(el.querySelector("[data-room-change='true']")).not.toBeNull();
        expect(el.querySelector("[data-day='1']")).not.toBeNull();
        expect(el.querySelector("input[type='date']")).not.toBeNull();
        expect(useState(el)).toBe("awaiting-room");
        expect(commit(el)?.disabled).toBe(true);
        expect(writes()).toEqual([]);
    });
});

describe("the use is read from the room", () => {
    it("a room with exactly one eligible use resolves it, shown — not asked", async () => {
        const el = render();
        click(el.querySelector("[data-schedule-create-new='true']"));
        await pickRoom(el, "room-sun");
        expect(useState(el)).toBe("resolved");
        expect(el.querySelector("[data-assignment-use-id]")?.getAttribute("data-assignment-use-id")).toBe("type-lead");
        expect(el.textContent).toContain("Use · Lead Teacher");
    });

    it("several eligible uses require an explicit choice — nothing is preselected — and a room change drops a choice the new room does not take", async () => {
        const el = render();
        click(el.querySelector("[data-schedule-create-new='true']"));
        await pickRoom(el, "room-two");
        expect(useState(el)).toBe("choose");
        const trigger = el.querySelector("[data-testid='assignment-use-select']");
        expect(trigger?.textContent).toContain("Choose a use");
        chooseUse(el, "assignment-use-select", "type-prep");
        expect(el.querySelector("[data-testid='assignment-use-select']")?.textContent).toContain("Prep Time");
        // Sunshine takes only Lead Teacher: the Prep choice cannot ride along.
        await pickRoom(el, "room-sun");
        expect(useState(el)).toBe("resolved");
        expect(el.querySelector("[data-assignment-use-id]")?.getAttribute("data-assignment-use-id")).toBe("type-lead");
        // And back: the earlier choice is not silently restored as a default.
        await pickRoom(el, "room-two");
        expect(el.querySelector("[data-testid='assignment-use-select']")?.textContent).toContain("Choose a use");
    });

    it("spaces that take no use for this subject are not offered, and the picker says why", async () => {
        const el = render();
        click(el.querySelector("[data-schedule-create-new='true']"));
        click(el.querySelector("[data-room-change='true']"));
        await act(async () => {});
        expect(el.querySelector("[data-room-option='room-gym']")).toBeNull();
        expect(el.querySelector("[data-room-option='room-none']")).toBeNull();
        expect(el.querySelector("[data-room-option='room-sun']")).not.toBeNull();
        expect(el.querySelector("[data-room-unavailable-id='room-gym']")?.getAttribute("data-room-unavailable-reason")).toBe("staff_room_must_be_classroom");
        expect(el.querySelector("[data-room-unavailable-id='room-none']")?.getAttribute("data-room-unavailable-reason")).toBe("no_use_for_space");
    });

    it("saves the resolved use through assignment.create — the category the room resolved, not a guessed one", async () => {
        const el = render();
        click(el.querySelector("[data-schedule-create-new='true']"));
        await pickRoom(el, "room-two");
        chooseUse(el, "assignment-use-select", "type-prep");
        for (const d of [1, 2, 3, 4, 5]) click(el.querySelector(`[data-day='${d}']`));
        setDate(el.querySelector<HTMLInputElement>("input[type='date']")!, "2026-11-02");
        expect(commit(el)?.disabled).toBe(false);
        await act(async () => {
            commit(el)!.click();
            for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
        });
        const create = writes().find((r) => (r.body as { action_key?: string } | null)?.action_key === "assignment.create");
        expect(create, "assignment.create was executed").toBeTruthy();
        const payload = (create!.body as { payload: Record<string, unknown> }).payload;
        expect(payload.assignment_type_id).toBe("type-prep");
        expect(payload.room_location_id).toBe("room-two");
        expect(payload.is_primary).toBe(false);
        // A secondary never touches tuition.
        expect(writes().some((r) => String((r.body as { action_key?: string } | null)?.action_key ?? "").startsWith("enrollment.pricing"))).toBe(false);
    });

    it("a category that uses no space is its own explicit path, and writes no room", async () => {
        const el = render();
        click(el.querySelector("[data-schedule-create-new='true']"));
        click(el.querySelector("[data-assignment-use-spaceless-toggle='on']"));
        expect(useState(el)).toBe("spaceless");
        chooseUse(el, "assignment-use-spaceless-select", "type-bus");
        expect(el.textContent).toContain("Use — no space");
        for (const d of [1, 2, 3, 4, 5]) click(el.querySelector(`[data-day='${d}']`));
        setDate(el.querySelector<HTMLInputElement>("input[type='date']")!, "2026-11-02");
        await act(async () => {
            commit(el)!.click();
            for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
        });
        const create = writes().find((r) => (r.body as { action_key?: string } | null)?.action_key === "assignment.create");
        const payload = (create!.body as { payload: Record<string, unknown> }).payload;
        expect(payload.assignment_type_id).toBe("type-bus");
        expect(payload.room_location_id ?? null).toBeNull();
    });
});

describe("editing an existing assignment keeps its established category", () => {
    it("opens the editor with the row's category fixed — no use resolution, no category step", () => {
        const el = render();
        click(el.querySelector("[data-assignment-row='sa-3']"));
        click(byText(el, "Edit Assignment"));
        expect(el.querySelector("[data-schedule-editor='true']")).not.toBeNull();
        expect(el.querySelector("[data-assignment-type-picker]")).toBeNull();
        expect(el.querySelector("[data-assignment-use]")).toBeNull();
        expect(el.textContent).toContain("Prep Time");
        expect(writes()).toEqual([]);
    });
});

import { durableChildCollectionRow, type DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import { DURABLE_CHILD_ROWS_KEY } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";

describe("a child with a primary: Add Assignment is a secondary whose use comes from the room — and tuition stays the primary's", () => {
    const KID = "kid-ava";
    const childRooms = [
        { roomId: "room-bc", roomName: "Cafeteria", unitRole: "shared_space", spaceUses: ["type-bc"], active: true, programCategoryId: null, supportedProgramCategoryIds: null, containingSpaceLocationId: null },
        { roomId: "room-home", roomName: "Toddler A", unitRole: "operational_group", spaceUses: null, active: true, programCategoryId: null, supportedProgramCategoryIds: null, containingSpaceLocationId: null },
    ];
    const kidProjection = buildChildScheduling({
        subject: { id: KID, name: "Ava Kid", program: null, ageGroup: null, siteId: SITE, siteName: "Riverside" },
        agreementStatus: "active",
        asOf: ASOF,
        assignments: [
            input(
                row("ka-1", { subject_type: "child", customer_member_id: KID, subject_person_id: null, is_primary: true, operational_assignment_type_id: null, room_location_id: "room-home" }),
                "room-home",
                "Toddler A",
                { id: "", label: "" },
            ),
        ],
    });
    const kidSchedulingProjection = {
        byMemberId: { [KID]: kidProjection },
        operatingDays: [1, 2, 3, 4, 5],
        patterns: [{ id: "pat-1", label: "Full week", weekdays: [1, 2, 3, 4, 5], scheduleTypeKey: "full_time", defaultHours: null, defaultOpenEnded: true }],
        assignmentTypes: [{ id: "type-bc", label: "Before Care" }, { id: "type-enr", label: "Enrichment" }],
        operationalRooms: childRooms,
    } as never;
    const kid = () => {
        const subject = { memberId: KID, personId: null, householdId: "hh-1", label: "Ava Kid", dateOfBirth: "2022-03-14", householdName: "Kid household", truth: {} } as unknown as DurableChildSubject;
        (subject as { truth: Record<string, unknown> }).truth = { [DURABLE_CHILD_ROWS_KEY]: [durableChildCollectionRow(subject)] };
        return subject;
    };
    const renderKid = () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root!.render(<DurableRecordContextualCard option={option} subject={{ kind: "child", child: kid() }} schedulingProjection={kidSchedulingProjection} />));
        return container;
    };

    it("opens directly, resolves Before Care from the space configured for it, and offers no tuition control", async () => {
        const el = renderKid();
        click(el.querySelector("[data-schedule-create-new='true']"));
        expect(el.querySelector("[data-schedule-editor='true']")).not.toBeNull();
        expect(useState(el)).toBe("awaiting-room");
        await pickRoom(el, "room-bc");
        expect(el.querySelector("[data-assignment-use-id]")?.getAttribute("data-assignment-use-id")).toBe("type-bc");
        // The child's tuition is priced by the primary; a secondary shows no rate control.
        expect(el.querySelector("[data-assignment-tuition-embed]")).toBeNull();
    });

    it("COMPAT-1: an unconfigured classroom offers every child use as an explicit choice, labelled as unconfigured", async () => {
        const el = renderKid();
        click(el.querySelector("[data-schedule-create-new='true']"));
        await pickRoom(el, "room-home");
        expect(useState(el)).toBe("choose");
        expect(el.textContent).toContain("this space's uses are not configured");
        expect(el.querySelector("[data-testid='assignment-use-select']")?.textContent).toContain("Choose a use");
        expect(commit(el)?.disabled).toBe(true);
        expect(writes()).toEqual([]);
    });
});
