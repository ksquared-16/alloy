/**
 * Universal Card Lifecycle + Capability Matrix (V1).
 *
 * THE model every Alloy card follows. A card moves through a declared lifecycle —
 * Summary → Focus → Edit → Expanded → (Workspace) — and DECLARES which states it
 * supports via a capability matrix. The runtime, the canvas builder, and the Inspector
 * all read these capabilities instead of hardcoding per-card behavior, so the next 36
 * cards inherit the same lifecycle, edit language, and expansion language for free.
 *
 * Lifecycle states (see docs/platform/operator/universal-card-lifecycle.md):
 *   - summary    — the 2–5s operational answer on the Focus Panel surface.
 *   - focus      — the current operational TRUTH, everything needed to understand it
 *                  (not a separate form).
 *   - edit       — inline editing INSIDE the focused card; rows become controls in place.
 *   - expanded   — the SAME answer with more room (breadth / history / context). Not
 *                  Focus, not Edit, not Workspace. Overlays downward.
 *   - workspace  — doing larger work (bulk edits, document/financial review, mass
 *                  scheduling). Distinct from Expanded.
 *
 * This module is pure + server-safe (no React). It does NOT change the runtime; it
 * declares the contract the runtime already honors and the builder/inspector consult.
 */

import { FOCUS_PANEL_CARD_KEYS, type FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import { isOperationalTruthCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

/** The ordered universal lifecycle. Not every card supports every state. */
export const FOCUS_PANEL_CARD_LIFECYCLE_STATES = ["summary", "focus", "edit", "expanded", "workspace"] as const;
export type FocusPanelCardLifecycleState = (typeof FOCUS_PANEL_CARD_LIFECYCLE_STATES)[number];

export const FOCUS_PANEL_LIFECYCLE_LABELS: Record<FocusPanelCardLifecycleState, string> = {
    summary: "Summary",
    focus: "Focus",
    edit: "Edit",
    expanded: "Expanded",
    workspace: "Workspace",
};

/**
 * A Related View — an OPTIONAL drill-down to a report / historical context (Schedule
 * History, Placement History, Billing History …). NOT the same as Expanded: Expanded
 * answers the SAME operational question with more configured evidence, whereas a
 * Related View is a separate related operational report.
 */
export type FocusPanelRelatedView = {
    id: string;
    label: string;
};

/** What a card declares it can do — read by runtime, canvas builder, and Inspector. */
export type FocusPanelCardCapabilities = {
    /** The 2–5s answer on the Focus Panel surface. (Effectively always true.) */
    supportsSummary: boolean;
    /** Can elevate to a focused card showing the current operational truth. */
    supportsFocus: boolean;
    /** Can edit inline INSIDE the focused card (rows transform into controls). */
    supportsInlineEdit: boolean;
    /** Can expand downward to show the same answer with more room. */
    supportsExpanded: boolean;
    /** Can open a Workspace for larger work (bulk / review / mass editing). */
    supportsWorkspace: boolean;
    /** Focus can move to a different subject (e.g. contact → contact, child → child). */
    supportsSubjectChange: boolean;
    /** Identity rows carry a profile/avatar image (with initials fallback). */
    supportsProfileImage: boolean;
    /** Evidence-group ids editable inline (when owned + adapter + permission exist). */
    editableEvidenceGroups: readonly string[];
    /**
     * Evidence-group ids revealed when the card is Expanded — the SAME operational
     * question with ADDITIONAL configured evidence (not history). Overlays downward.
     */
    expansionEvidenceGroups: readonly string[];
    /** Optional related-report drill-downs (Schedule History, Placement History …). */
    relatedViews: readonly FocusPanelRelatedView[];
};

/** Default capability profile: a card answers on the surface and nothing more. */
const DEFAULT_CAPABILITIES: FocusPanelCardCapabilities = {
    supportsSummary: true,
    supportsFocus: false,
    supportsInlineEdit: false,
    supportsExpanded: false,
    supportsWorkspace: false,
    supportsSubjectChange: false,
    supportsProfileImage: false,
    editableEvidenceGroups: [],
    expansionEvidenceGroups: [],
    relatedViews: [],
};

/**
 * Per-card overrides. Truth-owning cards (Household, Children, Documents,
 * Communications) reach Focus/Edit; diagnostic cards (Readiness, Current Work) stay at
 * Summary + Expanded and never edit. Profile images only where identity matters.
 */
const CAPABILITY_OVERRIDES: Partial<Record<FocusPanelCardKey, Partial<FocusPanelCardCapabilities>>> = {
    household: {
        supportsFocus: true,
        supportsInlineEdit: true,
        supportsExpanded: true,
        supportsSubjectChange: true,
        supportsProfileImage: true,
        editableEvidenceGroups: ["primary_contact", "other_parent", "emergency_contacts", "pickup", "billing", "members"],
        // Expanded = additional configured evidence (not history).
        expansionEvidenceGroups: ["addresses", "additional_contacts", "languages", "household_notes"],
        relatedViews: [{ id: "contact_history", label: "Contact History" }],
    },
    children: {
        supportsFocus: true,
        supportsInlineEdit: true,
        supportsExpanded: true,
        supportsSubjectChange: true,
        supportsProfileImage: true,
        // Child OWNS its operational truth; Placement is an evidence group on Child
        // (not its own card): Program · Room · Schedule · Teacher · Desired Start.
        editableEvidenceGroups: ["identity", "placement", "medical", "documents", "notes"],
        // Expanded reveals the additional configured evidence groups for the child.
        expansionEvidenceGroups: ["placement", "medical", "documents", "pickup", "notes", "readiness"],
        relatedViews: [
            { id: "schedule_history", label: "Schedule History" },
            { id: "placement_history", label: "Placement History" },
        ],
    },
    documents: {
        supportsFocus: true,
        supportsInlineEdit: true,
        supportsExpanded: true,
        supportsSubjectChange: true,
        editableEvidenceGroups: ["document_status"],
        expansionEvidenceGroups: ["document_history"],
    },
    communications: {
        supportsFocus: true,
        supportsExpanded: true,
        supportsSubjectChange: true,
        expansionEvidenceGroups: ["message_history"],
    },
    readiness_kpi: { supportsExpanded: true, expansionEvidenceGroups: ["blockers"] },
    current_work: { supportsFocus: true, supportsExpanded: false },
    tasks: { supportsExpanded: true, expansionEvidenceGroups: ["task_list"] },
    timeline: { supportsExpanded: true, expansionEvidenceGroups: ["event_list"], relatedViews: [{ id: "full_timeline", label: "Full Timeline" }] },
    billing_preview: { supportsExpanded: true, expansionEvidenceGroups: ["billing_readiness"] },
};

/** The frozen capability matrix — exhaustive across every card key. */
export const FOCUS_PANEL_CARD_CAPABILITIES: Record<FocusPanelCardKey, FocusPanelCardCapabilities> = Object.fromEntries(
    FOCUS_PANEL_CARD_KEYS.map((key) => [key, { ...DEFAULT_CAPABILITIES, ...(CAPABILITY_OVERRIDES[key] ?? {}) }]),
) as Record<FocusPanelCardKey, FocusPanelCardCapabilities>;

/** A card's declared capabilities (defaults for any card without overrides). */
export function cardCapabilities(key: FocusPanelCardKey): FocusPanelCardCapabilities {
    return FOCUS_PANEL_CARD_CAPABILITIES[key] ?? DEFAULT_CAPABILITIES;
}

const STATE_TO_FLAG: Record<FocusPanelCardLifecycleState, keyof FocusPanelCardCapabilities> = {
    summary: "supportsSummary",
    focus: "supportsFocus",
    edit: "supportsInlineEdit",
    expanded: "supportsExpanded",
    workspace: "supportsWorkspace",
};

/** True when a card supports a given lifecycle state. */
export function cardSupports(key: FocusPanelCardKey, state: FocusPanelCardLifecycleState): boolean {
    return Boolean(cardCapabilities(key)[STATE_TO_FLAG[state]]);
}

/** The lifecycle states a card supports, in lifecycle order. */
export function supportedLifecycleStates(key: FocusPanelCardKey): FocusPanelCardLifecycleState[] {
    return FOCUS_PANEL_CARD_LIFECYCLE_STATES.filter((state) => cardSupports(key, state));
}

export function cardSupportsProfileImage(key: FocusPanelCardKey): boolean {
    return cardCapabilities(key).supportsProfileImage;
}

/** A card's optional related-report drill-downs (Schedule History, Full Timeline …). */
export function cardRelatedViews(key: FocusPanelCardKey): readonly FocusPanelRelatedView[] {
    return cardCapabilities(key).relatedViews;
}

/**
 * Validate a card's capability profile for internal consistency. Pure — returns the
 * contradictions that would make the lifecycle incoherent. Used by tests to keep the
 * matrix honest as cards are added.
 */
export function validateCardCapabilities(
    key: FocusPanelCardKey,
    caps: FocusPanelCardCapabilities = cardCapabilities(key),
): string[] {
    const issues: string[] = [];
    // Edit requires Focus — editing happens INSIDE the focused card.
    if (caps.supportsInlineEdit && !caps.supportsFocus) {
        issues.push(`${key}: inline edit requires focus (edit happens inside the focused card).`);
    }
    // Only operational truth cards may edit (they own the truth they mutate).
    if (caps.supportsInlineEdit && !isOperationalTruthCard(key)) {
        issues.push(`${key}: only operational truth cards support inline edit.`);
    }
    // Declaring editable groups implies the card supports inline edit.
    if (caps.editableEvidenceGroups.length > 0 && !caps.supportsInlineEdit) {
        issues.push(`${key}: declares editable evidence groups but does not support inline edit.`);
    }
    // Declaring expansion groups implies the card supports expanded.
    if (caps.expansionEvidenceGroups.length > 0 && !caps.supportsExpanded) {
        issues.push(`${key}: declares expansion evidence groups but does not support expanded.`);
    }
    return issues;
}
