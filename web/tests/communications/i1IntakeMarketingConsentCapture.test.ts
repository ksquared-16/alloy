/**
 * Tours I1 (S7 × C1) — public intake marketing consent: the evidence record, the link's offer
 * gate, and the Approve handoff's commit-once behaviour. The real-database journey is in
 * `tests/tours/live/publicTourIntake.live.test.ts` (scenarios C·1–C·8).
 */
import { describe, expect, it } from "vitest";

import {
    buildIntakeMarketingConsentRecord,
    capturesFromIntakeRecord,
    INTAKE_MARKETING_CONSENT_LANGUAGE,
    INTAKE_MARKETING_CONSENT_METADATA_KEY,
    parsePublicMarketingConsentChoice,
    readIntakeMarketingConsent,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";
import { publicLinkOffersMarketingConsent } from "@/lib/tours/publicCalendar/tourCalendarLinkConfig";
import { commitIntakeMarketingConsentForCase } from "@/lib/pos/processingCase/commitIntakeMarketingConsentForCase";

describe("parsePublicMarketingConsentChoice — only a literal true is consent", () => {
    it("no answer is no answer", () => {
        expect(parsePublicMarketingConsentChoice(undefined)).toEqual({ ok: true, value: null });
        expect(parsePublicMarketingConsentChoice(null)).toEqual({ ok: true, value: null });
    });
    it("unchecked, partial and per-channel answers stay separate", () => {
        expect(parsePublicMarketingConsentChoice({})).toEqual({ ok: true, value: { email: false, sms: false } });
        expect(parsePublicMarketingConsentChoice({ email: false, sms: false })).toEqual({ ok: true, value: { email: false, sms: false } });
        expect(parsePublicMarketingConsentChoice({ email: true })).toEqual({ ok: true, value: { email: true, sms: false } });
        expect(parsePublicMarketingConsentChoice({ sms: true })).toEqual({ ok: true, value: { email: false, sms: true } });
    });
    it("anything that is not a boolean is refused, never coerced", () => {
        for (const raw of ["yes", true, 1, [], [true], { email: "true" }, { email: 1 }, { sms: "on" }, { email: true, marketing: true }]) {
            expect(parsePublicMarketingConsentChoice(raw).ok, JSON.stringify(raw)).toBe(false);
        }
    });
});

describe("the evidence record", () => {
    const base = { formPublicLinkId: "link-1", formSubmissionId: "sub-1", at: new Date("2033-03-01T00:00:00Z") };
    it("records an absent answer as 'no' on both channels, with the wording shown", () => {
        const r = buildIntakeMarketingConsentRecord({ ...base, choice: null });
        expect(r).toMatchObject({
            response: "absent",
            choices: { email: false, sms: false },
            captured_at: "2033-03-01T00:00:00.000Z",
            language: { version: INTAKE_MARKETING_CONSENT_LANGUAGE.version, email: INTAKE_MARKETING_CONSENT_LANGUAGE.email, sms: INTAKE_MARKETING_CONSENT_LANGUAGE.sms },
            provenance: { form_public_link_id: "link-1", form_submission_id: "sub-1" },
            committed: null,
        });
    });
    it("email and SMS wording are distinct and channel-specific", () => {
        expect(INTAKE_MARKETING_CONSENT_LANGUAGE.email).toMatch(/email/i);
        expect(INTAKE_MARKETING_CONSENT_LANGUAGE.email).toMatch(/unsubscribe/i);
        expect(INTAKE_MARKETING_CONSENT_LANGUAGE.sms).toMatch(/text/i);
        expect(INTAKE_MARKETING_CONSENT_LANGUAGE.sms).toMatch(/STOP/);
        expect(INTAKE_MARKETING_CONSENT_LANGUAGE.email).not.toEqual(INTAKE_MARKETING_CONSENT_LANGUAGE.sms);
    });
    it("reads back strictly — a tampered non-boolean never reads as consent", () => {
        const r = buildIntakeMarketingConsentRecord({ ...base, choice: { email: true, sms: false } });
        expect(readIntakeMarketingConsent({ [INTAKE_MARKETING_CONSENT_METADATA_KEY]: r })?.choices).toEqual({ email: true, sms: false });
        const tampered = { ...r, choices: { email: "true", sms: 1 } };
        expect(readIntakeMarketingConsent({ [INTAKE_MARKETING_CONSENT_METADATA_KEY]: tampered })?.choices).toEqual({ email: false, sms: false });
        expect(readIntakeMarketingConsent({ [INTAKE_MARKETING_CONSENT_METADATA_KEY]: { ...r, schema_version: "other" } })).toBeNull();
        expect(readIntakeMarketingConsent({})).toBeNull();
    });
    it("hands C1 one capture per channel, each its own answer, with provenance", () => {
        const r = buildIntakeMarketingConsentRecord({ ...base, choice: { email: false, sms: true } });
        const caps = capturesFromIntakeRecord(r, { processingCaseId: "case-1" });
        expect(caps.map((c) => [c.channel, c.optedIn])).toEqual([["email", false], ["sms", true]]);
        for (const c of caps) {
            expect(c).toMatchObject({ source: "public_intake", method: "form_checkbox", capturedAt: r.captured_at });
            expect(c.evidence).toMatchObject({ processing_case_id: "case-1", form_submission_id: "sub-1", language_version: INTAKE_MARKETING_CONSENT_LANGUAGE.version });
        }
    });
});

describe("publicLinkOffersMarketingConsent — the link decides, never the browser", () => {
    const lead = { lead_capture: true, default_location_id: "loc" };
    it("offers only on a lead-capture intake link whose tour calendar is published, never on a packet", () => {
        expect(publicLinkOffersMarketingConsent({ ...lead, tour_calendar_v1: { enabled: true } }, { packet: false })).toBe(true);
        expect(publicLinkOffersMarketingConsent({ ...lead, tour_calendar_v1: { enabled: true } }, { packet: true })).toBe(false);
        expect(publicLinkOffersMarketingConsent({ ...lead, tour_calendar_v1: { enabled: false } }, { packet: false })).toBe(false);
        expect(publicLinkOffersMarketingConsent({ ...lead, tour_calendar_v1: { enabled: "true" } }, { packet: false })).toBe(false);
        expect(publicLinkOffersMarketingConsent(lead, { packet: false })).toBe(false);
        expect(publicLinkOffersMarketingConsent({ tour_calendar_v1: { enabled: true } }, { packet: false })).toBe(false);
        expect(publicLinkOffersMarketingConsent(null, { packet: false })).toBe(false);
    });
});

/** processing_cases + communication_preferences(+events), enough for the handoff's real code paths. */
function fakeDb(opts: { caseMeta: Record<string, unknown>; prefs?: Array<{ category: string; state: string }>; failUpsert?: boolean }) {
    let caseMeta = structuredClone(opts.caseMeta);
    const prefs = [...(opts.prefs ?? [])];
    const events: Array<{ category: string; from_state: string | null; to_state: string; source: string | null }> = [];
    const chain = (resolveRow: (filters: Record<string, string>) => unknown) => {
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
                        if (opts.failUpsert) return { error: { message: "boom" } };
                        const i = prefs.findIndex((p) => p.category === row.category);
                        if (i >= 0) prefs[i] = { category: row.category, state: row.state };
                        else prefs.push({ category: row.category, state: row.state });
                        return { error: null };
                    },
                };
            }
            if (table === "communication_preference_events") {
                return {
                    async insert(row: (typeof events)[number]) {
                        events.push(row);
                        return { error: null };
                    },
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
    return { db: db as never, prefs, events, meta: () => caseMeta };
}

const record = (choice: { email: boolean; sms: boolean } | null) =>
    buildIntakeMarketingConsentRecord({ choice, formPublicLinkId: "link-1", formSubmissionId: "sub-1" });

describe("commitIntakeMarketingConsentForCase — commit once, never weaken an opt-out", () => {
    const args = { orgId: "org", caseId: "case-1", personId: "person-1", actorUserId: "actor" };

    it("no evidence → not_applicable, nothing written", async () => {
        const f = fakeDb({ caseMeta: {} });
        expect(await commitIntakeMarketingConsentForCase(f.db, args)).toEqual({ kind: "not_applicable" });
        expect(f.events).toEqual([]);
    });

    it("no resolved person → evidence stays uncommitted", async () => {
        const f = fakeDb({ caseMeta: { marketing_consent: record({ email: true, sms: false }) } });
        expect(await commitIntakeMarketingConsentForCase(f.db, { ...args, personId: null })).toEqual({ kind: "no_person" });
        expect(readIntakeMarketingConsent(f.meta())?.committed).toBeNull();
        expect(f.prefs).toEqual([]);
    });

    it("unchecked boxes write no preference at all", async () => {
        const f = fakeDb({ caseMeta: { marketing_consent: record({ email: false, sms: false }) } });
        const r = await commitIntakeMarketingConsentForCase(f.db, args);
        expect(r).toMatchObject({ kind: "committed", replayed: false, outcomes: [{ channel: "email", outcome: "skipped_unset" }, { channel: "sms", outcome: "skipped_unset" }] });
        expect(f.prefs).toEqual([]);
        expect(f.events).toEqual([]);
    });

    it("email only opts in email marketing only", async () => {
        const f = fakeDb({ caseMeta: { marketing_consent: record({ email: true, sms: false }) } });
        await commitIntakeMarketingConsentForCase(f.db, args);
        expect(f.prefs).toEqual([{ category: "email_marketing", state: "opted_in" }]);
        expect(f.events).toEqual([expect.objectContaining({ category: "email_marketing", from_state: null, to_state: "opted_in", source: "public_intake" })]);
    });

    it("an existing opt-out holds on both channels", async () => {
        const f = fakeDb({
            caseMeta: { marketing_consent: record({ email: true, sms: true }) },
            prefs: [{ category: "email_marketing", state: "opted_out" }, { category: "sms_marketing", state: "opted_out" }],
        });
        const r = await commitIntakeMarketingConsentForCase(f.db, args);
        expect(r).toMatchObject({ outcomes: [{ channel: "email", outcome: "preserved_opt_out" }, { channel: "sms", outcome: "preserved_opt_out" }] });
        expect(f.prefs.map((p) => p.state)).toEqual(["opted_out", "opted_out"]);
        expect(f.events.every((e) => e.to_state === "opted_out")).toBe(true);
    });

    it("a replayed Approve writes nothing again", async () => {
        const f = fakeDb({ caseMeta: { other: 1, marketing_consent: record({ email: true, sms: false }) } });
        await commitIntakeMarketingConsentForCase(f.db, args);
        const eventsAfterFirst = f.events.length;
        const again = await commitIntakeMarketingConsentForCase(f.db, { ...args, personId: "someone-else" });
        expect(again).toMatchObject({ kind: "committed", replayed: true, personId: "person-1" });
        expect(f.events.length).toBe(eventsAfterFirst);
        expect(f.meta().other).toBe(1); // the rest of the case metadata survives the stamp
    });

    it("a failed write leaves the evidence uncommitted for a retry", async () => {
        const f = fakeDb({ caseMeta: { marketing_consent: record({ email: true, sms: false }) }, failUpsert: true });
        const r = await commitIntakeMarketingConsentForCase(f.db, args);
        expect(r.kind).toBe("failed");
        expect(readIntakeMarketingConsent(f.meta())?.committed).toBeNull();
    });
});
