/**
 * A policy reduction must name the authority that decided it — and be refused before it writes.
 *
 * The database CHECK says the same thing and stays as defence in depth. But it refuses as a
 * constraint violation, after a draft charge has already been created and has to be withdrawn.
 * These prove the service refuses first, in the domain's own words, having touched nothing: the
 * Supabase client here THROWS on any use, so a test that reaches the database fails loudly rather
 * than passing quietly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
    applyReductionCore,
    ReductionCoreError,
    type ReductionApplicationDraft,
    type ReductionCoreInput,
} from "@/lib/financials/reductions/reductionCore";
import {
    applyVacationCreditReduction,
    PolicyReductionError,
    vacationCreditReductionKey,
} from "@/lib/financials/reductions/policyReductionService";

/** Any database access at all is a failure: these refusals happen before persistence. */
const noDatabase = new Proxy({}, {
    get() {
        throw new Error("the database was touched before the authority check refused");
    },
}) as unknown as SupabaseClient;

const coreInput = (applications: ReductionApplicationDraft[]): ReductionCoreInput => ({
    orgId: "org",
    actorUserId: null,
    subject: { enrollmentAgreementId: "agreement" },
    charge: { chargeCategory: "discount", description: "d", serviceDate: "2026-03-04", currencyCode: "USD" },
    applications,
    onExisting: "return",
});

const policyApp = (over: Partial<ReductionApplicationDraft> = {}): ReductionApplicationDraft => ({
    reductionKind: "policy",
    policyKind: "vacation_credit",
    amountCents: -4000,
    idempotencyKey: "k",
    ...over,
});

describe("the reduction core refuses an unexplainable policy reduction", () => {
    it("refuses a policy reduction with no authority at all", async () => {
        await expect(applyReductionCore(noDatabase, coreInput([policyApp()])))
            .rejects.toThrow(ReductionCoreError);
        await applyReductionCore(noDatabase, coreInput([policyApp()])).catch((e: ReductionCoreError) => {
            expect(e.code).toBe("missing_policy_authority");
            expect(e.message).toMatch(/exactly one/i);
        });
    });

    it("refuses a policy reduction naming both authorities", async () => {
        // Both is worse than neither: the row exists, looks complete, and nothing says which decided.
        const apps = [policyApp({ commercialPolicyId: "c", financialPolicyId: "f" })];
        await applyReductionCore(noDatabase, coreInput(apps)).catch((e: ReductionCoreError) => {
            expect(e.code).toBe("ambiguous_policy_authority");
        });
    });

    it("accepts either authority alone — the commercial path is not narrowed", async () => {
        // Reaching the database is the pass here: validation let it through.
        for (const app of [policyApp({ commercialPolicyId: "c" }), policyApp({ financialPolicyId: "f" })]) {
            await expect(applyReductionCore(noDatabase, coreInput([app])))
                .rejects.toThrow(/database was touched/);
        }
    });

    it("refuses a manual reduction that claims a policy decided it", async () => {
        const apps: ReductionApplicationDraft[] = [{ reductionKind: "manual", reason: "goodwill", financialPolicyId: "f", amountCents: -100, idempotencyKey: "k" }];
        await applyReductionCore(noDatabase, coreInput(apps)).catch((e: ReductionCoreError) => {
            expect(e.code).toBe("manual_carries_policy_authority");
        });
    });

    it("refuses a manual reduction with no reason", async () => {
        const apps: ReductionApplicationDraft[] = [{ reductionKind: "manual", amountCents: -100, idempotencyKey: "k" }];
        await applyReductionCore(noDatabase, coreInput(apps)).catch((e: ReductionCoreError) => {
            expect(e.code).toBe("reason_required");
        });
    });
});

describe("the vacation-credit writer", () => {
    const input = (over: Record<string, unknown> = {}) => ({
        orgId: "org",
        actorUserId: null,
        resolvedObligationId: "obl-1",
        materializingEventId: "evt-1",
        financialPolicyId: "pol-1",
        enrollmentAgreementId: "agreement",
        amountCents: 4000,
        effectiveDate: "2026-03-04",
        periodKey: "2026-03",
        valuation: { acceptedTermId: "t", acceptedPeriodAmountCents: 120000, periodDays: 30, creditedDays: 1 },
        ...over,
    });

    it("requires the financial policy that decided it", async () => {
        await applyVacationCreditReduction(noDatabase, input({ financialPolicyId: "" }) as never)
            .catch((e: PolicyReductionError) => {
                expect(e.code).toBe("missing_policy_authority");
                expect(e.message).toMatch(/financial policy/i);
            });
    });

    it("requires the obligation and its event, because that is what makes a replay one credit", async () => {
        await applyVacationCreditReduction(noDatabase, input({ materializingEventId: "" }) as never)
            .catch((e: PolicyReductionError) => expect(e.code).toBe("missing_obligation"));
        await applyVacationCreditReduction(noDatabase, input({ resolvedObligationId: "" }) as never)
            .catch((e: PolicyReductionError) => {
                expect(e.code).toBe("missing_obligation");
                expect(e.message).toMatch(/twice/i);
            });
    });

    it("takes a positive amount and refuses anything else", async () => {
        for (const amountCents of [0, -4000, 40.5]) {
            await applyVacationCreditReduction(noDatabase, input({ amountCents }) as never)
                .catch((e: PolicyReductionError) => expect(e.code).toBe("invalid_amount"));
        }
    });

    it("keys on the obligation AND the event that made it current", () => {
        // The obligation alone was too coarse: a consequence withdrawn by a correction and restored
        // by a later one would have collided with its own settled artifact. The event is the
        // incarnation, so a restored credit is a new credit rather than a revival.
        expect(vacationCreditReductionKey("obl-1", "evt-1")).toBe("fred:policy:vacation_credit:obl-1:evt-1");
        expect(vacationCreditReductionKey("obl-2", "evt-1")).not.toBe(vacationCreditReductionKey("obl-1", "evt-1"));
        expect(vacationCreditReductionKey("obl-1", "evt-2")).not.toBe(vacationCreditReductionKey("obl-1", "evt-1"));
    });
});
