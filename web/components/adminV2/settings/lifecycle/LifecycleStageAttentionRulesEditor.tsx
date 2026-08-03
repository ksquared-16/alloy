"use client";

import { useEffect, useState } from "react";
import {
    STAGE_ATTENTION_RULE_CATALOG,
    catalogEntryForAttentionKind,
    defaultAttentionRuleLabel,
    newAttentionRuleDraft,
    normalizeAttentionRuleKind,
    stageAttentionRuleUnsupportedReason,
} from "@/lib/lifecycle/stageAttentionRuleCatalog";
import {
    attentionDurationLegacyDayMirror,
    normalizeAttentionThresholdDuration,
} from "@/lib/lifecycle/stageAttentionThresholdDuration";
import {
    FOLLOW_UP_OFFSET_UNIT_OPTIONS,
    type StageFollowUpDueOffsetUnit,
} from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";
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
    layout?: "stacked" | "queue_workspace";
};

const SEVERITY_OPTIONS: StageAttentionSeverity[] = ["low", "medium", "high"];

function AttentionRuleForm({
    rule,
    index,
    workTemplates,
    readOnly,
    onUpdate,
    onRemove,
}: {
    rule: StageAttentionRuleV1;
    index: number;
    workTemplates: StageWorkTemplateV1[];
    readOnly: boolean;
    onUpdate: (index: number, patch: Partial<StageAttentionRuleV1>) => void;
    onRemove: (index: number) => void;
}) {
    const kind = normalizeAttentionRuleKind(rule.kind);
    const entry = catalogEntryForAttentionKind(kind);
    const unsupportedReason = stageAttentionRuleUnsupportedReason(kind);

    if (readOnly) {
        const displayLabel = rule.label?.trim() || defaultAttentionRuleLabel(kind);
        return (
            <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2 text-[0.6875rem] text-alloy-midnight/70">
                <span className="font-medium text-alloy-midnight/85">{displayLabel}</span>
                {rule.severity ?
                    <span className="ml-2 text-alloy-midnight/50">({rule.severity})</span>
                :   null}
            </div>
        );
    }

    return (
        <div
            className="rounded-lg border border-alloy-forge/12 bg-white p-3"
            data-testid={`stage-attention-rule-workspace-${rule.rule_key}`}
        >
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-0.5">
                    <span className="text-[0.6875rem] font-medium text-alloy-midnight/60">Rule type</span>
                    <select
                        className="config-runtime-select text-xs"
                        value={kind}
                        onChange={(e) =>
                            onUpdate(index, {
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
                    <span className="text-[0.6875rem] font-medium text-alloy-midnight/60">Label</span>
                    <input
                        className="config-runtime-input text-xs"
                        value={rule.label ?? ""}
                        placeholder={defaultAttentionRuleLabel(kind)}
                        onChange={(e) => onUpdate(index, { label: e.target.value })}
                    />
                </label>
                <label className="block space-y-0.5">
                    <span className="text-[0.6875rem] font-medium text-alloy-midnight/60">Severity</span>
                    <select
                        className="config-runtime-select text-xs"
                        value={rule.severity ?? entry?.defaultSeverity ?? "medium"}
                        onChange={(e) =>
                            onUpdate(index, {
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
                {entry?.supportsDuration ?
                    <div className="grid grid-cols-[1fr_auto] gap-2 sm:col-span-2">
                        <label className="block space-y-0.5">
                            <span className="text-[0.6875rem] font-medium text-alloy-midnight/60">After</span>
                            <input
                                type="number"
                                min={0}
                                className="config-runtime-input text-xs"
                                data-testid={`stage-attention-duration-value-${rule.rule_key}`}
                                value={
                                    normalizeAttentionThresholdDuration(rule, entry.defaultThreshold)
                                        .offset_value
                                }
                                onChange={(e) => {
                                    const offset_value = Math.max(0, Number(e.target.value) || 0);
                                    const offset_unit =
                                        normalizeAttentionThresholdDuration(rule, entry.defaultThreshold)
                                            .offset_unit;
                                    const threshold_duration = { offset_value, offset_unit };
                                    onUpdate(index, {
                                        threshold_duration,
                                        threshold: attentionDurationLegacyDayMirror(threshold_duration),
                                    });
                                }}
                            />
                        </label>
                        <label className="block space-y-0.5">
                            <span className="text-[0.6875rem] font-medium text-alloy-midnight/60">Unit</span>
                            <select
                                className="config-runtime-select text-xs"
                                data-testid={`stage-attention-duration-unit-${rule.rule_key}`}
                                value={
                                    normalizeAttentionThresholdDuration(rule, entry.defaultThreshold)
                                        .offset_unit
                                }
                                onChange={(e) => {
                                    const offset_unit = e.target.value as StageFollowUpDueOffsetUnit;
                                    const offset_value =
                                        normalizeAttentionThresholdDuration(rule, entry.defaultThreshold)
                                            .offset_value;
                                    const threshold_duration = { offset_value, offset_unit };
                                    onUpdate(index, {
                                        threshold_duration,
                                        threshold: attentionDurationLegacyDayMirror(threshold_duration),
                                    });
                                }}
                            >
                                {FOLLOW_UP_OFFSET_UNIT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                :   null}
                {entry?.supportsThreshold ?
                    <label className="block space-y-0.5">
                        <span className="text-[0.6875rem] font-medium text-alloy-midnight/60">Minimum attempts</span>
                        <input
                            type="number"
                            min={0}
                            className="config-runtime-input text-xs"
                            value={rule.threshold ?? entry.defaultThreshold}
                            onChange={(e) =>
                                onUpdate(index, {
                                    threshold: Math.max(0, Number(e.target.value) || 0),
                                })
                            }
                        />
                    </label>
                :   null}
                {kind === "work_overdue" && workTemplates.length ?
                    <label className="block space-y-0.5 sm:col-span-2">
                        <span className="text-[0.6875rem] font-medium text-alloy-midnight/60">Work item (optional)</span>
                        <select
                            className="config-runtime-select text-xs"
                            value={rule.template_key ?? ""}
                            onChange={(e) =>
                                onUpdate(index, {
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
                <p className="mt-1.5 text-[0.6875rem] text-alloy-midnight/45">{entry.description}</p>
            :   null}
            {unsupportedReason ?
                <p className="mt-1 text-[0.6875rem] text-alloy-ember/90" data-attention-rule-unsupported="true">
                    Unsupported at runtime: {unsupportedReason}
                </p>
            :   null}
            <button
                type="button"
                className="mt-2 text-[0.6875rem] font-medium text-red-700/80"
                onClick={() => onRemove(index)}
            >
                Remove rule
            </button>
        </div>
    );
}

export default function LifecycleStageAttentionRulesEditor({
    rules,
    workTemplates,
    onChange,
    stageLabel,
    readOnly = false,
    layout = "stacked",
}: Props) {
    const [selectedRuleKey, setSelectedRuleKey] = useState<string | null>(null);

    useEffect(() => {
        if (!rules.length) {
            setSelectedRuleKey(null);
            return;
        }
        if (!selectedRuleKey || !rules.some((rule) => rule.rule_key === selectedRuleKey)) {
            setSelectedRuleKey(rules[0]!.rule_key);
        }
    }, [rules, selectedRuleKey]);

    const updateRule = (index: number, patch: Partial<StageAttentionRuleV1>) => {
        onChange(
            rules.map((rule, i) => {
                if (i !== index) return rule;
                const next = { ...rule, ...patch };
                if (patch.kind) {
                    const entry = catalogEntryForAttentionKind(patch.kind);
                    if (entry && !rule.label?.trim()) next.label = entry.label;
                    if (entry?.supportsDuration) {
                        next.threshold_duration = next.threshold_duration ?? {
                            offset_value: entry.defaultThreshold,
                            offset_unit: "days",
                        };
                        next.threshold = attentionDurationLegacyDayMirror(next.threshold_duration);
                    } else if (entry?.supportsThreshold && next.threshold == null) {
                        next.threshold = entry.defaultThreshold;
                        delete next.threshold_duration;
                    } else if (entry && !entry.supportsDuration && !entry.supportsThreshold) {
                        delete next.threshold;
                        delete next.threshold_duration;
                    }
                }
                return next;
            }),
        );
    };

    const addRule = () => {
        const next = newAttentionRuleDraft(rules.length, "work_overdue");
        onChange([...rules, next]);
        setSelectedRuleKey(next.rule_key);
    };

    const footer = (
        <div className="text-[0.6875rem]">
            <AdminV2NavLink
                href="/admin/settings/attention-sla-rules"
                className="font-medium text-alloy-pine hover:underline"
            >
                {BUSINESS_PROCESS_SECTION_ATTENTION_ORG_DEFAULTS_LINK}
            </AdminV2NavLink>
        </div>
    );

    if (layout === "queue_workspace" && !readOnly) {
        const selectedIndex = rules.findIndex((rule) => rule.rule_key === selectedRuleKey);
        const selectedRule = selectedIndex >= 0 ? rules[selectedIndex]! : null;

        return (
            <div className="space-y-3" data-testid="lifecycle-stage-attention-rules-editor">
                <p className="text-[0.6875rem] leading-relaxed text-alloy-midnight/60">
                    Attention rules for <span className="font-medium">{stageLabel}</span>.
                </p>
                <div
                    className="flex min-h-[12rem] flex-col gap-3 lg:flex-row"
                    data-testid="stage-operating-plan-attention-queue-workspace"
                >
                    <aside className="w-full shrink-0 space-y-2 lg:w-44" data-testid="stage-operating-plan-attention-queue">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[0.6875rem] font-semibold text-alloy-midnight/75">Rules</span>
                            <button
                                type="button"
                                className="text-[0.6875rem] font-medium text-alloy-pine"
                                onClick={addRule}
                                data-testid="stage-attention-add-rule"
                            >
                                + Add
                            </button>
                        </div>
                        <div className="space-y-1.5" data-testid="lifecycle-stage-attention-rule-list">
                            {rules.map((rule) => {
                                const kind = normalizeAttentionRuleKind(rule.kind);
                                const displayLabel = rule.label?.trim() || defaultAttentionRuleLabel(kind);
                                const active = rule.rule_key === selectedRuleKey;
                                return (
                                    <button
                                        key={rule.rule_key}
                                        type="button"
                                        onClick={() => setSelectedRuleKey(rule.rule_key)}
                                        className={`process-config-work-view-list-card !py-2 ${active ? "process-config-work-view-list-card--active" : ""}`}
                                        data-testid={`stage-attention-rule-${rule.rule_key}`}
                                    >
                                        <p className="truncate text-left text-xs font-semibold text-alloy-midnight">
                                            {displayLabel}
                                        </p>
                                    </button>
                                );
                            })}
                            {!rules.length ?
                                <p className="text-xs text-alloy-midnight/50">No attention rules yet.</p>
                            :   null}
                        </div>
                    </aside>
                    <div className="min-w-0 flex-1" data-testid="stage-operating-plan-attention-workspace">
                        {selectedRule && selectedIndex >= 0 ?
                            <AttentionRuleForm
                                rule={selectedRule}
                                index={selectedIndex}
                                workTemplates={workTemplates}
                                readOnly={readOnly}
                                onUpdate={updateRule}
                                onRemove={(index) => onChange(rules.filter((_, i) => i !== index))}
                            />
                        :   <p className="text-sm text-alloy-midnight/50">Select an attention rule to configure it.</p>}
                    </div>
                </div>
                {footer}
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-attention-rules-editor">
            <p className="text-[0.6875rem] leading-relaxed text-alloy-midnight/60">
                Attention rules for <span className="font-medium">{stageLabel}</span>. Stored on this stage
                operating plan — evaluation wiring is separate from org-wide Needs Attention buckets.
            </p>

            <ul className="space-y-2" data-testid="lifecycle-stage-attention-rule-list">
                {rules.map((rule, index) => (
                    <li key={rule.rule_key} data-testid={`stage-attention-rule-${rule.rule_key}`}>
                        <AttentionRuleForm
                            rule={rule}
                            index={index}
                            workTemplates={workTemplates}
                            readOnly={readOnly}
                            onUpdate={updateRule}
                            onRemove={(ruleIndex) => onChange(rules.filter((_, i) => i !== ruleIndex))}
                        />
                    </li>
                ))}
            </ul>

            {!readOnly ?
                <button
                    type="button"
                    className="text-[0.6875rem] font-medium text-alloy-pine"
                    onClick={addRule}
                    data-testid="stage-attention-add-rule"
                >
                    + Add attention rule
                </button>
            :   null}

            {!rules.length ?
                <p className="text-[0.6875rem] text-alloy-midnight/50">No attention rules configured for this stage.</p>
            :   null}

            {footer}
        </div>
    );
}
