/**
 * THE RULE ITSELF, AND THE CARD THAT READS IT (N2).
 *
 * `resolvePaymentSetup` is one consumer; the Focus Panel card's `vm.achAvailable` is the other, and
 * it is the one that decides whether the bank option in Take payment is selectable. Both go through
 * `railCollectionAvailable`, so the rule is locked once here and the card is locked against it.
 */
import { describe, expect, it } from "vitest";

import { railCollectionAvailable } from "@/lib/financials/payments/providerMerchant";

describe("railCollectionAvailable — merchant first, then the rail", () => {
    it("allows a rail only when the merchant can collect and the rail permits it", () => {
        expect(railCollectionAvailable({ readiness: "ready", achReadiness: "ready" }, "ach")).toBe(true);
        expect(railCollectionAvailable({ readiness: "ready", achReadiness: "ready" }, "card")).toBe(true);
    });

    it("refuses ACH when the merchant cannot collect at all, whatever the rail says", () => {
        for (const readiness of ["onboarding_incomplete", "restricted", "not_connected"]) {
            expect(
                railCollectionAvailable({ readiness, achReadiness: "ready" }, "ach"),
                `${readiness} must not offer a bank debit`,
            ).toBe(false);
            expect(railCollectionAvailable({ readiness, achReadiness: "ready" }, "card")).toBe(false);
        }
    });

    it("refuses ACH on a collectible merchant whose bank rail is not enabled", () => {
        expect(railCollectionAvailable({ readiness: "ready", achReadiness: null }, "ach")).toBe(false);
        expect(railCollectionAvailable({ readiness: "ready", achReadiness: "restricted" }, "ach")).toBe(false);
        /* …and the card rail is untouched by the other rail's unreadiness. */
        expect(railCollectionAvailable({ readiness: "ready", achReadiness: null }, "card")).toBe(true);
    });

    it("fails closed on unknown state and on no merchant", () => {
        expect(railCollectionAvailable({ readiness: "a_state_stripe_added_later", achReadiness: "ready" }, "ach")).toBe(false);
        expect(railCollectionAvailable({ readiness: null, achReadiness: "ready" }, "ach")).toBe(false);
        expect(railCollectionAvailable(null, "ach")).toBe(false);
        expect(railCollectionAvailable(undefined, "card")).toBe(false);
    });
});
