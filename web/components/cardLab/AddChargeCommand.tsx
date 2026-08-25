"use client";

import { Action, ActionRow, SectionHead } from "@/components/cardLab/CardLabKit";
import type { AddChargeSpecimen, ChargeTemplateOption } from "@/lib/cardLab/cardLabTypes";

/**
 * Add charge — the command surface, driven by `financial_charge_templates`.
 *
 * The template is the configuration, and it decides the form:
 *   `amount_strategy`  fixed → the amount is locked · manual → the operator sets it
 *                      rate_derived → the rate resolves it
 *   `billable_on`      immediate | offset_days | next_billing_cycle → the default due date
 *   `responsibility`   household | employer | third_party | agency → who is billed
 *
 * Nothing about a charge type is hardcoded here, and no fee definition is duplicated into the
 * card. The mutation path is:
 *
 *   configured template → registered financial capability → eligibility / required input
 *   → preview → confirmation → canonical mutation (`createChildcareDraftCharge` +
 *   `postChildcareCharge`) → event → projection refresh
 *
 * **The registered capability does not exist yet** — that is the gap this specimen names. The
 * services and the template catalog both exist; there is no action definition wrapping them.
 */
export default function AddChargeCommand({
    specimen,
    templates,
}: {
    specimen: AddChargeSpecimen;
    templates: ChargeTemplateOption[];
}) {
    const t = specimen.template;
    const amountLocked = t.amountStrategy !== "manual";

    return (
        <div className="alloy-os-addcharge">
            <p className="alloy-os-addcharge__title">Add charge</p>

            <SectionHead ruled={false}>Charge type</SectionHead>
            <div className="alloy-os-addcharge__types">
                {templates.map((opt) => (
                    <span
                        key={opt.key}
                        className="alloy-os-addcharge__type"
                        data-on={opt.key === t.key ? "true" : undefined}
                    >
                        {opt.label}
                    </span>
                ))}
            </div>
            <p className="alloy-os-addcharge__config">
                {t.responsibility} · billable {t.billableOn.toLowerCase()} ·{" "}
                {t.amountStrategy === "fixed"
                    ? "fixed amount"
                    : t.amountStrategy === "rate_derived"
                      ? "rate-derived"
                      : "operator sets the amount"}
            </p>

            <SectionHead ruled={false}>Inputs</SectionHead>
            <Field label="Applies to" value={specimen.subject} required={t.requiresSubject} />
            <Field
                label="Amount"
                value={amountLocked ? (t.amount ?? "—") : specimen.amount}
                locked={amountLocked}
            />
            <Field label="Billing period" value={specimen.period} />
            <Field label="Due" value={specimen.due} derived />
            <Field label="Note" value={specimen.note} required={t.requiresNote} />

            <SectionHead ruled={false}>Preview</SectionHead>
            <div className="alloy-os-addcharge__preview">
                <p className="alloy-os-billing__line">
                    <span className="alloy-os-billing__line-label">{t.label}</span>
                    <span className="alloy-os-billing__line-value">+{specimen.amount}</span>
                </p>
                <p className="alloy-os-billing__line alloy-os-billing__line--emphasis">
                    <span className="alloy-os-billing__line-label">Current balance</span>
                    <span className="alloy-os-billing__line-value">
                        {specimen.previewBefore} → {specimen.previewAfter}
                    </span>
                </p>
            </div>

            <ActionRow>
                <Action primary>Add charge</Action>
                <Action>Cancel</Action>
            </ActionRow>
        </div>
    );
}

function Field({
    label,
    value,
    required,
    locked,
    derived,
}: {
    label: string;
    value: string;
    required?: boolean;
    locked?: boolean;
    derived?: boolean;
}) {
    return (
        <p className="alloy-os-addcharge__field">
            <span className="alloy-os-addcharge__field-label">
                {label}
                {required ? <span className="alloy-os-addcharge__req">required</span> : null}
            </span>
            <span className="alloy-os-addcharge__field-value" data-locked={locked ? "true" : undefined}>
                {value}
                {locked ? <span className="alloy-os-addcharge__hint">set by template</span> : null}
                {derived ? <span className="alloy-os-addcharge__hint">from billable_on</span> : null}
            </span>
        </p>
    );
}
