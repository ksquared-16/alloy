import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS,
} from "@/lib/financials/payments/stripeElementsPresentation";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe a rule; only executable source may satisfy one. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SETUP = "components/operationalCards/PaymentMethodSetupField.tsx";
const PRESENTATION = "lib/financials/payments/stripeElementsPresentation.ts";
const COLLECT = "components/admin/focusPanel/cards/CardCollectionField.tsx";

describe("1. the postal code is presented in Alloy's Add Card experience", () => {
    it("renders an Alloy-owned field with an operator label", () => {
        const src = read(SETUP);
        expect(src).toMatch(/data-testid="payment-method-setup-postal"/);
        expect(src).toMatch(/Billing ZIP \/ postal code/);
    });

    it("offers it for a card and not for a bank account", () => {
        /* A postal code is a card-verification input; a bank setup neither asks nor benefits. */
        const src = code(SETUP);
        const at = src.indexOf('data-testid="payment-method-setup-postal-field"');
        expect(at).toBeGreaterThan(-1);
        expect(src.slice(at - 200, at)).toMatch(/rail === "card"/);
    });
});

describe("2. it is required for the card setup flow", () => {
    it("refuses to start confirmation without it", () => {
        const src = code(SETUP);
        expect(src).toMatch(/rail === "card" && !postalCode\.trim\(\)/);
        expect(src).toMatch(/Enter the billing ZIP or postal code for this card\./);
    });

    it("keeps Save card unavailable until it is entered", () => {
        const src = code(SETUP);
        const at = src.indexOf('data-testid="payment-method-setup-submit"');
        expect(at).toBeGreaterThan(-1);
        const end = src.indexOf('data-testid="payment-method-setup-cancel"', at);
        expect(src.slice(at, end)).toMatch(/rail === "card" && !postalCode\.trim\(\)/);
    });

    it("refuses BEFORE contacting the provider", () => {
        /* Starting the confirmation only to be told about a field Alloy owns wastes a round trip
           and reports an Alloy problem in Stripe's voice. */
        const src = code(SETUP);
        const guard = src.indexOf("Enter the billing ZIP or postal code");
        const confirm = src.indexOf("stripe.confirmSetup");
        expect(guard).toBeGreaterThan(-1);
        expect(confirm).toBeGreaterThan(guard);
    });
});

describe("3. it is passed to Stripe at confirmation, through the supported contract", () => {
    it("uses payment_method_data.billing_details.address.postal_code", () => {
        const src = code(SETUP);
        expect(src).toMatch(/payment_method_data/);
        expect(src).toMatch(/billing_details:\s*\{\s*address:\s*\{\s*postal_code/);
    });

    it("tells the Element NOT to collect it, so nothing overrides the operator's value", () => {
        /*
         * Stripe documents that details collected by Elements override values passed at confirm.
         * Leaving collection on `auto` would mean racing that override for a field the operator
         * typed; `never` is the documented contract for supplying it yourself.
         */
        const src = code(PRESENTATION);
        expect(src).toMatch(/postalCode:\s*"never"/);
        expect(src).toMatch(/alloyCollectsPostalCode/);
    });

    it("scopes that option to SETUP, leaving collection's own configuration alone", () => {
        /*
         * A surface that stopped collecting a field without also supplying it at confirm would
         * fail at the last step. The collection surface does not opt in.
         */
        const src = code(COLLECT);
        expect(src).not.toMatch(/alloyCollectsPostalCode/);
    });

    it("sends it only for a card", () => {
        const src = code(SETUP);
        expect(src).toMatch(/rail === "card" && zip/);
    });
});

describe("4. PAN and CVC remain exclusively inside Stripe", () => {
    it("Alloy's own inputs are the postal code and nothing else", () => {
        const src = read(SETUP);
        const inputs = src.match(/<input[\s\S]*?\/>/g) ?? [];
        expect(inputs.length, "exactly one Alloy-owned input").toBe(1);
        expect(inputs[0]).toMatch(/payment-method-setup-postal/);
        expect(inputs[0]).toMatch(/autoComplete="postal-code"/);
    });

    it("never names a card number or security code as an Alloy field", () => {
        const src = code(SETUP);
        expect(src).not.toMatch(/cardnumber|cc-number|card_number|\bcvc\b/i);
    });

    it("reaches no iframe and injects nothing into the Element", () => {
        const src = code(SETUP);
        expect(src).not.toMatch(/iframe/i);
        expect(src).not.toMatch(/__PrivateStripe|contentWindow|postMessage/);
    });
});

describe("5. the service address is never used as billing truth", () => {
    it("does not prefill the postal code from anything", () => {
        /* The field starts empty on purpose: Alloy's household address is a SERVICE location. */
        const src = code(SETUP);
        expect(src).toMatch(/useState<string>\(""\)/);
        expect(src).not.toMatch(/postalCode.*=.*(payer|household|location|address)\w*\./i);
    });

    it("the shared prefill still offers only a name", () => {
        const src = code(PRESENTATION);
        const at = src.indexOf("export type OperatorBillingPrefill");
        expect(at).toBeGreaterThan(-1);
        /* Bound by the type's OWN closing brace: a fixed window ran on into the next
           declaration and read its text as if it belonged to this one. */
        const close = src.indexOf("};", at);
        expect(close).toBeGreaterThan(at);
        const block = src.slice(at, close);
        expect(block).toMatch(/name\?/);
        expect(block, "no address may be asserted as billing").not.toMatch(/address|postal|line1|city/i);
    });

    it("says plainly that the billing ZIP may differ from the address on file", () => {
        const src = read(SETUP);
        expect(src).toMatch(/may differ from the family/);
    });
});

describe("6. Link and wallet consumer UI remain absent", () => {
    it("keeps every wallet declined", () => {
        expect(ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS.wallets).toEqual({
            link: "never",
            applePay: "never",
            googlePay: "never",
        });
    });

    it("still does not suppress mandates or legal terms", () => {
        expect(ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS).not.toHaveProperty("terms");
    });

    it("keeps the Alloy framing and the Bend Pine primary", () => {
        const src = code(SETUP);
        expect(src).toMatch(/payment-method-setup-heading/);
        expect(src).toMatch(/bg-alloy-bend-pine/);
    });
});
