/**
 * 11C slice 2 — transaction control grammar, and the Details responsibility gap.
 *
 * The census that drove this slice was WRONG in the previous run: it measured
 * `components/operationalCards/FinancialsCard.tsx` and reported zero, while the real host is
 * `components/admin/focusPanel/cards/FinancialsCard.tsx`, which carried seven — every Adjustment
 * and every Payment control. The first lock here is therefore about the HOST, by path, so a
 * same-named file in another directory can never stand in for it again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Source with comments removed.
 *
 * Every ABSENCE assertion below runs through this. A rule asserted against raw text fires on the
 * sentence that explains the rule — the note saying "configure_responsibility remains the only
 * thing that writes" is evidence the rule is understood, not evidence it was broken.
 */
const code = (rel: string) =>
    src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The real hosts, by path. Named here so the census cannot drift to a look-alike again. */
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
const ADD = "components/operationalCards/AddChargeCommand.tsx";

const RAW_SELECT = /<select[\s>]/g;

describe("no native select survives in the transaction surfaces", () => {
    it("the real card host — Adjustment and Payment both live here — has none", () => {
        expect(src(CARD).match(RAW_SELECT) ?? []).toHaveLength(0);
    });

    it("every converted control names the canonical primitive", () => {
        const card = src(CARD);
        for (const testId of [
            "adjustment-agreement",
            "adjustment-source-charge",
            "adjustment-category",
            "adjustment-direction",
            "financials-payment-method",
            "financials-payment-payer",
            "payment-move-target",
        ]) {
            const at = card.indexOf(`testId="${testId}"`);
            expect(at, `${testId} is still present`).toBeGreaterThan(-1);
            /* The nearest opening tag before the testId must be the canonical control. */
            const before = card.slice(Math.max(0, at - 400), at);
            expect(before.lastIndexOf("<AlloySelect"), `${testId} uses AlloySelect`).toBeGreaterThan(-1);
        }
    });

    it("the payment method keeps its server-decided disabled option rather than hiding it", () => {
        const card = src(CARD);
        /*
         * Bank transfer stays VISIBLE AND DISABLED when the org cannot collect it. Dropping the
         * option would make the model read as though the rail did not exist; enabling it would
         * record money nobody collected.
         */
        expect(card).toMatch(/value: "ach"[\s\S]{0,260}disabled: !vm\.achAvailable/);
    });

    it("Add Charge still uses the multi-select for its one target", () => {
        expect(src(ADD)).toContain("<AlloyMultiSelect");
    });

    it("Add Charge's remaining controls are canonical too", () => {
        /* Template and the single-subject fallback were the last two native selects here. */
        expect(src(ADD).match(RAW_SELECT) ?? []).toHaveLength(0);
        expect(src(ADD)).toContain('testId="addcharge-template"');
        expect(src(ADD)).toContain('testId="addcharge-subject"');
    });

    it("Details carries no native select either — its only match is prose", () => {
        /*
         * The inherited census said Details held one. It does not: `LensFilter` already renders
         * AlloySelect, and the single `<select` match in the file is the word inside a comment
         * explaining why it is NOT used. Asserted against code so the distinction is kept.
         */
        expect(code(DETAIL).match(RAW_SELECT) ?? []).toHaveLength(0);
    });
});

describe("the whole Financials control set is canonical, not just the command surfaces", () => {
    /*
     * The seven surfaces the slice measured. Zero native selects across all of them — and asserted
     * against comment-stripped CODE, because three of the counts in the inherited census were the
     * word `<select>` inside a comment explaining why AlloySelect is used instead.
     */
    const SURFACES = [
        "components/operationalCards/AddChargeCommand.tsx",
        "components/admin/focusPanel/cards/FinancialsCard.tsx",
        "components/operationalCards/FinancialsDetailCard.tsx",
        "app/adminV2/financials/FinancialsResponsibilityPanel.tsx",
        "app/adminV2/financials/FinancialsExpectedFundingPanel.tsx",
        "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx",
        "app/adminV2/financials/sections/FinancialsBulkCharge.tsx",
    ];

    it.each(SURFACES)("%s carries no native select", (rel) => {
        expect(code(rel).match(RAW_SELECT) ?? []).toHaveLength(0);
    });

    it("Expected Funding keeps its optional agency as a real placeholder, not an absence", () => {
        /* "Choose an agency…" was an empty option; it is now the placeholder, still selectable. */
        expect(src("app/adminV2/financials/FinancialsExpectedFundingPanel.tsx"))
            .toContain('placeholder="Choose an agency…"');
    });
});

describe("Details can change who owes, not only filter by it", () => {
    it("renders the gear", () => {
        expect(src(DETAIL)).toContain('data-financials-manage-responsibility="gear"');
    });

    it("the gear sits with the filter, and the filter never mutates", () => {
        const detail = src(DETAIL);
        const filterAt = detail.indexOf('testId="responsible-party"');
        const gearAt = detail.indexOf('data-financials-manage-responsibility="gear"');
        expect(filterAt).toBeGreaterThan(-1);
        expect(gearAt).toBeGreaterThan(filterAt);
        /* Adjacent, not merely both present somewhere on a 1,000-line card. */
        expect(gearAt - filterAt).toBeLessThan(1600);
        /* The filter's own handler sets local filter state and nothing else. */
        expect(detail).toMatch(/testId="responsible-party"[\s\S]{0,220}setResponsibleParty\(v \|\| null\)/);
    });

    it("opens the ONE existing panel — not a second management UI", () => {
        const detail = src(DETAIL);
        expect(detail).toContain("<FinancialsResponsibilityPanel");
        expect(detail).toContain("hostedOpen={manageResponsibilityOpen}");
        /* No second writer, and no local arrangement authoring in the host. */
        expect(code(DETAIL)).not.toContain("billing.configure_responsibility");
        expect(code(DETAIL)).not.toContain("responsibility-arrangement");
    });

    it("Save re-reads committed truth instead of faking optimistic state", () => {
        const detail = src(DETAIL);
        expect(detail).toMatch(/onCommitted=\{async \(\) => \{[\s\S]{0,260}responsibilityAdmin\.onCommitted\(\)/);
        /* The card holds no copy of the arrangement, so there is nothing to optimistically set. */
        expect(code(DETAIL)).not.toMatch(/setArrangement\(|setResponsibilityArrangement\(/);
    });

    it("the host supplies canonical parties and the canonical re-read", () => {
        const card = src(CARD);
        expect(card).toMatch(/responsibilityAdmin=\{[\s\S]{0,900}vm\?\.responsibility\?\.parties/);
        expect(card).toMatch(/responsibilityAdmin=\{[\s\S]{0,900}await load\(\)/);
    });
});

describe("Prepaid is untouched", () => {
    it("stays named, and never acquires a settings gear", () => {
        const detail = src(DETAIL);
        expect(detail).toContain("Available prepaid");
        /* A gear on a financial POSITION would imply an authored policy. There is none. */
        expect(code(DETAIL)).not.toMatch(/prepaid[\s\S]{0,200}data-financials-manage/i);
    });
});
