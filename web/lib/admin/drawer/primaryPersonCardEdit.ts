/**
 * Person contact cards in drawer surfaces (Family & contacts, etc.).
 * Writes always PATCH `/api/admin/persons/:id` — never the host opportunity row.
 */

import {
    OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS,
    patchLinkedPersonFromOpportunityDrawer,
    primaryPersonIdFromOpportunityRecord,
    readLinkedPersonMirrorValue,
    resolveOpportunityLinkedFieldSources,
    type FieldDefForLinkedEdit,
} from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { resolveFieldEditability } from "@/lib/fields/fieldInteractionPolicy";

export type PersonContactCardFieldKey = "first_name" | "last_name" | "email" | "phone";
/** @deprecated alias */ export type PrimaryPersonCardFieldKey = PersonContactCardFieldKey;

export type PersonContactCardFieldGate = {
    editable: boolean;
    readOnlyReason: string | null;
};
/** @deprecated alias */ export type PrimaryPersonCardFieldGate = PersonContactCardFieldGate;

export type PersonContactCardValues = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    display_name: string;
};
/** @deprecated alias */ export type PrimaryPersonCardValues = PersonContactCardValues;

function trimStr(v: unknown): string {
    if (v == null) return "";
    return String(v).trim();
}

function splitDisplayName(displayName: string): { first_name: string; last_name: string } {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first_name: "", last_name: "" };
    if (parts.length === 1) return { first_name: parts[0] ?? "", last_name: "" };
    return { first_name: parts[0] ?? "", last_name: parts.slice(1).join(" ") };
}

export function personContactCardValuesFromOpportunityPersonRow(row: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
}): PersonContactCardValues {
    const display_name = trimStr(row.name);
    let { first_name, last_name } = splitDisplayName(display_name);
    return {
        first_name,
        last_name,
        email: trimStr(row.email),
        phone: trimStr(row.phone),
        display_name,
    };
}

export function primaryPersonCardValuesFromRecord(record: Record<string, unknown>): PersonContactCardValues {
    let first_name = trimStr(readLinkedPersonMirrorValue(record, "first_name", "first_name"));
    let last_name = trimStr(readLinkedPersonMirrorValue(record, "last_name", "last_name"));
    const email = trimStr(readLinkedPersonMirrorValue(record, "email", "email"));
    const phone = trimStr(readLinkedPersonMirrorValue(record, "phone", "phone"));
    const display_name = trimStr(record._primary_person_name);

    if (!first_name && !last_name && display_name) {
        ({ first_name, last_name } = splitDisplayName(display_name));
    }

    return { first_name, last_name, email, phone, display_name };
}

/**
 * Linked adult on opportunity (`_opportunity_persons` row): person_id is authoritative.
 * Opportunity field_definitions do not describe per-row linked people; use person PATCH when allowed.
 */
export function resolveLinkedPersonContactCardFieldGates(
    personId: string | null | undefined,
    canMutate: boolean
): Record<PersonContactCardFieldKey, PersonContactCardFieldGate> {
    const pid = trimStr(personId);
    const out = {} as Record<PersonContactCardFieldKey, PersonContactCardFieldGate>;
    for (const key of OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS) {
        const fieldKey = key as PersonContactCardFieldKey;
        if (!pid) {
            out[fieldKey] = {
                editable: false,
                readOnlyReason: "No linked person record for this contact.",
            };
            continue;
        }
        if (!canMutate) {
            out[fieldKey] = {
                editable: false,
                readOnlyReason: "You do not have permission to edit.",
            };
            continue;
        }
        out[fieldKey] = { editable: true, readOnlyReason: null };
    }
    return out;
}

/** Merge person PATCH into `_opportunity_persons` list on opportunity GET payload (display only). */
export function applyPersonPatchToOpportunityPersonList(
    hostRecord: Record<string, unknown>,
    personId: string,
    person: {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
    }
): void {
    const pid = trimStr(personId);
    if (!pid) return;
    const raw = hostRecord._opportunity_persons;
    if (!Array.isArray(raw)) return;
    const full =
        (person.full_name && String(person.full_name).trim()) ||
        [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
        null;
    hostRecord._opportunity_persons = raw.map((item) => {
        if (!item || typeof item !== "object") return item;
        const row = item as Record<string, unknown>;
        if (trimStr(row.person_id) !== pid) return item;
        return {
            ...row,
            name: full ?? row.name,
            email: person.email == null ? null : String(person.email).trim() || null,
            phone: person.phone == null ? null : String(person.phone).trim() || null,
        };
    });
}

/** Per-field edit gates for the hardcoded primary person card. */
export function resolvePrimaryPersonCardFieldGates(
    record: Record<string, unknown>,
    defs: FieldDefForLinkedEdit[],
    canMutate: boolean
): Record<PersonContactCardFieldKey, PersonContactCardFieldGate> {
    const personId = primaryPersonIdFromOpportunityRecord(record);
    const linked = resolveOpportunityLinkedFieldSources(record, defs, {
        permission_keys: ["__drawer_display__"],
    });

    const out = {} as Record<PersonContactCardFieldKey, PersonContactCardFieldGate>;

    for (const key of OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS) {
        const fieldKey = key as PersonContactCardFieldKey;
        if (!personId) {
            out[fieldKey] = {
                editable: false,
                readOnlyReason: "No primary person linked on this opportunity.",
            };
            continue;
        }
        if (!canMutate) {
            out[fieldKey] = {
                editable: false,
                readOnlyReason: "You do not have permission to edit.",
            };
            continue;
        }

        const linkedSource = linked[fieldKey];
        if (linkedSource) {
            out[fieldKey] = {
                editable: linkedSource.editable,
                readOnlyReason: linkedSource.editable ? null : linkedSource.read_only_reason,
            };
            continue;
        }

        const def = defs.find((d) => d.field_key === fieldKey);
        if (def) {
            const editability = resolveFieldEditability(
                { ...def, entity_type: "opportunity" },
                { permission_keys: ["__drawer_display__"] }
            );
            if (!editability.editable) {
                out[fieldKey] = {
                    editable: false,
                    readOnlyReason:
                        editability.lock_reason?.trim() ||
                        (editability.editability_mode === "read_only"
                            ? "Read-only (policy)"
                            : "Read-only (policy)"),
                };
                continue;
            }
        }

        out[fieldKey] = { editable: true, readOnlyReason: null };
    }

    return out;
}

export function personContactCardHasEditableField(
    gates: Record<PersonContactCardFieldKey, PersonContactCardFieldGate>
): boolean {
    return (Object.values(gates) as PersonContactCardFieldGate[]).some((g) => g.editable);
}

/** @deprecated alias */ export const primaryPersonCardHasEditableField = personContactCardHasEditableField;

function normalizePatchScalar(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    if (typeof v === "string") return v.trim() || null;
    return String(v).trim() || null;
}

/** Delay before persisting after focus leaves the whole card (allows tab between name fields). */
export const PERSON_CONTACT_CARD_SAVE_DELAY_MS = 350;
/** @deprecated alias */ export const PRIMARY_PERSON_CARD_SAVE_DELAY_MS = PERSON_CONTACT_CARD_SAVE_DELAY_MS;

export function isPersonContactCardDirty(
    draft: PersonContactCardValues,
    baseline: PersonContactCardValues
): boolean {
    return Object.keys(buildPersonContactCardPatch(draft, baseline)).length > 0;
}

/** @deprecated alias */ export const isPrimaryPersonCardDirty = isPersonContactCardDirty;

/** Build person PATCH body for changed scalars only. */
export function buildPersonContactCardPatch(
    draft: PersonContactCardValues,
    baseline: PersonContactCardValues
): Partial<Record<PersonContactCardFieldKey, string | null>> {
    const patch: Partial<Record<PersonContactCardFieldKey, string | null>> = {};
    for (const key of OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS) {
        const fieldKey = key as PersonContactCardFieldKey;
        const next = normalizePatchScalar(draft[fieldKey]);
        const prev = normalizePatchScalar(baseline[fieldKey]);
        if (next !== prev) {
            patch[fieldKey] = next;
        }
    }
    return patch;
}

/** @deprecated alias */ export const buildPrimaryPersonCardPatch = buildPersonContactCardPatch;

export { patchLinkedPersonFromOpportunityDrawer, primaryPersonIdFromOpportunityRecord };
