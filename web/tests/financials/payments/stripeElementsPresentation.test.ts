import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    ALLOY_ELEMENTS_APPEARANCE,
    ALLOY_ELEMENTS_FONTS,
    ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS,
} from "@/lib/financials/payments/stripeElementsPresentation";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/* Comments describe the rule; only executable source may satisfy it. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SETUP_FIELD = "components/operationalCards/PaymentMethodSetupField.tsx";
const COLLECT_FIELD = "components/admin/focusPanel/cards/CardCollectionField.tsx";
const METHODS_SECTION = "components/operationalCards/PaymentMethodsSection.tsx";

describe("the operator Payment Element declines consumer checkout", () => {
    it("suppresses Link, Apple Pay and Google Pay through Stripe's own wallets option", () => {
        expect(ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS.wallets).toEqual({
            link: "never",
            applePay: "never",
            googlePay: "never",
        });
    });

    it("does NOT suppress terms — mandates and legal agreements stay on Stripe's default", () => {
        /*
         * `terms: never` is a supported option and is exactly the one we must not use. Hiding a
         * mandate is the single customization here that could harm a payer, so its ABSENCE is
         * the assertion.
         */
        expect(ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS).not.toHaveProperty("terms");
        expect(code(SETUP_FIELD)).not.toMatch(/terms\s*:/);
    });

    it("asks for the postal code where required rather than never, so confirm owes Stripe nothing", () => {
        /*
         * `never` would make the CALLER responsible for supplying the omitted billing details at
         * confirm time. A surface that never collected them would then fail at the last step,
         * which is why `if_required` is the correct choice and not merely the softer one.
         */
        const billing = ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS.fields?.billingDetails;
        expect(billing?.address).toBe("if_required");
        expect(billing).not.toHaveProperty("never");
    });

    it("both Elements surfaces use the one shared configuration, so they cannot drift", () => {
        for (const file of [SETUP_FIELD, COLLECT_FIELD]) {
            const src = code(file);
            expect(src, `${file} creates its element through the shared factory`).toMatch(
                /createAlloyOperatorPaymentElement\(/,
            );
            expect(src, `${file} passes the shared appearance`).toMatch(/ALLOY_ELEMENTS_APPEARANCE/);
            /* Creating the element directly is how one surface quietly stops obeying the module. */
            expect(src, `${file} does not create a Payment Element of its own`).not.toMatch(
                /\.create\(\s*["']payment["']/,
            );
        }
    });
});

describe("the appearance is Alloy's, expressed in supported Stripe configuration", () => {
    it("carries the real Bend Pine value, not the mislabeled alloy-pine alias", () => {
        /*
         * `--color-alloy-pine` is #273F52 (Midnight Forge) under a misleading name; globals.css
         * says so in as many words. Bend Pine is #00A283, and this surface's accent must be that.
         */
        expect(ALLOY_ELEMENTS_APPEARANCE.variables.colorPrimary).toBe("#00A283");
        expect(ALLOY_ELEMENTS_APPEARANCE.variables.colorPrimary).not.toBe("#273F52");
    });

    it("uses Alloy's ink and Ember rather than Stripe's defaults", () => {
        expect(ALLOY_ELEMENTS_APPEARANCE.variables.colorText).toBe("#18273A");
        expect(ALLOY_ELEMENTS_APPEARANCE.variables.colorDanger).toBe("#BC4300");
        /* Stripe's stock blue must not survive into an Alloy surface. */
        expect(JSON.stringify(ALLOY_ELEMENTS_APPEARANCE)).not.toMatch(/#0570de/i);
    });

    it("serves Poppins to the iframe, because the iframe cannot see a self-hosted parent font", () => {
        expect(ALLOY_ELEMENTS_APPEARANCE.variables.fontFamily).toMatch(/^Poppins,/);
        expect(ALLOY_ELEMENTS_FONTS[0]?.cssSrc).toMatch(/family=Poppins/);
    });

    it("uses literal colors — a CSS variable resolves to nothing inside Stripe's iframe", () => {
        expect(JSON.stringify(ALLOY_ELEMENTS_APPEARANCE)).not.toMatch(/var\(--color-alloy/);
    });

    it("styles only Stripe's documented class names, never iframe internals", () => {
        const allowed = new Set([
            ".Input",
            ".Input:focus",
            ".Input--invalid",
            ".Label",
            ".Error",
            ".Tab",
            ".Tab:hover",
            ".Tab--selected",
        ]);
        for (const selector of Object.keys(ALLOY_ELEMENTS_APPEARANCE.rules)) {
            expect(allowed.has(selector), `${selector} is a documented Appearance selector`).toBe(true);
        }
    });

    it("reaches Stripe's fields ONLY through appearance — no CSS targets the iframe", () => {
        for (const file of [SETUP_FIELD, COLLECT_FIELD]) {
            const src = code(file);
            expect(src, `${file} does not style the provider iframe`).not.toMatch(/iframe/i);
            expect(src, `${file} does not reach into Stripe's DOM`).not.toMatch(/__PrivateStripe|StripeElement\s*\{/);
        }
    });
});

describe("the primary action is Alloy's, and the bank mandate is not the operator's to give", () => {
    it("saves a card with Bend Pine, matching the sibling Autopay actions", () => {
        const src = code(SETUP_FIELD);
        const at = src.indexOf('data-testid="payment-method-setup-submit"');
        expect(at).toBeGreaterThan(-1);
        /* Bound by the NEXT control, not a character count: the submit handler's body is long,
           and a fixed window stopped short of the className it was meant to read. */
        const end = src.indexOf('data-testid="payment-method-setup-cancel"', at);
        expect(end).toBeGreaterThan(at);
        const button = src.slice(at, end);
        expect(button, "the primary action is Bend Pine").toMatch(/bg-alloy-bend-pine/);
        /* Navy and the deep-ink midnight are both explicitly out for a primary action. */
        expect(button, "and is not navy or deep ink").not.toMatch(/bg-alloy-(navy|midnight|blue|slate)\b/);
    });

    it("offers the operator no way to add a bank account", () => {
        const src = code(METHODS_SECTION);
        expect(src).toMatch(/data-testid="payment-method-add-card"/);
        expect(
            src,
            "an operator control here would authorize somebody else's debit mandate",
        ).not.toMatch(/data-testid="payment-method-add-bank"/);
    });

    it("still says who does set up a bank account, so the absence reads as a boundary", () => {
        const src = read(METHODS_SECTION);
        expect(src).toMatch(/set up by the payer/);
    });
});
