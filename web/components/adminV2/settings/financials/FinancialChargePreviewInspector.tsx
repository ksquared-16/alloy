"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DraftChargePreviewDto } from "@/lib/financials/chargeResolution/previewDraftChargePresentation";
import {
    ConfigurationDetailCard,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigDateInput,
    ConfigFieldLabel,
    ConfigSelectInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import {
    ConfigField,
    ConfigFieldGrid,
    ConfigReadonlyNotice,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import { useScopeOptions } from "@/components/adminV2/settings/configurationRuntime/useScopeOptions";

type PreviewResponse = { preview?: DraftChargePreviewDto; error?: string };
type MemberRow = { id: string; display_name: string | null; first_name: string | null; last_name: string | null; is_active?: boolean };
type AgreementRow = { id: string; site_location_id: string; status: string; start_date: string | null; end_date: string | null };

function memberLabel(m: MemberRow): string {
    const name = (m.display_name ?? "").trim() || `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
    return name || "Unnamed member";
}

/**
 * Financial Charge Preview (Financial Configuration Convergence redesign).
 * Operators select Child → Agreement → Service Period — no UUID entry. Resolves
 * what a draft charge WOULD be via the existing read-only preview API. Preview
 * only: no invoice, no AR, no posting, no ledger write.
 */
export default function FinancialChargePreviewInspector() {
    const { labelFor } = useScopeOptions();
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [agreements, setAgreements] = useState<AgreementRow[]>([]);
    const [memberId, setMemberId] = useState("");
    const [agreementId, setAgreementId] = useState("");
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<DraftChargePreviewDto | null>(null);

    // Load children / members for the first selector.
    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const res = await fetch("/api/admin/customer-members", { credentials: "include" });
                const json = (await res.json()) as { members?: MemberRow[]; error?: string };
                if (active && res.ok) setMembers(json.members ?? []);
            } catch {
                /* selector stays empty; the inspector still renders */
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    // When a member is chosen, load their agreements.
    const loadAgreements = useCallback(async (selectedMemberId: string) => {
        setAgreements([]);
        setAgreementId("");
        if (!selectedMemberId) return;
        try {
            const res = await fetch(
                `/api/admin/child-enrollment-agreements?customer_member_id=${encodeURIComponent(selectedMemberId)}`,
                { credentials: "include" },
            );
            const json = (await res.json()) as { agreements?: AgreementRow[]; error?: string };
            if (res.ok) setAgreements(json.agreements ?? []);
        } catch {
            /* leave agreements empty */
        }
    }, []);

    const memberOptions = useMemo(
        () => [{ value: "", label: "Select a child…" }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))],
        [members],
    );
    const agreementOptions = useMemo(
        () => [
            { value: "", label: agreements.length ? "Select an agreement…" : "No agreements for this child" },
            ...agreements.map((a) => ({
                value: a.id,
                label: `${labelFor(a.site_location_id) ?? "Location"} · ${a.status}${a.start_date ? ` · from ${a.start_date}` : ""}`,
            })),
        ],
        [agreements, labelFor],
    );

    const canRun = agreementId !== "" && periodStart !== "" && periodEnd !== "";

    async function runPreview() {
        setLoading(true);
        setError(null);
        setPreview(null);
        try {
            const params = new URLSearchParams({
                enrollment_agreement_id: agreementId,
                period_start: periodStart,
                period_end: periodEnd,
            });
            const res = await fetch(`/api/admin/financial-charge-preview?${params.toString()}`, { credentials: "include" });
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

            <ConfigurationDetailCard testId="financials-charge-preview-form" title="Who and when">
                <div className="grid gap-3 sm:grid-cols-2">
                    <ConfigFieldLabel label="Child">
                        <ConfigSelectInput
                            value={memberId}
                            onChange={(v) => {
                                setMemberId(v);
                                void loadAgreements(v);
                            }}
                            options={memberOptions}
                            testId="financials-charge-preview-child"
                        />
                    </ConfigFieldLabel>
                    <ConfigFieldLabel label="Enrollment agreement">
                        <ConfigSelectInput
                            value={agreementId}
                            onChange={setAgreementId}
                            options={agreementOptions}
                            disabled={!memberId}
                            testId="financials-charge-preview-agreement"
                        />
                    </ConfigFieldLabel>
                    <ConfigFieldLabel label="Service period start">
                        <ConfigDateInput value={periodStart} onChange={setPeriodStart} testId="financials-charge-preview-period-start" />
                    </ConfigFieldLabel>
                    <ConfigFieldLabel label="Service period end">
                        <ConfigDateInput value={periodEnd} onChange={setPeriodEnd} testId="financials-charge-preview-period-end" />
                    </ConfigFieldLabel>
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

            {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            ) : null}

            {preview ? (
                <ConfigurationDetailCard testId="financials-charge-preview-result" title="Resolved preview">
                    {preview.status === "unresolved" ? (
                        <p className="config-typo-sublabel" data-testid="financials-charge-preview-unresolved">
                            Unresolved: {preview.reason}
                        </p>
                    ) : (
                        <ConfigFieldGrid>
                            <ConfigField label="Amount" value={formatCurrencyCents(preview.amountCents, preview.currencyCode)} />
                            <ConfigField label="Charge category" value={chargeCategoryLabel(preview.chargeCategory)} />
                            <ConfigField label="Schedule basis" value={preview.scheduleBasis} />
                            <ConfigField label="Rate basis" value={preview.rate.rateBasis} />
                            <ConfigField label="Calculation" value={preview.rate.calculationStrategy} />
                            <ConfigField label="Unit amount" value={formatCurrencyCents(preview.rate.unitAmountCents, preview.rate.currencyCode)} />
                            <ConfigField label="Quantity" value={`${preview.quantity.value} ${preview.quantity.unit}`} />
                            <ConfigField label="Responsibility" value={preview.responsibility.partyType} />
                        </ConfigFieldGrid>
                    )}
                </ConfigurationDetailCard>
            ) : null}
        </div>
    );
}
