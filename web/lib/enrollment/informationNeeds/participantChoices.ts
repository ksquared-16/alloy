/**
 * THE CHOICES A QUESTION OFFERS, AS A LABEL AND A VALUE.
 *
 * ## The seam this closes
 *
 * A Form says what a closed question's answers ARE in two different ways, and Enrollment honoured
 * neither.
 *
 *   `static_options` is this Form's own list — `{ value: "option_1", label: "Yes" }`. The value is
 *   canonical and the label is what a person reads. The need projection collapsed each entry to its
 *   VALUE and typed the result `readonly string[]`, so the distinction did not survive the first
 *   boundary. A parent was offered a button reading `option_1`.
 *
 *   `option_set_key` is a reference to a vocabulary the ORGANISATION maintains — the one that makes
 *   "Person gender" one list wherever it is used rather than a copy per form. Nothing in the
 *   Enrollment path read it at all, so the question reached the participant with no choices, and
 *   `valueControlForTurn` — which offers a select only when it HAS choices — handed them a free
 *   text box. A vocabulary-constrained fact silently became prose.
 *
 * ## Why here
 *
 * The party-collection path already carried `{ value, label }` for the questions asked about each
 * person, and was already right. This is the same fact about the same kind of field, so the scalar
 * path converges on that shape rather than growing a second one. `readEntryFieldOptions` now
 * delegates here, so there is one reader for "what does this field offer".
 *
 * The option SET is not copied into the Form and never resolved here: `resolveOptionSetsForOrg` is
 * the canonical authority and stays it, exactly as `hydrateSelectOptionsForSchema` uses it for a
 * public Form. This module only decides which of the two an authored field is using, and says so
 * truthfully when a named vocabulary cannot be found.
 *
 * Pure. No I/O.
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

/** One answer a closed question offers: the canonical value, and the words a person reads. */
export type ParticipantChoice = { readonly value: string; readonly label: string };

/** Resolved vocabularies, keyed by `option_set_key`. Supplied by the caller that can do I/O. */
export type ResolvedOptionSets = Readonly<Record<string, readonly ParticipantChoice[]>>;

function normalizeChoice(item: unknown): ParticipantChoice | null {
    if (typeof item === "string") {
        const v = item.trim();
        return v ? { value: v, label: v } : null;
    }
    if (!item || typeof item !== "object") return null;
    const r = item as { value?: unknown; label?: unknown };
    const value = typeof r.value === "string" ? r.value.trim() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    // A choice with only a label is still a choice; its words are also its value, which is what a
    // legacy list of plain strings meant.
    if (!value && !label) return null;
    return { value: value || label, label: label || value };
}

/**
 * This Form's OWN inline list, in authored order.
 *
 * Reads `static_options` — where a realized Form actually keeps its choices — and the legacy
 * `options` an older draft may carry.
 */
export function authoredChoices(field: unknown): readonly ParticipantChoice[] {
    const f = field as { options?: unknown; static_options?: unknown } | null;
    const raw = Array.isArray(f?.options) && f.options.length ? f.options : f?.static_options;
    if (!Array.isArray(raw)) return [];
    const out: ParticipantChoice[] = [];
    for (const item of raw) {
        const c = normalizeChoice(item);
        if (c) out.push(c);
    }
    return out;
}

/** The organisation vocabulary this field defers to, when it defers to one. */
export function optionSetKeyOf(field: unknown): string | null {
    const k = (field as { option_set_key?: unknown } | null)?.option_set_key;
    return typeof k === "string" && k.trim() ? k.trim() : null;
}

/**
 * What this question offers, and whether it is in a state it can be asked in.
 *
 * `unresolved` is the honest third answer. A field that names a vocabulary which cannot be found
 * has NOT become an open question — the Form's data contract still says its answer must be one of a
 * closed set. Saying so is what stops the runtime from quietly offering free text and accepting
 * whatever is typed, which would put an unconstrained string into a constrained field.
 */
export function resolveFieldChoices(
    field: unknown,
    optionSets?: ResolvedOptionSets,
): { readonly choices: readonly ParticipantChoice[]; readonly unresolved: boolean } {
    const inline = authoredChoices(field);
    // Inline choices win, exactly as they do for a public Form: a field carrying its own list is
    // not deferring to anyone.
    if (inline.length) return { choices: inline, unresolved: false };

    const key = optionSetKeyOf(field);
    if (!key) return { choices: [], unresolved: false };

    const resolved = optionSets?.[key] ?? [];
    if (resolved.length) return { choices: resolved, unresolved: false };
    return { choices: [], unresolved: true };
}

/** Every `option_set_key` a schema references, so a caller can resolve them in one round trip. */
export function optionSetKeysInSchema(schema: FormSchemaV1): readonly string[] {
    const keys = new Set<string>();
    const walk = (fields: readonly FormField[]) => {
        for (const f of fields) {
            if (f.type === "group") {
                walk(f.fields);
                continue;
            }
            // A field with its own list references nothing.
            if (authoredChoices(f).length) continue;
            const k = optionSetKeyOf(f);
            if (k) keys.add(k);
        }
    };
    walk(schema.fields);
    return [...keys];
}

/**
 * A choice, whatever shape reached us.
 *
 * The type says `ParticipantChoice`, and a persisted payload or an older caller can still hand over
 * the flat list of strings this model replaced. Reading `c.value.toLowerCase()` on one of those
 * threw, which turned a shape mismatch into a crash inside validation — so every reader below goes
 * through here and a plain string is simply its own value and its own words.
 */
function asChoice(c: unknown): ParticipantChoice {
    if (typeof c === "string") return { value: c, label: c };
    const r = (c ?? {}) as { value?: unknown; label?: unknown };
    const value = typeof r.value === "string" ? r.value : "";
    const label = typeof r.label === "string" ? r.label : "";
    return { value: value || label, label: label || value };
}

/**
 * The words for a stored value — what a person reads back on the artifact and on a settled row.
 *
 * Falls back to the value itself, because a value with no matching choice is still the answer that
 * was given and hiding it would be worse than showing a key.
 */
export function choiceLabel(choices: readonly ParticipantChoice[], value: unknown): string {
    if (typeof value !== "string") return value == null ? "" : String(value);
    const target = value.trim().toLowerCase();
    const all = choices.map(asChoice);
    const hit = all.find((c) => c.value === value) ?? all.find((c) => c.value.toLowerCase() === target);
    return hit ? hit.label : value;
}

/** The same, for a multi-select answer. */
export function choiceLabels(choices: readonly ParticipantChoice[], value: unknown): string[] {
    const list = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
    return list.map((v) => choiceLabel(choices, v));
}

/** The canonical values a closed question accepts. */
export function choiceValues(choices: readonly ParticipantChoice[]): string[] {
    return choices.map((c) => asChoice(c).value).filter((v) => v.length > 0);
}

/**
 * The canonical value for something a parent said, when they said a LABEL.
 *
 * The buttons submit values, so this is for a typed or interpreted answer: "Female" is how a person
 * names the choice whose stored value is `female`. Returns null when nothing matches, so the
 * caller refuses rather than inventing a value.
 */
export function choiceValueFor(choices: readonly ParticipantChoice[], said: unknown): string | null {
    if (typeof said !== "string") return null;
    const s = said.trim();
    if (!s) return null;
    const lower = s.toLowerCase();
    const all = choices.map(asChoice);
    const hit =
        all.find((c) => c.value === s) ??
        all.find((c) => c.value.toLowerCase() === lower) ??
        all.find((c) => c.label.toLowerCase() === lower);
    return hit ? hit.value : null;
}
