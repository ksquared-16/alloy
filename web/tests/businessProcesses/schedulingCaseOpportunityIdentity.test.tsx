/** @vitest-environment jsdom */

/**
 * BP V2 D6 — the Scheduling card never asks for a child's id as an opportunity.
 *
 * Hosted (qar_58463703cedd): opening a child from an Assignments Work View and starting an assignment issued
 * `GET /api/admin/financial-config/opportunity/<customer_members.id>` → 404. The card's case resolution fell
 * back to the subject's own id. The decision is pinned purely, and the request path is proven through the
 * EXISTING contextual card with every request recorded.
 */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DurableRecordContextualCard from "@/components/presentation/durableRecord/DurableRecordContextualCard";
import { buildChildScheduling } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { DurableRecordContextOption } from "@/lib/context/durableRecordContextOptions";
import { durableChildCollectionRow, type DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";
import { DURABLE_CHILD_ROWS_KEY } from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import { resolveSchedulingCaseOpportunityId } from "@/lib/adminV2/runtime/focusPanel/scheduling/resolveSchedulingCaseOpportunityId";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("D6 — which case the Scheduling card prices inside", () => {
    const KID = "kid-0554eb4f";
    const OPP = "opp-d9b1fbfb";
    it.each([
        ["staff: no case", { subjectKind: "staff" as const, context: { grain: "person", subject: { type: "person", id: "person-1" }, truth: {} } }, null],
        ["the opportunity drawer's case: itself", { subjectKind: "child" as const, context: { grain: "case", subject: { type: "opportunity", id: OPP }, truth: { id: OPP } } }, OPP],
        ["a child carrying its family binding: that family", { subjectKind: "child" as const, context: { grain: "child", subject: { type: "child", id: KID }, truth: { "child.family_opportunity_id": OPP } } }, OPP],
        ["a durable child hosted by a case: the hosting case", { subjectKind: "child" as const, context: { grain: "child", subject: { type: "child", id: KID }, truth: {}, operationalHost: { opportunityId: OPP } } }, OPP],
        ["a durable child with no case: NONE (never its own id)", { subjectKind: "child" as const, context: { grain: "child", subject: { type: "child", id: KID }, truth: { id: KID } } }, null],
    ])("%s", (_label, args, expected) => {
        expect(resolveSchedulingCaseOpportunityId(args)).toBe(expected);
    });
});

const SITE = "site-n";
const option = { key: "schedule", kind: "schedule", label: "Assignment", surface: "canonical_operational", siteLocationId: SITE } as unknown as DurableRecordContextOption;
const KID = "0554eb4f-2cb9-42f2-82ad-058e66c889ae";
const projection = {
    byMemberId: { [KID]: buildChildScheduling({ subject: { id: KID, name: "Cara Walk", program: null, ageGroup: null, siteId: SITE, siteName: "QA North" }, agreementStatus: null, asOf: "2026-10-23", assignments: [] }) },
    operatingDays: [1, 2, 3, 4, 5],
} as never;
const child = (() => {
    const subject = { memberId: KID, personId: null, householdId: "hh-1", label: "Cara Walk", dateOfBirth: "2022-01-15", householdName: "Walk household", truth: {} } as unknown as DurableChildSubject;
    (subject as { truth: Record<string, unknown> }).truth = { [DURABLE_CHILD_ROWS_KEY]: [durableChildCollectionRow(subject)] };
    return subject;
})();

let container: HTMLElement | null = null;
let root: Root | null = null;
const urls: string[] = [];
beforeEach(() => {
    urls.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    vi.useFakeTimers();
});
afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("D6 — a durable child opened from an Assignments view (the hosted path)", () => {
    it("opening and starting an assignment issues no financial-config request with the child's id", async () => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root!.render(<DurableRecordContextualCard option={option} subject={{ kind: "child", child }} schedulingProjection={projection} focusSource={null} />));
        const add = container.querySelector("[data-schedule-create-new='true']") as HTMLElement | null;
        expect(add, "+ Add Assignment").toBeTruthy();
        act(() => add!.click());
        expect(container.querySelector("[data-schedule-editor='true']")).not.toBeNull();
        // Let the editor's debounced draft-pricing read fire, if it is going to.
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        const financial = urls.filter((u) => u.includes("/api/admin/financial-config/opportunity/"));
        expect(financial.filter((u) => u.includes(KID))).toEqual([]);
        // There is no case on this record, so there is no case to price inside: no request at all.
        expect(financial).toEqual([]);
    });
});
