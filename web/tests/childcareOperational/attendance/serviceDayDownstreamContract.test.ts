/**
 * The contract downstream threads will be held to.
 *
 * These tests exist to fail LOUDLY if someone later decides that a child on
 * authored vacation who walked in does not count for ratios, or that an
 * undeterminable day can be billed as an ordinary one. Both are one-line changes
 * and both are safety failures.
 */

import { describe, expect, it } from "vitest";
import {
    SERVICE_DAY_STANDING_CONTRACT,
    countsTowardsOccupancy,
    isSafeToTellAParent,
    serviceDayAssertions,
    serviceDayBillingInput,
} from "@/lib/childcareOperational/attendance/serviceDayDownstreamContract";
import type { ServiceDayState } from "@/lib/childcareOperational/attendance/serviceDayExpectations";

const ALL: ServiceDayState[] = [
    "here_now",
    "checked_out",
    "known_away",
    "closed",
    "not_arrived",
    "attended_despite_plan",
    "unknown",
];

describe("a child in the building counts, whatever the plan said", () => {
    it("counts an unexpected arrival towards occupancy and ratios", () => {
        // Getting this wrong leaves a real child out of a real ratio.
        expect(countsTowardsOccupancy("attended_despite_plan")).toBe(true);
        expect(serviceDayAssertions("attended_despite_plan").physicallyPresent).toBe(true);
    });

    it("still records that nobody expected her", () => {
        expect(serviceDayAssertions("attended_despite_plan").expectedByPlan).toBe(false);
        expect(serviceDayAssertions("attended_despite_plan").warrantsOperatorAttention).toBe(true);
    });

    it("counts nobody who is not physically here", () => {
        for (const state of ["known_away", "closed", "not_arrived", "checked_out", "unknown"] as ServiceDayState[]) {
            expect(countsTowardsOccupancy(state)).toBe(false);
        }
    });
});

describe("an undeterminable day is never treated as an ordinary one", () => {
    it("tells billing to stop and ask", () => {
        expect(serviceDayBillingInput("unknown").requiresDetermination).toBe(true);
    });

    it("asks for no determination on any state we could actually read", () => {
        for (const state of ALL.filter((s) => s !== "unknown")) {
            expect(serviceDayBillingInput(state).requiresDetermination).toBe(false);
        }
    });

    it("is not safe to report to a parent as settled", () => {
        expect(isSafeToTellAParent("unknown")).toBe(false);
        for (const state of ALL.filter((s) => s !== "unknown")) {
            expect(isSafeToTellAParent(state)).toBe(true);
        }
    });
});

describe("the financial boundary", () => {
    it("hands billing inputs, never a decision", () => {
        const away = serviceDayBillingInput("known_away");
        expect(away).toMatchObject({ attended: false, plannedAbsence: true, closure: false });
        // Whether a notified absence is chargeable is billing's policy, and there
        // is deliberately no field here that could be mistaken for the answer.
        expect(Object.keys(away)).not.toContain("chargeable");
    });

    it("distinguishes a closure from an individual absence", () => {
        expect(serviceDayBillingInput("closed")).toMatchObject({ plannedAbsence: false, closure: true });
    });

    it("treats an unexpected arrival as attendance", () => {
        expect(serviceDayBillingInput("attended_despite_plan").attended).toBe(true);
    });
});

describe("standing is stated, so no consumer has to guess", () => {
    it("says plainly that a reading conveys no obligation", () => {
        expect(SERVICE_DAY_STANDING_CONTRACT.conveysObligation).toBe(false);
        expect(SERVICE_DAY_STANDING_CONTRACT.interpretationIgnoresStanding).toBe(true);
        // Standing belongs to the ledger, not to this product — a consumer that
        // hard-codes "these are always proposed" breaks the day an operator is
        // granted a governed authority.
        expect(SERVICE_DAY_STANDING_CONTRACT.standingResolvedByLedger).toBe(true);
        expect(SERVICE_DAY_STANDING_CONTRACT.standingWithoutGovernedAuthority).toBe("proposed");
    });
});

describe("every state has an answer", () => {
    it("leaves no state undefined for a downstream consumer", () => {
        // A missing entry reads as `undefined` and every boolean question then
        // answers "false" — including "is this child here", silently.
        for (const state of ALL) {
            expect(serviceDayAssertions(state)).toBeDefined();
            expect(typeof serviceDayAssertions(state).physicallyPresent).toBe("boolean");
        }
    });
});
