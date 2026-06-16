"use client";

import {
    STAGE_ATTENTION_RULE_CATALOG,
    catalogEntryForAttentionKind,
    defaultAttentionRuleLabel,
    newAttentionRuleDraft,
    normalizeAttentionRuleKind,
} from "@/lib/lifecycle/stageAttentionRuleCatalog";
import type {
    StageAttentionRuleV1,
    StageAttentionSeverity,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import { BUSINESS_PROCESS_SECTION_ATTENTION_ORG_DEFAULTS_LINK } from "@/lib/lifecycle/businessProcessUiLabels";

type Props = {
    rules: StageAttentionRuleV1[];
    workTemplates: StageWorkTemplateV1[];
    onChange: (rules: StageAttentionRuleV1[]) => void;
    stageLabel: string;
    readOnly?: boolean;
};

const SEVERITY_OPTIONS: StageAttentionSeverity[] = ["low", "medium", "high"];

export default function LifecycleStageAttentionRulesEditor({
    rules,
    workTemplates,
    onChange,
    stageLabel,
    readOnly = false,
}: Props) {
    const updateRule = (index: number, patch: Partial<StageAttentionRuleV1>) => {
        onChange(
            rules.map((rule, i) => {
                if (i !== index) return rule;
                const next = { ...rule, ...patch };
                if (patch.kind) {
                    const entry = catalogEntryForAttentionKind(patch.kind);
                    if (entry && !rule.label?.trim()) next.label = entry.label;
                    if (entry && entry.supportsThreshold && next.threshold == null) {
                        next.threshold = entry.defaultThreshold;
                    }
                }
                return next;
            }),
        );
    };

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-attention-rules-editor">
            <p className="text-[11px] leading-relaxed text-alloy-midnight/60">
                Attention rules for <span className="font-medium">{stageLabel}</span>. Stored on this stage
                operating plan — evaluation wiring is separate from org-wide Needs Attention buckets.
            </p>

            <ul className="space-y-2" data-testid="lifecycle-stage-attention-rule-list">
                {rules.map((rule, index) => {
                    const kind = normalizeAttentionRuleKind(rule.kind);
                    const entry = catalogEntryForAttentionKind(kind);
                    const displayLabel = rule.label?.trim() || defaultAttentionRuleLabel(kind);

                    if (readOnly) {
                        return (
                            <li
                                key={rule.rule_key}
                                className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2 text-[11px] text-alloy-midnight/70"
                            >
                                <span className="font-medium text-alloy-midnight/85">{displayLabel}</span>
                                {rule.severity ?
                                    <span className="ml-2 text-alloy-midnight/50">({rule.severity})</span>
                                :   null}
                                {entry?.supportsThreshold && rule.threshold != null ?
                                    <span className="ml-2 text-alloy-midnight/50">{rule.threshold} days</span>
                                :   null}
                            </li>
                        );
                    }

                    return (
                        <li
                            key={rule.rule_key}
                            className="rounded-lg border border-alloy-forge/12 bg-white p-2.5"
                            data-testid={`stage-attention-rule-${rule.rule_key}`}
                        >
                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="block space-y-0.5">
                                    <span className="text-[10px] font-medium text-alloy-midnight/60">Rule type</span>
                                    <select
                                        className="w-full rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                                        value={kind}
                                        onChange={(e) =>
                                            updateRule(index, {
                                                kind: e.target.value as StageAttentionRuleV1["kind"],
                                            })
                                        }
                                    >
                                        {STAGE_ATTENTION_RULE_CATALOG.map((item) => (
                                            <option key={item.kind} value={item.kind}>
                                                {item.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block space-y-0.5">
                                    <span className="text-[10px] font-medium text-alloy-midnight/60">Label</span>
                                    <input
                                        className="w-full rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                                        value={rule.label ?? ""}
                                        placeholder={defaultAttentionRuleLabel(kind)}
                                        onChange={(e) => updateRule(index, { label: e.target.value })}
                                    />
                                </label>
                                <label className="block space-y-0.5">
                                    <span className="text-[10px] font-medium text-alloy-midnight/60">Severity</span>
                                    <select
                                        className="w-full rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                                        value={rule.severity ?? entry?.defaultSeverity ?? "medium"}
                                        onChange={(e) =>
                                            updateRule(index, {
                                                severity: e.target.value as StageAttentionSeverity,
                                            })
                                        }
                                    >
                                        {SEVERITY_OPTIONS.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {entry?.supportsThreshold ?
                                    <label className="block space-y-0.5">
                                        <span className="text-[10px] font-medium text-alloy-midnight/60">
                                            Days threshold
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            className="w-full rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                                            value={rule.threshold ?? entry.defaultThreshold}
                                            onChange={(e) =>
                                                updateRule(index, {
                                                    threshold: Math.max(0, Number(e.target.value) || 0),
                                                })
                                            }
                                        />
                                    </label>
                                :   null}
                                {kind === "work_overdue" && workTemplates.length ?
                                    <label className="block space-y-0.5 sm:col-span-2">
                                        <span className="text-[10px] font-medium text-alloy-midnight/60">
                                            Work item (optional)
                                        </span>
                                        <select
                                            className="w-full rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                                            value={rule.template_key ?? ""}
                                            onChange={(e) =>
                                                updateRule(index, {
                                                    template_key: e.target.value.trim() || null,
                                                })
                                            }
                                        >
                                            <option value="">Any required work</option>
                                            {workTemplates.map((t) => (
                                                <option key={t.template_key} value={t.template_key}>
                                                    {t.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                :   null}
                            </div>
                            {entry?.description ?
                                <p className="mt-1.5 text-[10px] text-alloy-midnight/45">{entry.description}</p>
                            :   null}
                            <button
                                type="button"
                                className="mt-2 text-[10px] font-medium text-red-700/80"
                                onClick={() => onChange(rules.filter((_, i) => i !== index))}
                            >
                                Remove rule
                            </button>
                        </li>
                    );
                })}
            </ul>

            {!readOnly ?
                <button
                    type="button"
                    className="text-[10px] font-medium text-alloy-pine"
                    onClick={() =>
                        onChange([...rules, newAttentionRuleDraft(rules.length, "work_overdue")])
                    }
                    data-testid="stage-attention-add-rule"
                >
                    + Add attention rule
                </button>
            :   null}

            {!rules.length ?
                <p className="text-[11px] text-alloy-midnight/50">No attention rules configured for this stage.</p>
            :   null}

            <div className="text-[11px]">
                <AdminV2NavLink
                    href="/admin/settings/attention-sla-rules"
                    className="font-medium text-alloy-pine hover:underline"
                >
                    {BUSINESS_PROCESS_SECTION_ATTENTION_ORG_DEFAULTS_LINK}
                </AdminV2NavLink>
            </div>
        </div>
    );
}
