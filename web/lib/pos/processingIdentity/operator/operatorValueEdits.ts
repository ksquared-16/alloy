/**
 * OPERATOR CORRECTIONS TO THE PROPOSED VALUES — before approval, never to the evidence.
 *
 * A public intake's submission (payload snapshot, intake meta, facts) is evidence and is never
 * rewritten. What the operator corrects is the PROPOSAL: the values the plan will commit for each
 * subject (parent names, email, phone; child names and date of birth; the lead's location). Edits live
 * in one place — `processing_cases.metadata.operator_value_edits_v1`, keyed by subject ref and field —
 * each with the value it replaced, who changed it and when, so the original stays inspectable beside
 * the correction. They are applied when the plan is built (`buildPlan`), the one path to the single
 * lead writer; nothing here writes a canonical record.
 *
 * Derived values follow the corrected facts: a child's display name follows its corrected first/last
 * name, and the household and lead names follow the primary parent's corrected names — so a corrected
 * surname does not leave "Smiht Family" behind.
 */
import { buildHouseholdLeadDisplayName } from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";
import { normalizePhone } from "@/lib/identity/normalizePhone";

import type { IdentityResolutionSet, ResolvedSubject } from "./recommendationBuilder";

export const OPERATOR_VALUE_EDITS_KEY = "operator_value_edits_v1";

export type EditableFieldType = "text" | "email" | "phone" | "date" | "location";
export type EditableField = { key: string; label: string; type: EditableFieldType; required: boolean };

/** What an operator may correct, per subject role. Anything else is refused. */
export const EDITABLE_FIELDS: Readonly<Record<string, readonly EditableField[]>> = {
    parent: [
        { key: "first_name", label: "First name", type: "text", required: true },
        { key: "last_name", label: "Last name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: false },
        { key: "phone", label: "Mobile", type: "phone", required: false },
    ],
    child: [
        { key: "first_name", label: "First name", type: "text", required: true },
        { key: "last_name", label: "Last name", type: "text", required: false },
        { key: "dob", label: "Date of birth", type: "date", required: false },
    ],
    lead: [{ key: "location_id", label: "Location", type: "location", required: true }],
};

export type OperatorValueEdit = { value: string | null; from: unknown; actor_id: string | null; at: string };
/** `{ [subjectRef]: { role, values: { [field]: edit } } }` */
export type OperatorValueEdits = Record<string, { role: string; values: Record<string, OperatorValueEdit> }>;

export function readOperatorValueEdits(metadata: Record<string, unknown> | null | undefined): OperatorValueEdits {
    const raw = metadata?.[OPERATOR_VALUE_EDITS_KEY];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as OperatorValueEdits) : {};
}

export type NormalizedEdit = { ok: true; value: string | null } | { ok: false; message: string };

/** Validate and normalize one value to its canonical stored form. */
export function normalizeEditValue(field: EditableField, raw: unknown, allowedLocationIds?: ReadonlySet<string>): NormalizedEdit {
    const text = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    if (!text) return field.required ? { ok: false, message: `${field.label} is required.` } : { ok: true, value: null };
    switch (field.type) {
        case "email":
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? { ok: true, value: text.toLowerCase() } : { ok: false, message: "Enter a valid email address." };
        case "phone": {
            const digits = text.replace(/\D/g, "");
            if (digits.length < 10) return { ok: false, message: "Enter a full phone number." };
            return { ok: true, value: normalizePhone(text) };
        }
        case "date": {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
                return { ok: false, message: "Enter a valid date." };
            }
            return { ok: true, value: text };
        }
        case "location":
            if (allowedLocationIds && !allowedLocationIds.has(text)) return { ok: false, message: "Choose one of this organization's locations." };
            return { ok: true, value: text };
        default:
            return { ok: true, value: text.slice(0, 200) };
    }
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The subject's values with the operator's corrections applied, plus the names derived from them. */
export function applyOperatorValueEdits(set: IdentityResolutionSet, edits: OperatorValueEdits): IdentityResolutionSet {
    if (Object.keys(edits).length === 0) return set;
    const withEdits = (s: ResolvedSubject): Record<string, unknown> => {
        const own = edits[s.ref]?.values ?? {};
        const next: Record<string, unknown> = { ...(s.values ?? {}) };
        for (const [key, edit] of Object.entries(own)) next[key] = edit.value;
        if (s.role === "child" && (own.first_name || own.last_name)) {
            next.display_name = [str(next.first_name), str(next.last_name)].filter(Boolean).join(" ").trim() || "Child";
        }
        return next;
    };
    const subjects = set.subjects.map((s) => ({ ...s, values: withEdits(s) }));
    const primaryParent = subjects.find((s) => s.role === "parent");
    const parentNamesEdited = primaryParent ? Boolean(edits[primaryParent.ref]?.values.first_name || edits[primaryParent.ref]?.values.last_name) : false;
    if (!primaryParent || !parentNamesEdited) return { subjects };
    const householdName = buildHouseholdLeadDisplayName({
        firstName: str(primaryParent.values?.first_name) ?? undefined,
        lastName: str(primaryParent.values?.last_name) ?? undefined,
        fallback: "Household",
    });
    return {
        subjects: subjects.map((s) => {
            if (s.role === "household") return { ...s, values: { ...(s.values ?? {}), household_name: householdName } };
            if (s.role === "lead") return { ...s, values: { ...(s.values ?? {}), name: householdName } };
            return s;
        }),
    };
}

/** Merge new edits into the stored map, recording what each replaced. A value equal to the submitted one clears the edit. */
export function mergeOperatorValueEdits(input: {
    existing: OperatorValueEdits;
    subjectRef: string;
    role: string;
    field: string;
    value: string | null;
    submitted: unknown;
    actorId: string | null;
    at: string;
}): OperatorValueEdits {
    const next: OperatorValueEdits = JSON.parse(JSON.stringify(input.existing));
    const entry = next[input.subjectRef] ?? { role: input.role, values: {} };
    const sameAsSubmitted = (input.submitted ?? null) === input.value || (typeof input.submitted === "string" && input.submitted.trim() === (input.value ?? ""));
    if (sameAsSubmitted) delete entry.values[input.field];
    else entry.values[input.field] = { value: input.value, from: input.submitted ?? null, actor_id: input.actorId, at: input.at };
    if (Object.keys(entry.values).length === 0) delete next[input.subjectRef];
    else next[input.subjectRef] = entry;
    return next;
}
