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
        const discount = detail.indexOf('data-financials-row-group="discount"');
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

    it("every child row carries its own action, in the operator's words", () => {
        /*
         * THE MODEL IS AN EXCEPTION; THE DECISION IS A WAIVER. "Add exception" names the record
         * we keep. "Waive discount" names what happens to a family's bill, which is the thing
         * being decided — and the vocabulary family already said it that way at the charge grain
         * ("Waived for this charge"), so the relationship grain was the odd one out.
         *
         * The service, the table and both registered actions are untouched underneath.
         */
        const panel = code(DISCOUNT);
        expect(panel).toMatch(/Waive discount <span aria-hidden>&rarr;<\/span>/);
        expect(panel).toMatch(/Restore discount <span aria-hidden>&rarr;<\/span>/);
        expect(panel, "no implementation vocabulary survives in operator copy")
            .not.toMatch(/>\s*(Add|End|Confirm) exception/);
        /* The card is child-grained now, so the actions sit on a child's policy line. */
        expect(panel, "the actions sit on the line they act on")
            .toMatch(/data-add-policy-exception=\{line\.policyId\}/);
        expect(panel, "and the authority beneath them is unchanged")
            .toMatch(/runException\("end"/);
    });

    it("a waiver still cannot be reasonless", () => {
        const panel = code(DISCOUNT);
        expect(panel, "the ask is in the operator's terms")
            .toContain("Why is this discount being waived?");
        expect(panel, "and Confirm is refused without one")
            .toMatch(/disabled=\{busy \|\| draft\.reason\.trim\(\)\.length === 0\}/);
        expect(panel, "the commit says what it commits").toContain("Confirm waiver");
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
        /* The rate is resolved once into the child view model and rendered from there. */
        expect(panel, "a percentage rate is read from the authored value").toMatch(
            /sub\.basis === "percentage" && sub\.basisValue != null/,
        );
        expect(panel, "and shown as a percentage").toMatch(/\$\{sub\.basisValue\}%/);
        expect(panel, "a fixed-amount policy states its amount instead")
            .toMatch(/sub\.basis === "amount" && sub\.basisValue != null/);
        expect(panel, "the rate reaches the row").toMatch(/\{line\.rate\}/);
        expect(panel, "with a marker so a frame can find it")
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

    it("the card assigns configured discounts, and authors none", () => {
        /*
         * THIS RULE INVERTED, DELIBERATELY. It used to forbid any discount selection here,
         * because there was no affirmative authority and a selector would have been a control
         * that could not commit. That authority now exists — `commercial_policy_assignments` —
         * so choosing which CONFIGURED discount a child receives is a real act with a real writer.
         *
         * What has not changed is the line it must not cross: the operator picks an existing
         * policy by identity, and never edits what it is worth. Rates, bases, caps and
         * eligibility stay in organization configuration.
         */
        const panel = code(DISCOUNT);
        expect(panel, "a child can be given a configured discount")
            .toContain('data-financials-add-discount-confirm="true"');
        expect(panel, "through the registered assignment action")
            .toMatch(/billing\.assign_commercial_policy/);
        expect(panel, "chosen from candidates the server supplies")
            .toMatch(/assignable-discounts\?customer_id=/);

        /* And the economics are not editable here, in any spelling. */
        expect(panel, "no rate authoring")
            .not.toMatch(/setPercent|setBasisValue|name="percent"|Edit discount percentage/);
        expect(panel, "no arithmetic on a gross")
            .not.toMatch(/basisAmountCents\s*\*|\*\s*0?\.\d/);
        expect(panel, "and no navigation to configuration")
            .not.toMatch(/Manage discount policies|organizationFinancialsChapterHref/);
    });

    it("both relationship actions remain, and they are the only writes", () => {
        const panel = code(DISCOUNT);
        /* Operator words on top; the two canonical actions underneath, unchanged. */
        expect(panel).toContain("Waive discount");
        expect(panel).toContain("Restore discount");
        expect(panel, "the create path").toMatch(/runException\("create"/);
        expect(panel, "and the end path").toMatch(/runException\("end"/);
        expect(panel, "no policy writer lives in this card")
            .not.toMatch(/commercial\/policies["`']\s*,\s*\{\s*method:\s*"(POST|PATCH|DELETE)/);
    });
});

describe("each action sits with the state it acts on", () => {
    /*
     * `Manage payments` sat at the row's end with the discount between it and the payment state
     * it manages, so a control floated beside a concept it has nothing to do with. The row is now
     * three groups — identity, discount, payment — and the grouping is what survives a wrap.
     */
    it("the row is three groups, in that order", () => {
        const detail = code(DETAIL);
        const identity = detail.indexOf('data-financials-row-group="identity"');
        const discount = detail.indexOf('data-financials-row-group="discount"');
        const payment = detail.indexOf('data-financials-row-group="payment"');
        expect(identity, "identity first").toBeGreaterThan(-1);
        expect(discount, "then the discount").toBeGreaterThan(identity);
        expect(payment, "then the payment group").toBeGreaterThan(discount);
    });

    it("the discount gear is inside the discount group", () => {
        const detail = code(DETAIL);
        const group = detail.indexOf('data-financials-row-group="discount"');
        const payment = detail.indexOf('data-financials-row-group="payment"');
        const gear = detail.indexOf('data-financials-manage-discounts="gear"');
        expect(gear, "after the state it changes").toBeGreaterThan(group);
        expect(gear, "and before the next group begins").toBeLessThan(payment);
    });

    it("Manage payments is grouped with the payment-method state", () => {
        const detail = code(DETAIL);
        const group = detail.indexOf('data-financials-row-group="payment"');
        const method = detail.indexOf('data-financials-method-state="true"');
        const door = detail.indexOf('data-financials-manage-payments="open"');
        expect(method, "the state is in the payment group").toBeGreaterThan(group);
        expect(door, "and the door follows it").toBeGreaterThan(method);
    });

    it("the payment group right-aligns where there is room, and stops when there is not", () => {
        /*
         * BOTH HALVES, because either alone is inert. A rule nothing wears aligns nothing, and a
         * class with no rule behind it is exactly how the administration row once rendered as a
         * single run-together string.
         */
        const detail = code(DETAIL);
        expect(detail, "the payment group claims the row's end")
            .toMatch(/alloy-os-fdetail__rowgroup--end[\s\S]{0,120}data-financials-row-group="payment"/);
        const css = read(CSS);
        expect(css).toMatch(/\.alloy-os-fdetail__rowgroup--end\s*\{[^}]*margin-left:\s*auto/);
        /* Below the desktop widths the row wraps and the alignment is given up rather than kept. */
        expect(css, "the alignment is released when the row wraps")
            .toMatch(/@media \(max-width: 900px\)[\s\S]{0,200}rowgroup--end[\s\S]{0,80}margin-left:\s*0/);
    });

    it("the method joins the payment group only when one payer owns it", () => {
        /*
         * A payment method is a fact about a PAYER. With two payers on record, lifting "No
         * payment method" out to the row's end would attribute one payer's state to the
         * relationship as a whole; with several, each keeps its own and only the door is shared.
         */
        const detail = code(DETAIL);
        expect(detail).toMatch(/evidence\.payers\.length === 1 \?[\s\S]{0,400}data-financials-method-state/);
        expect(detail, "and several payers keep theirs on their own line")
            .toMatch(/evidence\.payers\.length > 1 \?[\s\S]{0,300}payer-method/);
    });

    it("no expected amounts reach the relationship row", () => {
        /* Per-child money belongs to the card that shows it per child. */
        const detail = code(DETAIL);
        const row = detail.indexOf('data-financials-payer-row="true"');
        const lenses = detail.indexOf('data-financials-lenses="true"');
        expect(detail.slice(row, lenses)).not.toMatch(/Expected|expectedCents|money\(/);
    });

    it("the row adds no new permanent administration", () => {
        const detail = code(DETAIL);
        expect((detail.match(/data-financials-payer-row="true"/g) ?? []).length).toBe(1);
        expect(detail).not.toContain('data-financials-admin-item="responsibility"');
        expect(detail, "responsibility states itself in a KPI").toMatch(/<Stat label="Responsibility"/);
        expect(detail, "and is managed from the filter, not the row")
            .toContain('data-financials-manage-responsibility="gear"');
    });
});

describe("every centred card ends the same way", () => {
    /*
     * "How do I get out of here" is a question all five have to answer, and two of them answered
     * it in faint underlined body text — the Payments card not at all, so on an account with no
     * methods it read as a surface that had failed to load rather than one waiting to be used.
     */
    it("Discounts, Payments and Responsibility all end in the shared action row", () => {
        for (const [rel, marker] of [
            [DISCOUNT, 'data-financials-discount-close="true"'],
            [CARD, 'data-financials-payments-close="true"'],
            [RESP, 'data-financials-responsibility-cancel="true"'],
        ] as const) {
            const src = code(rel);
            expect(src, `${rel} has a visible way out`).toContain(marker);
            expect(src, `${rel} uses the family's action row`).toContain("alloy-os-depthcard__actions");
        }
    });

    it("the Payments card does not end on an unfinished-looking empty state", () => {
        /*
         * One faint sentence floating between the add controls and the Autopay heading read as a
         * card that had failed to load rather than an account that has no method yet. Same words,
         * a bounded shape, and the sentence that says what to do about it.
         */
        const section = code("components/operationalCards/PaymentMethodsSection.tsx");
        expect(section).toContain('data-testid="payment-methods-empty"');
        const at = section.indexOf('data-testid="payment-methods-empty"');
        const block = section.slice(at - 200, at + 700);
        expect(block, "the empty state is a bounded region").toMatch(/border-dashed|rounded-md border/);
        expect(block, "and says what to do next").toMatch(/Add a card or a bank account/);
        expect(section, "the controls it points at are still there")
            .toMatch(/Add card|Add bank account/);
    });

    it("the action row is a real rule, not a class name with nothing behind it", () => {
        /*
         * The administration row shipped with class names and no stylesheet rules and rendered as
         * one run-together string. That is not a mistake worth making twice, so the rule is
         * asserted beside the markup that depends on it.
         */
        const css = read(CSS);
        expect(css).toMatch(/\.alloy-os-depthcard__actions\s*\{/);
        const actions = css.slice(css.search(/\.alloy-os-depthcard__actions\s*\{/));
        expect(actions.slice(0, 400), "a separated row").toMatch(/border-top:|padding-top:/);
        expect(css, "and the close control reads as a control")
            .toMatch(/\.alloy-os-depthcard__close\s*\{[^}]*border:/);
    });

    it("Escape still pops one level and focus still returns", () => {
        /* A visible Close does not replace the gesture; it stands beside it. */
        const card = code(CARD);
        expect(card).toMatch(/key !== "Escape"/);
        expect(card, "the restore is still driven by the surface going away").toContain("adminFocusSelector");
        expect(code(DISCOUNT), "and the panel still dismisses its own layer")
            .toContain('data-financials-manage-discounts="depth-card"');
    });
});

describe("the responsibility card reads like Alloy", () => {
    it("the question replaces the doctrine paragraph", () => {
        const panel = code(RESP);
        expect(panel).toContain("Who owes for this account?");
        expect(panel, "the paragraph is gone")
            .not.toContain("Who contractually owes this account, from a date.");
    });

    it("but the doctrine itself is not lost — it moved to the mechanism", () => {
        /*
         * An operator who reads "change who owes" as "move that receipt" will come here to fix a
         * misapplied payment. Effective dating is precisely why that does not happen, so the
         * warning sits with the effective date rather than at the top where it is skipped.
         */
        const panel = code(RESP);
        expect(panel).toContain("Money already paid is not moved.");
        expect(panel, "beside the field that causes it")
            .toMatch(/data-financials-responsibility-effective="true"[\s\S]{0,700}data-financials-responsibility-effective-note/);
    });

    it("what stands today is a labelled fact, not running prose", () => {
        const panel = code(RESP);
        expect(panel, "the shares are the readable part").toMatch(/Current · this child|Current · inherited/);
        expect(panel, "and the old sentence is gone").not.toContain("saving supersedes it");
    });
});
