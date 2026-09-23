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

describe("this is a configuration surface, not an integration debugger", () => {
    /*
     * THIS ASSERTION REVERSED, DELIBERATELY.
     *
     * It used to require the `acct_…` reference to sit behind a closed "Technical details"
     * disclosure. A Director product decision removed it from the chapter entirely: quiet was still
     * the wrong surface for it. Those facts remain readable through the canonical diagnostics and
     * audit authorities, which is where engineering should be looking.
     */
    it("renders no provider account reference anywhere", () => {
        expect(code).not.toContain("providerAccountRef");
        expect(code).not.toContain("payments-provider-ref\"");
        expect(code).not.toMatch(/acct_/);
    });

    it("has no technical-details disclosure, here or moved elsewhere", () => {
        expect(code).not.toContain("payments-provider-details");
        expect(code).not.toMatch(/Technical details/);
        expect(code, "and no replacement disclosure took its place").not.toMatch(/<details/);
    });

    it("exposes no raw provider vocabulary as copy", () => {
        expect(code).not.toMatch(/charges_enabled|details_submitted|currently_due|past_due|disabled_reason/);
        expect(code).not.toMatch(/us_bank_account_ach_payments|card_payments/);
    });

    it("still answers the questions an operator actually arrives with", () => {
        for (const probe of ["payments-provider-status", "payments-rail-card", "payments-rail-bank"]) {
            expect(code).toContain(probe);
        }
    });
});

describe("only one primary state at a time", () => {
    /*
     * "Checking with the payment provider…" WAS SET AND NEVER CLEARED, so the chapter showed it
     * beside the resolved state it had already computed — two statuses at once, one of them stale.
     */
    it("shows the checking indicator only while a read is in flight", () => {
        expect(code).toContain("payments-provider-refreshing");
        expect(code, "it is driven by a flag, not by a sticky notice")
            .toMatch(/refreshing\s*\?/);
        expect(code).toMatch(/setRefreshing\(true\)/);
    });

    it("always clears the indicator when the read settles, however it settles", () => {
        expect(code, "a finally clause, so a refusal clears it too").toMatch(/finally\([\s\S]{0,120}setRefreshing\(false\)/);
    });

    it("reports a failed refresh rather than silently stopping", () => {
        expect(code).toMatch(/could not be reached/i);
        expect(code).toMatch(/Refresh status to try again/i);
    });

    /* The expired-link notice is a RESULT, not a progress report, so it must survive the refresh. */
    it("keeps the expired-link notice, which is an answer rather than progress", () => {
        expect(code).toMatch(/had expired/i);
    });
});
