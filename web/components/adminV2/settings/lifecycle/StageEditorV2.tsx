"use client";

/**
 * StageEditorV2 — single-scroll stage definition document.
 *
 * Replaces the tab-based LifecycleStageWorkspace with a sectioned document layout.
 * Sections: Stage Identity · Operational Representation · Operational Experience ·
 *           Operational Requirements · Possible Outcomes · Preview
 *
 * All existing sub-editors are preserved; this component re-organizes them.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode } from "react";
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
    PURPOSE_LABELS,
    SUBJECT_RESOLUTION_LABELS,
    type StageGrain,
    type StagePurpose,
    type StageSubjectResolutionStrategy,
} from "@/lib/lifecycle/stageGrainV1";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { listPlatformActions } from "@/lib/platform/actions/platformActionCatalog";
import type { StageCandidateAction } from "@/lib/lifecycle/stageActionCatalogV1";
import type { LifecycleStageSaveUiState } from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";
import LifecycleStageLayoutAssignmentsCard from "@/components/adminV2/settings/lifecycle/LifecycleStageLayoutAssignmentsCard";

// ─── Types ───────────────────────────────────────────────────────────────────

export type StageEditorV2Handle = {
    getFieldDraftRules: () => LifecycleStageFieldRulesStored | null;
    isFieldDirty: () => boolean;
    getQueueDisplayName: () => string | null;
    getQueueMembershipDraft: () => import("@/lib/lifecycle/queueMembershipV1").QueueMembershipV1 | null;
    isQueueMembershipDirty: () => boolean;
    getStatusRollupDraft: () => StatusRollupV1 | null;
    isStatusRollupDirty: () => boolean;
    getStageOperatingPlanDraft: () => import("@/lib/lifecycle/stageOperatingPlanV1").StageOperatingPlanV1 | null;
    isStageOperatingPlanDirty: () => boolean;
    getV2Draft: () => StageV2Draft;
    isV2Dirty: () => boolean;
};

export type StageV2Draft = {
    grain?: StageGrain;
    purpose?: StagePurpose;
    description?: string;
    parent_stage_key?: string;
    allow_skipping?: boolean;
    operator_guidance?: string;
    subject_resolution_strategy?: StageSubjectResolutionStrategy;
    candidate_actions?: StageCandidateAction[];
};

// ─── Section shell ────────────────────────────────────────────────────────────

function SectionHeader({
    id,
    icon,
    title,
    subtitle,
    status,
}: {
    id: string;
    icon: ReactNode;
    title: string;
    subtitle?: string;
    status?: "configured" | "incomplete" | "optional";
}) {
    return (
        <div id={`stage-section-${id}`} className="flex items-center gap-3 scroll-mt-16">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-alloy-pine/15 bg-alloy-pine/5 text-sm text-alloy-pine">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-semibold text-alloy-midnight leading-snug">{title}</h3>
                {subtitle ? <p className="text-[11px] text-alloy-midnight/50 mt-0.5">{subtitle}</p> : null}
            </div>
            {status === "incomplete" ? (
                <span className="shrink-0 rounded-full bg-alloy-ember/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-ember">
                    Incomplete
                </span>
            ) : status === "configured" ? (
                <span className="shrink-0 rounded-full bg-alloy-juniper/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-juniper">
                    Configured
                </span>
            ) : null}
        </div>
    );
}

function Section({
    id,
    icon,
    title,
    subtitle,
    status,
    children,
}: {
    id: string;
    icon: ReactNode;
    title: string;
    subtitle?: string;
    status?: "configured" | "incomplete" | "optional";
    children: ReactNode;
}) {
    return (
        <section className="stage-editor-v2-section border-t border-alloy-forge/8 pt-5">
            <SectionHeader id={id} icon={icon} title={title} subtitle={subtitle} status={status} />
            <div className="mt-4 pl-11">{children}</div>
        </section>
    );
}

// ─── Grain selector ───────────────────────────────────────────────────────────

const GRAIN_ICONS: Record<StageGrain, string> = {
    family: "🏠",
    child: "🧒",
    person: "👤",
    account: "🏢",
    work_item: "📋",
};

function GrainSelector({
    value,
    onChange,
}: {
    value: StageGrain | undefined;
    onChange: (grain: StageGrain) => void;
}) {
    const grains: StageGrain[] = ["family", "child", "person", "account", "work_item"];
    return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {grains.map((grain) => (
                <button
                    key={grain}
                    type="button"
                    onClick={() => onChange(grain)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-all ${
                        value === grain
                            ? "border-alloy-juniper bg-alloy-juniper/8 shadow-sm"
                            : "border-alloy-forge/15 bg-white hover:border-alloy-juniper/40 hover:bg-alloy-juniper/4"
                    }`}
                    data-testid={`grain-option-${grain}`}
                >
                    <span className="text-lg">{GRAIN_ICONS[grain]}</span>
                    <span className={`text-[11px] font-semibold leading-tight ${value === grain ? "text-alloy-juniper" : "text-alloy-midnight"}`}>
                        {GRAIN_LABELS[grain]}
                    </span>
                    <span className="text-[10px] text-alloy-midnight/45 leading-tight">{GRAIN_DESCRIPTIONS[grain]}</span>
                </button>
            ))}
        </div>
    );
}

// ─── Grain impact callout ────────────────────────────────────────────────────

function GrainImpactCallout({ grain }: { grain: StageGrain }) {
    const IMPACT: Record<StageGrain, { count: string; focus: string; actions: string }> = {
        family: {
            count: "Counts families (opportunities)",
            focus: "Focus Panel shows family / case context",
            actions: "Family-grain actions available: Schedule Tour, Close Lead, Update Lead Status",
        },
        child: {
            count: "Counts children (enrollment tracks) — a family with 2 children = 2 rows",
            focus: "Focus Panel shows child enrollment context: placement, status, desired start",
            actions: "Child-grain actions available: Enroll Child, Waitlist Child, Update Enrollment Status",
        },
        person: {
            count: "Counts individual person records",
            focus: "Focus Panel shows person / contact record",
            actions: "Person-grain actions available",
        },
        account: {
            count: "Counts customer account records",
            focus: "Focus Panel shows account overview",
            actions: "Account-grain actions available",
        },
        work_item: {
            count: "Counts active tasks or obligations",
            focus: "Focus Panel shows work item detail",
            actions: "Work item actions available",
        },
    };
    const impact = IMPACT[grain];
    return (
        <div className="mt-3 rounded-lg border border-alloy-blue/20 bg-alloy-blue/5 px-4 py-3 text-[11px] space-y-1.5">
            <p className="font-semibold text-alloy-blue text-[10px] uppercase tracking-wider mb-2">
                Effect of {GRAIN_LABELS[grain]} grain
            </p>
            <div className="flex gap-2">
                <span className="text-alloy-midnight/40">Queue count</span>
                <span className="text-alloy-midnight/75">{impact.count}</span>
            </div>
            <div className="flex gap-2">
                <span className="text-alloy-midnight/40 shrink-0">Focus Panel</span>
                <span className="text-alloy-midnight/75">{impact.focus}</span>
            </div>
            <div className="flex gap-2">
                <span className="text-alloy-midnight/40 shrink-0">Actions</span>
                <span className="text-alloy-midnight/75">{impact.actions}</span>
            </div>
        </div>
    );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="mb-4">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/60">
                {label}
            </label>
            {children}
            {hint ? <p className="mt-1 text-[10px] text-alloy-midnight/40">{hint}</p> : null}
        </div>
    );
}

const INPUT_CLS =
    "w-full rounded-lg border border-alloy-forge/15 bg-white px-3 py-2 text-[13px] text-alloy-midnight placeholder:text-alloy-midnight/35 focus:border-alloy-juniper focus:outline-none focus:ring-1 focus:ring-alloy-juniper/30";

const TEXTAREA_CLS = INPUT_CLS + " resize-none";

const SELECT_CLS =
    "w-full rounded-lg border border-alloy-forge/15 bg-white px-3 py-2 text-[13px] text-alloy-midnight focus:border-alloy-juniper focus:outline-none focus:ring-1 focus:ring-alloy-juniper/30 cursor-pointer";

// ─── Action catalog panel ────────────────────────────────────────────────────

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
    const catalogActions = listPlatformActions({ grain: grainFilter });

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
        context_dependent: "Context",
    };
    const REC_STYLES: Record<StageCandidateAction["recommendation"], string> = {
        recommended: "bg-alloy-blue/10 text-alloy-blue",
        ready: "bg-alloy-forge/8 text-alloy-midnight/60",
        context_dependent: "bg-alloy-gold/20 text-alloy-gold-dark",
    };

    return (
        <div className="space-y-1.5">
            {catalogActions.map((action) => {
                const candidate = candidateActions.find((a) => a.action_key === action.key);
                const enabled = !!candidate;
                return (
                    <div
                        key={action.key}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                            enabled
                                ? "border-alloy-juniper/25 bg-white"
                                : "border-alloy-forge/10 bg-alloy-stone/30 opacity-60"
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => toggleAction(action.key)}
                            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${enabled ? "bg-alloy-juniper" : "bg-alloy-forge/25"}`}
                            aria-label={enabled ? `Disable ${action.defaultLabel}` : `Enable ${action.defaultLabel}`}
                        >
                            <span
                                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${enabled ? "left-3.5" : "left-0.5"}`}
                            />
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-alloy-midnight leading-snug">{action.defaultLabel}</p>
                            <p className="text-[10px] text-alloy-midnight/45">{action.category.replace("_", " ")}</p>
                        </div>
                        {enabled && candidate ? (
                            <button
                                type="button"
                                onClick={() => cycleRecommendation(action.key)}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REC_STYLES[candidate.recommendation]}`}
                                title="Click to cycle recommendation level"
                            >
                                {REC_LABELS[candidate.recommendation]}
                            </button>
                        ) : null}
                    </div>
                );
            })}
            <p className="text-[10px] text-alloy-midnight/40 pt-1">
                Stages prioritize actions — they don&apos;t own them. Click a badge to cycle: Recommended → Available → Context.
            </p>
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
        <div className="space-y-2">
            <p className="text-[11px] text-alloy-midnight/60 mb-2">
                When an action is invoked from family context but targets children, how should the runtime determine which children?
            </p>
            {strategies.map((s) => (
                <label
                    key={s}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                        value === s
                            ? "border-alloy-juniper/30 bg-alloy-juniper/6"
                            : "border-alloy-forge/12 bg-white hover:border-alloy-juniper/20"
                    }`}
                >
                    <input
                        type="radio"
                        name="subject_resolution"
                        value={s}
                        checked={value === s}
                        onChange={() => onChange(s)}
                        className="h-3.5 w-3.5 accent-alloy-juniper shrink-0"
                    />
                    <span className="text-[12px] text-alloy-midnight">{SUBJECT_RESOLUTION_LABELS[s]}</span>
                </label>
            ))}
        </div>
    );
}

// ─── Outcomes section ────────────────────────────────────────────────────────

function PossibleOutcomesSection({
    operatingPlan,
}: {
    operatingPlan: import("@/lib/lifecycle/stageOperatingPlanV1").StageOperatingPlanV1 | null | undefined;
}) {
    const outcomes = operatingPlan?.outcomes ?? [];
    const outcomeRules = operatingPlan?.outcome_rules ?? [];
    if (!outcomes.length) {
        return (
            <div className="rounded-lg border border-dashed border-alloy-forge/20 px-4 py-6 text-center">
                <p className="text-[12px] text-alloy-midnight/50">
                    No outcomes configured yet.
                </p>
                <p className="text-[11px] text-alloy-midnight/35 mt-1">
                    Outcomes are configured in the Operating Plan section above. Each outcome maps to a status change or stage transition.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-2">
            {outcomes.map((outcome) => {
                const rule = outcomeRules.find((r) => r.when_outcome_key === outcome.outcome_key) ?? null;
                return (
                    <div
                        key={outcome.outcome_key}
                        className="flex items-start gap-3 rounded-lg border border-alloy-forge/12 bg-white px-3 py-3"
                    >
                        <div
                            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${outcome.successful ? "bg-alloy-juniper" : "bg-alloy-midnight/30"}`}
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-alloy-midnight">{outcome.label}</p>
                            {rule?.targets[0] ? (
                                <p className="text-[11px] text-alloy-midnight/50 mt-0.5">
                                    → {rule.targets[0].kind.replace(/_/g, " ")}
                                    {rule.targets[0].status_key ? `: ${rule.targets[0].status_key}` : ""}
                                </p>
                            ) : null}
                        </div>
                        {outcome.successful ? (
                            <span className="shrink-0 rounded-full bg-alloy-juniper/10 px-2 py-0.5 text-[10px] font-semibold text-alloy-juniper">
                                Success
                            </span>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Preview section ──────────────────────────────────────────────────────────

function StagePreviewSection({
    stageLabel,
    grain,
    bootstrap,
}: {
    stageLabel: string;
    grain: StageGrain | undefined;
    bootstrap: LifecycleStageBootstrapPayload | null;
}) {
    return (
        <div className="rounded-lg border border-alloy-forge/12 bg-white overflow-hidden">
            <div className="flex items-center gap-2 bg-alloy-pine px-4 py-2.5">
                <span className="text-[11px] font-semibold text-white/90">{stageLabel || "Stage"}</span>
                {grain ? (
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] text-white/80">
                        {GRAIN_LABELS[grain]} grain
                    </span>
                ) : null}
            </div>
            <div className="p-4">
                <p className="text-[11px] text-alloy-midnight/50 mb-3">
                    Operational simulation — shows how an operator experiences this stage. Save configuration changes to update the preview.
                </p>
                {bootstrap?.pipeline ? (
                    <div className="space-y-2">
                        <div className="text-[11px] font-semibold text-alloy-midnight/60 uppercase tracking-wider mb-2">
                            Queue preview
                        </div>
                        <div className="rounded border border-alloy-forge/10 divide-y divide-alloy-forge/8">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                    <div className="h-2.5 w-2.5 rounded-full bg-alloy-forge/20" />
                                    <div className="flex-1">
                                        <div className="h-3 w-28 rounded bg-alloy-forge/12" />
                                    </div>
                                    <div className="h-3 w-16 rounded-full bg-alloy-forge/8" />
                                    <div className="h-3 w-14 rounded bg-alloy-juniper/20" />
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-alloy-midnight/35 mt-2">
                            Live preview requires saved configuration. Open the work unit to see real operator data.
                        </p>
                    </div>
                ) : (
                    <div className="text-[11px] text-alloy-midnight/45 rounded-lg border border-dashed border-alloy-forge/20 px-4 py-5 text-center">
                        Preview available after this stage is saved and queue lanes are synced.
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Save bar ─────────────────────────────────────────────────────────────────

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
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-alloy-forge/10 bg-white/95 px-5 py-3 backdrop-blur-sm">
            <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-alloy-midnight">{stageLabel || stageKey}</p>
                <p className="text-[10px] text-alloy-midnight/40 font-mono">{stageKey}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {isDirty && saveState !== "saving" ? (
                    <span className="text-[10px] font-medium text-alloy-ember" data-testid="stage-editor-v2-unsaved">
                        Unsaved changes
                    </span>
                ) : saveState === "saved" ? (
                    <span className="text-[10px] font-medium text-alloy-juniper" data-testid="stage-editor-v2-saved">
                        Saved
                    </span>
                ) : null}
                {saveState === "error" && saveError ? (
                    <span className="max-w-[12rem] text-right text-[10px] text-red-700" role="alert">
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
    { id: "identity", label: "Stage Identity" },
    { id: "representation", label: "Operational Representation" },
    { id: "experience", label: "Operational Experience" },
    { id: "requirements", label: "Operational Requirements" },
    { id: "outcomes", label: "Possible Outcomes" },
    { id: "preview", label: "Preview" },
] as const;

function SectionAnchorNav({ activeSection }: { activeSection: string }) {
    return (
        <nav className="flex gap-1 overflow-x-auto border-b border-alloy-forge/8 bg-alloy-stone/40 px-5 py-2 scrollbar-hide">
            {SECTIONS.map((s) => (
                <a
                    key={s.id}
                    href={`#stage-section-${s.id}`}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        activeSection === s.id
                            ? "bg-white text-alloy-juniper shadow-sm"
                            : "text-alloy-midnight/55 hover:text-alloy-midnight"
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
    allStages,
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
    // ── Sub-editor refs (existing editors) ──
    const fieldReqRef = useRef<LifecycleStageFieldRequirementsEditorHandle | null>(null);
    const membershipRef = useRef<LifecycleStageQueueMembershipEditorHandle | null>(null);
    const rollupRef = useRef<LifecycleStageStatusRollupEditorHandle | null>(null);
    const operatingPlanRef = useRef<LifecycleStageOperatingPlanEditorHandle | null>(null);

    // ── Existing editor dirty states ──
    const [fieldDirty, setFieldDirty] = useState(false);
    const [membershipDirty, setMembershipDirty] = useState(false);
    const [rollupDirty, setRollupDirty] = useState(false);
    const [operatingPlanDirty, setOperatingPlanDirty] = useState(false);

    // ── V2 new fields state ──
    const [grain, setGrain] = useState<StageGrain | undefined>(stageRecord?.grain);
    const [purpose, setPurpose] = useState<StagePurpose | undefined>(stageRecord?.purpose);
    const [description, setDescription] = useState(stageRecord?.description ?? "");
    const [parentStageKey, setParentStageKey] = useState(stageRecord?.parent_stage_key ?? "");
    const [allowSkipping, setAllowSkipping] = useState(stageRecord?.allow_skipping ?? false);
    const [operatorGuidance, setOperatorGuidance] = useState(stageRecord?.operator_guidance ?? "");
    const [subjectResolution, setSubjectResolution] = useState<StageSubjectResolutionStrategy | undefined>(
        stageRecord?.subject_resolution_strategy ?? "ask_operator",
    );
    const [candidateActions, setCandidateActions] = useState<StageCandidateAction[]>(
        stageRecord?.action_catalog_v1?.candidate_actions ?? [],
    );

    // Track V2 dirty state
    const savedGrain = stageRecord?.grain;
    const savedPurpose = stageRecord?.purpose;
    const savedDescription = stageRecord?.description ?? "";
    const savedParentKey = stageRecord?.parent_stage_key ?? "";
    const savedAllowSkipping = stageRecord?.allow_skipping ?? false;
    const savedGuidance = stageRecord?.operator_guidance ?? "";
    const savedResolution = stageRecord?.subject_resolution_strategy ?? "ask_operator";

    const v2Dirty =
        grain !== savedGrain ||
        purpose !== savedPurpose ||
        description !== savedDescription ||
        parentStageKey !== savedParentKey ||
        allowSkipping !== savedAllowSkipping ||
        operatorGuidance !== savedGuidance ||
        subjectResolution !== savedResolution;

    const isDirty = fieldDirty || membershipDirty || rollupDirty || operatingPlanDirty || v2Dirty;

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    // Reset V2 state when stage changes
    useEffect(() => {
        setGrain(stageRecord?.grain);
        setPurpose(stageRecord?.purpose);
        setDescription(stageRecord?.description ?? "");
        setParentStageKey(stageRecord?.parent_stage_key ?? "");
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
            purpose,
            description: description || undefined,
            parent_stage_key: parentStageKey || undefined,
            allow_skipping: allowSkipping,
            operator_guidance: operatorGuidance || undefined,
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

    const grainIsChild = grain === "child";

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
                <p className="mx-5 mt-2 text-xs text-red-700" role="alert">
                    {statusesError}
                </p>
            ) : null}

            <div className="flex flex-col gap-0 px-5 pb-16 pt-4">
                {/* ── Section 1: Stage Identity ── */}
                <Section
                    id="identity"
                    icon="📋"
                    title="Stage Identity"
                    subtitle="Name, purpose, and structure of this stage"
                >
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Stage name">
                            <input
                                className={INPUT_CLS}
                                value={stageLabel}
                                readOnly
                                title="Edit stage name in the stage list"
                                data-testid="stage-editor-v2-label"
                            />
                            <p className="mt-1 text-[10px] text-alloy-midnight/35">
                                Rename in the stage list on the left.
                            </p>
                        </Field>
                        <Field label="Stage purpose">
                            <select
                                className={SELECT_CLS}
                                value={purpose ?? ""}
                                onChange={(e) => setPurpose((e.target.value as StagePurpose) || undefined)}
                                data-testid="stage-editor-v2-purpose"
                            >
                                <option value="">— Select purpose —</option>
                                {(Object.keys(PURPOSE_LABELS) as StagePurpose[]).map((p) => (
                                    <option key={p} value={p}>
                                        {PURPOSE_LABELS[p]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <Field label="Description" hint="Shown to operators in the stage selector and workspace landing.">
                        <textarea
                            className={TEXTAREA_CLS}
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What happens in this stage? What is the operator goal?"
                            data-testid="stage-editor-v2-description"
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Parent stage (optional)" hint="Groups this stage under a parent for sub-stage flows.">
                            <select
                                className={SELECT_CLS}
                                value={parentStageKey}
                                onChange={(e) => setParentStageKey(e.target.value)}
                                data-testid="stage-editor-v2-parent"
                            >
                                <option value="">— None —</option>
                                {(allStages ?? [])
                                    .filter((s) => s.key !== stageKey)
                                    .map((s) => (
                                        <option key={s.key} value={s.key}>
                                            {s.label}
                                        </option>
                                    ))}
                            </select>
                        </Field>
                        <Field label="Allow stage skipping">
                            <label className="flex cursor-pointer items-center gap-2 mt-1.5">
                                <input
                                    type="checkbox"
                                    checked={allowSkipping}
                                    onChange={(e) => setAllowSkipping(e.target.checked)}
                                    className="h-4 w-4 rounded accent-alloy-juniper"
                                    data-testid="stage-editor-v2-allow-skipping"
                                />
                                <span className="text-[12px] text-alloy-midnight">
                                    Operators can skip this stage
                                </span>
                            </label>
                        </Field>
                    </div>
                </Section>

                {/* ── Section 2: Operational Representation ── */}
                <Section
                    id="representation"
                    icon="⚙"
                    title="Operational Representation"
                    subtitle="Grain, queue, and surfaces — how this stage appears to operators"
                    status={grain ? "configured" : "incomplete"}
                >
                    <Field
                        label="Stage grain"
                        hint="Grain determines what a single queue row represents. Choose based on the primary subject of work in this stage."
                    >
                        <GrainSelector value={grain} onChange={setGrain} />
                        {grain ? <GrainImpactCallout grain={grain} /> : null}
                    </Field>

                    {grainIsChild ? (
                        <Field
                            label="When multiple children are eligible…"
                            hint="How the runtime resolves subject when an action is invoked from family context."
                        >
                            <SubjectResolutionField value={subjectResolution} onChange={setSubjectResolution} />
                        </Field>
                    ) : null}

                    {stageKey.trim() ? (
                        <>
                        <div className="mt-4 border-t border-alloy-forge/8 pt-4">
                            <p className="mb-3 text-[11px] font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                                Queue membership
                            </p>
                            <LifecycleStageQueueMembershipEditor
                                ref={membershipRef}
                                departmentId={departmentId}
                                stageKey={stageKey}
                                savedMembership={bootstrap?.queue_membership ?? null}
                                onDirtyChange={setMembershipDirty}
                            />
                            <div className="mt-4 border-t border-alloy-forge/8 pt-4">
                                <p className="mb-1 text-[11px] font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                                    Included statuses
                                </p>
                                <p className="mb-2 text-[11px] text-alloy-midnight/45">
                                    Records appear in this stage's queue when their status matches one of these.
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
                        </div>
                        <div className="mt-4 border-t border-alloy-forge/8 pt-4">
                            <p className="mb-1 text-[11px] font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                                Surface assignments
                            </p>
                            <p className="mb-3 text-[11px] text-alloy-midnight/45">
                                Assign published layouts to the queue row and Focus Panel for this stage. Missing assignments inherit from the process default.
                            </p>
                            <LifecycleStageLayoutAssignmentsCard
                                businessProcessKey={businessProcessKey}
                                stageKey={stageKey}
                                stageLabel={stageLabel}
                            />
                        </div>
                        </>
                    ) : null}
                </Section>

                {/* ── Section 3: Operational Experience ── */}
                <Section
                    id="experience"
                    icon="👤"
                    title="Operational Experience"
                    subtitle="Expected work, recommended actions, and operator guidance"
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

                            <div className="mt-5 border-t border-alloy-forge/8 pt-5">
                                <p className="mb-1 text-[11px] font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                                    Recommended actions
                                </p>
                                <p className="mb-3 text-[11px] text-alloy-midnight/45">
                                    Actions from the platform catalog that operators are encouraged to take in this stage.
                                    Enable, reorder, and set recommendation levels here.
                                </p>
                                <ActionCatalogPanel
                                    candidateActions={candidateActions}
                                    grain={grain}
                                    onChange={setCandidateActions}
                                />
                            </div>

                            <div className="mt-5 border-t border-alloy-forge/8 pt-5">
                                <Field
                                    label="Operator guidance"
                                    hint="Shown to operators when they open a record in this stage. Use this to communicate context, priorities, or tips."
                                >
                                    <textarea
                                        className={TEXTAREA_CLS}
                                        rows={3}
                                        value={operatorGuidance}
                                        onChange={(e) => setOperatorGuidance(e.target.value)}
                                        placeholder="e.g. 'Family has committed to enroll. Confirm placement and complete paperwork within 5 days.'"
                                        data-testid="stage-editor-v2-guidance"
                                    />
                                </Field>
                            </div>
                        </>
                    ) : (
                        <p className="text-[12px] text-alloy-midnight/45">Select a stage to configure experience.</p>
                    )}
                </Section>

                {/* ── Section 4: Operational Requirements ── */}
                <Section
                    id="requirements"
                    icon="✓"
                    title="Operational Requirements"
                    subtitle="What must be true for operators to move forward — entry, exit, and readiness"
                >
                    {stageKey.trim() ? (
                        <>
                            <p className="mb-3 text-[11px] text-alloy-midnight/50">
                                Required information blocks specific actions when missing. Entry and exit expectations guide operators without hard-locking the process.
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
                        <p className="text-[12px] text-alloy-midnight/45">Select a stage to configure requirements.</p>
                    )}
                </Section>

                {/* ── Section 5: Possible Outcomes ── */}
                <Section
                    id="outcomes"
                    icon="→"
                    title="Possible Outcomes"
                    subtitle="What can happen when operators act in this stage — status changes, transitions, side effects"
                >
                    <p className="mb-3 text-[11px] text-alloy-midnight/50">
                        Status is produced by execution — not configured here directly. Outcomes below are defined in the Operating Plan above and produce status changes when operators complete actions.
                    </p>
                    <PossibleOutcomesSection operatingPlan={bootstrap?.stage_operating_plan} />
                </Section>

                {/* ── Section 6: Preview ── */}
                <Section
                    id="preview"
                    icon="▶"
                    title="Preview this stage"
                    subtitle="Simulate how operators experience this stage before publishing"
                >
                    <StagePreviewSection stageLabel={stageLabel} grain={grain} bootstrap={bootstrap} />
                </Section>
            </div>
        </div>
    );
}
