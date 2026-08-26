"use client";

/**
 * StageEditorV2 — single-scroll stage definition document.
 *
 * Sections: Stage Identity · Operational Representation · Operational Experience ·
 *           Operational Requirements · Possible Outcomes
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useMemo } from "react";
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
} from "lucide-react";
import BusinessProcessPublicationBar from "@/components/adminV2/settings/lifecycle/BusinessProcessPublicationBar";
import StageFormRequirementsEditor from "@/components/adminV2/settings/lifecycle/StageFormRequirementsEditor";
import StagePaperworkCard from "@/components/adminV2/settings/lifecycle/StagePaperworkCard";
import StagePerChildPathsEditor from "@/components/adminV2/settings/lifecycle/StagePerChildPathsEditor";
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
    GRAIN_LABELS,
    GRAIN_DESCRIPTIONS,
    SUBJECT_RESOLUTION_LABELS,
    type StageGrain,
    type StageSubjectResolutionStrategy,
} from "@/lib/lifecycle/stageGrainV1";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageCandidateAction } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageOperatingPlanDraftSave } from "@/lib/lifecycle/stageOperatingPlanDraftDelta";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { enrollmentStageMembership } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import type { LifecycleStageSaveUiState } from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkspace";
import StageOperatingPlanOverview from "@/components/adminV2/settings/lifecycle/StageOperatingPlanOverview";

// ─── Types ───────────────────────────────────────────────────────────────────

export type StageEditorV2Handle = {
    getFieldDraftRules: () => LifecycleStageFieldRulesStored | null;
    isFieldDirty: () => boolean;
    getQueueDisplayName: () => string | null;
    getQueueMembershipDraft: () => QueueMembershipV1 | null;
    isQueueMembershipDirty: () => boolean;
    getStatusRollupDraft: () => StatusRollupV1 | null;
    isStatusRollupDirty: () => boolean;
    getStageOperatingPlanDraft: () => StageOperatingPlanDraftSave | null;
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
            <span className="flex items-center gap-1 rounded-full bg-alloy-juniper/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-alloy-juniper">
                <Check size={9} strokeWidth={3} />
                Configured
            </span>
        );
    }
    if (status === "incomplete") {
        return (
            <span className="rounded-full bg-alloy-ember/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-alloy-ember">
                Incomplete
            </span>
        );
    }
    if (status === "missing") {
        return (
            <span className="flex items-center gap-1 rounded-full bg-alloy-ember/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-alloy-ember">
                <AlertCircle size={9} />
                Required setup missing
            </span>
        );
    }
    return (
        <span className="rounded-full bg-alloy-midnight/6 px-2 py-0.5 text-[0.6875rem] font-medium text-alloy-midnight/40">
            Optional
        </span>
    );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
    id,
    icon,
    title,
    summary,
    status,
    collapsed,
    onToggle,
    children,
}: {
    id: string;
    icon: ReactNode;
    title: string;
    /**
     * What this section contains, stated on the header row. Progressive disclosure (objective 7)
     * fails when a collapsed section is a bare title — the operator has to open it to find out
     * whether it holds anything, which is the opposite of disclosure.
     */
    summary?: string;
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
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-alloy-stone/50"
                aria-expanded={!collapsed}
            >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-alloy-midnight/10 bg-alloy-stone text-alloy-midnight/50">
                    {icon}
                </div>
                <span className="shrink-0 text-[0.8125rem] font-semibold text-alloy-midnight">{title}</span>
                {summary ? (
                    <span
                        className="min-w-0 flex-1 truncate text-[0.75rem] text-alloy-midnight/45"
                        data-testid={`stage-section-summary-${id}`}
                    >
                        {summary}
                    </span>
                ) : (
                    <span className="flex-1" />
                )}
                <SectionStatusBadge status={status} />
                {collapsed
                    ? <ChevronRight size={13} className="ml-1 shrink-0 text-alloy-midnight/30" />
                    : <ChevronDown size={13} className="ml-1 shrink-0 text-alloy-midnight/30" />}
            </button>
            {!collapsed && (
                <div className="px-5 pb-5 pt-1">
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
                            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-alloy-midnight/20 px-1.5 py-px text-[0.6875rem] font-semibold uppercase tracking-wide text-alloy-midnight/50 whitespace-nowrap">
                                Coming soon
                            </span>
                        )}
                        <span className={active ? "text-alloy-juniper" : "text-alloy-midnight/35"}>
                            {GRAIN_ICONS[grain]}
                        </span>
                        <span className={`text-[0.6875rem] font-semibold leading-tight ${active ? "text-alloy-juniper" : "text-alloy-midnight/60"}`}>
                            {GRAIN_LABELS[grain]}
                        </span>
                        <span className="text-[0.6875rem] leading-tight text-alloy-midnight/35">
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
        <div className="mt-3 rounded-lg border border-alloy-blue/15 bg-alloy-blue/4 px-4 py-3 space-y-1.5 text-[0.6875rem]">
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

/**
 * One field. Label, control, optional hint — on the shared `.stage-*` grid so a field rendered
 * here lines up with one rendered by any sub-editor. Before this there were four label
 * treatments and three control heights inside a single screen.
 */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="stage-field">
            <label className="stage-field__label">{label}</label>
            {children}
            {hint ? <p className="stage-field__hint">{hint}</p> : null}
        </div>
    );
}

const INPUT_CLS = "stage-control";
const TEXTAREA_CLS = "stage-control";

// ─── Subsection divider ───────────────────────────────────────────────────────

function Subsection({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
    return (
        <div className="mt-4 border-t border-alloy-forge/8 pt-3">
            <p className="stage-section-label mb-1">{label}</p>
            {description ? <p className="stage-field__hint mb-2">{description}</p> : null}
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
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-alloy-midnight/45">{label}</span>
            </button>
            {open && (
                <div className="mt-3">
                    {description ? <p className="mb-3 text-[0.6875rem] text-alloy-midnight/45">{description}</p> : null}
                    {children}
                </div>
            )}
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
            <p className="mb-2.5 text-[0.6875rem] text-alloy-midnight/50">
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
                        <span className="text-[0.75rem] text-alloy-midnight">{SUBJECT_RESOLUTION_LABELS[s]}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

// ─── Possible outcomes ────────────────────────────────────────────────────────

const OUTCOME_TARGET_LABELS: Record<string, string> = {
    update_family_case_status: "Move to stage",
    update_child_enrollment_status: "Move to stage",
    update_candidate_status: "Move to stage",
    create_needs_attention: "Create attention",
    create_next_work: "Create follow-up work",
    reopen_work: "Reopen work",
    mark_stage_work_complete: "Complete stage work",
    move_to_stage: "Move to stage",
    no_movement: "Stay in stage",
    stamp_enrollment_date: "Stamp Enrollment Date",
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
                <p className="text-[0.75rem] text-alloy-midnight/50">No outcomes configured yet.</p>
                <p className="mt-1 text-[0.6875rem] text-alloy-midnight/35">
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
                const stageTarget = targets.find((t) => t.kind === "move_to_stage");
                // Status targets (update_family_case_status etc.) are implied by move_to_stage;
                // only show them standalone when there is no stage movement.
                const closeTarget = !stageTarget
                    ? targets.find(
                          (t) =>
                              t.kind === "update_family_case_status" ||
                              t.kind === "update_child_enrollment_status" ||
                              t.kind === "update_candidate_status",
                      )
                    : undefined;
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
                                    <p className="text-[0.75rem] font-semibold text-alloy-midnight">{outcome.label}</p>
                                    {outcome.successful ? (
                                        <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-alloy-juniper/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-alloy-juniper">
                                            <Check size={9} strokeWidth={3} />
                                            Successful
                                        </span>
                                    ) : null}
                                </div>
                                {stageTarget ? (
                                    <p className="mt-1 text-[0.6875rem] text-alloy-blue">
                                        Move to stage:{" "}
                                        <span className="font-semibold">{stageTarget.stage_key ?? "—"}</span>
                                    </p>
                                ) : closeTarget ? (
                                    <p className="mt-1 text-[0.6875rem] text-alloy-midnight/55">Close lead</p>
                                ) : targets.length > 0 ? (
                                    <p className="mt-1 text-[0.6875rem] text-alloy-midnight/40">Stay in stage</p>
                                ) : null}
                                {sideEffects.map((t, i) => (
                                    <p key={i} className="mt-0.5 text-[0.6875rem] text-alloy-midnight/45">
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
    saveState,
    saveError,
    saveNotice,
    saveDisabled,
    isDirty,
    onSave,
    onDelete,
}: {
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    saveNotice?: string | null;
    saveDisabled: boolean;
    isDirty: boolean;
    onSave: () => void | Promise<void>;
    onDelete?: () => void;
}) {
    return (
        // Tightened: this bar and the publication bar sit directly on top of each other, and with
        // nothing to report the save bar was ~55px of empty white above another full-width bar.
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-alloy-forge/10 bg-white/96 px-5 py-2 backdrop-blur-sm">
            <div className="flex items-center gap-2">
                {isDirty && saveState !== "saving" ? (
                    <span className="text-[0.6875rem] font-medium text-alloy-ember" data-testid="stage-editor-v2-unsaved">
                        Unsaved changes
                    </span>
                ) : saveState === "saved" ? (
                    saveNotice ? (
                        // Saved, but the graph is not publishable yet. Saying only "Draft saved"
                        // here and refusing at publish teaches operators to distrust both.
                        <span
                            className="flex items-center gap-1 max-w-[20rem] text-[0.6875rem] font-medium text-alloy-ember"
                            data-testid="stage-editor-v2-remaining-issues"
                            role="status"
                        >
                            <AlertCircle size={11} />
                            {saveNotice}
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-alloy-juniper" data-testid="stage-editor-v2-saved">
                            <Check size={11} strokeWidth={2.5} />
                            Draft saved
                        </span>
                    )
                ) : null}
                {saveState === "error" && saveError ? (
                    <span className="flex items-center gap-1 max-w-[12rem] text-[0.6875rem] text-alloy-ember" role="alert">
                        <AlertCircle size={11} />
                        {saveError}
                    </span>
                ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {onDelete ? (
                    <button
                        type="button"
                        onClick={onDelete}
                        className="text-[0.6875rem] font-medium text-alloy-midnight/40 hover:text-alloy-ember transition-colors"
                        data-testid="lifecycle-activation-delete-stage"
                    >
                        Delete stage
                    </button>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function StageEditorV2({
    departmentId,
    businessProcessKey,
    stageKey,
    stageLabel,
    stageRecord,
    allStages: _allStages,
    processTracks,
    process,
    bootstrap,
    bootstrapLoading,
    entityDisplayLabels,
    statusesError,
    saveState,
    saveError,
    saveNotice,
    onSaveStage,
    onDirtyChange,
    onDeleteStage,
    workspaceRef,
    onValidateConfiguration,
    onPublishConfiguration,
    onReloadConfiguration,
    publicationBusy,
    publicationNotice,
}: {
    departmentId: string;
    businessProcessKey: string;
    stageKey: string;
    stageLabel: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    allStages?: LifecycleBuilderStageRecord[];
    processTracks?: ProcessTracksV1 | null;
    /** P6.S3 — active process including command_set_v1 when stamped. */
    process?: import("@/lib/lifecycle/lifecycleBuilderConfig").LifecycleBuilderProcessRecord | null;
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    entityDisplayLabels?: Partial<Record<LifecycleRequirementEntityKey, string>>;
    statusesError: string | null;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    saveNotice?: string | null;
    onSaveStage: () => void | Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
    onDeleteStage?: () => void;
    workspaceRef?: React.RefObject<StageEditorV2Handle | null>;
    /** Publication workflow — draft is saved here, runtime only moves when the operator publishes. */
    onValidateConfiguration?: () => void | Promise<void>;
    onPublishConfiguration?: () => void | Promise<void>;
    onReloadConfiguration?: () => void | Promise<void>;
    publicationBusy?: boolean;
    publicationNotice?: string | null;
}) {
    // ── Sub-editor refs ──
    const fieldReqRef = useRef<LifecycleStageFieldRequirementsEditorHandle | null>(null);
    const operatingPlanRef = useRef<LifecycleStageOperatingPlanEditorHandle | null>(null);

    // ── Sub-editor dirty states ──
    const [fieldDirty, setFieldDirty] = useState(false);
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

    // ── Collapse state ──
    // Operational Experience opens; everything else starts collapsed. A director arrives asking
    // "what do my staff do here?", and every section being shut meant the answer was always at
    // least one click away on a page whose whole purpose is to answer it. Identity and Context
    // are set once at stage creation — they stay closed until sought.
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
        identity: true,
        representation: true,
        experience: false,
        requirements: true,
        outcomes: true,
    });
    /**
     * Child-grain stages of this process — the only destinations a per-child path may target.
     * Derived from configuration rather than named here: the validator refuses a decision whose
     * movement lands on a family stage, and a picker that offered one would author a known error.
     */
    const perChildDestinations = useMemo(
        () =>
            (process?.stages ?? [])
                .filter((s) => s.is_active && s.grain === "child")
                .map((s) => ({ key: s.key, label: s.label })),
        [process],
    );

    const toggleSection = useCallback((id: string) => {
        setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    /**
     * What each section holds, said on its header row so a collapsed page still communicates.
     * Derived from the same bootstrap the editors write — a summary cannot claim configuration
     * the stage does not have.
     */
    const sectionSummaries: Record<string, string | undefined> = (() => {
        const plan = bootstrap?.stage_operating_plan ?? null;
        const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

        const workCount = plan?.work_templates?.length ?? 0;
        const exitCount = plan?.outgoing_transitions?.length ?? 0;
        const attentionCount = plan?.attention_rules?.length ?? 0;
        const experience =
            workCount || exitCount || attentionCount
                ? [
                      count(workCount, "work item"),
                      // "ways out", not "way outs" — the plural is on the noun.
                      count(exitCount, "way out", "ways out"),
                      attentionCount ? count(attentionCount, "attention rule") : null,
                  ]
                      .filter(Boolean)
                      .join(" · ")
                : "Nothing configured yet";

        const reqRules = bootstrap?.field_requirements ?? null;
        const reqCount = reqRules
            ? Object.values(reqRules as Record<string, unknown>).reduce<number>(
                  (n, group) => n + (group && typeof group === "object" ? Object.keys(group).length : 0),
                  0,
              )
            : 0;

        return {
            experience,
            requirements: reqCount ? count(reqCount, "required field") : "No required fields",
            identity: purpose?.trim() || description?.trim() || "Not described",
            representation: grain ? `One row per ${GRAIN_LABELS[grain].toLowerCase()}` : undefined,
        };
    })();

    // ── V2 dirty tracking — committed baseline updated on stage switch or successful save ──
    const [savedV2, setSavedV2] = useState(() => ({
        grain: stageRecord?.grain,
        purpose: stageRecord?.purpose ?? "",
        description: stageRecord?.description ?? "",
        allowSkipping: stageRecord?.allow_skipping ?? false,
        operatorGuidance: stageRecord?.operator_guidance ?? "",
        subjectResolution: (stageRecord?.subject_resolution_strategy ?? "ask_operator") as StageSubjectResolutionStrategy,
    }));

    const v2Dirty =
        grain !== savedV2.grain ||
        purpose !== savedV2.purpose ||
        description !== savedV2.description ||
        allowSkipping !== savedV2.allowSkipping ||
        operatorGuidance !== savedV2.operatorGuidance ||
        subjectResolution !== savedV2.subjectResolution;

    const isDirty = fieldDirty || operatingPlanDirty || v2Dirty;

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    // Reset local state when the active stage changes
    useEffect(() => {
        const next = {
            grain: stageRecord?.grain,
            purpose: stageRecord?.purpose ?? "",
            description: stageRecord?.description ?? "",
            allowSkipping: stageRecord?.allow_skipping ?? false,
            operatorGuidance: stageRecord?.operator_guidance ?? "",
            subjectResolution: (stageRecord?.subject_resolution_strategy ?? "ask_operator") as StageSubjectResolutionStrategy,
        };
        setGrain(next.grain);
        setPurpose(next.purpose);
        setDescription(next.description);
        setAllowSkipping(next.allowSkipping);
        setOperatorGuidance(next.operatorGuidance);
        setSubjectResolution(next.subjectResolution);
        setCandidateActions(stageRecord?.action_catalog_v1?.candidate_actions ?? []);
        setSavedV2(next);
    }, [stageKey, stageRecord]);

    // Commit current field values as the new baseline when save transitions saving → saved.
    // This clears dirty state immediately without waiting for stageRecord to propagate.
    const prevSaveStateRef = useRef<LifecycleStageSaveUiState>("idle");
    useEffect(() => {
        if (prevSaveStateRef.current === "saving" && saveState === "saved") {
            setSavedV2({
                grain,
                purpose,
                description,
                allowSkipping,
                operatorGuidance,
                subjectResolution: subjectResolution ?? "ask_operator",
            });
        }
        prevSaveStateRef.current = saveState;
    }, [saveState, grain, purpose, description, allowSkipping, operatorGuidance, subjectResolution]);

    useImperativeHandle(workspaceRef, () => ({
        getFieldDraftRules: () => fieldReqRef.current?.getDraftRules() ?? null,
        isFieldDirty: () => fieldReqRef.current?.isDirty() ?? false,
        getQueueDisplayName: () => null,
        // Queue membership and status rollup are now configured via Work Views, not stage editor.
        getQueueMembershipDraft: () => null,
        isQueueMembershipDirty: () => false,
        getStatusRollupDraft: () => null,
        isStatusRollupDirty: () => false,
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

    const outcomeCount = bootstrap?.stage_operating_plan?.outcomes?.length ?? 0;

    // ── Section completion status ──
    const sectionStatus: Record<string, SectionStatus> = {
        identity: purpose.trim() || description.trim() ? "configured" : "optional",
        representation: grain ? "configured" : "missing",
        experience: operatorGuidance.trim() || bootstrap?.stage_operating_plan?.outcomes?.length ? "configured" : "optional",
        requirements: bootstrap?.field_requirements ? "configured" : "optional",
        outcomes: outcomeCount > 0 ? "configured" : "optional",
    };

    if (bootstrapLoading && !bootstrap) {
        return (
            <div className="animate-pulse space-y-3 p-5" data-testid="stage-editor-v2-skeleton">
                <div className="h-10 w-2/3 rounded-lg bg-alloy-forge/10" />
                <div className="h-32 rounded-lg bg-alloy-forge/8" />
                <div className="h-48 rounded-lg bg-alloy-forge/6" />
            </div>
        );
    }

    return (
        <div className="stage-editor-v2 relative flex flex-col" data-testid="stage-editor-v2">
            <StickyTopbar
                saveState={effectiveSaveState}
                saveError={saveError}
                saveNotice={saveNotice ?? null}
                saveDisabled={saveDisabled}
                isDirty={isDirty}
                onSave={onSaveStage}
                onDelete={onDeleteStage}
            />

            {onValidateConfiguration && onPublishConfiguration && onReloadConfiguration ? (
                <BusinessProcessPublicationBar
                    state={bootstrap?.configuration_state ?? null}
                    busy={publicationBusy ?? false}
                    notice={publicationNotice ?? null}
                    onValidate={onValidateConfiguration}
                    onPublish={onPublishConfiguration}
                    onReload={onReloadConfiguration}
                />
            ) : null}

            {statusesError ? (
                <p className="mx-5 mt-2 flex items-center gap-1.5 text-xs text-alloy-ember" role="alert">
                    <AlertCircle size={12} />
                    {statusesError}
                </p>
            ) : null}

            <div className="flex flex-col pb-16">

                {/* ── Stage Overview ──
                    The operating plan in operator language, above the editors and readable
                    without expanding anything. Everything here is derived from the same draft the
                    editors write, so the page cannot describe configuration it does not have. */}
                <div
                    className="border-b border-alloy-forge/10 px-5 py-4"
                    data-testid="stage-editor-v2-overview"
                >
                    <StageOperatingPlanOverview
                        plan={bootstrap?.stage_operating_plan ?? null}
                        stageLabel={stageLabel || stageKey}
                    />
                </div>

                {/* ── Reading order (objective 9) ──
                    Overview → Operator Work → Stage Exit → Attention → Requirements → Publish.
                    Identity and Context describe how the stage is STORED and are set once when
                    it is created; they used to sit between the overview and the work, so every
                    visit to the thing operators actually configure began by scrolling past two
                    sections nobody had come for. They now follow the work.

                    Attention stays inside Operational Experience rather than becoming a sibling
                    section here. It is part of the operating-plan draft, and lifting it out
                    would move state ownership for the sake of layout — the same thing the
                    work-item slice established must not happen. */}
                {/* ── Section 3: Operational Experience ── */}
                <Section
                    id="experience"
                    icon={<BookOpen size={13} />}
                    title="Operator work"
                    summary={sectionSummaries.experience}
                    status={sectionStatus.experience}
                    collapsed={!!collapsed.experience}
                    onToggle={() => toggleSection("experience")}
                >
                    {/*
                     * Per-child paths belong with the stage's ways out, because that is what they
                     * are: the way a CHILD leaves a family stage. Only rendered on a family-grain
                     * stage with child-grain destinations — on a child stage the concept is
                     * meaningless and offering it would invite a nonsense configuration.
                     */}
                    {stageKey.trim() && stageRecord?.grain === "family" && perChildDestinations.length
                        ? (stageRecord?.stage_operating_plan_v1?.work_templates ?? []).map((template) => (
                              <StagePerChildPathsEditor
                                  key={template.template_key}
                                  departmentId={departmentId}
                                  stageKey={stageKey}
                                  stageLabel={stageLabel}
                                  templateKey={template.template_key}
                                  templateLabel={template.label ?? template.template_key}
                                  decisions={template.participant_decisions ?? []}
                                  process={process ?? null}
                                  childStages={perChildDestinations}
                                  childStatuses={(bootstrap?.record_status_vocabulary ?? [])
                                      .filter((r) => r.is_active !== false && /member|child/i.test(r.entity_type))
                                      .map((r) => ({ status_key: r.status_key, status_label: r.status_label }))}
                                  onSaved={onReloadConfiguration}
                              />
                          ))
                        : null}
                    {stageKey.trim() ? (
                        <>
                            <LifecycleStageOperatingPlanEditor
                                ref={operatingPlanRef}
                                stageKey={stageKey}
                                stageLabel={stageLabel}
                                savedPlan={bootstrap?.stage_operating_plan ?? null}
                                onDirtyChange={setOperatingPlanDirty}
                                actionCatalog={stageRecord?.action_catalog_v1 ?? null}
                                configuredActions={bootstrap?.actions ?? []}
                                processStages={
                                    _allStages?.map((stage) => ({
                                        key: stage.key,
                                        label: stage.label,
                                        ...(stage.grain ? { grain: stage.grain } : {}),
                                    })) ?? []
                                }
                                processTracks={processTracks ?? null}
                                process={
                                    process ?? {
                                        id: businessProcessKey,
                                        key: businessProcessKey,
                                        name: businessProcessKey,
                                        primary_entity: "opportunity",
                                        sort_order: 0,
                                        is_active: true,
                                        stages: _allStages ?? [],
                                    }
                                }
                                configuredStatuses={
                                // The record-status catalog, not the queue picker. The picker
                                // drops case-layer rows, which is exactly what a transition writes.
                                bootstrap?.record_status_vocabulary ?? []
                            }
                            />

                            <Subsection label="Operator guidance">
                                <p className="mb-2 text-[0.6875rem] text-alloy-midnight/45">
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
                        <p className="stage-field__hint">Select a stage to configure experience.</p>
                    )}
                </Section>
                {/* ── Section 4: Operational Requirements ── */}
                <Section
                    id="requirements"
                    icon={<ClipboardCheck size={13} />}
                    title="Requirements"
                    summary={sectionSummaries.requirements}
                    status={sectionStatus.requirements}
                    collapsed={!!collapsed.requirements}
                    onToggle={() => toggleSection("requirements")}
                >
                    {stageKey.trim() ? (
                        <>
                            <p className="stage-field__hint mb-2.5">
                                Required fields block specific actions when missing.
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
                            {/* The director's sentence first; the canonical rows underneath it. */}
                            <StagePaperworkCard
                                departmentId={departmentId}
                                stageKey={stageKey}
                                stageRecord={stageRecord ?? null}
                                process={process ?? null}
                                onSaved={onReloadConfiguration}
                            />
                            <StageFormRequirementsEditor
                                departmentId={departmentId}
                                stageKey={stageKey}
                                stageLabel={stageLabel}
                                stageRecord={stageRecord ?? null}
                                process={process ?? null}
                                onSaved={onReloadConfiguration}
                            />
                        </>
                    ) : (
                        <p className="stage-field__hint">Select a stage to configure requirements.</p>
                    )}
                </Section>
                {/* ── Section 1: Stage Identity ── */}
                <Section
                    id="identity"
                    icon={<Tag size={13} />}
                    title="Stage identity"
                    summary={sectionSummaries.identity}
                    status={sectionStatus.identity}
                    collapsed={!!collapsed.identity}
                    onToggle={() => toggleSection("identity")}
                >
                    <div className="stage-grid stage-grid--2">
                        <Field label="Stage name" hint="Rename in the stage list on the left.">
                            <input
                                className={INPUT_CLS}
                                value={stageLabel}
                                readOnly
                                title="Rename in the stage list"
                                data-testid="stage-editor-v2-label"
                            />
                        </Field>
                        <Field label="Purpose" hint="Shown to operators in the stage picker.">
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

                    <div className="mt-3" />
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
                                className="h-4 w-4 rounded-md accent-alloy-juniper"
                                data-testid="stage-editor-v2-allow-skipping"
                            />
                            <span className="text-[0.75rem] text-alloy-midnight">Operators can skip this stage</span>
                        </label>
                    </Field>
                </Section>
                {/* ── Section 2: Stage Context ── */}
                <Section
                    id="representation"
                    summary={sectionSummaries.representation}
                    icon={<Layers size={13} />}
                    title="Stage Context"
                    status={sectionStatus.representation}
                    collapsed={!!collapsed.representation}
                    onToggle={() => toggleSection("representation")}
                >
                    {/* Grain — the single authoritative setting for what one unit of work represents */}
                    <Field label="Row type (grain)">
                        <GrainSelector value={grain} onChange={setGrain} />
                        {grain ? <GrainImpactCallout grain={grain} /> : null}
                        <p className="mt-3 text-[0.6875rem] text-alloy-midnight/50">
                            Stage grain is the authoritative row type for this stage. Work Views and surfaces use this grain — one queue row per <span className="font-medium text-alloy-midnight/70">{grain ? GRAIN_LABELS[grain].toLowerCase() : "unit of the selected type"}</span>.{" "}
                            Surface layout and filters are configured in <span className="font-medium text-alloy-midnight/70">Work Views</span>.
                        </p>
                    </Field>

                    {grain === "child" ? (
                        <Field label="When multiple children are eligible…">
                            <SubjectResolutionField value={subjectResolution} onChange={setSubjectResolution} />
                        </Field>
                    ) : null}

                    {(() => {
                        const membership = enrollmentStageMembership(stageKey);
                        if (!membership) return null;
                        const question =
                            membership.grain === "child"
                                ? "Which child records belong here?"
                                : "Which leads belong here?";
                        const subject = membership.grain === "child" ? "Children" : "Leads";
                        return (
                            <Subsection label="Stage membership" description={question}>
                                <div
                                    className="rounded-lg border border-alloy-stone/25 bg-alloy-stone/[0.03] px-4 py-3"
                                    data-testid="stage-membership-context"
                                >
                                    <p className="text-[0.75rem] text-alloy-midnight/70">
                                        {subject} with <span className="font-medium text-alloy-midnight">stage = {stageKey}</span> belong to this stage.
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <span className="text-[0.6875rem] text-alloy-midnight/45">
                                            {membership.grain === "child" ? "Child enrollment state:" : "Lead status:"}
                                        </span>
                                        {membership.states.map((s) => (
                                            <span
                                                key={s.key}
                                                className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[0.6875rem] font-medium text-alloy-pine"
                                                data-testid={`stage-membership-state-${s.key}`}
                                            >
                                                {s.label}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-2 text-[0.6875rem] text-alloy-midnight/40">
                                        Records land here when an outcome moves them to this stage. Membership is the persisted stage — not a status filter.
                                    </p>
                                </div>
                            </Subsection>
                        );
                    })()}
                </Section>

                {/* ── Section 5: Possible Outcomes ── */}


            </div>
        </div>
    );
}
