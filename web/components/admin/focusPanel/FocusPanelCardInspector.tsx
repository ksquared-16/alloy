"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
    FOCUS_PANEL_COLLECTION_RENDERERS,
    FOCUS_PANEL_COLLECTION_RENDERER_LABELS,
    FOCUS_PANEL_CONDITION_KINDS,
    FOCUS_PANEL_CONDITION_KIND_LABELS,
    FOCUS_PANEL_CONDITION_OPERATORS,
    FOCUS_PANEL_CONDITION_OPERATOR_LABELS,
    FOCUS_PANEL_FIELD_RENDERERS,
    FOCUS_PANEL_FIELD_RENDERER_LABELS,
    validateFocusPanelCardConfig,
    type FocusPanelCardCondition,
    type FocusPanelCardConfig,
    type FocusPanelCardField,
    type FocusPanelCollectionRenderer,
    type FocusPanelConditionKind,
    type FocusPanelConditionOperator,
    type FocusPanelFieldPlacement,
    type FocusPanelFieldRenderer,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import {
    resolveCardCompositionPreference,
    type CardOperationalWeight,
    type CardPerspectiveExpansion,
    type CardPreferredRow,
} from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import { isOperationalTruthCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordination";
import {
    conceptOptionsForCard,
    defaultCardExpansion,
    defaultCardFields,
    getFocusPanelCardReference,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardReference";
import {
    CONCEPT_TREE,
    buildConceptPath,
    parseConceptPath,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCatalog";
import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Contextual Card Inspector for the Surfaces editor (Experience Builder Alpha).
 *
 * Product-quality, not a technical panel: sections use business concepts (Card
 * name, Data shown, Related lists, Appearance, Conditions, Expansion, Actions, AI)
 * — no type / archetype / tier / instance jargon. Edits flow through `onChange` as
 * a new `FocusPanelCardConfig`; the editor commits them to the working copy and
 * the configure → publish loop carries them live through the SHARED renderer.
 * Household is the reference card, so its sections are fully populated.
 */

const INSPECTOR_TABS = [
    "card",
    "fields",
    "related",
    "appearance",
    "composition",
    "conditions",
    "expansion",
    "actions",
    "ai",
] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number];

const TAB_LABELS: Record<InspectorTab, string> = {
    card: "Card",
    fields: "Fields",
    related: "Related lists",
    appearance: "Appearance",
    composition: "Composition",
    conditions: "Conditions",
    expansion: "Expansion",
    actions: "Actions",
    ai: "AI",
};

const DENSITIES: readonly FocusPanelCardDensity[] = ["micro", "compact", "standard", "expanded"];

/** Composition weight options (visual emphasis on the surface). */
const WEIGHT_OPTIONS: readonly { value: CardOperationalWeight; label: string }[] = [
    { value: "heavy", label: "Heavy — anchors a lane" },
    { value: "medium", label: "Medium — supporting" },
    { value: "light", label: "Light — compact companion" },
];

/** Preferred band of the surface a card gravitates to. */
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
}: Props) {
    const [tab, setTab] = useState<InspectorTab>("card");
    const reference = getFocusPanelCardReference(baseModel.key);

    const appearance = config.appearance ?? {};
    const effectiveTitle = appearance.titleOverride?.trim() || baseModel.title;

    // Fields: persisted config wins, else seed from the reference.
    const fields = useMemo<FocusPanelCardField[]>(
        () => (config.fields && config.fields.length > 0 ? config.fields : defaultCardFields(baseModel.key)),
        [baseModel.key, config.fields],
    );
    const expansion = config.expansion ?? defaultCardExpansion(baseModel.key);
    const conditions = config.conditions ?? [];
    const conceptOptions = conceptOptionsForCard(baseModel.key);

    // Evidence-group validation surfaced to the operator (#10): bindings, renderers,
    // collection rows, and well-formed conditions. Empty/default config is valid.
    const validation = useMemo(() => validateFocusPanelCardConfig(config), [config]);

    const collectionFields = fields.filter((f) => f.kind === "collection");

    const patchAppearance = (patch: Partial<NonNullable<FocusPanelCardConfig["appearance"]>>) =>
        onChange({ ...config, appearance: { ...appearance, ...patch } });

    // Composition: config override wins, else the card's platform-default preference.
    const defaultPref = resolveCardCompositionPreference(baseModel.key);
    const composition = config.composition ?? {};
    const truthCard = isOperationalTruthCard(baseModel.key);
    const effectiveWeight = composition.weight ?? defaultPref.weight;
    const effectiveRow = composition.preferredRow ?? defaultPref.preferredRow;
    // Diagnostic cards cannot reach Focus/Workspace — the runtime clamps them to
    // Evidence, so the selector mirrors that (see operational-depth-doctrine.md).
    const rawDepth = composition.perspectiveExpansion ?? defaultPref.perspectiveExpansion;
    const effectiveDepth: CardPerspectiveExpansion = truthCard ? rawDepth : "in_place";
    const patchComposition = (patch: Partial<NonNullable<FocusPanelCardConfig["composition"]>>) =>
        onChange({ ...config, composition: { ...composition, ...patch } });

    const commitFields = (next: FocusPanelCardField[]) => onChange({ ...config, fields: next });
    const updateField = (id: string, patch: Partial<FocusPanelCardField>) =>
        commitFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const removeField = (id: string) => commitFields(fields.filter((f) => f.id !== id));
    const moveField = (id: string, dir: -1 | 1) => {
        const index = fields.findIndex((f) => f.id === id);
        const target = index + dir;
        if (index < 0 || target < 0 || target >= fields.length) return;
        const next = fields.slice();
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved!);
        commitFields(next);
    };
    const addField = (kind: FocusPanelCardField["kind"]) => {
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
                      label: "New field",
                      concept: conceptOptions[0] ?? "Enrollment → Primary Contact → Name",
                      renderer: "text",
                      kind: "field",
                      placement: expansion.default,
                  };
        commitFields([...fields, next]);
    };

    const addCondition = () => {
        const next: FocusPanelCardCondition[] = [
            ...conditions,
            { kind: "visible_when", concept: conceptOptions[0] ?? "Enrollment → Children → Summary", operator: "exists" },
        ];
        onChange({ ...config, conditions: next });
    };
    const updateCondition = (index: number, patch: Partial<FocusPanelCardCondition>) =>
        onChange({ ...config, conditions: conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
    const removeCondition = (index: number) =>
        onChange({ ...config, conditions: conditions.filter((_, i) => i !== index) });

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

            <div
                role="tablist"
                aria-label="Card inspector"
                className="flex flex-wrap gap-1 border-b border-alloy-stone/30 px-3 py-2"
            >
                {INSPECTOR_TABS.map((t) => {
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
                                active
                                    ? "bg-alloy-pine/10 text-alloy-pine"
                                    : "text-alloy-forge/70 hover:bg-alloy-stone/10 hover:text-alloy-midnight",
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
                {tab === "card" ?
                    <div className="space-y-3">
                        <Labeled label="Card name">
                            <input
                                data-testid="inspector-title"
                                className={FIELD}
                                value={appearance.titleOverride ?? ""}
                                placeholder={baseModel.title}
                                onChange={(e) => patchAppearance({ titleOverride: e.target.value })}
                            />
                        </Labeled>
                        <Labeled label="What this card shows">
                            <textarea
                                data-testid="inspector-description"
                                className={`${FIELD} resize-none`}
                                rows={3}
                                value={appearance.description ?? ""}
                                placeholder={reference?.description ?? baseModel.insight}
                                onChange={(e) => patchAppearance({ description: e.target.value })}
                            />
                        </Labeled>
                        <p className="config-typo-meta">
                            Card name and description apply live to the published workspace.
                        </p>
                    </div>
                : tab === "fields" ?
                    <div className="space-y-2" data-focus-panel-inspector-fields={String(fields.length)}>
                        <p className="config-typo-sublabel">
                            The data shown on this card. Reorder with the arrows; bind each field to a business concept.
                        </p>
                        {fields.length === 0 ?
                            <Empty>No fields yet. Add one below.</Empty>
                        :   fields.map((field, index) => (
                                <FieldRow
                                    key={field.id}
                                    field={field}
                                    canUp={index > 0}
                                    canDown={index < fields.length - 1}
                                    conceptOptions={conceptOptions}
                                    onUp={() => moveField(field.id, -1)}
                                    onDown={() => moveField(field.id, 1)}
                                    onRemove={() => removeField(field.id)}
                                    onChange={(patch) => updateField(field.id, patch)}
                                />
                            ))
                        }
                        <div className="flex gap-2">
                            <button
                                type="button"
                                data-testid="inspector-add-field"
                                onClick={() => addField("field")}
                                className="config-secondary-btn config-primary-btn--sm flex-1"
                            >
                                ＋ Add field
                            </button>
                            <button
                                type="button"
                                data-testid="inspector-add-related"
                                onClick={() => addField("collection")}
                                className="config-secondary-btn config-primary-btn--sm flex-1"
                            >
                                ＋ Add related list
                            </button>
                        </div>
                    </div>
                : tab === "related" ?
                    <div className="space-y-2" data-focus-panel-inspector-related={String(collectionFields.length)}>
                        <p className="config-typo-sublabel">To-many roles render as related lists (never flattened).</p>
                        {collectionFields.length === 0 ?
                            <Empty>No related lists on this card.</Empty>
                        :   collectionFields.map((field) => (
                                <div
                                    key={field.id}
                                    data-focus-panel-inspector-collection={field.id}
                                    className={SECTION_CARD}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <input
                                            aria-label={`${field.label} name`}
                                            className={`${FIELD} font-medium`}
                                            value={field.label}
                                            onChange={(e) => updateField(field.id, { label: e.target.value })}
                                        />
                                        <label className="config-typo-meta flex shrink-0 items-center gap-1">
                                            <input
                                                type="checkbox"
                                                className="config-mode-control h-3.5 w-3.5 rounded border-alloy-stone/40"
                                                aria-label={`Show ${field.label}`}
                                                checked={!field.hidden}
                                                onChange={(e) => updateField(field.id, { hidden: !e.target.checked })}
                                            />
                                            Show
                                        </label>
                                    </div>
                                    <ConceptPicker
                                        label={`${field.label} concept`}
                                        value={field.concept}
                                        onChange={(concept) => updateField(field.id, { concept })}
                                    />
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <select
                                            aria-label={`${field.label} display as`}
                                            data-focus-panel-collection-renderer={field.id}
                                            className={FIELD}
                                            value={
                                                FOCUS_PANEL_COLLECTION_RENDERERS.includes(
                                                    field.renderer as FocusPanelCollectionRenderer,
                                                )
                                                    ? field.renderer
                                                    : "count_expand"
                                            }
                                            onChange={(e) =>
                                                updateField(field.id, {
                                                    renderer: e.target.value as FocusPanelFieldRenderer,
                                                })
                                            }
                                        >
                                            {FOCUS_PANEL_COLLECTION_RENDERERS.map((r) => (
                                                <option key={r} value={r}>
                                                    {FOCUS_PANEL_COLLECTION_RENDERER_LABELS[r]}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            min={1}
                                            aria-label={`${field.label} max rows`}
                                            className={FIELD}
                                            value={field.maxRows ?? 3}
                                            onChange={(e) =>
                                                updateField(field.id, { maxRows: Math.max(1, Number(e.target.value) || 1) })
                                            }
                                        />
                                    </div>
                                    <input
                                        aria-label={`${field.label} empty state`}
                                        className={FIELD}
                                        placeholder="Empty state copy"
                                        value={field.emptyText ?? ""}
                                        onChange={(e) => updateField(field.id, { emptyText: e.target.value })}
                                    />
                                </div>
                            ))
                        }
                    </div>
                : tab === "appearance" ?
                    <div className="space-y-3">
                        <Labeled label="Size">
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
                        <p className="config-typo-meta">Size applies live to the published workspace.</p>
                    </div>
                : tab === "composition" ?
                    <div
                        className="space-y-3"
                        data-focus-panel-inspector-composition={effectiveWeight}
                        data-focus-panel-composition-depth={effectiveDepth}
                    >
                        <Labeled label="Weight">
                            <select
                                data-testid="inspector-weight"
                                className={FIELD}
                                value={effectiveWeight}
                                onChange={(e) =>
                                    patchComposition({ weight: e.target.value as CardOperationalWeight })
                                }
                            >
                                {WEIGHT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </Labeled>
                        <Labeled label="Reading band">
                            <select
                                data-testid="inspector-preferred-row"
                                className={FIELD}
                                value={effectiveRow}
                                onChange={(e) =>
                                    patchComposition({ preferredRow: e.target.value as CardPreferredRow })
                                }
                            >
                                {ROW_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </Labeled>
                        <Labeled label="Depth">
                            <select
                                data-testid="inspector-depth"
                                className={FIELD}
                                value={effectiveDepth}
                                disabled={!truthCard}
                                onChange={(e) =>
                                    patchComposition({
                                        perspectiveExpansion: e.target.value as CardPerspectiveExpansion,
                                    })
                                }
                            >
                                {DEPTH_OPTIONS.filter((o) => truthCard || !o.truthOnly).map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </Labeled>
                        <p className="config-typo-meta">
                            {truthCard
                                ? "Weight and band shape how the engine composes lanes; depth sets how far this card opens. Applies live to the published workspace."
                                : "Diagnostic cards stay at Evidence depth — they expand in place or hand off to the owning card, never becoming a Focus Card."}
                        </p>
                    </div>
                : tab === "conditions" ?
                    <div className="space-y-2">
                        {conditions.length === 0 ?
                            <Empty>No conditions. This card is always visible.</Empty>
                        :   conditions.map((condition, index) => (
                                <div
                                    // eslint-disable-next-line react/no-array-index-key
                                    key={index}
                                    data-focus-panel-inspector-condition={condition.kind}
                                    className={SECTION_CARD}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <select
                                            aria-label="Condition kind"
                                            className={FIELD}
                                            value={condition.kind}
                                            onChange={(e) =>
                                                updateCondition(index, { kind: e.target.value as FocusPanelConditionKind })
                                            }
                                        >
                                            {FOCUS_PANEL_CONDITION_KINDS.map((k) => (
                                                <option key={k} value={k}>
                                                    {FOCUS_PANEL_CONDITION_KIND_LABELS[k]}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            aria-label="Remove condition"
                                            onClick={() => removeCondition(index)}
                                            className="rounded-md border border-red-300 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <ConceptPicker
                                        label="Condition concept"
                                        value={condition.concept}
                                        onChange={(concept) => updateCondition(index, { concept })}
                                    />
                                    <div className="flex gap-1.5">
                                        <select
                                            aria-label="Condition operator"
                                            className={FIELD}
                                            value={condition.operator}
                                            onChange={(e) =>
                                                updateCondition(index, {
                                                    operator: e.target.value as FocusPanelConditionOperator,
                                                })
                                            }
                                        >
                                            {FOCUS_PANEL_CONDITION_OPERATORS.map((op) => (
                                                <option key={op} value={op}>
                                                    {FOCUS_PANEL_CONDITION_OPERATOR_LABELS[op]}
                                                </option>
                                            ))}
                                        </select>
                                        {condition.operator === "is" || condition.operator === "is_not" ?
                                            <input
                                                aria-label="Condition value"
                                                className={FIELD}
                                                value={condition.value ?? ""}
                                                placeholder="value"
                                                onChange={(e) => updateCondition(index, { value: e.target.value })}
                                            />
                                        :   null}
                                    </div>
                                </div>
                            ))
                        }
                        <button
                            type="button"
                            data-testid="inspector-add-condition"
                            onClick={addCondition}
                            className="config-secondary-btn config-primary-btn--sm w-full"
                        >
                            ＋ Add condition
                        </button>
                        <p className="config-typo-meta">
                            Conditions are saved with the surface. Runtime enforcement is not yet applied.
                        </p>
                    </div>
                : tab === "expansion" ?
                    <div className="space-y-3" data-focus-panel-inspector-expansion={expansion.default}>
                        <Labeled label="Default state">
                            <div className="flex gap-2">
                                {(["collapsed", "expanded"] as FocusPanelFieldPlacement[]).map((state) => (
                                    <button
                                        key={state}
                                        type="button"
                                        data-focus-panel-expansion-default={state}
                                        onClick={() => onChange({ ...config, expansion: { default: state } })}
                                        className={[
                                            "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-colors",
                                            expansion.default === state
                                                ? "border-alloy-pine bg-alloy-pine/10 text-alloy-pine"
                                                : "border-alloy-forge/20 text-alloy-midnight/60 hover:bg-alloy-stone/[0.06]",
                                        ].join(" ")}
                                    >
                                        {state}
                                    </button>
                                ))}
                            </div>
                        </Labeled>
                        <ExpansionList
                            title="Always visible (collapsed)"
                            fields={fields.filter((f) => f.placement === "collapsed")}
                            onMove={(id) => updateField(id, { placement: "expanded" })}
                            moveLabel="Move to expanded ↓"
                        />
                        <ExpansionList
                            title="Shown when expanded"
                            fields={fields.filter((f) => f.placement === "expanded")}
                            onMove={(id) => updateField(id, { placement: "collapsed" })}
                            moveLabel="Move to collapsed ↑"
                        />
                    </div>
                : tab === "actions" ?
                    <div className="space-y-2">
                        {(reference?.actions ?? []).length === 0 ?
                            <Empty>No card actions configured.</Empty>
                        :   (reference?.actions ?? []).map((action) => (
                                <div
                                    key={action}
                                    className="flex items-center justify-between rounded-lg border border-alloy-forge/14 px-3 py-2 text-xs text-alloy-midnight"
                                >
                                    {action}
                                    <span className="config-typo-meta">card action</span>
                                </div>
                            ))
                        }
                        {onDuplicate || onRemove ?
                            <div className="flex gap-2 border-t border-alloy-forge/10 pt-2">
                                {onDuplicate ?
                                    <button
                                        type="button"
                                        data-testid="inspector-duplicate-card"
                                        onClick={onDuplicate}
                                        className="rounded-lg border border-alloy-forge/20 px-2.5 py-1 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                    >
                                        Duplicate card
                                    </button>
                                :   null}
                                {onRemove ?
                                    <button
                                        type="button"
                                        data-testid="inspector-remove-card"
                                        onClick={onRemove}
                                        className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                    >
                                        Remove card
                                    </button>
                                :   null}
                            </div>
                        :   null}
                    </div>
                :   <div className="space-y-2">
                        <p className="text-xs font-medium text-alloy-midnight">BOS suggestions</p>
                        {buildAiRecommendations(baseModel.key, fields, history).map((rec) => (
                            <div
                                key={rec}
                                data-focus-panel-inspector-ai-rec="true"
                                className="config-typo-sublabel rounded-lg border border-alloy-pine/20 bg-alloy-pine/[0.04] px-3 py-2 text-alloy-midnight/85"
                            >
                                {rec}
                            </div>
                        ))}
                        <p className="config-typo-meta">Advisory only — BOS never edits the surface.</p>
                    </div>
                }
            </div>
        </aside>
    );
}

function FieldRow({
    field,
    canUp,
    canDown,
    conceptOptions,
    onUp,
    onDown,
    onRemove,
    onChange,
}: {
    field: FocusPanelCardField;
    canUp: boolean;
    canDown: boolean;
    conceptOptions: string[];
    onUp: () => void;
    onDown: () => void;
    onRemove: () => void;
    onChange: (patch: Partial<FocusPanelCardField>) => void;
}) {
    return (
        <div
            data-focus-panel-inspector-field={field.id}
            data-focus-panel-field-kind={field.kind}
            className={SECTION_CARD}
        >
            <div className="flex items-center gap-1.5">
                <input
                    aria-label={`${field.label} label`}
                    className={`${FIELD} font-medium`}
                    value={field.label}
                    onChange={(e) => onChange({ label: e.target.value })}
                />
                <div className="flex shrink-0 items-center gap-0.5">
                    <IconBtn label="Move field up" disabled={!canUp} onClick={onUp}>
                        ↑
                    </IconBtn>
                    <IconBtn label="Move field down" disabled={!canDown} onClick={onDown}>
                        ↓
                    </IconBtn>
                    <button
                        type="button"
                        aria-label="Remove field"
                        data-focus-panel-field-remove={field.id}
                        onClick={onRemove}
                        className="rounded-md border border-red-300 px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                        ✕
                    </button>
                </div>
            </div>
            <ConceptPicker
                label={`${field.label} concept`}
                value={field.concept}
                onChange={(concept) => onChange({ concept })}
                extraOptions={conceptOptions}
            />
            <select
                aria-label={`${field.label} display as`}
                data-focus-panel-field-renderer={field.id}
                className={FIELD}
                value={field.renderer}
                onChange={(e) => onChange({ renderer: e.target.value as FocusPanelFieldRenderer })}
            >
                {FOCUS_PANEL_FIELD_RENDERERS.map((r) => (
                    <option key={r} value={r}>
                        {FOCUS_PANEL_FIELD_RENDERER_LABELS[r]}
                    </option>
                ))}
            </select>
        </div>
    );
}

/** Cascading business-concept picker: branch → attribute → path (no raw columns). */
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
                    <option key={b.label} value={b.label}>
                        {b.label}
                    </option>
                ))}
            </select>
            <select
                aria-label={`${label} attribute`}
                className={FIELD}
                value={leaves.some((l) => l.label === leaf) ? leaf : leaves[0]!.label}
                onChange={(e) => onChange(buildConceptPath(activeBranch.label, e.target.value))}
            >
                {leaves.map((l) => (
                    <option key={l.label} value={l.label}>
                        {l.label}
                    </option>
                ))}
            </select>
            {/* Render extra suggested options as datalist-style hints (kept off-DOM-path). */}
            {extraOptions && extraOptions.length > 0 ? <span className="sr-only">{extraOptions.join(", ")}</span> : null}
        </div>
    );
}

function ExpansionList({
    title,
    fields,
    onMove,
    moveLabel,
}: {
    title: string;
    fields: FocusPanelCardField[];
    onMove: (id: string) => void;
    moveLabel: string;
}) {
    return (
        <div className="space-y-1">
            <p className={LABEL}>{title}</p>
            {fields.length === 0 ?
                <Empty>None</Empty>
            :   fields.map((field) => (
                    <div
                        key={field.id}
                        className="flex items-center justify-between rounded-lg border border-alloy-forge/14 px-3 py-1.5 text-xs text-alloy-midnight"
                    >
                        <span className="truncate">{field.label}</span>
                        <button
                            type="button"
                            onClick={() => onMove(field.id)}
                            className="config-typo-meta shrink-0 rounded-md border border-alloy-forge/20 px-1.5 py-0.5 hover:bg-alloy-stone/10"
                        >
                            {moveLabel}
                        </button>
                    </div>
                ))
            }
        </div>
    );
}

function IconBtn({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="rounded-md border border-alloy-forge/20 px-1.5 py-1 text-xs text-alloy-midnight/60 hover:bg-alloy-stone/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
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
    return (
        <p className="config-typo-sublabel rounded-lg bg-alloy-stone/[0.04] px-3 py-4 text-center">
            {children}
        </p>
    );
}

function buildAiRecommendations(key: string, fields: FocusPanelCardField[], history: HistoryInfo): string[] {
    const recs: string[] = [];
    const labels = new Set(fields.map((f) => f.label.toLowerCase()));
    const concepts = fields.map((f) => f.concept.toLowerCase());
    if (key === "household") {
        recs.push("Household usually includes Primary Contact, Secondary Contact, Children, and Authorized Pickups.");
        if (!concepts.some((c) => c.includes("emergency")))
            recs.push("This card has no emergency contact list — most enrollment teams keep one.");
        if (!labels.has("phone") && !concepts.some((c) => c.includes("phone")))
            recs.push("You removed Phone; most enrollment teams keep it visible on Household.");
    } else if (key === "children") {
        recs.push("Children usually shows Name, Status, and Current Room.");
    } else {
        recs.push(`This card usually contains the key signals for ${key.replace(/_/g, " ")}.`);
    }
    recs.push(history.dirty ? "Publish to see your changes live in the operator workspace." : "This surface is in sync with the workspace.");
    return recs;
}
