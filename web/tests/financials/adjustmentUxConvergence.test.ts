/**
 * ADJUSTMENT UX CONVERGENCE — the contracts a surface can break silently.
 *
 * Every assertion here is a PLANT that escaped once, or could. They are source-level because the
 * things they protect are structural: a CSS property that re-creates a card inside a card, a
 * payload field that re-introduces a second opinion about a sign, a host that reaches a different
 * authority than its twin. None of those fail a type check and none of them throw.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** Comments removed, so a rule is never satisfied by the sentence that explains it. */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const CSS = "app/adminV2/components/operationalCardsShared.css";
const ACTION = "lib/adminV2/actions/definitions/financialReductionActions.ts";
const REDUCTION = "lib/financials/reductions/manualReductionService.ts";
const CORE = "lib/financials/reductions/reductionCore.ts";
const RESOLVER = "lib/financials/corrections/prospectiveCorrection.ts";

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("the Adjustment command is not a card inside a card", () => {
    /**
     * ── THE STACKING DEFECT, AS A RULE RATHER THAN A PIXEL ───────────────────────────────────
     *
     * `.alloy-os-fdetail__movepanel` is a BAND for the Details card: own border, own background,
     * own 12px radius, own padding, `z-index: 61` to clear the floor it sits on, and
     * `max-height: min(70svh, 520px)` with `overflow-y: auto` so it bounds and scrolls itself.
     *
     * Convergence made that band the BODY of an elevated command card, which already supplies
     * every one of those: the perimeter, the scrim, the viewport cap, and `__body` as the scroll
     * container. The result was a bordered, independently-scrolling card inside a bordered card,
     * lifted one layer above its own host and capped shorter than the room the host gave it.
     *
     * `.alloy-os-addcharge` was stripped of exactly these properties for exactly this reason — its
     * own CSS comment records it — which is why this is the shared contract and not a special case.
     */
    const COMMAND_BODY_RULE =
        /\.alloy-os-financials__entrybody\s*>\s*\.alloy-os-fdetail__movepanel\s*\{([\s\S]*?)\}/;

    it("the band is neutralised where a command hosts it", () => {
        const match = COMMAND_BODY_RULE.exec(src(CSS));
        expect(match, "the command-body rule exists").not.toBeNull();
        const body = match![1];
        /* No second perimeter. */
        expect(body).toMatch(/border:\s*0/);
        expect(body).toMatch(/border-radius:\s*0/);
        expect(body).toMatch(/background:\s*transparent/);
        expect(body).toMatch(/padding:\s*0/);
        /* THE HOST OWNS THE OVERFLOW. This is the half that made it a layout defect. */
        expect(body).toMatch(/max-height:\s*none/);
        expect(body).toMatch(/overflow-y:\s*visible/);
        /* And no self-lift above its own host. */
        expect(body).toMatch(/position:\s*static/);
        expect(body).toMatch(/z-index:\s*auto/);
    });

    it("the band keeps its own presentation where it is genuinely a band", () => {
        /*
         * Move payment, Reverse and Responsibility still mount it inside the Details card and
         * still need the border, the lift and the self-bounding. Scoping the repair to the host
         * rather than to the panel is what keeps them working.
         */
        const base = /\.alloy-os-fdetail__movenotice,\s*\.alloy-os-fdetail__movepanel\s*\{([\s\S]*?)\}/.exec(src(CSS));
        expect(base).not.toBeNull();
        expect(base![1]).toMatch(/z-index:\s*61/);
        expect(base![1]).toMatch(/max-height:\s*min\(70svh/);
        expect(base![1]).toMatch(/overflow-y:\s*auto/);
    });

    it("the sticky confirm row's offsets follow the padding that is gone", () => {
        /*
         * `bottom: -10px` / `margin-bottom: -10px` cancelled the band's own 10px padding. With the
         * padding removed they would pull the action row 10px off the bottom of the card and let
         * the last field slide underneath it — a different stacking bug in the same place.
         */
        const rule =
            /\.alloy-os-financials__entrybody\s*>\s*\.alloy-os-fdetail__movepanel\s*>\s*\.alloy-os-fdetail__moveactions\s*\{([\s\S]*?)\}/.exec(
                src(CSS),
            );
        expect(rule).not.toBeNull();
        expect(rule![1]).toMatch(/bottom:\s*0/);
        expect(rule![1]).toMatch(/margin-bottom:\s*0/);
    });

    it("no second modal primitive was introduced", () => {
        /* The repair is CSS over the existing host. A new overlay class would mean a second one. */
        const card = code(CARD);
        expect((card.match(/modalClass="command"/g) ?? []).length).toBeGreaterThan(0);
        expect(card).not.toMatch(/alloy-os-adjustment-modal|adjustmentOverlay|AdjustmentModal/);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("both hosts reach the same adjustment authority", () => {
    /**
     * §19. Parity is not identical rows on screen — the two hosts legitimately show different
     * cohorts. It is the same command contract for the same economic situation, and the way that
     * is guaranteed here is that there is ONE band and ONE writer, rendered twice.
     */
    it("one band, rendered by both the unified Add command and Adjust-from-a-row", () => {
        const card = code(CARD);
        /* Declared once. */
        expect((card.match(/const adjustmentBand = /g) ?? []).length).toBe(1);
        /* Rendered by both hosts. */
        expect((card.match(/\{adjustmentBand\}/g) ?? []).length).toBe(2);
        /*
         * Both wrap it in the host marker the stacking repair is scoped to.
         *
         * `alloy-os-financials__entrybody` itself is NOT the count to assert: three other commands
         * use it too — responsibility, discount and payment methods — and they host their own
         * components rather than a `movepanel`, which is why the repair's `>` child selector
         * reaches only the two Adjustment bodies and leaves those three untouched.
         */
        /*
         * BOTH BY THE CLASS THE REPAIR IS SCOPED TO, not merely by the data attribute.
         *
         * A plant that renamed the class on only the Add host left this lock GREEN while the
         * stacking repair silently stopped applying there — the two hosts would then draw the same
         * band differently, which is the precise failure §19 is about. The class and the attribute
         * are asserted together, on the same element, so neither can drift alone.
         */
        expect(
            (card.match(/className="alloy-os-financials__entrybody" data-financials-entry="adjustment"/g) ?? []).length,
            "both Adjustment hosts carry the class the CSS repair is scoped to",
        ).toBe(2);
        expect((card.match(/data-financials-entry="(responsibility_admin|discount_admin|payments_admin)"/g) ?? []).length).toBe(3);
    });

    it("billing.adjust_account is the only writer either host calls", () => {
        const card = code(CARD);
        expect((card.match(/"billing\.adjust_account"/g) ?? []).length).toBe(2); // one preview, one execute
        /* No second money engine: nothing in the card writes a charge or a reduction directly. */
        expect(card).not.toMatch(/from\("charges"\)|from\("financial_reduction_applications"\)/);
    });

    it("every command layer is nameable in the DOM, so a measurement can anchor on it", () => {
        /*
         * Add → Adjustment returned its UniversalCard bare while every other command wrapped its
         * card in a host div — so it was the one layer with no `data-financials-overlay`, and a
         * responsive measurement had nothing to find.
         */
        const card = code(CARD);
        expect(card).toContain('data-financials-overlay="add_adjustment"');
        expect(card).toContain('data-financials-overlay="adjust_charge"');
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("the sign is converted once, server-side", () => {
    it("the card sends the intent and never a signed amount", () => {
        const card = code(CARD);
        /* The intent shape. */
        expect(card).toMatch(/direction: adjustDirection/);
        expect(card).toMatch(/magnitude_cents: magnitudeCents/);
        /*
         * AND NOT THE OLD ONE. `amount_cents` in an adjust payload would be a second opinion about
         * the sign, and `charge_category` would restore the control that outranked the direction.
         */
        const adjustCalls = card.slice(card.indexOf("previewAdjustment"), card.indexOf("previewReversal"));
        expect(adjustCalls).not.toMatch(/amount_cents/);
        expect(adjustCalls).not.toMatch(/charge_category/);
    });

    it("the action derives the category and never honours a sent one alongside a direction", () => {
        const action = code(ACTION);
        expect(action).toMatch(/chargeCategory: normalized\.chargeCategory/);
        expect(action).toMatch(/amountCents: normalized\.amountCents/);
        /* The pre-convergence reads are gone from the execute path. */
        expect(action).not.toMatch(/\(t\(payload\?\.charge_category\) \|\| "credit"\) as ManualReductionCategory/);
        expect(action).not.toMatch(/amountCents: Number\(payload\?\.amount_cents\)/);
    });

    it("validate, preview and execute all go through the one normalizer", () => {
        const action = code(ACTION);
        expect((action.match(/normalizeAdjustmentIntent\(payload\)/g) ?? []).length).toBe(3);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("history is not rewritten, and not re-dated", () => {
    /**
     * ── THE REVERSAL PLANT ───────────────────────────────────────────────────────────────────
     *
     * `reverseManualReduction` was correctly dated `today` and then handed
     * `periodKey: original.period_key`. The canonical `billing_period_id` came out right, because
     * the S2 binder resolves it from the charge's own date — and the STATED period contradicted it.
     * A credit raised in a now-finalized November and reversed in December was written as a
     * December charge carrying a November period key, so every surface reading `period_key` showed
     * the reversal inside closed history.
     */
    it("a reversal does not carry the original's period key", () => {
        const reduction = code(REDUCTION);
        expect(reduction).not.toMatch(/periodKey:\s*original\.period_key/);
        /* It is still dated prospectively, which is the other half of the requirement. */
        expect(reduction).toMatch(/effectiveDate:\s*today/);
    });

    it("a reversal appends rather than editing or deleting", () => {
        const reduction = code(REDUCTION);
        /* The original is updated only to record WHICH reversal undid it — never its economics. */
        expect(reduction).not.toMatch(/\.delete\(\)/);
        expect(reduction).toMatch(/reversed_by_id: reversal\.applicationId/);
        expect(reduction).toMatch(/amountCents: -original\.amount_cents/);
    });

    it("the source charge is provenance, and the correction's own date is the period authority", () => {
        /* reductionCore carries the binding the binder resolved for THIS charge's own date. */
        const core = code(CORE);
        expect(core).toMatch(/createdBinding/);
        expect(core).toMatch(/billing_period_id: created\.billing_period_id/);
        /* The resolver says the same thing on the read side. */
        expect(code(RESOLVER)).toMatch(/never from the source|resolution\.destination/);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("the new due date is the correction's own, or none", () => {
    /**
     * The reduction path never called the due-date authority at all, so an increase was written
     * with `due_date: null` even where the organisation had configured terms.
     */
    it("an increase resolves a due date through the shared function", () => {
        const reduction = code(REDUCTION);
        expect(reduction).toMatch(/resolveCorrectionDueDate\(supabase, \{/);
        expect(reduction).toMatch(/dueDate: due\.dueDate/);
        /* From the correction's OWN dates — §14's prohibition is the source's. */
        expect(reduction).toMatch(/effectiveDate: input\.effectiveDate/);
        expect(reduction).not.toMatch(/dueDate:\s*source|due_date:\s*source/);
    });

    it("a reduction is given none, decided by the shared function and not by a caller", () => {
        const resolver = code(RESOLVER);
        expect(resolver).toMatch(/directionFromSignedCents\(args\.amountCents\) === "reduce"/);
        expect(resolver).toMatch(/applicable: false/);
    });

    it("the core passes a caller's due date through and resolves none of its own", () => {
        const core = code(CORE);
        expect(core).toMatch(/dueDate: input\.charge\.dueDate \?\? null/);
        expect(core).not.toMatch(/resolveDueDate/);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("idempotency is correct AND communicated", () => {
    /**
     * §18 names the earlier Add Charge defect: idempotency worked and the UI reported success. The
     * service has always answered honestly; `runAction` read the body only to decide whether to
     * throw and discarded everything else, so the answer had nowhere to go.
     */
    it("runAction returns its answer instead of discarding it", () => {
        const card = code(CARD);
        expect(card).toMatch(/const json = \(await res\.json\(\)\) as ActionExecuteAnswer/);
        expect(card).toMatch(/return json;/);
    });

    it("the surface reads idempotent off execution_result itself, not off a wrapper", () => {
        /*
         * The route emits `execution_result: result.actionResult.result.detail` DIRECTLY. Reading
         * `execution_result.detail` would be undefined forever — a notice that silently never
         * fires, which is the exact shape of a false green.
         */
        const card = code(CARD);
        /*
         * AND IT GOES THROUGH THE CANONICAL READER. Hand-rolling the path is how three Payments
         * modules ended up one level too deep on this same envelope; `executeDetailFrom` prefers a
         * nested `detail` where a route nests one and otherwise treats `execution_result` as the
         * detail, so no surface has to know which kind it is talking to.
         */
        expect(card).toMatch(/executeDetailFrom\(result\)/);
        expect(card).not.toMatch(/execution_result\?\.detail/);
        expect(card).toMatch(/detail\.idempotent === true/);
    });

    it("a repeat is a notice, never an error", () => {
        const card = code(CARD);
        const at = card.indexOf("detail.idempotent === true");
        const branch = card.slice(at, at + 600);
        expect(branch).toMatch(/setAdjustNotice/);
        expect(branch).not.toMatch(/setAdjustError/);
        expect(branch).toMatch(/nothing new was created/);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("the operator is not asked to nominate a charge they are not correcting", () => {
    /**
     * §5. The canonical authority supports a genuine account-level adjustment — `source_charge_id`
     * is nullable — and the Preview button refused to let an operator even preview one.
     */
    it("preview is not gated on a source charge", () => {
        const card = code(CARD);
        const at = card.indexOf('data-testid="adjustment-preview-button"');
        expect(at).toBeGreaterThan(-1);
        const button = card.slice(at, at + 400);
        expect(button).toMatch(/disabled=\{running/);
        expect(button).not.toMatch(/!adjustSourceChargeId/);
        /* It IS gated on a usable amount, which is a different thing. */
        expect(button).toMatch(/adjustMagnitudeCents\(\) === null/);
    });

    it("the empty answer is stated as a decision rather than left blank", () => {
        expect(code(CARD)).toMatch(/The account as a whole — not one charge/);
    });

    it("an empty source reaches the action as null, not as an empty string", () => {
        const card = code(CARD);
        expect((card.match(/source_charge_id: adjustSourceChargeId \|\| null/g) ?? []).length).toBe(2);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("the preview explains the consequence, not the implementation", () => {
    it("names no period id and no internal branch", () => {
        const resolver = code(RESOLVER);
        /* What the operator is shown is composed only in the preview builder. */
        const preview = resolver.slice(resolver.indexOf("export async function previewProspectiveCorrection"));
        expect(preview).not.toMatch(/billingPeriodId|prospective|S5|legacy_billing_period_key/);
        /*
         * AND NO RAW CADENCE KEY. §8 forbids an internal key where a business label exists, so the
         * period reaches the sentence through `billingPeriodLabel` — "December 2026", not
         * "2026-12". Interpolating `periodKey` directly is exactly the regression this catches.
         */
        expect(preview).toMatch(/Recorded in \$\{billingPeriodLabel\(resolution\.destination\.periodKey\)\}/);
        expect(preview).not.toMatch(/Recorded in \$\{resolution\.destination\.periodKey\}/);
    });

    it("says a finalized period stays unchanged rather than only naming it", () => {
        expect(code(RESOLVER)).toMatch(/is finalized, and nothing in it changes/);
    });

    it("states responsibility and — for an increase only — the due date", () => {
        const resolver = code(RESOLVER);
        expect(resolver).toMatch(/changes\.push\(resolution\.responsibility\.sentence\)/);
        expect(resolver).toMatch(/if \(resolution\.due\.applicable\)/);
        expect(resolver).toMatch(/"No due date"/);
    });

    it("the date control is canonical — no native date input, no emoji", () => {
        const card = src(CARD);
        const at = card.indexOf('testId="adjustment-effective-date"');
        expect(at).toBeGreaterThan(-1);
        expect(card.slice(Math.max(0, at - 600), at)).toMatch(/<AlloyDateInput/);
        expect(card).not.toMatch(/type="date"/);
        expect(card).not.toMatch(/📅|🗓/);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("a correction starts from the record of the thing being corrected", () => {
    /**
     * §5. "From a specific charge's Details, an operator should be able to initiate a correction of
     * THAT fact without searching for it again." The charge Details surface offered only Close.
     */
    it("charge Details offers the correction, bound to that charge", () => {
        const card = code(CARD);
        expect(card).toContain('data-financials-charge-detail-correct="true"');
        /* The SAME entry the ledger row uses — one command, one writer, source pre-bound. */
        expect(card).toMatch(/openAdjustForCharge\(\{ chargeId: surface\.chargeId \}\)/);
    });

    it("it is offered only where the canonical read model says there is something to reduce", () => {
        /*
         * Offering it on a charge `adjustableCharges` excludes would be a control that can only be
         * refused; asking a second authority whether the charge is correctable would be a second
         * opinion about money.
         */
        expect(code(CARD)).toMatch(/adjustableCharges\.some\(\(r\) => r\.chargeId === surface\.chargeId\)/);
    });

    it("raising it from a row binds the source rather than defaulting it", () => {
        const card = code(CARD);
        expect(card).toMatch(/setAdjustSourceChargeId\(args\.chargeId\)/);
        /* And the enrolment comes from the charge's own child, not from the first in the list. */
        expect(card).toMatch(/adjustableSubjects\.find\(\(sub\) => sub\.customerMemberId === row\?\.subjectMemberId\)/);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("Details explains the correction without engineering vocabulary", () => {
    const DETAIL_VIEW = "app/adminV2/financials/FinancialsChargeDetail.tsx";
    const PROJECTION = "lib/financials/workspace/resolveChargeDetail.ts";

    it("the projection reads the adjustment record for the contra charge", () => {
        const proj = code(PROJECTION);
        expect(proj).toMatch(/from\("financial_reduction_applications"\)/);
        expect(proj).toMatch(/\.eq\("charge_id", charge\.id\)/);
        /* MANUAL ONLY — a policy reduction's reason is the policy, and it has no operator to name. */
        expect(proj).toMatch(/\.eq\("reduction_kind", "manual"\)/);
    });

    it("an unreadable adjustment record is an error, never silently 'not an adjustment'", () => {
        /*
         * Swallowing it would strip the operator of the source fact, the reason and the reversal
         * lineage with no sign anything was missing — the same class as an empty ledger standing
         * in for a failed read.
         */
        expect(code(PROJECTION)).toMatch(/the adjustment record could not be read/);
    });

    it("the reason comes from the existing constrained column, not a parallel store", () => {
        const proj = code(PROJECTION);
        expect(proj).toMatch(/reason: t\(app\.reason\) \|\| t\(metadata\.reason\) \|\| null/);
        /* No new table, no new notes column. */
        expect(proj).not.toMatch(/adjustment_notes|correction_notes|financial_corrections/);
    });

    it("the surface states the direction and shows no ids", () => {
        const view = code(DETAIL_VIEW);
        expect(view).toMatch(/Reduced what the family owes by/);
        expect(view).toMatch(/Increased what the family owes by/);
        /* Lineage in words, not as a pointer. */
        expect(view).toMatch(/It undoes an earlier correction on this account\./);
        expect(view).toMatch(/A later correction has undone this one\./);
        /* The ids are read but never rendered. */
        expect(view).not.toMatch(/\{detail\.adjustment\.applicationId\}|\{detail\.adjustment\.sourceChargeId\}/);
    });

    it("an account-level correction says so rather than showing a blank source", () => {
        expect(code(DETAIL_VIEW)).toMatch(/The account as a whole — not one charge/);
    });

    it("a finalized source period is named as finalized and unchanged", () => {
        expect(code(DETAIL_VIEW)).toMatch(/finalized, unchanged/);
    });

    it("a legacy source is presented as history, not as a missing field", () => {
        expect(code(DETAIL_VIEW)).toMatch(/Before the account's commercial periods/);
    });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────── */

describe("the due-date authority can express the account dimension", () => {
    /**
     * FOUND BY A TEST, not by review: a `scope_type: "customer"` due-date policy resolved to
     * `no_policy` no matter how it was configured, because `resolveDueDate` passed only
     * `serviceId` into `resolveFinancialPolicy` — and `matchesContext` compares a customer-scoped
     * policy against `context.customerId`, which was never supplied.
     *
     * `PolicyResolutionContext` ranks `customer` as the MOST specific dimension and says why: "an
     * explicit account answer must beat an inherited default". The resolver could not say it.
     */
    const DUE = "lib/financials/policies/resolveDueDate.ts";

    it("customerId reaches the policy narrowing", () => {
        expect(code(DUE)).toMatch(/customerId: inputs\.customerId \?\? undefined/);
    });

    it("the correction path supplies it", () => {
        expect(code(RESOLVER)).toMatch(/customerId: args\.customerId \?\? null/);
        expect(code(REDUCTION)).toMatch(/customerId: resolvedPeriod\.customerId/);
    });

    /**
     * ── AND THE GENERATED PATH SUPPLIES IT TOO, AS OF THE W7 CONVERGENCE SLICE ───────────────
     *
     * This assertion previously recorded the OPPOSITE: that `chargeLifecycleService` still omitted
     * the account dimension, deliberately left as a named finding because supplying it would start
     * applying terms that had been resolving to nothing — a behaviour change to generated billing,
     * and not an Adjustment-slice decision to take.
     *
     * The Director took it. The invariant is now that one economic subject under one policy
     * configuration resolves ONE due date whoever wrote the charge, so a split between the
     * correction path and the generated path is exactly the defect to catch.
     */
    it("the generated path narrows by the same scope the correction path does", () => {
        const lifecycle = code("lib/financials/chargeLifecycle/chargeLifecycleService.ts");
        /*
         * W7 billing configuration convergence: the due date is resolved inside the date chain
         * (`chainForIntent` → `resolveChargeDateChain`), which narrows by the subject's account and
         * site — the same two dimensions the correction path names.
         */
        const at = lifecycle.indexOf("function chainForIntent");
        expect(at).toBeGreaterThan(-1);
        const fn = lifecycle.slice(at, at + 1400);
        expect(fn).toMatch(/customerId: args\.scope\.customerId/);
        expect(fn).toMatch(/locationId: args\.scope\.locationId/);
        /* Through the one shared resolver, not a second idea of what the subject is. */
        expect(lifecycle).toMatch(/resolveFinancialPolicyScope/);
    });

    /**
     * THE SCOPE READ IS NOT UNCONDITIONAL. `previewTemplateCharge` runs once per consumption fact,
     * so resolving the subject on every generated charge would add a round trip in order to narrow
     * against dimensions most organisations never scope by. The policies are already in hand, so
     * the question is free — and when no rule names an account or a site, the read is skipped.
     */
    it("and is skipped when no due-date rule narrows by account or site", () => {
        const lifecycle = code("lib/financials/chargeLifecycle/chargeLifecycleService.ts");
        expect(lifecycle).toMatch(/policyScopeNarrowingNeeded\(policies, "due_date"\)/);
        expect(lifecycle).toMatch(/EMPTY_FINANCIAL_POLICY_SCOPE/);
    });
});
