"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
import type { ChargeIntent } from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";
import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { ConfigurationDetailCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigButtonRow,
    ConfigDateInput,
    ConfigFieldLabel,
    ConfigNumberInput,
    ConfigPrimaryButton,
    ConfigSecondaryButton,
    ConfigSelectInput,
} from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import {
    ConfigField,
    ConfigFieldGrid,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";

type PreviewResult = { intent: ChargeIntent; wouldWrite: string; existing: { id: string; status: string } | null };
type MemberRow = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };
type AgreementRow = { id: string; status: string; start_date: string | null };

function memberLabel(m: MemberRow): string {
    return ((m.display_name ?? "").trim() || `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()) || "Unnamed";
}

/**
 * Charge Template Simulator (Commercial Model, Slice D). Resolves a configured
 * Charge Template into a draft/scheduled Charge intent — occurs-on, billable-on,
 * amount, category, GL, responsibility, review, lifecycle status, and whether it
 * would create a draft. Preview computes nothing authoritative; an optional
 * Child → Agreement lets an operator write an idempotent DRAFT (never posts).
 * No UUIDs.
 */
export default function ChargeTemplateSimulator({ templates }: { templates: ChargeTemplateRow[] }) {
    const [templateId, setTemplateId] = useState("");
    const [eventDate, setEventDate] = useState("");
    const [servicePeriodStart, setServicePeriodStart] = useState("");
    const [quantity, setQuantity] = useState("");
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [agreements, setAgreements] = useState<AgreementRow[]>([]);
    const [memberId, setMemberId] = useState("");
    const [agreementId, setAgreementId] = useState("");
    const [result, setResult] = useState<PreviewResult | null>(null);
    const [draftMsg, setDraftMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const template = templates.find((t) => t.id === templateId) ?? null;
    const templateOptions = useMemo(
        () => [{ value: "", label: "Select a charge template…" }, ...templates.map((t) => ({ value: t.id, label: t.label }))],
        [templates],
    );

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const res = await fetch("/api/admin/customer-members", { credentials: "include" });
                const json = (await res.json()) as { members?: MemberRow[] };
                if (active && res.ok) setMembers(json.members ?? []);
            } catch {
                /* selector stays empty */
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const loadAgreements = useCallback(async (mid: string) => {
        setAgreements([]);
        setAgreementId("");
        if (!mid) return;
        try {
            const res = await fetch(`/api/admin/child-enrollment-agreements?customer_member_id=${encodeURIComponent(mid)}`, { credentials: "include" });
            const json = (await res.json()) as { agreements?: AgreementRow[] };
            if (res.ok) setAgreements(json.agreements ?? []);
        } catch {
            /* leave empty */
        }
    }, []);

    async function run(action: "preview" | "draft") {
        setBusy(true);
        setError(null);
        setDraftMsg(null);
        try {
            const body: Record<string, unknown> = {
                action,
                template_id: templateId,
                event_date: eventDate || null,
                service_period_start: servicePeriodStart || null,
                quantity: quantity ? Number(quantity) : null,
                agreement_id: agreementId || null,
            };
            const res = await fetch("/api/admin/financial/charge-templates/simulate", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            if (action === "preview") setResult(json as PreviewResult);
            else setDraftMsg(`Draft ${json.status}${json.reason ? `: ${json.reason}` : ""} (idempotent — re-running recalculates, never posts).`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Simulation failed");
        } finally {
            setBusy(false);
        }
    }

    const intent = result?.intent;

    return (
        <ConfigurationDetailCard title="Simulator — preview a charge from a template" testId="financials-charge-simulator">
            <p className="config-typo-sublabel mb-3 text-alloy-forge/60">
                See what a template would create. Preview computes a draft/scheduled charge intent and posts nothing;
                with a child + agreement you can write an idempotent draft (still not posted).
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
                <ConfigFieldLabel label="Charge template">
                    <ConfigSelectInput value={templateId} onChange={(v) => { setTemplateId(v); setResult(null); }} options={templateOptions} disabled={busy} testId="simulator-template" />
                </ConfigFieldLabel>
                {template?.occurs_on_strategy === "event_date" ? (
                    <ConfigFieldLabel label="Event date">
                        <ConfigDateInput value={eventDate} onChange={setEventDate} disabled={busy} testId="simulator-event-date" />
                    </ConfigFieldLabel>
                ) : null}
                {template?.occurs_on_strategy === "service_period_start" ? (
                    <ConfigFieldLabel label="Service period start">
                        <ConfigDateInput value={servicePeriodStart} onChange={setServicePeriodStart} disabled={busy} testId="simulator-period-start" />
                    </ConfigFieldLabel>
                ) : null}
                {template?.amount_strategy === "usage_derived" ? (
                    <ConfigFieldLabel label="Usage quantity">
                        <ConfigNumberInput value={quantity} onChange={setQuantity} min="0" step="1" disabled={busy} testId="simulator-quantity" />
                    </ConfigFieldLabel>
                ) : null}
                <ConfigFieldLabel label="Child (optional, to write a draft)">
                    <ConfigSelectInput
                        value={memberId}
                        onChange={(v) => { setMemberId(v); void loadAgreements(v); }}
                        options={[{ value: "", label: "—" }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))]}
                        disabled={busy}
                        testId="simulator-child"
                    />
                </ConfigFieldLabel>
                {memberId ? (
                    <ConfigFieldLabel label="Agreement">
                        <ConfigSelectInput
                            value={agreementId}
                            onChange={setAgreementId}
                            options={[{ value: "", label: agreements.length ? "—" : "No agreements" }, ...agreements.map((a) => ({ value: a.id, label: `${a.status}${a.start_date ? ` · from ${a.start_date}` : ""}` }))]}
                            disabled={busy}
                            testId="simulator-agreement"
                        />
                    </ConfigFieldLabel>
                ) : null}
            </div>

            <div className="mt-3">
                <ConfigButtonRow>
                    <ConfigPrimaryButton onClick={() => void run("preview")} disabled={busy || !templateId} testId="simulator-preview">
                        {busy ? "Running…" : "Preview"}
                    </ConfigPrimaryButton>
                    {agreementId ? (
                        <ConfigSecondaryButton onClick={() => void run("draft")} disabled={busy} testId="simulator-draft">
                            Create draft
                        </ConfigSecondaryButton>
                    ) : null}
                </ConfigButtonRow>
            </div>

            {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
            {draftMsg ? <p className="mt-2 config-typo-sublabel text-alloy-forge/70" data-testid="simulator-draft-msg">{draftMsg}</p> : null}

            {intent ? (
                <div className="mt-3" data-testid="simulator-result">
                    {!intent.eligible ? (
                        <p className="config-typo-sublabel text-amber-700">Not eligible: {intent.reason}</p>
                    ) : (
                        <ConfigFieldGrid>
                            <ConfigField label="Occurs on" value={intent.occursOn} />
                            <ConfigField label="Billable on" value={intent.billableOn} />
                            <ConfigField label="Lifecycle" value={intent.lifecycleStatus} />
                            <ConfigField label="Charge category" value={chargeCategoryLabel(intent.chargeCategory)} />
                            <ConfigField label="Amount strategy" value={intent.amountStrategy} />
                            <ConfigField label="Amount" value={intent.amountCents != null ? formatCurrencyCents(intent.amountCents, intent.currencyCode) : "resolves at posting"} />
                            <ConfigField label="GL mapping" value={intent.glMappingKey ?? "category default"} />
                            <ConfigField label="Responsibility" value={intent.responsibilityKey ?? "default"} />
                            <ConfigField label="Review required" value={intent.reviewRequired ? "Yes" : "No"} />
                            <ConfigField label="Would create draft" value={result?.wouldWrite === "create" || result?.wouldWrite === "recalculate" ? "Yes" : result?.wouldWrite === "not_writable" ? "Preview only" : result?.wouldWrite ?? "—"} />
                        </ConfigFieldGrid>
                    )}
                </div>
            ) : null}
        </ConfigurationDetailCard>
    );
}
