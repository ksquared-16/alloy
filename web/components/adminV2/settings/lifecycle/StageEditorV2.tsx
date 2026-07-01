"use client";

/**
 * StageEditorV2 — single-scroll stage definition document.
 *
 * Sections: Stage Identity · Operational Representation · Operational Experience ·
 *           Operational Requirements · Possible Outcomes
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
    Tag,
    Layers,
    BookOpen,
    ClipboardCheck,
    GitBranch,
    ChevronDown,
    ChevronRight,
    Check,
    AlertCircle,
    Users,
    User,
    Building2,
    Package,
    ExternalLink,
} from "lucide-react";
import LifecycleStageQueueMembershipEditor, {
    type LifecycleStageQueueMembershipEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageQueueMembershipEditor";
import LifecycleStageStatusRollupEditor, {
    type LifecycleStageStatusRollupEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageStatusRollupEditor";
import LifecycleStageFieldRequirementsEditor, {
    type LifecycleStageFieldRequirementsEditorHandle,
} from "@/components/adminV2/settings/LifecycleStageFieldRequirementsEditor";
import LifecycleStageOperatingPlanEditor, {
    type LifecycleStageOperatingPlanEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor";
import LifecycleStageLayoutAssignmentsCard from "@/components/adminV2/settings/lifecycle/LifecycleStageLayoutAssignmentsCard";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import type { StatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    queueMembershipSubjectForStatusOptions,
    statusEntityTypeForSubject,
    statusesSettingsHrefForEntity,
} from "@/lib/lifecycle/stageStatusRollup";
import {
    GRAIN_LABELS,
    GRAIN_DESCRIPTIONS,
    SUBJECT_RESOLUTION_LABELS,
    type StageGrain,
    type StageSubjectResolutionStrategy,
} from "@/lib/lifecycle/stageGrainV1";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { listPlatformActions } from "@/lib/platform/actions/platformActionCatalog";
import type { StageCandidateAction } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import type { LifecycleStageSaveUiState } from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";

// ─── Types ───────────────────────────────────────────────────────────────────

export type StageEditorV2Handle = {
    getFieldDraftRules: () => LifecycleStageFieldRulesStored | null;
    isFieldDirty: () => boolean;
    getQueueDisplayName: () => string | null;
    getQueueMembershipDraft: () => QueueMembershipV1 | null;
    isQueueMembershipDirty: () => boolean;
    getStatusRollupDraft: () => StatusRollupV1 | null;
    isStatusRollupDirty: () => boolean;
    getStageOperatingPlanDraft: () => StageOperatingPlanV1 | null;
    isStageOperatingPlanDirty: () => boolean;
    getV2Draft: () => StageV2Draft;
    isV2Dirty: () => boolean;
};

export type StageV2Draft = {
    grain?: StageGrain;
    /** Freeform operator-authored purpose description. */
    purpose?: string;
    description?: string;
    allow_skipping?: boolean;
    operator_guidance?: string;
    subject_resolution_strategy?: StageSubjectResolutionStrategy;
    candidate_actions?: StageCandidateAction[];
};

// ─── Section status ───────────────────────────────────────────────────────────

type SectionStatus = "configured" | "incomplete" | "missing" | "optional";

function SectionStatusBadge({ status }: { status: SectionStatus }) {
    if (status === "configured") {
        return (
            <span className="flex items-center gap-1 rounded-full bg-alloy-juniper/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-juniper">
                <Check size={9} strokeWidth={3} />
                Configured
            </span>
        );
    }
    if (status === "incomplete") {
        return (
            <span className="rounded-full bg-alloy-ember/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-ember">
                Incomplete
            </span>
        );
    }
    if (status === "missing") {
        return (
            <span className="flex items-center gap-1 rounded-full bg-alloy-ember/15 px-2 py-0.5 text-[10px] font-semibold text-alloy-ember">
                <AlertCircle size={9} />
                Required setup missing
            </span>
        );
    }
    return (
        <span className="rounded-full bg-alloy-midnight/6 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/40">
            Optional
        </span>
    );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
    id,
    icon,
    title,
    status,
    collapsed,
    onToggle,
    children,
}: {
    id: string;
    icon: ReactNode;
    title: string;
    status: SectionStatus;
    collapsed: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    return (
        <section
            id={`stage-section-${id}`}
            className="border-t border-alloy-forge/10 scroll-mt-28"
        >
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-alloy-stone/50"
                aria-expanded={!collapsed}
            >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-alloy-midnight/10 bg-alloy-stone text-alloy-midnight/50">
                    {icon}
                </div>
                <span className="flex-1 text-[13px] font-semibold text-alloy-midnight">{title}</span>
                <SectionStatusBadge status={status} />
                {collapsed
                    ? <ChevronRight size={13} className="ml-1 shrink-0 text-alloy-midnight/30" />
                    : <ChevronDown size={13} className="ml-1 shrink-0 text-alloy-midnight/30" />}
            </button>
            {!collapsed && (
                <div className="px-5 pb-7 pt-1">
                    {children}
                </div>
            )}
        </section>
    );
}

// ─── Grain selector ───────────────────────────────────────────────────────────

const GRAIN_ICONS: Record<StageGrain, ReactNode> = {
    family: <Users size={15} />,
    child: <User size={15} />,
    person: <User size={15} />,
    account: <Building2 size={15} />,
    work_item: <Package size={15} />,
};

// Grains that are fully wired vs. reserved for future configuration.
const GRAIN_FUTURE: Partial<Record<StageGrain, true>> = {
    person: true,
    account: true,
    work_item: true,
};

function GrainSelector({ value, onChange }: { value: StageGrain | undefined; onChange: (g: StageGrain) => void }) {
    const grains: StageGrain[] = ["family", "child", "person", "account", "work_item"];
    return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {grains.map((grain) => {
                const active = value === grain;
                const future = !!GRAIN_FUTURE[grain];
                return (
                    <button
                        key={grain}
                        type="button"
                        onClick={() => onChange(grain)}
                        title={future ? "Coming soon — not yet fully supported" : undefined}
                        className={`relative flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-center transition-all ${
                            active
                                ? "border-alloy-juniper/40 bg-alloy-juniper/8 shadow-sm"
                                : future
                                  ? "border-alloy-forge/8 bg-alloy-stone/30 opacity-50 cursor-not-allowed"
                                  : "border-alloy-forge/12 bg-white hover:border-alloy-juniper/30 hover:bg-alloy-stone/50"
                        }`}
                        data-testid={`grain-option-${grain}`}
                    >
                        {future && (
                            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-alloy-midnight/20 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/50 whitespace-nowrap">
                                Coming soon
                            </span>
                        )}
                        <span className={active ? "text-alloy-juniper" : "text-alloy-midnight/35"}>
                            {GRAIN_ICONS[grain]}
                        </span>
                        <span className={`text-[11px] font-semibold leading-tight ${active ? "text-alloy-juniper" : "text-alloy-midnight/60"}`}>
                            {GRAIN_LABELS[grain]}
                        </span>
                        <span className="text-[10px] leading-tight text-alloy-midnight/35">
                            {GRAIN_DESCRIPTIONS[grain]}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ─── Grain impact callout ────────────────────────────────────────────────────

const GRAIN_IMPACT: Record<StageGrain, { count: string; focus: string }> = {
    family: {
        count: "One row per lead / family",
        focus: "Opens the full lead record with family, children, contacts, work, and activity.",
    },
    child: {
        count: "One row per child enrollment — a family with 2 children produces 2 rows",
        focus: "Opens the lead record focused on the selected child.",
    },
    person: {
        count: "One row per person record",
        focus: "Opens the person record.",
    },
    account: {
        count: "One row per account",
        focus: "Opens the account overview.",
    },
    work_item: {
        count: "One row per task or obligation",
        focus: "Opens the work item detail.",
    },
};

function GrainImpactCallout({ grain }: { grain: StageGrain }) {
    const impact = GRAIN_IMPACT[grain];
    return (
        <div className="mt-3 rounded-lg border border-alloy-blue/15 bg-alloy-blue/4 px-4 py-3 space-y-1.5 text-[11px]">
            <div className="flex gap-8">
                <span className="w-24 shrink-0 font-medium text-alloy-blue/70">Queue count</span>
                <span className="text-alloy-midnight/65">{impact.count}</span>
            </div>
            <div className="flex gap-8">
                <span className="w-24 shrink-0 font-medium text-alloy-blue/70">Focus Panel</span>
                <span className="text-alloy-midnight/65">{impact.focus}</span>
            </div>
        </div>
    );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                {label}
            </label>
            {children}
            {hint ? <p className="mt-1 text-[10px] text-alloy-midnight/40">{hint}</p> : null}
        </div>
    );
}

const INPUT_CLS =
    "w-full rounded-lg border border-alloy-forge/15 bg-white px-3 py-2 text-[13px] text-alloy-midnight placeholder:text-alloy-midnight/30 focus:border-alloy-juniper focus:outline-none focus:ring-1 focus:ring-alloy-juniper/20";
const TEXTAREA_CLS = INPUT_CLS + " resize-none";

// ─── Subsection divider ───────────────────────────────────────────────────────

function Subsection({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
    return (
        <div className="mt-5 border-t border-alloy-forge/8 pt-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-alloy-midnight/45">{label}</p>
            {description ? <p className="mb-3 text-[11px] text-alloy-midnight/45">{description}</p> : null}
            {children}
        </div>
    );
}

function CollapsibleSubsection({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-5 border-t border-alloy-forge/8 pt-3">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
            >
                {open
                    ? <ChevronDown size={11} className="shrink-0 text-alloy-midnight/35" />
                    : <ChevronRight size={11} className="shrink-0 text-alloy-midnight/35" />}
                <span className="text-[11px] font-semibold uppercase tracking-wider text-alloy-midnight/45">{label}</span>
            </button>
            {open && (
                <div className="mt-3">
                    {description ? <p className="mb-3 text-[11px] text-alloy-midnight/45">{description}</p> : null}
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Action catalog panel ────────────────────────────────────────────────────

const ACTION_CATEGORY_LABELS: Record<string, string> = {
    status_lifecycle: "Status change",
    workflow: "Workflow",
    communication: "Communication",
    record: "Record update",
    enrollment: "Enrollment",
    placement: "Placement",
    scheduling: "Scheduling",
};

function ActionCatalogPanel({
    candidateActions,
    grain,
    onChange,
}: {
    candidateActions: StageCandidateAction[];
    grain: StageGrain | undefined;
    onChange: (actions: StageCandidateAction[]) => void;
}) {
    const grainFilter = grain === "child" ? "opportunity_customer_member" : "opportunity";
    // Filter runtime-internal actions that should not be surfaced to operators.
    const INTERNAL_ACTION_KEYS = new Set(["update_lead_status", "update_child_enrollment_status"]);
    const catalogActions = listPlatformActions({ grain: grainFilter }).filter(
        (a) => !INTERNAL_ACTION_KEYS.has(a.key),
    );

    const toggleAction = useCallback(
        (key: string) => {
            const existing = candidateActions.find((a) => a.action_key === key);
            if (existing) {
                onChange(candidateActions.filter((a) => a.action_key !== key));
            } else {
                onChange([...candidateActions, { action_key: key, recommendation: "ready" }]);
            }
        },
        [candidateActions, onChange],
    );

    const cycleRecommendation = useCallback(
        (key: string) => {
            const order: StageCandidateAction["recommendation"][] = ["recommended", "ready", "context_dependent"];
            onChange(
                candidateActions.map((a) => {
                    if (a.action_key !== key) return a;
                    const idx = order.indexOf(a.recommendation);
                    return { ...a, recommendation: order[(idx + 1) % order.length]! };
                }),
            );
        },
        [candidateActions, onChange],
    );

    const REC_LABELS: Record<StageCandidateAction["recommendation"], string> = {
        recommended: "Recommended",
        ready: "Available",
        context_dependent: "Context-dependent",
    };
    const REC_STYLES: Record<StageCandidateAction["recommendation"], string> = {
        recommended: "bg-alloy-blue/10 text-alloy-blue border border-alloy-blue/15",
        ready: "bg-alloy-forge/8 text-alloy-midnight/55 border border-alloy-forge/10",
        context_dependent: "bg-alloy-midnight/6 text-alloy-midnight/45 border border-alloy-midnight/8",
    };

    if (!catalogActions.length) {
        return (
            <p className="text-[11px] text-alloy-midnight/40">
                No actions found in the Platform Catalog for this grain. Configure grain above.
            </p>
        );
    }

    return (
        <div>
            <p className="mb-3 text-[11px] text-alloy-midnight/50">
                Choose the actions operators should see first in this stage. Actions come from the Platform Action Catalog; this stage only prioritizes and labels them. Click a badge to set priority: <span className="font-medium text-alloy-midnight/70">Recommended</span> shows it first; <span className="font-medium text-alloy-midnight/70">Available</span> makes it accessible; <span className="font-medium text-alloy-midnight/70">Context-dependent</span> shows it only when preconditions are met.
            </p>
            <div className="space-y-1.5">
                {catalogActions.map((action) => {
                    const candidate = candidateActions.find((a) => a.action_key === action.key);
                    const enabled = !!candidate;
                    return (
                        <div
                            key={action.key}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                                enabled
                                    ? "border-alloy-juniper/20 bg-white"
                                    : "border-alloy-forge/8 bg-alloy-stone/40"
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => toggleAction(action.key)}
                                className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${enabled ? "bg-alloy-juniper" : "bg-alloy-forge/20"}`}
                                aria-label={enabled ? `Disable ${action.defaultLabel}` : `Enable ${action.defaultLabel}`}
                            >
                                <span
                                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${enabled ? "left-3.5" : "left-0.5"}`}
                                />
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className={`text-[12px] font-semibold leading-snug ${enabled ? "text-alloy-midnight" : "text-alloy-midnight/40"}`}>
                                    {action.defaultLabel}
                                </p>
                                <p className="text-[10px] text-alloy-midnight/40">
                                    {ACTION_CATEGORY_LABELS[action.category] ?? action.category}
                                    {action.confirmationPolicy === "destructive" ? " · requires confirmation" : ""}
                                </p>
                            </div>
                            {enabled && candidate ? (
                                <button
                                    type="button"
                                    onClick={() => cycleRecommendation(action.key)}
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${REC_STYLES[candidate.recommendation]}`}
                                    title="Click to cycle: Recommended → Available → Context-dependent"
                                >
                                    {REC_LABELS[candidate.recommendation]}
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Subject resolution ───────────────────────────────────────────────────────

function SubjectResolutionField({
    value,
    onChange,
}: {
    value: StageSubjectResolutionStrategy | undefined;
    onChange: (v: StageSubjectResolutionStrategy) => void;
}) {
    const strategies: StageSubjectResolutionStrategy[] = [
        "ask_operator",
        "operator_select",
        "all_eligible",
        "single_anchor",
    ];
    return (
        <div>
            <p className="mb-2.5 text-[11px] text-alloy-midnight/50">
                When an action is invoked from family context but targets individual children, how should the runtime determine which children to act on?
            </p>
            <div className="space-y-1.5">
                {strategies.map((s) => (
                    <label
                        key={s}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                            value === s
                                ? "border-alloy-juniper/30 bg-alloy-juniper/6"
                                : "border-alloy-forge/10 bg-white hover:border-alloy-juniper/20"
                        }`}
                    >
                        <input
                            type="radio"
                            name="subject_resolution"
                            value={s}
                            checked={value === s}
                            onChange={() => onChange(s)}
                            className="h-3.5 w-3.5 shrink-0 accent-alloy-juniper"
                        />
                        <span className="text-[12px] text-alloy-midnight">{SUBJECT_RESOLUTION_LABELS[s]}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

// ─── Possible outcomes ────────────────────────────────────────────────────────

const OUTCOME_TARGET_LABELS: Record<string, string> = {
    update_family_case_status: "Updates family status",
    update_child_enrollment_status: "Updates child enrollment status",
    update_candidate_status: "Updates candidate status",
    create_needs_attention: "Creates an attention flag",
    create_next_work: "Creates follow-up work",
    reopen_work: "Reopens existing work",
    mark_stage_work_complete: "Marks stage work complete",
    move_to_stage: "Moves subject to another stage",
    no_movement: "No stage movement",
};

function PossibleOutcomesSection({
    operatingPlan,
}: {
    operatingPlan: StageOperatingPlanV1 | null | undefined;
}) {
    const outcomes = operatingPlan?.outcomes ?? [];
    const outcomeRules = operatingPlan?.outcome_rules ?? [];

    if (!outcomes.length) {
        return (
            <div className="rounded-lg border border-dashed border-alloy-forge/20 px-4 py-6 text-center">
                <p className="text-[12px] text-alloy-midnight/50">No outcomes configured yet.</p>
                <p className="mt-1 text-[11px] text-alloy-midnight/35">
                    Outcomes are defined in Operational Experience → Operating Plan. Each outcome maps operator actions to a durable state change.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {outcomes.map((outcome) => {
                const rules = outcomeRules.filter((r) => r.when_outcome_key === outcome.outcome_key);
                const targets = rules.flatMap((r) => r.targets);
                const statusTarget = targets.find(
                    (t) =>
                        t.kind === "update_family_case_status" ||
                        t.kind === "update_child_enrollment_status" ||
                        t.kind === "update_candidate_status",
                );
                const stageTarget = targets.find((t) => t.kind === "move_to_stage");
                const sideEffects = targets.filter(
                    (t) =>
                        t.kind !== "update_family_case_status" &&
                        t.kind !== "update_child_enrollment_status" &&
                        t.kind !== "update_candidate_status" &&
                        t.kind !== "move_to_stage",
                );

                return (
                    <div
                        key={outcome.outcome_key}
                        className="rounded-lg border border-alloy-forge/10 bg-white px-4 py-3"
                    >
                        <div className="flex items-start gap-2.5">
                            <span
                                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${outcome.successful ? "bg-alloy-juniper" : "bg-alloy-midnight/25"}`}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-[12px] font-semibold text-alloy-midnight">{outcome.label}</p>
                                    {outcome.successful ? (
                                        <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-alloy-juniper/10 px-1.5 py-0.5 text-[10px] font-medium text-alloy-juniper">
                                            <Check size={9} strokeWidth={3} />
                                            Successful
                                        </span>
                                    ) : null}
                                </div>
                                {statusTarget ? (
                                    <p className="mt-1 text-[11px] text-alloy-midnight/55">
                                        {OUTCOME_TARGET_LABELS[statusTarget.kind] ?? statusTarget.kind.replace(/_/g, " ")}
                                        {statusTarget.status_key ? (
                                            <span className="ml-1.5 rounded bg-alloy-stone px-1.5 py-0.5 font-mono text-[10px] text-alloy-midnight/55">
                                                {statusTarget.status_key}
                                            </span>
                                        ) : null}
                                    </p>
                                ) : null}
                                {stageTarget ? (
                                    <p className="mt-1 text-[11px] text-alloy-blue">
                                        Moves to stage:{" "}
                                        <span className="font-semibold">{stageTarget.stage_key ?? "—"}</span>
                                    </p>
                                ) : (
                                    targets.length > 0 && !statusTarget ? (
                                        <p className="mt-1 text-[11px] text-alloy-midnight/40">No stage movement</p>
                                    ) : null
                                )}
                                {sideEffects.map((t, i) => (
                                    <p key={i} className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                        {OUTCOME_TARGET_LABELS[t.kind] ?? t.kind.replace(/_/g, " ")}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Save topbar ──────────────────────────────────────────────────────────────

function StickyTopbar({
    stageLabel,
    stageKey,
    saveState,
    saveError,
    saveDisabled,
    isDirty,
    onSave,
}: {
    stageLabel: string;
    stageKey: string;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    saveDisabled: boolean;
    isDirty: boolean;
    onSave: () => void | Promise<void>;
}) {
    return (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-alloy-forge/10 bg-white/96 px-5 py-3 backdrop-blur-sm">
            <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-alloy-midnight">{stageLabel || stageKey}</p>
                <p className="font-mono text-[10px] text-alloy-midnight/35">{stageKey}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {isDirty && saveState !== "saving" ? (
                    <span className="text-[10px] font-medium text-alloy-ember" data-testid="stage-editor-v2-unsaved">
                        Unsaved changes
                    </span>
                ) : saveState === "saved" ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-alloy-juniper" data-testid="stage-editor-v2-saved">
                        <Check size={11} strokeWidth={2.5} />
                        Saved
                    </span>
                ) : null}
                {saveState === "error" && saveError ? (
                    <span className="flex items-center gap-1 max-w-[12rem] text-right text-[10px] text-alloy-ember" role="alert">
                        <AlertCircle size={11} />
                        {saveError}
                    </span>
                ) : null}
                <button
                    type="button"
                    disabled={saveDisabled}
                    onClick={() => void onSave()}
                    className="config-primary-btn config-primary-btn--sm"
                    data-testid="stage-editor-v2-save"
                >
                    {saveState === "saving" ? "Saving…" : "Save stage"}
                </button>
            </div>
        </div>
    );
}

// ─── Section anchor nav ───────────────────────────────────────────────────────

const SECTIONS = [
    { id: "identity", label: "Identity" },
    { id: "representation", label: "Representation" },
    { id: "experience", label: "Experience" },
    { id: "requirements", label: "Requirements" },
    { id: "outcomes", label: "Outcomes" },
] as const;

function SectionAnchorNav({ activeSection }: { activeSection: string }) {
    return (
        <nav
            aria-label="Stage sections"
            className="sticky top-[52px] z-10 flex gap-1 overflow-x-auto border-b border-alloy-forge/8 bg-alloy-stone/60 px-5 py-2 backdrop-blur-sm scrollbar-hide"
        >
            {SECTIONS.map((s) => (
                <a
                    key={s.id}
                    href={`#stage-section-${s.id}`}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        activeSection === s.id
                            ? "bg-white text-alloy-juniper shadow-sm"
                            : "text-alloy-midnight/50 hover:bg-white/60 hover:text-alloy-midnight"
                    }`}
                >
                    {s.label}
                </a>
            ))}
        </nav>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StageEditorV2({
    departmentId,
    businessProcessKey,
    stageKey,
    stageLabel,
    stageRecord,
    allStages: _allStages,
    bootstrap,
    bootstrapLoading,
    entityDisplayLabels,
    statusesError,
    onStatusRollupChange,
    saveState,
    saveError,
    onSaveStage,
    onDirtyChange,
    workspaceRef,
}: {
    departmentId: string;
    businessProcessKey: string;
    stageKey: string;
    stageLabel: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    allStages?: LifecycleBuilderStageRecord[];
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    entityDisplayLabels?: Partial<Record<LifecycleRequirementEntityKey, string>>;
    statusesError: string | null;
    onStatusRollupChange: (rollup: StatusRollupV1, flatKeys: string[]) => void;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    onSaveStage: () => void | Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
    workspaceRef?: React.RefObject<StageEditorV2Handle | null>;
}) {
    // ── Sub-editor refs ──
    const fieldReqRef = useRef<LifecycleStageFieldRequirementsEditorHandle | null>(null);
    const membershipRef = useRef<LifecycleStageQueueMembershipEditorHandle | null>(null);
    const rollupRef = useRef<LifecycleStageStatusRollupEditorHandle | null>(null);
    const operatingPlanRef = useRef<LifecycleStageOperatingPlanEditorHandle | null>(null);

    // ── Sub-editor dirty states ──
    const [fieldDirty, setFieldDirty] = useState(false);
    const [membershipDirty, setMembershipDirty] = useState(false);
    const [rollupDirty, setRollupDirty] = useState(false);
    const [operatingPlanDirty, setOperatingPlanDirty] = useState(false);

    // ── V2 field state ──
    const [grain, setGrain] = useState<StageGrain | undefined>(stageRecord?.grain);
    const [purpose, setPurpose] = useState<string>(stageRecord?.purpose ?? "");
    const [description, setDescription] = useState(stageRecord?.description ?? "");
    const [allowSkipping, setAllowSkipping] = useState(stageRecord?.allow_skipping ?? false);
    const [operatorGuidance, setOperatorGuidance] = useState(stageRecord?.operator_guidance ?? "");
    const [subjectResolution, setSubjectResolution] = useState<StageSubjectResolutionStrategy | undefined>(
        stageRecord?.subject_resolution_strategy ?? "ask_operator",
    );
    const [candidateActions, setCandidateActions] = useState<StageCandidateAction[]>(
        stageRecord?.action_catalog_v1?.candidate_actions ?? [],
    );

    // ── Collapse state — all sections collapsed by default ──
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
        identity: true,
        representation: true,
        experience: true,
        requirements: true,
        outcomes: true,
    });
    const toggleSection = useCallback((id: string) => {
        setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    // ── V2 dirty tracking ──
    const savedGrain = stageRecord?.grain;
    const savedPurpose = stageRecord?.purpose ?? "";
    const savedDescription = stageRecord?.description ?? "";
    const savedAllowSkipping = stageRecord?.allow_skipping ?? false;
    const savedGuidance = stageRecord?.operator_guidance ?? "";
    const savedResolution = stageRecord?.subject_resolution_strategy ?? "ask_operator";

    const v2Dirty =
        grain !== savedGrain ||
        purpose !== savedPurpose ||
        description !== savedDescription ||
        allowSkipping !== savedAllowSkipping ||
        operatorGuidance !== savedGuidance ||
        subjectResolution !== savedResolution;

    const isDirty = fieldDirty || membershipDirty || rollupDirty || operatingPlanDirty || v2Dirty;

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    // Reset local state when the active stage changes
    useEffect(() => {
        setGrain(stageRecord?.grain);
        setPurpose(stageRecord?.purpose ?? "");
        setDescription(stageRecord?.description ?? "");
        setAllowSkipping(stageRecord?.allow_skipping ?? false);
        setOperatorGuidance(stageRecord?.operator_guidance ?? "");
        setSubjectResolution(stageRecord?.subject_resolution_strategy ?? "ask_operator");
        setCandidateActions(stageRecord?.action_catalog_v1?.candidate_actions ?? []);
    }, [stageKey, stageRecord]);

    useImperativeHandle(workspaceRef, () => ({
        getFieldDraftRules: () => fieldReqRef.current?.getDraftRules() ?? null,
        isFieldDirty: () => fieldReqRef.current?.isDirty() ?? false,
        getQueueDisplayName: () => null,
        getQueueMembershipDraft: () => membershipRef.current?.getDraftMembership() ?? null,
        isQueueMembershipDirty: () => membershipRef.current?.isDirty() ?? false,
        getStatusRollupDraft: () => rollupRef.current?.getDraftRollup() ?? null,
        isStatusRollupDirty: () => rollupRef.current?.isDirty() ?? false,
        getStageOperatingPlanDraft: () => operatingPlanRef.current?.getDraftPlan() ?? null,
        isStageOperatingPlanDirty: () => operatingPlanRef.current?.isDirty() ?? false,
        getV2Draft: () => ({
            grain,
            purpose: purpose.trim() || undefined,
            description: description.trim() || undefined,
            allow_skipping: allowSkipping,
            operator_guidance: operatorGuidance.trim() || undefined,
            subject_resolution_strategy: subjectResolution,
            candidate_actions: candidateActions,
        }),
        isV2Dirty: () => v2Dirty,
    }));

    const effectiveSaveState: LifecycleStageSaveUiState =
        saveState === "saving" || saveState === "saved" || saveState === "error"
            ? saveState
            : isDirty
              ? "unsaved"
              : "idle";

    const saveDisabled =
        !stageKey.trim() || effectiveSaveState === "saving" || (!isDirty && effectiveSaveState !== "error");

    const statusSubjectType = queueMembershipSubjectForStatusOptions({
        stageKey,
        trackKey: bootstrap?.stage_track_key ?? null,
        queueMembership: bootstrap?.queue_membership ?? null,
    });
    const statusesSettingsHref = statusesSettingsHrefForEntity(statusEntityTypeForSubject(statusSubjectType));

    const outcomeCount = bootstrap?.stage_operating_plan?.outcomes?.length ?? 0;

    // ── Section completion status ──
    const sectionStatus: Record<string, SectionStatus> = {
        identity: purpose.trim() || description.trim() ? "configured" : "optional",
        representation: !grain ? "missing" : bootstrap?.queue_membership || bootstrap?.status_rollup_v1 ? "configured" : "incomplete",
        experience: candidateActions.length > 0 || operatorGuidance.trim() || bootstrap?.stage_operating_plan?.outcomes?.length ? "configured" : "optional",
        requirements: bootstrap?.field_requirements ? "configured" : "optional",
        outcomes: outcomeCount > 0 ? "configured" : "optional",
    };

    if (bootstrapLoading && !bootstrap) {
        return (
            <div className="animate-pulse space-y-3 p-5" data-testid="stage-editor-v2-skeleton">
                <div className="h-10 w-2/3 rounded-xl bg-alloy-forge/10" />
                <div className="h-32 rounded-xl bg-alloy-forge/8" />
                <div className="h-48 rounded-xl bg-alloy-forge/6" />
            </div>
        );
    }

    return (
        <div className="stage-editor-v2 relative flex flex-col" data-testid="stage-editor-v2">
            <StickyTopbar
                stageLabel={stageLabel}
                stageKey={stageKey}
                saveState={effectiveSaveState}
                saveError={saveError}
                saveDisabled={saveDisabled}
                isDirty={isDirty}
                onSave={onSaveStage}
            />

            <SectionAnchorNav activeSection="identity" />

            {statusesError ? (
                <p className="mx-5 mt-2 flex items-center gap-1.5 text-xs text-alloy-ember" role="alert">
                    <AlertCircle size={12} />
                    {statusesError}
                </p>
            ) : null}

            <div className="flex flex-col pb-16">

                {/* ── Section 1: Stage Identity ── */}
                <Section
                    id="identity"
                    icon={<Tag size={13} />}
                    title="Stage Identity"
                    status={sectionStatus.identity}
                    collapsed={!!collapsed.identity}
                    onToggle={() => toggleSection("identity")}
                >
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Stage name">
                            <input
                                className={INPUT_CLS}
                                value={stageLabel}
                                readOnly
                                title="Rename in the stage list"
                                data-testid="stage-editor-v2-label"
                            />
                            <p className="mt-1 text-[10px] text-alloy-midnight/35">Rename in the stage list on the left.</p>
                        </Field>
                        <Field label="Purpose" hint="Short description of this stage's role — shown to operators in the stage picker.">
                            <input
                                className={INPUT_CLS}
                                value={purpose}
                                onChange={(e) => setPurpose(e.target.value)}
                                placeholder="e.g. Qualify and schedule family visits"
                                maxLength={120}
                                data-testid="stage-editor-v2-purpose"
                            />
                        </Field>
                    </div>

                    <Field label="Description" hint="Explain what operators are expected to accomplish in this stage.">
                        <textarea
                            className={TEXTAREA_CLS}
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What happens in this stage? What is the operator goal?"
                            data-testid="stage-editor-v2-description"
                        />
                    </Field>

                    <Field label="Allow stage skipping">
                        <label className="mt-1 flex cursor-pointer items-center gap-2">
                            <input
                                type="checkbox"
                                checked={allowSkipping}
                                onChange={(e) => setAllowSkipping(e.target.checked)}
                                className="h-4 w-4 rounded accent-alloy-juniper"
                                data-testid="stage-editor-v2-allow-skipping"
                            />
                            <span className="text-[12px] text-alloy-midnight">Operators can skip this stage</span>
                        </label>
                    </Field>
                </Section>

                {/* ── Section 2: Operational Representation ── */}
                <Section
                    id="representation"
                    icon={<Layers size={13} />}
                    title="Operational Representation"
                    status={sectionStatus.representation}
                    collapsed={!!collapsed.representation}
                    onToggle={() => toggleSection("representation")}
                >
                    {/* 2a — Grain */}
                    <Field
                        label="Stage grain"
                        hint="Grain is what a single queue row represents. Focus Panel content and available actions follow from this choice."
                    >
                        <GrainSelector value={grain} onChange={setGrain} />
                        {grain ? <GrainImpactCallout grain={grain} /> : null}
                    </Field>

                    {grain === "child" ? (
                        <Field label="When multiple children are eligible…">
                            <SubjectResolutionField value={subjectResolution} onChange={setSubjectResolution} />
                        </Field>
                    ) : null}

                    {stageKey.trim() ? (
                        <>
                            {/* 2b — Inclusion criteria (advanced, collapsed) */}
                            <CollapsibleSubsection
                                label="Advanced inclusion criteria"
                                description="Records of the selected grain appear in this stage when they match queue membership criteria and hold one of the included statuses. These criteria describe which records of that grain appear here — records that leave these statuses exit the queue automatically."
                            >
                                <LifecycleStageQueueMembershipEditor
                                    ref={membershipRef}
                                    departmentId={departmentId}
                                    stageKey={stageKey}
                                    savedMembership={bootstrap?.queue_membership ?? null}
                                    onDirtyChange={setMembershipDirty}
                                />

                                <div className="mt-4 border-t border-alloy-forge/8 pt-4">
                                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-alloy-midnight/45">
                                        Included statuses
                                    </p>
                                    <p className="mb-2 text-[11px] text-alloy-midnight/40">
                                        A record of this grain appears in this stage&apos;s queue when its status matches one of these.
                                    </p>
                                    <LifecycleStageStatusRollupEditor
                                        editorRef={rollupRef}
                                        catalog={bootstrap?.status_category_catalog ?? []}
                                        savedRollup={bootstrap?.status_rollup_v1 ?? null}
                                        statusesSettingsHref={statusesSettingsHref}
                                        onRollupChange={(rollup) => {
                                            setRollupDirty(rollupRef.current?.isDirty() ?? true);
                                            onStatusRollupChange(
                                                rollup,
                                                rollup.categories.flatMap((c) => c.selected_status_keys),
                                            );
                                        }}
                                    />
                                </div>
                            </CollapsibleSubsection>

                            {/* 2c — Surface assignments */}
                            <Subsection
                                label="Surface assignments — how subjects are displayed"
                                description="Assign published surfaces to the queue row and Focus Panel for this stage. Missing assignments inherit from the process default."
                            >
                                <div className="mb-3">
                                    <a
                                        href="/settings/surfaces"
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-alloy-pine hover:underline"
                                    >
                                        Design surfaces in Settings → Surfaces
                                        <ExternalLink size={10} />
                                    </a>
                                </div>
                                <LifecycleStageLayoutAssignmentsCard
                                    businessProcessKey={businessProcessKey}
                                    stageKey={stageKey}
                                    stageLabel={stageLabel}
                                />
                            </Subsection>
                        </>
                    ) : null}
                </Section>

                {/* ── Section 3: Operational Experience ── */}
                <Section
                    id="experience"
                    icon={<BookOpen size={13} />}
                    title="Operational Experience"
                    status={sectionStatus.experience}
                    collapsed={!!collapsed.experience}
                    onToggle={() => toggleSection("experience")}
                >
                    {stageKey.trim() ? (
                        <>
                            <LifecycleStageOperatingPlanEditor
                                ref={operatingPlanRef}
                                stageKey={stageKey}
                                stageLabel={stageLabel}
                                savedPlan={bootstrap?.stage_operating_plan ?? null}
                                onDirtyChange={setOperatingPlanDirty}
                            />

                            <Subsection label="Recommended actions">
                                <ActionCatalogPanel
                                    candidateActions={candidateActions}
                                    grain={grain}
                                    onChange={setCandidateActions}
                                />
                            </Subsection>

                            <Subsection label="Operator guidance">
                                <p className="mb-2 text-[11px] text-alloy-midnight/45">
                                    Shown to operators when they open a record in this stage. Use this to communicate context, priorities, or reminders.
                                </p>
                                <textarea
                                    className={TEXTAREA_CLS}
                                    rows={3}
                                    value={operatorGuidance}
                                    onChange={(e) => setOperatorGuidance(e.target.value)}
                                    placeholder="e.g. Family has committed to enroll. Confirm placement and complete paperwork within 5 days."
                                    data-testid="stage-editor-v2-guidance"
                                />
                            </Subsection>
                        </>
                    ) : (
                        <p className="text-[12px] text-alloy-midnight/40">Select a stage to configure experience.</p>
                    )}
                </Section>

                {/* ── Section 4: Operational Requirements ── */}
                <Section
                    id="requirements"
                    icon={<ClipboardCheck size={13} />}
                    title="Operational Requirements"
                    status={sectionStatus.requirements}
                    collapsed={!!collapsed.requirements}
                    onToggle={() => toggleSection("requirements")}
                >
                    {stageKey.trim() ? (
                        <>
                            <p className="mb-3 text-[11px] text-alloy-midnight/50">
                                Required fields block specific actions when missing. Entry and exit expectations guide operators without hard-locking the process.
                            </p>
                            <LifecycleStageFieldRequirementsEditor
                                ref={fieldReqRef}
                                departmentId={departmentId}
                                activeStageKey={stageKey}
                                compact
                                workspaceMode
                                prefetchedFieldRequirements={bootstrap?.field_requirements ?? null}
                                entityDisplayLabels={entityDisplayLabels ?? bootstrap?.entity_display_labels ?? undefined}
                                onDirtyChange={setFieldDirty}
                            />
                        </>
                    ) : (
                        <p className="text-[12px] text-alloy-midnight/40">Select a stage to configure requirements.</p>
                    )}
                </Section>

                {/* ── Section 5: Possible Outcomes ── */}
                <Section
                    id="outcomes"
                    icon={<GitBranch size={13} />}
                    title={outcomeCount > 0 ? `Possible Outcomes (${outcomeCount})` : "Possible Outcomes"}
                    status={sectionStatus.outcomes}
                    collapsed={!!collapsed.outcomes}
                    onToggle={() => toggleSection("outcomes")}
                >
                    <p className="mb-3 text-[11px] text-alloy-midnight/50">
                        What can happen when operators act from this stage. Each outcome produces a durable state change — a status transition, a stage movement, or follow-up work.
                    </p>
                    <PossibleOutcomesSection operatingPlan={bootstrap?.stage_operating_plan} />
                </Section>

            </div>
        </div>
    );
}
