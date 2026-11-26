/**
 * W7 SCENARIO 8 — FINAL PRESENTATION PASS.
 *
 * Charge Details is scannable and reads like Add Charge. Presentation only: no billing, date,
 * posting, responsibility or funding semantics change here.
 *
 *   1. The date row holds four dates; provenance is an info mark, never prose under a date.
 *   2. Draft lifecycle actions are buttons: primary Edit, outlined destructive Cancel, neutral Close.
 *   3. Applies to · Responsibility is one pair, each label once ("Mara Monthly · 100%").
 *   4. Responsibility & funding is one compact section; funding stays distinct and never "received".
 *   5. Charge Details is the only modal: the account floor stays a floor beneath it, inert.
 *   6. The account KPI says "Scheduled".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { financialsSurfaceRole } from "@/lib/financials/workspace/financialsSurfaceRole";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const DETAIL = "app/adminV2/financials/FinancialsChargeDetail.tsx";
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";

describe("1 — no policy prose in the date row", () => {
    it("Charge Details: the override is the invoice date's info mark, not a line beneath it", () => {
        const src = code(DETAIL);
        const row = src.slice(src.indexOf('data-financials-charge-dates="row"'), src.indexOf('data-financials-charge-posting="true"'));
        expect(row).toMatch(/hint=\{\s*detail\.invoiceRule\?\.source === "template"/);
        expect(row).toMatch(/hintAttr="data-financials-charge-invoice-override"/);
        expect(row, "no visible override span in the row").not.toMatch(/text-alloy-ember[^"]*" data-financials-charge-invoice-override/);
        const cell = src.slice(src.indexOf("function DateCell("), src.indexOf("function Fact("));
        expect(cell).toMatch(/role="img"/);
        expect(cell).toMatch(/aria-label=\{props\.hint\}/);
        expect(cell).toMatch(/title=\{props\.hint\}/);
    });

    it("Add Charge: the same info mark, and the prose class is gone from the invoice cell", () => {
        const src = code("components/operationalCards/AddChargeCommand.tsx");
        const cell = src.slice(src.indexOf('<DateCell label="Invoice date"'), src.indexOf('<DateCell label="Due date"'));
        expect(cell).toMatch(/data-addcharge-invoice-override[\s\S]*role="img"/);
        expect(cell).not.toContain("alloy-os-addcharge__date-rule");
    });
});

describe("2 — draft actions look like actions", () => {
    const card = read(CARD);
    const actions = card.slice(card.indexOf('data-financials-charge-detail-for={surface.chargeId}'), card.indexOf('data-financials-charge-detail-close="true"') + 200);

    it("Edit draft is the filled primary; Cancel draft is outlined destructive; Close is neutral", () => {
        expect(actions).toMatch(/alloy-os-chargedetail__action--primary"\s*data-financials-charge-detail-edit-draft="true"/);
        expect(actions).toMatch(/alloy-os-chargedetail__action--destructive"\s*data-financials-charge-detail-cancel-draft="true"/);
        expect(actions).toMatch(/alloy-os-chargedetail__action--neutral"\s*data-financials-charge-detail-close="true"/);
    });

    it("every button in the row carries a styled class", () => {
        const row = actions.slice(actions.indexOf("alloy-os-chargedetail__actions"));
        const buttons = row.match(/<button[\s\S]*?>/g) ?? [];
        expect(buttons.length).toBeGreaterThanOrEqual(5);
        for (const b of buttons) expect(b, b).toMatch(/className="[^"]*alloy-os-chargedetail__action/);
    });

    it("the stylesheet defines each treatment", () => {
        const css = read("app/adminV2/components/operationalCardsShared.css");
        for (const sel of ["primary", "secondary", "destructive", "destructive-confirm", "neutral"]) {
            expect(css).toContain(`.alloy-os-chargedetail__action--${sel} {`);
        }
        expect(css).toMatch(/\.alloy-os-chargedetail__action--primary \{[^}]*background: var\(--alloy-os-bend-pine/);
        expect(css).toMatch(/.alloy-os-chargedetail__action--destructive \{[^}]*background: var\(--alloy-os-surface/);
    });
});

describe("3 — Applies to · Responsibility, one pair", () => {
    const src = code(DETAIL);
    it("each label appears once, as a label-over-value fact", () => {
        expect(src.match(/label="Applies to"/g)?.length).toBe(1);
        expect(src).not.toContain("<Group>Charge applies to</Group>");
    });

    it("responsibility reads as party · share, from the arrangement first", () => {
        expect(src).toMatch(/shares\.map\(\(sh\) => `\$\{sh\.name\} · \$\{shareTerm\(sh\)\}`\)/);
    });
});

describe("4 — Responsibility & funding, compact and distinct", () => {
    const src = code(DETAIL);
    const section = src.slice(src.indexOf("<Group>Responsibility &amp; funding</Group>"), src.indexOf("applied.length > 0"));

    it("is one section: shares with 'responsible', funding under its share, one manage control", () => {
        expect(src.match(/<Group>Responsibility/g)?.length, "no separate Responsibility / arrangement groups").toBe(1);
        expect(src).not.toContain("<Group>Responsibility arrangement</Group>");
        expect(src).not.toContain("<Group>Expected funding</Group>");
        expect(section).toMatch(/responsible\$\{allocated != null/);
        expect(section).toMatch(/<FinancialsExpectedFundingPanel[\s\S]*?compact/);
        expect(section).toMatch(/<FinancialsResponsibilityPanel[\s\S]*?compact/);
    });

    it("compact funding is one secondary line — 'Expected funding · None' — with Manage funding", () => {
        const panel = code("app/adminV2/financials/FinancialsExpectedFundingPanel.tsx");
        const compact = panel.slice(panel.indexOf("if (!open && compact)"), panel.indexOf("if (!open) {"));
        expect(compact).toMatch(/Expected funding ·/);
        expect(compact).toMatch(/data-financials-funding-none="true">None</);
        expect(compact).toMatch(/>\s*Manage funding\s*</);
        expect(compact, "an expectation is never shown as money received").not.toMatch(/received|Paid/);
    });

    it("charge-level expected funding still says it has not been received", () => {
        expect(section).toMatch(/not yet received/);
    });
});

describe("5 — exactly one Charge Details modal", () => {
    it("the floor is a floor at every depth; the pushed layer is the command", () => {
        expect(financialsSurfaceRole({ detailsAreTheSurface: true, stackDepth: 2, layerPosition: 1 })).toBe("floor");
        expect(financialsSurfaceRole({ detailsAreTheSurface: true, stackDepth: 2 })).toBe("command");
        expect(financialsSurfaceRole({ detailsAreTheSurface: false, stackDepth: 1, layerPosition: 1 })).toBe("command");
    });

    it("both floor branches ask as position 1 and go inert beneath a command", () => {
        const card = code(CARD);
        expect(card.match(/stackDepth: stack\.length,\s*layerPosition: 1,/g)?.length).toBe(2);
        expect(card.match(/inert=\{detailsAreTheSurface && commandSurface \? true : undefined\}/g)?.length).toBe(2);
    });

    it("Charge Details is a labelled modal dialog and draws no second box inside its card", () => {
        const card = code(CARD);
        expect(card).toMatch(/data-financials-overlay="charge_detail"[\s\S]{0,120}role="dialog"\s*aria-modal="true"\s*aria-label="Charge details"/);
        expect(card).toMatch(/onLoaded=\{setChargeDetailFacts\}\s*bare/);
        expect(code(DETAIL)).toMatch(/className=\{bare \? "mb-1" : "mb-3 rounded-md border/);
    });

    it("the stylesheet lifts only non-floor overlays into the fixed command shell, behind one backdrop", () => {
        const css = read("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain('.alloy-accounts-command-host [data-financials-overlay]:not([data-financials-surface-role="floor"]) {');
        expect(css).toContain('.alloy-accounts-command-host:has([data-financials-overlay]:not([data-financials-surface-role="floor"])) .alloy-accounts-command-backdrop {');
    });
});

describe("6 — the account KPI says Scheduled", () => {
    it("same figure, short word", () => {
        const src = read("components/operationalCards/FinancialsDetailCard.tsx");
        expect(src).toMatch(/label="Scheduled"\s*value=\{summary\.scheduled\}/);
        expect(src).not.toContain("Upcoming · not yet posted");
    });
});
