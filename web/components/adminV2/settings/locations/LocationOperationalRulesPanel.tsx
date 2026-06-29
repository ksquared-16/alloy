"use client";

import type {
    ChildcareCapacityRuleRow,
    ChildcareOperatingWindowRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
    ChildcareScheduleRuleRow,
} from "@/lib/childcareOperational/config/configRuleTypes";
import { CAPACITY_KINDS, CONFIG_RULE_SCOPE_TYPES } from "@/lib/childcareOperational/config/configRuleTypes";
import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { describeScope } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import { resolveConfigRule } from "@/lib/childcareOperational/config/resolveConfigRule";
import type { EditorField } from "@/components/adminV2/settings/configurationRuntime/EffectiveDatedConfigurationEditor";
import { useLocationOperationalRules } from "@/components/adminV2/settings/locations/useLocationOperationalRules";
import { useLocationRuleAuthoring } from "@/components/adminV2/settings/locations/useLocationRuleAuthoring";
import {
    ConfigRuleAuthoringGroup,
    type CreateValues,
} from "@/components/adminV2/settings/locations/ConfigRuleAuthoringGroup";
import {
    buildRatioTierExtraForm,
    tierDraftsToPayload,
    type TierDraft,
} from "@/components/adminV2/settings/locations/RatioTierFields";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

function humanize(value: string): string {
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function scopeKey(r: {
    scope_type: string;
    site_location_id: string | null;
    program_category_id: string | null;
    room_location_id: string | null;
}): string {
    return [r.scope_type, r.site_location_id ?? "", r.program_category_id ?? "", r.room_location_id ?? ""].join("|");
}

const SCOPE_OPTIONS = CONFIG_RULE_SCOPE_TYPES.map((s) => ({ value: s, label: humanize(s) }));
const SCOPE_TARGET_FIELD: Record<string, string | null> = {
    org: null,
    site: "site_location_id",
    program: "program_category_id",
    room: "room_location_id",
};

/** Common add-form scope fields (scope_type + a generic target ID for non-org). */
const SCOPE_ADD_FIELDS: EditorField[] = [
    { key: "scope_type", label: "Scope", type: "select", options: SCOPE_OPTIONS, defaultValue: "org" },
    { key: "scope_target_id", label: "Scope target ID (site/program/room)", type: "text", placeholder: "UUID — leave blank for org" },
];

/** Map the add-form scope fields onto the scoped columns the API expects. */
function mapScope(fields: Record<string, string>): Record<string, unknown> {
    const scopeType = fields.scope_type || "org";
    const out: Record<string, unknown> = { scope_type: scopeType };
    const targetField = SCOPE_TARGET_FIELD[scopeType];
    if (targetField && fields.scope_target_id?.trim()) out[targetField] = fields.scope_target_id.trim();
    return out;
}

function commaToArray(value: string | undefined): string[] | null {
    if (!value?.trim()) return null;
    const out = value.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
    return out.length > 0 ? out : null;
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
                                {capacity ? `${capacity.capacity} (${describeScope(capacity)})` : "no rule"} · Ratio:{" "}
                                {ratio ? describeScope(ratio) : "no rule"}
                            </p>
                        </li>
                    );
                })}
            </ul>
        </ConfigurationDetailCard>
    );
}

/**
 * Operational configuration rules for the Locations workspace. Read display +
 * inline effective-dated authoring (Operational Configuration V1, Phase 3) for
 * Capacity, Ratio + Tiers, Operating Windows, and Schedule/Eligibility rules,
 * each as a version timeline (Current / Scheduled / Superseded / Retired) with
 * supersede / retire / void — no drawers, no in-place overwrite. Plus a
 * resolved-per-location inheritance preview.
 */
export default function LocationOperationalRulesPanel({
    siteLabelById,
    canMutate = false,
}: {
    siteLabelById: Map<string, string>;
    canMutate?: boolean;
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
        refresh,
    } = useLocationOperationalRules();
    const authoring = useLocationRuleAuthoring(refresh);

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

    const tiersFor = (ruleId: string): ChildcareRatioRuleTierRow[] =>
        ratioRuleTiers.filter((t) => t.ratio_rule_id === ruleId).sort((a, b) => a.sort_order - b.sort_order);

    const ratioTierSummary = (rule: ChildcareRatioRuleRow): string => {
        const tiers = tiersFor(rule.id);
        return tiers.length === 0 ? "No tiers" : tiers.map((t) => `1:${t.required_staff} ≤ ${t.max_children}`).join(", ");
    };

    const tierDraftsFor = (rule: ChildcareRatioRuleRow): TierDraft[] =>
        tiersFor(rule.id).map((t) => ({ maxChildren: String(t.max_children), requiredStaff: String(t.required_staff) }));

    return (
        <div className="space-y-4" data-testid="locations-operational-rules">
            <ConfigurationDetailCard testId="locations-operational-notice">
                <p className="config-typo-sublabel text-alloy-forge/75">
                    Operational rules are versioned, effective-dated configuration. Editing creates a new version on a
                    chosen date and closes the prior one — history is preserved and future-dated changes are supported.
                </p>
            </ConfigurationDetailCard>

            {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            ) : null}

            <ResolvedPreviewCard sites={sites} capacityRules={capacityRules} ratioRules={ratioRules} today={today} />

            {/* Capacity */}
            <ConfigRuleAuthoringGroup<ChildcareCapacityRuleRow>
                categoryTitle="Capacity Rules"
                testIdPrefix="locations-capacity-rules"
                rows={capacityRules}
                todayYmd={today}
                canMutate={canMutate}
                busy={authoring.busy}
                lineageKey={(r) => `${scopeKey(r)}|${r.age_group_key ?? ""}|${r.capacity_kind}`}
                lineageTitle={(w) => `Capacity · ${humanize(w.capacity_kind)}${w.age_group_key ? ` · Age ${w.age_group_key}` : ""} · ${describeScope(w)}`}
                versionFields={(w) => [
                    { key: "capacity", label: "Capacity", type: "number", defaultValue: String(w.capacity), required: true },
                ]}
                addFields={[
                    ...SCOPE_ADD_FIELDS,
                    { key: "capacity_kind", label: "Capacity kind", type: "select", options: CAPACITY_KINDS.map((k) => ({ value: k, label: humanize(k) })) },
                    { key: "capacity", label: "Capacity", type: "number", required: true },
                    { key: "age_group_key", label: "Age group (optional)", type: "text", placeholder: "All ages" },
                ]}
                renderVersionSummary={(r) => (
                    <span>
                        Capacity {r.capacity} <span className="text-alloy-forge/60">· {r.capacity_kind}</span>
                    </span>
                )}
                addLabel="Add capacity rule"
                emptyCopy="No capacity rules configured."
                onVersion={(id, v) => authoring.version("capacity", { prior_id: id, effective_start: v.effectiveStart, capacity: Number(v.fields.capacity) })}
                onRetire={(id, end) => authoring.retire("capacity", { id, effective_end: end })}
                onVoid={(id) => authoring.void("capacity", id)}
                onCreate={(v: CreateValues) =>
                    authoring.create("capacity", {
                        ...mapScope(v.fields),
                        capacity_kind: v.fields.capacity_kind,
                        capacity: Number(v.fields.capacity),
                        age_group_key: v.fields.age_group_key?.trim() || null,
                        effective_start: v.effectiveStart,
                    })
                }
            />

            {/* Ratio + tiers */}
            <ConfigRuleAuthoringGroup<ChildcareRatioRuleRow>
                categoryTitle="Ratio Rules"
                testIdPrefix="locations-ratio-rules"
                rows={ratioRules}
                todayYmd={today}
                canMutate={canMutate}
                busy={authoring.busy}
                lineageKey={(r) => `${scopeKey(r)}|${r.age_group_key ?? ""}|${r.jurisdiction_key ?? ""}`}
                lineageTitle={(w) => `Ratio · Age ${w.age_group_key ?? "all"}${w.jurisdiction_key ? ` · ${w.jurisdiction_key}` : ""} · ${describeScope(w)}`}
                versionFields={(w) => [
                    { key: "jurisdiction_key", label: "Jurisdiction (optional)", type: "text", defaultValue: w.jurisdiction_key ?? "" },
                ]}
                addFields={[
                    ...SCOPE_ADD_FIELDS,
                    { key: "age_group_key", label: "Age group (optional)", type: "text", placeholder: "All ages" },
                    { key: "jurisdiction_key", label: "Jurisdiction (optional)", type: "text" },
                ]}
                extraFormFor={(working) => buildRatioTierExtraForm(working ? tierDraftsFor(working) : [])}
                renderVersionSummary={(r) => <span>{ratioTierSummary(r)}</span>}
                addLabel="Add ratio rule"
                emptyCopy="No ratio rules configured."
                onVersion={(id, v) =>
                    authoring.version("ratio", {
                        prior_id: id,
                        effective_start: v.effectiveStart,
                        jurisdiction_key: v.fields.jurisdiction_key?.trim() || null,
                        tiers: tierDraftsToPayload(v.extra),
                    })
                }
                onRetire={(id, end) => authoring.retire("ratio", { id, effective_end: end })}
                onVoid={(id) => authoring.void("ratio", id)}
                onCreate={(v: CreateValues) =>
                    authoring.create("ratio", {
                        ...mapScope(v.fields),
                        age_group_key: v.fields.age_group_key?.trim() || null,
                        jurisdiction_key: v.fields.jurisdiction_key?.trim() || null,
                        tiers: tierDraftsToPayload(v.extra),
                        effective_start: v.effectiveStart,
                    })
                }
            />

            {/* Operating windows */}
            <ConfigRuleAuthoringGroup<ChildcareOperatingWindowRow>
                categoryTitle="Operating Windows"
                testIdPrefix="locations-operating-windows"
                rows={operatingWindows}
                todayYmd={today}
                canMutate={canMutate}
                busy={authoring.busy}
                lineageKey={(r) => `${scopeKey(r)}|${r.weekday}`}
                lineageTitle={(w) => `${WEEKDAYS[w.weekday] ?? `Day ${w.weekday}`} window · ${describeScope(w)}`}
                versionFields={(w) => [
                    { key: "open_time", label: "Open (HH:MM)", type: "text", defaultValue: w.open_time.slice(0, 5), required: true },
                    { key: "close_time", label: "Close (HH:MM)", type: "text", defaultValue: w.close_time.slice(0, 5), required: true },
                ]}
                addFields={[
                    ...SCOPE_ADD_FIELDS,
                    { key: "weekday", label: "Weekday", type: "select", options: WEEKDAYS.map((d, i) => ({ value: String(i), label: d })) },
                    { key: "open_time", label: "Open (HH:MM)", type: "text", placeholder: "08:00", required: true },
                    { key: "close_time", label: "Close (HH:MM)", type: "text", placeholder: "18:00", required: true },
                ]}
                renderVersionSummary={(r) => (
                    <span>
                        {WEEKDAYS[r.weekday] ?? `Day ${r.weekday}`}{" "}
                        <span className="text-alloy-forge/60">
                            {r.open_time.slice(0, 5)}–{r.close_time.slice(0, 5)}
                        </span>
                    </span>
                )}
                addLabel="Add operating window"
                emptyCopy="No operating windows configured."
                onVersion={(id, v) =>
                    authoring.version("operating", { prior_id: id, effective_start: v.effectiveStart, open_time: v.fields.open_time, close_time: v.fields.close_time })
                }
                onRetire={(id, end) => authoring.retire("operating", { id, effective_end: end })}
                onVoid={(id) => authoring.void("operating", id)}
                onCreate={(v: CreateValues) =>
                    authoring.create("operating", {
                        ...mapScope(v.fields),
                        weekday: Number(v.fields.weekday),
                        open_time: v.fields.open_time,
                        close_time: v.fields.close_time,
                        effective_start: v.effectiveStart,
                    })
                }
            />

            {/* Schedule / eligibility */}
            <ConfigRuleAuthoringGroup<ChildcareScheduleRuleRow>
                categoryTitle="Schedule Rules"
                testIdPrefix="locations-schedule-rules"
                rows={scheduleRules}
                todayYmd={today}
                canMutate={canMutate}
                busy={authoring.busy}
                lineageKey={(r) => `${scopeKey(r)}|${r.age_group_key ?? ""}`}
                lineageTitle={(w) => `Schedule eligibility · Age ${w.age_group_key ?? "all"} · ${describeScope(w)}`}
                versionFields={(w) => [
                    { key: "eligible_schedule_type_keys", label: "Eligible schedule types (comma)", type: "text", defaultValue: (w.eligible_schedule_type_keys ?? []).join(", ") },
                    { key: "eligible_age_group_keys", label: "Eligible age groups (comma)", type: "text", defaultValue: (w.eligible_age_group_keys ?? []).join(", ") },
                    { key: "min_days_per_week", label: "Min days/wk", type: "number", defaultValue: w.min_days_per_week != null ? String(w.min_days_per_week) : "" },
                    { key: "max_days_per_week", label: "Max days/wk", type: "number", defaultValue: w.max_days_per_week != null ? String(w.max_days_per_week) : "" },
                ]}
                addFields={[
                    ...SCOPE_ADD_FIELDS,
                    { key: "age_group_key", label: "Age group (optional)", type: "text", placeholder: "All ages" },
                    { key: "eligible_schedule_type_keys", label: "Eligible schedule types (comma)", type: "text", placeholder: "full_time, half_day" },
                    { key: "eligible_age_group_keys", label: "Eligible age groups (comma)", type: "text" },
                    { key: "min_days_per_week", label: "Min days/wk", type: "number" },
                    { key: "max_days_per_week", label: "Max days/wk", type: "number" },
                ]}
                renderVersionSummary={(r) => (
                    <span>
                        {r.eligible_schedule_type_keys?.length ? r.eligible_schedule_type_keys.join(", ") : "All schedule types"}
                        {r.min_days_per_week != null || r.max_days_per_week != null ? (
                            <span className="text-alloy-forge/60">
                                {" "}· {r.min_days_per_week ?? 0}–{r.max_days_per_week ?? "∞"} days/wk
                            </span>
                        ) : null}
                    </span>
                )}
                addLabel="Add schedule rule"
                emptyCopy="No schedule eligibility rules configured."
                onVersion={(id, v) =>
                    authoring.version("schedule", {
                        prior_id: id,
                        effective_start: v.effectiveStart,
                        eligible_schedule_type_keys: commaToArray(v.fields.eligible_schedule_type_keys),
                        eligible_age_group_keys: commaToArray(v.fields.eligible_age_group_keys),
                        min_days_per_week: v.fields.min_days_per_week?.trim() ? Number(v.fields.min_days_per_week) : null,
                        max_days_per_week: v.fields.max_days_per_week?.trim() ? Number(v.fields.max_days_per_week) : null,
                    })
                }
                onRetire={(id, end) => authoring.retire("schedule", { id, effective_end: end })}
                onVoid={(id) => authoring.void("schedule", id)}
                onCreate={(v: CreateValues) =>
                    authoring.create("schedule", {
                        ...mapScope(v.fields),
                        age_group_key: v.fields.age_group_key?.trim() || null,
                        eligible_schedule_type_keys: commaToArray(v.fields.eligible_schedule_type_keys),
                        eligible_age_group_keys: commaToArray(v.fields.eligible_age_group_keys),
                        min_days_per_week: v.fields.min_days_per_week?.trim() ? Number(v.fields.min_days_per_week) : null,
                        max_days_per_week: v.fields.max_days_per_week?.trim() ? Number(v.fields.max_days_per_week) : null,
                        effective_start: v.effectiveStart,
                    })
                }
            />
        </div>
    );
}
