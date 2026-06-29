"use client";

import { useState } from "react";
import {
    FINANCIAL_SERVICE_TYPES,
    FINANCIAL_SERVICE_TYPE_LABEL,
    type FinancialService,
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
 * Services configuration (Commercial Model). The catalog of what the organization
 * sells — the first-class entity (table `financial_services`) that rates, charge
 * templates, scheduling, attendance, billing, and posting attach to. Real,
 * authorable (create / edit / activate). Inline authoring, no drawers, no IDs.
 */

const TYPE_OPTIONS = FINANCIAL_SERVICE_TYPES.map((t) => ({ value: t, label: FINANCIAL_SERVICE_TYPE_LABEL[t] }));

type Draft = { id: string | null; label: string; serviceType: string; unit: string; description: string };
const EMPTY_DRAFT: Draft = { id: null, label: "", serviceType: FINANCIAL_SERVICE_TYPES[0], unit: "", description: "" };

export default function ServicesConfigurationPanel({ canMutate }: { canMutate: boolean }) {
    const { services, loading, error, busy, createService, updateService, setServiceActive } = useFinancialServices();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    function openCreate() {
        setDraft({ ...EMPTY_DRAFT });
        setFormError(null);
    }
    function openEdit(s: FinancialService) {
        setDraft({ id: s.id, label: s.label, serviceType: s.serviceType, unit: s.unit ?? "", description: s.description ?? "" });
        setFormError(null);
    }

    async function submit() {
        if (!draft) return;
        if (!draft.label.trim()) return setFormError("Service name is required");
        setFormError(null);
        const body = {
            label: draft.label.trim(),
            service_type: draft.serviceType,
            unit: draft.unit.trim() || null,
            description: draft.description.trim() || null,
        };
        try {
            if (draft.id) await updateService({ id: draft.id, ...body });
            else await createService(body);
            setDraft(null);
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Failed to save service");
        }
    }

    return (
        <div className="space-y-3" data-testid="financials-services">
            <ConfigurationContext
                title="Services"
                subtitle="What does the organization sell? Rates and charges attach to these services."
                testId="financials-services-context"
                actions={
                    canMutate && !draft ? (
                        <ConfigPrimaryButton onClick={openCreate} testId="financials-services-add">
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

            {canMutate && draft ? (
                <ConfigurationDetailCard title={draft.id ? "Edit service" : "New service"} testId="financials-services-form">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <ConfigFieldLabel label="Name">
                            <ConfigTextInput value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} disabled={busy} placeholder="Full-Time Care" testId="financials-services-label" />
                        </ConfigFieldLabel>
                        <ConfigFieldLabel label="Type">
                            <ConfigSelectInput value={draft.serviceType} onChange={(v) => setDraft({ ...draft, serviceType: v })} options={TYPE_OPTIONS} disabled={busy} testId="financials-services-type" />
                        </ConfigFieldLabel>
                        <ConfigFieldLabel label="Unit (optional)">
                            <ConfigTextInput value={draft.unit} onChange={(v) => setDraft({ ...draft, unit: v })} disabled={busy} placeholder="month, week, trip…" testId="financials-services-unit" />
                        </ConfigFieldLabel>
                        <ConfigFieldLabel label="Description (optional)">
                            <ConfigTextInput value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} disabled={busy} testId="financials-services-description" />
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
                                {draft.id ? "Save service" : "Add service"}
                            </ConfigPrimaryButton>
                            <ConfigSecondaryButton onClick={() => setDraft(null)} disabled={busy}>
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
                                        {s.description ? ` · ${s.description}` : ""}
                                    </p>
                                </div>
                                {canMutate ? (
                                    <ConfigButtonRow>
                                        <ConfigSecondaryButton onClick={() => openEdit(s)} disabled={busy} testId={`financials-service-edit-${s.id}`}>
                                            Edit
                                        </ConfigSecondaryButton>
                                        <ConfigSecondaryButton
                                            onClick={() => void setServiceActive(s.id, !s.isActive)}
                                            disabled={busy}
                                            testId={`financials-service-toggle-${s.id}`}
                                        >
                                            {s.isActive ? "Deactivate" : "Reactivate"}
                                        </ConfigSecondaryButton>
                                    </ConfigButtonRow>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </ConfigurationDetailCard>
            )}
        </div>
    );
}
