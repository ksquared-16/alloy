/**
 * H3-2 — when a child's fee becomes a charge, and which version of the fee it is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const progress = vi.fn();
const resolveFee = vi.fn();
vi.mock("@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress", () => ({
    resolveEnrollmentParticipantProgress: (...a: unknown[]) => progress(...a),
}));
vi.mock("@/lib/admin/orgLocalDayBounds", () => ({ fetchOrgTimeZoneIana: async () => "America/Los_Angeles" }));
vi.mock("@/lib/enrollment/financial/resolveEnrollmentFeeObligations", async (orig) => ({
    ...(await orig<object>()),
    resolveEnrollmentFeeObligations: (...a: unknown[]) => resolveFee(...a),
}));

import { realizeEnrollmentFeesForProcessInstance, calendarDayIn, sweepUnrealizedEnrollmentFees } from "@/lib/enrollment/financial/realizeEnrollmentFeesForProcessInstance";
import { currentTemplateForKey, financialRequirementRefusals } from "@/lib/enrollment/financial/resolveEnrollmentFeeObligations";
import { parseStageRequirementsV1 } from "@/lib/lifecycle/stageRequirementsV1";

const FEE = parseStageRequirementsV1({
    version: 1,
    requirements: [
        { requirement_id: "fee_registration_fee", kind: "financial", charge_template_key: "registration_fee", level: "required", scope: "each_child", timing: "stage_exit", enforcement: "blocking" },
    ],
})!.requirements;

function fakeSupabase(rows: Record<string, Record<string, unknown> | Record<string, unknown>[] | null>) {
    return {
        from: (table: string) => {
            const q = {
                select: () => q,
                eq: () => q,
                not: () => q,
                gte: () => q,
                order: () => q,
                limit: async () => ({ data: Array.isArray(rows[table]) ? rows[table] : rows[table] ? [rows[table]] : [], error: null }),
                maybeSingle: async () => ({ data: (Array.isArray(rows[table]) ? (rows[table] as unknown[])[0] : rows[table]) ?? null, error: null }),
            };
            return q;
        },
    } as never;
}

function journey(outstanding: number, opts: { completedAt?: string | null; state?: string } = {}) {
    progress.mockImplementation(async (_s: unknown, input: { captureLoaded?: (l: unknown) => void }) => {
        input.captureLoaded?.({ session: null, items: [], formBySessionItem: new Map(), subjectId: "child-1", requirements: FEE });
        return {
            ok: true,
            value: {
                requirements: [
                    ...Array.from({ length: outstanding }, (_, i) => ({ kind: "form", status: "outstanding", id: `f${i}` })),
                    { kind: "form", status: "satisfied" },
                    { kind: "financial", status: "outstanding" },
                ],
            },
        };
    });
    return fakeSupabase({
        process_instances: { state: opts.state ?? "enrolling" },
        form_packet_sessions: { status: "completed", completed_at: opts.completedAt === undefined ? "2026-09-02T05:30:00.000Z" : opts.completedAt },
        customer_members: { customer_id: "hh-1" },
        child_enrollment_agreements: null,
    });
}

beforeEach(() => {
    progress.mockReset();
    resolveFee.mockReset();
    resolveFee.mockResolvedValue({ templateResolved: true, resolvesToZero: false, outcomes: [] });
});

describe("the fee becomes a charge at the child's milestone, once", () => {
    /*
     * As production sees it: at completion the session is no longer CURRENT (in_progress), so the
     * progress resolver hands back no session. The milestone is the journey's latest COMPLETED
     * session, read directly — the H3-2 version read the current one and never came due.
     */
    it("is not charged while other paperwork is outstanding", async () => {
        const r = await realizeEnrollmentFeesForProcessInstance(journey(1), { orgId: "org", processInstanceId: "pi-1" });
        expect(r).toEqual({ status: "not_due", outstanding: 1 });
        expect(resolveFee).not.toHaveBeenCalled();
    });

    it("is charged for this child, dated by the session's completion in the org's zone", async () => {
        const r = await realizeEnrollmentFeesForProcessInstance(journey(0), { orgId: "org", processInstanceId: "pi-1" });
        expect(r.status).toBe("realized");
        // 05:30Z on 2 Sep is 22:30 on 1 Sep in Los Angeles — the family finished on the 1st.
        expect(resolveFee).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            scope: "each_child",
            customerId: "hh-1",
            enrollingChildren: [{ customerMemberId: "child-1", agreementId: null }],
            dueOn: "2026-09-01",
            chargeTemplateKey: "registration_fee",
        }));
    });

    it("asks with the same date on every retry — the date is the completion, not today", async () => {
        await realizeEnrollmentFeesForProcessInstance(journey(0), { orgId: "org", processInstanceId: "pi-1" });
        await realizeEnrollmentFeesForProcessInstance(journey(0), { orgId: "org", processInstanceId: "pi-1" });
        expect(resolveFee.mock.calls.map((c) => (c[1] as { dueOn: string }).dueOn)).toEqual(["2026-09-01", "2026-09-01"]);
    });

    it("never charges a withdrawn journey", async () => {
        const r = await realizeEnrollmentFeesForProcessInstance(journey(0, { state: "withdrawn" }), { orgId: "org", processInstanceId: "pi-1" });
        expect(r).toEqual({ status: "not_applicable", reason: "journey_withdrawn" });
        expect(resolveFee).not.toHaveBeenCalled();
    });

    it("waits for a recorded completion rather than inventing a date", async () => {
        const r = await realizeEnrollmentFeesForProcessInstance(journey(0, { completedAt: null }), { orgId: "org", processInstanceId: "pi-1" });
        expect(r).toEqual({ status: "no_due_milestone" });
        expect(resolveFee).not.toHaveBeenCalled();
    });

    it("reads a completion as the calendar day it falls on locally", () => {
        expect(calendarDayIn("2026-09-02T05:30:00.000Z", "America/Los_Angeles")).toBe("2026-09-01");
        expect(calendarDayIn("2026-09-02T05:30:00.000Z", "UTC")).toBe("2026-09-02");
    });
});

describe("the fee is the version in effect on the day it fell due", () => {
    const versions = [
        { template_key: "registration_fee", is_active: true, effective_start: "2026-01-01", effective_end: "2026-08-31", amount_cents: 10000 },
        { template_key: "registration_fee", is_active: true, effective_start: "2026-09-01", effective_end: null, amount_cents: 12500 },
    ];
    it("picks the version covering the due day", () => {
        expect(currentTemplateForKey(versions, "registration_fee", "2026-08-15")?.amount_cents).toBe(10000);
        expect(currentTemplateForKey(versions, "registration_fee", "2026-09-01")?.amount_cents).toBe(12500);
    });
    it("finds none before the fee existed", () => {
        expect(currentTemplateForKey(versions, "registration_fee", "2025-12-31")).toBeNull();
    });
});

describe("a financial requirement must name a template Financials has", () => {
    it("refuses an unknown or retired key, accepts an active one", () => {
        const templates = [{ template_key: "registration_fee", is_active: true }, { template_key: "old_fee", is_active: false }];
        const reqs = (key: string) => [{ requirement_id: `fee_${key}`, ref: { kind: "financial", charge_template_key: key } }];
        expect(financialRequirementRefusals(reqs("registration_fee"), templates)).toEqual([]);
        expect(financialRequirementRefusals(reqs("old_fee"), templates)[0]?.detail).toMatch(/No active charge template "old_fee"/);
        expect(financialRequirementRefusals(reqs("typo_fee"), templates)).toHaveLength(1);
    });
});


describe("the recovery sweep re-asks the same writer, and is safe to repeat", () => {
    const sessions = (n: number) =>
        Array.from({ length: n }, (_, i) => ({ org_id: "org", process_instance_id: `pi-${i}`, status: "completed", completed_at: "2026-09-02T05:30:00.000Z" }));
    const withSessions = (n: number, state = "enrolling", outstanding = 0) => {
        journey(outstanding, { state });
        return fakeSupabase({
            process_instances: { state },
            form_packet_sessions: sessions(n),
            customer_members: { customer_id: "hh-1" },
            child_enrollment_agreements: null,
        });
    };

    it("creates a missed fee through the realizer, once", async () => {
        resolveFee.mockResolvedValueOnce({ templateResolved: true, resolvesToZero: false, outcomes: [{ status: "created", chargeId: "c1" }] });
        const r = await sweepUnrealizedEnrollmentFees(withSessions(1));
        expect(r).toEqual({ examined: 1, realized: 1, created: 1, failed: 0 });
        expect(resolveFee).toHaveBeenCalledTimes(1);
        expect((resolveFee.mock.calls[0]![1] as { dueOn: string }).dueOn).toBe("2026-09-01");
    });

    it("a repeated sweep finds the existing charge and creates nothing", async () => {
        resolveFee.mockResolvedValue({ templateResolved: true, resolvesToZero: false, outcomes: [{ status: "skipped_posted", chargeId: "c1" }] });
        const r = await sweepUnrealizedEnrollmentFees(withSessions(1));
        expect(r.created).toBe(0);
    });

    it("skips a withdrawn journey and a journey whose fee is not yet due", async () => {
        expect((await sweepUnrealizedEnrollmentFees(withSessions(1, "withdrawn"))).realized).toBe(0);
        expect((await sweepUnrealizedEnrollmentFees(withSessions(1, "enrolling", 1))).realized).toBe(0);
        expect(resolveFee).not.toHaveBeenCalled();
    });
});
