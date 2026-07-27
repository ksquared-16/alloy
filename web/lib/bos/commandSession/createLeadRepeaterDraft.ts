/**
 * Bridge Create Lead Form repeaters ↔ shared BosCommandDraft.
 * Multi-member truth lives in draft.household as CreateLeadCommitSelection (version 1)
 * or IntakeHouseholdCandidate from Conversation parse (converted on read).
 */

import {
    buildCreateLeadCommitSelection,
    createEmptyCreateLeadCommitSelection,
    isCreateLeadCommitSelection,
    parseCreateLeadCommitSelection,
    syncCreateLeadValuesFromCommitSelection,
    type CreateLeadCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import {
    applyFormValuesToDraft,
    formValuesFromDraft,
} from "@/lib/bos/commandSession/draftEdits";
import {
    bosDraftToEligiblePayload,
} from "@/lib/bos/commandSession/draftValues";
import type { BosCommandDraft } from "@/lib/bos/commandSession/types";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import {
    householdFromCommitSelection,
    householdFromFlatCreateLeadMerged,
} from "@/lib/pos/processingIdentity/sources/householdFromCommitSelection";

function isIntakeHouseholdCandidate(value: unknown): value is IntakeHouseholdCandidate {
    if (!value || typeof value !== "object") return false;
    if (isCreateLeadCommitSelection(value)) return false;
    const obj = value as Record<string, unknown>;
    return Array.isArray(obj.children) || Array.isArray(obj.parents_guardians) || Array.isArray(obj.parents);
}

/** Resolve repeater selection from the shared draft (parse household or prior Form edits). */
export function resolveCreateLeadCommitSelectionFromDraft(
    draft: BosCommandDraft,
): CreateLeadCommitSelection {
    const fromStored = parseCreateLeadCommitSelection(draft.household);
    if (fromStored) {
        if (fromStored.parents.length === 0) {
            return { ...fromStored, parents: createEmptyCreateLeadCommitSelection().parents };
        }
        return fromStored;
    }
    if (isIntakeHouseholdCandidate(draft.household)) {
        const built = buildCreateLeadCommitSelection(draft.household);
        if (built.parents.length === 0) {
            return createEmptyCreateLeadCommitSelection();
        }
        return built;
    }
    const flat = formValuesFromDraft(draft);
    const fromFlat = householdFromFlatCreateLeadMerged(flat);
    if (fromFlat) return buildCreateLeadCommitSelection(fromFlat);
    return createEmptyCreateLeadCommitSelection();
}

/**
 * Apply Form repeater edits into the shared draft.
 * Stores selection on household; syncs primary flat values for eligibility/Conversation.
 */
export function applyCreateLeadCommitSelectionToDraft(
    draft: BosCommandDraft,
    selection: CreateLeadCommitSelection,
): BosCommandDraft {
    const flat = formValuesFromDraft(draft);
    const synced = syncCreateLeadValuesFromCommitSelection(flat, selection);
    // Preserve context fields that are not member-scoped.
    for (const key of ["location_id", "source", "intake_notes"] as const) {
        if (flat[key] != null) synced[key] = flat[key]!;
    }
    let next = applyFormValuesToDraft(draft, synced);
    next = {
        ...next,
        household: selection,
    };
    return next;
}

/** Eligible execute payload with household_commit_v1 when repeaters exist. */
export function bosDraftToCreateLeadExecutePayload(draft: BosCommandDraft): Record<string, unknown> {
    const base = bosDraftToEligiblePayload(draft);
    const selection = resolveCreateLeadCommitSelectionFromDraft(draft);
    const hasMulti =
        selection.parents.length > 1 ||
        selection.children.length > 0 ||
        isCreateLeadCommitSelection(draft.household) ||
        isIntakeHouseholdCandidate(draft.household);
    if (!hasMulti && selection.parents.length <= 1 && selection.children.length === 0) {
        // Still emit selection when Form stored an empty-child selection with one parent —
        // keep flat path unless household was set.
        if (draft.household == null) return base;
    }
    const flatStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) {
        if (typeof v === "string") flatStrings[k] = v;
    }
    const mapped = mapCreateLeadCommitSelectionToExecutePayload({
        values: { ...formValuesFromDraft(draft), ...flatStrings },
        selection,
    });
    return {
        ...base,
        ...mapped,
        household_commit: selection,
    };
}

export function summarizeCommitParents(selection: CreateLeadCommitSelection): string[] {
    return selection.parents.map((p) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Parent / guardian";
        const contact = [p.email, p.phone].filter(Boolean).join(" · ");
        return contact ? `${name} · ${contact}` : name;
    });
}

export function summarizeCommitChildren(selection: CreateLeadCommitSelection): string[] {
    return selection.children.map((c) => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Child";
        const bits = [
            name,
            c.program_interest ? c.program_interest : null,
            c.start_date ? `Start ${c.start_date}` : null,
            c.dob ? `Born ${c.dob}` : null,
        ].filter(Boolean);
        return bits.join(" · ");
    });
}

/** Rebuild intake household from selection for Conversation understanding compatibility. */
export function intakeHouseholdFromDraftSelection(draft: BosCommandDraft): IntakeHouseholdCandidate | null {
    const selection = resolveCreateLeadCommitSelectionFromDraft(draft);
    if (selection.parents.every((p) => !p.first_name && !p.last_name) && selection.children.length === 0) {
        return null;
    }
    const locationId = formValuesFromDraft(draft).location_id?.trim() || null;
    return householdFromCommitSelection(selection, { locationId });
}
