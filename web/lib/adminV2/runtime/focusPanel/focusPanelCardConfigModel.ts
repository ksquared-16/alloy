/**
 * Per-card configuration model for the Surfaces editor (Experience Builder Alpha).
 *
 * Sits ON TOP of the structure layer (which cards appear / order / span — see
 * `focusPanelSummaryDocOps`). A card's config is persisted on its
 * `LayoutSection.metadata` and carried through the configure → publish → operate
 * loop. It captures what the contextual Inspector edits:
 *
 *   - appearance  (card name / description / size)
 *   - fields      ("Data shown" — ordered, each a business-concept binding +
 *                  renderer + collapsed/expanded placement; collection-kind fields
 *                  carry related-list controls)
 *   - expansion   (default collapsed vs expanded view)
 *   - conditions  (shared condition grammar — persisted)
 *
 * Presentation Data doctrine: fields bind to BUSINESS CONCEPTS
 * ("Enrollment → Primary Contact → Phone"), never raw columns. Rendering stays in
 * the SHARED runtime renderer: `composeEffectiveCardModel` reshapes the card MODEL
 * (title / size / `payload.profileFields`) from config + record, and the editor
 * canvas and operator runtime both draw the same effective model — so a published
 * surface is visually identical to the editable one.
 */

import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type {
    FocusPanelCardModel,
    FocusPanelProfileField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { resolveConceptValue } from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCatalog";

/** Field renderers (presentation, not data). */
export const FOCUS_PANEL_FIELD_RENDERERS = [
    "text",
    "status_pill",
    "date",
    "money",
    "relationship_summary",
    "compact_list",
    "count_expand",
] as const;
export type FocusPanelFieldRenderer = (typeof FOCUS_PANEL_FIELD_RENDERERS)[number];

export const FOCUS_PANEL_FIELD_RENDERER_LABELS: Record<FocusPanelFieldRenderer, string> = {
    text: "Text",
    status_pill: "Status pill",
    date: "Date",
    money: "Money",
    relationship_summary: "Relationship summary",
    compact_list: "Compact list",
    count_expand: "Count + expand",
};

/** Collection renderers for the Related lists view (a subset suited to to-many roles). */
export const FOCUS_PANEL_COLLECTION_RENDERERS = ["compact_list", "relationship_summary", "count_expand"] as const;
export type FocusPanelCollectionRenderer = (typeof FOCUS_PANEL_COLLECTION_RENDERERS)[number];

export const FOCUS_PANEL_COLLECTION_RENDERER_LABELS: Record<FocusPanelCollectionRenderer, string> = {
    compact_list: "Compact list",
    relationship_summary: "Relationship summary",
    count_expand: "Count + expand",
};

export type FocusPanelFieldKind = "field" | "collection";
export type FocusPanelFieldPlacement = "collapsed" | "expanded";

/**
 * One field shown on a card. A `field` is a single business-concept value; a
 * `collection` is a to-many relationship role rendered as a related list (never
 * flattened) with extra controls.
 */
export type FocusPanelCardField = {
    id: string;
    label: string;
    /** Business-concept path, e.g. "Enrollment → Primary Contact → Email". */
    concept: string;
    renderer: FocusPanelFieldRenderer;
    placement: FocusPanelFieldPlacement;
    kind: FocusPanelFieldKind;
    /** Collection-only: hide from the card without deleting the config. */
    hidden?: boolean;
    /** Collection-only: max related rows summarized when collapsed. */
    maxRows?: number;
    /** Collection-only: copy shown when the role has no linked records. */
    emptyText?: string;
};

export const FOCUS_PANEL_CONDITION_KINDS = [
    "visible_when",
    "highlighted_when",
    "read_only_when",
    "collapsed_when",
] as const;
export type FocusPanelConditionKind = (typeof FOCUS_PANEL_CONDITION_KINDS)[number];

export const FOCUS_PANEL_CONDITION_KIND_LABELS: Record<FocusPanelConditionKind, string> = {
    visible_when: "Visible when",
    highlighted_when: "Highlighted when",
    read_only_when: "Read-only when",
    collapsed_when: "Collapsed when",
};

export const FOCUS_PANEL_CONDITION_OPERATORS = ["is", "is_not", "exists", "not_exists"] as const;
export type FocusPanelConditionOperator = (typeof FOCUS_PANEL_CONDITION_OPERATORS)[number];

export const FOCUS_PANEL_CONDITION_OPERATOR_LABELS: Record<FocusPanelConditionOperator, string> = {
    is: "is",
    is_not: "is not",
    exists: "exists",
    not_exists: "does not exist",
};

export type FocusPanelCardCondition = {
    kind: FocusPanelConditionKind;
    concept: string;
    operator: FocusPanelConditionOperator;
    value?: string;
};

export type FocusPanelCardAppearance = {
    titleOverride?: string | null;
    description?: string | null;
    density?: FocusPanelCardDensity | null;
};

export type FocusPanelCardExpansion = {
    default: FocusPanelFieldPlacement;
};

/** Complete per-card configuration persisted on the section metadata. */
export type FocusPanelCardConfig = {
    appearance?: FocusPanelCardAppearance;
    fields?: FocusPanelCardField[];
    expansion?: FocusPanelCardExpansion;
    conditions?: FocusPanelCardCondition[];
};

/** True when a config carries no meaningful content (avoid persisting empties). */
export function isFocusPanelCardConfigEmpty(config: FocusPanelCardConfig | null | undefined): boolean {
    if (!config) return true;
    const { appearance, fields, conditions, expansion } = config;
    const appearanceEmpty =
        !appearance ||
        ((!appearance.titleOverride || appearance.titleOverride.trim() === "") &&
            (!appearance.description || appearance.description.trim() === "") &&
            !appearance.density);
    return (
        appearanceEmpty &&
        (fields?.length ?? 0) === 0 &&
        (conditions?.length ?? 0) === 0 &&
        !expansion
    );
}

/** Resolve one configured field to a display value (honoring collection + state). */
function resolveFieldValue(
    field: FocusPanelCardField,
    record: Record<string, unknown>,
    state: FocusPanelFieldPlacement,
): string | null {
    if (field.kind === "collection") {
        const value = resolveConceptValue(field.concept, record, {
            expanded: state === "expanded",
            maxRows: field.maxRows,
        });
        return value ?? field.emptyText ?? null;
    }
    return resolveConceptValue(field.concept, record);
}

/** The fields visible for a given expansion state (expanded shows all). */
export function visibleFieldsForState(
    fields: readonly FocusPanelCardField[],
    state: FocusPanelFieldPlacement,
): FocusPanelCardField[] {
    return fields.filter((f) => !f.hidden && (state === "expanded" ? true : f.placement === "collapsed"));
}

/**
 * Compose the EFFECTIVE card model the shared renderer draws, from a base model +
 * persisted config + the record. Applies card name / description / size, and
 * rebuilds `payload.profileFields` from configured fields (resolved business
 * concepts, in order, honoring collapsed/expanded). Returns the same reference
 * when there is nothing to apply, so the default (uncustomized) surface is a no-op.
 */
export function composeEffectiveCardModel(
    baseModel: FocusPanelCardModel,
    config: FocusPanelCardConfig | null | undefined,
    record: Record<string, unknown>,
): FocusPanelCardModel {
    if (!config) return baseModel;

    const appearance = config.appearance;
    const title = appearance?.titleOverride?.trim();
    const description = appearance?.description?.trim();
    const density = appearance?.density ?? null;

    const hasFieldConfig = baseModel.archetype === "profile" && (config.fields?.length ?? 0) > 0;
    if (!title && !description && !density && !hasFieldConfig) return baseModel;

    let payload = baseModel.payload;
    if (hasFieldConfig) {
        const state = config.expansion?.default ?? "collapsed";
        const profileFields: FocusPanelProfileField[] = visibleFieldsForState(config.fields!, state).map((field) => ({
            label: field.label,
            value: resolveFieldValue(field, record, state),
        }));
        payload = { ...baseModel.payload, profileFields };
    }

    return {
        ...baseModel,
        title: title || baseModel.title,
        insight: description || baseModel.insight,
        density: density ?? baseModel.density,
        payload,
    };
}
