"use client";

import { useMemo, useState } from "react";
import {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEffectiveBadge,
    ConfigField,
    ConfigFieldGrid,
    ConfigReadonlyNotice,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import FinancialChargePreviewInspector from "@/components/adminV2/settings/financials/FinancialChargePreviewInspector";
import { GlCodesReadonlyView, GlMappingsReadonlyView } from "@/components/adminV2/settings/financials/GlConfigReadonlyView";
import RatePlanDetailPanel from "@/components/adminV2/settings/financials/RatePlanDetailPanel";
import {
    FINANCIALS_CONFIG_SECTIONS,
    useFinancialsConfigurationSettings,
    type FinancialsConfigSection,
} from "@/components/adminV2/settings/financials/useFinancialsConfigurationSettings";
import {
    classifyEffectiveStatus,
    describeScope,
    EFFECTIVE_STATUS_LABEL,
    sortByEffectiveStatus,
} from "@/lib/adminV2/operationalConfig/configReadPresentation";

const FINANCIALS_SUBTITLE =
    "Rate plans, charge preview, and GL configuration. Read-only in V1 — no posting, payments, or subsidy.";

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function FinancialsConfigurationPage() {
    const { loading, error, ratePlans, rateRules, glAccounts, glAccountMappings } =
        useFinancialsConfigurationSettings();
    const [section, setSection] = useState<FinancialsConfigSection>("overview");
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

    const today = todayYmd();
    const sortedPlans = useMemo(() => sortByEffectiveStatus(ratePlans, today), [ratePlans, today]);
    const selectedPlan = sortedPlans.find((p) => p.id === selectedPlanId) ?? null;

    const sectionQueue = (
        <ConfigurationQueue testId="financials-section-queue" title="Sections">
            {FINANCIALS_CONFIG_SECTIONS.map((s) => (
                <ConfigurationQueueItem
                    key={s.key}
                    active={s.key === section}
                    title={s.label}
                    onClick={() => setSection(s.key)}
                    testId={`financials-section-${s.key}`}
                />
            ))}
        </ConfigurationQueue>
    );

    const planList =
        section === "rate_plans" ?
            <ConfigurationQueue testId="financials-rate-plan-queue" title="Rate Plans">
                {sortedPlans.length === 0 ?
                    <p className="config-typo-sublabel" data-testid="financials-rate-plan-list-empty">
                        No rate plans configured yet.
                    </p>
                :   sortedPlans.map((plan) => {
                        const status = classifyEffectiveStatus(plan, today);
                        return (
                            <ConfigurationQueueItem
                                key={plan.id}
                                active={plan.id === selectedPlanId}
                                title={(plan.label ?? "").trim() || plan.plan_key}
                                subtitle={`${describeScope(plan)} · ${plan.currency_code}`}
                                trailing={<ConfigEffectiveBadge status={status} label={EFFECTIVE_STATUS_LABEL[status]} />}
                                onClick={() => setSelectedPlanId(plan.id)}
                                testId={`financials-rate-plan-${plan.id}`}
                            />
                        );
                    })
                }
            </ConfigurationQueue>
        :   undefined;

    const workspace = (() => {
        if (loading) {
            return (
                <ConfigurationEmptyState
                    testId="financials-loading"
                    title="Loading financials"
                    description="Fetching rate plans, rate rules, and GL configuration."
                />
            );
        }
        if (section === "overview") {
            return (
                <div className="space-y-3" data-testid="financials-overview">
                    <ConfigReadonlyNotice testId="financials-overview-notice">
                        Financials is a first-class configuration domain. V1 exposes read-only rate configuration, a
                        charge preview inspector, and GL configuration. Posting, payments, financial responsibility, and
                        subsidy are future write surfaces.
                    </ConfigReadonlyNotice>
                    <ConfigurationDetailCard title="What is configured">
                        <ConfigFieldGrid>
                            <ConfigField label="Rate plans" value={ratePlans.length} />
                            <ConfigField label="Rate rules" value={rateRules.length} />
                            <ConfigField label="GL codes" value={glAccounts.length} />
                            <ConfigField label="GL mappings" value={glAccountMappings.length} />
                        </ConfigFieldGrid>
                    </ConfigurationDetailCard>
                    <ConfigurationDetailCard title="Future write surfaces">
                        <ul className="list-disc space-y-1 pl-5 text-[13px] text-alloy-forge/75">
                            <li>Rate plan + rate rule authoring with effective-dated versioning</li>
                            <li>Charge Resolution drafting (posting)</li>
                            <li>Payments and financial responsibility</li>
                            <li>Subsidy</li>
                            <li>GL code + GL mapping authoring</li>
                        </ul>
                    </ConfigurationDetailCard>
                </div>
            );
        }
        if (section === "rate_plans") {
            return <RatePlanDetailPanel plan={selectedPlan} rules={rateRules} todayYmd={today} />;
        }
        if (section === "charge_preview") {
            return <FinancialChargePreviewInspector />;
        }
        if (section === "gl_codes") {
            return <GlCodesReadonlyView glAccounts={glAccounts} />;
        }
        return <GlMappingsReadonlyView glAccountMappings={glAccountMappings} glAccounts={glAccounts} />;
    })();

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="financials-configuration-page">
            <ConfigurationContext
                title="Financials"
                subtitle={FINANCIALS_SUBTITLE}
                testId="financials-configuration-context"
            />

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <ConfigurationShell testId="financials-configuration-shell" queueColumn={sectionQueue} listColumn={planList}>
                {workspace}
            </ConfigurationShell>
        </div>
    );
}
