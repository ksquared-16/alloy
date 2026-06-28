"use client";

import type {
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
} from "@/lib/financials/rates/rateTypes";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEffectiveBadge,
    ConfigField,
    ConfigFieldGrid,
    ConfigScopeBadge,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import {
    classifyEffectiveStatus,
    describeScope,
    EFFECTIVE_STATUS_LABEL,
    formatCurrencyCents,
    formatEffectiveRange,
    isScopeOverride,
    sortByEffectiveStatus,
} from "@/lib/adminV2/operationalConfig/configReadPresentation";

function planTitle(plan: ChildcareRatePlanRow): string {
    return (plan.label ?? "").trim() || plan.plan_key;
}

export default function RatePlanDetailPanel({
    plan,
    rules,
    todayYmd,
}: {
    plan: ChildcareRatePlanRow | null;
    rules: ChildcareRateRuleRow[];
    todayYmd: string;
}) {
    if (!plan) {
        return (
            <ConfigurationEmptyState
                testId="financials-rate-plan-empty"
                title="Select a rate plan"
                description="Choose a rate plan to view its scope, effective dates, billing basis, and rate rules."
            />
        );
    }

    const planStatus = classifyEffectiveStatus(plan, todayYmd);
    const planRules = sortByEffectiveStatus(
        rules.filter((r) => r.rate_plan_id === plan.id),
        todayYmd,
    );

    return (
        <div className="space-y-3" data-testid="financials-rate-plan-detail">
            <ConfigurationDetailCard testId="financials-rate-plan-summary">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="config-typo-workspace-title mr-1">{planTitle(plan)}</h2>
                    <ConfigEffectiveBadge status={planStatus} label={EFFECTIVE_STATUS_LABEL[planStatus]} />
                    <ConfigScopeBadge label={describeScope(plan)} override={isScopeOverride(plan)} />
                    {!plan.is_active ?
                        <ConfigScopeBadge label="Inactive" override={false} />
                    :   null}
                </div>
                <ConfigFieldGrid>
                    <ConfigField label="Plan key" value={plan.plan_key} />
                    <ConfigField label="Scope" value={describeScope(plan)} />
                    <ConfigField label="Currency" value={plan.currency_code} />
                    <ConfigField label="Billing basis" value={plan.billing_basis} />
                    <ConfigField label="Calculation strategy" value={plan.calculation_strategy} />
                    <ConfigField label="Age group" value={plan.age_group_key ?? "All"} />
                    <ConfigField label="Effective" value={formatEffectiveRange(plan)} />
                    <ConfigField label="Status" value={EFFECTIVE_STATUS_LABEL[planStatus]} />
                    <ConfigField label="Active" value={plan.is_active ? "Yes" : "No"} />
                </ConfigFieldGrid>
            </ConfigurationDetailCard>

            <ConfigurationDetailCard testId="financials-rate-rules" title={`Rate Rules (${planRules.length})`}>
                {planRules.length === 0 ?
                    <p className="config-typo-sublabel" data-testid="financials-rate-rules-empty">
                        No rate rules on this plan yet.
                    </p>
                :   <ul className="divide-y divide-alloy-stone/30">
                        {planRules.map((rule) => {
                            const ruleStatus = classifyEffectiveStatus(rule, todayYmd);
                            return (
                                <li
                                    key={rule.id}
                                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                                    data-testid={`financials-rate-rule-${rule.id}`}
                                >
                                    <div className="min-w-0">
                                        <p className="config-typo-field-value text-alloy-midnight">
                                            {rule.schedule_basis} · {formatCurrencyCents(rule.amount_cents, plan.currency_code)}{" "}
                                            <span className="text-alloy-forge/60">/ {rule.rate_basis}</span>
                                        </p>
                                        <p className="config-typo-sublabel text-alloy-forge/60">
                                            {rule.age_group_key ? `Age ${rule.age_group_key} · ` : ""}
                                            {formatEffectiveRange(rule)}
                                        </p>
                                    </div>
                                    <ConfigEffectiveBadge status={ruleStatus} label={EFFECTIVE_STATUS_LABEL[ruleStatus]} />
                                </li>
                            );
                        })}
                    </ul>
                }
            </ConfigurationDetailCard>
        </div>
    );
}
