/**
 * Household primary-contact edit state — PURE helpers (no React, no DOM, no I/O).
 *
 * Seeds the editable draft from the observed subject truth and computes dirty /
 * changed-field-only patches. The Focus Panel subject truth carries the primary
 * contact as a combined name + namespaced email/phone (no split first/last), so the
 * seed prefers explicit `first_name`/`last_name` mirror keys when present and
 * otherwise splits the combined name. Only fields the operator actually changes are
 * sent, so a best-effort name split is never persisted unless the operator edits it.
 *
 * @see focusPanelMutation.ts (the save adapter that consumes the patch)
 */

import { resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import type { PersonContactPatch, PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

const CONTACT_FIELDS = ["first_name", "last_name", "email", "phone"] as const;

function trimStr(value: unknown): string {
    if (value == null) return "";
    return String(value).trim();
}

/** Split a combined display name into first (first token) + last (remainder). */
function splitName(name: string): { first_name: string; last_name: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first_name: "", last_name: "" };
    if (parts.length === 1) return { first_name: parts[0]!, last_name: "" };
    return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

export type HouseholdContactSeed = {
    /** Real primary person id, or null when none is linked (→ not editable). */
    personId: string | null;
    values: PersonContactValues;
};

/** Seed the editable draft from observed subject truth. Pure. */
export function seedHouseholdContactValues(truth: Record<string, unknown>): HouseholdContactSeed {
    const personId = resolveLeadSummaryPrimaryPersonId(truth);

    const explicitFirst = trimStr(truth.first_name);
    const explicitLast = trimStr(truth.last_name);
    const combined = trimStr(truth["person.primary_contact_name"]);
    const fromSplit = splitName(combined);

    return {
        personId: personId && personId.trim() ? personId.trim() : null,
        values: {
            first_name: explicitFirst || fromSplit.first_name,
            last_name: explicitLast || fromSplit.last_name,
            email: trimStr(truth["person.primary_email"]),
            phone: trimStr(truth["person.primary_phone"]),
        },
    };
}

/** True when any editable field differs from its baseline (trim-normalized). */
export function householdContactDirty(draft: PersonContactValues, baseline: PersonContactValues): boolean {
    return CONTACT_FIELDS.some((key) => draft[key].trim() !== baseline[key].trim());
}

/** Build the PATCH body from changed fields only; empty string → null. Pure. */
export function householdContactPatch(
    draft: PersonContactValues,
    baseline: PersonContactValues,
): PersonContactPatch {
    const patch: PersonContactPatch = {};
    for (const key of CONTACT_FIELDS) {
        const next = draft[key].trim();
        if (next === baseline[key].trim()) continue;
        patch[key] = next === "" ? null : next;
    }
    return patch;
}
