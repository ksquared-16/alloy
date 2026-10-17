/**
 * A financial requirement is answered by canonical Financials — not "unsupported" (which blocked
 * every enrolment, paid or not), and never by a balance of its own.
 */
import { describe, expect, it } from "vitest";

import { projectEnrollmentFinancialRequirement } from "@/lib/enrollment/financial/enrollmentFinancialRequirement";
import { projectFinancialRequirementProgress } from "@/lib/enrollment/participantProgress/projectEnrollmentParticipantProgress";
import { evaluateEnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

const requirement = {
    requirement_id: "fee_registration_fee",
    level: "required",
    ref: { kind: "financial", charge_template_key: "registration_fee", scope: "each_child" },
} as unknown as StageRequirementV1;

const position = (over: Record<string, unknown> = {}) => ({
    chargeId: "chg-ava",
    currencyCode: "USD",
    chargeStatus: "posted",
    grossCents: 15000,
    appliedCents: 0,
    expectedSubsidyCents: 0,
    currentlyCollectibleCents: 15000,
    outstandingCents: 15000,
    unresolvedVarianceCents: 0,
    suppressionBoundBy: "none",
    openVarianceStates: [],
    ...over,
}) as never;

const obligation = (pos: unknown, reversedByChargeId: string | null = null) => ({
    requirementId: "fee_registration_fee",
    chargeTemplateKey: "registration_fee",
    billableSource: { type: "customer" as const, id: "household" },
    subjectCustomerMemberId: "ava",
    position: pos as never,
    reversedByChargeId,
});

const progress = (input: Parameters<typeof projectEnrollmentFinancialRequirement>[0]) =>
    projectFinancialRequirementProgress(requirement, projectEnrollmentFinancialRequirement(input));

describe("financial requirement progress", () => {
    it("not due: outstanding, and nothing was charged to say so", () => {
        const p = progress({ configured: true, due: false, resolvesToZero: false, obligations: [] });
        expect(p.status).toBe("outstanding");
        expect(p.reason).toMatch(/not|due/i);
    });

    it("due and unpaid: outstanding (blocking)", () => {
        expect(progress({ configured: true, due: true, resolvesToZero: false, obligations: [obligation(position())] }).status).toBe("outstanding");
    });

    it("partly paid: still outstanding", () => {
        const p = progress({ configured: true, due: true, resolvesToZero: false, obligations: [obligation(position({ appliedCents: 5000, currentlyCollectibleCents: 10000, outstandingCents: 10000 }))] });
        expect(p.status).toBe("outstanding");
    });

    it("paid: satisfied, with the charge as evidence", () => {
        const p = progress({ configured: true, due: true, resolvesToZero: false, obligations: [obligation(position({ appliedCents: 15000, currentlyCollectibleCents: 0, outstandingCents: 0 }))] });
        expect(p.status).toBe("satisfied");
        expect(p.evidence).toMatchObject({ kind: "financial_obligation", charge_ids: ["chg-ava"] });
    });

    it("zero-cost: satisfied, without any charge", () => {
        expect(progress({ configured: true, due: false, resolvesToZero: true, obligations: [] }).status).toBe("satisfied");
    });

    it("reversed by Financials: reflects Financials' answer (settled)", () => {
        expect(progress({ configured: true, due: true, resolvesToZero: false, obligations: [obligation(position(), "chg-reversal")] }).status).toBe("satisfied");
    });

    it("missing/invalid template: an explicit configuration problem, never satisfied", () => {
        const p = progress({ configured: true, due: true, resolvesToZero: false, obligations: [], definitionUnresolved: true } as never);
        expect(p.status).toBe("outstanding");
        expect(p.reason).toMatch(/Needs attention: .*charge template/);
    });

    it("unpaid fee blocks completion; paid fee does not; other requirements still count", () => {
        const formDone = { requirement_id: "form", kind: "form", artifact: { kind: "form", id: "f" }, level: "required", status: "satisfied" } as const;
        const formOpen = { ...formDone, status: "outstanding" } as const;
        const unpaid = progress({ configured: true, due: true, resolvesToZero: false, obligations: [obligation(position())] });
        const paid = progress({ configured: true, due: true, resolvesToZero: false, obligations: [obligation(position({ appliedCents: 15000, currentlyCollectibleCents: 0, outstandingCents: 0 }))] });
        const blocking = (rows: unknown[]) =>
            evaluateEnrollmentCompletionSufficiency({ progress: { requirements: rows } as never }).requirements
                .filter((r) => r.disposition === "blocking")
                .map((r) => r.requirement_id);
        expect(blocking([formDone, unpaid])).toEqual(["fee_registration_fee"]);
        expect(blocking([formDone, paid])).toEqual([]);
        expect(blocking([formOpen, paid])).toEqual(["form"]);
    });
});
