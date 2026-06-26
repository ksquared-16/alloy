"use client";

import {
    COMPLETION_BOOTSTRAP_RULE_GROUPS,
    completionBootstrapGroupLabel,
    groupCompletionBootstrapRules,
    type CompletionBootstrapRuleCatalogEntry,
} from "@/lib/completion/completionBootstrapRulesCatalog";

function requirementTypeLabel(type: CompletionBootstrapRuleCatalogEntry["requirement_type"]): string {
    switch (type) {
        case "always_required":
            return "Always required";
        case "required_on_save":
            return "Required on save";
        case "required_before_status_transition":
            return "Required before status transition";
        case "recommended_non_blocking":
            return "Recommended (non-blocking)";
    }
}

function blockingLevelLabel(level: CompletionBootstrapRuleCatalogEntry["blocking_level"]): string {
    switch (level) {
        case "hard_block":
            return "Hard block";
        case "soft_warning":
            return "Soft warning";
        case "recommendation":
            return "Recommendation";
    }
}

export default function CompletionGuardrailsSettingsPanel() {
    const grouped = groupCompletionBootstrapRules();

    return (
        <section
            className="rounded-xl border border-alloy-forge/15 bg-white/75 p-4 shadow-sm"
            data-testid="completion-guardrails-settings-panel"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Completion guardrails</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                        Sprint B bootstrap rules enforced on PATCH and shown in drawer Assist panels. Read-only catalog
                        — policy editing deferred.
                    </p>
                </div>
                <span
                    className="rounded-full border border-alloy-forge/20 bg-alloy-stone/10 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70"
                    data-testid="completion-guardrails-read-only-badge"
                >
                    Read-only
                </span>
            </div>

            <div className="mt-4 space-y-4">
                {COMPLETION_BOOTSTRAP_RULE_GROUPS.map((group) => {
                    const rules = grouped[group];
                    if (!rules.length) return null;
                    return (
                        <div
                            key={group}
                            className="rounded-lg border border-alloy-forge/12 bg-white/90 p-3"
                            data-testid={`completion-guardrails-group-${group}`}
                        >
                            <h3 className="text-xs font-semibold text-alloy-midnight">
                                {completionBootstrapGroupLabel(group)}
                            </h3>
                            <div className="mt-2 overflow-x-auto">
                                <table className="w-full min-w-[640px] border-collapse text-[11px]">
                                    <thead>
                                        <tr className="border-b border-alloy-forge/12 text-left text-alloy-midnight/55">
                                            <th className="py-1.5 pr-3 font-medium">Rule</th>
                                            <th className="py-1.5 pr-3 font-medium">Requirement type</th>
                                            <th className="py-1.5 pr-3 font-medium">Blocking level</th>
                                            <th className="py-1.5 pr-3 font-medium">Phase / context</th>
                                            <th className="py-1.5 font-medium">Source</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rules.map((rule) => (
                                            <tr
                                                key={`${group}:${rule.rule_key}`}
                                                className="border-b border-alloy-forge/8 last:border-0"
                                                data-testid={`completion-rule-${group}-${rule.rule_key}`}
                                            >
                                                <td className="py-2 pr-3">
                                                    <span className="font-medium text-alloy-midnight">{rule.label}</span>
                                                    <span className="ml-1 font-mono text-[10px] text-alloy-midnight/45">
                                                        {rule.rule_key}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-3 text-alloy-midnight/75">
                                                    {requirementTypeLabel(rule.requirement_type)}
                                                </td>
                                                <td className="py-2 pr-3 text-alloy-midnight/75">
                                                    {blockingLevelLabel(rule.blocking_level)}
                                                </td>
                                                <td className="py-2 pr-3 text-alloy-midnight/65">{rule.phase_context}</td>
                                                <td className="py-2 font-mono text-[10px] text-alloy-midnight/50">
                                                    {rule.source}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
