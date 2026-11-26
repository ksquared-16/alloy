/**
 * READING WHAT A FAMILY OWES MUST NOT CREATE IT.
 *
 * `resolveEnrollmentFeeObligations` materializes a fee — it creates and posts canonical charges, and
 * that is an operator/evaluator act. This is its read-only twin, and the distinction is the whole
 * point: a participant opening their family page must not bring money into existence. A GET that
 * creates a charge is a GET that bills a family for looking.
 */
import { describe, expect, it } from "vitest";

import {
    financialRequirementsOf,
    readEnrollmentFeeProjection,
} from "@/lib/enrollment/financial/readEnrollmentFeeProjection";
import { familyFinancialsFromProjection } from "@/lib/enrollment/family/familyEnrollmentExperience";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

const ORG = "org-1";
const ACCOUNT = "cust-1";

const feeRequirement = (over: Partial<StageRequirementV1> = {}): StageRequirementV1 =>
    ({
        requirement_id: "enrollment_fee",
        ref: { kind: "financial", charge_template_key: "registration_fee" },
        level: "required",
        scope: "record",
        ...over,
    }) as StageRequirementV1;

const packetRequirement = {
    requirement_id: "paperwork",
    ref: { kind: "form", form_definition_id: "f1" },
    level: "required",
} as unknown as StageRequirementV1;

describe("which authored requirements are financial", () => {
    it("selects only the financial ones", () => {
        const got = financialRequirementsOf([packetRequirement, feeRequirement()]);
        expect(got).toEqual([{ requirementId: "enrollment_fee", chargeTemplateKey: "registration_fee", scope: "record" }]);
    });

    /*
     * THE DOUBLE-BILLING GUARD. A family-scoped fee is authored ONCE on the stage, and the stage is
     * read once PER CHILD — so without dedupe a two-child household reports the household fee twice
     * and a parent is shown double what they owe.
     */
    it("reports a family fee once however many children read the same stage", () => {
        const got = financialRequirementsOf([feeRequirement(), feeRequirement(), feeRequirement()]);
        expect(got).toHaveLength(1);
    });

    it("keeps two genuinely different fees apart", () => {
        const got = financialRequirementsOf([
            feeRequirement(),
            feeRequirement({ requirement_id: "materials", ref: { kind: "financial", charge_template_key: "materials_fee" } } as never),
        ]);
        expect(got.map((r) => r.chargeTemplateKey)).toEqual(["registration_fee", "materials_fee"]);
    });
});

/** A fake that records every table touched, so a WRITE would be visible to the test. */
function readOnlySupabase(charges: Record<string, unknown>[], touched: string[], eqs: string[] = []) {
    return {
        from(table: string) {
            touched.push(table);
            let rows = [...charges];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (col: string, val: unknown) => {
                    eqs.push(col);
                    // `metadata->>key` is a JSON accessor, not a column. The fake honours it because
                    // the code under test relies on the DATABASE doing this filtering, and a fake
                    // that quietly ignored it would let a JavaScript-side filter pass as equivalent.
                    const json = /^metadata->>(.+)$/.exec(col);
                    rows = json
                        ? rows.filter(
                              (r) =>
                                  ((r.metadata ?? {}) as Record<string, unknown>)[json[1]] === val,
                          )
                        : rows.filter((r) => r[col] === val);
                    return api;
                },
                in: () => api,
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                insert: () => {
                    throw new Error("WROTE during a read");
                },
                update: () => {
                    throw new Error("WROTE during a read");
                },
                then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
            };
            return api;
        },
    } as never;
}

describe("the read-only fee projection", () => {
    it("is NOT_APPLICABLE when no financial requirement is authored", async () => {
        const touched: string[] = [];
        const p = await readEnrollmentFeeProjection(readOnlySupabase([], touched), {
            orgId: ORG,
            customerId: ACCOUNT,
            enrollingChildren: [],
            requirements: [packetRequirement],
            due: true,
        });
        expect(p.state).toBe("NOT_APPLICABLE");
        expect(p.amounts.grossCents).toBe(0);
        // Nothing was even read, let alone written.
        expect(touched).toEqual([]);
    });

    /*
     * A CONFIGURED FEE WITH NO OBLIGATION IS NOT SATISFIED. Reporting SATISFIED here would tell a
     * family it owed nothing because nobody had yet created the charge — the failure mode where a
     * pricing or materialization gap reads as good news.
     */
    it("does not call a configured fee satisfied merely because no charge exists yet", async () => {
        const p = await readEnrollmentFeeProjection(readOnlySupabase([], []), {
            orgId: ORG,
            customerId: ACCOUNT,
            enrollingChildren: [],
            requirements: [feeRequirement()],
            due: true,
        });
        // Nothing exists to pay, so somebody has to look — not "you are finished".
        expect(p.state).not.toBe("SATISFIED");
        expect(p.state).toBe("ATTENTION_REQUIRED");
        expect(p.explanation).toContain("no charge has been created");
    });

    it("is NOT_DUE before the prerequisite paperwork is finished", async () => {
        const p = await readEnrollmentFeeProjection(readOnlySupabase([], []), {
            orgId: ORG,
            customerId: ACCOUNT,
            enrollingChildren: [],
            requirements: [feeRequirement()],
            due: false,
        });
        expect(p.state).toBe("NOT_DUE");
    });

    it("never writes, even when charges exist", async () => {
        const touched: string[] = [];
        // An insert or update through this fake throws; reaching the end proves neither happened.
        await readEnrollmentFeeProjection(
            readOnlySupabase([{ id: "chg-1", org_id: ORG, billable_source_type: "customer", billable_source_id: ACCOUNT, metadata: { charge_template_key: "registration_fee" } }], touched),
            { orgId: ORG, customerId: ACCOUNT, enrollingChildren: [], requirements: [feeRequirement()], due: true },
        ).catch(() => undefined);
        expect(touched).toContain("charges");
    });
});

describe("the family shell carries Financials figures unchanged", () => {
    it("translates shape without touching a single number", () => {
        const amounts = {
            currencyCode: "USD",
            grossCents: 25000,
            expectedFundingCents: 5000,
            collectibleNowCents: 25000,
            appliedCents: 4000,
            outstandingCents: 25000,
        };
        const f = familyFinancialsFromProjection({
            state: "PARTIALLY_SATISFIED",
            amounts,
            obligations: [
                { subjectCustomerMemberId: "emma", position: { chargeId: "chg-emma", currentlyCollectibleCents: 15000 }, state: "DUE" },
                { subjectCustomerMemberId: null, position: { chargeId: "chg-family", currentlyCollectibleCents: 5000 }, state: "DUE" },
            ],
        });
        expect(f.grossCents).toBe(25000);
        expect(f.expectedFundingCents).toBe(5000);
        expect(f.collectibleNowCents).toBe(25000);
        expect(f.appliedCents).toBe(4000);
        expect(f.outstandingCents).toBe(25000);
        // Notably NOT gross minus expected funding: an expectation does not reduce what is collectible.
        expect(f.collectibleNowCents).not.toBe(amounts.grossCents - amounts.expectedFundingCents);
    });

    it("labels a child line and a household line differently", () => {
        const f = familyFinancialsFromProjection({
            state: "DUE",
            amounts: { currencyCode: "USD", grossCents: 0, expectedFundingCents: 0, collectibleNowCents: 0, appliedCents: 0, outstandingCents: 0 },
            obligations: [
                { subjectCustomerMemberId: "liam", position: { chargeId: "c1", currentlyCollectibleCents: 10000 }, state: "DUE" },
                { subjectCustomerMemberId: null, position: { chargeId: "c2", currentlyCollectibleCents: 15000 }, state: "DUE" },
            ],
        });
        expect(f.lines.map((l) => l.scope)).toEqual(["child", "family"]);
        expect(f.lines[0].subjectCustomerMemberId).toBe("liam");
        expect(f.lines[1].subjectCustomerMemberId).toBeNull();
    });

    it("keeps a line for an obligation with no position, rather than dropping it", () => {
        // A charge nobody can position must stay visible; silence would hide posted money.
        const f = familyFinancialsFromProjection({
            state: "ATTENTION_REQUIRED",
            amounts: { currencyCode: null, grossCents: 0, expectedFundingCents: 0, collectibleNowCents: 0, appliedCents: 0, outstandingCents: 0 },
            obligations: [{ subjectCustomerMemberId: null, position: null, state: "ATTENTION_REQUIRED" }],
        });
        expect(f.lines).toHaveLength(1);
        expect(f.lines[0].chargeId).toBeNull();
        expect(f.lines[0].collectibleNowCents).toBe(0);
    });
});

/*
 * THE 1000-ROW CAP IS A CORRECTNESS BOUNDARY, NOT A PERFORMANCE ONE.
 *
 * This read used to select every charge on the billable source and pick the fee out in JavaScript.
 * PostgREST returns at most 1000 rows, so a household with more charges than that — years of
 * tuition, late pickups, field trips — could return a page that did not contain the fee at all. The
 * projection would then report ATTENTION_REQUIRED about a charge that exists and may already be
 * paid, which is the exact failure this slice exists to prevent, arriving from the other direction.
 *
 * Certification on the real stack is what found it: the fixture agreement carried exactly 1000
 * readable charges and the fee written seconds earlier was invisible.
 */
describe("finding an existing fee among a family's whole charge history", () => {
    it("matches the charge definition in the query, so a long history cannot hide the fee", async () => {
        const noise = Array.from({ length: 1000 }, (_, i) => ({
            id: `noise-${i}`,
            org_id: ORG,
            billable_source_type: "customer",
            billable_source_id: ACCOUNT,
            metadata: { charge_template_key: "monthly_tuition" },
        }));
        const eqs: string[] = [];
        const charges = [
            ...noise,
            {
                id: "the-fee",
                org_id: ORG,
                billable_source_type: "customer",
                billable_source_id: ACCOUNT,
                metadata: { charge_template_key: "registration_fee" },
            },
        ];

        await readEnrollmentFeeProjection(readOnlySupabase(charges, [], eqs), {
            orgId: ORG,
            customerId: ACCOUNT,
            enrollingChildren: [],
            requirements: [feeRequirement()],
            due: true,
        });

        // The narrowing must happen in the database. A JavaScript filter over a capped page is what
        // lost the fee, so the query itself has to name the key.
        expect(eqs).toContain("metadata->>charge_template_key");
    });
});
