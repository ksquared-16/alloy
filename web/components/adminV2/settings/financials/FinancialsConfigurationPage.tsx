"use client";

import { useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigField,
    ConfigFieldGrid,
    ConfigReadonlyNotice,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import { ConfigVersionBadge } from "@/components/adminV2/settings/configurationRuntime/ConfigEditorPrimitives";
import FinancialChargePreviewInspector from "@/components/adminV2/settings/financials/FinancialChargePreviewInspector";
import { GlCodesReadonlyView, GlMappingsReadonlyView } from "@/components/adminV2/settings/financials/GlConfigReadonlyView";
import RatePlanAuthoringWorkspace from "@/components/adminV2/settings/financials/RatePlanAuthoringWorkspace";
import CreateRatePlanForm from "@/components/adminV2/settings/financials/CreateRatePlanForm";
import {
    FINANCIALS_CONFIG_SECTIONS,
    useFinancialsConfigurationSettings,
    type FinancialsConfigSection,
} from "@/components/adminV2/settings/financials/useFinancialsConfigurationSettings";
import { useRateAuthoring } from "@/components/adminV2/settings/financials/useRateAuthoring";
import {
    classifyVersionStatus,
    currentVersionId,
} from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import { describeScope } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import type { ChildcareRatePlanRow } from "@/lib/financials/rates/rateTypes";

const FINANCIALS_SUBTITLE =
    "Rate plans, charge preview, and GL configuration. Versioned authoring for rate plans + rules — no posting, payments, or subsidy.";

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

function planLineageKey(p: ChildcareRatePlanRow): string {
    return [
        p.plan_key,
        p.scope_type,
        p.site_location_id ?? "",
        p.program_category_id ?? "",
        p.room_location_id ?? "",
        p.age_group_key ?? "",
    ].join("::");
}

export default function FinancialsConfigurationPage() {
    const { canMutate } = useAdminAuth();
    const { loading, error, ratePlans, rateRules, glAccounts, glAccountMappings, refresh } =
        useFinancialsConfigurationSettings();
    const authoring = useRateAuthoring(refresh);

    const [section, setSection] = useState<FinancialsConfigSection>("overview");
    const [selectedLineageKey, setSelectedLineageKey] = useState<string | null>(null);
    const [creatingPlan, setCreatingPlan] = useState(false);

    const today = todayYmd();

    // One entry per logical plan (lineage), represented by its working version.
    const planLineages = useMemo(() => {
        const groups = new Map<string, ChildcareRatePlanRow[]>();
        for (const p of ratePlans) {
            const key = planLineageKey(p);
            const list = groups.get(key) ?? [];
            list.push(p);
            groups.set(key, list);
        }
        return [...groups.entries()]
            .map(([key, rows]) => {
                const currentId = currentVersionId(rows, today);
                const working =
                    rows.find((r) => r.id === currentId) ??
                    [...rows].sort((a, b) => (a.effective_start < b.effective_start ? 1 : -1))[0];
                return { key, rows, working };
            })
            .sort((a, b) => ((a.working.label ?? a.working.plan_key) < (b.working.label ?? b.working.plan_key) ? -1 : 1));
    }, [ratePlans, today]);

    const selectedLineage = planLineages.find((l) => l.key === selectedLineageKey) ?? null;
    const selectedPlan = selectedLineage?.working ?? null;

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
        section === "rate_plans" ? (
            <ConfigurationQueue
                testId="financials-rate-plan-queue"
                title="Rate Plans"
                actions={
                    canMutate ? (
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            data-testid="financials-new-rate-plan"
                            onClick={() => {
                                setCreatingPlan(true);
                                setSelectedLineageKey(null);
                            }}
                        >
                            New plan
                        </ConfigurationPrimaryButton>
                    ) : null
                }
            >
                {planLineages.length === 0 ? (
                    <p className="config-typo-sublabel" data-testid="financials-rate-plan-list-empty">
                        No rate plans configured yet.
                    </p>
                ) : (
                    planLineages.map(({ key, rows, working }) => {
                        const status = classifyVersionStatus(working, rows, today);
                        return (
                            <ConfigurationQueueItem
                                key={key}
                                active={key === selectedLineageKey && !creatingPlan}
                                title={(working.label ?? "").trim() || working.plan_key}
                                subtitle={`${describeScope(working)} · ${working.currency_code} · ${rows.length} version${rows.length === 1 ? "" : "s"}`}
                                trailing={<ConfigVersionBadge status={status} />}
                                onClick={() => {
                                    setSelectedLineageKey(key);
                                    setCreatingPlan(false);
                                }}
                                testId={`financials-rate-plan-${key}`}
                            />
                        );
                    })
                )}
            </ConfigurationQueue>
        ) : undefined;

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
                        Financials is a first-class configuration domain. Rate plans and rate rules are now authored with
                        effective-dated versioning (create, future version, supersede, retire). Posting, payments,
                        financial responsibility, and subsidy remain future write surfaces.
                    </ConfigReadonlyNotice>
                    <ConfigurationDetailCard title="What is configured">
                        <ConfigFieldGrid>
                            <ConfigField label="Rate plans" value={planLineages.length} />
                            <ConfigField label="Rate rules" value={rateRules.length} />
                            <ConfigField label="GL codes" value={glAccounts.length} />
                            <ConfigField label="GL mappings" value={glAccountMappings.length} />
                        </ConfigFieldGrid>
                    </ConfigurationDetailCard>
                    <ConfigurationDetailCard title="Future write surfaces">
                        <ul className="list-disc space-y-1 pl-5 text-[13px] text-alloy-forge/75">
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
            if (creatingPlan) {
                return (
                    <CreateRatePlanForm
                        busy={authoring.busy}
                        onCancel={() => setCreatingPlan(false)}
                        onCreate={async (payload) => {
                            await authoring.createPlan(payload);
                            setCreatingPlan(false);
                            setSelectedLineageKey(null);
                        }}
                    />
                );
            }
            return (
                <RatePlanAuthoringWorkspace
                    plan={selectedPlan}
                    ratePlans={ratePlans}
                    rateRules={rateRules}
                    todayYmd={today}
                    canMutate={canMutate}
                    authoring={authoring}
                />
            );
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

            {error ? (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            ) : null}

            <ConfigurationShell testId="financials-configuration-shell" queueColumn={sectionQueue} listColumn={planList}>
                {workspace}
            </ConfigurationShell>
        </div>
    );
}
