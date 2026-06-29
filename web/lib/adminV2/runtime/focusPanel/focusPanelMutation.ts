/**
 * Focus Panel mutation seam (Household V1 live editing).
 *
 * A SEPARATE injected capability — the same pattern as `coordination`. It is NOT a
 * method on `OperationalContext` (the context stays read-only truth; cards observe
 * it, never write to it). A truth card receives a `FocusPanelMutation` and calls it
 * to propose a change; the adapter persists through the EXISTING person PATCH path
 * (which owns permissions + validation) and broadcasts the EXISTING record-patch
 * events so the host re-merges the VM and `buildOperationalContext` recomposes — the
 * card then reflects saved truth with no manual refresh.
 *
 * This introduces NO new mutation path: persistence is `patchLinkedPersonFromOpportunityDrawer`
 * → `PATCH /api/admin/persons/[id]`, identical to the drawer's linked-person edit.
 *
 * Audit parity: the person PATCH route does not write an audit row today; reusing it
 * preserves exactly that behavior — nothing is added, nothing is bypassed.
 *
 * @see docs/sprints/06_2026/focus_panel_live_editing_plan.md
 * @see docs/platform/operator/operational-context-boundary.md (truth is read-only)
 */

import {
    applyPersonPatchToOpportunityHydration,
    patchLinkedPersonFromOpportunityDrawer,
} from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import { resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";

/** Primary-contact/person fields editable on the Household card (V1). */
export type PersonContactValues = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
};

/** Only the changed fields, normalized (empty → null) for the PATCH body. */
export type PersonContactPatch = Partial<Record<keyof PersonContactValues, string | null>>;

export type FocusPanelSaveResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

/** The injected mutation capability a truth card uses to propose a change. */
export type FocusPanelMutation = {
    /** Whether the operator may edit truth on this subject (mirrors `capabilities.canMutate`). */
    canEdit: boolean;
    /** Persist primary-contact field edits via the existing person PATCH route + refresh. */
    savePersonContact: (personId: string, patch: PersonContactPatch) => Promise<FocusPanelSaveResult>;
};

/** The subset of a persons PATCH response this seam reads back. */
type SavedPerson = {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function fullNameFrom(person: SavedPerson): string | null {
    return (
        trimOrNull(person.full_name) ??
        ([trimOrNull(person.first_name), trimOrNull(person.last_name)].filter(Boolean).join(" ").trim() || null)
    );
}

/** Update the matching person's row (by `person_id`) inside a contact array. */
function updateContactArray(value: unknown, personId: string, saved: SavedPerson): unknown {
    if (!Array.isArray(value)) return value;
    const fullName = fullNameFrom(saved);
    return value.map((row) => {
        if (!row || typeof row !== "object") return row;
        const r = row as Record<string, unknown>;
        if (trimOrNull(r.person_id) !== personId) return row;
        const next: Record<string, unknown> = { ...r };
        if (fullName) next.name = fullName;
        if (saved.email !== undefined) next.email = trimOrNull(saved.email);
        if (saved.phone !== undefined) next.phone = trimOrNull(saved.phone);
        return next;
    });
}

/**
 * Merge a saved person back into the Focus Panel subject truth so the Household card
 * recomposes to the new values for THAT person. Pure — returns a NEW record.
 *
 * Updates the edited person wherever they appear:
 *   - their row in the contact arrays (`_opportunity_persons` / `_customer_persons`),
 *     keyed by `person_id` — so ANY contact row recomposes, not just the primary; and
 *   - when the edited person is the PRIMARY contact, also the namespaced primary keys
 *     (`person.primary_contact_name` / `_email` / `_phone`), generic hydration, and
 *     `_identity.primary_person.label` (the card's headline channel).
 */
export function mergePersonContactIntoFocusPanelTruth(
    truth: Record<string, unknown>,
    personId: string,
    saved: SavedPerson,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...truth };
    merged._opportunity_persons = updateContactArray(merged._opportunity_persons, personId, saved);
    merged._customer_persons = updateContactArray(merged._customer_persons, personId, saved);

    if (personId === resolveLeadSummaryPrimaryPersonId(truth)) {
        applyPersonPatchToOpportunityHydration(merged, saved);
        const fullName = fullNameFrom(saved);
        if (fullName) merged["person.primary_contact_name"] = fullName;
        if (saved.email !== undefined) merged["person.primary_email"] = trimOrNull(saved.email);
        if (saved.phone !== undefined) merged["person.primary_phone"] = trimOrNull(saved.phone);
        const identity = merged._identity as { primary_person?: { id?: unknown; label?: unknown } } | null | undefined;
        if (fullName && identity && typeof identity === "object" && identity.primary_person) {
            merged._identity = {
                ...identity,
                primary_person: { ...identity.primary_person, label: fullName },
            };
        }
    }

    return merged;
}

export type BuildFocusPanelMutationInput = {
    canMutate: boolean;
    /** The opportunity (subject) id — keys the record-patch refresh events. */
    opportunityId: string;
    /** Current observed subject truth (read-only) used to build the merged refresh record. */
    truth: Record<string, unknown>;
    /** Test seam. */
    fetchFn?: typeof fetch;
};

/**
 * Build the Household mutation adapter for an opportunity Focus Panel. Persists via
 * the existing person PATCH helper and, on success, dispatches the existing
 * record-patch events that drive VM merge + context recomposition.
 */
export function buildOpportunityFocusPanelMutation(input: BuildFocusPanelMutationInput): FocusPanelMutation {
    const { canMutate, opportunityId, truth, fetchFn } = input;
    return {
        canEdit: canMutate,
        savePersonContact: async (personId, patch) => {
            const id = personId.trim();
            if (!id) return { ok: false, status: 400, error: "No person to edit" };

            const res = await patchLinkedPersonFromOpportunityDrawer({ personId: id, body: patch, fetchFn });
            if (!res.ok) return { ok: false, status: res.status, error: res.error };

            const merged = mergePersonContactIntoFocusPanelTruth(truth, id, res.json as SavedPerson);
            dispatchOpportunityDrawerRecordPatch(opportunityId, merged);
            dispatchDrawerLayoutRuntimeBodyRecordPatch({
                entityType: "opportunities",
                entityId: opportunityId,
                record: merged,
            });
            return { ok: true };
        },
    };
}
