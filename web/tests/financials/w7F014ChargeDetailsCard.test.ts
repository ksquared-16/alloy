/**
 * W7-F014 — CHARGE DETAILS READS LIKE ADD CHARGE, COMPACTLY, AND CLOSES LIKE A MODAL.
 *
 * Director, Scenario 8: the record was understandable but not the product's presentation — prose
 * where values belonged, an "Accounting…" label that read as if it sat under Invoice date, and an
 * outside click that did nothing in Financials → Accounts (measured on deployed: Escape closed it,
 * a click outside the card did not, because that host draws the record with no backdrop).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the card's composition", () => {
    const src = code("app/adminV2/financials/FinancialsChargeDetail.tsx");

    it("groups Applies to and Responsibility the way Add Charge does", () => {
        const applies = src.slice(src.indexOf("<Group>Charge applies to</Group>"));
        expect(applies.slice(0, 600)).toMatch(/label="Applies to"/);
        expect(applies.slice(0, 600)).toMatch(/label="Responsibility"/);
    });

    it("puts the four dates in one row, in Add Charge's order, and nothing else in that row", () => {
        const row = src.slice(src.indexOf('data-financials-charge-dates="row"'), src.indexOf('data-financials-charge-posting="true"'));
        const order = ["Service date", "Billing period", "Invoice date", "Due date"].map((l) => row.indexOf(`label="${l}"`));
        expect(order.every((n) => n > 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(row, "no accounting label can sit under a date").not.toMatch(/Accounting/);
        expect(src).toMatch(/sm:grid-cols-4" data-financials-charge-dates="row"/);
    });

    it("states posting as one compact line from the canonical awaiting vocabulary", () => {
        for (const text of ["`Posted ${day(detail.postedAt)}`", "`Draft · Posts ${day(detail.awaiting.postsOn)}`", '"Waiting for review"', '"Posting failed · Needs attention"']) {
            expect(src).toContain(text);
        }
        expect(src, "a sentence only where someone must act").toMatch(/tone: "attention",\s*explain: detail\.awaiting\.explanation/);
    });

    it("shows Accounting only where it applies — a draft has no accounting block", () => {
        expect(src).toMatch(/\{detail\.accountingPeriod \|\| \(detail\.postedAt && detail\.glAccount\) \? \(/);
    });

    it("drops the ordinary-fact prose", () => {
        expect(src).not.toContain("This charge does not owe anything yet.");
        expect(src).not.toMatch(/<Group>Not posted yet<\/Group>/);
    });

    it("keeps the audit origin readable: created by, created, posted", () => {
        const history = src.slice(src.indexOf("<Group>History</Group>"));
        expect(history).toMatch(/label=\{detail\.createdByName \? "Created by" : "Raised"\}/);
        expect(history).toMatch(/label="Created"/);
        expect(history).toMatch(/Posted by/);
    });
});

describe("modal behaviour", () => {
    const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
    const effect = card.slice(card.indexOf('if (overlay !== "charge_detail") return;'));
    const fn = effect.slice(0, effect.indexOf("}, [overlay, dismissOneLevel]);"));

    it("an outside pointer-down closes Charge Details through the one dismissal path", () => {
        expect(fn).toMatch(/addEventListener\("pointerdown"/);
        expect(fn).toMatch(/dismissOneLevel\(\)/);
    });

    it("a click INSIDE the card never closes it", () => {
        expect(fn).toMatch(/if \(!card \|\| card\.contains\(target\)\) return;/);
    });

    it("an open menu or popover closes itself first", () => {
        expect(fn).toMatch(/role="listbox"/);
        expect(fn).toMatch(/hasInnerDismissibleLayer\(document\)/);
    });

    it("Escape and Close still dismiss", () => {
        expect(card).toMatch(/if \(event\.key !== "Escape"\) return;[\s\S]{0,2000}dismissOneLevel\(\)/);
        expect(card).toMatch(/data-financials-charge-detail-close="true"/);
    });
});
