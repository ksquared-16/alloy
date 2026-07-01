"use client";

import { useMemo, useState } from "react";
import {
    FINANCIAL_POLICY_TYPES,
    POLICY_SCOPE_LABEL,
    POLICY_TYPE_REGISTRY,
    policyValueSummary,
    type FinancialPolicyRow,
} from "@/lib/financials/policies/financialPolicyTypes";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { currentVersionId, type EffectiveDatedVersionRow } from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigReadonlyNotice } from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import {
    EffectiveDatedConfigurationEditor,
    type EditorField,
} from "@/components/adminV2/settings/configurationRuntime/EffectiveDatedConfigurationEditor";
import { useFinancialPolicies } from "@/components/adminV2/settings/financials/useFinancialPolicies";
import CreateFinancialPolicyForm, {
    buildPolicyValue,
    type Option,
} from "@/components/adminV2/settings/financials/CreateFinancialPolicyForm";

/**
 * Financial Policies configuration (Commercial Model, Slice C). Scoped,
 * effective-dated rules (proration, cadence, fees, deposits, refunds, posting
 * review) resolved most-specific-wins. Real authoring via the shared editor
 * (version timeline + supersede / retire / void) + a resolved preview. No
 * drawers, no IDs. Configuration only — policies post no money.
 */

const YES_NO = [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }];

function pickWorking<T extends EffectiveDatedVersionRow>(lineage: T[], todayYmd: string): T {
    const currentId = currentVersionId(lineage, todayYmd);
    return lineage.find((r) => r.id === currentId) ?? [...lineage].sort((a, b) => (a.effective_start < b.effective_start ? 1 : -1))[0];
}

function lineageKey(p: FinancialPolicyRow): string {
    return [p.policy_type, p.scope_type, p.location_id ?? "", p.service_id ?? "", p.rate_plan_id ?? ""].join("|");
}

export default function FinancialPoliciesConfigurationPanel({
    canMutate,
    todayYmd,
    locationOptions,
    serviceOptions,
    ratePlanOptions,
    labelFor,
}: {
    canMutate: boolean;
    todayYmd: string;
    locationOptions: Option[];
    serviceOptions: Option[];
    ratePlanOptions: Option[];
    /** Resolve a scope-target id (location/service/rate plan) to a label. */
    labelFor: (id: string) => string | undefined;
}) {
    const { policies, loading, error, busy, createPolicy, versionPolicy, retirePolicy, voidPolicy } = useFinancialPolicies();
    const [creating, setCreating] = useState(false);

    const lineages = useMemo(() => {
        const groups = new Map<string, FinancialPolicyRow[]>();
        for (const p of policies) {
            const key = lineageKey(p);
            const list = groups.get(key) ?? [];
            list.push(p);
            groups.set(key, list);
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [policies]);

    function describeScope(p: FinancialPolicyRow): string {
        if (p.scope_type === "org") return "Org default";
        const id = p.location_id ?? p.service_id ?? p.rate_plan_id ?? "";
        return `${POLICY_SCOPE_LABEL[p.scope_type]}: ${labelFor(id) ?? "—"}`;
    }

    function valueFields(p: FinancialPolicyRow): EditorField[] {
        return POLICY_TYPE_REGISTRY[p.policy_type].fields.map((f) => {
            const raw = p.value[f.key];
            if (f.control === "select") return { key: f.key, label: f.label, type: "select", options: f.options ?? [], defaultValue: String(raw ?? "") };
            if (f.control === "yesno") return { key: f.key, label: f.label, type: "select", options: YES_NO, defaultValue: raw ? "yes" : "no" };
            if (f.control === "money") return { key: f.key, label: f.label, type: "money", defaultValue: raw != null ? (Number(raw) / 100).toFixed(2) : "" };
            return { key: f.key, label: `${f.label}${f.suffix ? ` (${f.suffix})` : ""}`, type: "number", defaultValue: raw != null ? String(raw) : "" };
        });
    }

    // Resolved-at-org preview per policy type (most-specific-wins).
    const resolvedPreview = (
        <ConfigurationDetailCard title="Resolved (org default)" testId="financials-policies-resolved">
            <p className="config-typo-sublabel mb-2 text-alloy-forge/60">
                What resolves at org scope today. A more specific Location / Service / Rate Plan policy overrides it.
            </p>
            <ul className="space-y-0.5">
                {FINANCIAL_POLICY_TYPES.map((t) => {
                    const r = resolveFinancialPolicy(policies, t, {}, todayYmd);
                    return (
                        <li key={t} className="flex items-center justify-between gap-3 text-[13px]" data-testid={`financials-policies-resolved-${t}`}>
                            <span className="text-alloy-forge/70">{POLICY_TYPE_REGISTRY[t].label}</span>
                            <span className="text-alloy-midnight">
                                {r.resolved ? (
                                    <>
                                        {policyValueSummary(t, r.policy.value)}{" "}
                                        <span className="text-alloy-forge/55">({r.sourceScopeLabel})</span>
                                    </>
                                ) : (
                                    <span className="text-amber-700">no policy — fallback</span>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </ConfigurationDetailCard>
    );

    return (
        <div className="space-y-3" data-testid="financials-policies">
            <ConfigurationContext
                title="Financial Policies"
                subtitle="How should the organization handle money rules — proration, fees, refunds, deposits?"
                testId="financials-policies-context"
                actions={
                    canMutate && !creating ? (
                        <ConfigurationPrimaryButton onClick={() => setCreating(true)} data-testid="financials-policies-add">
                            New policy
                        </ConfigurationPrimaryButton>
                    ) : undefined
                }
            />
            <ConfigReadonlyNotice testId="financials-policies-notice">
                Policies are scoped, effective-dated configuration. They are consumed later by resolution and posting, but
                configuring a policy does not post money.
            </ConfigReadonlyNotice>

            {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            ) : null}

            {canMutate && creating ? (
                <CreateFinancialPolicyForm
                    busy={busy}
                    locationOptions={locationOptions}
                    serviceOptions={serviceOptions}
                    ratePlanOptions={ratePlanOptions}
                    onCancel={() => setCreating(false)}
                    onCreate={async (payload) => {
                        await createPolicy(payload);
                        setCreating(false);
                    }}
                />
            ) : null}

            {loading ? (
                <ConfigurationEmptyState testId="financials-policies-loading" title="Loading policies" description="Fetching financial policies." />
            ) : (
                <>
                    {resolvedPreview}

                    {lineages.length === 0 && !canMutate ? (
                        <ConfigurationEmptyState
                            testId="financials-policies-empty"
                            title="No policies yet"
                            description="Add financial policies — proration, billing cadence, grace period, late fee, deposit, refund…"
                        />
                    ) : null}

                    {lineages.map(([key, rows], idx) => {
                        const working = pickWorking(rows, todayYmd);
                        return (
                            <EffectiveDatedConfigurationEditor<FinancialPolicyRow>
                                key={key}
                                title={`${POLICY_TYPE_REGISTRY[working.policy_type].label} · ${describeScope(working)}`}
                                versions={rows}
                                todayYmd={todayYmd}
                                fields={valueFields(working)}
                                canMutate={canMutate}
                                busy={busy}
                                testIdPrefix={`policy-${idx}`}
                                renderVersionSummary={(row) => <span>{policyValueSummary(row.policy_type, row.value)}</span>}
                                onCreateVersion={({ effectiveStart, fields }) =>
                                    versionPolicy({ prior_id: working.id, effective_start: effectiveStart, value: buildPolicyValue(working.policy_type, fields) })
                                }
                                onRetire={({ effectiveEnd }) => retirePolicy({ id: working.id, effective_end: effectiveEnd })}
                                onVoid={(row) => voidPolicy(row.id)}
                            />
                        );
                    })}
                </>
            )}
        </div>
    );
}
