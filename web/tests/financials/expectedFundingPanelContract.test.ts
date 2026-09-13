/**
 * WHAT THE EXPECTED-FUNDING SURFACE IS ALLOWED TO SAY AND SEND.
 *
 * Expected funding is the easiest figure in Financials to misrepresent. It looks like money, it is
 * denominated in money, and it arrives next to money that was actually received — but nothing has
 * been paid, no claim has been submitted, no agency has committed, and the responsible party has
 * not stopped being responsible. Every pin here is about keeping those apart.
 *
 * Source-level, because the failures they prevent are wiring failures: a payload that anchors to
 * the wrong thing, a preview read from the wrong field, a free-text agency name that stops matching
 * the authorization it was supposed to be about. None of them throws, and all of them are invisible
 * in a green run.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../..");
const panel = fs.readFileSync(
    path.join(root, "app/adminV2/financials/FinancialsExpectedFundingPanel.tsx"),
    "utf8",
);
const route = fs.readFileSync(path.join(root, "app/api/admin/financials/funding-sources/route.ts"), "utf8");
const sources = fs.readFileSync(path.join(root, "lib/financials/responsibility/fundingSources.ts"), "utf8");
const service = fs.readFileSync(
    path.join(root, "lib/financials/responsibility/expectedFundingService.ts"),
    "utf8",
);

describe("the expected funding panel", () => {
    /*
     * THE ANCHOR IS THE SHARE. `configureExpectedFunding` refuses funding that hangs off nothing,
     * and an account-level control would have to invent an answer to "whose share?" — the first
     * party, the largest, or all of them, each of them wrong.
     */
    it("anchors to a responsibility share, never to a charge or an account", () => {
        expect(panel).toMatch(/share_id: args\.shareId/);
        expect(panel, "a charge is not a thing funding attaches to").not.toMatch(/charge_id:/);
        expect(panel, "nor is an account").not.toMatch(/customer_id:/);
    });

    it("sends only a basis the capability represents exactly", () => {
        expect(panel).toMatch(/basis: "fixed_amount"/);
        expect(panel).toMatch(/expected_amount_cents: args\.expectedAmountCents/);
    });

    it("takes the preview from where a registry-owned command puts it", () => {
        expect(panel).toContain("execution_result?.preview");
    });

    it("cannot confirm before the action has said what will change", () => {
        expect(panel).toMatch(/disabled=\{busy !== null \|\| !preview\}/);
    });

    /*
     * THE THIRD FIGURE. Responsible, expected, and what is STILL theirs. Without the last line an
     * operator reads an expectation as a reduction, which is the one thing expected funding must
     * never be mistaken for.
     */
    it("says what remains the party's responsibility after the expectation", () => {
        expect(panel).toMatch(/still their responsibility/i);
    });

    /*
     * The CODE, not the commentary. The doc comment above this component necessarily uses the words
     * "paid" and "received" to say what expected funding is not; the assertion is about what an
     * operator actually reads, so comments are stripped before it looks.
     */
    it("never presents an expectation as money that arrived", () => {
        const rendered = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(rendered, "an expectation is not a receipt").not.toMatch(/\b(received|paid|applied)\b/i);
        expect(panel).toMatch(/not a payment/i);
    });

    /*
     * AN AGENCY IS PICKED, NOT TYPED. Two spellings of one agency is how an expectation stops
     * matching the authorization it is about, and the mismatch surfaces much later as a claim that
     * comes back empty — read as a missing authorization rather than a missing join.
     */
    it("requires a canonical agency for government money, and sends its id as the reference", () => {
        expect(panel).toMatch(/Choose the funding agency/i);
        expect(panel).toMatch(/reference: needsAgency \? \(agency\?\.id \?\? null\) : null/);
    });

    it("does not offer to invent an agency when the org has none", () => {
        expect(panel).toMatch(/no funding agencies configured/i);
    });
});

describe("the funding source read", () => {
    it("quotes the capability's own vocabulary rather than keeping a second copy", () => {
        for (const key of [
            "government_subsidy",
            "employer_sponsorship",
            "scholarship",
            "corporate_program",
            "private_pay",
        ]) {
            expect(sources, `${key} is part of the capability's vocabulary`).toContain(key);
            expect(service, `${key} must still be accepted by the service`).toContain(key);
        }
    });

    /*
     * ONE TYPE HAS CANONICAL IDENTITY IN THIS PLATFORM. There is no employers table and no
     * scholarships table; a Financials-local registry for them would become a second system of
     * record for parties the platform may later identify properly.
     */
    it("claims canonical identity only for the type that has a registry", () => {
        expect(sources).toMatch(/CANONICALLY_IDENTIFIED_TYPES[^=]*=\s*\[\s*"government_subsidy"\s*\]/);
        expect(sources).toContain("financial_funding_agencies");
    });

    it("is a permitted read, gated like every other financial read", () => {
        expect(route).toContain("assertFinancialsReadAllowed");
        expect(route).toContain("error: allowed.message");
        expect(route).toContain("required_permission: allowed.requiredPermission");
        expect(route, "the org comes from the gate, never the request").toContain("ctx.orgId");
    });

    it("fails closed rather than reporting an unreadable registry as empty", () => {
        expect(sources).toMatch(/funding agencies could not be read/);
    });
});

describe("the expected funding service", () => {
    /*
     * ONE ACTIVE EXPECTATION PER SOURCE, PER ANCHOR. The function only ever INSERTed, so managing
     * funding twice left two active rows and the agency was expected to cover the same money twice.
     */
    it("supersedes the previous expectation for the same anchor and source", () => {
        expect(service).toMatch(/state: "superseded"/);
        expect(service).toMatch(/funding_source_type", input\.fundingSourceType/);
    });

    it("retires the predecessor only after its replacement exists", () => {
        const insertAt = service.indexOf(".insert(");
        const supersedeAt = service.indexOf('state: "superseded"');
        expect(insertAt, "the insert must come first").toBeGreaterThan(0);
        expect(
            supersedeAt,
            "retiring first would leave the share with no active expectation if the insert failed",
        ).toBeGreaterThan(insertAt);
    });

    it("keeps the predecessor rather than deleting it", () => {
        expect(service, "a variance is explained by what was expected before").not.toMatch(
            /from\("financial_expected_funding"\)\s*\.delete\(/,
        );
    });
});
