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
        expect(filterAt).toBeGreaterThan(-1);
        /*
         * THERE ARE TWO GEARS NOW, and only one of them is this rule's business. Administration
         * moved to a compact row above the ledger, which carries its own gear; matching the FIRST
         * occurrence in the file started matching that one, which sits above the filters by design.
         * The gear this rule is about is the one in the filter row — so look for it from the
         * filter forward, which is exactly the relationship being asserted.
         */
        const gearAt = detail.indexOf('data-financials-manage-responsibility="gear"', filterAt);
        expect(gearAt, "the gear follows the filter it belongs to").toBeGreaterThan(filterAt);
        /*
         * ADJACENCY IS NOT A CHARACTER COUNT. This asserted a source distance under 1,600 chars,
         * which is a proxy for "rendered beside it" and a bad one: it fired when the gear gained a
         * ref, a change that moved nothing on screen. Raising the number to fit an edit would be
         * weakening the lock to pass it.
         *
         * What the rule actually means is measured on the MOUNTED product instead, where it can be
         * measured honestly — deployed 9675a76be: verticalDelta 0px, horizontalGap 6px, same
         * control row (certification/financials/11c-slice2/responsibility-details.json).
         *
         * What stays locked here is what source CAN answer: no other control is authored between
         * them, so the pair cannot be split up by a later edit without this failing.
         */
        const between = detail.slice(filterAt, gearAt);
        expect(between, "nothing else is authored between the filter and its gear")
            .not.toMatch(/<LensFilter\b/);
        /* The filter's own handler sets local filter state and nothing else. */
        expect(detail).toMatch(/testId="responsible-party"[\s\S]{0,220}setResponsibleParty\(v \|\| null\)/);
    });

    it("opens the ONE existing panel — not a second management UI", () => {
        /*
         * The panel used to be rendered by Details and unfolded in place, which is what pushed the
         * ledger down the card. It is now opened as a depth surface by the host. The rule is
         * unchanged and is the reason this lock exists: ONE authoring surface for responsibility,
         * reached from wherever the operator asks. What moved is who renders it — so Details must
         * now render NO panel at all, and the host must render exactly one at account grain.
         */
        const detail = code(DETAIL);
        expect(detail, "Details renders no editor of its own").not.toContain("<FinancialsResponsibilityPanel");
        expect(detail, "it asks the host instead").toContain("administration.onManageResponsibility");
        /* No second writer, and no local arrangement authoring in the card. */
        expect(detail).not.toContain("billing.configure_responsibility");
        expect(detail).not.toContain("responsibility-arrangement");

        const card = code(CARD);
        const panels = card.match(/<FinancialsResponsibilityPanel/g) ?? [];
        /* One for the account-grain depth card, one for the per-charge surface — and no third. */
        expect(panels.length, "the host opens the one panel, not a family of them")
            .toBeLessThanOrEqual(2);
        expect(card, "and the account-grain card is a real surface").toMatch(
            /if \(overlay === "responsibility_admin"/,
        );
    });

    it("Save re-reads committed truth instead of faking optimistic state", () => {
        /* The commit handler moved to the host with the panel; the rule did not move. */
        const card = code(CARD);
        const at = card.indexOf('if (overlay === "responsibility_admin"');
        expect(at, "the account-grain depth card exists").toBeGreaterThan(-1);
        expect(card.slice(at, at + 2200), "committing re-reads canonical truth")
            .toMatch(/onCommitted=\{async \(\) => \{[\s\S]{0,200}await load\(\)/);
        /* Neither surface holds a copy of the arrangement, so there is nothing to fake. */
        expect(code(DETAIL)).not.toMatch(/setArrangement\(|setResponsibilityArrangement\(/);
        expect(card).not.toMatch(/setResponsibilityArrangement\(/);
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

describe("a depth card dismisses itself, not the account beneath it", () => {
    /*
     * MEASURED on deployed 9675a76be: one Escape with the responsibility card open closed the card
     * AND the whole Details surface, and focus went to <body>. The operator lost the account, the
     * lens, the filters and their place in the ledger. Accounts had answered Escape itself since
     * 24ffad5bb; the Details host did not, so that migration regressed the depth stack on exactly
     * the surface the slice introduced.
     *
     * The two hosts reach the same guarantee by different means, and the means are forced by where
     * the card lives. Accounts renders the panel inline, so it takes the keypress on the wrapper
     * and stops it there. The Financials card renders the panel as its own surface on a stack it
     * owns, so it answers Escape once for the whole stack and COALESCES: two announcers in one
     * gesture window pop one level, not two. Requiring `stopPropagation` of both would force the
     * stack host into a mechanism that breaks its own backdrop signal.
     */
    it("Accounts takes the keypress on the card and stops it there", () => {
        const host = code("app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx");
        const at = host.indexOf('data-financials-manage-responsibility="depth-card"');
        expect(at, "the panel is wrapped in a depth card").toBeGreaterThan(-1);
        const guard = host.slice(at, at + 420);
        expect(guard).toContain('e.key !== "Escape"');
        expect(guard, "and stops it reaching the workspace behind").toContain("stopPropagation");
    });

    it("the Financials card pops exactly one level per gesture", () => {
        const card = code(CARD);
        expect(card, "the depth card is marked like the other host's")
            .toContain('data-financials-manage-responsibility="depth-card"');
        expect(card, "Escape is answered here").toMatch(/key !== "Escape"/);
        /* One gesture, one level: a second announcer inside the window is the same keypress. */
        expect(card, "dismissal pops one level").toMatch(/dismissOneLevel/);
        const at = card.indexOf("const dismissOneLevel");
        expect(card.slice(at, at + 400), "and repeat announcements in one gesture are coalesced")
            .toMatch(/lastDismissRef\.current < \d+/);
    });

    it("neither host closes the card without going through its restoring path", () => {
        /*
         * `onHostedClose` must route through the path that also restores focus — never a raw
         * setter that leaves the operator on <body>. Accounts closes through `closeManage`; the
         * stack host closes through `pop`, which its focus effect watches.
         */
        expect(code("app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx"))
            .toMatch(/onHostedClose=\{close\w*\}/);
        const card = code(CARD);
        expect(card).toMatch(/onHostedClose=\{pop\}/);
        expect(card, "and the focus restore is driven by the surface going away")
            .toMatch(/adminFocusSelector/);
    });
});
