/**
 * FOUR CONCEPTS, FOUR GRAINS, AND ONE ROW.
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
 * Giving each its own row fixed the legibility and left the card over-structured: two permanent
 * full-width rows above the ledger, one of them restating a Responsibility KPI that sits at the
 * top of the same card. So responsibility keeps its KPI and its gear beside the responsible-party
 * filter, and the discount position joins the relationship row as one collapsed phrase.
 *
 * Grain did not move. A discount is still a fact about a child's commercial relationship; it is
 * COMPOSED onto the payer row, not reassigned to the payer. These locks hold that distinction,
 * and the collapse rule that makes one line truthful. The mounted frames answer the spacing.
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
        const managePayments = detail.indexOf('data-financials-manage-payments="open"');
        const lenses = detail.indexOf('data-financials-lenses="true"');
        expect(payerRow, "the relationship row exists").toBeGreaterThan(-1);
        expect(managePayments, "Manage payments is rendered").toBeGreaterThan(payerRow);
        /* On the row, not after it: the lens bar is where the row's territory ends. */
        expect(managePayments, "and inside the relationship row").toBeLessThan(lenses);
    });

    it("one state, one sentence", () => {
        /*
         * "No payment method on file" is what `paymentSubjectModel` says and what the payment
         * methods surface says. The Focus Panel adapter said "No method on file", so the same
         * fact wore two names depending on which surface an operator read it on — and on the
         * relationship row it sits beside a real method label, where a near-miss synonym reads
         * as a different state rather than the same one.
         */
        const adapter = code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        expect(adapter).toContain('"No payment method on file"');
        expect(adapter, "and never the near-miss").not.toMatch(/"No method on file"/);
    });

    it("Add card and Add bank account are never permanent controls in Details", () => {
        /* They live inside Manage payments. Standing open on the ledger's card, they were setup
           instructions printed across a record. */
        expect(code(DETAIL)).not.toMatch(/Add card|Add bank account/);
        expect(code(DETAIL), "and no payment-methods section survives")
            .not.toContain("<PaymentMethodsSection");
    });
});

describe("no permanent administration row survives", () => {
    it("responsibility has no standalone summary row", () => {
        /*
         * It has a first-class KPI at the top of this same card, so a row below restated what the
         * operator had just read — and cost permanent vertical space to do it. The AUTHORITY is
         * untouched: the gear still opens the centred depth card, it simply lives with the
         * responsible-party filter, where responsibility is already part of the operator's model.
         */
        const detail = code(DETAIL);
        expect(detail, "the KPI is what states responsibility").toMatch(/<Stat label="Responsibility"/);
        expect(detail, "and no row restates it")
            .not.toContain('data-financials-admin-item="responsibility"');
        expect(detail, "no responsibility summary marker at all")
            .not.toContain('data-financials-responsibility-summary');
    });

    it("discounts have no standalone summary row", () => {
        const detail = code(DETAIL);
        expect(detail, "no administration region remains")
            .not.toContain('data-financials-administration="compact"');
        expect(detail, "and no row grid behind one").not.toContain("alloy-os-fdetail__adminrow");
    });

    it("the discount summary lives on the relationship row", () => {
        const detail = code(DETAIL);
        const row = detail.indexOf('data-financials-payer-row="true"');
        const discount = detail.indexOf('data-financials-admin-item="discount"');
        const gear = detail.indexOf('data-financials-manage-discounts="gear"');
        const rowEnd = detail.indexOf('data-financials-lenses="true"');
        expect(row).toBeGreaterThan(-1);
        expect(discount, "inside the relationship row").toBeGreaterThan(row);
        expect(discount, "and before the lens bar").toBeLessThan(rowEnd);
        expect(gear, "with its gear immediately beside it").toBeGreaterThan(discount);
        expect(gear, "still on that row").toBeLessThan(rowEnd);
    });

    it("the row is a real flex line, not concatenated text", () => {
        /*
         * THE ROOT CAUSE OF THE RUN-TOGETHER STRING, which was never about putting related facts
         * on one line: the class names existed and the stylesheet defined none of them, so every
         * span was inline with nothing between it and the next.
         */
        const css = read(CSS);
        expect(css, "row items are spaced").toMatch(/\.alloy-os-fdetail__rowitem\s*\{/);
        const item = css.slice(css.search(/\.alloy-os-fdetail__rowitem\s*\{/));
        expect(item.slice(0, 300)).toMatch(/gap:/);
        const payers = css.slice(css.search(/\.alloy-os-fdetail__payers\s*\{/));
        expect(payers.slice(0, 400), "and the row itself is a flex line with a gap")
            .toMatch(/display:\s*flex[\s\S]{0,200}gap:/);
    });

    it("compactness did not come out of the type scale", () => {
        /* §14: preserve normal Alloy legibility. A smaller font is not a shorter card. */
        const css = read(CSS);
        const value = css.slice(css.search(/\.alloy-os-fdetail__adminvalue\s*\{/));
        const size = /font-size:\s*([\d.]+)rem/.exec(value.slice(0, 300));
        expect(size, "the row states a font size").not.toBeNull();
        expect(Number(size![1]), "and it is not shrunk to buy height").toBeGreaterThanOrEqual(0.7);
    });
});

describe("the collapse rule is about agreement, not counting", () => {
    const summariser = () => {
        const card = code(CARD);
        const at = card.indexOf("function summariseFamilyDiscount");
        expect(at, "the summariser exists").toBeGreaterThan(-1);
        return card.slice(at, card.indexOf("\n}", at) + 2);
    };

    it("children who agree collapse to the shared state", () => {
        const body = summariser();
        expect(body, "one fingerprint means one answer").toMatch(/fingerprints\.size === 1/);
        expect(body, "and the shared state names the policy and its rate")
            .toMatch(/l\.rate \? `\$\{l\.label\} · \$\{l\.rate\}`/);
    });

    it("agreement is judged on the authored RATE, never the expected amount", () => {
        /*
         * THE CASE THAT MAKES THIS NECESSARY: one sibling policy at 10% produced -$18.50 for one
         * child and -$145.00 for the other, because their tuitions differ. Comparing amounts
         * would call that a disagreement and print "2 discount arrangements" for a family that
         * has exactly one discount — the row would be wrong about the simplest case there is.
         */
        const body = summariser();
        expect(body, "the fingerprint is policy and rate").toMatch(/`\$\{l\.policyId\}@\$\{l\.rate\}`/);
        expect(body, "and never the expected amount").not.toMatch(/expectedCents/);
    });

    it("children who differ are not falsely collapsed", () => {
        const body = summariser();
        expect(body, "a disagreement is stated as an aggregate")
            .toMatch(/discount \$\{count === 1 \? "arrangement" : "arrangements"\}/);
        expect(body, "and the row does not enumerate them").not.toMatch(/childLabel/);
    });

    it("a child no policy reaches still counts as a child without one", () => {
        /*
         * The roster seeds the map, so a child the policies never mention holds an empty list and
         * makes the family disagree. Driving the map from the policies alone would have called a
         * family "Sibling discount · 10%" when only one of two children was covered.
         */
        const body = summariser();
        expect(body).toMatch(/for \(const child of allChildren\) byChild\.set\(child\.customerMemberId, \[\]\)/);
        const card = code(CARD);
        expect(card, "and the roster comes from the household reader")
            .toMatch(/const roster = [\s\S]{0,300}positions/);
    });

    it("no discount is a compact state, not an empty section", () => {
        const body = summariser();
        expect(body).toMatch(/return "No discount"/);
        const detail = code(DETAIL);
        expect(detail, "Details renders no empty discount block")
            .not.toMatch(/No discount is expected on this family/);
    });

    it("a failed read keeps the last truthful answer", () => {
        /* "No discount" is a claim an operator acts on; it must never mean "the read failed". */
        const card = code(CARD);
        expect(card).toMatch(/if \(discountBody\) setAdminDiscountSummary\(discountSummary\)/);
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
        const row = detail.indexOf('data-financials-payer-row="true"');
        const lenses = detail.indexOf('data-financials-lenses="true"');
        const ledger = detail.indexOf('data-financials-detail-scroll="true"');
        expect(row).toBeGreaterThan(-1);
        expect(lenses, "the ledger's own controls come next").toBeGreaterThan(row);
        expect(ledger, "then the record").toBeGreaterThan(lenses);
        /* And nothing section-shaped in between — one row, then the ledger's controls. */
        expect(detail.slice(row, lenses)).not.toMatch(/<SectionHead|__section\b/);
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
        expect(detail, "a waiting row says it is waiting")
            .toContain('data-financials-summary-state="loading"');
        /* And says it INSTEAD of the summary, never over the top of a stale one. */
        expect(detail, "rather than falling through to an answer nothing has confirmed")
            .toMatch(/administration\.loading \?[\s\S]{0,260}administration\.discountSummary/);
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

    it("the responsibility card names its shares as a group", () => {
        /*
         * Below "Effective from" came a run of labelled rows with no statement of what they
         * collectively are, so the arrangement's shares read as more fields rather than as the
         * division itself. There is deliberately no "add a party" beside the heading: every party
         * on the account is already a row, and a control that could only offer someone already
         * listed would be a button that does nothing.
         */
        const panel = code(RESP);
        expect(panel).toContain('data-financials-responsibility-shares-head="true"');
        const head = panel.indexOf('data-financials-responsibility-shares-head="true"');
        const sharesList = panel.indexOf("{shares.map((share, i) =>");
        expect(sharesList, "the heading sits above the rows it names").toBeGreaterThan(head);
        expect(panel, "and it appears only when there are shares to name")
            .toMatch(/\{shares\.length > 0 \?[\s\S]{0,400}responsibility-shares-head/);
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

describe("the depth card answers what the row cannot", () => {
    /*
     * THE DIVISION OF LABOUR. The row answers "what discount position exists"; the card answers
     * "how does it apply by child, and what can I change". The row is allowed to collapse because
     * the card is where the per-child truth lives — so the card must actually carry it.
     */
    it("the rate is stated, never left to be inferred", () => {
        /*
         * §8. One policy at 10% paid out as -$18.50 and -$145.00 on two different tuitions; an
         * operator reading only the amounts cannot tell whether that is one rate or two. The rate
         * is the authored value from the resolver, rendered as itself.
         */
        const panel = code(DISCOUNT);
        expect(panel, "a percentage rate is rendered").toMatch(
            /s\.basis === "percentage" && s\.basisValue != null \?/,
        );
        expect(panel, "and shown as a percentage").toMatch(/\{s\.basisValue\}%/);
        expect(panel, "a fixed-amount policy states its amount instead")
            .toMatch(/s\.basis === "amount" && s\.basisValue != null \?/);
        expect(panel, "the rate carries a marker so a frame can find it")
            .toContain("data-financials-discount-rate");
    });

    it("the rate the card shows is the one the route carried", () => {
        /* Not re-derived from the expected amount, which is what makes it trustworthy. */
        const route = code("app/api/admin/financials/family-discount-position/route.ts");
        expect(route).toMatch(/basis:\s*outcome\.basis/);
        expect(route).toMatch(/basisValue:\s*outcome\.basisValue/);
        const forecast = code("lib/financials/reductions/forecastAssignmentReductions.ts");
        expect(forecast, "and the forecast carries the resolver's own values")
            .toMatch(/basis:\s*r\.basis[\s\S]{0,80}basisValue:\s*r\.basisValue/);
    });

    it("the card names where the policy itself is changed", () => {
        /*
         * §10. Discounts are derived from policy eligibility; there is no per-child writer, and a
         * "choose a discount" control here would be a control that cannot commit — the operator
         * would set it, nothing would change, and the card would have lied about what it owns.
         *
         * So the card offers exactly the two relationship actions it can perform and NAMES the
         * surface that owns the rest, rather than leaving an operator who wanted a different rate
         * on a screen that cannot give them one.
         */
        const panel = code(DISCOUNT);
        expect(panel, "the policy-configuration region exists")
            .toContain('data-financials-discount-policy-config="true"');
        expect(panel, "with a real path to it")
            .toContain('data-financials-discount-manage-policies="true"');
        expect(panel, "through the canonical href, not a hand-written URL")
            .toMatch(/organizationFinancialsChapterHref\("policies"\)/);
        /* And still no fake per-child assignment beside it. */
        expect(panel, "no invented per-child discount writer")
            .not.toMatch(/Select discount|Choose a discount|assignDiscount/);
    });

    it("both relationship actions remain, and they are the only writes", () => {
        const panel = code(DISCOUNT);
        expect(panel).toContain("Add exception");
        expect(panel).toContain("End exception");
        /* The two canonical actions, and nothing that writes a policy from here. */
        expect(panel, "no policy writer lives in this card")
            .not.toMatch(/commercial\/policies["`']\s*,\s*\{\s*method:\s*"(POST|PATCH|DELETE)/);
    });
});
