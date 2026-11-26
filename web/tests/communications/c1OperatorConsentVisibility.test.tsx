/** @vitest-environment jsdom */
/**
 * C1 — what an operator sees about marketing consent: on the person (canonical preference, provenance,
 * history, effective eligibility) and on the Processing case (what the family answered, what Approve did).
 * The real-database proof is S7 C·5 / C·8 in tests/tours/live/publicTourIntake.live.test.ts.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PersonCommunicationPreferencesPanel, {
    describePreferenceEvent,
    describePreferenceProvenance,
} from "@/components/admin/communications/PersonCommunicationPreferencesPanel";
import { presentIntakeMarketingConsent } from "@/lib/communications/preferences/intakeMarketingConsentPresentation";
import { buildIntakeMarketingConsentRecord } from "@/lib/communications/preferences/intakeMarketingConsentRecord";

const AT = "2026-10-20T17:00:00.000Z";
const ev = (over: Partial<Parameters<typeof describePreferenceEvent>[0]>) => ({
    source: "public_intake",
    at: AT,
    fromState: "opted_out",
    toState: "opted_out",
    changedState: false,
    outcome: "preserved_opt_out",
    consentLanguageVersion: "intake_marketing_consent.2026-10.v1",
    ...over,
});

describe("C1 · preference provenance and history, in words", () => {
    it("a repeat inquiry while opted out is history that says the opt-out was kept — never a source", () => {
        expect(describePreferenceEvent(ev({}))).toMatch(/public inquiry form asked to opt in — opt-out kept$/);
    });

    it("a real change names its states, its source and the consent wording", () => {
        expect(describePreferenceEvent(ev({ fromState: null, toState: "opted_in", changedState: true, outcome: "opted_in" }))).toMatch(
            /not set → opted in · public inquiry form · wording intake_marketing_consent\.2026-10\.v1$/
        );
    });

    it("no recorded change is said plainly and never inferred as consent", () => {
        expect(describePreferenceProvenance({ state: "unset", lastChange: null })).toBe("No consent on record");
        expect(describePreferenceProvenance({ state: "opted_out", lastChange: null })).toBe("Source not recorded");
    });
});

describe("C1 · the Processing case's consent evidence", () => {
    const base = { formPublicLinkId: "l-1", formSubmissionId: "s-1", at: new Date(AT) };

    it("before Approve: the family's answers, nothing applied", () => {
        const p = presentIntakeMarketingConsent(buildIntakeMarketingConsentRecord({ ...base, choice: { email: true, sms: false } }))!;
        expect(p.committed).toBe(false);
        expect(p.languageVersion).toBe("intake_marketing_consent.2026-10.v1");
        expect(p.lines).toEqual([
            { channel: "email", answered: "Email news: yes", applied: null },
            { channel: "sms", answered: "Text news: no", applied: null },
        ]);
    });

    it("an answer that was never sent reads as no — submitting is not consent", () => {
        const p = presentIntakeMarketingConsent(buildIntakeMarketingConsentRecord({ ...base, choice: null }))!;
        expect(p.lines.map((l) => l.answered)).toEqual(["Email news: no answer sent — treated as no", "Text news: no answer sent — treated as no"]);
    });

    it("after Approve: a preserved opt-out says the opt-out stands", () => {
        const record = {
            ...buildIntakeMarketingConsentRecord({ ...base, choice: { email: true, sms: true } }),
            committed: {
                person_id: "p-1",
                committed_at: AT,
                outcomes: [
                    { channel: "email" as const, outcome: "preserved_opt_out" as const },
                    { channel: "sms" as const, outcome: "opted_in" as const },
                ],
            },
        };
        expect(presentIntakeMarketingConsent(record)!.lines.map((l) => l.applied)).toEqual([
            "Not applied — the person had opted out; the opt-out stands",
            "Recorded as opted in",
        ]);
    });

    it("no record → nothing shown", () => {
        expect(presentIntakeMarketingConsent(null)).toBeNull();
    });
});

describe("C1 · the person panel renders provenance, eligibility and history", () => {
    let host: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    });

    it("an unsubscribed person who inquired again: set by the unsubscribe, opt-out kept, will not be sent", async () => {
        const unsubscribed = { source: "recipient_unsubscribe", at: "2026-10-10T17:00:00.000Z", fromState: "opted_in", toState: "opted_out", changedState: true, outcome: null, consentLanguageVersion: null };
        const view = {
            personId: "p-1",
            preferredChannel: null,
            preferredChannelOptions: [],
            preferences: [
                {
                    key: "email_marketing",
                    label: "Marketing email",
                    description: "",
                    channel: "email",
                    control: "opt_in",
                    state: "opted_out",
                    allowedChanges: [],
                    lockedReason: "Unsubscribed by the person. Only the person can opt back in.",
                    lastChange: unsubscribed,
                    history: [ev({}), unsubscribed],
                    effective: { status: "blocked", code: "OPTED_OUT", reason: "Recipient opted out of marketing messages." },
                },
            ],
        };
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: view }), { status: 200 })));
        await act(async () => {
            root.render(<PersonCommunicationPreferencesPanel personId="p-1" />);
        });
        await act(async () => {});
        const provenance = host.querySelector('[data-person-communication-preferences="email_marketing-provenance"]')!;
        expect(provenance.textContent).toMatch(/^Set by unsubscribe link/);
        expect(provenance.textContent).not.toMatch(/public inquiry/);
        const effective = host.querySelector('[data-person-communication-preferences="email_marketing-effective"]')!;
        expect(effective.getAttribute("data-effective-status")).toBe("blocked");
        expect(effective.textContent).toBe("Will not be sent — Recipient opted out of marketing messages.");
        const history = [...host.querySelectorAll('[data-person-communication-preferences="email_marketing-history"] li')].map((li) => li.textContent);
        expect(history[0]).toMatch(/asked to opt in — opt-out kept$/);
        expect(history[1]).toMatch(/opted in → opted out · unsubscribe link$/);
    });
});
