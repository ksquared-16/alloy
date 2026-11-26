/**
 * WHAT AN OPERATOR IS TOLD WHEN THE PROVIDER WILL NOT LET THEM CHARGE.
 *
 * An operator completed Stripe's hosted onboarding, chose a payout account and a payout schedule,
 * came back, and read: "The payment provider has restricted this account." True, and useless — it
 * reads like something broke, when the provider had simply asked for one more thing.
 *
 * The provider had already said which it was. `persistReadiness` records `disabled_reason` and the
 * COUNTS of `currently_due` / `past_due`; this is the mapping from that to a sentence somebody can
 * act on. The distinction that matters most is between "you still owe something" and "nothing is
 * needed from you" — telling somebody to repeat an onboarding they just finished, because the
 * provider is merely reviewing it, is the worse of the two mistakes.
 *
 * Measured from the real deployed account on 2026-09-22:
 *   readiness_detail = {"past_due": 1, "currently_due": 1, "disabled_reason": "requirements.past_due"}
 */
import { describe, expect, it } from "vitest";

import { describeInstallation } from "@/lib/financials/payments/providerInstallation";

const row = (over: Record<string, unknown> = {}) =>
    ({
        id: "m-1",
        processor: "stripe",
        provider_account_ref: "acct_123",
        readiness: "restricted",
        ach_readiness: "restricted",
        readiness_checked_at: "2026-09-22T15:44:01Z",
        readiness_detail: null,
        ...over,
    }) as never;

describe("a restricted account says what is actually outstanding", () => {
    /* The exact shape the deployed account produced. */
    it("asks for the one thing the provider is still waiting on", () => {
        const s = describeInstallation(row({
            readiness_detail: { past_due: 1, currently_due: 1, disabled_reason: "requirements.past_due" },
        }));
        expect(s.attention).toMatch(/one more step/i);
        expect(s.attention).toMatch(/one more piece of information/i);
        expect(s.attention).toMatch(/continue setup/i);
        expect(s.cardAvailable, "and it still cannot charge").toBe(false);
    });

    it("pluralises when the provider wants several", () => {
        const s = describeInstallation(row({
            readiness_detail: { past_due: 0, currently_due: 3, disabled_reason: "requirements.currently_due" },
        }));
        expect(s.attention).toMatch(/3 more pieces of information/i);
    });

    /*
     * THE CASE THAT MUST NOT SEND SOMEBODY BACK THROUGH ONBOARDING. Nothing is owed; the provider is
     * checking what it already has, and Continue setup would open a flow with nothing left to answer.
     */
    it("says nothing is needed while the provider is still reviewing", () => {
        const s = describeInstallation(row({
            readiness_detail: { past_due: 0, currently_due: 0, disabled_reason: "requirements.pending_verification" },
        }));
        expect(s.attention).toMatch(/reviewing/i);
        expect(s.attention).toMatch(/nothing is needed from you/i);
        expect(s.attention, "it must not ask for another onboarding pass").not.toMatch(/continue setup/i);
    });

    it("does not pretend a refusal can be fixed in Alloy", () => {
        const s = describeInstallation(row({ readiness_detail: { disabled_reason: "rejected.fraud" } }));
        expect(s.attention).toMatch(/contact the provider/i);
        expect(s.attention).not.toMatch(/continue setup/i);
    });

    it("still says something honest when the reason is unrecognised", () => {
        const s = describeInstallation(row({ readiness_detail: { disabled_reason: "something_new" } }));
        expect(s.attention).toMatch(/has not enabled payments/i);
        expect(s.attention).toMatch(/continue setup/i);
    });

    it("survives a merchant with no recorded detail at all", () => {
        const s = describeInstallation(row({ readiness_detail: null }));
        expect(s.attention).toBeTruthy();
        expect(s.attention).not.toMatch(/undefined|null|NaN/);
    });

    /* Provider vocabulary is not operator vocabulary. */
    it("never puts a raw requirement key or account reference in the sentence", () => {
        for (const reason of ["requirements.past_due", "requirements.pending_verification", "rejected.fraud"]) {
            const s = describeInstallation(row({ readiness_detail: { currently_due: 1, disabled_reason: reason } }));
            expect(s.attention).not.toContain(reason);
            expect(s.attention).not.toMatch(/acct_/);
            expect(s.attention).not.toMatch(/individual\.|company\.|tos_acceptance/);
        }
    });
});

describe("the states that were already right stay right", () => {
    it("ready with no bank rail explains only the bank rail", () => {
        const s = describeInstallation(row({ readiness: "ready", ach_readiness: "restricted" }));
        expect(s.cardAvailable).toBe(true);
        expect(s.bankAvailable).toBe(false);
        expect(s.attention).toMatch(/card payments are ready/i);
    });

    it("fully ready needs no sentence at all", () => {
        const s = describeInstallation(row({ readiness: "ready", ach_readiness: "ready" }));
        expect(s.attention).toBeNull();
        expect(s.bankAvailable).toBe(true);
    });

    it("an unfinished setup still says so", () => {
        const s = describeInstallation(row({ readiness: "onboarding_incomplete" }));
        expect(s.attention).toMatch(/setup is not finished/i);
    });
});
