/**
 * WHAT CONFIRMING COSTS, AND WHICH CONTROL ASKED.
 *
 * Three defects the mounted pass found, each held here by the smallest gate that can catch it
 * coming back:
 *
 *   1. The preview named a discount policy and its rate in a money column with NO MONEY IN IT,
 *      and stated no net. The resolver had already priced it — `proposed-charge-discounts`
 *      returns `expectedCents` — and the figure was being dropped on the way to the card.
 *
 *   2. "AFTER POSTING $536.00" sat in bold beside "Current balance $536.00" for a +$400.00
 *      charge. `charge.add` writes a draft and then, where no review boundary applies, posts it;
 *      so the label was right and the figure was the unchanged balance.
 *
 *   3. Service date, Effective from and Effective date were raw `<input type="date">` — the
 *      browser's widget, beside canonical Alloy dropdowns, on the surfaces that commit money.
 *
 * The locks are deliberately split: the arithmetic ones drive the real adapter, because a source
 * grep cannot tell a carried figure from a recomputed one, and the grammar ones read source,
 * because "no native control here" is a statement about the file.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { adaptAddChargeSpecimen } from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";
import type { ChargeTemplateOption } from "@/lib/cardLab/cardLabTypes";
import {
    parseAlloyDateInput,
    alloyDateToday,
} from "@/lib/workspace/alloyDateValue";
import { reconcileResponsibilityShares } from "@/lib/financials/responsibility/reconcileResponsibilityShares";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
/** Source with comments stripped — a rule that survives only in prose is not a rule. */
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ADD_CHARGE = "components/operationalCards/AddChargeCommand.tsx";
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const RESP = "app/adminV2/financials/FinancialsResponsibilityPanel.tsx";
const ADAPTER = "lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts";
const ROUTE = "app/api/admin/financials/proposed-charge-discounts/route.ts";
const DATE_INPUT = "components/workspace/AlloyDateInput.tsx";
const CSS = "app/adminV2/components/alloyOsRuntime.css";

const template = (over: Partial<ChargeTemplateOption> = {}): ChargeTemplateOption => ({
    key: "monthly_tuition",
    label: "Monthly tuition",
    amountStrategy: "manual",
    amount: null,
    occursOn: "service_period_start",
    billableOn: "next_billing_cycle",
    responsibility: "Household",
    allowsDateOverride: false,
    payerTargeting: "default_split",
    requiresSubject: true,
    requiresNote: false,
    reviewRequired: false,
    categoryKey: "tuition",
    ...over,
});

/** The mounted specimen: $400.00 gross, 10% sibling discount, $536.00 scoped balance. */
const mounted = (over: Record<string, unknown> = {}) =>
    adaptAddChargeSpecimen({
        template: template(),
        subjectLabel: "Certa Certhouse",
        amount: "$400.00",
        note: "",
        period: "September 2026",
        balanceCents: 53_600,
        currency: "USD",
        previewSummary: "monthly_tuition $400.00",
        previewChanges: [],
        discountCents: 4_000,
        ...over,
    });

describe("the preview states what the discount is worth, not only what it is called", () => {
    it("carries the resolver's own reduction into the card as money", () => {
        const s = mounted();
        expect(s.previewDiscountAmount, "the discount's money, not its rate").toBe("$40.00");
    });

    it("states the net, which is the number the operator came for", () => {
        expect(mounted().previewNet, "$400.00 gross less a $40.00 discount").toBe("$360.00");
    });

    it("says nothing about a discount when none applies — null, never $0.00", () => {
        const s = mounted({ discountCents: null });
        expect(s.previewDiscountAmount).toBeNull();
        expect(s.previewNet, "no discount means the net IS the gross").toBe("$400.00");
    });

    it("leaves every consequence unresolved when the gross is not resolved yet", () => {
        const s = mounted({ previewSummary: null, amount: "—", discountCents: null });
        expect(s.previewNet, "a placeholder must not become a financial claim").toBeNull();
        expect(s.previewPostedBalance).toBeNull();
    });

    it("the route the figure comes from actually returns it", () => {
        expect(code(ROUTE), "expectedCents is the resolver's amountCents").toMatch(
            /expectedCents:\s*r\.amountCents/,
        );
    });

    it("the card carries it through instead of dropping it, and never derives it from the rate", () => {
        const card = code(CARD);
        expect(card, "the state shape declares the money").toMatch(/expectedCents/);
        expect(card, "formatted from the carried cents").toMatch(
            /expectedAmount:[\s\S]{0,120}money\(o\.expectedCents, currency\)/,
        );
        expect(card, "the specimen is given the canonical figure").toMatch(/discountCents:\s*chargeDiscountCents/);
        expect(
            /basisValue[^\n]*\/\s*100|basisValue[^\n]*\*\s*/.test(card),
            "a rate multiplied by an amount in this card would be a second reduction authority",
        ).toBe(false);
    });

    it("the discount line renders the carried amount and the net line exists", () => {
        const cmd = code(ADD_CHARGE);
        expect(cmd).toMatch(/data-addcharge-preview-discount-amount="true"/);
        expect(cmd, "the line prints the specimen's money").toMatch(/specimen\.previewDiscountAmount/);
        expect(cmd).toMatch(/data-addcharge-preview-net="true"/);
        expect(cmd).toMatch(/specimen\.previewNet/);
    });
});

describe("the posting language follows what the writer actually does", () => {
    it("projects the balance the posting branch will produce, not the one it started with", () => {
        const s = mounted();
        expect(s.previewBefore).toBe("$536.00");
        expect(
            s.previewPostedBalance,
            "$536.00 + a $400.00 gross — the reduction posts separately, so it is not netted here",
        ).toBe("$936.00");
        expect(
            s.previewPostedBalance === s.previewBefore,
            "a projection identical to the current balance is the defect this lock exists for",
        ).toBe(false);
    });

    it("a review-gated template still leaves the balance alone", () => {
        const s = mounted({ template: template({ reviewRequired: true }) });
        expect(s.previewAfter, "the unposted reading is the untouched balance").toBe("$536.00");
    });

    it("the card says which of the two consequences confirming causes", () => {
        const cmd = code(ADD_CHARGE);
        expect(cmd, "the branch is the template's own review flag").toMatch(/t\.reviewRequired/);
        expect(cmd).toMatch(/data-addcharge-posting="draft"/);
        expect(cmd).toMatch(/data-addcharge-posting="posts"/);
        expect(cmd, "the posted figure is the projection, never previewBefore again").toMatch(
            /data-addcharge-posted-balance="true"[\s\S]{0,200}specimen\.previewPostedBalance/,
        );
        expect(
            /After posting<\/span>|>After posting</.test(cmd) && !/previewPostedBalance/.test(cmd),
            "an After posting label with no projection behind it is the original defect",
        ).toBe(false);
    });

    it("the writer this copy describes is still the one that runs", () => {
        const lifecycle = code("lib/financials/chargeLifecycle/chargeLifecycleService.ts");
        expect(lifecycle, "writeTemplateDraftCharge inserts a draft").toMatch(/status:\s*"draft"/);
        const action = code("lib/adminV2/actions/definitions/financialChargeActions.ts");
        expect(action, "and posts it only where no review boundary applies").toMatch(
            /!written\.reviewRequired[\s\S]{0,400}postChildcareCharge/,
        );
    });
});

describe("the date controls belong to Alloy, not to the browser", () => {
    for (const [name, rel] of [
        ["Add Charge", ADD_CHARGE],
        ["the Financials card", CARD],
        ["Responsibility", RESP],
    ] as const) {
        it(`${name} asks for a date through the canonical control`, () => {
            const src = code(rel);
            expect(
                /type="date"|type='date'/.test(src),
                "a native date control is the browser's widget on a surface that commits money",
            ).toBe(false);
            expect(src, "and the canonical one is what replaced it").toMatch(/AlloyDateInput/);
        });
    }

    it("the primitive is the workspace's, keyed like its time sibling", () => {
        const src = code(DATE_INPUT);
        expect(src, "the popover must be a listbox so escape-layer ownership already covers it").toMatch(
            /role="listbox"/,
        );
        expect(src, "display goes through the canonical formatter").toMatch(/formatDisplayDate/);
        expect(
            /type="date"/.test(src),
            "the replacement must not be the native control in a wrapper",
        ).toBe(false);
    });

    it("every class the control wears has a rule behind it", () => {
        const src = read(DATE_INPUT);
        const css = read(CSS);
        const worn = new Set(
            [...src.matchAll(/"(alloy-date-input(?:__[a-z-]+)?(?:--[a-z-]+)?)"/g)].map((m) => m[1]!),
        );
        expect(worn.size, "the control wears date-input classes").toBeGreaterThan(4);
        for (const cls of worn) {
            expect(css.includes(`.${cls}`), `${cls} renders as an unstyled string without a rule`).toBe(true);
        }
    });

    it("stores exactly what the native control stored, so no caller's contract moved", () => {
        expect(parseAlloyDateInput("2026-09-30")).toBe("2026-09-30");
        expect(parseAlloyDateInput("9/30/2026")).toBe("2026-09-30");
        expect(parseAlloyDateInput("Sep 30, 2026")).toBe("2026-09-30");
        expect(parseAlloyDateInput("30 Sep 2026")).toBe("2026-09-30");
        expect(parseAlloyDateInput(""), "clearing a date is an answer").toBe("");
        expect(parseAlloyDateInput("Feb 30, 2026"), "a day the month has not is a typo").toBeNull();
        expect(parseAlloyDateInput("not a date"), "unparseable keeps the last good value").toBeNull();
    });

    it("every accepted input stores the native shape — relative words included", () => {
        const at = new Date(2026, 8, 30, 23, 30);
        expect(parseAlloyDateInput("today", at)).toBe("2026-09-30");
        expect(parseAlloyDateInput("tomorrow", at)).toBe("2026-10-01");
        expect(parseAlloyDateInput("yesterday", at)).toBe("2026-09-29");
        /*
         * The shape guard, not just the values: a parser that returned the operator's own word
         * would hand "today" to a resolver expecting a date, and every per-case assertion above
         * could still pass while one branch leaked prose into the payload.
         */
        for (const raw of ["today", "tomorrow", "yesterday", "9/30", "2026-09-30", "Sep 30, 2026", ""]) {
            const stored = parseAlloyDateInput(raw, at);
            expect(stored, `${raw || "(empty)"} parses`).not.toBeNull();
            expect(stored, `${raw || "(empty)"} stores YYYY-MM-DD`).toMatch(/^(\d{4}-\d{2}-\d{2})?$/);
        }
    });

    it("today is the viewer's calendar day, never a UTC slice", () => {
        const at = new Date(2026, 8, 30, 23, 30);
        expect(alloyDateToday(at)).toBe("2026-09-30");
    });
});

describe("responsibility validation names the input that is actually missing", () => {
    const party = (over: Record<string, unknown> = {}) => ({
        responsiblePartyId: "p1",
        name: "Certt Certhouse",
        roleLabel: "Primary contact",
        method: "fixed" as const,
        amount: "",
        ...over,
    });

    it("a listed party with no amount is told about the amount, not about naming anyone", () => {
        const r = reconcileResponsibilityShares([party()]);
        expect(r.ok, "the refusal is unchanged").toBe(false);
        expect(r.message).toBe("Enter an amount for at least one responsible party.");
        expect(
            /name at least one/i.test(r.message ?? ""),
            "telling an operator to name a party they have named is the defect",
        ).toBe(false);
    });

    it("a percentage row asks for a percentage", () => {
        expect(reconcileResponsibilityShares([party({ method: "percentage" })]).message).toBe(
            "Enter a percentage for at least one responsible party.",
        );
    });

    it("mixed methods ask for a share", () => {
        const r = reconcileResponsibilityShares([party(), party({ responsiblePartyId: "p2", method: "percentage" })]);
        expect(r.message).toBe("Enter a share for at least one responsible party.");
    });

    it("no parties at all is the one case that message was ever true for", () => {
        const r = reconcileResponsibilityShares([]);
        expect(r.ok).toBe(false);
        expect(r.message).toBe("Name at least one responsible party.");
    });

    it("the reconciliation rules are not weakened", () => {
        expect(
            reconcileResponsibilityShares([
                party({ method: "remainder" }),
                party({ responsiblePartyId: "p2", method: "remainder" }),
            ]).message,
        ).toBe("Only one party can take the remainder.");
        expect(
            reconcileResponsibilityShares([
                party({ method: "percentage", amount: "70" }),
                party({ responsiblePartyId: "p2", method: "percentage", amount: "40" }),
            ]).message,
        ).toBe("The percentages total 110%.");
    });
});
