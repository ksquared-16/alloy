/**
 * W7-F024 / W7-F025 — TUITION BILLING READS CHILD-FIRST, AND SKIPPED ROWS STAY OUT OF THE WAY.
 *
 * Presentation only. W7-F024: rows a run skips (other frequencies, not enrolled) are a collapsed
 * "Skipped · N" with short reasons; Refused and Errored open themselves; billed rows are always open.
 * W7-F025: tuition is billed for a child, so each row leads with the child and carries the household
 * as context; siblings stay one row each. The Charges list leads with the charge's own grain.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const ui = code("app/adminV2/financials/sections/FinancialsTuitionBilling.tsx");

describe("W7-F024 — what the operator came for is open; skipped rows are a count", () => {
    it("billed and already-billed groups are primary (always open); Skipped collapses; Refused/Errored open themselves", () => {
        for (const g of ['key: "to_bill", title: "Will bill"', 'key: "generated", title: "Generated"', 'key: "unchanged", title: "Already generated']) {
            expect(ui, g).toMatch(new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + `[^}]*tone: "primary"`));
        }
        expect(ui.match(/key: "skipped", title: "Skipped"[^}]*tone: "skipped"/g)?.length).toBe(2);
        expect(ui.match(/key: "refused", title: "Refused"[^}]*tone: "alert"/g)?.length).toBe(2);
        expect(ui.match(/key: "errored", title: "Errored"[^}]*tone: "alert"/g)?.length).toBe(2);
        expect(ui).toMatch(/<details[\s\S]*?open=\{group\.tone === "alert"\}/);
        expect(ui).toContain("{group.title} · {rows.length}");
    });

    it("skipped reasons are a few words, not a sentence per row", () => {
        expect(ui).toContain('return "Different billing frequency";');
        expect(ui).toContain('return "Not enrolled yet";');
        expect(ui).not.toMatch(/billed on a different frequency — not part of a/);
        expect(ui).not.toContain("Not billed by this run");
        expect(ui).toMatch(/\{preview\.counts\.notDue\} skipped/);
    });
});

describe("W7-F025 — the child is the billing subject; the household is its account", () => {
    it("each row leads with the child, with the household beneath as context, and the amount aligned apart", () => {
        const row = ui.slice(ui.indexOf("function OutcomeRow("), ui.indexOf("function bySubject("));
        expect(row).toMatch(/data-financials-tuition-child="true"[\s\S]*?\{child \?\? n\?\.household\}/);
        expect(row).toMatch(/data-financials-tuition-household="true"[\s\S]*?\{n\.household\}/);
        expect(row).toMatch(/text-sm font-medium text-alloy-midnight/);
        expect(row).toMatch(/shrink-0 text-sm tabular-nums/);
    });

    it("siblings sort together under their household and remain one row each", () => {
        expect(ui).toMatch(/\(na\.household \?\? ""\)\.localeCompare\(nb\.household \?\? ""\) \|\| \(na\.child \?\? ""\)\.localeCompare\(nb\.child \?\? ""\)/);
        expect(ui).toMatch(/rows\.map\(\(o, i\) => \(\s*<OutcomeRow key=/);
    });

    it("the Charges list leads with the charge's own grain — never 'Account-wide' in a child's place", () => {
        const charges = code("app/adminV2/financials/sections/FinancialsCharges.tsx");
        expect(charges).toMatch(/data-financials-charge-index-grain=\{row\.childName \? "child" : "household"\}/);
        expect(charges).toMatch(/\{row\.childName \?\? row\.householdName \?\? "Household"\}/);
        expect(charges).toMatch(/\{row\.childName \? \(row\.householdName \?\? "Household"\) : "Household charge"\}/);
        expect(charges).not.toContain('"Account-wide"');
        expect(charges).toContain("<span>Charge for</span>");
    });
});
