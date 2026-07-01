"use client";

import { useMemo, useState } from "react";
import {
    FINANCIAL_POLICY_TYPES,
    POLICY_TYPE_REGISTRY,
    type FinancialPolicyType,
    type PolicyValueField,
} from "@/lib/financials/policies/financialPolicyTypes";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigButtonRow,
    ConfigDateInput,
    ConfigFieldLabel,
    ConfigNumberInput,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigSelectInput,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";

/**
 * Create a Financial Policy (Commercial Model, Slice C). The policy type drives
 * the typed value controls (select / number / money / yes-no); scope is chosen by
 * label (Org default / Location / Service / Rate Plan). No raw JSON, no IDs.
 */

export type Option = { value: string; label: string };
const YES_NO: Option[] = [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }];

const SCOPE_OPTIONS: Option[] = [
    { value: "org", label: "Org default" },
    { value: "location", label: "Location" },
    { value: "service", label: "Service" },
    { value: "rate_plan", label: "Rate Plan" },
];

/** Convert the policy type's value-field drafts into the typed value payload. */
export function buildPolicyValue(policyType: FinancialPolicyType, draft: Record<string, string>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of POLICY_TYPE_REGISTRY[policyType].fields) {
        const raw = draft[f.key] ?? "";
        if (f.control === "money") out[f.key] = Math.round(Number(raw) * 100);
        else if (f.control === "number") out[f.key] = raw === "" ? null : Number(raw);
        else if (f.control === "yesno") out[f.key] = raw === "yes";
        else out[f.key] = raw;
    }
    return out;
}

function ValueControl({ field, value, onChange, busy }: { field: PolicyValueField; value: string; onChange: (v: string) => void; busy?: boolean }) {
    if (field.control === "select") {
        return <ConfigSelectInput value={value} onChange={onChange} options={field.options ?? []} disabled={busy} testId={`policy-value-${field.key}`} />;
    }
    if (field.control === "yesno") {
        return <ConfigSelectInput value={value} onChange={onChange} options={YES_NO} disabled={busy} testId={`policy-value-${field.key}`} />;
    }
    return (
        <ConfigNumberInput
            value={value}
            onChange={onChange}
            min="0"
            step={field.control === "money" ? "0.01" : "1"}
            disabled={busy}
            testId={`policy-value-${field.key}`}
        />
    );
}

export default function CreateFinancialPolicyForm({
    busy,
    locationOptions,
    serviceOptions,
    ratePlanOptions,
    onCreate,
    onCancel,
}: {
    busy?: boolean;
    locationOptions: Option[];
    serviceOptions: Option[];
    ratePlanOptions: Option[];
    onCreate: (payload: Record<string, unknown>) => Promise<void>;
    onCancel: () => void;
}) {
    const [scopeType, setScopeType] = useState("org");
    const [targetId, setTargetId] = useState("");
    const [policyType, setPolicyType] = useState<FinancialPolicyType>(FINANCIAL_POLICY_TYPES[0]);
    const [valueDraft, setValueDraft] = useState<Record<string, string>>({});
    const [effectiveStart, setEffectiveStart] = useState("");
    const [label, setLabel] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    const policyTypeOptions = useMemo(() => FINANCIAL_POLICY_TYPES.map((t) => ({ value: t, label: POLICY_TYPE_REGISTRY[t].label })), []);
    const def = POLICY_TYPE_REGISTRY[policyType];
    const targetOptions = scopeType === "location" ? locationOptions : scopeType === "service" ? serviceOptions : scopeType === "rate_plan" ? ratePlanOptions : [];

    function scopePayload(): Record<string, unknown> {
        if (scopeType === "location") return { scope_type: "location", location_id: targetId };
        if (scopeType === "service") return { scope_type: "service", service_id: targetId };
        if (scopeType === "rate_plan") return { scope_type: "rate_plan", rate_plan_id: targetId };
        return { scope_type: "org" };
    }

    async function submit() {
        if (!effectiveStart) return setFormError("Effective start date is required");
        if (scopeType !== "org" && !targetId) return setFormError("Choose a scope target");
        setFormError(null);
        try {
            await onCreate({
                ...scopePayload(),
                policy_type: policyType,
                label: label.trim() || POLICY_TYPE_REGISTRY[policyType].label,
                value: buildPolicyValue(policyType, valueDraft),
                effective_start: effectiveStart,
            });
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to create policy");
        }
    }

    return (
        <ConfigurationDetailCard title="New financial policy" testId="financials-create-policy">
            <p className="config-typo-sublabel mb-3 text-alloy-forge/60">{def.description}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ConfigFieldLabel label="Policy type">
                    <ConfigSelectInput
                        value={policyType}
                        onChange={(v) => {
                            setPolicyType(v as FinancialPolicyType);
                            setValueDraft({});
                        }}
                        options={policyTypeOptions}
                        disabled={busy}
                        testId="create-policy-type"
                    />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Scope">
                    <ConfigSelectInput
                        value={scopeType}
                        onChange={(v) => {
                            setScopeType(v);
                            setTargetId("");
                        }}
                        options={SCOPE_OPTIONS}
                        disabled={busy}
                        testId="create-policy-scope"
                    />
                </ConfigFieldLabel>
                {scopeType !== "org" ? (
                    <ConfigFieldLabel label={SCOPE_OPTIONS.find((s) => s.value === scopeType)?.label ?? "Target"}>
                        {targetOptions.length === 0 ? (
                            <p className="config-typo-sublabel text-amber-700">None available</p>
                        ) : (
                            <ConfigSelectInput value={targetId} onChange={setTargetId} options={[{ value: "", label: "Select…" }, ...targetOptions]} disabled={busy} testId="create-policy-target" />
                        )}
                    </ConfigFieldLabel>
                ) : null}
                {def.fields.map((f) => (
                    <ConfigFieldLabel key={f.key} label={`${f.label}${f.suffix ? ` (${f.suffix})` : ""}`}>
                        <ValueControl field={f} value={valueDraft[f.key] ?? ""} onChange={(v) => setValueDraft((s) => ({ ...s, [f.key]: v }))} busy={busy} />
                    </ConfigFieldLabel>
                ))}
                <ConfigFieldLabel label="Label (optional)">
                    <ConfigTextInput value={label} onChange={setLabel} disabled={busy} placeholder={def.label} testId="create-policy-label" />
                </ConfigFieldLabel>
                <ConfigFieldLabel label="Effective start">
                    <ConfigDateInput value={effectiveStart} onChange={setEffectiveStart} disabled={busy} testId="create-policy-effective_start" />
                </ConfigFieldLabel>
            </div>
            {formError ? (
                <p className="mt-2 text-xs text-red-700" role="alert" data-testid="create-policy-error">
                    {formError}
                </p>
            ) : null}
            <div className="mt-3">
                <ConfigButtonRow>
                    <ConfigPrimaryButton onClick={() => void submit()} disabled={busy} testId="create-policy-save">
                        Create policy
                    </ConfigPrimaryButton>
                    <ConfigSecondaryButton onClick={onCancel} disabled={busy}>
                        Cancel
                    </ConfigSecondaryButton>
                </ConfigButtonRow>
            </div>
        </ConfigurationDetailCard>
    );
}
