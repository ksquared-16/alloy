"use client";

import { Action, ActionRow, SectionHead } from "@/components/cardLab/CardLabKit";
import type { AddChargeSpecimen, ChargeTemplateOption } from "@/lib/cardLab/cardLabTypes";

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
}: {
    specimen: AddChargeSpecimen;
    templates: ChargeTemplateOption[];
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
        onSubmit: () => void;
        onCancel: () => void;
        running: boolean;
        /** A refusal from the domain, surfaced verbatim — never swallowed into a silent no-op. */
        error: string | null;
    };
}) {
    const t = specimen.template;
    const amountLocked = t.amountStrategy !== "manual";

    return (
        <div className="alloy-os-addcharge">
            <p className="alloy-os-addcharge__title">Add charge</p>

            {/* The platform select, not a permanent row of chips — the catalog is configured and
                can be long, and the operator sees labels, never keys. */}
            <Field label="Charge type" required>
                {controls ? (
                    <select
                        className="alloy-os-addcharge__select"
                        data-addcharge-template
                        value={controls.selectedTemplateId ?? ""}
                        onChange={(e) => controls.onSelectTemplate(e.target.value)}
                    >
                        {templates.map((opt) => (
                            // LABELS, never internal keys. The catalog owns the wording.
                            <option key={opt.key} value={opt.key}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
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
            <p className="alloy-os-addcharge__config">
                {t.responsibility} · occurs {t.occursOn.toLowerCase()} · billable{" "}
                {t.billableOn.toLowerCase()} ·{" "}
                {t.amountStrategy === "fixed"
                    ? "fixed amount"
                    : t.amountStrategy === "rate_derived"
                      ? "rate-derived"
                      : "operator sets the amount"}
            </p>

            {/* Applies to = the financial SUBJECT. Charge to = financial RESPONSIBILITY.
                Two dimensions, two inputs, never collapsed. Both are governed by the template. */}
            <SectionHead ruled={false}>Charge</SectionHead>
            <Field label="Applies to" required={t.requiresSubject}>
                {controls && controls.subjects.length > 1 ? (
                    <select
                        className="alloy-os-addcharge__select"
                        data-addcharge-subject
                        value={controls.selectedSubjectId ?? ""}
                        onChange={(e) => controls.onSelectSubject(e.target.value)}
                    >
                        {controls.subjects.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                ) : (
                    <Value>{specimen.subject}</Value>
                )}
                <Hint>financial subject</Hint>
            </Field>
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
                {amountLocked ? <Hint>from template</Hint> : null}
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
                    <input
                        className="alloy-os-addcharge__input"
                        data-addcharge-event-date
                        type="date"
                        value={controls.eventDate}
                        onChange={(e) => controls.onEventDate(e.target.value)}
                    />
                ) : (
                    <Value>{specimen.serviceDate}</Value>
                )}
                {t.occursOn === "event_date" ?
                    <Hint>the event's own date</Hint>
                : t.allowsDateOverride ? <Hint>override allowed</Hint>
                :   <Hint>fixed by template</Hint>}
            </Field>
            <Field label="Billing period">
                <Value>{specimen.period}</Value>
                <Hint>from billable_on</Hint>
            </Field>
            <Field label="Due">
                <Value>{specimen.due}</Value>
                <Hint>configured policy</Hint>
            </Field>
            <Field label="Posting">
                <Value locked>On confirmation</Value>
                <Hint>set by the mutation</Hint>
            </Field>

            <SectionHead ruled={false}>Charge to</SectionHead>
            <Field label="Responsibility">
                <Value>{specimen.chargeTo}</Value>
                <Hint>financial responsibility</Hint>
                <Hint>
                    {t.payerTargeting === "operator_selectable"
                        ? "operator may target a payer"
                        : t.payerTargeting === "third_party"
                          ? "third party / agency"
                          : "template default"}
                </Hint>
            </Field>

            <SectionHead ruled={false}>Preview</SectionHead>
            <div className="alloy-os-addcharge__preview">
                <p className="alloy-os-billing__line">
                    <span className="alloy-os-billing__line-label">{t.label}</span>
                    <span className="alloy-os-billing__line-value">+{specimen.amount}</span>
                </p>
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
                <p className="alloy-os-billing__line alloy-os-billing__line--emphasis">
                    <span className="alloy-os-billing__line-label">Current balance</span>
                    <span className="alloy-os-billing__line-value">
                        {specimen.previewBefore} → {specimen.previewAfter}
                    </span>
                </p>
            </div>

            {controls?.error ? (
                <p className="alloy-os-addcharge__error" role="alert" data-addcharge-error>
                    {controls.error}
                </p>
            ) : null}

            <ActionRow>
                <Action primary onClick={controls?.onSubmit}>
                    {controls?.running ? "Adding…" : "Add charge"}
                </Action>
                <Action onClick={controls?.onCancel}>Cancel</Action>
            </ActionRow>
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
