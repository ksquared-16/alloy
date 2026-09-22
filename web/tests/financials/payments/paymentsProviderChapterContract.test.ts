/**
 * THE PAYMENTS CHAPTER — the handoff, the failure, and the visual grammar.
 *
 * A human found this on deployed staging: pressing "Continue setup" turned the button into
 * "Opening…" and nothing ever opened. The cause was the execute envelope being read one level too
 * deep (see executeEnvelopeDetail.test.ts); these lock the SURFACE guarantees around it, which are
 * the ones that made the defect silent rather than visible.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
    join(process.cwd(), "components/adminV2/settings/financials/PaymentsProviderChapter.tsx"),
    "utf8",
);
/* Prose names the very things the markup must not do, so assertions run over code only. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("no control may strand the operator", () => {
    it("clears the loading state if the provider page does not open", () => {
        expect(code, "a navigation that does not happen must not read 'Opening…' for ever")
            .toMatch(/setTimeout\([\s\S]{0,200}setBusy\(null\)/);
        expect(code).toMatch(/pop-ups and/i);
    });

    it("says something true when a successful connect carries no link", () => {
        expect(code).toMatch(/did not return a setup link/i);
    });

    it("cannot leave the handler busy when something throws", () => {
        const run = code.slice(code.indexOf("const run = useCallback"));
        expect(run, "the handler is wrapped").toMatch(/try\s*{/);
        expect(run, "and the catch clears busy").toMatch(/catch[\s\S]{0,260}setBusy\(null\)/);
    });

    it("asks the provider for a fresh link on every attempt rather than reusing one", () => {
        /* Account Links are ephemeral; nothing here may cache one. */
        expect(code).not.toMatch(/onboarding_url[^\n]*use(State|Ref)/);
        expect(code).toMatch(/executeProviderCommand\(command, payload\)/);
    });
});

describe("the chapter speaks Financials, not its own dialect", () => {
    /* Measured across the sibling chapters: the canonical Financials primary is Bend Pine. */
    it("uses Bend Pine for the primary affirmative actions", () => {
        const connect = code.slice(code.indexOf("payments-provider-connect") - 700, code.indexOf("payments-provider-connect"));
        const cont = code.slice(code.indexOf("payments-provider-continue") - 700, code.indexOf("payments-provider-continue"));
        expect(connect).toContain("bg-alloy-bend-pine");
        expect(cont).toContain("bg-alloy-bend-pine");
    });

    it("has no navy or black primary button left in the chapter", () => {
        expect(code).not.toContain("bg-alloy-midnight ");
        expect(code).not.toMatch(/bg-alloy-midnight\b(?![/-])/);
        expect(code).not.toMatch(/bg-(black|slate-9|gray-9|neutral-9)/);
    });

    /*
     * NAMING THE PROVIDER IS ALLOWED; WEARING ITS CLOTHES IS NOT.
     *
     * "Stripe is this organization's payment provider" is a true sentence an operator needs, and an
     * earlier version of this case forbade the WORD and failed on that copy. What must not appear is
     * provider CHROME — its blue, its buttons, its brand surfaces.
     */
    it("carries no provider-branded chrome", () => {
        expect(code).not.toMatch(/bg-(blue|indigo|sky|cyan)-\d/);
        expect(code).not.toMatch(/text-(blue|indigo)-\d/);
        expect(code, "no provider brand token drives a style").not.toMatch(/stripe[-_]?(blue|brand|purple)/i);
    });

    /* Disconnecting is destructive; it must not compete with the primary action. */
    it("gives the destructive confirmation the established destructive treatment", () => {
        const confirm = code.slice(code.indexOf("payments-provider-disconnect-confirmed") - 500, code.indexOf("payments-provider-disconnect-confirmed"));
        expect(confirm).toMatch(/bg-red-\d00/);
        expect(confirm).not.toContain("bg-alloy-bend-pine");
    });

    it("keeps Refresh status as a quiet secondary", () => {
        const refresh = code.slice(code.indexOf("payments-provider-refresh") - 500, code.indexOf("payments-provider-refresh"));
        expect(refresh).toContain("border-alloy-stone");
        expect(refresh).not.toContain("bg-alloy-bend-pine");
    });
});

describe("the provider reference is diagnostic, not the subject", () => {
    it("keeps the account identifier out of the default hierarchy", () => {
        expect(code).toContain("payments-provider-details");
        /*
         * MATCH THE WHOLE ATTRIBUTE. `payments-provider-ref` is a PREFIX of
         * `payments-provider-refresh`, so a bare indexOf finds the Refresh button and measures the
         * wrong element entirely — which is how the first version of this case failed against
         * correct markup.
         */
        const at = code.indexOf('data-testid="payments-provider-ref"');
        expect(at, "the reference is rendered").toBeGreaterThan(-1);
        const before = code.slice(0, at);
        expect(before.lastIndexOf("<details"), "it sits inside a closed disclosure")
            .toBeGreaterThan(before.lastIndexOf("</details>"));
    });

    it("still answers the questions an operator actually arrives with", () => {
        for (const probe of ["payments-provider-status", "payments-rail-card", "payments-rail-bank"]) {
            expect(code).toContain(probe);
        }
    });
});
