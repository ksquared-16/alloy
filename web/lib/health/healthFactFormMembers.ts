/**
 * WHAT A FORM'S HEALTH ROW SAYS, IN HEALTH'S OWN WORDS.
 *
 * A Form collects an allergy as a repeatable row bound to `health.allergies`. Its lines are the
 * family's answers; this module is the one place that reads them as an allergy, a condition or a
 * medication — the payload keys `healthFactModel` already defines. Nothing here writes: the reading
 * becomes a Processing proposal, and only an operator's approval reaches `healthFactService`.
 *
 * ## How a line is matched to a member
 *
 * Like a relationship row's declared members (`relationshipNestedFields`), a health row's lines are
 * matched to the kind's declared members — never guessed:
 *
 *   1. the line's id ends with the member key (`occ_allergy_allergen` → `allergen`), else
 *   2. the line's label matches exactly ONE member's patterns.
 *
 * A line that matches nothing, or more than one member, is left unresolved and named, so the
 * operator sees it. Severity is carried only when the family chose one of Health's own severities:
 * a default severity on an allergy is the most dangerous value this path could invent.
 */

import type { FormField } from "@/lib/forms/schema";
import {
    HEALTH_SEVERITIES,
    type HealthFactKind,
    type HealthSeverity,
} from "@/lib/health/healthFactModel";

/** The collection providers a Form may use to collect health facts, and the kind each one is. */
export const HEALTH_FACT_FORM_KIND_BY_PROVIDER_REF: Readonly<Record<string, Exclude<HealthFactKind, "immunization">>> =
    Object.freeze({
        "health.allergies": "allergy",
        "health.conditions": "condition",
        "health.medications": "medication",
    });

export function healthFactKindForFormProvider(refKey: string): Exclude<HealthFactKind, "immunization"> | null {
    return HEALTH_FACT_FORM_KIND_BY_PROVIDER_REF[refKey.trim()] ?? null;
}

type MemberKind = "text" | "severity" | "boolean";

export type HealthFactFormMember = {
    readonly key: string;
    readonly label: string;
    readonly required?: boolean;
    readonly kind: MemberKind;
    readonly patterns: readonly RegExp[];
};

/** Declared members per kind — the payload keys `healthFactModel`'s readers understand. */
export const HEALTH_FACT_FORM_MEMBERS: Readonly<Record<Exclude<HealthFactKind, "immunization">, readonly HealthFactFormMember[]>> = {
    allergy: [
        { key: "allergen", label: "Allergen", required: true, kind: "text", patterns: [/\ballergen\b/i, /allergic to/i, /\bwhat\b.*\ballerg/i] },
        { key: "severity", label: "Severity", kind: "severity", patterns: [/\bseverity\b/i, /how (serious|severe)/i] },
        { key: "reaction", label: "Reaction", kind: "text", patterns: [/\breaction\b/i, /\bsymptoms?\b/i] },
        { key: "care_instructions", label: "Care instructions", kind: "text", patterns: [/care instructions?/i, /what (should|to) (we|staff)? ?do/i, /\bresponse plan\b/i] },
        { key: "treatment", label: "Treatment", kind: "text", patterns: [/\btreatment\b/i, /\bepi-?pen\b/i] },
    ],
    condition: [
        { key: "condition", label: "Condition", required: true, kind: "text", patterns: [/\bcondition\b/i, /\bdiagnosis\b/i, /medical need/i] },
        { key: "severity", label: "Severity", kind: "severity", patterns: [/\bseverity\b/i, /how (serious|severe)/i] },
        { key: "restrictions", label: "Restrictions", kind: "text", patterns: [/\brestrictions?\b/i, /\blimitations?\b/i] },
        { key: "care_instructions", label: "Care instructions", kind: "text", patterns: [/care instructions?/i, /what (should|to) (we|staff)? ?do/i, /\bcare plan\b/i] },
    ],
    medication: [
        { key: "medication", label: "Medication", required: true, kind: "text", patterns: [/\bmedication\b/i, /\bmedicine\b/i] },
        { key: "dosage", label: "Dosage", kind: "text", patterns: [/\bdos(e|age)\b/i] },
        { key: "frequency", label: "Frequency", kind: "text", patterns: [/\bfrequency\b/i, /how often/i, /\bwhen\b.*\bgiven\b/i] },
        { key: "as_needed", label: "As needed", kind: "boolean", patterns: [/as needed/i, /\bprn\b/i] },
        { key: "administration_instructions", label: "Administration instructions", kind: "text", patterns: [/administ/i, /how to give/i] },
        { key: "storage_location", label: "Storage location", kind: "text", patterns: [/\bstor(ed|age)\b/i, /where .*kept/i] },
    ],
};

function membersMatchingId(fieldId: string, members: readonly HealthFactFormMember[]): HealthFactFormMember[] {
    const id = fieldId.trim().toLowerCase();
    // Longest key first, so `care_instructions` is not claimed by a shorter key that also ends it.
    return [...members]
        .sort((a, b) => b.key.length - a.key.length)
        .filter((m) => id === m.key || id.endsWith(`_${m.key}`))
        .slice(0, 1);
}

function membersMatchingLabel(label: string, members: readonly HealthFactFormMember[]): HealthFactFormMember[] {
    return members.filter((m) => m.patterns.some((p) => p.test(label)));
}

export type HealthMemberInterpretation = {
    readonly byFieldId: ReadonlyMap<string, HealthFactFormMember>;
    readonly unresolved: readonly string[];
};

/** Match each line of a health row to at most one declared member. Each member is claimed once. */
export function interpretHealthFactMemberFields(
    kind: Exclude<HealthFactKind, "immunization">,
    nested: readonly FormField[],
): HealthMemberInterpretation {
    const members = HEALTH_FACT_FORM_MEMBERS[kind];
    const byFieldId = new Map<string, HealthFactFormMember>();
    const claimed = new Set<string>();
    const unresolved: string[] = [];
    const lines = nested.filter((f) => f.type !== "group" && f.type !== "text_block");
    // Ids first (explicit), then labels — so a label never steals a member an id named.
    for (const f of lines) {
        const hit = membersMatchingId(f.id, members)[0];
        if (hit && !claimed.has(hit.key)) {
            byFieldId.set(f.id, hit);
            claimed.add(hit.key);
        }
    }
    for (const f of lines) {
        if (byFieldId.has(f.id)) continue;
        const hits = membersMatchingLabel(f.label ?? "", members).filter((m) => !claimed.has(m.key));
        if (hits.length === 1) {
            byFieldId.set(f.id, hits[0]!);
            claimed.add(hits[0]!.key);
        } else {
            unresolved.push(f.id);
        }
    }
    return { byFieldId, unresolved };
}

const SEVERITY_WORDS: Readonly<Record<string, HealthSeverity>> = {
    life_threatening: "life_threatening",
    "life threatening": "life_threatening",
    "life-threatening": "life_threatening",
    anaphylaxis: "life_threatening",
    severe: "severe",
    moderate: "moderate",
    mild: "mild",
};

/** Health's own severity, or null. Never a default. */
export function healthSeverityFromAnswer(value: unknown): HealthSeverity | null {
    if (typeof value !== "string") return null;
    const v = value.trim().toLowerCase();
    if ((HEALTH_SEVERITIES as readonly string[]).includes(v)) return v as HealthSeverity;
    return SEVERITY_WORDS[v] ?? null;
}

export type HealthFactRowReading = {
    readonly fact_kind: Exclude<HealthFactKind, "immunization">;
    /** The payload `addHealthFact` will receive — only members the family actually answered. */
    readonly payload: Record<string, unknown>;
    /** Required members with no answer — the row is not a fact yet. */
    readonly missing_required: readonly string[];
    /** Lines that matched no member (kept on the submission as evidence; written nowhere). */
    readonly unresolved_member_field_ids: readonly string[];
    /** A severity answer that is not one of Health's severities — named, never coerced. */
    readonly unrecognized_severity: string | null;
};

export function readHealthFactRow(
    kind: Exclude<HealthFactKind, "immunization">,
    nested: readonly FormField[],
    values: Readonly<Record<string, unknown>>,
): HealthFactRowReading {
    const { byFieldId, unresolved } = interpretHealthFactMemberFields(kind, nested);
    const payload: Record<string, unknown> = {};
    let unrecognizedSeverity: string | null = null;
    for (const [fieldId, member] of byFieldId) {
        const raw = values[fieldId];
        if (member.kind === "boolean") {
            if (raw === true || raw === "yes" || raw === "true") payload[member.key] = true;
            continue;
        }
        if (member.kind === "severity") {
            const sev = healthSeverityFromAnswer(raw);
            if (sev) payload[member.key] = sev;
            else if (typeof raw === "string" && raw.trim()) unrecognizedSeverity = raw.trim();
            continue;
        }
        if (typeof raw === "string" && raw.trim()) payload[member.key] = raw.trim();
    }
    const missing = HEALTH_FACT_FORM_MEMBERS[kind]
        .filter((m) => m.required && payload[m.key] === undefined)
        .map((m) => m.key);
    return {
        fact_kind: kind,
        payload,
        missing_required: missing,
        unresolved_member_field_ids: unresolved.filter((id) => {
            const v = values[id];
            return v !== undefined && v !== null && !(typeof v === "string" && !v.trim());
        }),
        unrecognized_severity: unrecognizedSeverity,
    };
}

/** The key two readings of the same fact share — "Peanuts" and " peanuts " are one allergy. */
export function healthFactIdentityKey(kind: HealthFactKind, payload: Readonly<Record<string, unknown>>): string | null {
    const primary = kind === "allergy" ? payload.allergen : kind === "condition" ? (payload.condition ?? payload.condition_type) : kind === "medication" ? payload.medication : payload.vaccine_key;
    if (typeof primary !== "string" || !primary.trim()) return null;
    return `${kind}:${primary.trim().toLowerCase().replace(/\s+/g, " ")}`;
}
