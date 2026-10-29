/**
 * PUBLIC INTAKE MARKETING CONSENT — the evidence record (Communications-owned, pure, client-safe).
 *
 * A family on a public intake form may OPTIONALLY ask for marketing email and/or marketing texts.
 * Each channel is its own unchecked box with its own wording. What they chose is evidence, not yet
 * a preference: there is no Person until an administrator approves the Processing case. The record
 * rides on the case (`processing_cases.metadata.marketing_consent`); Approve hands it to
 * {@link commitMarketingConsentCaptures} for the committed person, which is the only writer of
 * `communication_preferences` — there is no second consent store.
 *
 * Rules held here:
 *   - only a literal `true` is affirmative; an unchecked, missing or malformed answer is never consent;
 *   - email and SMS are separate answers — one never implies the other;
 *   - the exact wording shown is recorded with its version, so the evidence says what was agreed to;
 *   - submitting the form is not consent, and capturing consent sends nothing.
 */

import type { IntakeMarketingConsentCapture, MarketingConsentChannel } from "./intakeMarketingConsent";

export const INTAKE_MARKETING_CONSENT_METADATA_KEY = "marketing_consent" as const;
export const INTAKE_MARKETING_CONSENT_SCHEMA = "communications.intake_marketing_consent.v1" as const;

/** Bump the version whenever the wording changes — recorded evidence names the version it showed. */
export const INTAKE_MARKETING_CONSENT_LANGUAGE = {
    version: "intake_marketing_consent.2026-10.v1",
    heading: "Stay in touch (optional)",
    email: "Email me news, events and enrollment updates from this school. I can unsubscribe at any time.",
    sms: "Text me news, events and enrollment updates from this school. Message and data rates may apply. Reply STOP to opt out at any time.",
    note: "Leaving these unchecked doesn't affect your request. We'll still contact you about it.",
} as const;

export const INTAKE_MARKETING_CONSENT_SOURCE = "public_intake" as const;
export const INTAKE_MARKETING_CONSENT_METHOD = "form_checkbox" as const;

export type IntakeMarketingConsentChoice = { email: boolean; sms: boolean };

export type IntakeMarketingConsentCommitOutcome = {
    channel: MarketingConsentChannel;
    outcome: "opted_in" | "preserved_opt_out" | "skipped_unset" | "already_opted_in" | "failed";
    error?: string;
};

export type IntakeMarketingConsentRecord = {
    schema_version: typeof INTAKE_MARKETING_CONSENT_SCHEMA;
    captured_at: string;
    /** `submitted` — the control was on screen and its state was sent; `absent` — offered, nothing sent. */
    response: "submitted" | "absent";
    choices: IntakeMarketingConsentChoice;
    /** Form-authored wording also records its heading, note and which channels were shown. */
    language: { version: string; email: string; sms: string; heading?: string; note?: string; channels?: { email: boolean; sms: boolean } };
    provenance: { form_public_link_id: string; form_submission_id: string; form_field_id?: string };
    /** Set once by Approve. Its presence is what makes a replayed approval write nothing. */
    committed?: {
        person_id: string;
        committed_at: string;
        outcomes: IntakeMarketingConsentCommitOutcome[];
    } | null;
};

export type ParsedMarketingConsentChoice =
    | { ok: true; value: IntakeMarketingConsentChoice | null }
    | { ok: false; message: string };

/**
 * Parse the browser's answer. `undefined` / `null` → no answer (null). Otherwise an object whose
 * `email` / `sms` are booleans or absent; anything else is refused rather than guessed at.
 */
export function parsePublicMarketingConsentChoice(raw: unknown): ParsedMarketingConsentChoice {
    if (raw === undefined || raw === null) return { ok: true, value: null };
    if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "Invalid consent answer." };
    const r = raw as Record<string, unknown>;
    for (const k of Object.keys(r)) {
        if (k !== "email" && k !== "sms") return { ok: false, message: "Invalid consent answer." };
    }
    for (const k of ["email", "sms"] as const) {
        if (r[k] !== undefined && typeof r[k] !== "boolean") return { ok: false, message: "Invalid consent answer." };
    }
    return { ok: true, value: { email: r.email === true, sms: r.sms === true } };
}

// ── The wording a family is shown: Communications' default, or the form author's ────────────────────

/** A form-authored consent question, as the record needs it (structural — no Forms import here). */
export type MarketingConsentFieldLike = {
    id: string;
    type: "marketing_consent";
    label: string;
    description?: string;
    consent: { channels: { email: boolean; sms: boolean }; wording?: { email?: string; sms?: string } };
};

/** What one consent control shows, and the version the evidence will name. */
export type ResolvedMarketingConsentLanguage = {
    version: string;
    heading: string;
    note: string;
    channels: { email: boolean; sms: boolean };
    email: string;
    sms: string;
    /** The authored question this came from; null for the link-offered control. */
    formFieldId: string | null;
};

export const DEFAULT_MARKETING_CONSENT_LANGUAGE: ResolvedMarketingConsentLanguage = {
    version: INTAKE_MARKETING_CONSENT_LANGUAGE.version,
    heading: INTAKE_MARKETING_CONSENT_LANGUAGE.heading,
    note: INTAKE_MARKETING_CONSENT_LANGUAGE.note,
    channels: { email: true, sms: true },
    email: INTAKE_MARKETING_CONSENT_LANGUAGE.email,
    sms: INTAKE_MARKETING_CONSENT_LANGUAGE.sms,
    formFieldId: null,
};

/** FNV-1a (32-bit), hex — deterministic and client-safe; identifies wording, it secures nothing. */
function wordingDigest(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

/**
 * The wording an authored question shows. Its version is derived from the exact words and channels,
 * so evidence names what was on screen: changing any of it (and republishing) is a new version, and
 * republishing unchanged wording keeps the same one. Empty wording falls back per channel to the
 * Communications default, which keeps that channel's opt-out instruction.
 */
export function resolveMarketingConsentLanguage(field: MarketingConsentFieldLike | null): ResolvedMarketingConsentLanguage {
    if (!field) return DEFAULT_MARKETING_CONSENT_LANGUAGE;
    const D = INTAKE_MARKETING_CONSENT_LANGUAGE;
    const channels = { email: field.consent?.channels?.email === true, sms: field.consent?.channels?.sms === true };
    const email = channels.email ? field.consent.wording?.email?.trim() || D.email : "";
    const sms = channels.sms ? field.consent.wording?.sms?.trim() || D.sms : "";
    const heading = field.label?.trim() || D.heading;
    const note = field.description?.trim() || D.note;
    const digest = wordingDigest(JSON.stringify([heading, note, channels.email, email, channels.sms, sms]));
    return { version: `form_field.v1:${digest}`, heading, note, channels, email, sms, formFieldId: field.id };
}

type SchemaFieldNode = { id: string; type?: string; fields?: SchemaFieldNode[] };

/** The form's own marketing consent question, if it has one (first found, groups included). */
export function findMarketingConsentField(schema: { fields?: SchemaFieldNode[] } | null | undefined): MarketingConsentFieldLike | null {
    const walk = (fields: SchemaFieldNode[] | undefined): MarketingConsentFieldLike | null => {
        for (const f of fields ?? []) {
            if (f.type === "marketing_consent") return f as unknown as MarketingConsentFieldLike;
            if (Array.isArray(f.fields)) {
                const inner = walk(f.fields);
                if (inner) return inner;
            }
        }
        return null;
    };
    return walk(schema?.fields);
}

/** Every marketing consent question id — their answers never belong in `values`. */
export function marketingConsentFieldIds(schema: { fields?: SchemaFieldNode[] } | null | undefined): string[] {
    const ids: string[] = [];
    const walk = (fields: SchemaFieldNode[] | undefined) => {
        for (const f of fields ?? []) {
            if (f.type === "marketing_consent") ids.push(f.id);
            if (Array.isArray(f.fields)) walk(f.fields);
        }
    };
    walk(schema?.fields);
    return ids;
}

/** A channel the control did not show can never carry a yes. */
export function choiceFitsLanguage(choice: IntakeMarketingConsentChoice | null, language: ResolvedMarketingConsentLanguage): boolean {
    if (!choice) return true;
    return !(choice.email && !language.channels.email) && !(choice.sms && !language.channels.sms);
}

export function buildIntakeMarketingConsentRecord(input: {
    choice: IntakeMarketingConsentChoice | null;
    formPublicLinkId: string;
    formSubmissionId: string;
    /** The wording on screen. Absent → Communications' default (the link-offered control). */
    language?: ResolvedMarketingConsentLanguage;
    at?: Date;
}): IntakeMarketingConsentRecord {
    const L = input.language ?? DEFAULT_MARKETING_CONSENT_LANGUAGE;
    return {
        schema_version: INTAKE_MARKETING_CONSENT_SCHEMA,
        captured_at: (input.at ?? new Date()).toISOString(),
        response: input.choice ? "submitted" : "absent",
        // A channel that was not on screen is never a yes, whatever arrived.
        choices: {
            email: L.channels.email && input.choice?.email === true,
            sms: L.channels.sms && input.choice?.sms === true,
        },
        language: {
            version: L.version,
            email: L.email,
            sms: L.sms,
            ...(L.formFieldId ? { heading: L.heading, note: L.note, channels: L.channels } : {}),
        },
        provenance: {
            form_public_link_id: input.formPublicLinkId,
            form_submission_id: input.formSubmissionId,
            ...(L.formFieldId ? { form_field_id: L.formFieldId } : {}),
        },
        committed: null,
    };
}

export function readIntakeMarketingConsent(metadata: unknown): IntakeMarketingConsentRecord | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>)[INTAKE_MARKETING_CONSENT_METADATA_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Partial<IntakeMarketingConsentRecord>;
    if (r.schema_version !== INTAKE_MARKETING_CONSENT_SCHEMA) return null;
    if (typeof r.captured_at !== "string" || !r.choices || typeof r.choices !== "object") return null;
    return {
        ...(r as IntakeMarketingConsentRecord),
        // Re-derive affirmatives strictly: a stored non-boolean can never read as consent.
        choices: { email: r.choices.email === true, sms: r.choices.sms === true },
    };
}

/** The per-channel captures C1's commit authority takes. Both channels, each its own answer. */
export function capturesFromIntakeRecord(
    record: IntakeMarketingConsentRecord,
    context: { processingCaseId: string }
): IntakeMarketingConsentCapture[] {
    return (["email", "sms"] as const).map((channel) => ({
        channel,
        optedIn: record.choices[channel] === true,
        capturedAt: record.captured_at,
        source: INTAKE_MARKETING_CONSENT_SOURCE,
        method: INTAKE_MARKETING_CONSENT_METHOD,
        evidence: {
            language_version: record.language?.version ?? null,
            form_public_link_id: record.provenance?.form_public_link_id ?? null,
            form_submission_id: record.provenance?.form_submission_id ?? null,
            processing_case_id: context.processingCaseId,
        },
    }));
}

// ── One consent control on a public intake ─────────────────────────────────────────────────────────

/**
 * Person fields a form can bind that ask the same marketing question as this control.
 *
 * Both appeared on one page when an author added the Alloy fields "Email opt-in" / "SMS opt-in" to an
 * intake form whose link also offers this control (P1-close, D5): two pairs of boxes, different
 * wording, and two destinations — the form fields promote onto the person's own columns with no record
 * of what was agreed to, while this control's evidence is the one Approve commits to
 * `communication_preferences`. Where the link offers this control, it is the only one shown.
 */
export const COMPETING_MARKETING_CONSENT_PERSON_FIELD_KEYS = ["email_opt_in", "sms_opt_in"] as const;

type ConsentFieldLike = { id: string; type?: string; field_source?: unknown; fields?: ConsentFieldLike[] };

export function isCompetingMarketingConsentField(field: ConsentFieldLike): boolean {
    const src = field.field_source;
    if (src == null || typeof src !== "object" || Array.isArray(src)) return false;
    const s = src as { entity_type?: unknown; field_key?: unknown };
    return (
        s.entity_type === "person" &&
        typeof s.field_key === "string" &&
        (COMPETING_MARKETING_CONSENT_PERSON_FIELD_KEYS as readonly string[]).includes(s.field_key)
    );
}

/** The schema without fields that compete with this control (and without their section references). */
export function withoutCompetingMarketingConsentFields<
    S extends { fields: ConsentFieldLike[]; sections?: { field_ids?: string[] }[] },
>(schema: S): S {
    const removed = new Set<string>();
    const strip = (fields: ConsentFieldLike[]): ConsentFieldLike[] =>
        fields
            .filter((f) => {
                if (!isCompetingMarketingConsentField(f)) return true;
                removed.add(f.id);
                return false;
            })
            .map((f) => (Array.isArray(f.fields) ? { ...f, fields: strip(f.fields) } : f));
    const fields = strip(schema.fields);
    if (removed.size === 0) return schema;
    const sections = schema.sections?.map((sec) =>
        Array.isArray(sec.field_ids) ? { ...sec, field_ids: sec.field_ids.filter((id) => !removed.has(id)) } : sec,
    );
    return { ...schema, fields, ...(sections ? { sections } : {}) } as S;
}

/**
 * The schema without its Marketing consent questions (and their section references) — for a link that
 * does not offer consent. Boxes a family could tick but no case would hold are never shown.
 */
export function withoutMarketingConsentFields<
    S extends { fields: ConsentFieldLike[]; sections?: { field_ids?: string[] }[] },
>(schema: S): S {
    const removed = new Set<string>();
    const strip = (fields: ConsentFieldLike[]): ConsentFieldLike[] =>
        fields
            .filter((f) => {
                if (f.type !== "marketing_consent") return true;
                removed.add(f.id);
                return false;
            })
            .map((f) => (Array.isArray(f.fields) ? { ...f, fields: strip(f.fields) } : f));
    const fields = strip(schema.fields);
    if (removed.size === 0) return schema;
    const sections = schema.sections?.map((sec) =>
        Array.isArray(sec.field_ids) ? { ...sec, field_ids: sec.field_ids.filter((id) => !removed.has(id)) } : sec,
    );
    return { ...schema, fields, ...(sections ? { sections } : {}) } as S;
}
