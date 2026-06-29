"use client";

import { useMemo } from "react";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
import {
    AMOUNT_STRATEGY_LABEL,
    BILLABLE_ON_LABEL,
    CHARGE_TEMPLATE_AMOUNT_STRATEGIES,
    CHARGE_TEMPLATE_BILLABLE_ON,
    CHARGE_TEMPLATE_OCCURS_ON,
    CHARGE_TEMPLATE_RESPONSIBILITY,
    CHARGE_TEMPLATE_TRIGGER_TYPES,
    OCCURS_ON_LABEL,
    RESPONSIBILITY_LABEL,
    TRIGGER_TYPE_LABEL,
} from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
import { chargeCategoryLabel, listChargeCategories } from "@/lib/financials/chargeCategories";
import { currentVersionId, type EffectiveDatedVersionRow } from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import { formatCurrencyCents } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigReadonlyNotice } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import {
    EffectiveDatedConfigurationEditor,
    type EditorField,
} from "@/components/adminV2/settings/configurationRuntime/EffectiveDatedConfigurationEditor";
import { useChargeTemplates } from "@/components/adminV2/settings/financials/useChargeTemplates";
import { useFinancialServices } from "@/components/adminV2/settings/financials/useFinancialServices";

/**
 * Charge Templates configuration (Commercial Model, Slice B). How an operational
 * fact or event becomes a charge — service, category, trigger, occurs-on /
 * billable-on timing, default GL + responsibility, review. Effective-dated
 * authoring via the shared editor (version timeline + supersede / retire / void).
 * Configuration only — this posts nothing. No drawers, no IDs.
 */

const YES_NO = [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }];

function dollarsToCents(value: string): number {
    return Math.round(Number(value) * 100);
}
function centsToDollars(cents: number | null): string {
    return cents == null ? "" : (cents / 100).toFixed(2);
}

function pickWorking<T extends EffectiveDatedVersionRow>(lineage: T[], todayYmd: string): T {
    const currentId = currentVersionId(lineage, todayYmd);
    return lineage.find((r) => r.id === currentId) ?? [...lineage].sort((a, b) => (a.effective_start < b.effective_start ? 1 : -1))[0];
}

export default function ChargeTemplatesConfigurationPanel({ canMutate, todayYmd }: { canMutate: boolean; todayYmd: string }) {
    const { templates, loading, error, busy, createTemplate, versionTemplate, retireTemplate, voidTemplate } = useChargeTemplates();
    const { services } = useFinancialServices();

    const serviceOptions = useMemo(
        () => [{ value: "", label: "— No service —" }, ...services.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.label }))],
        [services],
    );
    const serviceLabelById = useMemo(() => new Map(services.map((s) => [s.id, s.label])), [services]);
    const categoryOptions = useMemo(() => listChargeCategories().map((c) => ({ value: c.key, label: c.label })), []);
    const glMappingOptions = useMemo(
        () => [{ value: "", label: "— Category default —" }, ...[...new Set(listChargeCategories().map((c) => c.mappingKey))].map((k) => ({ value: k, label: k }))],
        [],
    );
    const triggerOptions = CHARGE_TEMPLATE_TRIGGER_TYPES.map((t) => ({ value: t, label: TRIGGER_TYPE_LABEL[t] }));
    const amountStrategyOptions = CHARGE_TEMPLATE_AMOUNT_STRATEGIES.map((t) => ({ value: t, label: AMOUNT_STRATEGY_LABEL[t] }));
    const occursOnOptions = CHARGE_TEMPLATE_OCCURS_ON.map((t) => ({ value: t, label: OCCURS_ON_LABEL[t] }));
    const billableOnOptions = CHARGE_TEMPLATE_BILLABLE_ON.map((t) => ({ value: t, label: BILLABLE_ON_LABEL[t] }));
    const responsibilityOptions = [{ value: "", label: "— None —" }, ...CHARGE_TEMPLATE_RESPONSIBILITY.map((t) => ({ value: t, label: RESPONSIBILITY_LABEL[t] }))];

    const lineages = useMemo(() => {
        const groups = new Map<string, ChargeTemplateRow[]>();
        for (const t of templates) {
            const list = groups.get(t.template_key) ?? [];
            list.push(t);
            groups.set(t.template_key, list);
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [templates]);

    function valueFields(t: ChargeTemplateRow | null): EditorField[] {
        return [
            { key: "label", label: "Name", type: "text", defaultValue: t?.label ?? "", required: true },
            { key: "service_id", label: "Service", type: "select", options: serviceOptions, defaultValue: t?.service_id ?? "" },
            { key: "charge_category", label: "Charge category", type: "select", options: categoryOptions, defaultValue: t?.charge_category ?? "fee" },
            { key: "trigger_type", label: "Trigger", type: "select", options: triggerOptions, defaultValue: t?.trigger_type ?? "manual" },
            { key: "amount_strategy", label: "Amount strategy", type: "select", options: amountStrategyOptions, defaultValue: t?.amount_strategy ?? "fixed" },
            { key: "amount", label: "Amount (fixed only)", type: "money", defaultValue: centsToDollars(t?.amount_cents ?? null) },
            { key: "occurs_on_strategy", label: "Occurs on", type: "select", options: occursOnOptions, defaultValue: t?.occurs_on_strategy ?? "now" },
            { key: "billable_on_strategy", label: "Billable on", type: "select", options: billableOnOptions, defaultValue: t?.billable_on_strategy ?? "immediate" },
            { key: "billable_offset_days", label: "Offset days", type: "number", defaultValue: t?.billable_offset_days != null ? String(t.billable_offset_days) : "" },
            { key: "default_gl_mapping_key", label: "Default GL mapping", type: "select", options: glMappingOptions, defaultValue: t?.default_gl_mapping_key ?? "" },
            { key: "default_responsibility_key", label: "Default responsibility", type: "select", options: responsibilityOptions, defaultValue: t?.default_responsibility_key ?? "" },
            { key: "review_required", label: "Review required", type: "select", options: YES_NO, defaultValue: t?.review_required ? "yes" : "no" },
            { key: "description", label: "Description", type: "text", defaultValue: t?.description ?? "" },
        ];
    }

    function buildPayload(fields: Record<string, string>): Record<string, unknown> {
        const amountStrategy = fields.amount_strategy;
        const billableOn = fields.billable_on_strategy;
        return {
            service_id: fields.service_id || null,
            label: fields.label,
            description: fields.description || null,
            charge_category: fields.charge_category,
            trigger_type: fields.trigger_type,
            amount_strategy: amountStrategy,
            amount_cents: amountStrategy === "fixed" ? dollarsToCents(fields.amount) : null,
            occurs_on_strategy: fields.occurs_on_strategy,
            billable_on_strategy: billableOn,
            billable_offset_days: billableOn === "offset_days" ? Number(fields.billable_offset_days) : null,
            default_gl_mapping_key: fields.default_gl_mapping_key || null,
            default_responsibility_key: fields.default_responsibility_key || null,
            review_required: fields.review_required === "yes",
        };
    }

    const summary = (t: ChargeTemplateRow) => (
        <span>
            {t.service_id ? `${serviceLabelById.get(t.service_id) ?? "Service"} · ` : ""}
            {chargeCategoryLabel(t.charge_category)} · {TRIGGER_TYPE_LABEL[t.trigger_type]}
            {t.amount_strategy === "fixed" && t.amount_cents != null ? ` · ${formatCurrencyCents(t.amount_cents, t.currency_code)}` : ` · ${AMOUNT_STRATEGY_LABEL[t.amount_strategy]}`}
            <span className="text-alloy-forge/55">
                {" "}· occurs {OCCURS_ON_LABEL[t.occurs_on_strategy].toLowerCase()} · billable {BILLABLE_ON_LABEL[t.billable_on_strategy].toLowerCase()}
                {t.billable_on_strategy === "offset_days" && t.billable_offset_days != null ? ` (${t.billable_offset_days}d)` : ""}
                {t.review_required ? " · review" : ""}
            </span>
        </span>
    );

    return (
        <div className="space-y-3" data-testid="financials-charge-templates">
            <ConfigurationContext
                title="Charge Templates"
                subtitle="How does an event or fact become a charge?"
                testId="financials-charge-templates-context"
            />
            <ConfigReadonlyNotice testId="financials-charge-templates-notice">
                This template configures future charges but does not post money. Posting and charge generation remain a
                separate, authoritative stage.
            </ConfigReadonlyNotice>

            {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            ) : null}

            {loading ? (
                <ConfigurationEmptyState testId="financials-charge-templates-loading" title="Loading charge templates" description="Fetching charge templates." />
            ) : (
                <>
                    {lineages.length === 0 && !canMutate ? (
                        <ConfigurationEmptyState
                            testId="financials-charge-templates-empty"
                            title="No charge templates yet"
                            description="Charge templates define non-tuition charges — Registration, Field Trip, Late Pickup, Meals…"
                        />
                    ) : null}

                    {lineages.map(([key, rows], idx) => {
                        const working = pickWorking(rows, todayYmd);
                        return (
                            <EffectiveDatedConfigurationEditor<ChargeTemplateRow>
                                key={key}
                                title={`${working.label}`}
                                versions={rows}
                                todayYmd={todayYmd}
                                fields={valueFields(working)}
                                canMutate={canMutate}
                                busy={busy}
                                testIdPrefix={`charge-template-${idx}`}
                                renderVersionSummary={summary}
                                onCreateVersion={({ effectiveStart, fields }) =>
                                    versionTemplate({ prior_id: working.id, effective_start: effectiveStart, ...buildPayload(fields) })
                                }
                                onRetire={({ effectiveEnd }) => retireTemplate({ id: working.id, effective_end: effectiveEnd })}
                                onVoid={(row) => voidTemplate(row.id)}
                            />
                        );
                    })}

                    {canMutate ? (
                        <EffectiveDatedConfigurationEditor<ChargeTemplateRow>
                            title="Add charge template"
                            versions={[]}
                            todayYmd={todayYmd}
                            fields={[{ key: "template_key", label: "Template key", type: "text", required: true }, ...valueFields(null)]}
                            canMutate={canMutate}
                            busy={busy}
                            emptyCreateLabel="Add charge template"
                            testIdPrefix="charge-template-new"
                            renderVersionSummary={() => null}
                            onCreateVersion={({ effectiveStart, fields }) =>
                                createTemplate({ template_key: fields.template_key, effective_start: effectiveStart, ...buildPayload(fields) })
                            }
                            onRetire={async () => undefined}
                            onVoid={async () => undefined}
                        />
                    ) : null}
                </>
            )}
        </div>
    );
}
