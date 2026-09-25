/**
 * ONE VALUE, ONE RULE — and the divergence that made this necessary.
 *
 * The platform carried TWO environment variables for the browser's Stripe key:
 *
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE       the original, and the one actually provisioned
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   added later by W2's card field, never provisioned
 *
 * Each half of the product read the one it was written with, so Add card refused with "payment
 * processing is not configured for this environment" while the key sat correctly configured, in the
 * right Vercel scope, correctly embedded in the build — under the other name. The operator was told
 * to provision something they already had. Measured on deployed staging: the build had inlined a
 * real `pk_test_` literal for the legacy name, and nothing at all for the canonical one.
 *
 * These lock the resolution rule and, more importantly, the reason both names are spelled out
 * statically in the source.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    resolvePublishableFromEnv,
    stripePublishableKey,
} from "@/lib/financials/payments/stripePublishableKey";

afterEach(() => { vi.unstubAllEnvs(); });

describe("either name resolves, and the canonical one wins", () => {
    it("uses the canonical name when it is set", () => {
        const r = resolvePublishableFromEnv({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_canonical" });
        expect(r.key).toBe("pk_test_canonical");
        expect(r.variable).toBe("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    });

    /* The case that was actually broken in production. */
    it("falls back to the legacy name, which is what is deployed", () => {
        const r = resolvePublishableFromEnv({ NEXT_PUBLIC_STRIPE_PUBLISHABLE: "pk_test_legacy" });
        expect(r.key).toBe("pk_test_legacy");
        expect(r.variable).toBe("NEXT_PUBLIC_STRIPE_PUBLISHABLE");
    });

    it("prefers the canonical name when both are set, so provisioning it migrates cleanly", () => {
        const r = resolvePublishableFromEnv({
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_canonical",
            NEXT_PUBLIC_STRIPE_PUBLISHABLE: "pk_test_legacy",
        });
        expect(r.key).toBe("pk_test_canonical");
        expect(r.variable).toBe("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    });

    it("reports no source when neither is set", () => {
        const r = resolvePublishableFromEnv({});
        expect(r.key).toBe("");
        expect(r.variable).toBeNull();
    });

    it("treats whitespace as unset rather than as a key", () => {
        const r = resolvePublishableFromEnv({
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "   ",
            NEXT_PUBLIC_STRIPE_PUBLISHABLE: "pk_test_legacy",
        });
        expect(r.key).toBe("pk_test_legacy");
    });

    it("applies the same rule through the browser entry point", () => {
        vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
        vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE", "pk_test_legacy");
        expect(stripePublishableKey()).toBe("pk_test_legacy");
    });
});

describe("the build-time substitution rule the source depends on", () => {
    /*
     * THE TRICK, LOCKED. `NEXT_PUBLIC_*` is substituted into the browser bundle at BUILD time and
     * ONLY for a static member expression. `process.env[name]` compiles to a lookup on a shim that
     * is empty in the browser — so a helper taking the variable name as an argument would resolve to
     * nothing in production while passing every test in Node.
     *
     * This asserts over the source because the property being protected is a property of how the
     * code is WRITTEN, which no runtime test in this environment can observe.
     */
    const src = readSource();
    function readSource(): string {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(join(process.cwd(), "lib/financials/payments/stripePublishableKey.ts"), "utf8");
        /*
         * PROSE REMOVED BEFORE ASSERTING. That file explains at length why `process.env[name]` must
         * never be used — and the first version of this case matched that very sentence and failed
         * against correct code. A file that documents the thing it forbids cannot be checked as raw
         * text; the same rule the prepaid presentation tests already learned.
         */
        return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    }

    it("spells both names out as static member expressions", () => {
        expect(src).toContain("process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
        expect(src).toContain("process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE ");
    });

    it("never reaches process.env through a computed key", () => {
        expect(src, "a computed lookup is not substituted and resolves to nothing in the browser")
            .not.toMatch(/process\.env\[/);
    });
});

describe("no component reads the variables directly any more", () => {
    function code(rel: string): string {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        return readFileSync(join(process.cwd(), rel), "utf8");
    }

    /* One rule, one place. A second reader is how the two names diverged in the first place. */
    it("routes every surface through the resolver", () => {
        for (const rel of [
            "components/operationalCards/PaymentMethodSetupField.tsx",
            "components/admin/focusPanel/cards/CardCollectionField.tsx",
            "components/admin/AdminCollectPaymentModal.tsx",
            "app/debug/stripe/page.tsx",
        ]) {
            const text = code(rel);
            expect(text, `${rel} uses the resolver`).toContain("stripePublishableKey()");
            expect(text, `${rel} reads no publishable variable directly`)
                .not.toMatch(/process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE/);
        }
    });
});
