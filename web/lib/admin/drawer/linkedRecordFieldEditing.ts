/**
 * V1 — One-hop linked record inline edit from host drawer (Opportunity → Person).
 * Uses field_definitions.interaction_policy; writes never persist on the host record.
 */

import {
    personFieldOnOpportunityInteractionPolicy,
    resolveFieldEditability,
    type FieldDefinitionInteractionSource,
} from "@/lib/fields/fieldInteractionPolicy";

/** Opportunity field keys that mirror primary person scalars when exposed in drawer layout. */
export const OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS = new Set([
    "first_name",
    "last_name",
    "email",
    "phone",
]);

export type LinkedFieldSource = {
    host_field_key: string;
    source_record_type: "person";
    source_record_id: string;
    target_field_key: string;
    editable: boolean;
    read_only_reason: string | null;
    patch_route: string;
};

export type FieldDefForLinkedEdit = Omit<FieldDefinitionInteractionSource, "entity_type"> & {
    entity_type?: string;
    is_visible_in_drawer?: boolean;
};

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

export function primaryPersonIdFromOpportunityRecord(record: Record<string, unknown>): string | null {
    const identity = record._identity as { primary_person?: { id?: unknown } } | null | undefined;
    return trimId(
        record._primary_person_id ??
            record.primary_person_id ??
            identity?.primary_person?.id
    );
}

/** Project person scalars onto opportunity GET for drawer display (not persisted on opportunity). */
export function applyPrimaryPersonMirrorValuesToHostRecord(
    hostPatch: Record<string, unknown>,
    person: {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
    } | null
): void {
    if (!person) return;
    for (const key of OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS) {
        const v = person[key as keyof typeof person];
        if (v !== undefined) {
            hostPatch[key] = v == null ? null : v;
        }
    }
}

/** Refresh hydrated person display fields after a person PATCH from the opportunity drawer. */
export function applyPersonPatchToOpportunityHydration(
    hostRecord: Record<string, unknown>,
    person: {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
    }
): void {
    applyPrimaryPersonMirrorValuesToHostRecord(hostRecord, person);
    const fn = person.first_name;
    const ln = person.last_name;
    const full =
        (person.full_name && String(person.full_name).trim()) ||
        [fn, ln].filter(Boolean).join(" ").trim() ||
        null;
    hostRecord._primary_person_name = full;
    hostRecord._contact_name = full;
    hostRecord._primary_contact_name = full;
    hostRecord._primary_person_email = person.email == null ? null : String(person.email).trim() || null;
    hostRecord._primary_person_phone = person.phone == null ? null : String(person.phone).trim() || null;
}

export function personPatchRoute(personId: string): string {
    return `/api/admin/persons/${encodeURIComponent(personId)}`;
}

function isRelatedPersonWrite(
    editability: ReturnType<typeof resolveFieldEditability>,
    personId: string | null
): editability is ReturnType<typeof resolveFieldEditability> & {
    write_target: { entity: string; field: string; behavior: "related_record" };
} {
    return (
        !!personId &&
        editability.editable &&
        editability.write_target?.behavior === "related_record" &&
        editability.write_target.entity.trim().toLowerCase() === "person" &&
        Boolean(editability.write_target.field.trim())
    );
}

/**
 * Resolve linked-field write targets for opportunity drawer fields.
 * V1: primary person only; ambiguous or missing person → not editable.
 */
export function resolveOpportunityLinkedFieldSources(
    record: Record<string, unknown>,
    defs: FieldDefForLinkedEdit[],
    ctx: { permission_keys?: string[] } = {}
): Record<string, LinkedFieldSource> {
    const personId = primaryPersonIdFromOpportunityRecord(record);
    const out: Record<string, LinkedFieldSource> = {};

    for (const def of defs) {
        if (def.is_visible_in_drawer === false) continue;
        const editability = resolveFieldEditability(
            { ...def, entity_type: "opportunity" },
            { permission_keys: ctx.permission_keys ?? ["__drawer_display__"] }
        );

        if (!personId) {
            if (editability.editability_mode === "editable_through_related_record") {
                out[def.field_key] = {
                    host_field_key: def.field_key,
                    source_record_type: "person",
                    source_record_id: "",
                    target_field_key: editability.write_target?.field ?? def.field_key,
                    editable: false,
                    read_only_reason: "No primary person linked on this opportunity.",
                    patch_route: "",
                };
            }
            continue;
        }

        if (!isRelatedPersonWrite(editability, personId)) continue;

        const targetField = editability.write_target.field.trim();
        if (
            !OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS.has(targetField) &&
            !OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS.has(def.field_key)
        ) {
            continue;
        }

        const resolvedTarget = OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS.has(targetField)
            ? targetField
            : def.field_key;

        out[def.field_key] = {
            host_field_key: def.field_key,
            source_record_type: "person",
            source_record_id: personId,
            target_field_key: resolvedTarget,
            editable: true,
            read_only_reason: editability.lock_reason,
            patch_route: personPatchRoute(personId),
        };
    }

    return out;
}

export function defaultPersonMirrorInteractionPolicyForField(fieldKey: string): ReturnType<
    typeof personFieldOnOpportunityInteractionPolicy
> | null {
    if (!OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS.has(fieldKey)) return null;
    return personFieldOnOpportunityInteractionPolicy(fieldKey);
}

export function readLinkedPersonMirrorValue(
    record: Record<string, unknown>,
    hostFieldKey: string,
    targetFieldKey: string
): unknown {
    const direct = record[hostFieldKey];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
    if (hostFieldKey === "email" || targetFieldKey === "email") {
        const e = record._primary_person_email;
        if (e != null && String(e).trim() !== "") return e;
    }
    if (hostFieldKey === "phone" || targetFieldKey === "phone") {
        const p = record._primary_person_phone;
        if (p != null && String(p).trim() !== "") return p;
    }
    if (record[targetFieldKey] !== undefined) return record[targetFieldKey];
    return direct ?? "";
}

function normalizeScalarForCompare(v: unknown): string {
    if (v === null || v === undefined) return "";
    return String(v).trim();
}

export type PartitionOpportunitySaveResult = {
    opportunityPayload: Record<string, unknown>;
    personPatch: Record<string, unknown>;
    personId: string | null;
    linkedFieldKeys: string[];
};

/** Split blur-save payload: person scalars PATCH linked person; remainder stays on opportunity. */
export function partitionOpportunitySaveByLinkedFields(params: {
    formData: Record<string, unknown>;
    initial: Record<string, unknown>;
    record: Record<string, unknown>;
    defs: FieldDefForLinkedEdit[];
}): PartitionOpportunitySaveResult {
    const linked = resolveOpportunityLinkedFieldSources(params.record, params.defs, {
        permission_keys: ["__drawer_display__"],
    });
    const linkedFieldKeys = Object.keys(linked);
    const personId = primaryPersonIdFromOpportunityRecord(params.record);
    const personPatch: Record<string, unknown> = {};
    const opportunityPayload = { ...params.formData };

    for (const [hostKey, source] of Object.entries(linked)) {
        delete opportunityPayload[hostKey];
        if (!source.editable || !personId) continue;
        const next = params.formData[hostKey];
        const prev = params.initial[hostKey];
        if (normalizeScalarForCompare(next) === normalizeScalarForCompare(prev)) continue;
        personPatch[source.target_field_key] =
            next === "" || next === undefined || next === null
                ? null
                : typeof next === "string"
                  ? next.trim() || null
                  : next;
    }

    return {
        opportunityPayload,
        personPatch,
        personId,
        linkedFieldKeys,
    };
}

export async function patchLinkedPersonFromOpportunityDrawer(params: {
    personId: string;
    body: Record<string, unknown>;
    fetchFn?: typeof fetch;
}): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; error: string }> {
    const fetchImpl = params.fetchFn ?? fetch;
    const res = await fetchImpl(personPatchRoute(params.personId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params.body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) {
        return { ok: false, status: res.status, error: json.error ?? "Person save failed" };
    }
    return { ok: true, json };
}
