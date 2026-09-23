/**
 * A collection of people, as the CONVERSATION has to understand it.
 *
 * ## What was wrong
 *
 * `walkScalarFormFields` descends into a group and visits each child as a standalone scalar, so a
 * repeated emergency-contact collection reached the participant as three unrelated questions —
 * "Full name?", "Phone?", "Relationship to the child?" — asked once, with no repetition, no entry
 * identity, and nothing to say those three answers belong to one person. The `party_collection`
 * declaration the Form carries was simply never read on this path.
 *
 * ## One semantic model, two presentations
 *
 * The conventional Form renderer draws a party collection as a stack of bordered entry blocks. The
 * conversation draws it as cards inside a topic. Neither owns the meaning: `party_collection` on
 * the schema is the only declaration of what is collected, from whom, in what role and at what
 * scope, and both surfaces read THAT. Nothing here is a second vocabulary, and nothing here is
 * specific to siblings or to emergency contacts.
 *
 * ## Where the answers live
 *
 * The conversation's answer store is `form_packet_sessions.shared_values`, a flat map of settled
 * facts. A collection is not a scalar fact, so it is held under one reserved key per collection
 * carrying the whole ordered list. That keeps entry identity (`instance_key`), keeps which entries
 * Alloy already knew (`origin`), and keeps the conversation's single store single — there is no
 * second participant draft to synchronise.
 *
 * At submit, `partyCollectionGroupRows` turns that list into the Form payload's own
 * `groups[groupId]` rows, which is the shape the submission validator, the collection envelope and
 * the related-record proposal pipeline already consume. One adaptation, at one seam.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { partyCollectionOf, addAnotherLabel, entryHeading } from "@/lib/forms/partyCollection";
import { fieldMeansPhone } from "@/lib/format/phoneNumber";

/** One person in a collection, as the conversation holds them. */
export type ParticipantPartyEntry = {
    readonly instance_key: string;
    /** `existing` is someone Alloy already knew; `respondent_added` is someone the family added. */
    readonly origin: "existing" | "respondent_added";
    /** Answers keyed by the group's own child field ids — never by a numbered key. */
    readonly values: Readonly<Record<string, unknown>>;
    /** The canonical row this entry stands for, when it stands for one. */
    readonly item_id?: string;
};

/** What one child question of a collection asks. */
export type ParticipantPartyEntryField = {
    readonly field_id: string;
    readonly label: string;
    readonly type: string;
    readonly required: boolean;
    readonly options?: readonly { value: string; label: string }[];
    /**
     * What this question MEANS, where the platform has a primitive for it.
     *
     * A collection's questions are authored as plain text fields, so "Phone" arrived at the entry
     * editor indistinguishable from "Relationship to the child" and was typed, stored and shown as
     * raw digits beside a known contact's punctuated number. The semantic is resolved once, here,
     * from the same binding-then-label precedence every other participant surface uses.
     */
    readonly semantic?: "phone";
};

/** The whole obligation, as one conversational topic. */
export type ParticipantPartyCollection = {
    readonly group_field_id: string;
    readonly label: string;
    readonly action_key: string;
    readonly subject: "person" | "child";
    readonly role: string | null;
    readonly scope: string | null;
    readonly show_known: boolean;
    readonly allow_add: boolean;
    readonly add_another_label: string;
    readonly min: number;
    readonly max: number | null;
    readonly entry_fields: readonly ParticipantPartyEntryField[];
    readonly entries: readonly ParticipantPartyEntry[];
    /** Enough people, correctly filled — the Form's requirement, not the family's decision. */
    readonly valid?: boolean;
    /** The family has said that is everyone. Absent means they have not been asked yet. */
    readonly settled?: boolean;
};

/**
 * The reserved `shared_values` key for one collection.
 *
 * Scoped by Form definition because two Forms in a packet may each declare their own collection
 * with the same group id, and a collection is not a shared canonical fact the way a date of birth
 * is — it belongs to the Form that declared it.
 */
export function partyCollectionStateKey(formDefinitionId: string, groupFieldId: string): string {
    return `party:${formDefinitionId}:${groupFieldId}`;
}

export function isPartyCollectionStateKey(key: string): boolean {
    return key.startsWith("party:");
}

/** Every party-collection group this schema declares, in document order. */
export function partyCollectionGroups(schema: Pick<FormSchemaV1, "fields">): Array<FormField & { type: "group" }> {
    const out: Array<FormField & { type: "group" }> = [];
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            if (f.type !== "group") continue;
            if (partyCollectionOf(f)) out.push(f);
            else walk(f.fields);
        }
    };
    walk(schema.fields);
    return out;
}

/** Field ids that belong to a party collection — the scalar walk must not visit them alone. */
export function partyCollectionChildFieldIds(schema: Pick<FormSchemaV1, "fields">): Set<string> {
    const ids = new Set<string>();
    for (const group of partyCollectionGroups(schema)) {
        const walk = (fields: readonly FormField[]) => {
            for (const f of fields) {
                ids.add(f.id);
                if (f.type === "group") walk(f.fields);
            }
        };
        walk(group.fields);
    }
    return ids;
}

/**
 * Entries currently held for a collection.
 *
 * Reads defensively: a session is long-lived, a schema can be republished, and a malformed or
 * half-written value must degrade to "no entries yet" rather than throw inside the projection that
 * decides what to ask next.
 */
export function readPartyEntries(
    sharedValues: Readonly<Record<string, unknown>>,
    formDefinitionId: string,
    groupFieldId: string,
): ParticipantPartyEntry[] {
    const raw = readPartyStateValue(sharedValues, formDefinitionId, groupFieldId);
    if (!Array.isArray(raw)) return [];
    const out: ParticipantPartyEntry[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const instance_key = typeof r.instance_key === "string" ? r.instance_key.trim() : "";
        if (!instance_key) continue;
        const values = r.values && typeof r.values === "object" && !Array.isArray(r.values)
            ? (r.values as Record<string, unknown>)
            : {};
        out.push({
            instance_key,
            origin: r.origin === "existing" ? "existing" : "respondent_added",
            values,
            ...(typeof r.item_id === "string" && r.item_id.trim() ? { item_id: r.item_id.trim() } : {}),
        });
    }
    return out;
}

/**
 * The participant-visible entries: what Alloy knows, then what the family added.
 *
 * Known entries are shown only when the collection says to. They are merged by `item_id` so a
 * canonical person cannot appear twice because the session also recorded them — the duplicate this
 * whole path exists to avoid.
 */
export function mergeKnownEntries(
    known: readonly ParticipantPartyEntry[],
    held: readonly ParticipantPartyEntry[],
    opts: { readonly showKnown: boolean },
): ParticipantPartyEntry[] {
    const heldByItem = new Map<string, ParticipantPartyEntry>();
    for (const e of held) if (e.item_id) heldByItem.set(e.item_id, e);

    const out: ParticipantPartyEntry[] = [];
    if (opts.showKnown) {
        for (const k of known) {
            // A held row for the same canonical item is the participant's corrected copy of it.
            const corrected = k.item_id ? heldByItem.get(k.item_id) : undefined;
            out.push(corrected ? { ...corrected, origin: "existing", item_id: k.item_id } : k);
        }
    }
    const seen = new Set(out.map((e) => e.instance_key));
    for (const e of held) {
        if (seen.has(e.instance_key)) continue;
        if (e.item_id && opts.showKnown && out.some((o) => o.item_id === e.item_id)) continue;
        out.push(e);
    }
    return out;
}

/** Project one authored group into the conversational obligation, with its current entries. */
export function projectPartyCollection(
    group: FormField & { type: "group" },
    entries: readonly ParticipantPartyEntry[],
): ParticipantPartyCollection | null {
    const party = partyCollectionOf(group);
    if (!party) return null;
    return {
        group_field_id: group.id,
        label: group.label,
        action_key: party.action_key,
        subject: party.subject,
        role: party.role ?? null,
        scope: party.scope ?? null,
        show_known: party.show_known !== false,
        allow_add: party.allow_add !== false,
        add_another_label: addAnotherLabel(group),
        min: Math.max(0, group.repeat?.min ?? 0),
        max: group.repeat?.max ?? null,
        entry_fields: group.fields
            .filter((f) => f.type !== "group")
            .map((f) => ({
                field_id: f.id,
                label: f.label,
                type: f.type === "text" && (f as { multiline?: boolean }).multiline === true ? "long_text" : f.type,
                required: f.required === true,
                ...(readEntryFieldOptions(f).length ? { options: readEntryFieldOptions(f) } : {}),
                ...(fieldMeansPhone({ fieldKey: f.field_source?.field_key ?? null, type: f.type, label: f.label })
                    ? { semantic: "phone" as const }
                    : {}),
            })),
        entries: [...entries],
    };
}

/**
 * Whether the collection holds enough, correctly filled, people.
 *
 * VALIDITY ONLY — not whether the family is finished. The minimum is a completion requirement,
 * which is why no blank rows are ever created to meet it: the obligation is open until enough
 * entries EXIST, and an entry exists only because someone added it or because Alloy already knew
 * the person.
 */
export function partyCollectionValid(collection: ParticipantPartyCollection): boolean {
    const usable = collection.entries.filter((e) => e.origin === "existing" || entryHasAnyAnswer(e));
    if (usable.length < collection.min) return false;
    // Every required question on a family-added entry must be answered; a known entry is evidence,
    // not an interrogation, and is not blocked on questions Alloy never asked the family.
    for (const e of collection.entries) {
        if (e.origin === "existing") continue;
        for (const f of collection.entry_fields) {
            if (!f.required) continue;
            const v = e.values[f.field_id];
            if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return false;
        }
    }
    return true;
}

export function entryHasAnyAnswer(entry: ParticipantPartyEntry): boolean {
    return Object.values(entry.values).some((v) => v !== undefined && v !== null && String(v).trim() !== "");
}

/** How one entry is named on a card, without asking the schema for a title it does not have. */
export function entryDisplayName(
    collection: ParticipantPartyCollection,
    entry: ParticipantPartyEntry,
    index: number,
): string {
    for (const f of collection.entry_fields) {
        if (!/name/i.test(f.label)) continue;
        const v = entry.values[f.field_id];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    for (const f of collection.entry_fields) {
        const v = entry.values[f.field_id];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return entryHeading({ ...({} as FormField), type: "group", label: collection.label } as FormField, index);
}

/**
 * Conversation state → the Form payload's own group rows.
 *
 * THE ONE CONVERGENCE SEAM. The conversation keeps its own structured state while the participant
 * works; at submit it becomes exactly the shape `validateSubmission`, `extractFormCollectionEnvelope`
 * and the related-record proposal adapter already read. There is no continuously synchronised second
 * draft — the conversion happens once, here, in one direction.
 *
 * `instance_key` is carried through unchanged so proposal lineage can be traced back to the entry
 * the family actually created, and `collection.origin` travels with it so an entry Alloy already
 * knew is never proposed as a new person.
 */
export function partyCollectionGroupRows(
    schema: Pick<FormSchemaV1, "fields">,
    sharedValues: Readonly<Record<string, unknown>>,
    formDefinitionId: string,
    /**
     * People Alloy already knew, by collection group id.
     *
     * KNOWN PEOPLE ARE EVIDENCE, NOT ABSENCE. Reuse of a known person exists so the family does not
     * retype them and so nothing canonical is duplicated — it was never a decision that they vanish
     * from the completed paperwork. The projection held only what the SESSION had written, so a
     * family who confirmed a known sibling and a known emergency contact and added nobody produced a
     * payload with no rows at all, and a completed document with two empty headings. Measured in
     * human QA against the Disposable0913 family.
     *
     * Merged through `mergeKnownEntries`, the same function the card uses, so the artifact contains
     * exactly the list the family reviewed — in the same order, deduplicated by `item_id` the same
     * way. `origin` and `item_id` travel with each row, which is what keeps the proposal pipeline
     * from recreating someone who already exists.
     */
    knownEntries: Readonly<Record<string, readonly ParticipantPartyEntry[]>> = {},
): Record<string, FormPayloadGroupRow[]> {
    const out: Record<string, FormPayloadGroupRow[]> = {};
    for (const group of partyCollectionGroups(schema)) {
        const party = partyCollectionOf(group)!;
        const held = readPartyEntries(sharedValues, formDefinitionId, group.id);
        const entries = mergeKnownEntries(knownEntries[group.id] ?? [], held, {
            showKnown: party.show_known !== false,
        });
        if (!entries.length) continue;
        out[group.id] = entries.map((e) => ({
            instance_key: e.instance_key,
            values: { ...e.values },
            groups: {},
            signatures: {},
            collection: {
                provider_ref: group.collection_binding?.collection_provider_ref ?? `party:${party.action_key}`,
                origin: e.origin,
                iteration_entity_type:
                    group.collection_binding?.iteration_entity_type ?? (party.subject === "child" ? "customer_member" : "person"),
                ...(e.item_id ? { item_id: e.item_id } : {}),
            },
        }));
    }
    return out;
}

/** The inline choices a child question offers, when it offers any. */
function readEntryFieldOptions(field: FormField): { value: string; label: string }[] {
    const opts = (field as unknown as { static_options?: unknown }).static_options;
    if (!Array.isArray(opts)) return [];
    return opts.flatMap((o) => {
        if (!o || typeof o !== "object") return [];
        const r = o as { value?: unknown; label?: unknown };
        if (typeof r.value !== "string" || typeof r.label !== "string") return [];
        return [{ value: r.value, label: r.label }];
    });
}

/**
 * People Alloy already knows, as entries of the collections that ask for them.
 *
 * The identities come from `resolveChildParties`, which reads `person_child_relationships`
 * directly — the canonical relationship graph, not a Forms-local matcher. This function decides
 * nothing about WHO someone is; it only decides which box a known person's name and phone are
 * shown in, and it does that from the entry field's own canonical binding where the Form declared
 * one, falling back to the field's words only when it did not.
 *
 * `item_id` is the canonical person id, which is what keeps a known person from being listed twice
 * and, downstream, from being proposed as a new person.
 */
export function knownPartyEntriesFromParties(
    schema: Pick<FormSchemaV1, "fields">,
    parties: readonly { readonly person_id: string; readonly full_name: string; readonly phone: string | null; readonly roles: readonly string[] }[],
    /**
     * The household's other children.
     *
     * A separate read because it is a different canonical edge: `resolveChildParties` answers who
     * is related to this child in a ROLE, which cannot answer who else is a child of the same
     * household. A collection of children names no role, so without this it had no known entries at
     * all — measured in the mounted conversation against a real family, where the known sibling
     * simply did not appear.
     */
    householdChildren: readonly { readonly id: string; readonly display_name: string }[] = [],
): Record<string, ParticipantPartyEntry[]> {
    const out: Record<string, ParticipantPartyEntry[]> = {};
    for (const group of partyCollectionGroups(schema)) {
        const party = partyCollectionOf(group);
        if (party?.subject === "child") {
            if (!householdChildren.length) continue;
            out[group.id] = householdChildren.map((c) => ({
                instance_key: `known:${c.id}`,
                origin: "existing" as const,
                item_id: c.id,
                values: entryValuesForKnownChild(group.fields, c),
            }));
            continue;
        }
        const role = party?.role?.trim();
        if (!role) continue;
        const holders = parties.filter((p) => p.roles.includes(role));
        if (!holders.length) continue;
        out[group.id] = holders.map((p) => ({
            instance_key: `known:${p.person_id}`,
            origin: "existing" as const,
            item_id: p.person_id,
            values: entryValuesForKnownPerson(group.fields, p),
        }));
    }
    return out;
}

/** Which of this entry's questions a known person already answers. */
function entryValuesForKnownPerson(
    fields: readonly FormField[],
    person: { readonly full_name: string; readonly phone: string | null },
): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const f of fields) {
        if (f.type === "group") continue;
        const key = f.field_source?.field_key?.toLowerCase() ?? "";
        const label = f.label.toLowerCase();
        const isName = key.includes("name") || /\bname\b/.test(label);
        const isPhone = key.includes("phone") || /\bphone\b|\bmobile\b|\bcell\b/.test(label);
        if (isName && person.full_name) values[f.id] = person.full_name;
        else if (isPhone && person.phone) values[f.id] = person.phone;
    }
    return values;
}


/**
 * SATISFYING THE MINIMUM IS NOT THE SAME AS BEING FINISHED.
 *
 * MEASURED, in the mounted conversation: a family added one emergency contact and the collection
 * vanished — the minimum was met, the need went `confirmed`, and the turn moved on before anyone
 * could add a second. A list of people is open-ended by nature; only the family knows when it ends.
 *
 * So two independent states. `partyCollectionValid` asks whether the Form's requirement is met.
 * This asks whether the PARTICIPANT has said they are done. The conversation may advance only when
 * both hold, and a collection with no maximum is never finished on the family's behalf.
 *
 * A maximum is the one exception worth naming: when the Form says no more may be added and the
 * list is full, there is nothing left to decide and nothing left to add, so the collection is
 * finished by its own terms rather than by guessing.
 */
export function partyCollectionSettled(
    collection: ParticipantPartyCollection,
    settledMarker: boolean,
): boolean {
    if (!partyCollectionValid(collection)) return false;
    if (settledMarker) return true;
    if (!collection.allow_add) return true;
    return collection.max != null && collection.entries.length >= collection.max;
}

/** The whole obligation: enough people, AND the family has said that is everyone. */
export function partyCollectionComplete(
    collection: ParticipantPartyCollection,
    settledMarker: boolean,
): boolean {
    return partyCollectionValid(collection) && partyCollectionSettled(collection, settledMarker);
}

/**
 * Where the family's "that is everyone" is remembered.
 *
 * Beside the entries and scoped by the same collection identity, because it is a fact about THIS
 * collection and about nothing else. A separate key rather than a wrapper around the list so that
 * a session written before this existed still reads correctly — its entries are an array, and an
 * absent marker is honestly "they have not said".
 */
export function partyCollectionSettledKey(formDefinitionId: string, groupFieldId: string): string {
    return `${partyCollectionStateKey(formDefinitionId, groupFieldId)}:settled`;
}

/**
 * The stored value for one collection, by its OWN identity rather than by a string prefix.
 *
 * The exact key is tried first. When it misses, the group id decides: a schema declares which
 * collections exist, and two halves of the system disagreeing about which form-definition id to
 * write into a key is not a reason to lose a family's answers. The conversation writes the key and
 * the submission seam reads it; if those ever drift, the failure is silent and total — the parent
 * fills in their emergency contacts, reaches the review step, and is told the group is incomplete
 * while the answers sit safely in the session. Measured exactly that way.
 *
 * The group id is unique within a schema, so this cannot match a different collection.
 */
function readPartyStateValue(
    sharedValues: Readonly<Record<string, unknown>>,
    formDefinitionId: string,
    groupFieldId: string,
    suffix = "",
): unknown {
    const exact = sharedValues[`${partyCollectionStateKey(formDefinitionId, groupFieldId)}${suffix}`];
    if (exact !== undefined) return exact;
    const tail = `:${groupFieldId}${suffix}`;
    for (const [key, value] of Object.entries(sharedValues)) {
        if (key.startsWith("party:") && key.endsWith(tail)) return value;
    }
    return undefined;
}

export function readPartySettled(
    sharedValues: Readonly<Record<string, unknown>>,
    formDefinitionId: string,
    groupFieldId: string,
): boolean {
    return readPartyStateValue(sharedValues, formDefinitionId, groupFieldId, ":settled") === true;
}

/** Which of a child collection's questions a household child already answers. */
function entryValuesForKnownChild(
    fields: readonly FormField[],
    child: { readonly display_name: string },
): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const f of fields) {
        if (f.type === "group") continue;
        const key = f.field_source?.field_key?.toLowerCase() ?? "";
        if ((key.includes("name") || /\bname\b/.test(f.label.toLowerCase())) && child.display_name) {
            values[f.id] = child.display_name;
        }
    }
    return values;
}
