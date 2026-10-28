/**
 * Human QA V2 — Marketing consent as a first-class, authorable Forms Studio question.
 *
 * The question is not a value field: its answer is the same Communications evidence record the tour
 * calendar's control produces, and Approve commits it through the same writer of
 * `communication_preferences`. These tests hold the rules the Director's QA checks in the browser:
 * never required, unchecked by default, wording recorded with a version, a channel not shown is never
 * a yes, forms without the question infer nothing, an opt-out is never overridden, and the misleading
 * legacy "Email opt-in" / "SMS opt-in" person fields are no longer offered.
 */
import { describe, expect, it } from "vitest";

import {
    buildIntakeMarketingConsentRecord,
    capturesFromIntakeRecord,
    choiceFitsLanguage,
    DEFAULT_MARKETING_CONSENT_LANGUAGE,
    findMarketingConsentField,
    INTAKE_MARKETING_CONSENT_LANGUAGE,
    marketingConsentFieldIds,
    readIntakeMarketingConsent,
    resolveMarketingConsentLanguage,
    withoutCompetingMarketingConsentFields,
    withoutMarketingConsentFields,
    type MarketingConsentFieldLike,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";
import { publicLinkOffersMarketingConsent } from "@/lib/tours/publicCalendar/tourCalendarLinkConfig";
import { commitIntakeMarketingConsentForCase } from "@/lib/pos/processingCase/commitIntakeMarketingConsentForCase";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { addField, createBlankSchema, updateField } from "@/lib/forms/formBuilderSchema";
import { formFieldAsksParticipant, formFieldCollectsValue } from "@/lib/forms/formFieldCollectsValue";
import { isLegacyConsentPaletteEntry } from "@/lib/forms/processingFormFieldLibrary";
import { STUDIO_QUESTION_TYPES } from "@/app/adminV2/pos/useFormStudioAuthoring";

const consentField = (over: Partial<MarketingConsentFieldLike> = {}): MarketingConsentFieldLike => ({
    id: "stay_in_touch",
    type: "marketing_consent",
    label: "Hear from Firefly Academy",
    description: "Optional — your inquiry is handled either way.",
    consent: { channels: { email: true, sms: true }, wording: { email: "Email me Firefly news.", sms: "Text me Firefly news. Reply STOP to opt out." } },
    ...over,
});

const schemaWith = (fields: unknown[]): FormSchemaV1 =>
    validateFormSchema({
        schema_version: 1,
        title: "Inquiry",
        sections: [{ id: "s1", title: "About you", field_ids: (fields as { id: string }[]).map((f) => f.id) }],
        fields,
    });

const parentEmail = { id: "parent_email", type: "text", label: "Email", required: true };

describe("schema — a consent question can never be an implicit opt-in", () => {
    it("accepts a marketing consent question and keeps its wording through validation", () => {
        const s = schemaWith([parentEmail, consentField()]);
        const f = s.fields[1] as FormSchemaV1["fields"][number] & { type: "marketing_consent" };
        expect(f.type).toBe("marketing_consent");
        expect(f.required).toBe(false);
        expect(f.consent.wording?.sms).toContain("STOP");
    });

    it("refuses a required consent question", () => {
        expect(() => schemaWith([{ ...consentField(), required: true }])).toThrow();
    });

    it("refuses a consent question that offers no channel", () => {
        expect(() => schemaWith([consentField({ consent: { channels: { email: false, sms: false } } })])).toThrow();
    });

    it("refuses binding the answer to a value destination", () => {
        expect(() => schemaWith([{ ...consentField(), field_source: { entity_type: "person", field_key: "email_opt_in" } }])).toThrow();
    });

    it("holds no value and is never a participant need", () => {
        expect(formFieldCollectsValue({ type: "marketing_consent" })).toBe(false);
        expect(formFieldAsksParticipant({ type: "marketing_consent" })).toBe(false);
    });
});

describe("wording — what the family saw is what the evidence names", () => {
    it("no authored question → Communications' default wording and version", () => {
        expect(resolveMarketingConsentLanguage(null)).toEqual(DEFAULT_MARKETING_CONSENT_LANGUAGE);
        expect(DEFAULT_MARKETING_CONSENT_LANGUAGE.version).toBe(INTAKE_MARKETING_CONSENT_LANGUAGE.version);
    });

    it("authored wording is used per channel; empty wording falls back to the default (with its STOP / unsubscribe line)", () => {
        const L = resolveMarketingConsentLanguage(consentField({ consent: { channels: { email: true, sms: true }, wording: { email: "Email me news." } } }));
        expect(L.email).toBe("Email me news.");
        expect(L.sms).toBe(INTAKE_MARKETING_CONSENT_LANGUAGE.sms);
        expect(L.heading).toBe("Hear from Firefly Academy");
        expect(L.formFieldId).toBe("stay_in_touch");
    });

    it("the version is derived from the words: same words → same version; any change → a new version", () => {
        const a = resolveMarketingConsentLanguage(consentField());
        expect(resolveMarketingConsentLanguage(consentField()).version).toBe(a.version);
        expect(a.version).toMatch(/^form_field\.v1:[0-9a-f]{8}$/);
        const reworded = resolveMarketingConsentLanguage(consentField({ consent: { channels: { email: true, sms: true }, wording: { email: "Email me school news." } } }));
        expect(reworded.version).not.toBe(a.version);
        const narrowed = resolveMarketingConsentLanguage(consentField({ consent: { channels: { email: true, sms: false }, wording: consentField().consent.wording } }));
        expect(narrowed.version).not.toBe(a.version);
        expect(narrowed.sms).toBe("");
    });
});

describe("publicLinkOffersMarketingConsent — the server decides from the link and the published schema", () => {
    const lead = { lead_capture: true, default_location_id: "loc" };
    const withQuestion = schemaWith([parentEmail, consentField()]);
    const withoutQuestion = schemaWith([parentEmail]);

    it("a lead-capture intake link offers consent when the form places the question — no tour calendar needed", () => {
        expect(publicLinkOffersMarketingConsent(lead, { packet: false, schema: withQuestion })).toBe(true);
    });

    it("a form without the question infers nothing (no tour calendar → no consent offered)", () => {
        expect(publicLinkOffersMarketingConsent(lead, { packet: false, schema: withoutQuestion })).toBe(false);
        expect(publicLinkOffersMarketingConsent(lead, { packet: false })).toBe(false);
    });

    it("never on a packet, and never on a link that opens no Processing case", () => {
        expect(publicLinkOffersMarketingConsent(lead, { packet: true, schema: withQuestion })).toBe(false);
        expect(publicLinkOffersMarketingConsent({ form_context_mode: "existing_record" }, { packet: false, schema: withQuestion })).toBe(false);
        expect(publicLinkOffersMarketingConsent({}, { packet: false, schema: withQuestion })).toBe(false);
    });

    it("the tour calendar's own offer is unchanged", () => {
        expect(publicLinkOffersMarketingConsent({ ...lead, tour_calendar_v1: { enabled: true } }, { packet: false, schema: withoutQuestion })).toBe(true);
    });
});

describe("one consent answer per form", () => {
    it("finds the form's question (also inside a group) and lists every consent id, so none is stored as a value", () => {
        const s = { fields: [{ id: "g", type: "group", fields: [{ id: "c", type: "marketing_consent" }] }] };
        expect(findMarketingConsentField(s)?.id).toBe("c");
        expect(marketingConsentFieldIds(s)).toEqual(["c"]);
        expect(findMarketingConsentField({ fields: [{ id: "x", type: "text" }] })).toBeNull();
    });

    it("on a tour form that places the question, the legacy person opt-ins go and the question stays (no duplicate control)", () => {
        const schema = schemaWith([
            parentEmail,
            { id: "email_opt_in", type: "boolean", label: "Email opt-in", required: false, field_source: { entity_type: "person", field_key: "email_opt_in" } },
            consentField(),
        ]);
        const stripped = withoutCompetingMarketingConsentFields(schema);
        expect(stripped.fields.map((f) => f.id)).toEqual(["parent_email", "stay_in_touch"]);
        expect(stripped.sections[0]!.field_ids).toEqual(["parent_email", "stay_in_touch"]);
    });

    it("where consent is not offered, the question is not shown at all", () => {
        const stripped = withoutMarketingConsentFields(schemaWith([parentEmail, consentField()]));
        expect(stripped.fields.map((f) => f.id)).toEqual(["parent_email"]);
        expect(stripped.sections[0]!.field_ids).toEqual(["parent_email"]);
    });
});

describe("the evidence record for an authored question", () => {
    const language = resolveMarketingConsentLanguage(consentField({ consent: { channels: { email: true, sms: false }, wording: { email: "Email me Firefly news." } } }));

    it("records choice, exact wording, version, heading, channels shown, source link, submission, question and time", () => {
        const at = new Date("2026-10-28T22:00:00Z");
        const r = buildIntakeMarketingConsentRecord({ choice: { email: true, sms: false }, formPublicLinkId: "link-1", formSubmissionId: "sub-1", language, at });
        expect(r).toMatchObject({
            captured_at: "2026-10-28T22:00:00.000Z",
            response: "submitted",
            choices: { email: true, sms: false },
            language: { version: language.version, email: "Email me Firefly news.", sms: "", heading: "Hear from Firefly Academy", channels: { email: true, sms: false } },
            provenance: { form_public_link_id: "link-1", form_submission_id: "sub-1", form_field_id: "stay_in_touch" },
            committed: null,
        });
        expect(readIntakeMarketingConsent({ marketing_consent: r })?.choices).toEqual({ email: true, sms: false });
    });

    it("a channel the question did not show is refused at the door and can never be recorded as a yes", () => {
        expect(choiceFitsLanguage({ email: false, sms: true }, language)).toBe(false);
        expect(choiceFitsLanguage({ email: true, sms: false }, language)).toBe(true);
        expect(choiceFitsLanguage(null, language)).toBe(true);
        const forced = buildIntakeMarketingConsentRecord({ choice: { email: true, sms: true }, formPublicLinkId: "l", formSubmissionId: "s", language });
        expect(forced.choices).toEqual({ email: true, sms: false });
    });

    it("an untouched question records 'no' on every channel — submitting is never consent", () => {
        const r = buildIntakeMarketingConsentRecord({ choice: null, formPublicLinkId: "l", formSubmissionId: "s", language });
        expect(r.response).toBe("absent");
        expect(r.choices).toEqual({ email: false, sms: false });
    });

    it("hands Communications one capture per channel naming the authored wording version", () => {
        const r = buildIntakeMarketingConsentRecord({ choice: { email: true, sms: false }, formPublicLinkId: "l", formSubmissionId: "s", language });
        const caps = capturesFromIntakeRecord(r, { processingCaseId: "case-1" });
        expect(caps.map((c) => [c.channel, c.optedIn])).toEqual([["email", true], ["sms", false]]);
        expect(caps[0]!.evidence).toMatchObject({ language_version: language.version, processing_case_id: "case-1", form_submission_id: "s" });
    });
});

describe("Approve commits the authored question's evidence through the one consent writer", () => {
    function fakeDb(caseMeta0: Record<string, unknown>, prefs0: Array<{ category: string; state: string }> = []) {
        let caseMeta = structuredClone(caseMeta0);
        const prefs = [...prefs0];
        const events: Array<Record<string, unknown>> = [];
        const chain = (resolveRow: (f: Record<string, string>) => unknown) => {
            const filters: Record<string, string> = {};
            const q = {
                eq(k: string, v: string) {
                    filters[k] = v;
                    return q;
                },
                async maybeSingle() {
                    return { data: resolveRow(filters), error: null };
                },
            };
            return q;
        };
        const db = {
            from(table: string) {
                if (table === "processing_cases") {
                    return {
                        select: () => chain(() => ({ metadata: structuredClone(caseMeta) })),
                        update(patch: { metadata: Record<string, unknown> }) {
                            const q = {
                                eq: () => q,
                                then(res: (v: { error: null }) => void) {
                                    caseMeta = structuredClone(patch.metadata);
                                    res({ error: null });
                                },
                            };
                            return q;
                        },
                    };
                }
                if (table === "communication_preferences") {
                    return {
                        select: () => chain((f) => prefs.find((p) => p.category === f.category) ?? null),
                        async upsert(row: { category: string; state: string }) {
                            const i = prefs.findIndex((p) => p.category === row.category);
                            if (i >= 0) prefs[i] = { category: row.category, state: row.state };
                            else prefs.push({ category: row.category, state: row.state });
                            return { error: null };
                        },
                    };
                }
                if (table === "communication_preference_events") {
                    return {
                        async insert(row: Record<string, unknown>) {
                            events.push(row);
                            return { error: null };
                        },
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        };
        return { db: db as never, prefs, events };
    }
    const args = { orgId: "org", caseId: "case-1", personId: "person-1", actorUserId: "actor" };
    const language = resolveMarketingConsentLanguage(consentField());

    it("SMS only → only SMS marketing is opted in, with the authored wording version on the event", async () => {
        const r = buildIntakeMarketingConsentRecord({ choice: { email: false, sms: true }, formPublicLinkId: "l", formSubmissionId: "s", language });
        const f = fakeDb({ marketing_consent: r });
        await commitIntakeMarketingConsentForCase(f.db, args);
        expect(f.prefs).toEqual([{ category: "sms_marketing", state: "opted_in" }]);
        expect(JSON.stringify(f.events)).toContain(language.version);
    });

    it("a repeat inquiry ticking both boxes never overrides an existing opt-out", async () => {
        const r = buildIntakeMarketingConsentRecord({ choice: { email: true, sms: true }, formPublicLinkId: "l", formSubmissionId: "s", language });
        const f = fakeDb({ marketing_consent: r }, [
            { category: "email_marketing", state: "opted_out" },
            { category: "sms_marketing", state: "opted_out" },
        ]);
        const out = await commitIntakeMarketingConsentForCase(f.db, args);
        expect(out).toMatchObject({ outcomes: [{ channel: "email", outcome: "preserved_opt_out" }, { channel: "sms", outcome: "preserved_opt_out" }] });
        expect(f.prefs.map((p) => p.state)).toEqual(["opted_out", "opted_out"]);
    });
});

describe("Forms Studio authoring", () => {
    it("the question picker offers Marketing consent", () => {
        expect(STUDIO_QUESTION_TYPES.find((t) => t.type === "marketing_consent")?.label).toBe("Marketing consent");
    });

    it("adding it creates an optional, unbound question with both channels offered", () => {
        const { schema, fieldId } = addField(createBlankSchema("Inquiry"), { type: "marketing_consent", label: "Stay in touch (optional)" });
        const f = schema.fields.find((x) => x.id === fieldId)!;
        expect(f).toMatchObject({ type: "marketing_consent", required: false, consent: { channels: { email: true, sms: true } } });
        expect("field_source" in f).toBe(false);
        expect(() => validateFormSchema(schema)).not.toThrow();
        expect(schema.sections[0]!.field_ids).toContain(fieldId);
    });

    it("the author can word each box and narrow channels, but cannot make it required or remove every channel", () => {
        let { schema, fieldId } = addField(createBlankSchema("Inquiry"), { type: "marketing_consent", label: "Stay in touch (optional)" });
        schema = updateField(schema, fieldId, { required: true });
        schema = updateField(schema, fieldId, { consent: { channels: { email: true, sms: false }, wording: { email: "Email me news.", sms: "   " } } });
        let f = schema.fields.find((x) => x.id === fieldId) as FormSchemaV1["fields"][number] & { type: "marketing_consent" };
        expect(f.required).toBe(false);
        expect(f.consent).toEqual({ channels: { email: true, sms: false }, wording: { email: "Email me news." } });
        schema = updateField(schema, fieldId, { consent: { channels: { email: false, sms: false } } });
        f = schema.fields.find((x) => x.id === fieldId) as typeof f;
        expect(f.consent.channels).toEqual({ email: true, sms: false });
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("the legacy person opt-in fields are no longer offered in the field library", () => {
        for (const key of ["email_opt_in", "sms_opt_in", "communication_opt_out", "guardian_email_opt_in"]) {
            expect(isLegacyConsentPaletteEntry({ field_key: key, rule_id: `person:${key}` })).toBe(true);
        }
        expect(isLegacyConsentPaletteEntry({ field_key: "email", rule_id: "person:email" })).toBe(false);
        expect(isLegacyConsentPaletteEntry({ field_key: "photo_consent", rule_id: "child:photo_consent" })).toBe(false);
    });
});
