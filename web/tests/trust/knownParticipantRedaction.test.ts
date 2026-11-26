/**
 * Phase 2.9a — deterministic known-participant name redaction.
 *
 * Proves the primitive removes every roster name it claims to, preserves the
 * prose around it, refuses rather than no-ops when it has nothing to work with,
 * and never lets a removed name survive inside the evidence that proves it was
 * removed.
 *
 * Also proves what it is NOT: it does not detect names, so `person_name` remains
 * an unsupported text-minimization class, and no policy registered before this
 * slice changes behaviour.
 */

import { describe, expect, it } from "vitest";

import {
    MAX_PARTICIPANT_REDACTABLE_TEXT_LENGTH,
    MIN_PARTICIPANT_TOKEN_LENGTH,
    PARTICIPANT_PLACEHOLDER,
    expandParticipantTokens,
    redactKnownParticipants,
} from "@/lib/privacy/redactKnownParticipants";
import {
    UNSUPPORTED_TEXT_MINIMIZATION_CLASSES,
    isSupportedTextMinimizationClass,
} from "@/lib/privacy/minimizeTextContent";
import { classifyElements, type InformationClass } from "@/lib/trust/classification/informationClasses";
import {
    ATTENTION_SUGGESTION_MINIMIZATION_V1,
    PROCESSING_IDENTITY_MINIMIZATION_V1,
    PROCESSING_SOURCE_MINIMIZATION_V1,
} from "@/lib/trust/platform/platformPrivacyPolicies";
import { transformForReasoning, type PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";

const ROSTER = ["Maya Kurzman", "Kelly Kurzman"] as const;

function policy(over: Partial<PrivacyPolicyV1> = {}): PrivacyPolicyV1 {
    return { key: "test_participant_policy_v1", pii_mode: "strict", prohibited_classes: [], ...over };
}

/**
 * Runs one textual element through the REAL engine path.
 *
 * `inbound_text` deliberately matches no key-name rule in `redactObjectForAi`,
 * so what this observes is the content-aware path rather than the structural
 * one. A key ending in `body`/`note` would be destroyed by the key-name rule and
 * would prove nothing about this module.
 */
function transformText(
    text: string,
    participants: readonly string[] | undefined,
    over: Partial<PrivacyPolicyV1> = {},
    cls: InformationClass = "operational",
) {
    return transformForReasoning({
        classification: classifyElements({ inbound_text: text }, { inbound_text: cls }),
        policy: policy({ requires_participant_redaction: true, ...over }),
        knowledge: [],
        participants,
    });
}

describe("known-participant redaction — what it removes", () => {
    it("removes a full name, a first name and a last name from ordinary prose", () => {
        const r = redactKnownParticipants(
            "Maya Kurzman is out today. Maya has a fever and Kurzman will collect her.",
            ROSTER,
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).not.toMatch(/Maya/i);
        expect(r.text).not.toMatch(/Kurzman/i);
        expect(r.text).toContain("has a fever");
        expect(r.text).toContain("is out today");
    });

    it("matches case-insensitively and keeps a possessive suffix", () => {
        const r = redactKnownParticipants("maya's form is missing", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(`${PARTICIPANT_PLACEHOLDER}'s form is missing`);
    });

    it("consumes a full name as ONE span rather than two part-matches", () => {
        const r = redactKnownParticipants("Maya Kurzman", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(PARTICIPANT_PLACEHOLDER);
        expect(r.record.replaced_count).toBe(1);
    });

    it("does not match a roster token inside a longer word", () => {
        // The boundary rule is the difference between redacting a participant
        // and mangling unrelated vocabulary.
        const r = redactKnownParticipants("Anastasia ate a banana", ["Ana"]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("Anastasia ate a banana");
        expect(r.record.replaced_count).toBe(0);
    });

    it("honours letter boundaries for accented names, which \\b cannot", () => {
        const r = redactKnownParticipants("Renée is bringing José today", ["Renée", "José"]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).not.toMatch(/Renée|José/);
        expect(r.text).toContain("is bringing");
    });

    it("is deterministic — identical input and roster produce identical output", () => {
        const text = "Maya and Kelly Kurzman are both out";
        const a = redactKnownParticipants(text, ROSTER);
        const b = redactKnownParticipants(text, ROSTER);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

describe("known-participant redaction — the error asymmetry is deliberate", () => {
    it("OVER-redacts a roster token that collides with an ordinary word", () => {
        // Pinned, not accidental. A participant named Will means the word "will"
        // is removed, damaging the sentence. Excluding it via a stop-list would
        // leak every participant actually named Will, so over-redaction is the
        // chosen failure direction.
        const r = redactKnownParticipants("I will call you tomorrow", ["Will Parker"]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(`I ${PARTICIPANT_PLACEHOLDER} call you tomorrow`);
    });

    it("D-86: leaves health semantics intact — identity is removed, meaning is not", () => {
        // Pinned so no later reader mistakes this primitive for prose
        // sanitization. The name goes; "has a fever" does not. A capability
        // wanting to send this text to a provider still owes its own
        // admissibility proof.
        const r = redactKnownParticipants("Maya has a fever, keeping her home today", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).not.toMatch(/Maya/i);
        expect(r.text).toContain("has a fever");
    });

    it("D-86: leaves a name that is NOT on the roster — the residual is real and unhidden", () => {
        // This is the honest limit of the primitive and the reason it is not a
        // person-name detector. A third party named in prose survives.
        const r = redactKnownParticipants("my sister Ana will collect her", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toContain("Ana");
    });
});

describe("known-participant redaction — it is not tokenization", () => {
    it("renders two different participants indistinguishably", () => {
        const r = redactKnownParticipants("Maya and Kelly", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(`${PARTICIPANT_PLACEHOLDER} and ${PARTICIPANT_PLACEHOLDER}`);
    });

    it("uses a placeholder carrying no digit, index or recoverable material", () => {
        expect(PARTICIPANT_PLACEHOLDER).not.toMatch(/\d/);
        const r = redactKnownParticipants("Maya Kurzman and Kelly Kurzman", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Every occurrence is byte-identical, so no ordering or identity can be
        // recovered from the output.
        expect(new Set(r.text.match(/\[name removed\]/g)).size).toBe(1);
    });

    it("never carries a roster entry or a matched span into the evidence", () => {
        const r = redactKnownParticipants("Maya Kurzman is out", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const serialized = JSON.stringify(r.record);
        expect(serialized).not.toMatch(/Maya/i);
        expect(serialized).not.toMatch(/Kurzman/i);
        expect(r.record).toEqual({
            redaction_kind: "person_name",
            replaced_count: 1,
            roster_token_count: expandParticipantTokens(ROSTER).length,
        });
    });
});

describe("known-participant redaction — refusals fail closed", () => {
    it("refuses an empty roster rather than admitting text unredacted", () => {
        const r = redactKnownParticipants("Maya is out", []);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("PARTICIPANT_REDACTION_EMPTY_ROSTER");
    });

    it("refuses a roster that expands to nothing usable", () => {
        const r = redactKnownParticipants("Maya is out", ["  ", "A", "!"]);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("PARTICIPANT_REDACTION_EMPTY_ROSTER");
    });

    it("refuses oversized input rather than truncating it", () => {
        const r = redactKnownParticipants("x".repeat(MAX_PARTICIPANT_REDACTABLE_TEXT_LENGTH + 1), ROSTER);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("PARTICIPANT_REDACTION_INPUT_TOO_LARGE");
    });

    it("never echoes the input or the roster in a refusal detail", () => {
        const r = redactKnownParticipants("Maya Kurzman is out", []);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.detail).not.toMatch(/Maya|Kurzman/i);
    });

    it("drops roster PARTS below the minimum length while keeping the full name", () => {
        // "A B" is a usable exact string; its single-letter parts are not. A
        // one-character token would match a letter wherever a boundary allows
        // and redact arbitrary text without protecting anything the full name
        // does not already cover.
        expect(MIN_PARTICIPANT_TOKEN_LENGTH).toBe(2);
        expect(expandParticipantTokens(["A B"])).toEqual(["A B"]);
        expect(expandParticipantTokens(["A"])).toEqual([]);
    });
});

describe("privacy engine integration", () => {
    it("refuses the WHOLE transform when the policy requires redaction and no roster arrives", () => {
        const r = transformText("Maya is out today", undefined);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("PARTICIPANT_REDACTION_EMPTY_ROSTER");
    });

    it("refuses before examining any element, so the refusal cannot depend on the data", () => {
        // No string element at all: the refusal must still fire, because the
        // policy is wrong regardless of which message arrived.
        const r = transformForReasoning({
            classification: classifyElements({ count: 3 }, { count: "operational" }),
            policy: policy({ requires_participant_redaction: true }),
            knowledge: [],
            participants: [],
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("PARTICIPANT_REDACTION_EMPTY_ROSTER");
        expect(r.transformations).toEqual([]);
    });

    it("removes an address containing a participant name WITHOUT leaving name fragments", () => {
        // Order control. Content minimization runs first, so the whole address
        // goes; if participant redaction ran first the local part would become
        // placeholders and the domain would survive.
        const r = transformText("write to maya.kurzman@example.com please", ROSTER, {
            required_text_minimizers: ["email", "phone"],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const text = String(r.context.transformed.inbound_text);
        expect(text).not.toMatch(/example\.com/);
        expect(text).not.toMatch(/kurzman/i);
        expect(text).toContain("[email removed]");
        expect(text).toContain("please");
    });

    it("reports the pass in the context, counts only", () => {
        const r = transformText("Maya is out", ROSTER);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.context.participant_redactions).toEqual([
            {
                redaction_kind: "person_name",
                replaced_count: 1,
                roster_token_count: expandParticipantTokens(ROSTER).length,
            },
        ]);
        expect(JSON.stringify(r.context.participant_redactions)).not.toMatch(/Maya|Kurzman/i);
    });

    it("distinguishes 'ran and matched nothing' from 'did not run'", () => {
        const ran = transformText("nothing identifying here", ROSTER);
        expect(ran.ok).toBe(true);
        if (!ran.ok) return;
        expect(ran.context.participant_redactions).toHaveLength(1);
        expect(ran.context.participant_redactions[0]!.replaced_count).toBe(0);

        const notRun = transformForReasoning({
            classification: classifyElements({ inbound_text: "Maya is out" }, { inbound_text: "operational" }),
            policy: policy(),
            knowledge: [],
            participants: ROSTER,
        });
        expect(notRun.ok).toBe(true);
        if (!notRun.ok) return;
        expect(notRun.context.participant_redactions).toEqual([]);
    });

    it("ignores a roster when the policy does not require redaction", () => {
        // The policy is the authority. Passing a roster must not opt a policy in.
        const r = transformForReasoning({
            classification: classifyElements({ inbound_text: "Maya is out" }, { inbound_text: "operational" }),
            policy: policy(),
            knowledge: [],
            participants: ROSTER,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(String(r.context.transformed.inbound_text)).toContain("Maya");
    });
});

describe("this slice is dormant and opens no back door", () => {
    it("leaves person_name an UNSUPPORTED text-minimization class", () => {
        expect(isSupportedTextMinimizationClass("person_name")).toBe(false);
        expect(UNSUPPORTED_TEXT_MINIMIZATION_CLASSES).toContain("person_name");
    });

    it("opts no previously registered policy into participant redaction", () => {
        for (const p of [
            ATTENTION_SUGGESTION_MINIMIZATION_V1,
            PROCESSING_SOURCE_MINIMIZATION_V1,
            PROCESSING_IDENTITY_MINIMIZATION_V1,
        ]) {
            expect(p.requires_participant_redaction ?? false).toBe(false);
        }
    });

    it("changes nothing for a policy that does not opt in", () => {
        const r = transformForReasoning({
            classification: classifyElements({ inbound_text: "Maya is out" }, { inbound_text: "operational" }),
            policy: ATTENTION_SUGGESTION_MINIMIZATION_V1,
            knowledge: [],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.context.participant_redactions).toEqual([]);
    });
});
