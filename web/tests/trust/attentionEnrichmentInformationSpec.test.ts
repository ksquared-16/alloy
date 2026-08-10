/**
 * Phase 2.8 Gate A — the capability's Information Package spec.
 *
 * The ungoverned path assembled six fields inline at the call site and handed
 * them to a private redactor. This spec replaces that with a declaration of what
 * reasoning may see.
 *
 * **The headline fact these tests pin: the full spec can never build a package.**
 * Both prose elements declare `person_name`, which this platform cannot detect
 * deterministically, so `buildInformationPackage` refuses — earlier even than the
 * privacy engine, at package construction. Provider-backed enrichment therefore
 * refuses in production, by design (D-43 / D-46).
 *
 * So the package-level mechanics (declared-facts-only, adversarial exclusion,
 * provenance) are proven against a STRUCTURED-ONLY projection of the same spec.
 * That is not a workaround: it isolates the refusal to its real cause — the
 * prose — and proves the spec is otherwise sound, which is what makes the
 * refusal meaningful rather than incidental.
 */

import { describe, expect, it } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import {
    ATTENTION_ENRICHMENT_DECLARED_ELEMENT_KEYS,
    ATTENTION_ENRICHMENT_SPEC_KEY,
    attentionEnrichmentInformationSpec,
} from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import { buildInformationPackage } from "@/lib/trust/information/informationPackage";
import { isSupportedTextMinimizationClass } from "@/lib/privacy/minimizeTextContent";

const SUGGESTION: AttentionSuggestionV1 = {
    version: 1,
    agent_key: "needs_attention_suggestion",
    suggestion_id: "sug-1",
    target: { entity_type: "opportunities", entity_id: "opp-1" },
    source: {
        resolver: "opportunity_attention",
        resolver_version: 1,
        primary_reason_code: "tour_no_followup",
        reason_codes: ["tour_no_followup"],
    },
    next_action: { key: "send_followup", label: "Send follow-up", action_family: "communication", confidence: "deterministic" },
    reasoning: { summary: "Tour completed 12 days ago with no follow-up.", factors: [] },
    suggested_content: {
        channel: "email",
        template_key: "tour_followup_v1",
        body: "Hi Dana, following up on your tour — reach us at info@example.org or 555-0100.",
        variables: {},
    },
    generated_at_iso: "2026-08-10T00:00:00.000Z",
};

/** The same spec minus the prose, used to prove everything the refusal would otherwise hide. */
const STRUCTURED_ONLY = {
    ...attentionEnrichmentInformationSpec,
    elements: attentionEnrichmentInformationSpec.elements.filter((e) => e.required_text_minimizers === undefined),
};

function buildFull(source: AttentionSuggestionV1 = SUGGESTION) {
    return buildInformationPackage({ spec: attentionEnrichmentInformationSpec, source, source_refs: { org_id: "org-1" } });
}

function buildStructured(source: AttentionSuggestionV1 = SUGGESTION) {
    return buildInformationPackage({ spec: STRUCTURED_ONLY, source, source_refs: { org_id: "org-1" } });
}

describe("P28A-1 — the declared surface", () => {
    it("declares exactly six semantic facts", () => {
        expect(ATTENTION_ENRICHMENT_DECLARED_ELEMENT_KEYS).toEqual([
            "attention_reason_code",
            "recommended_action_key",
            "communication_template_key",
            "communication_channel",
            "deterministic_reasoning_text",
            "draft_message_text",
        ]);
    });

    it("semantic keys are Trust identities, not storage paths", () => {
        for (const el of attentionEnrichmentInformationSpec.elements) {
            expect(el.key).not.toBe(el.source_field);
            expect(el.key).not.toContain(".");
        }
    });

    it("every element is scalar-valued — no selector can return a row", () => {
        for (const el of attentionEnrichmentInformationSpec.elements) {
            const v = el.select(SUGGESTION);
            expect(["string", "number", "boolean", "object"]).toContain(typeof v);
            if (typeof v === "object") expect(v).toBeNull();
        }
    });
});

describe("P28A-2 — nothing undeclared can enter", () => {
    it("only declared keys appear in a built package", () => {
        const built = buildStructured();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(Object.keys(built.package.elements).sort()).toEqual(
            STRUCTURED_ONLY.elements.map((e) => e.key).sort(),
        );
    });

    it("adversarial extra source fields cannot cross the boundary", () => {
        const hostile = {
            ...SUGGESTION,
            ssn: "123-45-6789",
            parent_email: "leak@example.com",
            internal_notes: "do not send",
        } as AttentionSuggestionV1;

        const built = buildStructured(hostile);
        expect(built.ok).toBe(true);
        if (!built.ok) return;

        const blob = JSON.stringify(built.package);
        expect(blob).not.toContain("123-45-6789");
        expect(blob).not.toContain("leak@example.com");
        expect(blob).not.toContain("do not send");
        // Nothing reads them, so there is no path by which they could arrive.
        expect(Object.keys(built.package.elements)).toHaveLength(STRUCTURED_ONLY.elements.length);
    });

    it("provenance records field NAMES, never values", () => {
        const built = buildStructured();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const prov = JSON.stringify(built.package.provenance);
        expect(prov).toContain("suggested_content.template_key");
        expect(prov).not.toContain("Hi Dana");
        expect(prov).not.toContain("info@example.org");
    });

    it("spec identity is pinned for replay, and the hash is deterministic", () => {
        const a = buildStructured();
        const b = buildStructured();
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(a.package.spec_key).toBe(ATTENTION_ENRICHMENT_SPEC_KEY);
        expect(a.package.spec_version).toBe("1.0.0");
        expect(a.package.decision_class_key).toBe("attention_suggestion_enrichment");
        expect(a.package.content_hash).toBe(b.package.content_hash);
    });
});

describe("P28A-3 — the prose refuses rather than overclaiming (D-43 / D-46)", () => {
    it("both free-text elements declare person_name", () => {
        for (const key of ["deterministic_reasoning_text", "draft_message_text"]) {
            const el = attentionEnrichmentInformationSpec.elements.find((e) => e.key === key)!;
            expect(el.required_text_minimizers).toContain("person_name");
        }
    });

    it("person_name is genuinely undetectable here — the cause of the refusal", () => {
        expect(isSupportedTextMinimizationClass("person_name")).toBe(false);
        expect(isSupportedTextMinimizationClass("email")).toBe(true);
        expect(isSupportedTextMinimizationClass("phone")).toBe(true);
    });

    it("THE FULL SPEC REFUSES — provider-backed enrichment cannot reach a provider", () => {
        const built = buildFull();
        expect(built.ok).toBe(false);
        if (built.ok) return;
        expect(built.refusal_code).toBe("INFO_PACKAGE_UNSUPPORTED_MINIMIZER");
    });

    it("the refusal names the class and never echoes the prose it refused", () => {
        const built = buildFull();
        expect(built.ok).toBe(false);
        if (built.ok) return;
        expect(built.detail).toContain("person_name");
        expect(built.detail).not.toContain("Hi Dana");
        expect(built.detail).not.toContain("Tour completed 12 days ago");
    });

    it("the refusal is caused by the prose alone — the same spec without it builds cleanly", () => {
        expect(buildFull().ok).toBe(false);
        expect(buildStructured().ok).toBe(true);
    });
});
