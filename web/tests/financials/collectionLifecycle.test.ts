/**
 * THREAD 8C SLICE 2 — the words a collection is allowed to use.
 *
 * The dangerous one is "Received". It must be reachable ONLY from canonical recognition, because it
 * is the word that means a family's money arrived. These assert that no arrangement of provider
 * states can produce it, which is what makes `processing ≠ paid` a property of the system rather
 * than of whichever template rendered last.
 */
import { describe, expect, it } from "vitest";

import {
    collectionLifecycle,
    lifecycleLabel,
    meansSettledCash,
    type CollectionRail,
} from "@/lib/financials/payments/collectionLifecycle";

const PROVIDER_STATES = [
    "initiated",
    "requires_payment_method",
    "requires_action",
    "processing",
    "succeeded",
    "failed",
    "canceled",
];

describe("no provider state alone can mean money arrived", () => {
    it.each(PROVIDER_STATES)("%s without canonical recognition is never received", (processorState) => {
        for (const rail of ["card", "ach"] as CollectionRail[]) {
            const state = collectionLifecycle({ rail, processorState, canonicallyRecognized: false });
            expect(state, `${rail}/${processorState} must not read as received`).not.toBe("received");
            expect(meansSettledCash(state), `${rail}/${processorState} must not mean settled cash`).toBe(false);
            expect(lifecycleLabel(state, rail).toLowerCase()).not.toMatch(/\bpaid\b/);
        }
    });

    it("succeeded-but-unrecognised is finalizing, not paid and not failed", () => {
        const state = collectionLifecycle({ rail: "ach", processorState: "succeeded", canonicallyRecognized: false });
        expect(state).toBe("finalizing");
        const label = lifecycleLabel(state, "ach");
        expect(label).toMatch(/finalizing/i);
        expect(label.toLowerCase()).not.toMatch(/failed/);
    });

    it("only canonical recognition produces received", () => {
        const state = collectionLifecycle({ rail: "ach", processorState: "succeeded", canonicallyRecognized: true });
        expect(state).toBe("received");
        expect(meansSettledCash(state)).toBe(true);
    });
});

describe("ACH says what it is actually waiting for", () => {
    it("microdeposit verification is verification required, not a challenge to finish now", () => {
        const state = collectionLifecycle({
            rail: "ach", processorState: "requires_action",
            providerActionType: "verify_with_microdeposits", canonicallyRecognized: false,
        });
        expect(state).toBe("verification_required");
        expect(lifecycleLabel(state, "ach")).toBe("Verification required");
    });

    it("a card challenge stays action required", () => {
        const state = collectionLifecycle({
            rail: "card", processorState: "requires_action",
            providerActionType: "use_stripe_sdk", canonicallyRecognized: false,
        });
        expect(state).toBe("action_required");
    });

    it("processing on a bank debit says settlement takes time without promising a date", () => {
        const label = lifecycleLabel(
            collectionLifecycle({ rail: "ach", processorState: "processing", canonicallyRecognized: false }),
            "ach",
        );
        expect(label).toMatch(/processing/i);
        expect(label).toMatch(/days/i);
        // No invented settlement date, and never a claim the money is here.
        expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(label.toLowerCase()).not.toMatch(/\bpaid\b|\breceived\b/);
    });
});

describe("a returned payment outranks the receipt it reverses", () => {
    it("reads as returned, never as received and never as a refund", () => {
        const state = collectionLifecycle({
            rail: "ach", processorState: "succeeded",
            canonicallyRecognized: true, providerReversed: true,
        });
        expect(state).toBe("returned");
        expect(meansSettledCash(state), "returned money is not settled cash").toBe(false);
        const label = lifecycleLabel(state, "ach");
        expect(label).toMatch(/returned/i);
        expect(label.toLowerCase(), "a return is not an operator refund").not.toMatch(/refund/);
    });
});
