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
import type { LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import {
    isLayoutRuntimeRoleContactEditableRefKey,
    isLayoutRuntimeRoleContactFieldRefKey,
    resolveLayoutRuntimeContactRoleFieldCapability,
    resolvePersonIdForContactRoleRef,
} from "@/lib/layout/runtime/layoutRuntimeContactRoleFieldCapability";

export function isLayoutRuntimePersonContactRefKey(refKey: string): boolean {
    return isLayoutRuntimeRoleContactFieldRefKey(refKey);
}

export function isLayoutRuntimePersonAddressRefKey(refKey: string): boolean {
    return isPersonAddressLayoutRefKey(refKey);
}

export function isLayoutRuntimePersonFieldRefKey(refKey: string): boolean {
    return isLayoutRuntimeRoleContactEditableRefKey(refKey) || isLayoutRuntimePersonAddressRefKey(refKey);
}

function trimPersonId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Person drawer host — not role-scoped opportunity contact resolution. */
export function resolveLayoutRuntimePersonId(record: Record<string, unknown>): string | null {
    const fromPersonDrawer =
        trimPersonId(record["person.id"])
        ?? trimPersonId(record.id);
    if (fromPersonDrawer && !primaryPersonIdFromOpportunityRecord(record)) {
        return fromPersonDrawer;
    }

    const fromOpportunityHost = primaryPersonIdFromOpportunityRecord(record);
    if (fromOpportunityHost) return fromOpportunityHost;

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

function patchBodyForRefKey(refKey: string, value: string): Record<string, string> | null {
    const capability = resolveLayoutRuntimeContactRoleFieldCapability(refKey);
    if (capability?.editable && capability.personField && capability.personField !== "display_name") {
        return { [capability.personField]: value };
    }
    if (isLayoutRuntimePersonAddressRefKey(refKey)) {
        const valueKey = personAddressValueKeyFromLayoutRefKey(refKey);
        if (valueKey) return { [valueKey]: value };
    }
    return null;
}

export function buildLayoutRuntimePersonContactPatch(
    baseline: Record<string, string>,
    draft: Record<string, string>,
): Record<string, string> {
    const patch: Record<string, string> = {};
    const refKeys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
    for (const refKey of refKeys) {
        const base = (baseline[refKey] ?? "").trim();
        const next = (draft[refKey] ?? "").trim();
        if (base === next) continue;
        const body = patchBodyForRefKey(refKey, next);
        if (!body) continue;
        Object.assign(patch, body);
    }
    return patch;
}

export function groupLayoutRuntimePersonContactDraftByPersonId(input: {
    record: Record<string, unknown>;
    baseline: Record<string, string>;
    draft: Record<string, string>;
    contactRefPersonIdOverrides?: Record<string, string>;
    contactRefRoleOverrides?: Partial<Record<string, LayoutEditorContactRole>>;
}): Map<string, { baseline: Record<string, string>; draft: Record<string, string> }> {
    const grouped = new Map<string, { baseline: Record<string, string>; draft: Record<string, string> }>();
    const refKeys = new Set([...Object.keys(input.baseline), ...Object.keys(input.draft)]);

    for (const refKey of refKeys) {
        if (!isLayoutRuntimePersonFieldRefKey(refKey)) continue;
        const base = (input.baseline[refKey] ?? "").trim();
        const next = (input.draft[refKey] ?? "").trim();
        if (base === next) continue;

        const layoutContactRole = input.contactRefRoleOverrides?.[refKey];
        const personId =
            isLayoutRuntimePersonAddressRefKey(refKey) ?
                resolveLayoutRuntimePersonId(input.record)
            :   resolvePersonIdForContactRoleRef(
                    input.record,
                    refKey,
                    input.contactRefPersonIdOverrides,
                    layoutContactRole,
                );
        if (!personId) continue;

        const bucket = grouped.get(personId) ?? { baseline: {}, draft: {} };
        bucket.baseline[refKey] = input.baseline[refKey] ?? "";
        bucket.draft[refKey] = input.draft[refKey] ?? "";
        grouped.set(personId, bucket);
    }

    return grouped;
}

export function applyRoleContactPersonPatchToOpportunityRecord(
    hostRecord: Record<string, unknown>,
    refKey: string,
    person: {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
    },
): void {
    const capability = resolveLayoutRuntimeContactRoleFieldCapability(refKey);
    const personId = resolvePersonIdForContactRoleRef(hostRecord, refKey);
    if (!personId) return;

    if (capability?.personField === "email" && person.email !== undefined) {
        hostRecord[refKey] = person.email == null ? "" : String(person.email).trim();
    }
    if (capability?.personField === "phone" && person.phone !== undefined) {
        hostRecord[refKey] = person.phone == null ? "" : String(person.phone).trim();
    }
    if (capability?.role === "primary") {
        const fn = person.first_name;
        const ln = person.last_name;
        const full =
            (person.full_name && String(person.full_name).trim())
            || [fn, ln].filter(Boolean).join(" ").trim()
            || null;
        if (full) {
            hostRecord._primary_person_name = full;
            hostRecord._primary_contact_name = full;
            hostRecord["person.primary_contact_name"] = full;
        }
        if (person.email !== undefined) {
            hostRecord._primary_person_email = person.email == null ? null : String(person.email).trim() || null;
        }
        if (person.phone !== undefined) {
            hostRecord._primary_person_phone = person.phone == null ? null : String(person.phone).trim() || null;
        }
    }

    const rows = hostRecord._opportunity_persons;
    if (!Array.isArray(rows)) return;
    hostRecord._opportunity_persons = rows.map((row) => {
        if (!row || typeof row !== "object") return row;
        const entry = row as Record<string, unknown>;
        if (String(entry.person_id ?? "").trim() !== personId) return row;
        const next = { ...entry };
        if (person.email !== undefined) next.email = person.email;
        if (person.phone !== undefined) next.phone = person.phone;
        if (person.first_name !== undefined || person.last_name !== undefined) {
            const full =
                (person.full_name && String(person.full_name).trim())
                || [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
            if (full) next.name = full;
        }
        return next;
    });
}

export async function saveLayoutRuntimePersonContactEdits(input: {
    record: Record<string, unknown>;
    baseline: Record<string, string>;
    draft: Record<string, string>;
    contactRefPersonIdOverrides?: Record<string, string>;
    contactRefRoleOverrides?: Partial<Record<string, LayoutEditorContactRole>>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const grouped = groupLayoutRuntimePersonContactDraftByPersonId(input);
    if (grouped.size === 0) return { ok: true };

    for (const [personId, bucket] of grouped) {
        const body = buildLayoutRuntimePersonContactPatch(bucket.baseline, bucket.draft);
        if (Object.keys(body).length === 0) continue;

        const result = await patchLinkedPersonFromOpportunityDrawer({ personId, body });
        if (!result.ok) {
            return { ok: false, error: result.error ?? "Save failed" };
        }

        for (const refKey of Object.keys(bucket.draft)) {
            if ((bucket.baseline[refKey] ?? "").trim() === (bucket.draft[refKey] ?? "").trim()) continue;
            applyRoleContactPersonPatchToOpportunityRecord(input.record, refKey, {
                email: body.email,
                phone: body.phone,
                first_name: body.first_name,
                last_name: body.last_name,
            });
        }
    }

    return { ok: true };
}
