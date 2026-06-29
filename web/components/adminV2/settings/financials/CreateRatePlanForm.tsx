"use client";

import { useState } from "react";
import {
    BILLING_BASES,
    CALCULATION_STRATEGIES,
    DEFAULT_RATE_CURRENCY_CODE,
} from "@/lib/financials/rates/rateTypes";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigButtonRow,
    ConfigDateInput,
    ConfigFieldLabel,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigSelectInput,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import {
    ORG_SCOPE_SELECTION,
    ScopePicker,
    isScopeSelectionComplete,
    scopeSelectionToPayload,
    type ScopeOptions,
    type ScopeSelection,
} from "@/components/adminV2/settings/configurationRuntime/ScopePicker";

/**
 * Create a brand-new rate plan lineage (Operational Configuration V1, Batch 1;
 * scope picker + age-group select added Phase 4). Distinct from "create future
 * version" — this authors the genesis version of a new plan. Scope is chosen via
 * the labeled picker (no raw IDs). Rate rules are added on the plan workspace once
 * the plan exists.
 */

function humanize(value: string): string {
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CreateRatePlanForm({
    busy,
    scopeOptions,
    ageGroupOptions,
    onCreate,
    onCancel,
}: {
    busy?: boolean;
    scopeOptions: ScopeOptions;
    ageGroupOptions: { value: string; label: string }[];
    onCreate: (payload: Record<string, unknown>) => Promise<void>;
    onCancel: () => void;
}) {
    const [scope, setScope] = useState<ScopeSelection>(ORG_SCOPE_SELECTION);
    const [ageGroupKey, setAgeGroupKey] = useState("");
    const [planKey, setPlanKey] = useState("");
    const [label, setLabel] = useState("");
    const [currency, setCurrency] = useState(DEFAULT_RATE_CURRENCY_CODE);
    const [billingBasis, setBillingBasis] = useState<string>(BILLING_BASES[1] ?? "monthly");
    const [calcStrategy, setCalcStrategy] = useState<string>(CALCULATION_STRATEGIES[0]);
    const [effectiveStart, setEffectiveStart] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    async function submit() {
        if (!planKey.trim()) return setFormError("Plan key is required");
        if (!effectiveStart) return setFormError("Effective start date is required");
        if (!isScopeSelectionComplete(scope)) return setFormError("Choose a scope target (location, program, or room)");
        setFormError(null);
        const payload: Record<string, unknown> = {
            ...scopeSelectionToPayload(scope),
            plan_key: planKey.trim(),
            label: label.trim() || null,
            currency_code: currency.trim() || DEFAULT_RATE_CURRENCY_CODE,
            billing_basis: billingBasis,
            calculation_strategy: calcStrategy,
            age_group_key: ageGroupKey.trim() || null,
            effective_start: effectiveStart,
        };
        try {
            await onCreate(payload);
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to create rate plan");
        }
    }

    return (
        <ConfigurationDetailCard title="New rate plan" testId="financials-create-rate-plan">
            <ScopePicker value={scope} onChange={setScope} options={scopeOptions} disabled={busy} testIdPrefix="create-plan-scope" />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ConfigFieldLabel label="Plan key">
                    <ConfigTextInput value={planKey} onChange={setPlanKey} disabled={busy} placeholder="standard_tuition" testId="create-plan-plan_key" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Label">
                    <ConfigTextInput value={label} onChange={setLabel} disabled={busy} placeholder="Standard Tuition" testId="create-plan-label" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Currency">
                    <ConfigTextInput value={currency} onChange={setCurrency} disabled={busy} testId="create-plan-currency" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Billing basis">
                    <ConfigSelectInput value={billingBasis} onChange={setBillingBasis} options={BILLING_BASES.map((b) => ({ value: b, label: humanize(b) }))} disabled={busy} testId="create-plan-billing_basis" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Calc strategy">
                    <ConfigSelectInput value={calcStrategy} onChange={setCalcStrategy} options={CALCULATION_STRATEGIES.map((c) => ({ value: c, label: humanize(c) }))} disabled={busy} testId="create-plan-calc_strategy" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Age group">
                    <ConfigSelectInput value={ageGroupKey} onChange={setAgeGroupKey} options={ageGroupOptions} disabled={busy} testId="create-plan-age_group" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Effective start">
                    <ConfigDateInput value={effectiveStart} onChange={setEffectiveStart} disabled={busy} testId="create-plan-effective_start" />
                </ConfigFieldLabel>
            </div>
            {formError ? (
                <p className="mt-3 text-xs text-red-700" role="alert" data-testid="create-plan-error">
                    {formError}
                </p>
            ) : null}
            <div className="mt-3">
                <ConfigButtonRow>
                    <ConfigPrimaryButton onClick={() => void submit()} disabled={busy} testId="create-plan-save">
                        Create plan
                    </ConfigPrimaryButton>
                    <ConfigSecondaryButton onClick={onCancel} disabled={busy} testId="create-plan-cancel">
                        Cancel
                    </ConfigSecondaryButton>
                </ConfigButtonRow>
            </div>
        </ConfigurationDetailCard>
    );
}
