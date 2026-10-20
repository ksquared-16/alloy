/**
 * W7-F034..F040 — dates, optional Preview, correction accounting, responsibility entry and split
 * editing, and expected funding beside the share.
 *
 * F036 census: lowering a Materials charge by $5 wrote a CREDIT (category credit → credit_liability);
 * 4030 Supply Fees never moved. Both GL readers honour `metadata.gl_mapping_key` before the category
 * default and nothing that nets or buckets money reads it — so a correction stamps the corrected
 * charge's own key, and its category stays a contra category (changing it would double-count).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { chargeCategoryForIntent } from "@/lib/financials/corrections/correctionIntent";
import { balanceTwoPartySplit, reconcileResponsibilityShares, type ShareDraft } from "@/lib/financials/responsibility/reconcileResponsibilityShares";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const pct = (id: string, name: string, amount: string): ShareDraft => ({ responsiblePartyId: id, name, roleLabel: null, method: "percentage", amount });

describe("F036 · a correction is accounted where the charge it corrects is", () => {
    it("correction → Adjustment (either way); goodwill credit → Credit; legacy direction unchanged", () => {
        expect(chargeCategoryForIntent("reduce", "correction")).toBe("adjustment");
        expect(chargeCategoryForIntent("increase", "correction")).toBe("adjustment");
        expect(chargeCategoryForIntent("reduce", "credit")).toBe("credit");
        expect(chargeCategoryForIntent("reduce", null)).toBe("credit");
        expect(chargeCategoryForIntent("increase", null)).toBe("adjustment");
    });

    it("the writer stamps the corrected charge's own GL key; the reversal inherits it", () => {
        const svc = code("lib/financials/reductions/manualReductionService.ts");
        expect(svc).toMatch(/if \(!glMappingKey && input\.classifyUnderSourceCharge\)/);
        expect(svc).toMatch(/String\(row\.metadata\?\.gl_mapping_key \?\? ""\)\.trim\(\)\s*\|\| CHARGE_CATEGORY_GL_MAPPING_KEY\[category/);
        expect(svc).toMatch(/\.\.\.\(glMappingKey \? \{ gl_mapping_key: glMappingKey \} : \{\}\)/);
        expect(svc).toMatch(/glMappingKey: inheritedGlKey,/);
        /* The category is NOT the source's — netting, lenses and collectible stay exactly as they were. */
        expect(svc).toMatch(/chargeCategory: input\.chargeCategory,/);
    });

    it("the action requires the corrected charge, refuses a 'credit' that raises, and states the account in preview", () => {
        const action = code("lib/adminV2/actions/definitions/financialReductionActions.ts");
        expect(action).toMatch(/code: "correction_needs_charge"/);
        expect(action).toMatch(/code: "credit_reduces"/);
        expect(action).toMatch(/classifyUnderSourceCharge: purpose === "correction"/);
        expect(action).toMatch(/Accounted under \$\{label\} — the corrected charge's own account/);
    });

    it("the form names the intent; a discount is a policy, not a manual write", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toContain('{ value: "correction:reduce", label: "Correct the amount — lower this charge" }');
        expect(card).toContain('{ value: "credit:reduce", label: "Give a goodwill credit" }');
        expect(card).toContain("A discount is a policy, not a one-off adjustment — set it from Manage discounts.");
        expect(card).not.toContain("Recorded as a draft — it changes what the family owes once posted.");
    });
});

describe("F035 · Preview is optional for one charge, one account, one share", () => {
    it("Adjust: Confirm needs a valid form, not a preview", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toMatch(/if \(!adjustOpen \|\| running \|\| magnitudeCents === null \|\| !adjustReason\.trim\(\) \|\| !adjustAgreementId\) return;/);
        expect(card).toMatch(/data-testid="adjustment-confirm"\s*disabled=\{running \|\| !adjustReason\.trim\(\) \|\| !adjustAgreementId \|\| adjustMagnitudeCents\(\) === null\}/);
    });

    it("Responsibility and expected funding: Save/Confirm is live once valid; the command re-validates", () => {
        const panel = code("app/adminV2/financials/FinancialsResponsibilityPanel.tsx");
        expect(panel).toMatch(/onClick=\{\(\) => void run\("execute"\)\}\s*disabled=\{busy !== null \|\| confirmBlocker !== null\}/);
        expect(code("app/adminV2/financials/FinancialsExpectedFundingPanel.tsx")).not.toMatch(/disabled=\{busy !== null \|\| !preview\}/);
    });
});

describe("F034 · dates read like dates", () => {
    it("server previews and the editor default use the human formatter and the viewer's day", () => {
        const reductions = code("lib/adminV2/actions/definitions/financialReductionActions.ts");
        expect(reductions).toMatch(/`Effective \$\{humanDay\(t\(payload\?\.effective_date\)\) \|\| "—"\}`/);
        expect(reductions).not.toMatch(/`From \$\{t\(payload\?\.effective_(start|end)\)\}`/);
        expect(code("lib/adminV2/actions/definitions/financialResponsibilityActions.ts")).toMatch(/from \$\{humanDay\(t\(payload\?\.effective_start\)\)\}/);
        const panel = code("app/adminV2/financials/FinancialsResponsibilityPanel.tsx");
        expect(panel).toMatch(/useState\(\(\) => alloyDateToday\(\)\)/);
        expect(panel).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
    });
});

describe("F039 · the split is exactly 100%, and two parties balance themselves", () => {
    it("two percentage parties: editing either moves the other to 100%", () => {
        const two = [pct("a", "Dana", "50"), pct("b", "Rosa", "50")];
        expect(balanceTwoPartySplit(two, 0, "75").map((s) => s.amount)).toEqual(["75", "25"]);
        expect(balanceTwoPartySplit(two, 1, "40").map((s) => s.amount)).toEqual(["60", "40"]);
        expect(balanceTwoPartySplit(two, 0, "33.33").map((s) => s.amount)).toEqual(["33.33", "66.67"]);
        /* Blank or out of range: nothing is moved for the operator. */
        expect(balanceTwoPartySplit(two, 0, "").map((s) => s.amount)).toEqual(["", "50"]);
        expect(balanceTwoPartySplit(two, 0, "120").map((s) => s.amount)).toEqual(["120", "50"]);
    });

    it("three or more: nothing is redistributed, and the gap is stated", () => {
        const three = [pct("a", "Dana", "75"), pct("b", "Rosa", "25"), pct("c", "Gale", "")];
        expect(balanceTwoPartySplit(three, 0, "50").map((s) => s.amount)).toEqual(["50", "25", ""]);
        expect(reconcileResponsibilityShares(three)).toEqual({ ok: false, message: "Allocate a percentage to Gale by reducing one or more existing shares." });
        expect(reconcileResponsibilityShares([pct("a", "Dana", "60"), pct("b", "Rosa", "25")])).toEqual({ ok: false, message: "15% remaining to allocate" });
        expect(reconcileResponsibilityShares([pct("a", "Dana", "70"), pct("b", "Rosa", "40")])).toEqual({ ok: false, message: "10% over 100%" });
        expect(reconcileResponsibilityShares([pct("a", "Dana", "33.33"), pct("b", "Rosa", "33.33"), pct("c", "Gale", "33.34")])).toEqual({ ok: true, message: null });
    });

    it("a fixed share may still cover part of an obligation (Scenario 62) — the exact-100 rule is percentage-only", () => {
        const r = reconcileResponsibilityShares([{ responsiblePartyId: "a", name: "Dana", roleLabel: null, method: "fixed", amount: "18" }]);
        expect(r.ok).toBe(true);
    });
});

describe("F037 / F040 · where responsibility and funding are managed", () => {
    it("Manage responsibility is a labelled action beside Manage payments", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail).toMatch(/data-financials-manage-responsibility="open"[\s\S]{0,300}Manage responsibility <span aria-hidden>&rarr;<\/span>[\s\S]{0,300}data-financials-manage-payments="open"/);
    });

    it("expected funding is managed beside each share of the arrangement in force", () => {
        const panel = code("app/adminV2/financials/FinancialsResponsibilityPanel.tsx");
        expect(panel).toMatch(/data-financials-responsibility-funding="true"[\s\S]{0,400}<FinancialsExpectedFundingPanel\s*shareId=\{sh\.id\}\s*arrangementId=\{scopeArrangement\.arrangement!\.id\}/);
    });

    it("Scenario 20 is deterministic: its obligation exists by the canonical writer, and the script names it", () => {
        const catalog = code("lib/qa/financialsDirectorQa/scenarioCatalog.ts");
        expect(catalog).toMatch(/Registration fee \$75\.00 for Sasha Split, posted Oct 20, 2026/);
        expect(read("../certification/financials/w7-f040/split-family-obligation.mjs")).toMatch(/action_key: "charge\.add"[\s\S]*action_key: "billing\.resolve_responsibility"/);
    });
});
