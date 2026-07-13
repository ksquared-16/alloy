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

import {
    buildOpportunityFamilyContactRows,
    resolveLeadSummaryPrimaryPersonId,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
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

export type HouseholdPersonSeed = {
    personId: string;
    /** Display name for the edit title ("Edit {name}"). */
    name: string;
    values: PersonContactValues;
};

/**
 * Seed the editable draft for a SPECIFIC household person row (any contact, not just
 * the primary). Reads that person's row from the contact arrays by id; prefers the
 * richer namespaced primary keys when the person IS the primary. Pure. Returns null
 * when the person can't be resolved (→ not editable).
 */
/** True when personId is a real person UUID usable for mutation (not synthetic display ids). */
export function isEditableHouseholdPersonId(personId: string | null | undefined): boolean {
    const id = (personId ?? "").trim();
    if (!id) return false;
    if (id === "primary") return false;
    if (id.startsWith("secondary:")) return false;
    return true;
}

export function seedHouseholdContactValuesForPerson(
    truth: Record<string, unknown>,
    personId: string,
): HouseholdPersonSeed | null {
    const id = personId.trim();
    if (!isEditableHouseholdPersonId(id)) return null;
    const row = buildOpportunityFamilyContactRows(truth).find((r) => r.person_id === id) ?? null;
    const isPrimary = resolveLeadSummaryPrimaryPersonId(truth) === id;
    if (!row && !isPrimary) return null;

    const name = trimStr(row?.name) || trimStr(truth["person.primary_contact_name"]);
    const split = splitName(name);
    return {
        personId: id,
        name: name || "Contact",
        values: {
            first_name: (isPrimary && trimStr(truth.first_name)) || split.first_name,
            last_name: (isPrimary && trimStr(truth.last_name)) || split.last_name,
            email: trimStr(row?.email) || (isPrimary ? trimStr(truth["person.primary_email"]) : ""),
            phone: trimStr(row?.phone) || (isPrimary ? trimStr(truth["person.primary_phone"]) : ""),
        },
    };
}

/**
 * Seed editor for a card evidence contact — prefers authoritative family-row values,
 * overlays display name/channels from the card evidence when the truth row is thin.
 * Pure. Returns null for synthetic ids.
 */
export function seedHouseholdContactValuesFromEvidence(
    truth: Record<string, unknown>,
    contact: {
        personId: string;
        name: string;
        email?: string | null;
        phone?: string | null;
    },
): HouseholdPersonSeed | null {
    const fromTruth = seedHouseholdContactValuesForPerson(truth, contact.personId);
    if (!isEditableHouseholdPersonId(contact.personId)) return null;
    const id = contact.personId.trim();
    const split = splitName(contact.name);
    // Prefer authoritative row values; fill gaps from evidence (strip display phone later in UI if needed).
    const email = (fromTruth?.values.email || trimStr(contact.email)).trim();
    const phone = (fromTruth?.values.phone || trimStr(contact.phone)).trim();
    return {
        personId: id,
        name: (fromTruth?.name || contact.name || "Contact").trim(),
        values: {
            first_name: fromTruth?.values.first_name || split.first_name,
            last_name: fromTruth?.values.last_name || split.last_name,
            email,
            phone,
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
    editableKeys?: ReadonlySet<keyof PersonContactValues>,
): PersonContactPatch {
    const patch: PersonContactPatch = {};
    for (const key of CONTACT_FIELDS) {
        if (editableKeys && !editableKeys.has(key)) continue;
        const next = draft[key].trim();
        if (next === baseline[key].trim()) continue;
        patch[key] = next === "" ? null : next;
    }
    return patch;
}
