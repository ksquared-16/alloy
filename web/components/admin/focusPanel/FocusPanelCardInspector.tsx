"use client";

import { useMemo, useState, type ReactNode } from "react";

import { UNIVERSAL_CARD_ICON_BY_NAME } from "@/components/admin/focusPanel/UniversalCardIcon";
import {
    FOCUS_PANEL_COLLECTION_RENDERERS,
    FOCUS_PANEL_COLLECTION_RENDERER_LABELS,
    FOCUS_PANEL_CONDITION_KINDS,
    FOCUS_PANEL_CONDITION_KIND_LABELS,
    FOCUS_PANEL_CONDITION_OPERATORS,
    FOCUS_PANEL_CONDITION_OPERATOR_LABELS,
    FOCUS_PANEL_FIELD_RENDERERS,
    FOCUS_PANEL_FIELD_RENDERER_LABELS,
    configFields,
    defaultEvidenceGroupsForCard,
    effectiveFieldOwner,
    evidenceGroupsFromConfig,
    validateFocusPanelCardConfig,
    type FocusPanelCardCondition,
    type FocusPanelCardConfig,
    type FocusPanelCardField,
    type FocusPanelCollectionRenderer,
    type FocusPanelConditionKind,
    type FocusPanelConditionOperator,
    type FocusPanelFieldRenderer,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import {
    addEvidenceGroup,
    addFieldToGroup,
    addRelatedView,
    moveEvidenceGroup,
    moveFieldToGroup,
    moveFieldWithinGroup,
    removeEvidenceGroup,
    removeFieldFromGroup,
    removeRelatedView,
    renameEvidenceGroup,
    setFieldOwnership,
    setGroupInExpanded,
    setGroupOwner,
    setGroupPurpose,
    setGroupVisibility,
    updateFieldInGroups,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelEvidenceGroupOps";
import { FOCUS_PANEL_CARD_CATALOG } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import {
    resolveCardCompositionPreference,
    type CardOperationalWeight,
    type CardPerspectiveExpansion,
    type CardPreferredRow,
} from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import { isOperationalTruthCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    defaultCardExpansion,
    defaultCardFields,
    getFocusPanelCardReference,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardReference";
import { availableFieldsForFocusPanelCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardFieldPicker";
import { legacyConceptToRefKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCompat";
import { categoryDisplayLabel } from "@/lib/fields/fieldCatalogForSettings";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import type { AvailableField } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import {
    CONCEPT_TREE,
    buildConceptPath,
    parseConceptPath,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCatalog";
import {
    currentPlacementVariant,
    placementVariantsFor,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardAuthoring";
import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Contextual Card Inspector for the Surfaces editor (Experience Builder V2).
 *
 * Authors OPERATIONAL MEANING, not a field list. Sections follow the card-definition
 * pipeline — Question → Evidence (groups own the fields) → Presentation → Behavior →
 * Editing (ownership) → Expansion → Conditions → Actions → AI — so the operator edits
 * "what should operators see / own / edit", never archetype/tier/instance jargon.
 * Edits flow through `onChange` as a new `FocusPanelCardConfig`; the runtime reads the
 * evidence groups flattened via `configFields`, so grouping never forks rendering.
 */

// Experience Builder V3 authoring pipeline: Evidence Groups → Presentation → Editing →
// Expanded → Related Views → Actions → Conditions → AI (ownership lives at the group
// level). Behavior (composition) stays available until the canvas owns it.
const INSPECTOR_TABS = [
    "question",
    "evidence",
    "presentation",
    "editing",
    "expanded",
    "related",
    "actions",
    "conditions",
    "ai",
    "behavior",
] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number];

const TAB_LABELS: Record<InspectorTab, string> = {
    question: "Question",
    evidence: "Evidence Groups",
    presentation: "Presentation",
    editing: "Editing",
    expanded: "Expanded",
    related: "Related Views",
    actions: "Actions",
    conditions: "Conditions",
    ai: "AI",
    behavior: "Behavior",
};

const DENSITIES: readonly FocusPanelCardDensity[] = ["micro", "compact", "standard", "expanded"];

/** Owner options (every business concept has exactly one owning card). */
const OWNER_OPTIONS: readonly { key: FocusPanelCardKey; label: string }[] = FOCUS_PANEL_CARD_CATALOG.filter(
    (e): e is typeof e & { cardKey: FocusPanelCardKey } => Boolean(e.cardKey),
).map((e) => ({ key: e.cardKey, label: e.label }));

const WEIGHT_OPTIONS: readonly { value: CardOperationalWeight; label: string }[] = [
    { value: "heavy", label: "Heavy — anchors a lane" },
    { value: "medium", label: "Medium — supporting" },
    { value: "light", label: "Light — compact companion" },
];

const ROW_OPTIONS: readonly { value: CardPreferredRow; label: string }[] = [
    { value: "lead", label: "Lead" },
    { value: "support", label: "Support" },
    { value: "context", label: "Context" },
    { value: "footer", label: "Footer" },
];

/**
 * Depth ceiling, labeled by the Operational Depth Doctrine (Evidence / Focus /
 * Workspace) rather than the underlying `perspectiveExpansion` keys.
 * @see docs/platform/operator/operational-depth-doctrine.md
 */
const DEPTH_OPTIONS: readonly { value: CardPerspectiveExpansion; label: string; truthOnly: boolean }[] = [
    { value: "in_place", label: "Evidence — see more in place", truthOnly: false },
    { value: "takeover_row", label: "Focus — bring forward (+ edit)", truthOnly: true },
    { value: "takeover_surface", label: "Workspace — large operational work", truthOnly: true },
];

type HistoryInfo = {
    publishedVersion: number | null;
    hasDraft: boolean;
    dirty: boolean;
};

type Props = {
    baseModel: FocusPanelCardModel;
    instanceId: string;
    config: FocusPanelCardConfig;
    onChange: (next: FocusPanelCardConfig) => void;
    onClose: () => void;
    onDuplicate?: () => void;
    onRemove?: () => void;
    history: HistoryInfo;
    /** Drill-in mode: hide presentation/evidence field authoring — those live inline on the runtime. */
    metadataOnly?: boolean;
    /**
     * Switch a card between the presentations it actually implements. Present only
     * for a card that declares more than one; the host applies both halves of the
     * choice — the appearance density and the placement span — because a Compact
     * choice rendered at Summary width is not a choice.
     */
    onPresentationChange?: (card: FocusPanelCardKey, variantLabel: string) => void;
};

const FIELD = "config-runtime-input";
const LABEL = "config-typo-field-label";
const SECTION_CARD = "space-y-2 rounded-lg border border-alloy-forge/14 p-3";

export default function FocusPanelCardInspector({
    baseModel,
    instanceId,
    config,
    onChange,
    onClose,
    onDuplicate,
    onRemove,
    history,
    metadataOnly = false,
    onPresentationChange,
}: Props) {
    const visibleTabs = useMemo(
        () =>
            metadataOnly
                ? (["question", "conditions", "actions", "ai", "behavior"] as const)
                : INSPECTOR_TABS,
        [metadataOnly],
    );
    const [tab, setTab] = useState<InspectorTab>(metadataOnly ? "question" : "question");
    const reference = getFocusPanelCardReference(baseModel.key);
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const cardFieldOptions = useMemo(
        () => availableFieldsForFocusPanelCard(baseModel.key, tenantFieldDefinitions),
        [baseModel.key, tenantFieldDefinitions],
    );

    const appearance = config.appearance ?? {};
    const effectiveTitle = appearance.titleOverride?.trim() || baseModel.title;
    const placementVariants = useMemo(() => placementVariantsFor(baseModel.key), [baseModel.key]);
    const currentVariant = currentPlacementVariant(baseModel.key, appearance.density ?? baseModel.density);

    // Edit against a config that always carries explicit evidence groups: when a card
    // has no fields yet, seed a default "Details" group from the reference so authoring
    // (and the first persisted edit) operate on real evidence, not an empty list.
    const editingConfig = useMemo<FocusPanelCardConfig>(() => {
        if ((config.evidenceGroups?.length ?? 0) > 0 || configFields(config).length > 0) return config;
        const groups = defaultEvidenceGroupsForCard(baseModel.key, defaultCardFields(baseModel.key));
        if (groups.length === 0) return config;
        return { ...config, evidenceGroups: groups };
    }, [config, baseModel.key]);

    const groups = useMemo(() => evidenceGroupsFromConfig(editingConfig), [editingConfig]);
    const fields = useMemo(() => configFields(editingConfig), [editingConfig]);
    const expansion = config.expansion ?? defaultCardExpansion(baseModel.key);
    const conditions = config.conditions ?? [];
    const conceptOptions = useMemo(
        () => cardFieldOptions.map((field) => field.key),
        [cardFieldOptions],
    );

    // Ownership-aware validation (binding, renderer, group names, edit-only-on-owner).
    const validation = useMemo(() => validateFocusPanelCardConfig(editingConfig, baseModel.key), [editingConfig, baseModel.key]);

    const patchAppearance = (patch: Partial<NonNullable<FocusPanelCardConfig["appearance"]>>) =>
        onChange({ ...editingConfig, appearance: { ...appearance, ...patch } });

    // Composition: config override wins, else the card's platform-default preference.
    const defaultPref = resolveCardCompositionPreference(baseModel.key);
    const composition = config.composition ?? {};
    const truthCard = isOperationalTruthCard(baseModel.key);
    const effectiveWeight = composition.weight ?? defaultPref.weight;
    const effectiveRow = composition.preferredRow ?? defaultPref.preferredRow;
    const rawDepth = composition.perspectiveExpansion ?? defaultPref.perspectiveExpansion;
    const effectiveDepth: CardPerspectiveExpansion = truthCard ? rawDepth : "in_place";
    const patchComposition = (patch: Partial<NonNullable<FocusPanelCardConfig["composition"]>>) =>
        onChange({ ...editingConfig, composition: { ...composition, ...patch } });

    // ── Evidence-group + field mutations (all route through the pure ops) ──
    const updateField = (id: string, patch: Partial<FocusPanelCardField>) =>
        onChange(updateFieldInGroups(editingConfig, id, patch));
    const removeField = (id: string) => onChange(removeFieldFromGroup(editingConfig, id));
    const moveFieldUpDown = (id: string, dir: -1 | 1) => onChange(moveFieldWithinGroup(editingConfig, id, dir));
    const addField = (groupId: string, kind: FocusPanelCardField["kind"]) => {
        const taken = new Set(fields.map((f) => f.id));
        let n = fields.length + 1;
        while (taken.has(`custom_${n}`)) n += 1;
        const next: FocusPanelCardField =
            kind === "collection"
                ? {
                      id: `custom_${n}`,
                      label: "New related list",
                      concept: "Enrollment → Children → Summary",
                      renderer: "count_expand",
                      kind: "collection",
                      placement: expansion.default,
                      maxRows: 3,
                      emptyText: "No records",
                  }
                : {
                      id: `custom_${n}`,
                      label: cardFieldOptions[0]?.label ?? "New field",
                      refKey: cardFieldOptions[0]?.key ?? "person.primary_contact_name",
                      concept: legacyConceptToRefKey(cardFieldOptions[0]?.key ?? "") ?? cardFieldOptions[0]?.key ?? "",
                      renderer: "text",
                      kind: "field",
                      placement: expansion.default,
                  };
        onChange(addFieldToGroup(editingConfig, groupId, next));
    };

    const addCondition = () =>
        onChange({
            ...editingConfig,
            conditions: [
                ...conditions,
                { kind: "visible_when", concept: conceptOptions[0] ?? "Enrollment → Children → Summary", operator: "exists" },
            ],
        });
    const updateCondition = (index: number, patch: Partial<FocusPanelCardCondition>) =>
        onChange({ ...editingConfig, conditions: conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
    const removeCondition = (index: number) =>
        onChange({ ...editingConfig, conditions: conditions.filter((_, i) => i !== index) });

    return (
        <aside
            data-testid="focus-panel-card-inspector"
            data-focus-panel-inspector-instance={instanceId}
            data-focus-panel-inspector-card={baseModel.key}
            className="process-config-setup-card flex h-full w-full flex-col overflow-hidden"
        >
            <header className="flex items-start justify-between gap-2 border-b border-alloy-stone/30 px-4 py-2.5">
                <div className="min-w-0">
                    <p className="config-typo-field-label">Card</p>
                    <h3 className="config-typo-queue-item-title truncate">{effectiveTitle}</h3>
                </div>
                <button
                    type="button"
                    data-testid="focus-panel-inspector-close"
                    onClick={onClose}
                    aria-label="Close inspector"
                    className="config-typo-meta rounded-md px-1 py-0.5 text-alloy-forge/70 hover:text-alloy-midnight"
                >
                    ✕
                </button>
            </header>

            <div role="tablist" aria-label="Card inspector" className="flex flex-wrap gap-1 border-b border-alloy-stone/30 px-3 py-2">
                {visibleTabs.map((t) => {
                    const active = t === tab;
                    return (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            data-focus-panel-inspector-tab={t}
                            onClick={() => setTab(t)}
                            className={[
                                "config-typo-field-label rounded-md px-2 py-1 normal-case transition-colors",
                                active ? "bg-alloy-pine/10 text-alloy-pine" : "text-alloy-forge/70 hover:bg-alloy-stone/10 hover:text-alloy-midnight",
                            ].join(" ")}
                        >
                            {TAB_LABELS[t]}
                        </button>
                    );
                })}
            </div>

            {!validation.ok ? (
                <div
                    className="mx-3 mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"
                    data-focus-panel-inspector-validation="invalid"
                    data-focus-panel-validation-count={validation.issues.length}
                    role="status"
                >
                    <p className="config-typo-field-label text-amber-800">Needs attention before publish</p>
                    <ul className="mt-1 space-y-0.5">
                        {validation.issues.map((issue) => (
                            <li key={`${issue.scope}-${issue.ref}-${issue.message}`} className="config-typo-meta text-amber-800">
                                {issue.message}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-focus-panel-inspector-tab-panel={tab}>
                {tab === "question" ? (
                    <div className="space-y-3">
                        <Labeled label="The question this card answers">
                            <input
                                data-testid="inspector-question"
                                className={FIELD}
                                value={config.question ?? ""}
                                placeholder={reference?.description ? `e.g. ${reference.description}` : "What should operators know here?"}
                                onChange={(e) => onChange({ ...editingConfig, question: e.target.value })}
                            />
                        </Labeled>
                        <Labeled label="Card name">
                            <input
                                data-testid="inspector-title"
                                className={FIELD}
                                value={appearance.titleOverride ?? ""}
                                placeholder={baseModel.title}
                                onChange={(e) => patchAppearance({ titleOverride: e.target.value })}
                            />
                        </Labeled>
                        <Labeled label="Card icon">
                            <select
                                data-testid="inspector-icon"
                                className={FIELD}
                                value={appearance.iconName ?? ""}
                                onChange={(e) =>
                                    patchAppearance({ iconName: e.target.value.trim() || null })
                                }
                            >
                                <option value="">Default ({baseModel.iconName ?? "LayoutGrid"})</option>
                                {Object.keys(UNIVERSAL_CARD_ICON_BY_NAME).map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </Labeled>
                        <Labeled label="Supporting description">
                            <textarea
                                data-testid="inspector-description"
                                className={`${FIELD} resize-none`}
                                rows={3}
                                value={appearance.description ?? ""}
                                placeholder={reference?.description ?? baseModel.insight}
                                onChange={(e) => patchAppearance({ description: e.target.value })}
                            />
                        </Labeled>
                        <p className="config-typo-meta">The question leads the card. Name and description apply live to the published workspace.</p>
                    </div>
                ) : tab === "evidence" ? (
                    <div className="space-y-3" data-focus-panel-inspector-evidence={String(groups.length)}>
                        <p className="config-typo-sublabel">
                            Group the evidence that answers the question. Fields live inside a group — reorder with the arrows; bind each to a business concept.
                        </p>
                        {groups.length === 0 ? <Empty>No evidence yet. Add a group below.</Empty> : null}
                        {groups.map((group, groupIndex) => (
                            <div key={group.id} data-focus-panel-evidence-group={group.id} className="space-y-2 rounded-lg border border-alloy-pine/20 bg-alloy-pine/[0.03] p-2.5">
                                <div className="flex items-center gap-1.5">
                                    <input
                                        aria-label={`Group ${group.label} name`}
                                        className={`${FIELD} font-semibold`}
                                        value={group.label}
                                        onChange={(e) => onChange(renameEvidenceGroup(editingConfig, group.id, e.target.value))}
                                    />
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        <IconBtn label={`Move ${group.label} up`} disabled={groupIndex === 0} onClick={() => onChange(moveEvidenceGroup(editingConfig, group.id, -1))}>↑</IconBtn>
                                        <IconBtn label={`Move ${group.label} down`} disabled={groupIndex === groups.length - 1} onClick={() => onChange(moveEvidenceGroup(editingConfig, group.id, 1))}>↓</IconBtn>
                                        <button
                                            type="button"
                                            aria-label={`Remove ${group.label}`}
                                            data-focus-panel-evidence-group-remove={group.id}
                                            onClick={() => onChange(removeEvidenceGroup(editingConfig, group.id))}
                                            className="rounded-md border border-red-300 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                                <input
                                    aria-label={`${group.label} purpose`}
                                    data-focus-panel-group-purpose={group.id}
                                    className={`${FIELD} italic`}
                                    placeholder="What operational question does this group answer?"
                                    value={group.purpose ?? ""}
                                    onChange={(e) => onChange(setGroupPurpose(editingConfig, group.id, e.target.value))}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="config-typo-meta flex items-center gap-1">
                                        Owned by
                                        <select
                                            aria-label={`${group.label} owner`}
                                            data-focus-panel-group-owner={group.id}
                                            className={FIELD}
                                            value={group.owner ?? baseModel.key}
                                            onChange={(e) => onChange(setGroupOwner(editingConfig, group.id, e.target.value as FocusPanelCardKey))}
                                        >
                                            {OWNER_OPTIONS.map((o) => (
                                                <option key={o.key} value={o.key}>{o.label}{o.key === baseModel.key ? " (this card)" : ""}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                <div className="flex flex-wrap items-center gap-3" data-focus-panel-group-visibility={group.id}>
                                    <span className="config-typo-meta font-semibold">Visible in:</span>
                                    <label className="config-typo-meta flex items-center gap-1">
                                        <input type="checkbox" className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40" data-focus-panel-group-summary={group.id} checked={Boolean(group.showInSummary)} onChange={(e) => onChange(setGroupVisibility(editingConfig, group.id, { showInSummary: e.target.checked }))} />
                                        Summary
                                    </label>
                                    <label className="config-typo-meta flex items-center gap-1">
                                        <input type="checkbox" className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40" data-focus-panel-group-focus={group.id} checked={Boolean(group.showInFocus)} onChange={(e) => onChange(setGroupVisibility(editingConfig, group.id, { showInFocus: e.target.checked }))} />
                                        Focus
                                    </label>
                                    <label className="config-typo-meta flex items-center gap-1">
                                        <input type="checkbox" className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40" data-focus-panel-group-expanded={group.id} checked={Boolean(group.includeInExpanded)} onChange={(e) => onChange(setGroupInExpanded(editingConfig, group.id, e.target.checked))} />
                                        Expanded
                                    </label>
                                </div>
                                {group.fields.length === 0 ? <Empty>No fields in this group.</Empty> : null}
                                {group.fields.map((field, index) => (
                                    <FieldRow
                                        key={field.id}
                                        field={field}
                                        canUp={index > 0}
                                        canDown={index < group.fields.length - 1}
                                        availableFields={cardFieldOptions}
                                        groups={groups.map((g) => ({ id: g.id, label: g.label }))}
                                        currentGroupId={group.id}
                                        onUp={() => moveFieldUpDown(field.id, -1)}
                                        onDown={() => moveFieldUpDown(field.id, 1)}
                                        onRemove={() => removeField(field.id)}
                                        onChange={(patch) => updateField(field.id, patch)}
                                        onMoveToGroup={(toGroupId) => onChange(moveFieldToGroup(editingConfig, field.id, toGroupId))}
                                    />
                                ))}
                                <div className="flex gap-2">
                                    <button type="button" data-focus-panel-add-field={group.id} onClick={() => addField(group.id, "field")} className="config-secondary-btn config-primary-btn--sm flex-1">＋ Field</button>
                                    <button type="button" data-focus-panel-add-related={group.id} onClick={() => addField(group.id, "collection")} className="config-secondary-btn config-primary-btn--sm flex-1">＋ Related list</button>
                                </div>
                            </div>
                        ))}
                        <button type="button" data-testid="inspector-add-group" onClick={() => onChange(addEvidenceGroup(editingConfig, "New group"))} className="config-secondary-btn config-primary-btn--sm w-full">＋ Add evidence group</button>
                    </div>
                ) : tab === "presentation" ? (
                    <div className="space-y-3">
                        {/*
                          * A CARD WITH REAL PRESENTATIONS IS CHOSEN BY NAME, NOT BY SIZE.
                          *
                          * Financials is one identity and one read model with two implemented
                          * presentations. Offering that as "Compact / Standard" made the operator
                          * pick a density and hope; offering it as Summary / Compact names the two
                          * cards they can actually see. The span travels with the choice — it is
                          * how the platform places the card, not what is being chosen.
                          */}
                        {placementVariants.length > 1 ?
                            <Labeled label="Presentation">
                                <select
                                    data-testid="inspector-presentation"
                                    className={FIELD}
                                    value={currentVariant ?? placementVariants[0]!.variantLabel}
                                    onChange={(e) => onPresentationChange?.(baseModel.key, e.target.value)}
                                >
                                    {placementVariants.map((v) => (
                                        <option key={v.variantLabel} value={v.variantLabel}>
                                            {v.variantLabel}
                                        </option>
                                    ))}
                                </select>
                            </Labeled>
                        :   <Labeled label="Size">
                                <select
                                    data-testid="inspector-density"
                                    className={FIELD}
                                    value={appearance.density ?? baseModel.density}
                                    onChange={(e) => patchAppearance({ density: e.target.value as FocusPanelCardDensity })}
                                >
                                    {DENSITIES.map((d) => (
                                        <option key={d} value={d}>
                                            {d[0]!.toUpperCase() + d.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </Labeled>
                        }
                        <p className="config-typo-meta">
                            {placementVariants.length > 1
                                ? "Both presentations are the same card and the same account — only how much of it this placement shows."
                                : "Size applies live to the published workspace — the runtime computes exact spacing."}
                        </p>
                    </div>
                ) : tab === "behavior" ? (
                    <div className="space-y-3" data-focus-panel-inspector-behavior={effectiveWeight} data-focus-panel-composition-depth={effectiveDepth}>
                        <Labeled label="Weight">
                            <select data-testid="inspector-weight" className={FIELD} value={effectiveWeight} onChange={(e) => patchComposition({ weight: e.target.value as CardOperationalWeight })}>
                                {WEIGHT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </Labeled>
                        <Labeled label="Reading band">
                            <select data-testid="inspector-preferred-row" className={FIELD} value={effectiveRow} onChange={(e) => patchComposition({ preferredRow: e.target.value as CardPreferredRow })}>
                                {ROW_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </Labeled>
                        <Labeled label="Depth">
                            <select data-testid="inspector-depth" className={FIELD} value={effectiveDepth} disabled={!truthCard} onChange={(e) => patchComposition({ perspectiveExpansion: e.target.value as CardPerspectiveExpansion })}>
                                {DEPTH_OPTIONS.filter((o) => truthCard || !o.truthOnly).map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </Labeled>
                        <p className="config-typo-meta">
                            {truthCard
                                ? "Weight and band shape how the engine composes lanes when no layout is published; depth sets how far this card opens. Applies live."
                                : "Diagnostic cards stay at Evidence depth — they expand in place or hand off to the owning card, never becoming a Focus Card."}
                        </p>
                    </div>
                ) : tab === "editing" ? (
                    <div className="space-y-2" data-focus-panel-inspector-editing={String(fields.length)}>
                        <p className="config-typo-sublabel">
                            Every concept has one owning card. Choose where each field is owned, and whether operators can edit it here. A concept is editable only on its owner.
                        </p>
                        {fields.length === 0 ? <Empty>Add evidence first.</Empty> : null}
                        {fields.map((field) => {
                            const owner = effectiveFieldOwner(field, baseModel.key);
                            const ownedHere = owner === baseModel.key;
                            return (
                                <div key={field.id} data-focus-panel-editing-field={field.id} className={SECTION_CARD}>
                                    <p className="config-typo-field-label">{field.label}</p>
                                    <Labeled label="Owned by">
                                        <select
                                            aria-label={`${field.label} owner`}
                                            data-focus-panel-field-owner={field.id}
                                            className={FIELD}
                                            value={owner}
                                            onChange={(e) => onChange(setFieldOwnership(editingConfig, field.id, { owner: e.target.value as FocusPanelCardKey, ...(e.target.value !== baseModel.key ? { editable: false } : {}) }))}
                                        >
                                            {OWNER_OPTIONS.map((o) => (
                                                <option key={o.key} value={o.key}>{o.label}{o.key === baseModel.key ? " (this card)" : ""}</option>
                                            ))}
                                        </select>
                                    </Labeled>
                                    <div className="flex flex-wrap gap-3">
                                        <label className="config-typo-meta flex items-center gap-1" title={ownedHere ? "" : "Editable only on the owning card"}>
                                            <input
                                                type="checkbox"
                                                className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40"
                                                data-focus-panel-field-editable={field.id}
                                                disabled={!ownedHere}
                                                checked={Boolean(field.editable) && ownedHere}
                                                onChange={(e) => onChange(setFieldOwnership(editingConfig, field.id, { editable: e.target.checked }))}
                                            />
                                            Editable here
                                        </label>
                                        <label className="config-typo-meta flex items-center gap-1">
                                            <input type="checkbox" className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40" data-focus-panel-field-required={field.id} checked={Boolean(field.required)} onChange={(e) => onChange(setFieldOwnership(editingConfig, field.id, { required: e.target.checked }))} />
                                            Required
                                        </label>
                                        <label className="config-typo-meta flex items-center gap-1">
                                            <input type="checkbox" className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40" data-focus-panel-field-readonly={field.id} checked={Boolean(field.readOnly)} onChange={(e) => onChange(setFieldOwnership(editingConfig, field.id, { readOnly: e.target.checked }))} />
                                            Read only
                                        </label>
                                    </div>
                                    {!ownedHere ? <p className="config-typo-meta text-alloy-forge/70">Shown read-only here — edit it on {OWNER_OPTIONS.find((o) => o.key === owner)?.label ?? owner}.</p> : null}
                                </div>
                            );
                        })}
                    </div>
                ) : tab === "expanded" ? (
                    <div className="space-y-3" data-focus-panel-inspector-expanded={String(groups.length)}>
                        <p className="config-typo-sublabel">
                            Expanded reveals the SAME question with additional configured evidence groups (not history — that is a Related View). Choose which groups appear when the card is expanded.
                        </p>
                        {groups.length === 0 ? <Empty>Add evidence groups first.</Empty> : null}
                        {groups.map((group) => (
                            <label key={group.id} data-focus-panel-expanded-group={group.id} className="flex items-center justify-between gap-2 rounded-lg border border-alloy-forge/14 px-3 py-2">
                                <span className="config-typo-field-label">{group.label}</span>
                                <span className="config-typo-meta flex items-center gap-1.5">
                                    <input
                                        type="checkbox"
                                        className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40"
                                        checked={Boolean(group.includeInExpanded)}
                                        onChange={(e) => onChange(setGroupInExpanded(editingConfig, group.id, e.target.checked))}
                                    />
                                    Show in Expanded
                                </span>
                            </label>
                        ))}
                        <p className="config-typo-meta">Expanded overlays downward and never reflows surrounding cards.</p>
                    </div>
                ) : tab === "related" ? (
                    <div className="space-y-2" data-focus-panel-inspector-related={String((config.relatedViews ?? []).length)}>
                        <p className="config-typo-sublabel">
                            Related Views are optional drill-downs to a related operational report (Schedule History, Placement History, Billing History …). They are NOT Expanded — a Related View opens a different report.
                        </p>
                        {(config.relatedViews ?? []).length === 0 ? <Empty>No related views.</Empty> : (config.relatedViews ?? []).map((view) => (
                            <div key={view.id} data-focus-panel-related-view={view.id} className="flex items-center justify-between gap-2 rounded-lg border border-alloy-forge/14 px-3 py-2">
                                <input
                                    aria-label={`Related view ${view.label} name`}
                                    className={`${FIELD} font-medium`}
                                    value={view.label}
                                    onChange={(e) => onChange({ ...editingConfig, relatedViews: (config.relatedViews ?? []).map((v) => (v.id === view.id ? { ...v, label: e.target.value } : v)) })}
                                />
                                <button type="button" aria-label={`Remove ${view.label}`} data-focus-panel-related-view-remove={view.id} onClick={() => onChange(removeRelatedView(editingConfig, view.id))} className="rounded-md border border-red-300 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50">✕</button>
                            </div>
                        ))}
                        <button type="button" data-testid="inspector-add-related-view" onClick={() => onChange(addRelatedView(editingConfig, "New report"))} className="config-secondary-btn config-primary-btn--sm w-full">＋ Add related view</button>
                    </div>
                ) : tab === "conditions" ? (
                    <div className="space-y-2">
                        {conditions.length === 0 ? <Empty>No conditions. This card is always visible.</Empty> : conditions.map((condition, index) => (
                            <div
                                // eslint-disable-next-line react/no-array-index-key
                                key={index}
                                data-focus-panel-inspector-condition={condition.kind}
                                className={SECTION_CARD}
                            >
                                <div className="flex items-center gap-1.5">
                                    <select aria-label="Condition kind" className={FIELD} value={condition.kind} onChange={(e) => updateCondition(index, { kind: e.target.value as FocusPanelConditionKind })}>
                                        {FOCUS_PANEL_CONDITION_KINDS.map((k) => (
                                            <option key={k} value={k}>{FOCUS_PANEL_CONDITION_KIND_LABELS[k]}</option>
                                        ))}
                                    </select>
                                    <button type="button" aria-label="Remove condition" onClick={() => removeCondition(index)} className="rounded-md border border-red-300 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50">✕</button>
                                </div>
                                <ConceptPicker label="Condition concept" value={condition.concept} onChange={(concept) => updateCondition(index, { concept })} />
                                <div className="flex gap-1.5">
                                    <select aria-label="Condition operator" className={FIELD} value={condition.operator} onChange={(e) => updateCondition(index, { operator: e.target.value as FocusPanelConditionOperator })}>
                                        {FOCUS_PANEL_CONDITION_OPERATORS.map((op) => (
                                            <option key={op} value={op}>{FOCUS_PANEL_CONDITION_OPERATOR_LABELS[op]}</option>
                                        ))}
                                    </select>
                                    {condition.operator === "is" || condition.operator === "is_not" ? (
                                        <input aria-label="Condition value" className={FIELD} value={condition.value ?? ""} placeholder="value" onChange={(e) => updateCondition(index, { value: e.target.value })} />
                                    ) : null}
                                </div>
                            </div>
                        ))}
                        <button type="button" data-testid="inspector-add-condition" onClick={addCondition} className="config-secondary-btn config-primary-btn--sm w-full">＋ Add condition</button>
                        <p className="config-typo-meta">Conditions are saved with the surface. Runtime enforcement is not yet applied.</p>
                    </div>
                ) : tab === "actions" ? (
                    <div className="space-y-2">
                        {(reference?.actions ?? []).length === 0 ? <Empty>No card actions configured.</Empty> : (reference?.actions ?? []).map((action) => (
                            <div key={action} className="flex items-center justify-between rounded-lg border border-alloy-forge/14 px-3 py-2 text-xs text-alloy-midnight">
                                {action}
                                <span className="config-typo-meta">card action</span>
                            </div>
                        ))}
                        {onDuplicate || onRemove ? (
                            <div className="flex gap-2 border-t border-alloy-forge/10 pt-2">
                                {onDuplicate ? <button type="button" data-testid="inspector-duplicate-card" onClick={onDuplicate} className="rounded-lg border border-alloy-forge/20 px-2.5 py-1 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]">Duplicate card</button> : null}
                                {onRemove ? <button type="button" data-testid="inspector-remove-card" onClick={onRemove} className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Remove card</button> : null}
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-alloy-midnight">BOS suggestions</p>
                        {buildAiRecommendations(baseModel.key, fields, history).map((rec) => (
                            <div key={rec} data-focus-panel-inspector-ai-rec="true" className="config-typo-sublabel rounded-lg border border-alloy-pine/20 bg-alloy-pine/[0.04] px-3 py-2 text-alloy-midnight/85">
                                {rec}
                            </div>
                        ))}
                        <p className="config-typo-meta">Advisory only — BOS never edits the surface.</p>
                    </div>
                )}
            </div>
        </aside>
    );
}

function FieldRow({
    field,
    canUp,
    canDown,
    availableFields,
    groups,
    currentGroupId,
    onUp,
    onDown,
    onRemove,
    onChange,
    onMoveToGroup,
}: {
    field: FocusPanelCardField;
    canUp: boolean;
    canDown: boolean;
    availableFields: AvailableField[];
    groups: { id: string; label: string }[];
    currentGroupId: string;
    onUp: () => void;
    onDown: () => void;
    onRemove: () => void;
    onChange: (patch: Partial<FocusPanelCardField>) => void;
    onMoveToGroup: (toGroupId: string) => void;
}) {
    const isCollection = field.kind === "collection";
    return (
        <div data-focus-panel-inspector-field={field.id} data-focus-panel-field-kind={field.kind} className={SECTION_CARD}>
            <div className="flex items-center gap-1.5">
                <input aria-label={`${field.label} label`} className={`${FIELD} font-medium`} value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
                <div className="flex shrink-0 items-center gap-0.5">
                    <IconBtn label="Move field up" disabled={!canUp} onClick={onUp}>↑</IconBtn>
                    <IconBtn label="Move field down" disabled={!canDown} onClick={onDown}>↓</IconBtn>
                    <button type="button" aria-label="Remove field" data-focus-panel-field-remove={field.id} onClick={onRemove} className="rounded-md border border-red-300 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50">✕</button>
                </div>
            </div>
            <CanonicalRefFieldPicker
                label={`${field.label} field`}
                field={field}
                availableFields={availableFields}
                onChange={onChange}
            />
            {isCollection ? (
                <>
                    <div className="grid grid-cols-2 gap-1.5">
                        <select
                            aria-label={`${field.label} display as`}
                            data-focus-panel-collection-renderer={field.id}
                            className={FIELD}
                            value={FOCUS_PANEL_COLLECTION_RENDERERS.includes(field.renderer as FocusPanelCollectionRenderer) ? field.renderer : "count_expand"}
                            onChange={(e) => onChange({ renderer: e.target.value as FocusPanelFieldRenderer })}
                        >
                            {FOCUS_PANEL_COLLECTION_RENDERERS.map((r) => (
                                <option key={r} value={r}>{FOCUS_PANEL_COLLECTION_RENDERER_LABELS[r]}</option>
                            ))}
                        </select>
                        <input type="number" min={1} aria-label={`${field.label} max rows`} className={FIELD} value={field.maxRows ?? 3} onChange={(e) => onChange({ maxRows: Math.max(1, Number(e.target.value) || 1) })} />
                    </div>
                    <input aria-label={`${field.label} empty state`} className={FIELD} placeholder="Empty state copy" value={field.emptyText ?? ""} onChange={(e) => onChange({ emptyText: e.target.value })} />
                </>
            ) : (
                <select aria-label={`${field.label} display as`} data-focus-panel-field-renderer={field.id} className={FIELD} value={field.renderer} onChange={(e) => onChange({ renderer: e.target.value as FocusPanelFieldRenderer })}>
                    {FOCUS_PANEL_FIELD_RENDERERS.map((r) => (
                        <option key={r} value={r}>{FOCUS_PANEL_FIELD_RENDERER_LABELS[r]}</option>
                    ))}
                </select>
            )}
            {groups.length > 1 ? (
                <select
                    aria-label={`Move ${field.label} to group`}
                    data-focus-panel-field-group={field.id}
                    className={FIELD}
                    value={currentGroupId}
                    onChange={(e) => e.target.value !== currentGroupId && onMoveToGroup(e.target.value)}
                >
                    {groups.map((g) => (
                        <option key={g.id} value={g.id}>In: {g.label}</option>
                    ))}
                </select>
            ) : null}
        </div>
    );
}

/** Canonical refKey picker — same provider source as nested Identity Builder. */
function CanonicalRefFieldPicker({
    label,
    field,
    availableFields,
    onChange,
}: {
    label: string;
    field: FocusPanelCardField;
    availableFields: AvailableField[];
    onChange: (patch: Partial<FocusPanelCardField>) => void;
}) {
    const selected =
        field.refKey?.trim()
        ?? legacyConceptToRefKey(field.concept)
        ?? availableFields[0]?.key
        ?? "";
    const categories = [...new Set(availableFields.map((entry) => entry.categoryKey ?? "general"))].sort((a, b) =>
        categoryDisplayLabel(a).localeCompare(categoryDisplayLabel(b)),
    );
    return (
        <select
            aria-label={label}
            className={FIELD}
            data-focus-panel-canonical-ref-picker={field.id}
            value={selected}
            onChange={(e) => {
                const refKey = e.target.value;
                const match = availableFields.find((entry) => entry.key === refKey);
                onChange({
                    refKey,
                    concept: field.concept,
                    label: match?.label ?? field.label,
                });
            }}
        >
            {categories.map((categoryKey) => (
                <optgroup key={categoryKey} label={categoryDisplayLabel(categoryKey)}>
                    {availableFields
                        .filter((entry) => (entry.categoryKey ?? "general") === categoryKey)
                        .map((entry) => (
                            <option key={entry.key} value={entry.key}>
                                {entry.label}
                            </option>
                        ))}
                </optgroup>
            ))}
        </select>
    );
}

/** Legacy condition concept picker (conditions still use concept record paths). */
function ConceptPicker({
    label,
    value,
    onChange,
    extraOptions,
}: {
    label: string;
    value: string;
    onChange: (concept: string) => void;
    extraOptions?: string[];
}) {
    const { branch, leaf } = parseConceptPath(value);
    const branches = CONCEPT_TREE;
    const activeBranch = branches.find((b) => b.label === branch) ?? branches[0]!;
    const leaves = activeBranch.leaves;
    return (
        <div className="grid grid-cols-2 gap-1.5" data-focus-panel-concept-picker={value}>
            <select
                aria-label={`${label} relationship`}
                className={FIELD}
                value={activeBranch.label}
                onChange={(e) => {
                    const nextBranch = branches.find((b) => b.label === e.target.value) ?? activeBranch;
                    onChange(buildConceptPath(nextBranch.label, nextBranch.leaves[0]!.label));
                }}
            >
                {branches.map((b) => (
                    <option key={b.label} value={b.label}>{b.label}</option>
                ))}
            </select>
            <select aria-label={`${label} attribute`} className={FIELD} value={leaves.some((l) => l.label === leaf) ? leaf : leaves[0]!.label} onChange={(e) => onChange(buildConceptPath(activeBranch.label, e.target.value))}>
                {leaves.map((l) => (
                    <option key={l.label} value={l.label}>{l.label}</option>
                ))}
            </select>
            {extraOptions && extraOptions.length > 0 ? <span className="sr-only">{extraOptions.join(", ")}</span> : null}
        </div>
    );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="rounded-md border border-alloy-forge/20 px-1.5 py-1 text-xs text-alloy-midnight/60 hover:bg-alloy-stone/[0.06] disabled:cursor-not-allowed disabled:opacity-40">
            {children}
        </button>
    );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-1">
            <p className={LABEL}>{label}</p>
            {children}
        </div>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="config-typo-sublabel rounded-lg bg-alloy-stone/[0.04] px-3 py-4 text-center">{children}</p>;
}

function buildAiRecommendations(key: string, fields: FocusPanelCardField[], history: HistoryInfo): string[] {
    const recs: string[] = [];
    const labels = new Set(fields.map((f) => f.label.toLowerCase()));
    const concepts = fields.map((f) => f.concept.toLowerCase());
    if (key === "household") {
        recs.push("Household usually includes Primary Contact, Secondary Contact, Children, and Authorized Pickups.");
        if (!concepts.some((c) => c.includes("emergency"))) recs.push("This card has no emergency contact list — most enrollment teams keep one.");
        if (!labels.has("phone") && !concepts.some((c) => c.includes("phone"))) recs.push("You removed Phone; most enrollment teams keep it visible on Household.");
    } else if (key === "children") {
        recs.push("Children usually shows Name, Status, and Current Room.");
    } else {
        recs.push(`This card usually contains the key signals for ${key.replace(/_/g, " ")}.`);
    }
    recs.push(history.dirty ? "Publish to see your changes live in the operator workspace." : "This surface is in sync with the workspace.");
    return recs;
}
