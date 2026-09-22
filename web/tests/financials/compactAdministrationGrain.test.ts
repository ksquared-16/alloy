/**
 * FOUR CONCEPTS, FOUR GRAINS, AND A ROW EACH.
 *
 *   POLICY              an organisation-authored commercial rule
 *   DISCOUNT POSITION   what that policy does to ONE CHILD's obligation
 *   RESPONSIBILITY      who owes, per child
 *   PAYER               who pays, and by what method
 *
 * They shipped as one line of label/value pairs with no CSS behind the class names, and rendered
 * as "Payment methodManage paymentsResponsibilityCert Certhouse⚙DiscountNone⚙". Separators would
 * have made that legible and left it wrong: a row of bullets presents four different questions as
 * one fact about whoever is named first.
 *
 * These locks hold the grain, not the spacing. The mounted frames answer the spacing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const DISCOUNT = "app/adminV2/financials/FinancialsDiscountPanel.tsx";
const RESP = "app/adminV2/financials/FinancialsResponsibilityPanel.tsx";
const CSS = "app/adminV2/components/operationalCardsShared.css";
const POSITIONS = "app/api/admin/financials/responsibility-positions/route.ts";

describe("payment-method state shares the payer row it is about", () => {
    it("the door sits on the relationship row, not in a section of its own", () => {
        const detail = code(DETAIL);
        const payerRow = detail.indexOf('data-financials-payer-row="true"');
        const admin = detail.indexOf('data-financials-administration="compact"');
        const managePayments = detail.indexOf('data-financials-manage-payments="open"');
        expect(payerRow, "the relationship row exists").toBeGreaterThan(-1);
        expect(managePayments, "Manage payments is rendered").toBeGreaterThan(payerRow);
        expect(managePayments, "and inside the payer row, before administration begins")
            .toBeLessThan(admin);
    });

    it("Add card and Add bank account are never permanent controls in Details", () => {
        /* They live inside Manage payments. Standing open on the ledger's card, they were setup
           instructions printed across a record. */
        expect(code(DETAIL)).not.toMatch(/Add card|Add bank account/);
        expect(code(DETAIL), "and no payment-methods section survives")
            .not.toContain("<PaymentMethodsSection");
    });
});

describe("responsibility and discounts get a row each, at child grain", () => {
    it("each is its own row, not an item on a shared line", () => {
        const detail = code(DETAIL);
        for (const item of ["responsibility", "discount"]) {
            const at = detail.indexOf(`data-financials-admin-item="${item}"`);
            expect(at, `${item} has a row`).toBeGreaterThan(-1);
            /* A row, with a label, a value and a door — not a span in a wrapping flex line. */
            expect(detail.slice(at - 120, at), `${item} is a row`).toContain("__adminrow");
        }
    });

    it("the rows have real layout behind them", () => {
        /*
         * THE ROOT CAUSE OF THE RUN-TOGETHER LINE. The class names existed and the stylesheet did
         * not define them, so every label and value was an inline span with nothing between them.
         * A grid with a label column is what makes three rows read as one region.
         */
        const css = read(CSS);
        /*
         * THE SELECTOR THE MARKUP ACTUALLY USES, matched as a whole. A substring check passed
         * happily against `.alloy-os-fdetail__adminrowX` — a rule that styles nothing, which is
         * indistinguishable on this assertion from the no-rules state that caused the defect.
         */
        expect(css, "the row rule exists and is the one the markup names")
            .toMatch(/\.alloy-os-fdetail__adminrow\s*\{/);
        /*
         * THE BASE RULE, not the narrow-width override. The selector appears twice — once at top
         * level and once inside the phone-width media query, where the label column is dropped on
         * purpose — so matching "the first .alloy-os-fdetail__adminrow that mentions
         * grid-template-columns" was satisfied by the override alone.
         *
         * What must hold is that the DEFAULT row has three tracks: a fixed label column, the
         * answer, and the door. That column is what aligns Responsibility and Discounts.
         */
        const rule = css.slice(css.search(/^\.alloy-os-fdetail__adminrow\s*\{/m));
        expect(rule.slice(0, 400), "the label column aligns the answers")
            .toMatch(/grid-template-columns:\s*[\d.]+rem\s+minmax\(0,\s*1fr\)\s+auto/);
        expect(css, "and the value itself can wrap between children")
            .toMatch(/\.alloy-os-fdetail__adminvalue\s*\{/);
        expect(code(DETAIL), "and the markup uses that class").toContain("alloy-os-fdetail__adminrow");
    });

    it("each child is named once, on each row", () => {
        /* A child that appears twice on one row is two answers about one obligation. */
        const detail = code(DETAIL);
        expect(detail).toContain("ChildGrainSummary");
        const helper = detail.slice(detail.indexOf("function ChildGrainSummary"));
        expect(helper.slice(0, 1400)).toMatch(/entries\.map\(\(entry, index\)/);
        expect(helper.slice(0, 1400), "the separator belongs to the child that follows it")
            .toMatch(/index > 0 \?/);
    });

    it("responsibility is not inferred from the payer", () => {
        /*
         * `vm.payers` means responsibility and is the right fact at the WRONG GRAIN: it names the
         * parties on the ACCOUNT. Rendering it against a per-child label asserts one child's
         * arrangement for a sibling who may have their own.
         */
        const card = code(CARD);
        const summariser = card.slice(card.indexOf("function summariseResponsibilityPositions"));
        const body = summariser.slice(0, summariser.indexOf("\n}"));
        expect(body, "the row is built from the per-child read").toContain("positions");
        expect(body, "never from the account's payers").not.toContain("payers");
    });

    it("discount is not inferred from responsibility", () => {
        const card = code(CARD);
        const summariser = card.slice(card.indexOf("function summariseDiscountPositions"));
        /* The function itself — its closing brace at column zero, not whatever follows it. */
        const body = summariser.slice(0, summariser.indexOf("\n}") + 2);
        expect(body, "the discount row reads the discount position").toContain("policies");
        expect(body, "and knows nothing about who owes")
            .not.toMatch(/responsibility|arrangement|shares/);
    });

    it("one child's answer is never another's", () => {
        /*
         * The read asks about every child separately and says whether the governing arrangement
         * was authored AT that child or inherited from the household. Collapsing that shows
         * inherited household money as though the child had been given it deliberately.
         */
        const route = code(POSITIONS);
        expect(route).toContain("readAccountArrangement");
        expect(route).toContain("authoredAtChild");
        expect(route, "asked per child, not once for the account")
            .toMatch(/members\.map\(async \(member\)/);
        const card = code(CARD);
        expect(card, "and the summary keeps the distinction").toMatch(/authoredAtChild/);
    });

    it("the route composes two authorities and resolves nothing itself", () => {
        /* Not a second projection: specificity stays with the grain-aware reader that owns it. */
        const route = code(POSITIONS);
        expect(route).toContain("readHouseholdScopes");
        expect(route, "no arrangement is picked by hand here")
            .not.toMatch(/arrangementSpecificity|\.sort\(/);
    });
});

describe("nothing administrable unfolds inside Details", () => {
    it("no inline editor of any kind survives", () => {
        const detail = code(DETAIL);
        for (const inline of [
            "<FinancialsResponsibilityPanel",
            "<FinancialsDiscountPanel",
            "<PaymentMethodsSection",
            "<AutopaySection",
        ]) {
            expect(detail, `${inline} must open as a depth card, not unfold here`).not.toContain(inline);
        }
    });

    it("the ledger begins immediately after the compact region", () => {
        const detail = code(DETAIL);
        const admin = detail.indexOf('data-financials-administration="compact"');
        const lenses = detail.indexOf('data-financials-lenses="true"');
        const ledger = detail.indexOf('data-financials-detail-scroll="true"');
        expect(admin).toBeGreaterThan(-1);
        expect(lenses, "the ledger's own controls come next").toBeGreaterThan(admin);
        expect(ledger, "then the record").toBeGreaterThan(lenses);
        /* And nothing section-shaped in between. */
        expect(detail.slice(admin, lenses)).not.toMatch(/<SectionHead|__section\b/);
    });
});

describe("a depth card paints before its canonical content resolves", () => {
    it("the shell does not wait for data", () => {
        /*
         * The card is a surface push, which renders on the same React commit as the click. What
         * made the click look dead was the CONTENT: the panel fired the same canonical route the
         * parent had already read, so the operator waited out a second round trip for an answer
         * the page was holding.
         */
        const card = code(CARD);
        const at = card.indexOf('if (overlay === "discount_admin"');
        expect(at, "the depth surface exists").toBeGreaterThan(-1);
        const branch = card.slice(at, at + 2000);
        expect(branch, "it renders the card, not a gate on loaded data")
            .not.toMatch(/if \(!discountPositionBody\)|loading \? null/);
        /*
         * SEEDED WITH THE READ THAT ALREADY HAPPENED. `initialPosition={null}` satisfies the
         * spelling and restores the defect exactly: the panel falls back to its own round trip
         * and the operator waits again for an answer the page was holding.
         */
        expect(branch, "and seeds the panel with what was already read")
            .toMatch(/initialPosition=\{discountPositionBody\}/);
        expect(card, "which is the body of the read the compact row did")
            .toMatch(/setDiscountPositionBody\(discountBody as FamilyPosition\)/);
    });

    it("the loading state invents no discount truth", () => {
        const panel = code(DISCOUNT);
        expect(panel, "a skeleton, not an answer").toContain('data-financials-discount-loading="true"');
        /* FAIL CLOSED: an unreadable position says so; it never degrades to "no discount". */
        expect(panel).toMatch(/setPosition\(null\); setError\(e\.message\)/);
        const detail = code(DETAIL);
        const helper = detail.slice(detail.indexOf("function ChildGrainSummary"));
        expect(helper.slice(0, 1400), "and a waiting row says it is waiting")
            .toContain('data-financials-summary-state="loading"');
        expect(helper.slice(0, 1400), "rather than falling through to the empty answer")
            .toMatch(/if \(loading && entries\.length === 0\)/);
    });

    it("the seed is the same route's body, not a second projection", () => {
        const card = code(CARD);
        expect(card, "one shape, named once").toContain("FamilyPosition");
        const panel = code(DISCOUNT);
        expect(panel, "the panel still owns the answer and re-reads it")
            .toMatch(/useState<FamilyPosition \| null>\(initialPosition \?\? null\)/);
        expect(panel, "and does not flash back to a skeleton while confirming")
            .toMatch(/if \(!position\) setLoading\(true\)/);
    });
});

describe("the depth cards state each fact once", () => {
    it("the discount card does not repeat its summary above its detail", () => {
        /*
         * `manageOpen` starts true when hosted, so the card opened with the position summary AND
         * the management list — the same "child · Expected $x" line twice, four lines apart, with
         * only one copy actionable.
         */
        const panel = code(DISCOUNT);
        expect(panel).toContain("const summaryIsSeparate = !hostedOpen");
        expect(panel, "the summary is what gets suppressed, not the actionable list")
            .toMatch(/\{summaryIsSeparate \? \(/);
    });

    it("neither depth card repeats the title its host already renders", () => {
        expect(code(DISCOUNT)).toMatch(/hostedOpen \? null : \([\s\S]{0,200}Manage discounts/);
        expect(code(RESP)).toMatch(/hosted \? null : \([\s\S]{0,200}Manage responsibility/);
    });

    it("every child row in the discount card carries its own action", () => {
        /* An operator must be able to tell immediately what can be acted upon. */
        const panel = code(DISCOUNT);
        expect(panel).toMatch(/Add exception <span aria-hidden>&rarr;<\/span>/);
        expect(panel).toMatch(/End exception <span aria-hidden>&rarr;<\/span>/);
        expect(panel, "the actions sit on the subject row, not on the policy header")
            .toMatch(/data-add-policy-exception=\{p\.policyId\}/);
    });
});

describe("the discount read is measured, not guessed at", () => {
    const POSITION_READ = "lib/financials/reductions/readAssignmentDiscountPosition.ts";

    it("independent reads run together", () => {
        /*
         * MEASURED IN SOURCE: the position made four sequential round trips, of which only the
         * first two were dependent — the agreement is found by an id the tuition view returns.
         * The forecast, the exception history and the policy labels need nothing from each other.
         * And this read is itself fanned out per relationship, so the serialisation was multiplied
         * by the size of the family before anything reached the operator.
         */
        const read = code(POSITION_READ);
        expect(read).toMatch(/const \[forecast, history, policies\] = await Promise\.all\(/);
        const at = read.indexOf("await Promise.all([");
        const block = read.slice(at, at + 1200);
        for (const call of ["forecastAssignmentReductions", "readExceptionHistory", "readPolicies"]) {
            expect(block, `${call} is in the concurrent group`).toContain(call);
        }
    });

    it("the route fans out across relationships rather than looping", () => {
        const route = code("app/api/admin/financials/family-discount-position/route.ts");
        expect(route).toMatch(/await Promise\.all\(\s*ocmIds\.map/);
    });

    it("the per-child position read is concurrent too", () => {
        const route = code(POSITIONS);
        expect(route).toMatch(/await Promise\.all\(\s*members\.map/);
    });
});

describe("three doors, one grammar", () => {
    /*
     * They do not need identical content. They do need to be recognisably the same KIND of
     * surface: an operator who opens Manage payments and then Manage discounts must not feel they
     * have moved between two products. The platform card carries all of it — width, header,
     * border, radius, shadow, spacing — so the rule is that all three declare the same card.
     */
    const SURFACES = ["payments_admin", "responsibility_admin", "discount_admin", "payment"] as const;

    it.each(SURFACES)("%s is the platform's command card", (kind) => {
        const card = code(CARD);
        const at = card.indexOf(`if (overlay === "${kind}"`);
        expect(at, `${kind} is a surface`).toBeGreaterThan(-1);
        const block = card.slice(at, at + 2600);
        for (const attr of [
            'modalClass="command"',
            'density="expanded"',
            'gridSpan="row"',
            'tier="work"',
            'archetype="status"',
        ]) {
            expect(block, `${kind} declares ${attr}`).toContain(attr);
        }
    });

    it("Manage payments carries everything that left Details", () => {
        /*
         * The controls did not disappear — Add card, Add bank account and autopay are Payments'
         * own, and they moved behind the door rather than being retired. A door that opened on a
         * card missing them would have traded a cluttered Details for a broken workflow.
         */
        const card = code(CARD);
        const at = card.indexOf('if (overlay === "payments_admin"');
        const block = card.slice(at, at + 2200);
        expect(block, "the methods, with their own add controls").toContain("<PaymentMethodsSection");
        expect(block, "and autopay, which qualifies them").toContain("<AutopaySection");
    });

    it("every door restores focus to the control that opened it", () => {
        /* One grammar includes how each is dismissed, not only how each looks. */
        const card = code(CARD);
        for (const selector of [
            'data-financials-manage-payments="open"',
            'data-financials-manage-responsibility="gear"',
            'data-financials-manage-discounts="gear"',
        ]) {
            expect(card, `${selector} is what focus returns to`).toMatch(
                new RegExp(`openAdmin\\([\\s\\S]{0,80}${selector.replace(/[[\]"=]/g, "\\$&")}`),
            );
        }
        expect(card, "and the restore runs when the surface goes away").toContain("adminFocusSelector");
    });
});
