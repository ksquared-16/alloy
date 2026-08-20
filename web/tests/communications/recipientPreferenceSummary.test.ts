/**
 * What the operator is told must be what the platform will actually do.
 *
 * The defect this whole pass exists to close was a control that said one thing and did
 * another. A summary derived by hand from preference rows would be the same defect in a new
 * place, so the last block here re-derives every claim from `evaluateEligibility` itself:
 * if the exemption rules ever change, these fail rather than quietly lying.
 */

import { describe, expect, it } from "vitest";

import {
    summarizeChannelPreference,
    summarizeRecipientPreferences,
} from "@/lib/communications/v2/recipientPreferenceSummary";
import { emptyPreferenceProfile, PREFERENCE_FIELD_DEFS, EDITABLE_PREFERENCE_FIELDS } from "@/lib/communications/v2/communicationPreferenceLabels";
import { evaluateEligibility } from "@/lib/communications/eligibility/evaluateEligibility";
import type { PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";

const profile = (over: Partial<PersonPreferenceProfile> = {}): PersonPreferenceProfile => ({
    ...emptyPreferenceProfile(),
    ...over,
});

describe("the operator model is truthful", () => {
    it("exposes all three Email categories, not one misleading control", () => {
        const email = PREFERENCE_FIELD_DEFS.filter((d) => d.channel === "email").map((d) => d.category);
        expect(email).toEqual(["email_transactional", "email_operational", "email_marketing"]);
    });

    it("does not offer a switch for a category the platform exempts", () => {
        // The old "Email messages" control edited `email_transactional`, which is opt-out
        // exempt — switching it off suppressed nothing.
        const editable = EDITABLE_PREFERENCE_FIELDS.map((d) => d.category);
        expect(editable).not.toContain("email_transactional");
        expect(editable).not.toContain("sms_transactional");
        expect(editable).toContain("email_operational");
        expect(editable).toContain("email_marketing");
    });

    it("labels each control with what it actually governs", () => {
        const byKey = Object.fromEntries(PREFERENCE_FIELD_DEFS.map((d) => [d.key, d]));
        expect(byKey.email_transactional).toMatchObject({ label: "Essential email", control: "always_allowed" });
        expect(byKey.email_operational).toMatchObject({ label: "Routine email", control: "opt_out" });
        expect(byKey.email_marketing).toMatchObject({ label: "Marketing & promotional email", control: "opt_in" });
    });

    it("the mapping to the underlying categories is unchanged", () => {
        // The UI got new words; the authority did not get new semantics.
        expect(PREFERENCE_FIELD_DEFS.map((d) => `${d.key}→${d.category}`).every((s) => {
            const [k, c] = s.split("→");
            return k === c;
        })).toBe(true);
    });
});

describe("the block reason an operator sees", () => {
    it("reports routine email opted out — and says essential still sends", () => {
        const s = summarizeChannelPreference("email", profile({ email_operational: "opted_out" }));
        expect(s).toMatchObject({ state: "blocked", routineBlocked: true });
        expect(s.reason).toBe("Routine email is opted out. Only essential email will send.");
    });

    it("reports marketing needing an opt-in WITHOUT calling the channel blocked", () => {
        const s = summarizeChannelPreference("email", profile());
        expect(s).toMatchObject({ state: "restricted", routineBlocked: false, marketingRequiresOptIn: true });
        expect(s.reason).toBe("Marketing email requires opt-in. Essential and routine email will send.");
    });

    it("reports a fully available channel", () => {
        const s = summarizeChannelPreference("email", profile({ email_marketing: "opted_in" }));
        expect(s).toMatchObject({ state: "available" });
        expect(s.reason).toBe("Email available.");
    });

    it("reports a recipient STOP as total SMS suppression, not merely routine", () => {
        // STOP writes all three SMS categories. Reporting "routine blocked" would
        // understate a compliance state.
        const stopped = profile({ sms_transactional: "opted_out", sms_operational: "opted_out", sms_marketing: "opted_out" });
        const s = summarizeChannelPreference("sms", stopped);
        expect(s.state).toBe("blocked");
        expect(s.reason).toBe("Recipient texted STOP. All text messages are blocked until they text START.");
    });

    it("an unknown recipient is not reported as blocked", () => {
        expect(summarizeChannelPreference("email", null).state).toBe("restricted");
    });

    it("counts only genuine blocks, so the badge stays meaningful", () => {
        // Marketing-needs-opt-in is the resting state of nearly every recipient. Counting
        // it would light the badge permanently, and a permanently lit badge is ignored.
        expect(summarizeRecipientPreferences(profile()).blockedChannelCount).toBe(0);
        expect(
            summarizeRecipientPreferences(profile({ email_operational: "opted_out" })).blockedChannelCount,
        ).toBe(1);
        expect(
            summarizeRecipientPreferences(
                profile({ email_operational: "opted_out", sms_operational: "opted_out" }),
            ).blockedChannelCount,
        ).toBe(2);
    });
});

describe("the summary agrees with the evaluator, category by category", () => {
    const base = {
        audience: "external" as const,
        channel: "email" as const,
        recipientPersonId: "33333333-3333-4333-8333-333333333333",
        channelUsable: true,
        suppressed: false,
        identityUsable: true,
        quietHours: null,
        unresolvedInboundStopHold: false,
        nowIso: "2026-08-19T12:00:00.000Z",
    };

    it("ESSENTIAL: an opt-out does not block — which is why no switch is offered", () => {
        const decision = evaluateEligibility({ ...base, category: "transactional", preferenceState: "opted_out" });
        expect(decision.allowed).toBe(true);
        // …and the operator model agrees by not presenting it as editable.
        expect(EDITABLE_PREFERENCE_FIELDS.some((d) => d.category === "email_transactional")).toBe(false);
    });

    it("ROUTINE: an opt-out DOES block — which is why the summary reports it", () => {
        const decision = evaluateEligibility({ ...base, category: "operational", preferenceState: "opted_out" });
        expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("OPTED_OUT");
        expect(summarizeChannelPreference("email", profile({ email_operational: "opted_out" })).routineBlocked).toBe(true);
    });

    it("MARKETING: unset blocks for want of an opt-in, and opted_in allows", () => {
        expect(evaluateEligibility({ ...base, category: "marketing", preferenceState: "unset" })).toMatchObject({
            allowed: false,
            code: "MARKETING_REQUIRES_OPT_IN",
        });
        expect(evaluateEligibility({ ...base, category: "marketing", preferenceState: "opted_in" }).allowed).toBe(true);
        expect(summarizeChannelPreference("email", profile()).marketingRequiresOptIn).toBe(true);
        expect(summarizeChannelPreference("email", profile({ email_marketing: "opted_in" })).marketingRequiresOptIn).toBe(false);
    });

    it("MARKETING after a recipient unsubscribes: opted_out still blocks", () => {
        expect(evaluateEligibility({ ...base, category: "marketing", preferenceState: "opted_out" })).toMatchObject({
            allowed: false,
        });
    });
});
