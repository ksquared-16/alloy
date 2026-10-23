/** @vitest-environment jsdom */

/**
 * BP V2 D8 — opening a record is passive; the Create Assignment editor opens only when asked.
 *
 * Hosted QA: opening a closed/lost one-child family launched the Create Assignment editor without a click.
 * The Scheduling card opens a single subject directly, and its work surface used to start in `create`
 * whenever that subject had no assignment. Rendered here through the EXISTING durable contextual card and the
 * canonical projection builder — the same path as the S4 suite — with every request's method recorded.
 */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import DurableRecordContextualCard from "@/components/presentation/durableRecord/DurableRecordContextualCard";
import { buildChildScheduling } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { DurableRecordContextOption } from "@/lib/context/durableRecordContextOptions";
import type { DurablePersonSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durablePersonSubjectModel";
import { durableChildCollectionRow, type DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import { DURABLE_CHILD_ROWS_KEY } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITE = "site-n";
const ASOF = "2026-10-23";
const option = { key: "schedule", kind: "schedule", label: "Assignment", surface: "canonical_operational", siteLocationId: SITE } as unknown as DurableRecordContextOption;

/** A subject with NO assignment — the closed/lost family's child, a new lead's child, a new staff member. */
const emptyProjectionFor = (id: string, name: string) => ({
    byMemberId: { [id]: buildChildScheduling({ subject: { id, name, program: null, ageGroup: null, siteId: SITE, siteName: "QA North" }, agreementStatus: null, asOf: ASOF, assignments: [] }) },
    operatingDays: [1, 2, 3, 4, 5],
}) as never;
const staff = (id: string, label: string) => ({ personId: id, label, truth: {}, imageUrl: null }) as unknown as DurablePersonSubject;
/** A child subject with its truth composed exactly as `composeDurableChildSubject` composes it. */
const child = (id: string, label: string) => {
    const subject = { memberId: id, personId: null, householdId: "hh-1", label, dateOfBirth: "2022-03-14", householdName: "Readiness household", truth: {} } as unknown as DurableChildSubject;
    (subject as { truth: Record<string, unknown> }).truth = { [DURABLE_CHILD_ROWS_KEY]: [durableChildCollectionRow(subject)] };
    return subject;
};

let container: HTMLElement | null = null;
let root: Root | null = null;
const requests: Array<{ method: string; url: string }> = [];
function render(node: ReactNode): HTMLElement {
    if (!container) {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    }
    act(() => root!.render(node));
    return container;
}
const click = (el: Element | null) => {
    expect(el, "control to click").toBeTruthy();
    act(() => (el as HTMLElement).click());
};
const editor = (el: HTMLElement) => el.querySelector("[data-schedule-editor='true']");
const addAssignment = (el: HTMLElement) => el.querySelector("[data-schedule-create-new='true']");
const mutations = () => requests.filter((r) => r.method !== "GET" && r.method !== "HEAD");

beforeEach(() => {
    requests.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
        requests.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(url) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
});
afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    vi.unstubAllGlobals();
});

const staffCard = (id: string, label: string, focusSource: { kind: string; id: string; reason: string | null } | null = null) => (
    <DurableRecordContextualCard option={option} subject={{ kind: "staff", person: staff(id, label) }} schedulingProjection={emptyProjectionFor(id, label)} focusSource={focusSource} />
);
const childCard = (id: string, label: string, focusSource: { kind: string; id: string; reason: string | null } | null = null) => (
    <DurableRecordContextualCard option={option} subject={{ kind: "child", child: child(id, label) }} schedulingProjection={emptyProjectionFor(id, label)} focusSource={focusSource} />
);

describe("D8 — entering a record is passive", () => {
    it.each([
        ["a child with no assignment (the closed/lost family's only child)", () => childCard("kid-ava", "Ava Readiness")],
        ["a staff member with no assignment", () => staffCard("person-sam", "Sam Staff")],
    ])("%s: the card shows 'No assignments yet' + '+ Add Assignment', and NO editor", (_label, node) => {
        const el = render(node());
        expect(editor(el)).toBeNull();
        expect(el.querySelector("[data-schedule-commit]")).toBeNull();
        expect(el.textContent).toContain("No assignments yet");
        expect(addAssignment(el)).not.toBeNull();
        expect(el.textContent).not.toContain("Create Assignment — configure the minimum");
        // Opening reads; it never writes.
        expect(mutations()).toEqual([]);
    });

    it("a Schedule Gap source (an unscheduled agreement) is a selection, not a request to author", () => {
        const el = render(childCard("kid-dan", "Dan Gap", { kind: "enrollment_agreement", id: "agr-1", reason: "No committed schedule" }));
        expect(editor(el)).toBeNull();
        expect(addAssignment(el)).not.toBeNull();
        expect(mutations()).toEqual([]);
    });
});

describe("D8 — the editor opens when asked, and leaves cleanly", () => {
    it("'+ Add Assignment' opens the existing Create Assignment editor for that child; Cancel returns to the record", () => {
        const el = render(childCard("kid-ava", "Ava Readiness"));
        click(addAssignment(el));
        expect(editor(el)).not.toBeNull();
        expect(el.textContent).toContain("Create Assignment");
        const cancel = [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Cancel") ?? null;
        click(cancel);
        expect(editor(el)).toBeNull();
        expect(el.textContent).toContain("No assignments yet");
        expect(mutations()).toEqual([]);
    });

    it("moving to another record does not carry an open editor onto it", () => {
        const el = render(childCard("kid-ava", "Ava Readiness"));
        click(addAssignment(el));
        expect(editor(el)).not.toBeNull();
        // Select a different record in the same host.
        render(childCard("kid-ben", "Ben Other"));
        expect(editor(el)).toBeNull();
        expect(el.textContent).toContain("Ben Other");
        expect(mutations()).toEqual([]);
    });
});
