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
import AccountingConfigurationPanel from "@/components/adminV2/settings/financials/AccountingConfigurationPanel";
import ServicesConfigurationPanel from "@/components/adminV2/settings/financials/ServicesConfigurationPanel";
import {
    ChargeTemplatesArea,
    FinancialPoliciesArea,
    FinancialResponsibilityArea,
    PaymentsConfigurationArea,
    PostingConfigurationArea,
    SubsidyConfigurationArea,
} from "@/components/adminV2/settings/financials/FinancialDesignedAreas";
import RatePlanAuthoringWorkspace from "@/components/adminV2/settings/financials/RatePlanAuthoringWorkspace";
import CreateRatePlanForm from "@/components/adminV2/settings/financials/CreateRatePlanForm";
import {
    FINANCIALS_CONFIG_GROUPS,
    useFinancialsConfigurationSettings,
    type FinancialsConfigSection,
} from "@/components/adminV2/settings/financials/useFinancialsConfigurationSettings";
import { useRateAuthoring } from "@/components/adminV2/settings/financials/useRateAuthoring";
import {
    classifyVersionStatus,
    currentVersionId,
} from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import { describeScopeWithLabel } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { useScopeOptions } from "@/components/adminV2/settings/configurationRuntime/useScopeOptions";
import type { ChildcareRatePlanRow } from "@/lib/financials/rates/rateTypes";

const FINANCIALS_SUBTITLE = "Configure how your organization gets paid — what you sell, how you price it, and how it posts.";

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
    const { options: scopeOptions, labelFor, ageGroupOptions } = useScopeOptions();
    const authoring = useRateAuthoring(refresh);

    const [section, setSection] = useState<FinancialsConfigSection>("overview");
    const [selectedLineageKey, setSelectedLineageKey] = useState<string | null>(null);
    const [creatingPlan, setCreatingPlan] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [seedMsg, setSeedMsg] = useState<string | null>(null);

    const today = todayYmd();

    async function loadDemoData() {
        setSeeding(true);
        setSeedMsg(null);
        try {
            const res = await fetch("/api/admin/financial/seed-demo", { method: "POST", credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Seed failed (${res.status})`);
            setSeedMsg("Demo data loaded (idempotent — safe to re-run).");
            await refresh();
        } catch (e) {
            setSeedMsg(e instanceof Error ? e.message : "Seed failed");
        } finally {
            setSeeding(false);
        }
    }

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
        <ConfigurationQueue testId="financials-section-queue" title="Financials">
            {FINANCIALS_CONFIG_GROUPS.map((group) => (
                <div key={group.label || "_root"} className={group.label ? "mt-2" : undefined}>
                    {group.label ? (
                        <p className="config-typo-sublabel px-1 pb-1 pt-1 text-[10px] uppercase tracking-wide text-alloy-forge/45">
                            {group.label}
                        </p>
                    ) : null}
                    {group.sections.map((s) => (
                        <ConfigurationQueueItem
                            key={s.key}
                            active={s.key === section}
                            title={s.label}
                            onClick={() => setSection(s.key)}
                            testId={`financials-section-${s.key}`}
                        />
                    ))}
                </div>
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
                                subtitle={`${describeScopeWithLabel(working, labelFor)} · ${working.currency_code} · ${rows.length} version${rows.length === 1 ? "" : "s"}`}
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
                        This is how your organization gets paid. Configure the <strong>Services</strong> you sell, the
                        <strong> Rate Plans</strong> that price them, the <strong>Policies</strong> and{" "}
                        <strong>Charge Templates</strong> that shape charges, and how it all <strong>posts</strong>.
                        Billing, Scheduling, Attendance, Posting, Payments, and Subsidy all resolve from this configuration.
                    </ConfigReadonlyNotice>
                    <ConfigurationDetailCard title="Configured today">
                        <ConfigFieldGrid>
                            <ConfigField label="Rate plans" value={planLineages.length} />
                            <ConfigField label="Rate rules" value={rateRules.length} />
                            <ConfigField label="GL accounts" value={glAccounts.length} />
                            <ConfigField label="GL mappings" value={glAccountMappings.length} />
                        </ConfigFieldGrid>
                    </ConfigurationDetailCard>
                    {canMutate ? (
                        <ConfigurationDetailCard title="Demo data" testId="financials-overview-seed">
                            <p className="config-typo-sublabel mb-2 text-alloy-forge/70">
                                Load a representative set of services, rate plans (with historical, current, and future
                                versions), and GL accounts so every screen is QA-ready. Idempotent — safe to re-run.
                            </p>
                            <ConfigurationPrimaryButton
                                className="config-primary-btn--sm"
                                onClick={() => void loadDemoData()}
                                disabled={seeding}
                                data-testid="financials-overview-seed-btn"
                            >
                                {seeding ? "Loading…" : "Load demo data"}
                            </ConfigurationPrimaryButton>
                            {seedMsg ? (
                                <p className="config-typo-sublabel mt-2 text-alloy-forge/70" data-testid="financials-overview-seed-msg">
                                    {seedMsg}
                                </p>
                            ) : null}
                        </ConfigurationDetailCard>
                    ) : null}
                </div>
            );
        }
        if (section === "services") {
            return <ServicesConfigurationPanel canMutate={canMutate} />;
        }
        if (section === "financial_policies") {
            return <FinancialPoliciesArea />;
        }
        if (section === "charge_templates") {
            return <ChargeTemplatesArea />;
        }
        if (section === "accounting") {
            return <AccountingConfigurationPanel glAccounts={glAccounts} glAccountMappings={glAccountMappings} />;
        }
        if (section === "posting") {
            return <PostingConfigurationArea />;
        }
        if (section === "payments") {
            return <PaymentsConfigurationArea />;
        }
        if (section === "financial_responsibility") {
            return <FinancialResponsibilityArea />;
        }
        if (section === "subsidy") {
            return <SubsidyConfigurationArea />;
        }
        if (section === "charge_preview") {
            return <FinancialChargePreviewInspector />;
        }
        if (section === "rate_plans") {
            if (creatingPlan) {
                return (
                    <CreateRatePlanForm
                        busy={authoring.busy}
                        scopeOptions={scopeOptions}
                        ageGroupOptions={ageGroupOptions}
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
                    labelFor={labelFor}
                />
            );
        }
        return (
            <ConfigurationEmptyState testId="financials-unknown-section" title="Select a section" description="Choose a financials configuration area." />
        );
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
