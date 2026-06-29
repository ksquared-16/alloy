"use client";

import { useState } from "react";
import {
    FINANCIAL_SERVICE_TYPES,
    FINANCIAL_SERVICE_TYPE_LABEL,
} from "@/lib/financials/services/financialServicesStore";
import {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigButtonRow,
    ConfigFieldLabel,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigSelectInput,
    ConfigTextInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import { useFinancialServices } from "@/components/adminV2/settings/financials/useFinancialServices";

/**
 * Services configuration (Financial Configuration Convergence). The catalog of
 * what the organization sells — the foundational financial object that rates,
 * charge templates, and posting attach to. Real, authorable, persisted to org
 * configuration. Inline authoring, no drawers.
 */

const TYPE_OPTIONS = FINANCIAL_SERVICE_TYPES.map((t) => ({ value: t, label: FINANCIAL_SERVICE_TYPE_LABEL[t] }));

export default function ServicesConfigurationPanel({ canMutate }: { canMutate: boolean }) {
    const { services, loading, error, busy, createService, setServiceActive } = useFinancialServices();
    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState("");
    const [serviceType, setServiceType] = useState<string>(FINANCIAL_SERVICE_TYPES[0]);
    const [unit, setUnit] = useState("");
    const [formError, setFormError] = useState<string | null>(null);

    async function submit() {
        if (!label.trim()) return setFormError("Service name is required");
        setFormError(null);
        try {
            await createService({ label: label.trim(), service_type: serviceType, unit: unit.trim() || null });
            setLabel("");
            setUnit("");
            setAdding(false);
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to create service");
        }
    }

    return (
        <div className="space-y-3" data-testid="financials-services">
            <ConfigurationContext
                title="Services"
                subtitle="What does the organization sell? Rates and charges attach to these services."
                testId="financials-services-context"
                actions={
                    canMutate && !adding ? (
                        <ConfigPrimaryButton onClick={() => setAdding(true)} testId="financials-services-add">
                            Add service
                        </ConfigPrimaryButton>
                    ) : undefined
                }
            />

            {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            ) : null}

            {canMutate && adding ? (
                <ConfigurationDetailCard title="New service" testId="financials-services-form">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <ConfigFieldLabel label="Name">
                            <ConfigTextInput value={label} onChange={setLabel} disabled={busy} placeholder="Full-Time Care" testId="financials-services-label" />
                        </ConfigFieldLabel>
                        <ConfigFieldLabel label="Type">
                            <ConfigSelectInput value={serviceType} onChange={setServiceType} options={TYPE_OPTIONS} disabled={busy} testId="financials-services-type" />
                        </ConfigFieldLabel>
                        <ConfigFieldLabel label="Unit (optional)">
                            <ConfigTextInput value={unit} onChange={setUnit} disabled={busy} placeholder="month, week, trip…" testId="financials-services-unit" />
                        </ConfigFieldLabel>
                    </div>
                    {formError ? (
                        <p className="mt-2 text-xs text-red-700" role="alert" data-testid="financials-services-error">
                            {formError}
                        </p>
                    ) : null}
                    <div className="mt-3">
                        <ConfigButtonRow>
                            <ConfigPrimaryButton onClick={() => void submit()} disabled={busy} testId="financials-services-save">
                                Add service
                            </ConfigPrimaryButton>
                            <ConfigSecondaryButton onClick={() => setAdding(false)} disabled={busy}>
                                Cancel
                            </ConfigSecondaryButton>
                        </ConfigButtonRow>
                    </div>
                </ConfigurationDetailCard>
            ) : null}

            {loading ? (
                <ConfigurationEmptyState testId="financials-services-loading" title="Loading services" description="Fetching the service catalog." />
            ) : services.length === 0 ? (
                <ConfigurationEmptyState
                    testId="financials-services-empty"
                    title="No services yet"
                    description="Add the services your organization sells — Full-Time Care, Before Care, Registration, Meals, Transportation…"
                />
            ) : (
                <ConfigurationDetailCard title={`Service catalog (${services.length})`} testId="financials-services-list">
                    <ul className="divide-y divide-alloy-stone/30">
                        {services.map((s) => (
                            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-testid={`financials-service-${s.id}`}>
                                <div className="min-w-0">
                                    <p className="config-typo-field-value text-alloy-midnight">
                                        {s.label}
                                        {!s.isActive ? <span className="text-alloy-forge/50"> · inactive</span> : null}
                                    </p>
                                    <p className="config-typo-sublabel text-alloy-forge/60">
                                        {FINANCIAL_SERVICE_TYPE_LABEL[s.serviceType]}
                                        {s.unit ? ` · per ${s.unit}` : ""} · {s.key}
                                    </p>
                                </div>
                                {canMutate ? (
                                    <ConfigSecondaryButton
                                        onClick={() => void setServiceActive(s.id, !s.isActive)}
                                        disabled={busy}
                                        testId={`financials-service-toggle-${s.id}`}
                                    >
                                        {s.isActive ? "Deactivate" : "Reactivate"}
                                    </ConfigSecondaryButton>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </ConfigurationDetailCard>
            )}
        </div>
    );
}
