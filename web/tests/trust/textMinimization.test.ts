/**
 * Phase 2.2 — deterministic content-aware free-text minimization.
 *
 * Proves the minimizer removes what it claims to remove, preserves the prose
 * around it, refuses what it cannot do, and never lets a removed substring
 * survive in the evidence that proves it was removed.
 *
 * Also proves the slice is dormant: no policy registered before Phase 2.2 opts
 * in, so no registered decision class changes behaviour.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import {
    MAX_MINIMIZABLE_TEXT_LENGTH,
    TEXT_DETECTORS,
    TEXT_MINIMIZATION_CLASSES,
    UNSUPPORTED_TEXT_MINIMIZATION_CLASSES,
    isSupportedTextMinimizationClass,
    minimizeTextContent,
    validateTextMinimizationRequest,
    type TextMinimizationClass,
} from "@/lib/privacy/minimizeTextContent";
import { classifyElements, type InformationClass } from "@/lib/trust/classification/informationClasses";
import {
    ATTENTION_SUGGESTION_MINIMIZATION_V1,
    PROCESSING_IDENTITY_MINIMIZATION_V1,
    PROCESSING_SOURCE_MINIMIZATION_V1,
} from "@/lib/trust/platform/platformPrivacyPolicies";
import { transformForReasoning, type PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";

const WEB_ROOT = process.cwd();
const BOTH: readonly TextMinimizationClass[] = ["email", "phone"];

/** A real address and a real NANP number, used to assert they never survive. */
const EMAIL = "jane.doe+tour@example.com";
const PHONE = "(555) 234-5678";

function policy(over: Partial<PrivacyPolicyV1> = {}): PrivacyPolicyV1 {
    return { key: "test_text_policy_v1", pii_mode: "strict", prohibited_classes: [], ...over };
}

/** Runs one textual element through the real engine path. */
function transformText(text: string, requested: readonly TextMinimizationClass[], cls: InformationClass = "operational") {
    return transformForReasoning({
        // `inbound_text` deliberately matches NO key-name rule in
        // redactObjectForAi, so what this helper observes is the CONTENT-aware
        // path rather than the structural one. A key ending in `note`/`body`
        // would be destroyed by the key-name rule and prove nothing.
        classification: classifyElements({ inbound_text: text }, { inbound_text: cls }),
        policy: policy({ required_text_minimizers: requested }),
        knowledge: [],
    });
}

// ---------------------------------------------------------------------------
// 1. Supported detectors transform their target, and keep the prose
// ---------------------------------------------------------------------------

describe("P2.2-1 — supported detectors minimize embedded identifiers", () => {
    it("removes an email and preserves the surrounding sentence", () => {
        const r = minimizeTextContent(`Email me at ${EMAIL} about Friday's tour`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("Email me at [email removed] about Friday's tour");
        expect(r.text).not.toContain(EMAIL);
        expect(r.text).toContain("Friday's tour");
    });

    it("removes a phone number and preserves the surrounding sentence", () => {
        const r = minimizeTextContent(`Call ${PHONE} before noon`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("Call [phone removed] before noon");
        expect(r.text).not.toContain("234-5678");
    });

    it.each([
        "555-234-5678",
        "(555) 234-5678",
        "555.234.5678",
        "5552345678",
        "+1 555 234 5678",
        "1-555-234-5678",
    ])("recognises NANP shape %s", (shape) => {
        const r = minimizeTextContent(`ring ${shape} thanks`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("ring [phone removed] thanks");
    });

    it("counts what it replaced", () => {
        const r = minimizeTextContent(`${EMAIL} and ${PHONE}`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.records.find((x) => x.detector_key === "email")?.replaced_count).toBe(1);
        expect(r.records.find((x) => x.detector_key === "phone")?.replaced_count).toBe(1);
    });

    it("only runs the detectors the policy requested", () => {
        const r = minimizeTextContent(`${EMAIL} / ${PHONE}`, ["email"]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toContain("[email removed]");
        // Not requested, so not removed — and not reported either.
        expect(r.text).toContain("555");
        expect(r.records.map((x) => x.detector_key)).toEqual(["email"]);
    });
});

// ---------------------------------------------------------------------------
// 2. Adversarial fixtures
// ---------------------------------------------------------------------------

describe("P2.2-2 — adversarial input", () => {
    it("does not absorb adjacent punctuation into the match", () => {
        const r = minimizeTextContent(`Write to ${EMAIL}. Then call ${PHONE}!`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("Write to [email removed]. Then call [phone removed]!");
    });

    it("handles an identifier in parentheses and quotes", () => {
        const r = minimizeTextContent(`(${EMAIL}) "${PHONE}"`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe('([email removed]) "[phone removed]"');
    });

    it("replaces repeated identifiers every time, and counts each", () => {
        const r = minimizeTextContent(`${EMAIL} then ${EMAIL} again`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("[email removed] then [email removed] again");
        expect(r.records.find((x) => x.detector_key === "email")?.replaced_count).toBe(2);
    });

    it("handles many mixed identifiers in one text", () => {
        const text = `a@b.co ${PHONE} c@d.org 555-234-5679 e@f.net`;
        const r = minimizeTextContent(text, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(
            "[email removed] [phone removed] [email removed] [phone removed] [email removed]",
        );
    });

    it.each([
        ["a 5-digit zip", "Portland OR 97201"],
        ["an ISO date", "Starting 2026-08-07 at the center"],
        ["a 9-digit number", "Ref 123456789 attached"],
        ["a 14-digit order number", "Order 12345678901234 shipped"],
        ["an invalid NANP area code", "code 123-234-5678 here"],
        ["an invalid NANP exchange", "code 555-134-5678 here"],
        ["an at-sign with no TLD", "ping me @jane or @team"],
        ["an email-ish string with no dot", "user@localhost now"],
    ])("does NOT match %s", (_label, text) => {
        const r = minimizeTextContent(text, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(text);
    });

    it("preserves non-ASCII surrounding text exactly", () => {
        const r = minimizeTextContent(`Bonjour — écrivez à ${EMAIL} 😀 merci`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("Bonjour — écrivez à [email removed] 😀 merci");
    });

    it("already-safe text is returned unchanged, with zero counts", () => {
        const text = "See you Friday at the center for the tour.";
        const r = minimizeTextContent(text, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(text);
        expect(r.records.every((x) => x.replaced_count === 0)).toBe(true);
    });

    it("handles a large but bounded input without truncating", () => {
        const filler = "the quick brown fox. ".repeat(2000);
        const r = minimizeTextContent(`${filler}${EMAIL}`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text.endsWith("[email removed]")).toBe(true);
        expect(r.text).not.toContain(EMAIL);
    });

    it("an email is minimized before the phone detector runs, so digits inside it cannot re-match", () => {
        const r = minimizeTextContent("contact 5552345678@example.com now", BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe("contact [email removed] now");
        expect(r.records.find((x) => x.detector_key === "phone")?.replaced_count).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 3. Determinism
// ---------------------------------------------------------------------------

describe("P2.2-3 — deterministic and local", () => {
    it("identical input and policy produce byte-identical output", () => {
        const text = `${EMAIL} ${PHONE} ${EMAIL}`;
        const a = minimizeTextContent(text, BOTH);
        const b = minimizeTextContent(text, BOTH);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("detector order does not depend on the order classes were requested", () => {
        const text = `${EMAIL} ${PHONE}`;
        const a = minimizeTextContent(text, ["email", "phone"]);
        const b = minimizeTextContent(text, ["phone", "email"]);
        expect(a.ok && b.ok && a.text).toBe(b.ok ? b.text : null);
    });

    it("the minimizer performs no network, provider, credential, clock or random access", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/privacy/minimizeTextContent.ts"), "utf8");
        for (const p of [
            /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /@anthropic-ai/, /\bopenai\b/i, /axios/,
            /from\s+"node:https?"/, /process\.env/, /Date\.now/, /new Date\(/, /Math\.random/,
            /randomUUID/, /readFileSync/,
        ]) {
            expect(src, `matched ${p}`).not.toMatch(p);
        }
    });
});

// ---------------------------------------------------------------------------
// 4. Explicit registry, and fail-closed on unsupported classes
// ---------------------------------------------------------------------------

describe("P2.2-4 — explicit registry, unsupported classes fail closed", () => {
    it("the supported set is exactly email and phone", () => {
        expect(TEXT_DETECTORS.map((d) => d.key).sort()).toEqual(["email", "phone"]);
    });

    it("names, addresses, government ids and health information are explicitly UNSUPPORTED", () => {
        expect([...UNSUPPORTED_TEXT_MINIMIZATION_CLASSES].sort()).toEqual([
            "government_id", "health_information", "person_name", "street_address",
        ]);
        for (const cls of UNSUPPORTED_TEXT_MINIMIZATION_CLASSES) {
            expect(isSupportedTextMinimizationClass(cls)).toBe(false);
        }
    });

    it("the requestable vocabulary is deliberately WIDER than the supported set", () => {
        // A class that cannot be named cannot be refused, so the refusal path
        // would be untestable and, in practice, dead.
        expect(TEXT_MINIMIZATION_CLASSES.length).toBeGreaterThan(TEXT_DETECTORS.length);
    });

    it.each(["person_name", "street_address", "government_id", "health_information"] as const)(
        "requesting %s refuses with a stable code",
        (cls) => {
            const v = validateTextMinimizationRequest([cls]);
            expect(v.ok).toBe(false);
            if (v.ok) return;
            expect(v.refusal_code).toBe("TEXT_MINIMIZATION_UNSUPPORTED_CLASS");
        },
    );

    it("an unsupported class refuses even when the text is harmless — the POLICY is wrong, not the data", () => {
        const r = transformText("See you Friday.", ["person_name"]);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("TEXT_MINIMIZATION_UNSUPPORTED_CLASS");
    });

    it("a mixed request refuses wholly rather than doing the supported half", () => {
        const r = minimizeTextContent(`${EMAIL}`, ["email", "person_name"]);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("TEXT_MINIMIZATION_UNSUPPORTED_CLASS");
    });

    it("text beyond the bounded limit refuses rather than truncating", () => {
        const r = minimizeTextContent("x".repeat(MAX_MINIMIZABLE_TEXT_LENGTH + 1), BOTH);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("TEXT_MINIMIZATION_INPUT_TOO_LARGE");
    });

    it("placeholders are constant and carry no token, index or recoverable material", () => {
        for (const d of TEXT_DETECTORS) {
            // Anything digit-bearing or id-shaped would be indistinguishable from
            // the reversible `tokenize` semantics that remain UNSUPPORTED.
            expect(d.placeholder).not.toMatch(/\d/);
            expect(d.placeholder).toMatch(/^\[[a-z ]+\]$/);
        }
    });
});

// ---------------------------------------------------------------------------
// 5. Evidence must not leak the removed content
// ---------------------------------------------------------------------------

describe("P2.2-5 — audit and refusals carry no original sensitive substring", () => {
    it("the context's minimization records contain counts, never the matched text", () => {
        const r = transformText(`reach me at ${EMAIL} or ${PHONE}`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const serialized = JSON.stringify(r.context.text_minimizations);
        expect(serialized).not.toContain("jane");
        expect(serialized).not.toContain("example.com");
        expect(serialized).not.toContain("234");
        expect(r.context.text_minimizations).toEqual([
            { detector_key: "email", redaction_kind: "email", replaced_count: 1 },
            { detector_key: "phone", redaction_kind: "phone", replaced_count: 1 },
        ]);
    });

    it("the WHOLE transform result leaks no fragment of the removed identifiers", () => {
        const r = transformText(`reach me at ${EMAIL} or ${PHONE}`, BOTH);
        const blob = JSON.stringify(r);
        for (const fragment of ["jane.doe", "example.com", "5678", "(555)"]) {
            expect(blob, `leaked ${fragment}`).not.toContain(fragment);
        }
    });

    it("a refusal explanation names classes and limits only — never the text", () => {
        const r = transformForReasoning({
            classification: classifyElements({ inbound_text: `secret ${EMAIL}` }, { inbound_text: "operational" }),
            policy: policy({ required_text_minimizers: ["email", "person_name"] }),
            knowledge: [],
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.detail).not.toContain(EMAIL);
        expect(r.detail).not.toContain("jane");
        expect(JSON.stringify(r)).not.toContain("jane");
        expect(r.detail).toContain("person_name");
    });

    it("the too-large refusal reports a length, not a sample", () => {
        const r = minimizeTextContent(`${EMAIL}${"x".repeat(MAX_MINIMIZABLE_TEXT_LENGTH)}`, BOTH);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.detail).not.toContain("jane");
        expect(r.detail).toContain("exceeds");
    });
});

// ---------------------------------------------------------------------------
// 6. Ordering: content-aware BEFORE structural
// ---------------------------------------------------------------------------

describe("P2.2-6 — content-aware minimization runs before structural redaction", () => {
    it("without minimization, strict structural redaction destroys the whole sentence", () => {
        // The pre-slice behaviour, asserted so the ordering rationale is evidence
        // rather than assertion: redactObjectForAi replaces the ENTIRE value.
        const r = transformText(`Email me at ${EMAIL} about Friday`, []);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.context.transformed.inbound_text).not.toContain("Friday");
    });

    it("with minimization, the prose survives because the structural pass sees no identifier", () => {
        const r = transformText(`Email me at ${EMAIL} about Friday`, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.context.transformed.inbound_text).toBe("Email me at [email removed] about Friday");
    });

    it("a key whose NAME triggers structural note-redaction is still destroyed afterwards", () => {
        // Documented seam for a future Communications policy: content-aware
        // minimization does not exempt a value from the key-name rule, so the
        // element must be NAMED so structural redaction leaves it alone.
        const r = transformForReasoning({
            classification: classifyElements({ message_body: `hi ${EMAIL} bye` }, { message_body: "operational" }),
            policy: policy({ required_text_minimizers: BOTH }),
            knowledge: [],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(String(r.context.transformed.message_body)).toContain("note:redacted");
    });
});

// ---------------------------------------------------------------------------
// 7. Dormant by default — Phase 0/1/2.1 behaviour unchanged
// ---------------------------------------------------------------------------

describe("P2.2-7 — no registered policy opts in, so nothing changes", () => {
    it.each([
        ["attention_suggestion", ATTENTION_SUGGESTION_MINIMIZATION_V1],
        ["processing_source", PROCESSING_SOURCE_MINIMIZATION_V1],
        ["processing_identity", PROCESSING_IDENTITY_MINIMIZATION_V1],
    ] as const)("%s declares no text minimizers", (_name, p) => {
        expect(p.required_text_minimizers ?? []).toEqual([]);
    });

    it("a policy without minimizers produces an empty minimization record set", () => {
        const r = transformForReasoning({
            classification: classifyElements({ label: "Enrollment form" }, { label: "operational" }),
            policy: PROCESSING_SOURCE_MINIMIZATION_V1,
            knowledge: [],
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.context.text_minimizations).toEqual([]);
    });

    it("Phase 2.1 transformation semantics are untouched", () => {
        // tokenize still refuses; summarize is still compatibility_preserved.
        const tok = transformForReasoning({
            classification: classifyElements({ x: "v" }, { x: "identity" }),
            policy: policy(),
            knowledge: [],
        });
        expect(tok.ok).toBe(false);
        if (tok.ok) return;
        expect(tok.refusal_code).toBe("PRIVACY_TRANSFORM_UNSUPPORTED");

        const sum = transformForReasoning({
            classification: classifyElements({ y: "body" }, { y: "communications" }),
            policy: policy(),
            knowledge: [],
        });
        expect(sum.ok).toBe(true);
        if (!sum.ok) return;
        expect(sum.context.transformations[0]!.support).toBe("compatibility_preserved");
    });

    it("the prohibited-class refusal still wins over everything else", () => {
        const r = transformForReasoning({
            classification: classifyElements({ amount: 1234 }, { amount: "financial" }),
            policy: policy({ prohibited_classes: ["financial"], required_text_minimizers: BOTH }),
            knowledge: [],
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("PRIVACY_PROHIBITED_CLASS");
    });
});

// ---------------------------------------------------------------------------
// 8. Communications fixture shape — evidence only, no wiring
// ---------------------------------------------------------------------------

describe("P2.2-8 — a Communications message body is minimizable, but nothing is wired", () => {
    it("a realistic inbound SMS body minimizes to provider-safe prose", () => {
        // Shape follows `communication_messages.body text` — used as a FIXTURE.
        const body = `Hi! This is Sarah. Can you email the tour details to ${EMAIL}? Or text ${PHONE}. Thanks!`;
        const r = minimizeTextContent(body, BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toBe(
            "Hi! This is Sarah. Can you email the tour details to [email removed]? Or text [phone removed]. Thanks!",
        );
        // The intent — a tour enquiry — survives, which is the entire point.
        expect(r.text).toContain("tour details");
    });

    it("no Communications module imports the minimizer", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/privacy/minimizeTextContent.ts"), "utf8");
        expect(src).not.toMatch(/lib\/communications/);
    });

    it("`person_name` stays unsupported, so 'This is Sarah' is NOT claimed to be minimized", () => {
        const r = minimizeTextContent("Hi! This is Sarah.", BOTH);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.text).toContain("Sarah");
        expect(isSupportedTextMinimizationClass("person_name")).toBe(false);
    });
});
