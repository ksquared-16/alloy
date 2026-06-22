/**
 * Layout runtime person-contact field edits — writes PATCH person, not opportunity host.
 */

import {
    patchLinkedPersonFromOpportunityDrawer,
    primaryPersonIdFromOpportunityRecord,
} from "@/lib/admin/drawer/linkedRecordFieldEditing";
import {
    isPersonAddressLayoutRefKey,
    personAddressValueKeyFromLayoutRefKey,
} from "@/lib/layout/personDrawerAddressLayoutRefs";

const PERSON_NATIVE_FIELD_BY_REF_KEY: Record<string, "first_name" | "last_name" | "email" | "phone"> = {
    "person.first_name": "first_name",
    "person.last_name": "last_name",
    first_name: "first_name",
    last_name: "last_name",
    "person.primary_email": "email",
    "person.email": "email",
    email: "email",
    "person.primary_phone": "phone",
    "person.phone": "phone",
    phone: "phone",
};

export function isLayoutRuntimePersonContactRefKey(refKey: string): boolean {
    return refKey in PERSON_NATIVE_FIELD_BY_REF_KEY;
}

export function isLayoutRuntimePersonAddressRefKey(refKey: string): boolean {
    return isPersonAddressLayoutRefKey(refKey);
}

export function isLayoutRuntimePersonFieldRefKey(refKey: string): boolean {
    return isLayoutRuntimePersonContactRefKey(refKey) || isLayoutRuntimePersonAddressRefKey(refKey);
}

function trimPersonId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

export function resolveLayoutRuntimePersonId(record: Record<string, unknown>): string | null {
    const fromOpportunityHost = primaryPersonIdFromOpportunityRecord(record);
    if (fromOpportunityHost) return fromOpportunityHost;

    const fromPersonDrawer =
        trimPersonId(record["person.id"])
        ?? trimPersonId(record.id);
    if (fromPersonDrawer) return fromPersonDrawer;

    const overview = record._overview_data;
    if (overview && typeof overview === "object") {
        const fromOverview = primaryPersonIdFromOpportunityRecord(overview as Record<string, unknown>);
        if (fromOverview) return fromOverview;
        const overviewPersonId =
            trimPersonId((overview as Record<string, unknown>)["person.id"])
            ?? trimPersonId((overview as Record<string, unknown>).id);
        if (overviewPersonId) return overviewPersonId;
    }

    return trimPersonId(record["opportunity.primary_person_id"]);
}

export function buildLayoutRuntimePersonContactPatch(
    baseline: Record<string, string>,
    draft: Record<string, string>,
): Record<string, string> {
    const patch: Record<string, string> = {};
    for (const [refKey, personField] of Object.entries(PERSON_NATIVE_FIELD_BY_REF_KEY)) {
        const base = (baseline[refKey] ?? "").trim();
        const next = (draft[refKey] ?? "").trim();
        if (base !== next) {
            patch[personField] = next;
        }
    }
    for (const refKey of Object.keys(draft)) {
        if (!isLayoutRuntimePersonAddressRefKey(refKey)) continue;
        const valueKey = personAddressValueKeyFromLayoutRefKey(refKey);
        if (!valueKey) continue;
        const base = (baseline[refKey] ?? "").trim();
        const next = (draft[refKey] ?? "").trim();
        if (base !== next) {
            patch[valueKey] = next;
        }
    }
    return patch;
}

export async function saveLayoutRuntimePersonContactEdits(input: {
    record: Record<string, unknown>;
    baseline: Record<string, string>;
    draft: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const personId = resolveLayoutRuntimePersonId(input.record);
    if (!personId) {
        return { ok: false, error: "Primary contact person is not linked to this record." };
    }
    const body = buildLayoutRuntimePersonContactPatch(input.baseline, input.draft);
    if (Object.keys(body).length === 0) return { ok: true };

    const result = await patchLinkedPersonFromOpportunityDrawer({ personId, body });
    if (!result.ok) {
        return { ok: false, error: result.error ?? "Save failed" };
    }
    return { ok: true };
}
