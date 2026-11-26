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

import type {
    CardCompositionPreference,
    CardOperationalWeight,
    CardPerspectiveExpansion,
    CardPreferredRow,
} from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type {
    FocusPanelCardKey,
    FocusPanelCardModel,
    FocusPanelProfileField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { isOperationalTruthCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import { resolveConceptValue } from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCatalog";
import {
    effectiveCardFieldRefKey,
    legacyConceptToRefKey,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCompat";
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";

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
    /** Canonical refKey — preferred persistence for field binding. */
    refKey?: string;
    /** Legacy business-concept path (read compat only when refKey absent). */
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
    // ── Ownership + behavior (Card Definition V2 — Part 4) ──
    /**
     * The single card that OWNS this business concept (Ownership doctrine: every
     * concept has exactly one owning card). Defaults to the host card. A concept can
     * be SHOWN read-only on other cards, but is only EDITABLE on its owner.
     */
    owner?: FocusPanelCardKey;
    /** Operator may edit this value here (only valid on the owning card). */
    editable?: boolean;
    /** The value must be present (drives readiness / completion). */
    required?: boolean;
    /** Shown but never editable here (even on the owning card). */
    readOnly?: boolean;
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
    /** Universal Card header icon name (Lucide key from UNIVERSAL_CARD_ICON_BY_NAME). */
    iconName?: string | null;
};

export type FocusPanelCardExpansion = {
    default: FocusPanelFieldPlacement;
};

/**
 * Composition overrides the Surface Definition declares for a card (Experience
 * Builder). These are the subset of `CardCompositionPreference` an operator may
 * tune — the rest stay platform defaults. They feed the engine's `overrides`
 * param (`composeFocusPanelSurface`) so a published surface composes per config:
 *
 *   - `weight`               — visual emphasis (Heavy anchors a lane; Light orbits)
 *   - `preferredRow`         — which band the card gravitates to
 *   - `perspectiveExpansion` — the deepest depth it reaches (Evidence / Focus /
 *                              Workspace — see operational-depth-doctrine.md)
 *
 * The platform still clamps these (diagnostic cards cannot reach Focus/Workspace);
 * configuration recommends, the runtime enforces.
 */
export type FocusPanelCardComposition = {
    weight?: CardOperationalWeight;
    preferredRow?: CardPreferredRow;
    perspectiveExpansion?: CardPerspectiveExpansion;
};

/**
 * An Evidence Group (Card Definition V2 — Part 3): a named bundle of fields that
 * answers part of the card's Question. Fields belong INSIDE a group — e.g. Children
 * groups its evidence into Identity / Enrollment / Placement / Readiness / Medical /
 * Documents. The runtime renders the flattened fields (reading order = groups in
 * order, fields within), so grouping is an authoring + presentation concept, not a
 * new runtime path.
 */
export type FocusPanelEvidenceGroup = {
    id: string;
    label: string;
    fields: FocusPanelCardField[];
    /** The group's operational question / purpose (Evidence Group Authoring, V4). */
    purpose?: string;
    /**
     * The card that OWNS this evidence group (Experience Builder V3 — ownership lives at
     * the evidence-group level). Defaults to the host card. The group's fields are
     * editable only on the owning card.
     */
    owner?: FocusPanelCardKey;
    /** Visible in the card's Summary (the 2–5s answer). */
    showInSummary?: boolean;
    /** Visible in Focus (the current operational truth). */
    showInFocus?: boolean;
    /**
     * Whether this group is revealed when the card is Expanded (the SAME question with
     * additional configured evidence — not history).
     */
    includeInExpanded?: boolean;
};

/** A configured Related View — a report drill-down distinct from Expanded. */
export type FocusPanelConfiguredRelatedView = {
    id: string;
    label: string;
};

/**
 * The group legacy flat `fields` migrate into when a card has no explicit groups.
 * The internal id is stable ("details"); the operator-facing label is "Overview" —
 * V3 doctrine forbids exposing the abstract "Details" to operators (§6 naming).
 */
export const DEFAULT_EVIDENCE_GROUP_ID = "details" as const;
export const DEFAULT_EVIDENCE_GROUP_LABEL = "Overview" as const;

/** Complete per-card configuration persisted on the section metadata. */
export type FocusPanelCardConfig = {
    appearance?: FocusPanelCardAppearance;
    /**
     * The card's operational QUESTION (Card Definition V2 — Part 2): the one thing it
     * answers ("What is true about each child?"). Authoring leads with this.
     */
    question?: string;
    /** Evidence groups own the fields (Part 3). Preferred over the flat `fields`. */
    evidenceGroups?: FocusPanelEvidenceGroup[];
    /** Configured Related Views — report drill-downs (Experience Builder V3). */
    relatedViews?: FocusPanelConfiguredRelatedView[];
    /** Legacy flat fields (pre-V2 docs). Read via `configFields`; kept for back-compat. */
    fields?: FocusPanelCardField[];
    expansion?: FocusPanelCardExpansion;
    conditions?: FocusPanelCardCondition[];
    composition?: FocusPanelCardComposition;
    /** Surface Composer placement overrides keyed by field id. */
    fieldPlacements?: Record<
        string,
        {
            builderSlot?: import("@/lib/adminV2/settings/surfaces/surfaceFieldComposer").SurfaceFieldSectionKey;
            stackLine?: number;
            inlineWithPrevious?: boolean;
            visibleWhen?: import("@/lib/layout/layoutV2").LayoutCondition | null;
        }
    >;
};

function evField(id: string, label: string, refKey: string, concept?: string): FocusPanelCardField {
    return {
        id,
        label,
        refKey,
        concept: concept ?? refKey,
        renderer: "text",
        placement: "collapsed",
        kind: "field",
    };
}

/**
 * The doctrine evidence groups a reference card seeds with (Evidence Group Authoring).
 * Child OWNS Placement as an evidence group (Program/Room/Schedule/Teacher/Desired
 * Start) — Placement is not a separate card. Other cards wrap their seed fields in one
 * "Details" group.
 */
export function defaultEvidenceGroupsForCard(
    key: FocusPanelCardKey,
    seedFields: FocusPanelCardField[],
): FocusPanelEvidenceGroup[] {
    if (key === "household") {
        return [
            {
                id: "primary_contact",
                label: "Primary Contact",
                purpose: "Who is the primary contact for this household?",
                owner: "household",
                showInSummary: true,
                showInFocus: true,
                fields: [
                    evField("hh_name", "Name", "person.primary_contact_name", "Enrollment → Primary Contact → Name"),
                    evField("hh_phone", "Phone", "person.primary_phone", "Enrollment → Primary Contact → Phone"),
                    evField("hh_email", "Email", "person.primary_email", "Enrollment → Primary Contact → Email"),
                ],
            },
            {
                id: "additional_contacts",
                label: "Additional Contacts",
                purpose: "Who else is associated with this household?",
                owner: "household",
                showInFocus: true,
                includeInExpanded: true,
                fields: [
                    evField("secondary_contact_name", "Secondary Contact", "person.secondary_contact_name", "Enrollment → Secondary Contact → Name"),
                    evField("secondary_contact_phone", "Secondary Phone", "person.secondary_phone", "Enrollment → Secondary Contact → Phone"),
                ],
            },
        ];
    }
    if (key === "children") {
        return [
            { id: "identity", label: "Identity", purpose: "Who is this child?", owner: "children", showInSummary: true, showInFocus: true, fields: [evField("child_name", "Name", "child.first_name", "Enrollment → Children → Name"), evField("child_dob", "DOB / Age", "child.date_of_birth", "Enrollment → Children → Age")] },
            { id: "placement", label: "Placement", purpose: "Where is this child placed?", owner: "children", showInFocus: true, includeInExpanded: true, fields: [evField("program", "Program", "inquiry_child.program", "Enrollment → Children → Program"), evField("room", "Room", "child.room", "Enrollment → Children → Room"), evField("schedule", "Schedule", "inquiry_child.schedule_type", "Enrollment → Children → Schedule"), evField("teacher", "Teacher", "child.room", "Enrollment → Children → Teacher"), evField("desired_start", "Desired Start", "child.start_date", "Enrollment → Children → Desired Start")] },
            { id: "medical", label: "Medical", purpose: "What should we know medically?", owner: "children", includeInExpanded: true, fields: [] },
            { id: "documents", label: "Documents", purpose: "What documents are required?", owner: "children", includeInExpanded: true, fields: [] },
            { id: "readiness", label: "Readiness", purpose: "Is this child ready to enroll?", owner: "children", includeInExpanded: true, fields: [] },
            { id: "notes", label: "Notes", purpose: "Anything else to record?", owner: "children", includeInExpanded: true, fields: [] },
        ];
    }
    if (seedFields.length === 0) return [];
    return [{ id: DEFAULT_EVIDENCE_GROUP_ID, label: DEFAULT_EVIDENCE_GROUP_LABEL, fields: seedFields }];
}

/**
 * The card's evidence groups — explicit groups when present, else legacy flat
 * `fields` wrapped in one default "Details" group. The single authoring view.
 */
export function evidenceGroupsFromConfig(
    config: FocusPanelCardConfig | null | undefined,
): FocusPanelEvidenceGroup[] {
    if (config?.evidenceGroups && config.evidenceGroups.length > 0) return config.evidenceGroups;
    const legacy = config?.fields ?? [];
    if (legacy.length === 0) return [];
    return [{ id: DEFAULT_EVIDENCE_GROUP_ID, label: DEFAULT_EVIDENCE_GROUP_LABEL, fields: legacy }];
}

/**
 * The card's fields in reading order — flattened across evidence groups (V2) or the
 * legacy flat list. THE single source the runtime + validation consume, so adding
 * groups never forks the render path.
 */
export function configFields(config: FocusPanelCardConfig | null | undefined): FocusPanelCardField[] {
    if (config?.evidenceGroups && config.evidenceGroups.length > 0) {
        return config.evidenceGroups.flatMap((g) => g.fields);
    }
    return config?.fields ?? [];
}

/** The card that owns a field's concept (defaults to the host card). */
export function effectiveFieldOwner(
    field: FocusPanelCardField,
    hostCard: FocusPanelCardKey,
): FocusPanelCardKey {
    return field.owner ?? hostCard;
}

/** True when a composition override carries no declared field. */
function isCompositionEmpty(composition: FocusPanelCardComposition | null | undefined): boolean {
    if (!composition) return true;
    return !composition.weight && !composition.preferredRow && !composition.perspectiveExpansion;
}

/** True when a config carries no meaningful content (avoid persisting empties). */
export function isFocusPanelCardConfigEmpty(config: FocusPanelCardConfig | null | undefined): boolean {
    if (!config) return true;
    const { appearance, conditions, expansion, composition, question } = config;
    const appearanceEmpty =
        !appearance ||
        ((!appearance.titleOverride || appearance.titleOverride.trim() === "") &&
            (!appearance.description || appearance.description.trim() === "") &&
            !appearance.density &&
            !(appearance.iconName && appearance.iconName.trim()));
    return (
        appearanceEmpty &&
        (!question || question.trim() === "") &&
        configFields(config).length === 0 &&
        (conditions?.length ?? 0) === 0 &&
        !expansion &&
        isCompositionEmpty(composition)
    );
}

/** One operator-facing problem with a card's evidence-group configuration. */
export type FocusPanelConfigIssue = {
    /** Where the problem is, for the editor to anchor to. */
    scope: "field" | "condition" | "group" | "ownership";
    /** Field/condition identifier (field id, condition index, or group id). */
    ref: string;
    message: string;
};

/**
 * Validate a card's evidence-group configuration (the Inspector's Fields / Related
 * lists / Conditions / Expansion output). Pure — returns the issues an operator must
 * resolve before the surface is sound. Proves a published evidence group binds to
 * real business concepts, renders with a known renderer, and carries well-formed
 * conditions. Empty / default config is valid (no issues).
 *
 * @see docs/platform/operator/card-content-template-field-inclusion-doctrine.md
 */
export function validateFocusPanelCardConfig(
    config: FocusPanelCardConfig | null | undefined,
    hostCard?: FocusPanelCardKey,
): { ok: boolean; issues: FocusPanelConfigIssue[] } {
    const issues: FocusPanelConfigIssue[] = [];
    if (!config) return { ok: true, issues };

    // Evidence groups need a label (V2). Validated whether explicit or legacy-wrapped.
    if (config.evidenceGroups) {
        for (const group of config.evidenceGroups) {
            if (!group.label || group.label.trim() === "") {
                issues.push({ scope: "group", ref: group.id, message: "An evidence group needs a name." });
            }
        }
    }

    const fields = configFields(config);
    const seen = new Set<string>();
    for (const field of fields) {
        if (seen.has(field.id)) {
            issues.push({ scope: "field", ref: field.id, message: `Duplicate field "${field.label || field.id}".` });
        }
        seen.add(field.id);
        if (!field.concept?.trim() && !field.refKey?.trim()) {
            issues.push({ scope: "field", ref: field.id, message: `"${field.label || field.id}" is not bound to a canonical field.` });
        }
        if (!FOCUS_PANEL_FIELD_RENDERERS.includes(field.renderer)) {
            issues.push({ scope: "field", ref: field.id, message: `"${field.label || field.id}" uses an unknown renderer.` });
        }
        if (field.kind === "collection" && field.maxRows !== undefined && field.maxRows < 1) {
            issues.push({ scope: "field", ref: field.id, message: `"${field.label || field.id}" must show at least one row.` });
        }
        // Ownership doctrine: a concept is EDITABLE only on its owning card. If this
        // host shows a concept owned elsewhere, it can't also be editable here.
        if (field.editable && hostCard && effectiveFieldOwner(field, hostCard) !== hostCard) {
            issues.push({
                scope: "ownership",
                ref: field.id,
                message: `"${field.label || field.id}" is owned by another card — show it read-only here, edit it on its owner.`,
            });
        }
    }

    (config.conditions ?? []).forEach((condition, index) => {
        const ref = String(index);
        if (!condition.concept || condition.concept.trim() === "") {
            issues.push({ scope: "condition", ref, message: "A condition is not bound to a business concept." });
        }
        if (!FOCUS_PANEL_CONDITION_OPERATORS.includes(condition.operator)) {
            issues.push({ scope: "condition", ref, message: "A condition uses an unknown operator." });
        }
        if (
            (condition.operator === "is" || condition.operator === "is_not") &&
            (!condition.value || condition.value.trim() === "")
        ) {
            issues.push({ scope: "condition", ref, message: "A comparison condition needs a value." });
        }
    });

    return { ok: issues.length === 0, issues };
}

/**
 * Reduce a card's persisted config to the composition override the engine consumes
 * (`Partial<CardCompositionPreference>`), or `null` when nothing is overridden.
 * Only the declared fields win — the rest stay platform defaults.
 */
export function compositionOverrideFromConfig(
    config: FocusPanelCardConfig | null | undefined,
): Partial<CardCompositionPreference> | null {
    const composition = config?.composition;
    if (isCompositionEmpty(composition)) return null;
    const override: Partial<CardCompositionPreference> = {};
    if (composition!.weight) override.weight = composition!.weight;
    if (composition!.preferredRow) override.preferredRow = composition!.preferredRow;
    if (composition!.perspectiveExpansion) override.perspectiveExpansion = composition!.perspectiveExpansion;
    return override;
}

/**
 * Validate (clamp) a composition override against the canvas rule. Diagnostic cards
 * can never reach Focus/Workspace depth, so any depth override beyond Evidence on a
 * non-truth card is clamped back to `in_place`. This is defense BEYOND the Inspector
 * UI: a stale or hand-edited published config can never break the canvas rule.
 *
 * @see docs/platform/operator/operational-depth-doctrine.md (diagnostic cards top out at Evidence)
 */
export function clampCompositionOverride(
    typeKey: FocusPanelCardKey,
    override: Partial<CardCompositionPreference>,
): Partial<CardCompositionPreference> {
    if (
        override.perspectiveExpansion &&
        override.perspectiveExpansion !== "in_place" &&
        !isOperationalTruthCard(typeKey)
    ) {
        return { ...override, perspectiveExpansion: "in_place" };
    }
    return override;
}

/**
 * Build the engine `overrides` map from placed cards + their config. Keyed by card
 * TYPE (composition is type-level in the engine); when the same type appears more
 * than once the declared fields merge (last wins per field). Each override is clamped
 * to the canvas rule before it reaches the engine.
 */
export function buildCompositionOverrides(
    entries: ReadonlyArray<{ typeKey: FocusPanelCardKey; config?: FocusPanelCardConfig | null }>,
): Partial<Record<FocusPanelCardKey, Partial<CardCompositionPreference>>> {
    const overrides: Partial<Record<FocusPanelCardKey, Partial<CardCompositionPreference>>> = {};
    for (const entry of entries) {
        const override = compositionOverrideFromConfig(entry.config);
        if (!override) continue;
        const clamped = clampCompositionOverride(entry.typeKey, override);
        overrides[entry.typeKey] = { ...overrides[entry.typeKey], ...clamped };
    }
    return overrides;
}

/** Resolve one configured field to a display value (honoring collection + state). */
function resolveFieldValue(
    field: FocusPanelCardField,
    record: Record<string, unknown>,
    state: FocusPanelFieldPlacement,
): string | null {
    const refKey = effectiveCardFieldRefKey(field);
    if (refKey && record[refKey] != null && String(record[refKey]).trim() !== "") {
        return String(record[refKey]).trim();
    }
    if (field.kind === "collection") {
        const value = resolveConceptValue(field.concept, record, {
            expanded: state === "expanded",
            maxRows: field.maxRows,
        });
        return value ?? field.emptyText ?? null;
    }
    if (refKey && legacyConceptToRefKey(field.concept) === refKey) {
        return resolveConceptValue(field.concept, record);
    }
    return resolveConceptValue(field.concept, record);
}

/** Canonical display label for a configured card field (Settings label wins). */
export function canonicalCardFieldLabel(field: FocusPanelCardField): string {
    const refKey = effectiveCardFieldRefKey(field);
    if (refKey) {
        return resolveCanonicalIdentityFieldLabel(refKey);
    }
    return field.label;
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
/**
 * Evaluate a single FocusPanelCardCondition against the operational record.
 * The `concept` field is treated as a flat record key (dot-notation or verbatim).
 * This is V1 evaluation: concept = path string looked up in record.
 */
function evaluateFocusPanelCondition(
    record: Record<string, unknown>,
    condition: FocusPanelCardCondition,
): boolean {
    const raw = record[condition.concept];
    const isEmpty =
        raw === null ||
        raw === undefined ||
        raw === "" ||
        raw === "—" ||
        (Array.isArray(raw) && raw.length === 0);
    switch (condition.operator) {
        case "exists":
            return !isEmpty;
        case "not_exists":
            return isEmpty;
        case "is":
            return String(raw ?? "") === String(condition.value ?? "");
        case "is_not":
            return String(raw ?? "") !== String(condition.value ?? "");
    }
}

export function composeEffectiveCardModel(
    baseModel: FocusPanelCardModel,
    config: FocusPanelCardConfig | null | undefined,
    record: Record<string, unknown>,
): FocusPanelCardModel {
    if (!config) return baseModel;

    // Evaluate visible_when conditions before anything else. If any visible_when
    // condition fails, hide the card entirely — no layout work needed.
    const visibleWhen = (config.conditions ?? []).filter((c) => c.kind === "visible_when");
    if (visibleWhen.length > 0 && !visibleWhen.every((c) => evaluateFocusPanelCondition(record, c))) {
        return { ...baseModel, visible: false };
    }

    const appearance = config.appearance;
    const title = appearance?.titleOverride?.trim();
    const description = appearance?.description?.trim();
    const density = appearance?.density ?? null;
    const iconName = appearance?.iconName?.trim() || null;

    // Read fields through `configFields` so evidence groups (V2) and the legacy flat
    // list render through the SAME path — grouping never forks the runtime.
    const fields = configFields(config);
    const hasFieldConfig = baseModel.archetype === "profile" && fields.length > 0;
    if (!title && !description && !density && !iconName && !hasFieldConfig) return baseModel;

    let payload = baseModel.payload;
    if (hasFieldConfig) {
        const state = config.expansion?.default ?? "collapsed";
        const profileFields: FocusPanelProfileField[] = visibleFieldsForState(fields, state).map((field) => ({
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
        iconName: iconName || baseModel.iconName,
        payload,
    };
}
