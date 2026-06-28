"use client";

import type { ReactNode } from "react";
import type {
    ChildcareCapacityRuleRow,
    ChildcareOperatingWindowRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
    ChildcareScheduleRuleRow,
} from "@/lib/childcareOperational/config/configRuleTypes";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigEffectiveBadge,
    ConfigReadonlyNotice,
    ConfigScopeBadge,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import {
    classifyEffectiveStatus,
    describeScope,
    EFFECTIVE_STATUS_LABEL,
    formatEffectiveRange,
    isScopeOverride,
    sortByEffectiveStatus,
} from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { resolveConfigRule } from "@/lib/childcareOperational/config/resolveConfigRule";
import { useLocationOperationalRules } from "@/components/adminV2/settings/locations/useLocationOperationalRules";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

type RuleRowBase = Parameters<typeof describeScope>[0] & { id: string };

function RuleListCard<T extends RuleRowBase & { effective_start: string; effective_end: string | null }>({
    title,
    testId,
    rules,
    today,
    renderValue,
    emptyCopy,
}: {
    title: string;
    testId: string;
    rules: T[];
    today: string;
    renderValue: (rule: T) => ReactNode;
    emptyCopy: string;
}) {
    const sorted = sortByEffectiveStatus(rules, today);
    return (
        <ConfigurationDetailCard testId={testId} title={`${title} (${rules.length})`}>
            {sorted.length === 0 ?
                <p className="config-typo-sublabel" data-testid={`${testId}-empty`}>
                    {emptyCopy}
                </p>
            :   <ul className="divide-y divide-alloy-stone/30">
                    {sorted.map((rule) => {
                        const status = classifyEffectiveStatus(rule, today);
                        return (
                            <li
                                key={rule.id}
                                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                                data-testid={`${testId}-row-${rule.id}`}
                            >
                                <div className="min-w-0">
                                    <p className="config-typo-field-value text-alloy-midnight">{renderValue(rule)}</p>
                                    <p className="config-typo-sublabel text-alloy-forge/60">
                                        {formatEffectiveRange(rule)}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <ConfigScopeBadge label={describeScope(rule)} override={isScopeOverride(rule)} />
                                    <ConfigEffectiveBadge status={status} label={EFFECTIVE_STATUS_LABEL[status]} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }
        </ConfigurationDetailCard>
    );
}

function ResolvedPreviewCard({
    sites,
    capacityRules,
    ratioRules,
    today,
}: {
    sites: { id: string; label: string }[];
    capacityRules: ChildcareCapacityRuleRow[];
    ratioRules: ChildcareRatioRuleRow[];
    today: string;
}) {
    if (sites.length === 0) return null;
    return (
        <ConfigurationDetailCard testId="locations-operational-resolved" title="Resolved per location">
            <p className="config-typo-sublabel mb-2 text-alloy-forge/60">
                Most-specific-wins: Room override → Program override → Location override → Org default.
            </p>
            <ul className="divide-y divide-alloy-stone/30">
                {sites.map((site) => {
                    const ctx = { siteLocationId: site.id };
                    const capacity = resolveConfigRule(capacityRules, ctx, today);
                    const ratio = resolveConfigRule(ratioRules, ctx, today);
                    return (
                        <li key={site.id} className="py-2.5" data-testid={`locations-operational-resolved-${site.id}`}>
                            <p className="config-typo-field-value text-alloy-midnight">{site.label}</p>
                            <p className="config-typo-sublabel text-alloy-forge/70">
                                Capacity:{" "}
                                {capacity ?
                                    `${capacity.capacity} (${describeScope(capacity)})`
                                :   "no rule"}{" "}
                                · Ratio:{" "}
                                {ratio ? describeScope(ratio) : "no rule"}
                            </p>
                        </li>
                    );
                })}
            </ul>
        </ConfigurationDetailCard>
    );
}

function ratioTierSummary(rule: ChildcareRatioRuleRow, tiers: ChildcareRatioRuleTierRow[]): string {
    const ruleTiers = tiers.filter((t) => t.ratio_rule_id === rule.id).sort((a, b) => a.sort_order - b.sort_order);
    if (ruleTiers.length === 0) return "No tiers";
    return ruleTiers.map((t) => `1:${t.required_staff} ≤ ${t.max_children}`).join(", ");
}

/**
 * Read-only operational configuration rules for the Locations workspace
 * (Batch 0): Capacity, Ratio + Tiers, Operating Windows, Schedule Rules, plus a
 * resolved-per-location inheritance preview. No write affordance.
 */
export default function LocationOperationalRulesPanel({
    siteLabelById,
}: {
    siteLabelById: Map<string, string>;
}) {
    const today = todayYmd();
    const {
        loading,
        error,
        capacityRules,
        ratioRules,
        ratioRuleTiers,
        operatingWindows,
        scheduleRules,
    } = useLocationOperationalRules();

    const sites = Array.from(siteLabelById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (loading) {
        return (
            <ConfigurationEmptyState
                testId="locations-operational-loading"
                title="Loading operational rules"
                description="Fetching capacity, ratio, operating window, and schedule rules."
            />
        );
    }

    return (
        <div className="space-y-3" data-testid="locations-operational-rules">
            <ConfigReadonlyNotice testId="locations-operational-notice">
                Operational rules are versioned, effective-dated configuration. V1 is read-only — authoring with
                supersede/change-later versioning is a later batch.
            </ConfigReadonlyNotice>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <ResolvedPreviewCard
                sites={sites}
                capacityRules={capacityRules}
                ratioRules={ratioRules}
                today={today}
            />

            <RuleListCard
                title="Capacity Rules"
                testId="locations-capacity-rules"
                rules={capacityRules}
                today={today}
                emptyCopy="No capacity rules configured."
                renderValue={(rule) => (
                    <>
                        Capacity {rule.capacity}{" "}
                        <span className="text-alloy-forge/60">
                            · {rule.capacity_kind}
                            {rule.age_group_key ? ` · Age ${rule.age_group_key}` : ""}
                        </span>
                    </>
                )}
            />

            <RuleListCard
                title="Ratio Rules"
                testId="locations-ratio-rules"
                rules={ratioRules}
                today={today}
                emptyCopy="No ratio rules configured."
                renderValue={(rule) => (
                    <>
                        {ratioTierSummary(rule, ratioRuleTiers)}
                        {rule.age_group_key ?
                            <span className="text-alloy-forge/60"> · Age {rule.age_group_key}</span>
                        :   null}
                    </>
                )}
            />

            <RuleListCard
                title="Operating Windows"
                testId="locations-operating-windows"
                rules={operatingWindows}
                today={today}
                emptyCopy="No operating windows configured."
                renderValue={(rule: ChildcareOperatingWindowRow) => (
                    <>
                        {WEEKDAYS[rule.weekday] ?? `Day ${rule.weekday}`}{" "}
                        <span className="text-alloy-forge/60">
                            {rule.open_time}–{rule.close_time}
                        </span>
                    </>
                )}
            />

            <RuleListCard
                title="Schedule Rules"
                testId="locations-schedule-rules"
                rules={scheduleRules}
                today={today}
                emptyCopy="No schedule eligibility rules configured."
                renderValue={(rule: ChildcareScheduleRuleRow) => (
                    <>
                        {rule.eligible_schedule_type_keys?.length ?
                            rule.eligible_schedule_type_keys.join(", ")
                        :   "All schedule types"}
                        {rule.min_days_per_week != null || rule.max_days_per_week != null ?
                            <span className="text-alloy-forge/60">
                                {" "}
                                · {rule.min_days_per_week ?? 0}–{rule.max_days_per_week ?? "∞"} days/wk
                            </span>
                        :   null}
                    </>
                )}
            />
        </div>
    );
}
