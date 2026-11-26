/**
 * Ownership derivation for What's Next requirements.
 *
 * The owner of a "Still needed" requirement is sourced from RUNTIME METADATA — the
 * readiness gap `entity_type`, the config checklist `scope`, or the custom-field-rule
 * `entity` — never from the requirement's display label. This replaces the legacy
 * `inferWorkItemOwner` label regex for the requirement/readiness path.
 *
 * The map is open-ended: an unrecognized owner token still produces a labeled group
 * (with no navigable owning card), so a newly-configured entity is grouped, not dropped.
 *
 * @see docs/sprints/active/phase-5-whats-next-engineering-handoff.md (Slice E)
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type CurrentWorkRequirementOwner = {
    /** Stable grouping identity — a Focus card key, an entity token, or "required_information". */
    key: string;
    /** Operator-facing owner heading ("Children", "Household", "Required information", …). */
    label: string;
    /** Focus card to hand off to; null when the requirement has no navigable owning card. */
    card: FocusPanelCardKey | null;
    /** Optional focus target within the owning card. */
    focus: string | null;
};

/** Record-level requirements are owned by the Required Information capability. */
const REQUIRED_INFORMATION_OWNER: CurrentWorkRequirementOwner = {
    key: "required_information",
    label: "Required information",
    card: "required_information",
    focus: null,
};

/**
 * Owner by runtime metadata token. Keyed by the lowercased readiness `entity_type` /
 * config `scope` / field-rule `entity`. Contact-truth entities (person/customer) route to
 * Household; child entities to Children; documents to Documents; record/opportunity to
 * Required information.
 */
const OWNER_BY_METADATA: Readonly<Record<string, CurrentWorkRequirementOwner>> = {
    child: { key: "children", label: "Children", card: "children", focus: null },
    children: { key: "children", label: "Children", card: "children", focus: null },
    person: { key: "household", label: "Household", card: "household", focus: null },
    persons: { key: "household", label: "Household", card: "household", focus: null },
    customer: { key: "household", label: "Household", card: "household", focus: null },
    customers: { key: "household", label: "Household", card: "household", focus: null },
    household: { key: "household", label: "Household", card: "household", focus: null },
    document: { key: "documents", label: "Documents", card: "documents", focus: null },
    documents: { key: "documents", label: "Documents", card: "documents", focus: null },
    record: REQUIRED_INFORMATION_OWNER,
    opportunity: REQUIRED_INFORMATION_OWNER,
    opportunities: REQUIRED_INFORMATION_OWNER,
    required_information: REQUIRED_INFORMATION_OWNER,
};

function friendlyOwnerLabel(token: string): string {
    const cleaned = token.trim().replace(/[_:-]+/g, " ").trim();
    if (!cleaned) return "Other requirements";
    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Resolve the owning capability for a requirement from runtime metadata. `entityType`
 * (readiness gap / field-rule entity) wins over `scope` (config checklist) when present.
 * Falls back to Required information; an unknown token yields a labeled, non-navigable group.
 */
export function resolveCurrentWorkRequirementOwner(input: {
    scope?: string | null;
    entityType?: string | null;
}): CurrentWorkRequirementOwner {
    const raw = (input.entityType ?? input.scope ?? "").trim().toLowerCase();
    if (!raw) return REQUIRED_INFORMATION_OWNER;
    const known = OWNER_BY_METADATA[raw];
    if (known) return known;
    return { key: raw, label: friendlyOwnerLabel(raw), card: null, focus: null };
}
