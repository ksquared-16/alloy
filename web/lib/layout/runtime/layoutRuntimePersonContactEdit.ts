/**
 * Layout runtime person-contact field edits — writes PATCH person, not opportunity host.
 */

import {
    patchLinkedPersonFromOpportunityDrawer,
    primaryPersonIdFromOpportunityRecord,
} from "@/lib/admin/drawer/linkedRecordFieldEditing";

const PERSON_FIELD_BY_REF_KEY: Record<string, "first_name" | "last_name" | "email" | "phone"> = {
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
    return refKey in PERSON_FIELD_BY_REF_KEY;
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
): Partial<Record<"first_name" | "last_name" | "email" | "phone", string>> {
    const patch: Partial<Record<"first_name" | "last_name" | "email" | "phone", string>> = {};
    for (const [refKey, personField] of Object.entries(PERSON_FIELD_BY_REF_KEY)) {
        const base = (baseline[refKey] ?? "").trim();
        const next = (draft[refKey] ?? "").trim();
        if (base !== next) {
            patch[personField] = next;
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
