/**
 * THE CONFIGURATION CONTRACT, ANSWERABLE WITHOUT SPENDING MONEY TO FIND IT.
 *
 * Every requirement in this contract was discovered by an operator pressing a financial control and
 * meeting a refusal. Each refusal was correct and fail-closed; the problem was that running into one
 * was the only way to learn it existed.
 *
 * Two things these lock, and the second is the one that actually cost time:
 *   1. presence and mode are reported, and a VALUE never is
 *   2. `NEXT_PUBLIC_*` is a BUILD-time fact, so a server read proves nothing about the browser
 */
import { describe, expect, it } from "vitest";

import {
    computePaymentsConfigurationHealth,
    stripeModeOf,
} from "@/lib/financials/payments/paymentsConfigurationHealth";

const full = {
    STRIPE_SECRET_KEY: "sk_test_51ABCsecretmaterialthatmustnevercomeback",
    STRIPE_WEBHOOK_SECRET: "whsec_secretmaterialthatmustnevercomeback",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_51ABCpublishable",
    NEXT_PUBLIC_APP_URL: "https://staging.workwithalloy.com",
    CRON_SECRET: "cronsecretmaterial",
};

describe("no credential value ever comes back", () => {
    /*
     * THIS ASSERTION WAS WEAKER THAN IT CLAIMED, AND A PLANTED LEAK WALKED THROUGH IT.
     *
     * It checked the full value and then a hand-written alternation of 13-character prefixes. A
     * "helpful" `secret.slice(0, 12)` added to the payload passed all ten cases — one character
     * short of the pattern. A test that says "not even a truncation" and then hard-codes the
     * truncation lengths it will catch is giving false assurance about the highest-stakes claim in
     * this file.
     *
     * It now slides an 8-character window over every secret, so ANY contiguous run of key material
     * fails regardless of where it was cut. The `test`/`live` mode words are derived, not sliced,
     * and are deliberately short enough to be meaningless on their own.
     */
    it("returns presence and mode, and never any run of key material", () => {
        const h = computePaymentsConfigurationHealth(full);
        const serialised = JSON.stringify(h);

        const WINDOW = 8;
        for (const [name, secret] of Object.entries(full)) {
            if (name === "NEXT_PUBLIC_APP_URL") continue; // a public origin, legitimately echoed nowhere
            for (let i = 0; i + WINDOW <= secret.length; i += 1) {
                const run = secret.slice(i, i + WINDOW);
                expect(
                    serialised.includes(run),
                    `${name}: a ${WINDOW}-character run of key material reached the payload ("${run}")`,
                ).toBe(false);
            }
        }

        expect(h.providerApi.status).toBe("present");
        expect(h.providerApi.mode).toBe("test");
    });

    it("reads the mode from the documented key format alone", () => {
        expect(stripeModeOf("sk_test_x")).toBe("test");
        expect(stripeModeOf("pk_live_x")).toBe("live");
        expect(stripeModeOf("rk_test_x")).toBe("test");
        expect(stripeModeOf("")).toBe("unknown");
        expect(stripeModeOf("something_else")).toBe("unknown");
    });
});

describe("each input is reported on its own", () => {
    it("says the runtime is ready when everything the server needs is present", () => {
        const h = computePaymentsConfigurationHealth(full);
        expect(h.serverReady).toBe(true);
        expect(h.modeCoherent).toBe(true);
    });

    it("names a missing provider key without guessing at the cause", () => {
        const h = computePaymentsConfigurationHealth({ ...full, STRIPE_SECRET_KEY: "" });
        expect(h.providerApi.status).toBe("absent");
        expect(h.providerApi.variable).toBe("STRIPE_SECRET_KEY");
        expect(h.serverReady).toBe(false);
    });

    it("treats a missing webhook secret as not ready, because every delivery would be rejected", () => {
        const h = computePaymentsConfigurationHealth({ ...full, STRIPE_WEBHOOK_SECRET: undefined });
        expect(h.webhookVerification.status).toBe("absent");
        expect(h.serverReady).toBe(false);
    });

    /* The wake endpoint accepts either credential, so either one admits the clock. */
    it("accepts either scheduled-work credential", () => {
        const onlyCron = computePaymentsConfigurationHealth({ ...full, CRON_SECRET: undefined, INTERNAL_CRON_TOKEN: "t" });
        expect(onlyCron.scheduledWorkAdmission.status).toBe("present");
        const neither = computePaymentsConfigurationHealth({ ...full, CRON_SECRET: undefined, INTERNAL_CRON_TOKEN: undefined });
        expect(neither.scheduledWorkAdmission.status).toBe("absent");
        expect(neither.serverReady).toBe(false);
    });

    it("reports the return origin separately, since its absence silently sends Stripe to localhost", () => {
        const h = computePaymentsConfigurationHealth({ ...full, NEXT_PUBLIC_APP_URL: undefined });
        expect(h.returnOrigin.status).toBe("absent");
    });
});

describe("mode coherence", () => {
    it("refuses a test secret paired with a live publishable key", () => {
        const h = computePaymentsConfigurationHealth({
            ...full,
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_x",
        });
        expect(h.modeCoherent).toBe(false);
        expect(h.serverReady).toBe(false);
    });

    /*
     * TWO UNKNOWNS ARE NOT A CONTRADICTION. Calling that incoherent would send somebody hunting a
     * mismatch that does not exist — the failure mode of a check that guesses.
     */
    it("does not invent a mismatch it cannot see", () => {
        const h = computePaymentsConfigurationHealth({
            ...full,
            STRIPE_SECRET_KEY: "opaque",
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "also_opaque",
        });
        expect(h.modeCoherent).toBe(true);
    });
});

describe("the build-time trap is encoded, not just known", () => {
    /*
     * This is the fact that cost two round trips: the server can see the variable while the browser
     * bundle does not have it, because NEXT_PUBLIC_* is inlined when the app is BUILT.
     */
    it("carries the rebuild caveat on the browser key and on nothing else", () => {
        const h = computePaymentsConfigurationHealth(full);
        expect(h.browserTokenization.caveat).toMatch(/BUILD time/i);
        expect(h.browserTokenization.caveat).toMatch(/rebuild/i);
        expect(h.browserTokenization.status).toBe("present");
        /* Server-visible must NOT make the runtime "ready" on the browser's behalf. */
        const withoutBrowserKey = computePaymentsConfigurationHealth({
            ...full,
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
        });
        expect(withoutBrowserKey.browserTokenization.status).toBe("absent");
        expect(
            withoutBrowserKey.serverReady,
            "serverReady is about the SERVER; the browser key is reported separately",
        ).toBe(true);
    });
});
