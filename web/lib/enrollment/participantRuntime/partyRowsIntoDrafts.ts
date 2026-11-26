/**
 * THE PEOPLE THE CONVERSATION ADDED ARE THE FORM'S ROWS — one answer store, not two.
 *
 * Deployed (Lil' Sunshine, family ZZQALS181541): the conversation attached an emergency contact, a
 * physician and a dentist through the canonical relationship service. The TA-806 review then showed
 * empty "Emergency contacts" and "Primary physician" rows, because a draft's collection rows were
 * seeded once, at draft creation, and never again. The family typed the same people a second time,
 * each typed row was `respondent_added`, and Processing proposed every one of them as a new person.
 *
 * Now the child's canonical people are written INTO each open draft's collection-bound groups, as
 * rows that carry the person's identity (`collection.item_id`, origin `existing`). That identity is
 * what the rest of the platform already understands:
 *
 *   - review shows the person, so the family is not asked again;
 *   - validation counts a complete row toward the authored minimum;
 *   - submission carries `item_id`, so Processing proposes `link_existing_person`, never a duplicate;
 *   - the instance key is stable (`col:<provider>:<person>`), so a re-sync is idempotent.
 *
 * Rules, each one a refusal to guess:
 *
 *   - Only the CHILD'S parties (`resolveChildParties`, child-scoped) — a sibling's physician is never
 *     printed on this child's form; the conversation offers them for reuse instead.
 *   - Only parties holding the group's ROLE (the relationship definition behind the binding).
 *   - The family's own saved values win over the canonical ones; canonical fills blanks.
 *   - A blank row the family never touched is dropped; a row they typed for the same person (same
 *     name) becomes that person's row; any other typed row is kept untouched.
 *   - Submitted forms are never rewritten.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { safeParseFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload, FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { groupFieldHasCollectionBinding } from "@/lib/fields/formsCollectionRepeatBinding";
import { relationshipDefinitionForRef } from "@/lib/fields/relationship/relationshipDefinitions";
import { extractCollectionSubmissionEnvelope } from "@/lib/forms/collection/formsCollectionSubmissionValidation";
import { resolveChildParties, type ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import { primaryHouseholdAdult } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";
import { loadPersonChildRelationshipOptionSetItems } from "@/lib/fields/personChildRelationship/personChildRelationshipRepository";

/** submission id → group id → the rows now held for that group. */
export type DraftGroupUpdates = Record<string, Record<string, FormPayloadGroupRow[]>>;

type GroupField = FormField & { type: "group" };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

function instanceKey(providerRef: string, personId: string): string {
    return `col:${providerRef}:${personId}`;
}

/** The value a party supplies for one member line, read from the line's own binding. */
function memberValue(
    field: FormField,
    party: ChildParty,
    relationshipLabel: (key: string | null | undefined) => string | null,
): unknown {
    const key = (field.field_source?.field_key ?? "").trim().toLowerCase();
    if (!key) return undefined;
    const [first, ...rest] = party.full_name.split(/\s+/);
    if (key === "full_name" || key === "name" || key === "display_name") return party.full_name || undefined;
    if (key === "first_name") return first || undefined;
    if (key === "last_name") return rest.join(" ") || undefined;
    if (key.includes("phone")) return party.phone ?? undefined;
    if (key.includes("email")) return party.email ?? undefined;
    if (key === "relationship_type" || key === "relationship") return relationshipLabel(party.relationship_type) ?? undefined;
    return undefined;
}

function rowValuesFor(group: GroupField, party: ChildParty, relationshipLabel: (key: string | null | undefined) => string | null): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const f of group.fields) {
        if (f.type === "group" || f.type === "text_block") continue;
        const v = memberValue(f, party, relationshipLabel);
        if (!blank(v)) values[f.id] = v;
    }
    return values;
}

function nameOfRow(group: GroupField, row: FormPayloadGroupRow): string {
    for (const f of group.fields) {
        const key = (f.field_source?.field_key ?? "").toLowerCase();
        if (key === "full_name" || key === "name") return norm(row.values?.[f.id]);
    }
    const first = group.fields.find((f) => (f.field_source?.field_key ?? "").toLowerCase() === "first_name");
    const last = group.fields.find((f) => (f.field_source?.field_key ?? "").toLowerCase() === "last_name");
    return norm(`${first ? row.values?.[first.id] ?? "" : ""} ${last ? row.values?.[last.id] ?? "" : ""}`);
}

/** Deep equality that ignores object key order (a stored jsonb row comes back reordered). */
function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => sameValue(v, b[i]));
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
        const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
        const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
        if (ka.length !== kb.length) return false;
        return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    }
    return false;
}

const rowIsBlank = (row: FormPayloadGroupRow) => Object.values(row.values ?? {}).every(blank);

/**
 * PURE: the rows a group should hold, given what the draft holds and who the child's parties are.
 * Returns null when nothing changes.
 */
export function mergePartyRowsIntoGroup(
    group: GroupField,
    saved: readonly FormPayloadGroupRow[],
    parties: readonly ChildParty[],
    relationshipLabel: (key: string | null | undefined) => string | null = (k) => k ?? null,
    /** People this group must not hold as rows (the primary adult, in the guardian collection). */
    excludePersonIds: ReadonlySet<string> = new Set(),
): FormPayloadGroupRow[] | null {
    if (!groupFieldHasCollectionBinding(group)) return null;
    const binding = group.collection_binding!;
    const definition = relationshipDefinitionForRef(binding.collection_provider_ref);
    if (!definition) return null;
    const role = definition.operational_role_key;
    const holders = [...parties]
        .filter((p) => p.roles.includes(role))
        .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    const remaining = saved.filter((r) => !(r.collection?.item_id && excludePersonIds.has(r.collection.item_id)));
    if (holders.length === 0 && remaining.length === saved.length) return null;

    const out: FormPayloadGroupRow[] = [];
    for (const party of holders) {
        const canonical = rowValuesFor(group, party, relationshipLabel);
        // The row already linked to this person, else a row the family typed for the same name.
        let idx = remaining.findIndex((r) => r.collection?.item_id === party.person_id);
        if (idx < 0) {
            const name = norm(party.full_name);
            idx = name ? remaining.findIndex((r) => !r.collection?.item_id && nameOfRow(group, r) === name) : -1;
        }
        const prior = idx >= 0 ? remaining.splice(idx, 1)[0]! : null;
        const merged: Record<string, unknown> = { ...canonical };
        for (const [k, v] of Object.entries(prior?.values ?? {})) if (!blank(v)) merged[k] = v;
        out.push({
            ...(prior ?? {}),
            instance_key: instanceKey(binding.collection_provider_ref, party.person_id),
            values: merged,
            collection: {
                provider_ref: binding.collection_provider_ref,
                item_id: party.person_id,
                origin: "existing",
                iteration_entity_type: binding.iteration_entity_type,
            },
        } as FormPayloadGroupRow);
    }
    // Everything else the family entered stays; untouched placeholder rows do not.
    for (const r of remaining) if (r.collection?.item_id || !rowIsBlank(r)) out.push(r);

    // jsonb does not keep key order, so "unchanged" is compared by value, never by serialization.
    return sameValue(out, saved) ? null : out;
}

/** PURE: every collection-bound group of one draft. Returns only the groups that changed. */
export function mergePartyRowsIntoPayloadGroups(
    schema: FormSchemaV1,
    groups: Readonly<Record<string, FormPayloadGroupRow[]>>,
    parties: readonly ChildParty[],
    relationshipLabel?: (key: string | null | undefined) => string | null,
    primaryAdultId?: string | null,
): Record<string, FormPayloadGroupRow[]> {
    const changed: Record<string, FormPayloadGroupRow[]> = {};
    for (const field of schema.fields) {
        if (field.type !== "group") continue;
        const guardianGroup = relationshipDefinitionForRef(field.collection_binding?.collection_provider_ref ?? "")?.operational_role_key === "guardian";
        const next = mergePartyRowsIntoGroup(field, groups[field.id] ?? [], parties, relationshipLabel, guardianGroup && primaryAdultId ? new Set([primaryAdultId]) : new Set());
        if (next) changed[field.id] = next;
    }
    return changed;
}

/**
 * Write the child's people into this session's open drafts. Returns what moved, per draft, so the
 * browser holding one of them takes the same rows (and never autosaves the stale ones back).
 */
export async function writePartyRowsIntoDrafts(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        readonly customerMemberId: string | null;
        /** Limit to these submissions (a resume syncs only the draft it opens). */
        readonly submissionIds?: readonly string[];
        readonly relationshipOptions?: readonly { readonly value: string; readonly label: string }[];
    },
): Promise<DraftGroupUpdates> {
    const updates: DraftGroupUpdates = {};
    const childId = (input.customerMemberId ?? "").trim();
    if (!childId) return updates;

    let ids = input.submissionIds ? [...input.submissionIds] : [];
    if (!input.submissionIds) {
        const { data: items, error } = await supabase
            .from("form_packet_session_items")
            .select("form_submission_id")
            .eq("org_id", input.orgId)
            .eq("packet_session_id", input.sessionId);
        if (error) throw new Error(error.message);
        ids = [...new Set(((items ?? []) as { form_submission_id: string | null }[]).map((i) => i.form_submission_id).filter((x): x is string => Boolean(x)))];
    }
    if (ids.length === 0) return updates;

    const { data: subs, error: subError } = await supabase
        .from("form_submissions")
        .select("id, payload, form_definition_version_id, status")
        .eq("org_id", input.orgId)
        .eq("status", "draft")
        .in("id", ids);
    if (subError) throw new Error(subError.message);
    const drafts = (subs ?? []) as Array<{ id: string; payload: Record<string, unknown> | null; form_definition_version_id: string | null }>;
    if (drafts.length === 0) return updates;

    const versionIds = [...new Set(drafts.map((d) => d.form_definition_version_id).filter((x): x is string => Boolean(x)))];
    const { data: versions, error: verError } = await supabase
        .from("form_definition_versions")
        .select("id, schema_json")
        .eq("org_id", input.orgId)
        .in("id", versionIds.length ? versionIds : ["-"]);
    if (verError) throw new Error(verError.message);
    const schemaById = new Map(((versions ?? []) as Array<{ id: string; schema_json: unknown }>).map((v) => [v.id, v.schema_json]));

    const parsedDrafts = drafts
        .map((d) => ({ draft: d, parsed: safeParseFormSchema(schemaById.get(d.form_definition_version_id ?? "") ?? null) }))
        .filter((x) => x.parsed.success && x.parsed.data.fields.some((f) => f.type === "group" && groupFieldHasCollectionBinding(f) && relationshipDefinitionForRef(f.collection_binding!.collection_provider_ref)));
    if (parsedDrafts.length === 0) return updates;

    const allParties = await resolveChildParties(supabase, { orgId: input.orgId, customerMemberId: childId });
    if (allParties.length === 0) return updates;
    /*
     * THE PRIMARY ADULT IS NOT "ANOTHER" GUARDIAN.
     *
     * Deployed (Lil' Sunshine, ZZQALM234600): the conversation attached the household's own parent
     * as the child's guardian — a true canonical fact — and this sync then wrote her into "Other
     * parents or guardians", a row with no relationship that submit refused. The primary adult is
     * printed by the primary-guardian fields; the guardian collection holds the others.
     */
    const primaryId = await primaryAdultOfChild(supabase, input.orgId, childId);
    const parties = allParties.map((party) =>
        party.person_id === primaryId ? { ...party, roles: party.roles.filter((r) => r !== "guardian") } : party,
    );
    const labelByKey = new Map((input.relationshipOptions ?? []).map((o) => [o.value, o.label]));
    const relationshipLabel = (k: string | null | undefined) => (k ? labelByKey.get(k) ?? k : null);

    for (const { draft, parsed } of parsedDrafts) {
        if (!parsed.success) continue;
        const payload = (draft.payload ?? {}) as Record<string, unknown>;
        const groups = (payload.groups && typeof payload.groups === "object" ? payload.groups : {}) as Record<string, FormPayloadGroupRow[]>;
        const changed = mergePartyRowsIntoPayloadGroups(parsed.data, groups, parties, relationshipLabel, primaryId);
        if (Object.keys(changed).length === 0) continue;
        const nextGroups = { ...groups, ...changed };
        const meta = (payload.meta && typeof payload.meta === "object" ? payload.meta : {}) as Record<string, unknown>;
        // Processing reads the envelope first; it must describe the same rows the draft now holds.
        const envelope = extractCollectionSubmissionEnvelope({ ...(payload as FormPayload), groups: nextGroups } as FormPayload);
        const nextPayload = {
            ...payload,
            groups: nextGroups,
            meta: { ...meta, ...(Object.keys(envelope).length > 0 ? { collection_submission_envelope: envelope } : {}) },
        };
        const { error } = await supabase
            .from("form_submissions")
            .update({ payload: nextPayload })
            .eq("org_id", input.orgId)
            .eq("id", draft.id)
            .eq("status", "draft");
        if (error) throw new Error(error.message);
        updates[draft.id] = changed;
    }
    return updates;
}

async function primaryAdultOfChild(supabase: SupabaseClient, orgId: string, childId: string): Promise<string | null> {
    const { data: child } = await supabase.from("customer_members").select("customer_id").eq("org_id", orgId).eq("id", childId).maybeSingle();
    const customerId = String((child as { customer_id?: string } | null)?.customer_id ?? "");
    if (!customerId) return null;
    const { data: links } = await supabase
        .from("customer_persons")
        .select("person_id, is_primary, role_type, status")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    return primaryHouseholdAdult((links ?? []) as Parameters<typeof primaryHouseholdAdult>[0])?.person_id ?? null;
}

/**
 * Self-heal on resume: a draft created before the conversation added someone (or before this
 * existed) picks the child's people up the next time it is opened. Returns the payload groups the
 * draft holds afterwards, or null when nothing changed.
 */
export async function syncPartyRowsForSubmission(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly submissionId: string; readonly customerMemberId: string | null | undefined },
): Promise<Record<string, FormPayloadGroupRow[]> | null> {
    const childId = String(input.customerMemberId ?? "").trim();
    if (!childId) return null;
    try {
        const options = await loadPersonChildRelationshipOptionSetItems(supabase, input.orgId).catch(() => []);
        const updates = await writePartyRowsIntoDrafts(supabase, {
            orgId: input.orgId,
            sessionId: "",
            customerMemberId: childId,
            submissionIds: [input.submissionId],
            relationshipOptions: options.map((o) => ({ value: o.item_key, label: o.label || o.item_key })),
        });
        return updates[input.submissionId] ?? null;
    } catch (e) {
        console.warn("[party rows] resume sync", e instanceof Error ? e.message : e);
        return null;
    }
}
