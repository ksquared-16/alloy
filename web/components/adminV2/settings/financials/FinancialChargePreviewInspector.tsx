"use client";

import { useState } from "react";
import type { DraftChargePreviewDto } from "@/lib/financials/chargeResolution/previewDraftChargePresentation";
import {
    ConfigurationDetailCard,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigField,
    ConfigFieldGrid,
    ConfigReadonlyNotice,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";

type PreviewResponse = { preview?: DraftChargePreviewDto; error?: string };

/**
 * Read-only Financial Charge Preview inspector (Batch 0). Calls the existing
 * read-only preview API (/api/admin/financial-charge-preview) and renders the
 * resolved draft charge. Preview only — no invoice, no AR, no posting, no ledger.
 */
export default function FinancialChargePreviewInspector() {
    const [agreementId, setAgreementId] = useState("");
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<DraftChargePreviewDto | null>(null);

    const canRun = agreementId.trim() !== "" && periodStart !== "" && periodEnd !== "";

    async function runPreview() {
        setLoading(true);
        setError(null);
        setPreview(null);
        try {
            const params = new URLSearchParams({
                enrollment_agreement_id: agreementId.trim(),
                period_start: periodStart,
                period_end: periodEnd,
            });
            const res = await fetch(`/api/admin/financial-charge-preview?${params.toString()}`, {
                credentials: "include",
            });
            const json = (await res.json()) as PreviewResponse;
            if (!res.ok) throw new Error(json.error ?? `Preview failed (${res.status})`);
            setPreview(json.preview ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to run charge preview");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-3" data-testid="financials-charge-preview">
            <ConfigReadonlyNotice testId="financials-charge-preview-notice">
                Preview only — resolves what a draft charge would be. No invoice, no AR, no posting, no ledger write.
            </ConfigReadonlyNotice>

            <ConfigurationDetailCard testId="financials-charge-preview-form" title="Charge Preview inputs">
                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1">
                        <span className="config-typo-sublabel text-alloy-forge/60">Billable source (agreement) ID</span>
                        <input
                            type="text"
                            value={agreementId}
                            onChange={(e) => setAgreementId(e.target.value)}
                            placeholder="enrollment_agreement_id"
                            className="config-runtime-input"
                            data-testid="financials-charge-preview-agreement"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="config-typo-sublabel text-alloy-forge/60">Period start</span>
                        <input
                            type="date"
                            value={periodStart}
                            onChange={(e) => setPeriodStart(e.target.value)}
                            className="config-runtime-input"
                            data-testid="financials-charge-preview-period-start"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="config-typo-sublabel text-alloy-forge/60">Period end</span>
                        <input
                            type="date"
                            value={periodEnd}
                            onChange={(e) => setPeriodEnd(e.target.value)}
                            className="config-runtime-input"
                            data-testid="financials-charge-preview-period-end"
                        />
                    </label>
                </div>
                <div className="mt-3">
                    <ConfigurationPrimaryButton
                        className="config-primary-btn--sm"
                        disabled={!canRun || loading}
                        onClick={runPreview}
                        data-testid="financials-charge-preview-run"
                    >
                        {loading ? "Running…" : "Run preview"}
                    </ConfigurationPrimaryButton>
                </div>
            </ConfigurationDetailCard>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            {preview ?
                <ConfigurationDetailCard testId="financials-charge-preview-result" title="Resolved preview">
                    {preview.status === "unresolved" ?
                        <p className="config-typo-sublabel" data-testid="financials-charge-preview-unresolved">
                            Unresolved: {preview.reason}
                        </p>
                    :   <ConfigFieldGrid>
                            <ConfigField
                                label="Amount"
                                value={formatCurrencyCents(preview.amountCents, preview.currencyCode)}
                            />
                            <ConfigField label="Schedule basis" value={preview.scheduleBasis} />
                            <ConfigField label="Rate basis" value={preview.rate.rateBasis} />
                            <ConfigField label="Calculation" value={preview.rate.calculationStrategy} />
                            <ConfigField
                                label="Unit amount"
                                value={formatCurrencyCents(preview.rate.unitAmountCents, preview.rate.currencyCode)}
                            />
                            <ConfigField label="Quantity" value={`${preview.quantity.value} ${preview.quantity.unit}`} />
                            <ConfigField label="Charge category" value={preview.chargeCategory} />
                            <ConfigField label="Responsibility" value={preview.responsibility.partyType} />
                            <ConfigField label="Resolution key" value={preview.resolutionKey} />
                        </ConfigFieldGrid>
                    }
                </ConfigurationDetailCard>
            :   null}
        </div>
    );
}
