"use client";

import type { ReactNode } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { Action, ActionRow, SectionHead } from "@/components/cardLab/CardLabKit";
import type { AddChargeSpecimen, ChargeTemplateOption } from "@/lib/cardLab/cardLabTypes";
import { AlloyDateInput } from "@/components/workspace/AlloyDateInput";
import { AlloyMultiSelect, AlloySelect } from "@/components/workspace/AlloySelect";

/**
 * HOUSEHOLD IS A VALUE, NOT AN ABSENCE.
 *
 * The multi-select needs a value to carry "the whole account", and it must not be a real member
 * id or an empty list. An empty selection means the operator has chosen nobody — the one reading
 * that must never silently become "everybody" on the surface that commits money.
 */
const ADDCHARGE_HOUSEHOLD_VALUE = "__household__";

/**
 * "No discount" needs a value, and it must not be an empty string.
 *
 * An empty selection means the operator has chosen nothing yet; choosing No discount means they
 * have decided. On a surface that commits money those two must never be the same value.
 */
const NO_DISCOUNT_VALUE = "__no_discount__";

/**
 * THE SHARE VOCABULARY, which is the canonical authority's and not this card's.
 *
 * `percentage`, `fixed` and `remainder` are what `financial_responsibility_arrangement_shares`
 * records and what `configureResponsibilityArrangement` accepts. A fourth word invented here
 * would be a share method the domain cannot store.
 */
type ShareMethod = "percentage" | "fixed" | "remainder";

const SHARE_METHODS: ReadonlyArray<{ value: ShareMethod; label: string }> = [
    { value: "percentage", label: "Percentage" },
    { value: "fixed", label: "Fixed amount" },
    { value: "remainder", label: "Remainder" },
];

/**
 * Add charge — the command surface, driven by `financial_charge_templates`.
 *
 * ── THE TEMPLATE DECIDES THE FORM ──
 *
 *   amount_strategy   fixed → amount locked · manual → operator sets it · rate_derived → resolved
 *   occurs_on         now | event_date | service_period_start   → the SERVICE date
 *   billable_on       immediate | offset_days | next_billing_cycle → the BILLING PERIOD
 *   responsibility    household | employer | third_party | agency → who is billed
 *
 * Nothing about a charge type is hardcoded, and no fee definition is duplicated into the card.
 *
 * ── FOUR DATES, FOUR COLUMNS, NO INVENTION ──
 *
 *   service date    `charges.service_date`  when the thing happened
 *   billing period  derived from `billable_on`; the period the charge lands in
 *   due date        `charges.due_date`
 *   posting date    `charges.posted_at`, set by the mutation, never by the operator
 *
 * A future-dated charge is therefore ordinary: a September service date on a charge created in
 * August, billable next cycle. Whether the operator may override any of them is
 * `allowsDateOverride` on the template — configuration, not a card rule.
 *
 * ── PAYER TARGETING RESOLVES AGAINST THE CANONICAL MODEL ──
 *
 * The command never builds its own allocation. It offers the targeting the template permits and
 * lets `payment_allocations` / the responsibility model decide the split. Allocation math renders
 * ONLY when that split is authoritative — otherwise the preview shows the charge and the balance
 * and says nothing it cannot support.
 *
 * **The registered capability does not exist yet.** `financial_charge_templates`,
 * `createChildcareDraftCharge` and `postChildcareCharge` all exist; nothing in
 * `lib/adminV2/actions/definitions` wraps them. That is gap F5.
 */
export default function AddChargeCommand({
    specimen,
    templates,
    controls,
    modeSlot,
}: {
    specimen: AddChargeSpecimen;
    templates: ChargeTemplateOption[];
    /**
     * ── WHY A SLOT AND NOT A SIBLING ────────────────────────────────────────────────────────────
     *
     * The host wants a mode control — Charge or Adjustment — above this command. Rendered BESIDE
     * this component it is a bare div inside an elevated Focus Panel cell, and the depth layer
     * makes every direct child of that cell inert: `…[data-fp-elevated="true"] > * { pointer-events:
     * none }`, with `pointer-events: auto` granted to `.alloy-os-ucard` alone. Measured mounted, the
     * control was visible, focusable from the keyboard, and would not take a pointer click, with
     * `elementFromPoint` returning the depth scrim.
     *
     * This component's own comment records the same lesson ("It was rendering as a bare div inside
     * the elevated cell"). So the control comes INSIDE the platform card rather than beside it.
     */
    modeSlot?: ReactNode;
    /**
     * The live command, when a host supplies one. Absent in the lab, where this is a specimen and
     * every control is inert — which is what a specimen should be.
     *
     * Only the fields the TEMPLATE leaves open become inputs. Everything the template or configured
     * policy owns stays a stated value with its provenance hint, because those are not the
     * operator's to change and rendering them as editable would say otherwise.
     */
    controls?: {
        selectedTemplateId: string | null;
        onSelectTemplate: (templateId: string) => void;
        subjects: Array<{ id: string; label: string }>;
        selectedSubjectId: string | null;
        onSelectSubject: (subjectId: string) => void;
        /**
         * ── ALSO BILL THESE CHILDREN ──────────────────────────────────────────────────────────
         *
         * Absent when the operation cannot legitimately widen: the charge category does not permit
         * child grain, or the account has only one child. MULTIPLE CHILDREN IS AN OPERATION, not a
         * grain — each ticked child receives their own independent obligation at the full amount,
         * and nothing here creates a shared or household row.
         */
        /**
         * The one target control. When present it replaces the anchor select and the "Also bill"
         * checkboxes; the GRAIN model beneath is unchanged — a household charge still names no
         * child, and children are still independent obligations.
         */
        unifiedTarget?: {
            householdOffered: boolean;
            householdSelected: boolean;
            onSelectHousehold: () => void;
            children: Array<{ id: string; label: string }>;
            selectedChildIds: string[];
            onToggleChild: (id: string) => void;
            perChildLabel: string | null;
        };
        alsoChildren?: {
            options: Array<{ id: string; label: string }>;
            selectedIds: string[];
            onToggle: (id: string) => void;
            /** The per-child amount, already formatted, so the total can be stated honestly. */
            perChildLabel: string | null;
        };
        amount: string;
        onAmount: (value: string) => void;
        note: string;
        onNote: (value: string) => void;
        /**
         * The event date, for a template whose `occurs_on` is `event_date`.
         *
         * Not decoration: the resolver REFUSES such a template without one, returning
         * `missing_event_date`. A command card that cannot collect it can never commit the charge.
         */
        eventDate: string;
        onEventDate: (value: string) => void;
        /**
         * ── RESPONSIBILITY FOR THIS CHARGE, NOT FOR THE ACCOUNT ───────────────────────────────
         *
         * CHARGE > CHILD > HOUSEHOLD. The standing arrangement answers "who owes this family's
         * obligations"; a charge-scoped one answers "who owes THIS obligation" and supersedes
         * nothing — it is the narrowest scope, and the standing answers keep governing every
         * charge it does not name.
         *
         * Absent when the operator may not decide it: without `fin.responsibility` this is a
         * stated value, because a control an operator cannot commit is a lie about what they own.
         */
        chargeResponsibility?: {
            /** Who owes it today, by the standing answer. Shown, not chosen. */
            standingSummary: string;
            /** The parties on record. The command never invents a payer. */
            parties: Array<{ id: string; label: string }>;
            /*
             * ── THE OPERATOR NEVER CHOOSES A PERSISTENCE SCOPE ────────────────────────────────
             *
             * This used to ask "Divided by: the account's arrangement / this charge only", which
             * is the data model talking. An operator raising a charge is deciding WHO OWES THIS
             * CHARGE; whether that becomes a charge-scoped arrangement is the host's problem and
             * always was — changing it here has only ever meant "this charge", and saying so in
             * two options made them prove they understood arrangement scope first.
             *
             * `changing` is open/closed, nothing more. Closed, the standing answer governs and
             * nothing is written. Open, the operator authors shares for this charge.
             */
            changing: boolean;
            onChanging: (changing: boolean) => void;
            shares: Array<{ partyId: string; method: ShareMethod; value: string }>;
            onShare: (index: number, patch: { partyId?: string; method?: ShareMethod; value?: string }) => void;
            onAddShare: () => void;
            onRemoveShare: (index: number) => void;
        };
        /**
         * ── THE DISCOUNTS THAT WOULD OTHERWISE REDUCE THIS CHARGE ─────────────────────────────
         *
         * Applying them is what happens by default — that is what an authored policy IS. What the
         * operator may decide here is whether one of them does NOT apply to this charge, and why.
         * The reason is not optional: an exclusion without one is exactly the unattributable
         * decision the charge-level model was built to prevent.
         */
        /**
         * ── ONE DISCOUNT DECISION, EXPRESSED ONCE ─────────────────────────────────────────────
         *
         * This was a row of checkboxes, one per policy, ticked to apply and unticked to waive. It
         * underspecified the decision — an operator reading two ticked boxes could not tell which
         * of them would actually reduce this charge — and it used browser checkbox grammar for a
         * financial choice.
         *
         * It is a selection: which of this child's eligible discounts should affect THIS charge,
         * or none. `options` are already filtered by canonical policy eligibility for the proposed
         * charge, so an ineligible policy is not offered rather than offered and refused.
         */
        chargeDiscount?: {
            /**
             * `expectedAmount` is what the resolver said this policy takes off THIS charge,
             * already formatted. The card prints it; it never derives it from the rate in `label`.
             */
            options: Array<{ policyId: string; label: string; expectedAmount?: string | null }>;
            /** `null` means No discount — an explicit answer, never an empty one. */
            selectedPolicyId: string | null;
            onSelect: (policyId: string | null) => void;
            /*
             * TRUE only when declining a discount that WOULD otherwise apply. Choosing "No
             * discount" where canonical resolution already says none applies is the truthful
             * result and creates nothing, so demanding prose for it would teach operators to type
             * into a box that changes no money.
             */
            reasonRequired: boolean;
            reason: string;
            onReason: (value: string) => void;
        };
        onSubmit: () => void;
        onCancel: () => void;
        running: boolean;
        /** A refusal from the domain, surfaced verbatim — never swallowed into a silent no-op. */
        error: string | null;
    };
}) {
    const t = specimen.template;
    const amountLocked = t.amountStrategy !== "manual";
    /* The chosen policy, resolved once so the control and the preview line cannot name different ones. */
    const selectedDiscount =
        controls?.chargeDiscount?.selectedPolicyId
            ? controls.chargeDiscount.options.find(
                  (o) => o.policyId === controls.chargeDiscount!.selectedPolicyId,
              ) ?? null
            : null;

    return (
        <div className="alloy-os-addcharge-host">
            <UniversalCard
                title="Add"
                insight=""
                iconName="Receipt"
                tier="work"
                archetype="status"
                /*
                 * EXPANDED, so the command lands in the same centered, scrimmed workstation host as
                 * Health Details and Financials Details. It was rendering as a bare div inside the
                 * elevated cell, which put it in the Financials column position and made a focused
                 * command read as another panel in the workspace.
                 */
                modalClass="command"
                density="expanded"
                gridSpan="row"
                data-universal-card-key="add_charge"
                footerAction={null}
            >
            <div className="alloy-os-addcharge">
            {modeSlot}

            {/* The platform select, not a permanent row of chips — the catalog is configured and
                can be long, and the operator sees labels, never keys. */}
            <Field label="Charge type" required>
                {controls ? (
                    <AlloySelect
                        testId="addcharge-template"
                        aria-label="Charge type"
                        allowEmpty={false}
                        value={controls.selectedTemplateId ?? ""}
                        /* LABELS, never internal keys. The catalog owns the wording. */
                        options={templates.map((opt) => ({ value: opt.key, label: opt.label }))}
                        onChange={(next) => controls.onSelectTemplate(next)}
                    />
                ) : (
                    <span className="alloy-os-addcharge__select">
                        {t.label}
                        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                )}
                <span className="alloy-os-addcharge__optioncount">
                    {templates.length} configured types
                </span>
            </Field>
            {/*
              * THE CONFIG STRIP IS GONE, and the semantics it described are untouched.
              *
              * It read "Household · dated by the event · billed next cycle · fixed amount" — four
              * facts an operator cannot act on while adding a charge, describing rules the
              * template already enforces. Responsibility is now a control below rather than a
              * word here; the dating and billing rules still govern the charge exactly as they
              * did, and the preview states the effect they produce.
              */}

            {/* Applies to = the financial SUBJECT. Charge to = financial RESPONSIBILITY.
                Two dimensions, two inputs, never collapsed. Both are governed by the template. */}
            <SectionHead ruled={false}>Charge</SectionHead>
            {/*
             * ── ONE TARGET, TWO CONCEPTS UNDERNEATH ──────────────────────────────────────────
             *
             * "Applies to" and "Also bill" were two controls for one question — who receives this
             * charge — and an operator had to understand the GRAIN model to use them: pick an
             * anchor here, then widen there. The model is right and the presentation was not.
             *
             * So one control, and the same model beneath it: Household stays an explicit option,
             * children are a multi-select, and the two are mutually exclusive. Selecting Household
             * clears every child; selecting a child clears Household. What is never allowed is an
             * empty selection meaning Household — that is the ambiguity the grain model forbids,
             * and it is why the household option is a radio with a value rather than the absence
             * of ticks.
             *
             * Category grain still governs what is offered: the household option only appears when
             * `categoryPermitsHouseholdGrain`, the children only when `categoryPermitsChildGrain`.
             * A control that offers a choice the write path refuses is worse than one that does not.
             */}
            {controls && controls.unifiedTarget ? (
                <Field label="Applies to" required={t.requiresSubject}>
                    {/*
                     * ONE control, the canonical one. This was a radio plus a row of checkboxes
                     * sitting open on the command surface — correct in its model and wrong in its
                     * grammar, and the only native-select-shaped island left on the surface that
                     * commits money. It is now `AlloyMultiSelect`, which is the same primitive the
                     * rest of the runtime uses, extended once for multiple answers.
                     *
                     * The MODEL beneath is untouched. Household is still an explicit option with a
                     * value, still mutually exclusive with the children — now enforced by the
                     * primitive's own `exclusive` flag rather than by this surface remembering to —
                     * and an empty selection still means nothing has been chosen, never "everyone".
                     * The per-child economics are unchanged: each selected child receives their own
                     * independent charge, which the line below still says out loud.
                     */}
                    <AlloyMultiSelect
                        aria-label="Applies to"
                        testId="addcharge-target"
                        placeholder="Choose who receives this charge"
                        values={
                            controls.unifiedTarget.householdSelected
                                ? [ADDCHARGE_HOUSEHOLD_VALUE]
                                : controls.unifiedTarget.selectedChildIds
                        }
                        options={[
                            ...(controls.unifiedTarget.householdOffered
                                ? [{ value: ADDCHARGE_HOUSEHOLD_VALUE, label: "Household", exclusive: true }]
                                : []),
                            ...controls.unifiedTarget.children.map((c) => ({ value: c.id, label: c.label })),
                        ]}
                        onChange={(next) => {
                            const target = controls.unifiedTarget!;
                            if (next.includes(ADDCHARGE_HOUSEHOLD_VALUE)) {
                                if (!target.householdSelected) target.onSelectHousehold();
                                return;
                            }
                            /*
                             * Replay the difference through the EXISTING per-child toggle rather
                             * than setting a list wholesale: that handler owns whatever the grain
                             * model does on each change, and a surface that bypassed it would be a
                             * second writer for the same decision.
                             */
                            const before = target.householdSelected ? [] : target.selectedChildIds;
                            for (const id of next) if (!before.includes(id)) target.onToggleChild(id);
                            for (const id of before) if (!next.includes(id)) target.onToggleChild(id);
                        }}
                    />
                    {/*
                     * COLLAPSED TO ONE LINE. The count and the per-child total are the two numbers
                     * an operator checks before committing money, and neither is a chip row.
                     */}
                    <p className="alloy-os-addcharge__childsum" data-addcharge-targetsum>
                        {controls.unifiedTarget.householdSelected
                            ? "Household · one charge for the account"
                            : controls.unifiedTarget.selectedChildIds.length === 0
                              ? "Choose who receives this charge"
                              : controls.unifiedTarget.selectedChildIds.length === 1
                                ? `${controls.unifiedTarget.children.find((c) => c.id === controls.unifiedTarget!.selectedChildIds[0])?.label ?? "1 child"}`
                                : `${controls.unifiedTarget.perChildLabel ? `${controls.unifiedTarget.perChildLabel} per child · ` : ""}${controls.unifiedTarget.selectedChildIds.length} children selected · each receives their own charge`}
                    </p>
                </Field>
            ) : (
                <Field label="Applies to" required={t.requiresSubject}>
                    {controls && controls.subjects.length > 1 ? (
                        <div data-addcharge-subject>
                            {/*
                              * The hook stays on the wrapper. `data-addcharge-subject` is how the
                              * certification specs identify the LEGACY single-subject path — the
                              * one offered when the unified target is not — and converting the
                              * control's presentation is not a reason to retire an identifier
                              * other surfaces still ask by name. The control inside is canonical;
                              * the contract is unchanged.
                              */}
                        <AlloySelect
                            testId="addcharge-subject"
                            aria-label="Applies to"
                            allowEmpty={false}
                            value={controls.selectedSubjectId ?? ""}
                            options={controls.subjects.map((sub) => ({ value: sub.id, label: sub.label }))}
                            onChange={(next) => controls.onSelectSubject(next)}
                        />
                        </div>
                    ) : (
                        <Value>{specimen.subject}</Value>
                    )}
                </Field>
            )}
            {/*
              * THE LEGACY "ALSO BILL" CHECKBOX ROW IS GONE.
              *
              * It was unreachable: `unifiedTarget` is checked first and the host always supplies
              * it, so the branch rendered nowhere. What it left behind was a row of browser
              * checkboxes in a file whose every other control is canonical — a native control
              * that cannot render is still a native control a reader has to reason about, and
              * the census that forbids them cannot tell the difference.
              *
              * The grain it expressed is unchanged and lives in the unified target above: each
              * ticked child receives their own independent obligation at the full amount.
              */}
            <Field label="Amount" required={!amountLocked}>
                {controls && !amountLocked ? (
                    <input
                        className="alloy-os-addcharge__input"
                        data-addcharge-amount
                        inputMode="decimal"
                        value={controls.amount}
                        placeholder="0.00"
                        onChange={(e) => controls.onAmount(e.target.value)}
                    />
                ) : (
                    <Value locked={amountLocked}>{amountLocked ? (t.amount ?? "—") : specimen.amount}</Value>
                )}

            </Field>
            <Field label="Note" required={t.requiresNote}>
                {controls ? (
                    <input
                        className="alloy-os-addcharge__input"
                        data-addcharge-note
                        value={controls.note}
                        placeholder={t.requiresNote ? "Required" : "Optional"}
                        onChange={(e) => controls.onNote(e.target.value)}
                    />
                ) : (
                    <Value>{specimen.note}</Value>
                )}
            </Field>

            <SectionHead ruled={false}>Dates</SectionHead>
            <Field label="Service date" required={t.occursOn === "event_date"}>
                {controls && t.occursOn === "event_date" ? (
                    /*
                      * The canonical date control. This was a raw `<input type="date">` — the one
                      * browser-styled widget on a card of Alloy dropdowns, on the surface that
                      * commits money. The stored value is still `YYYY-MM-DD` and still the same
                      * `event_date` the resolver is given, so nothing about dating semantics moved.
                      */
                    <span data-addcharge-event-date>
                        <AlloyDateInput
                            value={controls.eventDate}
                            onChange={controls.onEventDate}
                            aria-label="Service date"
                            testId="addcharge-event-date"
                        />
                    </span>
                ) : (
                    <Value>{specimen.serviceDate}</Value>
                )}

            </Field>
            <Field label="Billing period">
                <Value>{specimen.period}</Value>
            </Field>
            <Field label="Due">
                <Value>{specimen.due}</Value>
            </Field>
            {/*
                ── WHAT CONFIRMING ACTUALLY DOES, ON THIS TENANT ────────────────────────────────
                This read "Creates a draft — not yet owed" unconditionally. That was true of every
                tenant when it was written, and it stopped being true once manual entry began
                honouring the configured review boundary: on an organization that has configured
                none, the charge posts on confirm and the balance moves. A command may not describe
                a mechanism it will not use.
                `reviewRequired` is the server's answer — the posting_review policy for this
                template's service, OR'd with the template's own flag — so this states the act.
            */}
            {/*
              * ONLY THE ANSWER THAT CHANGES THE OPERATOR'S DECISION.
              *
              * "Posts on confirm — owed immediately" described the ordinary case in
              * implementation language; a review requirement is the case worth saying out loud,
              * because it changes what happens when they press Confirm. The posting semantics
              * themselves are unchanged — `reviewRequired` still governs.
              */}
            {t.reviewRequired ? (
                <Field label="Posting">
                    <Value locked>Creates a draft — not yet owed</Value>
                </Field>
            ) : null}

            {/*
                ── ONE ANSWER TO "WHO OWES THIS", NOT TWO ──────────────────────────────────────

                This block said it first — "Charge to · Responsibility: Household" — and the
                section below said it again with the actual parties and amounts. Two headings,
                two renderings, one fact, and an operator reading them had to work out whether
                they disagreed.

                The section below survives because it is the one that can be ACTED on: it names
                the parties, carries the standing source quietly, and offers Change. What was
                here was the same truth with less of it.

                `operator_selectable` targeting is not lost — a template that puts the payer in
                the operator's hands reaches the same Change control, which is where choosing
                one belongs.
            */}

            {/*
                ── WHO OWES THIS ONE ────────────────────────────────────────────────────────────
                Offered only when the host supplies it, which it does only when the operator holds
                the grant to decide it. The default is the standing arrangement — an operator who
                changes nothing creates no charge-scoped anything, and the account's answer governs
                exactly as it did before this control existed.
            */}
            {/*
                ── CHARGE TO — WHO OWES THIS CHARGE ─────────────────────────────────────────────
                One decision, stated as an answer with a way to change it. What it used to be was
                two decisions: who owes, and which arrangement scope should record that. The second
                was never the operator's — an override here has only ever meant "this charge" —
                and asking it made them understand the data model before they could bill a family.
            */}
            {controls?.chargeResponsibility ? (
                <div data-addcharge-charge-responsibility="section">
                    <SectionHead ruled={false}>Charge to</SectionHead>
                    <Field label="">
                        {/*
                            WHO OWES, THEN WHERE IT COMES FROM — in that order and at that weight.
                            The parties and their amounts are the answer; that the answer is the
                            account's standing one is context, said quietly beneath it rather than
                            wrapped around it as "The account's arrangement: …".
                        */}
                        <span className="alloy-os-addcharge__chargeto" data-addcharge-charge-to="summary">
                            <Value>{controls.chargeResponsibility.standingSummary}</Value>
                            {!controls.chargeResponsibility.changing ? (
                                <button
                                    type="button"
                                    className="alloy-os-addcharge__changeto"
                                    data-addcharge-change-charge-to="true"
                                    onClick={() => controls.chargeResponsibility!.onChanging(true)}
                                    disabled={controls.running}
                                >
                                    Change <span aria-hidden>&rarr;</span>
                                </button>
                            ) : null}
                        </span>
                    </Field>

                    {controls.chargeResponsibility.changing ? (
                        <div data-addcharge-charge-shares="editor">
                            {controls.chargeResponsibility.shares.map((share, index) => (
                                <Field key={`share-${index}`} label={index === 0 ? "Responsible" : ""} required={index === 0}>
                                    <span className="alloy-os-addcharge__share-row">
                                        <AlloySelect
                                            testId={`addcharge-share-party-${index}`}
                                            aria-label="Responsible party"
                                            value={share.partyId}
                                            onChange={(v) => controls.chargeResponsibility!.onShare(index, { partyId: v })}
                                            options={controls.chargeResponsibility!.parties.map((party) => ({
                                                value: party.id,
                                                label: party.label,
                                            }))}
                                            placeholder="Choose a party…"
                                            disabled={controls.running}
                                        />
                                        <AlloySelect
                                            testId={`addcharge-share-method-${index}`}
                                            aria-label="How the share is stated"
                                            value={share.method}
                                            onChange={(v) =>
                                                controls.chargeResponsibility!.onShare(index, { method: v as ShareMethod })
                                            }
                                            options={SHARE_METHODS.map((m) => ({ value: m.value, label: m.label }))}
                                            disabled={controls.running}
                                        />
                                        {/*
                                            REMAINDER TAKES NO NUMBER. It is defined as what is left
                                            after the others, so offering a box to type one in would
                                            invite a figure the domain will ignore.
                                        */}
                                        {share.method === "remainder" ? (
                                            <Value locked>whatever is left</Value>
                                        ) : (
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                className="alloy-os-addcharge__input"
                                                data-addcharge-share-value={index}
                                                value={share.value}
                                                onChange={(e) =>
                                                    controls.chargeResponsibility!.onShare(index, { value: e.target.value })
                                                }
                                                placeholder={share.method === "percentage" ? "50" : "0.00"}
                                                aria-label={share.method === "percentage" ? "Percent" : "Amount"}
                                                disabled={controls.running}
                                            />
                                        )}
                                        {controls.chargeResponsibility!.shares.length > 1 ? (
                                            <button
                                                type="button"
                                                className="alloy-os-addcharge__sharedrop"
                                                data-addcharge-remove-share={index}
                                                onClick={() => controls.chargeResponsibility!.onRemoveShare(index)}
                                                disabled={controls.running}
                                            >
                                                Remove
                                            </button>
                                        ) : null}
                                    </span>
                                </Field>
                            ))}
                            <ActionRow>
                                <Action
                                    onClick={() => controls.chargeResponsibility!.onAddShare()}
                                    disabled={controls.running}
                                    data-addcharge-add-share="true"
                                >
                                    Add a party
                                </Action>
                                <Action
                                    onClick={() => controls.chargeResponsibility!.onChanging(false)}
                                    disabled={controls.running}
                                    data-addcharge-cancel-charge-to="true"
                                >
                                    Keep the standing answer
                                </Action>
                            </ActionRow>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/*
                ── DISCOUNT — ONE DECISION, ONE CONTROL ─────────────────────────────────────────
                Which of this child's eligible discounts should affect THIS charge, or none.

                The options arrive already filtered by canonical policy eligibility for the
                proposed charge, so a policy the child receives but which does not cover this
                charge type is NOT offered. An operator cannot overrule policy impossibility from
                here, and a control that let them try would be lying about who decides.
            */}
            {controls?.chargeDiscount ? (
                <div data-addcharge-charge-discount="section">
                    <SectionHead ruled={false}>Discount</SectionHead>
                    <Field label="">
                        <AlloySelect
                            testId="addcharge-discount"
                            aria-label="Discount"
                            value={controls.chargeDiscount.selectedPolicyId ?? NO_DISCOUNT_VALUE}
                            onChange={(v) =>
                                controls.chargeDiscount!.onSelect(v === NO_DISCOUNT_VALUE ? null : v)
                            }
                            options={[
                                ...controls.chargeDiscount.options.map((o) => ({
                                    value: o.policyId,
                                    label: o.label,
                                })),
                                /*
                                  NO DISCOUNT IS AN OPTION, NOT AN EMPTY SELECTION. An operator who
                                  means "none" has decided something, and a blank control cannot
                                  tell that apart from one they never touched.
                                */
                                { value: NO_DISCOUNT_VALUE, label: "No discount" },
                            ]}
                            disabled={controls.running}
                        />
                    </Field>

                    {/*
                        THE REASON APPEARS ONLY WHERE IT MEANS SOMETHING. Declining a discount that
                        WOULD otherwise have applied takes money's worth away from a family and
                        carries provenance. Choosing "No discount" where canonical resolution says
                        none applies is simply the truthful result — demanding prose for it would
                        teach operators to type into a box that changes no money.
                    */}
                    {controls.chargeDiscount.reasonRequired ? (
                        <Field label="Why no discount" required>
                            <input
                                type="text"
                                className="alloy-os-addcharge__input"
                                data-addcharge-waiver-reason="true"
                                value={controls.chargeDiscount.reason}
                                onChange={(e) => controls.chargeDiscount!.onReason(e.target.value)}
                                placeholder="Say why this discount does not apply here"
                                aria-label="Why this discount does not apply"
                                disabled={controls.running}
                            />
                        </Field>
                    ) : null}
                </div>
            ) : null}

            <SectionHead ruled={false}>Preview</SectionHead>
            <div className="alloy-os-addcharge__preview">
                <p className="alloy-os-billing__line">
                    <span className="alloy-os-billing__line-label">{t.label}</span>
                    <span className="alloy-os-billing__line-value">+{specimen.amount}</span>
                </p>
                {/*
                    ── WHAT THE OPERATOR JUST DECIDED, RESTATED BEFORE THEY COMMIT IT ───────────
                    Both of these are decisions taken a few lines above and applied after the
                    charge exists, which means the preview is the ONLY place they are visible
                    together. They are STATED, never computed: the card says who it will divide
                    this charge between and which policy it will record as not applying, and it
                    leaves what either is worth to the resolver that owns that question.
                */}
                {controls?.chargeResponsibility?.changing
                    && controls.chargeResponsibility.shares.some((share) => share.partyId) ? (
                    <>
                        <p className="alloy-os-billingdetail__group" data-addcharge-preview-responsibility="true">
                            Charge to
                        </p>
                        {controls.chargeResponsibility.shares
                            .filter((share) => share.partyId)
                            .map((share, index) => (
                                <p key={`preview-share-${index}`} className="alloy-os-billing__line">
                                    <span className="alloy-os-billing__line-label">
                                        {controls.chargeResponsibility!.parties.find((p) => p.id === share.partyId)?.label
                                            ?? "—"}
                                    </span>
                                    <span className="alloy-os-billing__line-value">
                                        {share.method === "remainder"
                                            ? "remainder"
                                            : share.method === "percentage"
                                              ? `${share.value || "0"}%`
                                              : `$${share.value || "0.00"}`}
                                    </span>
                                </p>
                            ))}
                        {/* The standing arrangement is untouched, and says so rather than being assumed. */}
                        {/*
                            SAID WITHOUT NAMING THE MODEL. The operator needs to know this answer
                            applies here and nowhere else; they do not need the word "arrangement"
                            to understand it.
                        */}
                        <p className="alloy-os-addcharge__draftnote" data-addcharge-preview-standing="true">
                            This applies to this charge only. Other charges keep the usual answer.
                        </p>
                    </>
                ) : null}

                {/*
                    ── THE DISCOUNT LINE STATES THE DECISION, AND WHAT IT IS WORTH ─────────────
                    One line, matching the one control above it. "None" is an answer and reads as
                    one; naming a policy says which of the eligible ones will reduce this charge.

                    STILL NO ARITHMETIC. The figure is `resolveFinancialReductions`' own — the
                    same resolver a real charge passes through — carried here by the route that
                    priced it. What changed is that it is carried at all: the line used to name a
                    policy and its rate in a money column with no money in it, and left the
                    operator to work out what came off a charge they were a click from committing.
                */}
                {controls?.chargeDiscount ? (
                    <p className="alloy-os-billing__line" data-addcharge-preview-discount="true">
                        <span className="alloy-os-billing__line-label">
                            Discount
                            {selectedDiscount ? (
                                <span className="alloy-os-addcharge__share">{selectedDiscount.label}</span>
                            ) : null}
                        </span>
                        <span className="alloy-os-billing__line-value" data-addcharge-preview-discount-amount="true">
                            {!controls.chargeDiscount.selectedPolicyId
                                ? "None"
                                : specimen.previewDiscountAmount
                                  ? `-${specimen.previewDiscountAmount}`
                                  : (selectedDiscount?.label ?? "Selected")}
                        </span>
                    </p>
                ) : null}

                {/*
                    ── NET, WHICH IS THE NUMBER THE OPERATOR CAME FOR ─────────────────────────
                    Rendered only where a discount is actually coming off: with no reduction the
                    net IS the gross, and a second line repeating it would be ceremony.
                */}
                {specimen.previewNet && specimen.previewDiscountAmount ? (
                    <p
                        className="alloy-os-billing__line alloy-os-billing__line--emphasis"
                        data-addcharge-preview-net="true"
                    >
                        <span className="alloy-os-billing__line-label">Net charge</span>
                        <span className="alloy-os-billing__line-value">{specimen.previewNet}</span>
                    </p>
                ) : null}

                {/* Allocation math renders ONLY when the split is authoritative. */}
                {specimen.allocation ? (
                    <>
                        <p className="alloy-os-billingdetail__group">Responsibility</p>
                        {specimen.allocation.map((a) => (
                            <p key={a.payer} className="alloy-os-billing__line">
                                <span className="alloy-os-billing__line-label">
                                    {a.payer} <span className="alloy-os-addcharge__share">{a.share}</span>
                                </span>
                                <span className="alloy-os-billing__line-value">{a.amount}</span>
                            </p>
                        ))}
                    </>
                ) : null}
                {/*
                    ── WHAT CONFIRMING DOES, SAID AS THE WRITER ACTUALLY BEHAVES ──────────────

                    `charge.add` writes a draft, and then — only where no review boundary applies —
                    posts it in the same gesture through `postChildcareCharge`. Two different
                    consequences, and the template's own `reviewRequired` is what decides which.

                    Both branches used to end in a balance. The review branch was right: a draft is
                    not owed, so the balance genuinely does not move. The posting branch printed
                    "After posting" beside the UNCHANGED balance, so a +$400.00 charge promised, in
                    bold, that pressing the button would leave $536.00 at $536.00. The label was
                    accurate and the figure was not.

                    The projection adds the GROSS. The discount comes off later and separately —
                    `applyFinancialReductions` writes it as its own negative row when discounts run
                    — so a balance quietly netted here would be a balance this action never
                    produces. The net is stated above, where it belongs, as what the charge comes
                    to rather than as what the account will read.
                */}
                <p className="alloy-os-billing__line">
                    <span className="alloy-os-billing__line-label">Current balance</span>
                    <span className="alloy-os-billing__line-value">{specimen.previewBefore}</span>
                </p>
                <p className="alloy-os-billingdetail__group" data-addcharge-preview-consequence="true">
                    On confirm
                </p>
                {t.reviewRequired ? (
                    <p className="alloy-os-addcharge__draftnote" data-addcharge-posting="draft">
                        Creates a draft charge for review. The balance does not change until it is posted.
                    </p>
                ) : (
                    <>
                        <p className="alloy-os-addcharge__draftnote" data-addcharge-posting="posts">
                            Creates this charge and posts it.
                            {specimen.previewDiscountAmount
                                ? " The discount is recorded separately when discounts run, and lowers the balance then."
                                : ""}
                        </p>
                        {specimen.previewPostedBalance ? (
                            <p className="alloy-os-billing__line alloy-os-billing__line--emphasis">
                                <span className="alloy-os-billing__line-label">Balance after posting</span>
                                <span
                                    className="alloy-os-billing__line-value"
                                    data-addcharge-posted-balance="true"
                                >
                                    {specimen.previewPostedBalance}
                                </span>
                            </p>
                        ) : null}
                    </>
                )}
            </div>

            {controls?.error ? (
                <p className="alloy-os-addcharge__error" role="alert" data-addcharge-error>
                    {controls.error}
                </p>
            ) : null}

            {/*
             * AN EMPTY TARGET IS NOT A HOUSEHOLD CHARGE. With the unified control, neither
             * Household nor any child selected is a state the operator can reach — by unticking
             * the last child — and committing from it would have to invent a subject. Confirm is
             * unavailable instead, which is the refusal stated before the money rather than after.
             */}
            <ActionRow>
                <Action
                    primary
                    disabled={
                        controls?.unifiedTarget
                            ? !controls.unifiedTarget.householdSelected
                              && controls.unifiedTarget.selectedChildIds.length === 0
                            : undefined
                    }
                    data-addcharge-submit
                    onClick={controls?.onSubmit}
                >
                    {controls?.running ? "Adding…" : "Add charge"}
                </Action>
                <Action onClick={controls?.onCancel}>Cancel</Action>
            </ActionRow>
            </div>
            </UniversalCard>
        </div>
    );
}

function Field({
    label,
    required,
    children,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <p className="alloy-os-addcharge__field">
            <span className="alloy-os-addcharge__field-label">
                {label}
                {required ? <span className="alloy-os-addcharge__req">required</span> : null}
            </span>
            <span className="alloy-os-addcharge__field-value">{children}</span>
        </p>
    );
}

function Value({ children, locked }: { children: React.ReactNode; locked?: boolean }) {
    return <span data-locked={locked ? "true" : undefined}>{children}</span>;
}

function Hint({ children }: { children: React.ReactNode }) {
    return <span className="alloy-os-addcharge__hint">{children}</span>;
}
