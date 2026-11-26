/**
 * A CHARGE THAT RESOLVES TO NOTHING IS REFUSED BEFORE THE MONEY, NOT AFTER.
 *
 * Measured mounted on deployed staging (certification/financials/w7-repair-1/after-add-charge.png):
 * the Add command's first charge type resolved to $0.00, "Add charge" was offered as an ordinary
 * enabled primary, and pressing it returned 409 with the words `amount_not_resolvable` in a
 * role=alert. `writeTemplateDraftCharge` requires `amountCents > 0`, so the command could have
 * known. Two things had to be true for that to stop happening, and both are asserted here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { adaptAddChargeSpecimen } from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import { operatorRefusal } from "@/lib/financials/commands/operatorRefusal";
import { ADD_CHARGE_SPECIMEN } from "@/lib/cardLab/cardLabFixtures";

const template = ADD_CHARGE_SPECIMEN.template;
const base = {
    template,
    subjectLabel: "Household",
    amount: "",
    note: "",
    period: "October 2026",
    balanceCents: 1_800,
    currency: "USD",
    previewChanges: [] as string[],
};

describe("the resolved gross reaches the command as a figure, not as a formatted string", () => {
    it("reports a resolved zero as zero", () => {
        const s = adaptAddChargeSpecimen({ ...base, previewSummary: "enrollment_fee_waived $0.00" });
        expect(s.previewGrossCents).toBe(0);
    });

    it("reports an unresolved preview as null, never as zero", () => {
        /* The distinction the formatted string cannot carry: both render as an absent line. */
        const s = adaptAddChargeSpecimen({ ...base, previewSummary: null });
        expect(s.previewGrossCents).toBeNull();
    });

    it("reports an ordinary charge at its resolved figure", () => {
        const s = adaptAddChargeSpecimen({ ...base, previewSummary: "tuition_monthly $400.00" });
        expect(s.previewGrossCents).toBe(40_000);
    });
});

describe("the command blocks on a resolved zero and only on a resolved zero", () => {
    const SRC = readFileSync(path.join(process.cwd(), "components/operationalCards/AddChargeCommand.tsx"), "utf8");
    const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    it("derives the block from an exact zero, not from falsiness", () => {
        /*
         * `!specimen.previewGrossCents` would also be true for null — the state where the preview
         * has not answered yet — and would refuse every charge ever raised.
         */
        expect(/const resolvesToNothing = specimen\.previewGrossCents === 0;/.test(CODE)).toBe(true);
    });

    it("disables the commit on it", () => {
        const submit = CODE.slice(CODE.indexOf("data-addcharge-submit") - 600, CODE.indexOf("data-addcharge-submit"));
        expect(/disabled=\{\s*resolvesToNothing/.test(submit), "the primary is disabled by it").toBe(true);
    });

    it("says why, in front of the button", () => {
        expect(/\{resolvesToNothing \?\s*\(\s*<p[^>]*data-addcharge-blocked=/.test(CODE)).toBe(true);
    });
});

describe("the token never reaches an operator bare", () => {
    it("translates amount_not_resolvable into a sentence", () => {
        const copy = operatorRefusal("amount_not_resolvable", "The charge was refused.");
        expect(copy).not.toContain("amount_not_resolvable");
        expect(copy).toMatch(/nothing to charge/i);
    });
});
