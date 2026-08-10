/**
 * Phase 2.8 Gate A — the capability's Information Package spec.
 *
 * v1 of this spec declared the legacy payload's two rendered strings and could
 * never build: both are prose about a family, both needed `person_name`
 * minimized, and this platform detects only email and phone.
 *
 * The refusal was correct; the modelling was the defect. v2 declares the FACTS
 * those strings were rendered from, all closed vocabulary, so the package has a
 * reachable success path with no privacy weakening whatsoever.
 *
 * The v1 refusal control is not deleted — it is inverted into its successor:
 * instead of asserting "this refuses because it carries prose", the suite now
 * asserts "no element carries prose or identity, which is WHY it builds". The
 * cause was legitimately removed, so the control follows the cause.
 */

import { describe, expect, it } from "vitest";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import {
    ATTENTION_ENRICHMENT_DECLARED_ELEMENT_KEYS,
    ATTENTION_ENRICHMENT_EXCLUDED_SOURCE_FIELDS,
    ATTENTION_ENRICHMENT_SPEC_KEY,
    attentionEnrichmentInformationSpec,
} from "@/lib/trust/capabilities/attentionSuggestionEnrichment/informationSpec";
import { buildInformationPackage } from "@/lib/trust/information/informationPackage";
import { isSupportedTextMinimizationClass } from "@/lib/privacy/minimizeTextContent";

const CONTACT_NAME = "Dana Okonkwo";
const ARBITRARY_ACTIVITY_PROSE = "Re: Dana asked about tuition — call back at 555-0100";

const SUGGESTION: AttentionSuggestionV1 = {
    version: 1,
    agent_key: "needs_attention_suggestion",
    suggestion_id: "sug-1",
    target: { entity_type: "opportunities", entity_id: "opp-1" },
    source: {
        resolver: "opportunity_attention",
        resolver_version: 1,
        primary_reason_code: "tour_no_followup",
        reason_codes: ["tour_no_followup", "decision_pending"],
        activity_signal_key: "no_touch_14d",
    },
    next_action: { key: "send_followup", label: "Send follow-up", action_family: "follow_up", confidence: "deterministic" },
    reasoning: {
        // The rendered summary, including the unbounded fallback clause. Present
        // on the source precisely so the tests can prove it does NOT get read.
        summary: `Operational attention: Tour with no follow-up. Last activity: ${ARBITRARY_ACTIVITY_PROSE}.`,
        factors: [
            { code: "tour_no_followup", label: "Tour with no follow-up", severity: "high", sla_tier: "t2" },
            { code: "decision_pending", label: "Decision pending" },
        ],
    },
    suggested_content: {
        channel: "email",
        template_key: "tour_followup_v1",
        body: `Hi ${CONTACT_NAME},\n\nI wanted to follow up on your tour.\n\nThank you,\nYour team`,
        variables: {},
    },
    generated_at_iso: "2026-08-10T00:00:00.000Z",
};

function build(source: AttentionSuggestionV1 = SUGGESTION) {
    return buildInformationPackage({ spec: attentionEnrichmentInformationSpec, source, sourceRefs: { org_id: "org-1" } });
}

describe("P28A-1 — the package now builds (Gate A prerequisite 1)", () => {
    it("a representative legitimate enrichment input builds successfully", () => {
        const built = build();
        expect(built.ok).toBe(true);
    });

    it("declares only closed-vocabulary facts, so no text minimizer is required", () => {
        for (const el of attentionEnrichmentInformationSpec.elements) {
            expect(el.required_text_minimizers).toBeUndefined();
        }
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.package.required_text_minimizers).toEqual([]);
    });

    it("succeeds for the WHY the v1 control asserted failure — no prose element remains", () => {
        // v1 refused because two elements carried prose needing person_name.
        // The successor control: prove no element reads a prose-bearing field.
        const sources = attentionEnrichmentInformationSpec.elements.map((e) => e.source_field);
        expect(sources).not.toContain("reasoning.summary");
        expect(sources).not.toContain("suggested_content.body");
    });

    it("person_name is still unsupported — the platform's privacy posture is UNCHANGED", () => {
        // v2 did not make names safe. It stopped sending them.
        expect(isSupportedTextMinimizationClass("person_name")).toBe(false);
        expect(isSupportedTextMinimizationClass("email")).toBe(true);
        expect(isSupportedTextMinimizationClass("phone")).toBe(true);
    });
});

describe("P28A-2 — reasoning_summary is decomposed, not dropped", () => {
    it("its controlled clauses survive as structured facts", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const el = built.package.elements;
        // `Operational attention: …` → the reason, at higher fidelity than the
        // summary carried (every contributing factor, not just the primary).
        expect(el.attention_reason_code).toBe("tour_no_followup");
        expect(el.attention_factor_codes).toEqual(["tour_no_followup", "decision_pending"]);
        // `Activity signal: …` → the signal key itself.
        expect(el.activity_signal_key).toBe("no_touch_14d");
    });

    it("severity and sla_tier are retained, with absent values as null rather than dropped", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.package.elements.attention_factor_severities).toEqual(["high", null]);
        expect(built.package.elements.attention_factor_sla_tiers).toEqual(["t2", null]);
    });

    it("the ARBITRARY last_activity_summary prose never enters the package", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const blob = JSON.stringify(built.package);
        expect(blob).not.toContain(ARBITRARY_ACTIVITY_PROSE);
        expect(blob).not.toContain("asked about tuition");
        expect(blob).not.toContain("555-0100");
    });
});

describe("P28A-3 — no contact identity reaches the package at all", () => {
    it("the rendered draft body and its greeting name are absent", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const blob = JSON.stringify(built.package);
        expect(blob).not.toContain(CONTACT_NAME);
        expect(blob).not.toContain("Dana");
        expect(blob).not.toContain("I wanted to follow up");
    });

    it("but WHICH draft is retained, which is what reasoning actually needs", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.package.elements.communication_template_key).toBe("tour_followup_v1");
        expect(built.package.elements.communication_channel).toBe("email");
    });

    it("identity is ABSENT rather than minimized or tokenized (D-52)", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const blob = JSON.stringify(built.package);
        expect(blob).not.toMatch(/\[PERSON[_\s]?\d*\]/i);
        expect(blob).not.toContain("[name removed]");
        // Nothing was minimized because nothing identity-bearing was ever read.
        expect(built.package.elements.communication_template_key).toBeDefined();
    });
});

describe("P28A-4 — the declared surface, and nothing beyond it", () => {
    it("declares exactly the intended semantic facts", () => {
        expect(ATTENTION_ENRICHMENT_DECLARED_ELEMENT_KEYS).toEqual([
            "attention_reason_code",
            "attention_reason_codes",
            "activity_signal_key",
            "recommended_action_key",
            "recommended_action_family",
            "attention_factor_codes",
            "attention_factor_severities",
            "attention_factor_sla_tiers",
            "communication_template_key",
            "communication_channel",
        ]);
    });

    it("semantic keys are Trust identities, not storage paths", () => {
        for (const el of attentionEnrichmentInformationSpec.elements) {
            expect(el.key).not.toBe(el.source_field);
            expect(el.key).not.toContain(".");
        }
    });

    it("adversarial extra source fields cannot cross the boundary", () => {
        const hostile = {
            ...SUGGESTION,
            ssn: "123-45-6789",
            parent_email: "leak@example.com",
            internal_notes: "do not send",
        } as AttentionSuggestionV1;

        const built = build(hostile);
        expect(built.ok).toBe(true);
        if (!built.ok) return;

        const blob = JSON.stringify(built.package);
        expect(blob).not.toContain("123-45-6789");
        expect(blob).not.toContain("leak@example.com");
        expect(blob).not.toContain("do not send");
        expect(Object.keys(built.package.elements)).toHaveLength(ATTENTION_ENRICHMENT_DECLARED_ELEMENT_KEYS.length);
    });

    it("exclusions are declared, so widening them requires deleting a line that says not to", () => {
        expect(Object.keys(ATTENTION_ENRICHMENT_EXCLUDED_SOURCE_FIELDS).sort()).toEqual(
            ["next_action.label", "reasoning.summary", "suggested_content.body", "target.entity_id"].sort(),
        );
        const declared = attentionEnrichmentInformationSpec.elements.map((e) => e.source_field);
        for (const excluded of Object.keys(ATTENTION_ENRICHMENT_EXCLUDED_SOURCE_FIELDS)) {
            expect(declared).not.toContain(excluded);
        }
    });

    it("provenance records field NAMES, never values", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        // Asserted explicitly: passing `source_refs` instead of `sourceRefs`
        // was silently ignored and this control did not notice. It does now.
        expect(built.package.provenance.source_refs).toEqual({ org_id: "org-1" });
        const prov = JSON.stringify(built.package.provenance);
        expect(prov).toContain("suggested_content.template_key");
        expect(prov).not.toContain(CONTACT_NAME);
        expect(prov).not.toContain(ARBITRARY_ACTIVITY_PROSE);
    });
});

describe("P28A-5 — identity and determinism", () => {
    it("spec identity is pinned for replay at v2", () => {
        const built = build();
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.package.spec_key).toBe(ATTENTION_ENRICHMENT_SPEC_KEY);
        expect(built.package.spec_version).toBe("2.0.0");
        expect(built.package.decision_class_key).toBe("attention_suggestion_enrichment");
    });

    it("content is deterministic over the same facts", () => {
        const a = build();
        const b = build();
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(a.package.content_hash).toBe(b.package.content_hash);
    });

    it("the hash changes when a declared fact changes, and NOT when an excluded one does", () => {
        const base = build();
        const proseChanged = build({
            ...SUGGESTION,
            reasoning: { ...SUGGESTION.reasoning, summary: "Completely different prose about someone else." },
        });
        const factChanged = build({
            ...SUGGESTION,
            source: { ...SUGGESTION.source, activity_signal_key: "no_touch_30d" },
        });
        expect(base.ok && proseChanged.ok && factChanged.ok).toBe(true);
        if (!base.ok || !proseChanged.ok || !factChanged.ok) return;
        // Excluded prose cannot influence the package at all.
        expect(proseChanged.package.content_hash).toBe(base.package.content_hash);
        // A declared fact must.
        expect(factChanged.package.content_hash).not.toBe(base.package.content_hash);
    });
});
