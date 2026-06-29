"use client";

import { useMemo, type ReactNode } from "react";
import type {
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
} from "@/lib/financials/rates/rateTypes";
import {
    BILLING_BASES,
    BILLING_CADENCES,
    CALCULATION_STRATEGIES,
    PRORATION_METHODS,
    RATE_BASES,
    SCHEDULE_BASES,
} from "@/lib/financials/rates/rateTypes";
import { resolveRateRule } from "@/lib/financials/rates/resolveRate";
import {
    currentVersionId,
    type EffectiveDatedVersionRow,
} from "@/lib/adminV2/operationalConfig/effectiveDatedVersioning";
import {
    describeScopeWithLabel,
    formatCurrencyCents,
    isScopeOverride,
} from "@/lib/adminV2/operationalConfig/configReadPresentation";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigField,
    ConfigFieldGrid,
    ConfigScopeBadge,
} from "@/components/adminV2/settings/configurationRuntime/ConfigReadonlyPrimitives";
import {
    EffectiveDatedConfigurationEditor,
    type EditorField,
} from "@/components/adminV2/settings/configurationRuntime/EffectiveDatedConfigurationEditor";
import type { RateAuthoring } from "@/components/adminV2/settings/financials/useRateAuthoring";

/**
 * Rate plan authoring workspace (Operational Configuration V1, Batch 1).
 *
 * Hosts the read + versioned authoring experience for one rate plan lineage:
 *   - Plan version timeline + "Create future version" / Retire / Void
 *   - Nested rate-rule authoring (one timeline per schedule basis) + add-rule
 *   - Resolved-rate preview (what wins today) using the authoritative resolver
 *
 * Both the plan editor and each rule editor are the SAME shared
 * EffectiveDatedConfigurationEditor primitive — one versioning UX, reused.
 */

function humanize(value: string): string {
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toOptions(values: readonly string[]): { value: string; label: string }[] {
    return values.map((v) => ({ value: v, label: humanize(v) }));
}

function dollarsToCents(value: string): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(n * 100);
}

function centsToDollars(cents: number): string {
    return (cents / 100).toFixed(2);
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

function ruleLineageKey(r: ChildcareRateRuleRow): string {
    return [r.schedule_basis, r.age_group_key ?? ""].join("::");
}

/** Latest-effective version of a lineage (fallback when nothing is current today). */
function pickWorkingVersion<T extends EffectiveDatedVersionRow>(lineage: T[], todayYmd: string): T | null {
    if (lineage.length === 0) return null;
    const currentId = currentVersionId(lineage, todayYmd);
    if (currentId) return lineage.find((r) => r.id === currentId) ?? null;
    return [...lineage].sort((a, b) => (a.effective_start < b.effective_start ? 1 : -1))[0] ?? null;
}

export default function RatePlanAuthoringWorkspace({
    plan,
    ratePlans,
    rateRules,
    todayYmd,
    canMutate,
    authoring,
    labelFor,
}: {
    plan: ChildcareRatePlanRow | null;
    ratePlans: ChildcareRatePlanRow[];
    rateRules: ChildcareRateRuleRow[];
    todayYmd: string;
    canMutate: boolean;
    authoring: RateAuthoring;
    /** Resolve a scope-target id to a human label (Phase 4); identity if absent. */
    labelFor?: (id: string) => string | undefined;
}) {
    const scopeLabel = (p: ChildcareRatePlanRow): string =>
        describeScopeWithLabel(p, labelFor ?? (() => undefined));
    const planLineage = useMemo(
        () => (plan ? ratePlans.filter((p) => planLineageKey(p) === planLineageKey(plan)) : []),
        [plan, ratePlans],
    );
    const workingPlan = useMemo(() => pickWorkingVersion(planLineage, todayYmd), [planLineage, todayYmd]);

    const planRules = useMemo(
        () => (workingPlan ? rateRules.filter((r) => r.rate_plan_id === workingPlan.id) : []),
        [workingPlan, rateRules],
    );

    const ruleLineages = useMemo(() => {
        const groups = new Map<string, ChildcareRateRuleRow[]>();
        for (const r of planRules) {
            const key = ruleLineageKey(r);
            const list = groups.get(key) ?? [];
            list.push(r);
            groups.set(key, list);
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [planRules]);

    if (!plan || !workingPlan) {
        return (
            <ConfigurationEmptyState
                testId="financials-rate-plan-empty"
                title="Select a rate plan"
                description="Choose a rate plan to view and author its versions, rate rules, and resolved rate."
            />
        );
    }

    const currency = workingPlan.currency_code;

    // ---- Resolved-rate preview (authoritative resolver) -------------------
    const resolvedPreview: ReactNode = (
        <div className="rounded-md border border-alloy-stone/30 bg-white px-3 py-2" data-testid="financials-resolved-preview">
            <p className="config-typo-sublabel mb-1 text-alloy-forge/60">Resolved on {todayYmd} (current version)</p>
            {ruleLineages.length === 0 ? (
                <p className="config-typo-sublabel text-alloy-forge/50">No rate rules to resolve yet.</p>
            ) : (
                <ul className="space-y-0.5">
                    {ruleLineages.map(([key, rows]) => {
                        const sample = rows[0];
                        const resolved = resolveRateRule(
                            planRules,
                            workingPlan.id,
                            { scheduleBasis: sample.schedule_basis, ageGroupKey: sample.age_group_key },
                            todayYmd,
                        );
                        return (
                            <li key={key} className="flex items-center justify-between gap-3 text-[13px]">
                                <span className="text-alloy-forge/70">
                                    {humanize(sample.schedule_basis)}
                                    {sample.age_group_key ? ` · ${sample.age_group_key}` : ""}
                                </span>
                                <span className="text-alloy-midnight">
                                    {resolved
                                        ? `${formatCurrencyCents(resolved.amount_cents, currency)} / ${resolved.rate_basis}`
                                        : "— no rate"}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );

    // ---- Plan-level editor -------------------------------------------------
    const planFields: EditorField[] = [
        { key: "label", label: "Label", type: "text", defaultValue: workingPlan.label ?? "" },
        { key: "currency_code", label: "Currency", type: "text", defaultValue: workingPlan.currency_code },
        { key: "billing_basis", label: "Billing basis", type: "select", options: toOptions(BILLING_BASES), defaultValue: workingPlan.billing_basis },
        {
            key: "calculation_strategy",
            label: "Calc strategy",
            type: "select",
            options: toOptions(CALCULATION_STRATEGIES),
            defaultValue: workingPlan.calculation_strategy,
        },
        {
            key: "proration_method",
            label: "Proration",
            type: "select",
            options: [{ value: "", label: "—" }, ...toOptions(PRORATION_METHODS)],
            defaultValue: workingPlan.proration_method ?? "",
        },
        {
            key: "billing_cadence",
            label: "Billing cadence",
            type: "select",
            options: [{ value: "", label: "—" }, ...toOptions(BILLING_CADENCES)],
            defaultValue: workingPlan.billing_cadence ?? "",
        },
    ];

    // ---- New-rule editor (empty lineage) ----------------------------------
    const newRuleFields: EditorField[] = [
        { key: "schedule_basis", label: "Schedule basis", type: "select", options: toOptions(SCHEDULE_BASES) },
        { key: "rate_basis", label: "Rate basis", type: "select", options: toOptions(RATE_BASES) },
        { key: "amount", label: `Amount (${currency})`, type: "money", placeholder: "0.00", required: true },
        { key: "age_group_key", label: "Age group (optional)", type: "text", placeholder: "All ages" },
    ];

    return (
        <div className="space-y-3" data-testid="financials-rate-plan-authoring">
            <ConfigurationDetailCard testId="financials-rate-plan-summary">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="config-typo-workspace-title mr-1">{(plan.label ?? "").trim() || plan.plan_key}</h2>
                    <ConfigScopeBadge label={scopeLabel(plan)} override={isScopeOverride(plan)} />
                </div>
                <ConfigFieldGrid>
                    <ConfigField label="Plan key" value={plan.plan_key} />
                    <ConfigField label="Scope" value={scopeLabel(plan)} />
                    <ConfigField label="Currency" value={currency} />
                    <ConfigField label="Billing basis" value={workingPlan.billing_basis} />
                    <ConfigField label="Calculation strategy" value={workingPlan.calculation_strategy} />
                    <ConfigField label="Proration" value={workingPlan.proration_method ?? "—"} />
                    <ConfigField label="Billing cadence" value={workingPlan.billing_cadence ?? "—"} />
                    <ConfigField label="Age group" value={plan.age_group_key ?? "All"} />
                </ConfigFieldGrid>
            </ConfigurationDetailCard>

            <EffectiveDatedConfigurationEditor<ChildcareRatePlanRow>
                title="Plan versions"
                versions={planLineage}
                todayYmd={todayYmd}
                fields={planFields}
                canMutate={canMutate}
                busy={authoring.busy}
                testIdPrefix="rate-plan"
                resolvedPreview={resolvedPreview}
                renderVersionSummary={(row) => (
                    <span>
                        {(row.label ?? "").trim() || row.plan_key} · {row.currency_code} · {humanize(row.billing_basis)} ·{" "}
                        {humanize(row.calculation_strategy)}
                    </span>
                )}
                onCreateVersion={async ({ effectiveStart, fields }) => {
                    await authoring.versionPlan({
                        prior_plan_id: workingPlan.id,
                        effective_start: effectiveStart,
                        label: fields.label,
                        currency_code: fields.currency_code,
                        billing_basis: fields.billing_basis,
                        calculation_strategy: fields.calculation_strategy,
                        proration_method: fields.proration_method || null,
                        billing_cadence: fields.billing_cadence || null,
                    });
                }}
                onRetire={async ({ effectiveEnd }) => {
                    await authoring.retirePlan({ plan_id: workingPlan.id, effective_end: effectiveEnd });
                }}
                onVoid={async (row) => {
                    await authoring.voidPlan(row.id);
                }}
            />

            {/* Existing rate-rule lineages */}
            {ruleLineages.map(([key, rows]) => {
                const working = pickWorkingVersion(rows, todayYmd)!;
                const ruleFields: EditorField[] = [
                    { key: "amount", label: `Amount (${currency})`, type: "money", defaultValue: centsToDollars(working.amount_cents), required: true },
                    { key: "rate_basis", label: "Rate basis", type: "select", options: toOptions(RATE_BASES), defaultValue: working.rate_basis },
                ];
                const title = `Rate rule · ${humanize(working.schedule_basis)}${working.age_group_key ? ` · ${working.age_group_key}` : ""}`;
                return (
                    <EffectiveDatedConfigurationEditor<ChildcareRateRuleRow>
                        key={key}
                        title={title}
                        versions={rows}
                        todayYmd={todayYmd}
                        fields={ruleFields}
                        canMutate={canMutate}
                        busy={authoring.busy}
                        testIdPrefix={`rate-rule-${working.schedule_basis}`}
                        renderVersionSummary={(row) => (
                            <span>
                                {formatCurrencyCents(row.amount_cents, currency)}{" "}
                                <span className="text-alloy-forge/60">/ {row.rate_basis}</span>
                            </span>
                        )}
                        onCreateVersion={async ({ effectiveStart, fields }) => {
                            const cents = dollarsToCents(fields.amount);
                            if (!Number.isInteger(cents) || cents < 0) throw new Error("Amount must be a non-negative number");
                            await authoring.versionRule({
                                prior_rule_id: working.id,
                                effective_start: effectiveStart,
                                amount_cents: cents,
                                rate_basis: fields.rate_basis,
                            });
                        }}
                        onRetire={async ({ effectiveEnd }) => {
                            await authoring.retireRule({ rule_id: working.id, effective_end: effectiveEnd });
                        }}
                        onVoid={async (row) => {
                            await authoring.voidRule(row.id);
                        }}
                    />
                );
            })}

            {/* Add a brand-new rate rule (empty lineage reuses the same editor) */}
            {canMutate ? (
                <EffectiveDatedConfigurationEditor<ChildcareRateRuleRow>
                    title="Add rate rule"
                    versions={[]}
                    todayYmd={todayYmd}
                    fields={newRuleFields}
                    canMutate={canMutate}
                    busy={authoring.busy}
                    emptyCreateLabel="Add rate rule"
                    testIdPrefix="rate-rule-new"
                    renderVersionSummary={() => null}
                    onCreateVersion={async ({ effectiveStart, fields }) => {
                        const cents = dollarsToCents(fields.amount);
                        if (!Number.isInteger(cents) || cents < 0) throw new Error("Amount must be a non-negative number");
                        await authoring.createRule({
                            rate_plan_id: workingPlan.id,
                            schedule_basis: fields.schedule_basis,
                            rate_basis: fields.rate_basis,
                            amount_cents: cents,
                            age_group_key: fields.age_group_key?.trim() ? fields.age_group_key.trim() : null,
                            effective_start: effectiveStart,
                        });
                    }}
                    onRetire={async () => undefined}
                    onVoid={async () => undefined}
                />
            ) : null}
        </div>
    );
}
