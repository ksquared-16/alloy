/**
 * THE PRODUCT SPEAKS OPERATOR INTENT; THE CODE KEEPS ITS OWN NAMES.
 *
 * Implementation vocabulary is correct in a table, a service and a test — those name what is
 * stored, and renaming them would make the model harder to reason about for no gain. What must
 * not happen is an operator reading them: "Divided by" asks somebody to understand arrangement
 * scope before they can bill a family, and "Add exception" describes the record we keep rather
 * than the decision being made.
 *
 * These locks read RENDERED COPY, not source. The distinction is the whole point — a comment
 * explaining why a word was removed must not count as that word coming back.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Rendered text only: comments stripped, then JSX text nodes and the string literals that reach
 * a label, placeholder or title.
 */
function operatorCopy(rel: string): string {
    const src = read(rel)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const text = [...src.matchAll(/>\s*([^<>{}\n][^<>{}]*?)\s*</g)].map((m) => m[1]);
    const labels = [...src.matchAll(/(?:label|placeholder|title|aria-label)=["']([^"']+)["']/g)].map((m) => m[1]);
    const jsxLabels = [...src.matchAll(/(?:label|placeholder)=\{["']([^"']+)["']\}/g)].map((m) => m[1]);
    return [...text, ...labels, ...jsxLabels].join("\n");
}

const ADD_CHARGE = "components/operationalCards/AddChargeCommand.tsx";
const DISCOUNT = "app/adminV2/financials/FinancialsDiscountPanel.tsx";
const RESP = "app/adminV2/financials/FinancialsResponsibilityPanel.tsx";
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";

describe("no persistence or model vocabulary reaches an operator", () => {
    const FORBIDDEN = [
        "Divided by",
        "The account's arrangement",
        "This charge only",
        "discount_enabled",
        "Add exception",
        "End exception",
        "Confirm exception",
        "arrangement scope",
        "charge-scoped",
        "opportunity_customer_member",
        "commercial_policy",
    ];

    it.each([ADD_CHARGE, DISCOUNT, RESP, DETAIL])("%s", (rel) => {
        const copy = operatorCopy(rel);
        for (const phrase of FORBIDDEN) {
            expect(copy, `"${phrase}" is model vocabulary, not operator intent`).not.toContain(phrase);
        }
    });

    it("and the implementation keeps its own names underneath", () => {
        /*
         * The point is NOT that the words disappear. The exception model is still an exception,
         * and a lock that forbade the word everywhere would push the code toward euphemism.
         */
        const src = read(DISCOUNT);
        expect(src, "the service is still what it is").toMatch(/except_commercial_policy/);
        expect(src, "and so is its counterpart").toMatch(/end_commercial_policy_exception/);
    });
});

describe("the product says what the operator is deciding", () => {
    it("Add Charge asks who owes it", () => {
        const copy = operatorCopy(ADD_CHARGE);
        expect(copy).toContain("Charge to");
        expect(copy, "with a way to change it").toMatch(/Change/);
    });

    it("Add Charge asks which discount, including none", () => {
        const copy = operatorCopy(ADD_CHARGE);
        expect(copy).toContain("Discount");
        expect(read(ADD_CHARGE), "No discount is an option, not an empty value")
            .toMatch(/label: "No discount"/);
    });

    it("the Discount card offers adding and removing, not excepting", () => {
        const copy = operatorCopy(DISCOUNT);
        expect(copy).toContain("Add discount");
        expect(copy).toContain("Remove discount");
        expect(copy, "and waiving is still available where it is the only honest act")
            .toContain("Waive discount");
        expect(copy).toContain("Restore discount");
    });

    it("every management card offers a way out", () => {
        expect(operatorCopy(DISCOUNT)).toContain("Close");
        expect(operatorCopy(RESP)).toContain("Cancel");
        expect(operatorCopy("components/admin/focusPanel/cards/FinancialsCard.tsx")).toContain("Close");
    });
});

describe("Add Charge answers who owes exactly once", () => {
    it("there is one Charge to section, not a Responsibility field above it", () => {
        /*
         * The card said it twice: "Charge to · Responsibility: Household", then a second section
         * with the actual parties and amounts. Two headings, two renderings, one fact — and an
         * operator reading them had to work out whether they disagreed.
         *
         * The survivor is the one that can be ACTED on: it names the parties, carries the
         * standing source quietly, and offers Change.
         */
        const src = read(ADD_CHARGE)
            .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
        expect((src.match(/<SectionHead[^>]*>Charge to<\/SectionHead>/g) ?? []).length).toBe(1);
        expect(src, "no Responsibility field restates it")
            .not.toMatch(/<Field label="Responsibility">/);
        expect(src, "and there is one way to change it")
            .toMatch(/data-addcharge-change-charge-to="true"/);
    });

    it("the answer leads with the people, not with the model", () => {
        /*
         * "The account's arrangement: Cert Certhouse $18.00" leads with the mechanism and makes
         * the operator step over it to reach the person who owes.
         */
        const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        const fn = card.slice(card.indexOf("function summariseHouseholdArrangement"));
        const body = fn.slice(0, fn.indexOf("\n}"));
        expect(body, "the model is not the first thing said")
            .not.toMatch(/`The account's arrangement:/);
        expect(body, "the source is said second").toContain("household responsibility");
        expect(body, "and too many parties are counted rather than truncated")
            .toMatch(/shares\.length > 2/);
    });
});

describe("no native control expresses a financial decision", () => {
    const SURFACES = [
        ADD_CHARGE,
        DISCOUNT,
        RESP,
        DETAIL,
        "components/admin/focusPanel/cards/FinancialsCard.tsx",
        "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx",
    ];

    /* Comments stripped: two of these files carry a note saying the native control was replaced. */
    const stripped = (rel: string) =>
        read(rel)
            .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");

    it.each(SURFACES)("%s has no native select", (rel) => {
        expect(stripped(rel).match(/<select\b/g) ?? []).toHaveLength(0);
    });

    it.each(SURFACES)("%s has no checkbox or radio for a financial decision", (rel) => {
        /*
         * A date input is the established Alloy date grammar and stays. What must not return is a
         * browser checkbox or radio standing in for a money decision — the discount row and the
         * arrangement-scope radios both were, and both read as unfinished next to canonical
         * controls.
         */
        const src = stripped(rel);
        expect(src.match(/type="checkbox"/g) ?? [], `${rel} checkbox`).toHaveLength(0);
        expect(src.match(/type="radio"/g) ?? [], `${rel} radio`).toHaveLength(0);
    });

    it("the new decisions use canonical controls", () => {
        const cmd = read(ADD_CHARGE);
        expect(cmd, "the discount is a platform select").toMatch(/testId="addcharge-discount"/);
        expect(cmd, "the share method is too").toMatch(/testId=\{`addcharge-share-method-\$\{index\}`\}/);
        expect(read(DISCOUNT), "and so is adding a discount").toMatch(/testId="add-discount-policy"/);
    });
});
