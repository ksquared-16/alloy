/**
 * BP V2 Slice 4 — the row's source resolved against the card's own projection (by id only), and how a
 * projection Work View opens the existing durable record.
 */
import { describe, expect, it } from "vitest";
import {
    resolveSchedulingFocus,
    schedulingFocusNotice,
    type SchedulingFocusProjection,
} from "@/lib/runtime/focus/durableRecordFocusSource";
import { durableRecordEntryFor, type DomainProjectionFocusFrame } from "@/components/presentation/workUnit/DomainProjectionFocusContext";

const a = (id: string, subjectType: "child" | "staff" = "child") => ({ id, subjectType });
const PROJ: SchedulingFocusProjection = {
    current: { assignments: [a("cur-1"), a("cur-2"), a("cur-3")] },
    proposed: { assignments: [a("prop-1")] },
    upcoming: [{ assignments: [a("up-1")] }, { assignments: [a("up-2")] }],
    enrollmentAgreementId: "agr-1",
};
const src = (kind: string, id: string) => ({ kind, id, reason: null });

describe("resolveSchedulingFocus — by id, never by position", () => {
    it("current, proposed and upcoming each resolve to the named row and bucket", () => {
        expect(resolveSchedulingFocus(PROJ, "child", src("schedule_assignment", "cur-3"))).toEqual({ status: "assignment", assignmentId: "cur-3", bucket: "current" });
        expect(resolveSchedulingFocus(PROJ, "child", src("schedule_assignment", "cur-1"))).toEqual({ status: "assignment", assignmentId: "cur-1", bucket: "current" });
        expect(resolveSchedulingFocus(PROJ, "child", src("schedule_assignment", "prop-1"))).toEqual({ status: "assignment", assignmentId: "prop-1", bucket: "proposed" });
        expect(resolveSchedulingFocus(PROJ, "child", src("schedule_assignment", "up-2"))).toEqual({ status: "assignment", assignmentId: "up-2", bucket: "upcoming" });
    });

    it("a source that is no longer current/proposed/upcoming is GONE — never swapped for another row", () => {
        const r = resolveSchedulingFocus(PROJ, "child", src("schedule_assignment", "ended-9"));
        expect(r).toEqual({ status: "assignment_gone", assignmentId: "ended-9" });
        expect(schedulingFocusNotice(r)).toMatch(/changed since the list was read/);
        expect(resolveSchedulingFocus(null, "child", src("schedule_assignment", "cur-1")).status).toBe("assignment_gone");
    });

    it("the subject's kind filters: a staff source never matches a child's row with the same id", () => {
        expect(resolveSchedulingFocus(PROJ, "staff", src("schedule_assignment", "cur-1")).status).toBe("assignment_gone");
        const staff: SchedulingFocusProjection = { current: { assignments: [a("s-1", "staff")] } };
        expect(resolveSchedulingFocus(staff, "staff", src("schedule_assignment", "s-1"))).toEqual({ status: "assignment", assignmentId: "s-1", bucket: "current" });
    });

    it("an agreement source: unscheduled, scheduled since, or a different agreement — no assignment is manufactured", () => {
        const gap: SchedulingFocusProjection = { current: null, proposed: null, upcoming: [], enrollmentAgreementId: "agr-1" };
        expect(resolveSchedulingFocus(gap, "child", src("enrollment_agreement", "agr-1"))).toEqual({ status: "agreement_unscheduled", agreementId: "agr-1" });
        expect(resolveSchedulingFocus(PROJ, "child", src("enrollment_agreement", "agr-1"))).toEqual({ status: "agreement_scheduled", agreementId: "agr-1" });
        expect(resolveSchedulingFocus(PROJ, "child", src("enrollment_agreement", "agr-2"))).toEqual({ status: "agreement_elsewhere", agreementId: "agr-2" });
        const onlyUpcoming: SchedulingFocusProjection = { current: null, upcoming: [{ assignments: [a("up-1")] }], enrollmentAgreementId: "agr-1" };
        expect(resolveSchedulingFocus(onlyUpcoming, "child", src("enrollment_agreement", "agr-1")).status).toBe("agreement_scheduled");
    });

    it("no source, an empty id, or an unknown kind resolves to nothing actionable", () => {
        expect(resolveSchedulingFocus(PROJ, "child", null)).toEqual({ status: "none" });
        expect(resolveSchedulingFocus(PROJ, "child", src("schedule_assignment", " "))).toEqual({ status: "none" });
        expect(resolveSchedulingFocus(PROJ, "child", src("financial_charge", "c-1"))).toEqual({ status: "unsupported", kind: "financial_charge" });
        expect(schedulingFocusNotice({ status: "none" })).toBeNull();
        expect(schedulingFocusNotice({ status: "assignment", assignmentId: "x", bucket: "current" })).toBeNull();
    });
});

describe("durableRecordEntryFor — the existing durable surface, configured by the frame", () => {
    const frame: DomainProjectionFocusFrame = {
        businessProcessKey: "assignments",
        workViewId: "ending",
        domain: "assignments",
        projectionKey: "assignments_ending_soon",
        processLabel: "Assignments",
        workViewLabel: "Ending soon",
        selectedSource: { kind: "schedule_assignment", id: "sa-1", reason: "Ends Oct 29 · in 9 days", siteLocationId: "site-r" },
    };

    it("Assignments opens the contextual presentation on the Assignment context, at the row's site, with the source and reason", () => {
        expect(durableRecordEntryFor(frame)).toEqual({
            presentation: "contextual",
            contextKey: "schedule",
            contextSiteId: "site-r",
            focusSource: { kind: "schedule_assignment", id: "sa-1", reason: "Ends Oct 29 · in 9 days" },
            origin: { label: "Assignments · Ending soon", reason: "Ends Oct 29 · in 9 days" },
        });
    });

    it("Billing keeps the full record (Slice 2 behaviour) and sends no site request", () => {
        const billing = durableRecordEntryFor({ ...frame, domain: "billing", projectionKey: "charges_needing_review", processLabel: "Billing", workViewLabel: "Needs review", selectedSource: { kind: "financial_charge", id: "c-1", reason: "Draft", siteLocationId: "site-r" } });
        expect(billing.presentation).toBe("full");
        expect(billing.contextKey).toBeNull();
        expect(billing.contextSiteId).toBeNull();
        expect(billing.origin).toEqual({ label: "Billing · Needs review", reason: "Draft" });
    });

    it("no labels → no origin line; no selection → no source", () => {
        const bare = durableRecordEntryFor({ ...frame, processLabel: null, workViewLabel: null, selectedSource: null });
        expect(bare.origin).toBeNull();
        expect(bare.focusSource).toBeNull();
        expect(bare.contextSiteId).toBeNull();
    });
});
