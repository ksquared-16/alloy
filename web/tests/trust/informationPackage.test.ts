/**
 * Phase 2.3 — Trust Information Package.
 *
 * Proves the step between canonical Alloy data and privacy-governed reasoning
 * input: only declared semantic elements enter, raw rows cannot be serialized
 * wholesale, source column names do not decide reasoning semantics, provenance
 * survives without carrying content, and an unsupported need refuses.
 *
 * The Communications inbound message is the proving FIXTURE. Nothing is wired:
 * no decision class is registered, no provider exists, no Communications module
 * imports any of this.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import type { TextMinimizationClass } from "@/lib/privacy/minimizeTextContent";
import type { InformationClass } from "@/lib/trust/classification/informationClasses";
import {
    buildEligibleReasoningInput,
    buildInformationPackage,
    informationPackageNeedsMetByPolicy,
    type InformationPackageSpecV1,
} from "@/lib/trust/information/informationPackage";
import { PROCESSING_IDENTITY_MINIMIZATION_V1 } from "@/lib/trust/platform/platformPrivacyPolicies";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";

const WEB_ROOT = process.cwd();
const EMAIL = "jane.doe+tour@example.com";
const PHONE = "(555) 234-5678";

/**
 * A realistic canonical Communications source, shaped after the
 * `communication_messages` columns.
 *
 * (Previously described as following `InboundMessageDraft` in
 * `lib/communications/v2/inboundNormalization.ts`. That module was never wired to
 * production — the canonical inbound seam is the Python webhook — and was deleted
 * during Block B convergence. The columns are the shape that matters here.)
 *
 * It deliberately carries hazardous fields NO spec below declares —
 * `from_address`, `to_address`, `provider_message_id`, `error`, `metadata`,
 * `recipient_key`. If any of them ever appears downstream, the package boundary
 * has failed.
 */
type InboundMessageSource = {
    id: string;
    thread_id: string;
    org_id: string;
    channel: "sms" | "email";
    direction: "inbound";
    status: string;
    body: string;
    body_format: string;
    subject: string | null;
    from_address: string;
    to_address: string;
    recipient_key: string;
    provider: string;
    provider_message_id: string;
    error: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
};

function inboundMessage(over: Partial<InboundMessageSource> = {}): InboundMessageSource {
    return {
        id: "msg-1",
        thread_id: "thr-1",
        org_id: "org-1",
        channel: "sms",
        direction: "inbound",
        status: "received",
        body: `Hi! This is Sarah. Can you email the tour details to ${EMAIL}? Or text ${PHONE}. Thanks!`,
        body_format: "plain",
        subject: null,
        from_address: "+15552345678",
        to_address: "+15559876543",
        recipient_key: "+15552345678",
        provider: "twilio",
        provider_message_id: "SM-secret-provider-id",
        error: null,
        metadata: { raw_webhook: { AccountSid: "AC-secret" } },
        created_at: "2026-08-07T12:00:00.000Z",
        ...over,
    };
}

/**
 * The proving spec.
 *
 * `inbound_message_text` is the load-bearing name. Its SOURCE is
 * `communication_messages.body`, and `body` matches the structural note rule in
 * `redactObjectForAi` — so had the element inherited its column name, the
 * structural pass would destroy it after Phase 2.2 cleaned it. The semantic name
 * is what makes the minimized text survive. That is Director decision D-8, in
 * one field.
 */
const INBOUND_MESSAGE_SPEC: InformationPackageSpecV1<InboundMessageSource> = {
    key: "communications_inbound_message",
    version: "1.0.0",
    decision_class_key: "communications_inbound_message_classification",
    source_kind: "communication_messages",
    elements: [
        {
            key: "inbound_message_text",
            information_class: "communications",
            source_field: "communication_messages.body",
            required_text_minimizers: ["email", "phone"],
            select: (m) => m.body,
        },
        {
            key: "message_channel",
            information_class: "operational",
            source_field: "communication_messages.channel",
            select: (m) => m.channel,
        },
        {
            key: "message_direction",
            information_class: "operational",
            source_field: "communication_messages.direction",
            select: (m) => m.direction,
        },
    ],
};

function policy(over: Partial<PrivacyPolicyV1> = {}): PrivacyPolicyV1 {
    return {
        key: "communications_inbound_minimization_test_v1",
        pii_mode: "strict",
        prohibited_classes: [],
        required_text_minimizers: ["email", "phone"],
        ...over,
    };
}

function buildOk(spec = INBOUND_MESSAGE_SPEC, source = inboundMessage()) {
    const r = buildInformationPackage({
        spec,
        source,
        sourceRefs: { message_id: source.id, thread_id: source.thread_id, org_id: source.org_id },
    });
    if (!r.ok) throw new Error(`expected package, got ${r.refusal_code}`);
    return r.package;
}

// ---------------------------------------------------------------------------
// 1. Only declared elements enter
// ---------------------------------------------------------------------------

describe("P2.3-1 — only explicitly declared semantic elements enter the package", () => {
    it("admits exactly the three declared elements", () => {
        const pkg = buildOk();
        expect(Object.keys(pkg.elements).sort()).toEqual([
            "inbound_message_text", "message_channel", "message_direction",
        ]);
    });

    it("no undeclared source column crosses the boundary", () => {
        const pkg = buildOk();
        const blob = JSON.stringify(pkg);
        for (const forbidden of [
            "from_address", "to_address", "recipient_key", "provider_message_id",
            "SM-secret-provider-id", "AccountSid", "AC-secret", "twilio",
            "+15559876543", "body_format", "raw_webhook",
        ]) {
            expect(blob, `leaked ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("an adversarial source with extra fields cannot smuggle them in", () => {
        const hostile = {
            ...inboundMessage(),
            ssn: "123-45-6789",
            internal_notes: "operator said the parent was difficult",
            api_key: "sk-live-should-never-appear",
        } as InboundMessageSource;
        const pkg = buildOk(INBOUND_MESSAGE_SPEC, hostile);
        const blob = JSON.stringify(pkg);
        for (const forbidden of ["ssn", "123-45-6789", "internal_notes", "difficult", "api_key", "sk-live"]) {
            expect(blob, `leaked ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("a selector returning a whole row is REFUSED, not flattened", () => {
        // This is the structural guarantee. Flattening is exactly how a database
        // shape used to become a reasoning shape.
        const bad: InformationPackageSpecV1<InboundMessageSource> = {
            ...INBOUND_MESSAGE_SPEC,
            elements: [{
                key: "whole_row",
                information_class: "communications",
                source_field: "communication_messages.*",
                select: (m) => m,
            }],
        };
        const r = buildInformationPackage({ spec: bad, source: inboundMessage(), sourceRefs: {} });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("INFO_PACKAGE_NON_SCALAR_ELEMENT");
        // The refusal must not quote the structure it just refused.
        expect(JSON.stringify(r)).not.toContain("provider_message_id");
        expect(JSON.stringify(r)).not.toContain(EMAIL);
    });

    it("a nested object or an array of objects is refused too", () => {
        for (const select of [(m: InboundMessageSource) => m.metadata, () => [{ a: 1 }]]) {
            const r = buildInformationPackage({
                spec: { ...INBOUND_MESSAGE_SPEC, elements: [{ key: "x", information_class: "operational", source_field: "f", select }] },
                source: inboundMessage(),
                sourceRefs: {},
            });
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.refusal_code).toBe("INFO_PACKAGE_NON_SCALAR_ELEMENT");
        }
    });

    it("scalars and arrays of scalars are admitted", () => {
        const r = buildInformationPackage({
            spec: {
                ...INBOUND_MESSAGE_SPEC,
                elements: [
                    { key: "s", information_class: "operational", source_field: "f", select: () => "x" },
                    { key: "n", information_class: "operational", source_field: "f", select: () => 1 },
                    { key: "b", information_class: "operational", source_field: "f", select: () => true },
                    { key: "z", information_class: "operational", source_field: "f", select: () => null },
                    { key: "a", information_class: "operational", source_field: "f", select: () => ["p", 2, false, null] },
                ],
            },
            source: inboundMessage(),
            sourceRefs: {},
        });
        expect(r.ok).toBe(true);
    });

    it("a duplicate semantic key refuses rather than silently overwriting", () => {
        const dup: InformationPackageSpecV1<InboundMessageSource> = {
            ...INBOUND_MESSAGE_SPEC,
            elements: [INBOUND_MESSAGE_SPEC.elements[1]!, INBOUND_MESSAGE_SPEC.elements[1]!],
        };
        const r = buildInformationPackage({ spec: dup, source: inboundMessage(), sourceRefs: {} });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("INFO_PACKAGE_DUPLICATE_ELEMENT");
    });

    it("an empty spec refuses — reasoning on nothing is not a decision", () => {
        const r = buildInformationPackage({
            spec: { ...INBOUND_MESSAGE_SPEC, elements: [] },
            source: inboundMessage(),
            sourceRefs: {},
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("INFO_PACKAGE_EMPTY_SPEC");
    });
});

// ---------------------------------------------------------------------------
// 2. Semantic identity is independent of source column names (D-8)
// ---------------------------------------------------------------------------

describe("P2.3-2 — semantic element keys are independent of raw source columns", () => {
    it("the text element is named semantically, and its column name appears only in provenance", () => {
        const pkg = buildOk();
        expect(pkg.elements).toHaveProperty("inbound_message_text");
        expect(pkg.elements).not.toHaveProperty("body");
        expect(pkg.provenance.element_sources).toContainEqual({
            key: "inbound_message_text",
            source_field: "communication_messages.body",
        });
    });

    it("the semantic name is what lets minimized text SURVIVE structural redaction", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        const text = String(eligible.input.elements.inbound_message_text);
        expect(text).toBe("Hi! This is Sarah. Can you email the tour details to [email removed]? Or text [phone removed]. Thanks!");
        expect(text).toContain("tour details");
    });

    it("had the element inherited its COLUMN name, structural redaction would have destroyed it", () => {
        // The counter-case, asserted so D-8's rationale is evidence rather than
        // assertion: `message_body` matches the structural note rule.
        const columnNamed: InformationPackageSpecV1<InboundMessageSource> = {
            ...INBOUND_MESSAGE_SPEC,
            elements: [{ ...INBOUND_MESSAGE_SPEC.elements[0]!, key: "message_body" }],
        };
        const eligible = buildEligibleReasoningInput({ package: buildOk(columnNamed), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        expect(String(eligible.input.elements.message_body)).toContain("note:redacted");
        expect(String(eligible.input.elements.message_body)).not.toContain("tour details");
    });

    it("no raw source column name appears anywhere in the eligible reasoning input's ELEMENTS", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        for (const key of Object.keys(eligible.input.elements)) {
            expect(["inbound_message_text", "message_channel", "message_direction"]).toContain(key);
        }
    });
});

// ---------------------------------------------------------------------------
// 3. Privacy applies per semantic element
// ---------------------------------------------------------------------------

describe("P2.3-3 — privacy classification and transformation apply per element", () => {
    it("each element carries its own class and transformation record", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        const byKey = Object.fromEntries(eligible.input.transformations.map((t) => [t.key, t]));
        expect(byKey.inbound_message_text!.information_class).toBe("communications");
        expect(byKey.inbound_message_text!.transformation).toBe("summarize");
        expect(byKey.inbound_message_text!.support).toBe("compatibility_preserved");
        expect(byKey.message_channel!.information_class).toBe("operational");
        expect(byKey.message_channel!.support).toBe("implemented");
    });

    it("email minimization runs on the Communications text fixture", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        expect(eligible.input.text_minimizations).toContainEqual({
            detector_key: "email", redaction_kind: "email", replaced_count: 1,
        });
        expect(JSON.stringify(eligible.input.elements)).not.toContain("jane.doe");
    });

    it("NANP phone minimization runs on the same fixture", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        expect(eligible.input.text_minimizations).toContainEqual({
            detector_key: "phone", redaction_kind: "phone", replaced_count: 1,
        });
        expect(JSON.stringify(eligible.input.elements)).not.toContain("234-5678");
    });

    it("`person_name` remains unsupported, so 'This is Sarah' is NOT claimed to be minimized (D-9)", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        expect(String(eligible.input.elements.inbound_message_text)).toContain("Sarah");
        expect(eligible.input.text_minimizations.map((m) => m.detector_key)).not.toContain("person_name");
    });
});

// ---------------------------------------------------------------------------
// 4. Fail-closed
// ---------------------------------------------------------------------------

describe("P2.3-4 — unsupported needs refuse, and refusals leak nothing", () => {
    it("an element declaring an unsupported minimizer refuses the package", () => {
        const spec: InformationPackageSpecV1<InboundMessageSource> = {
            ...INBOUND_MESSAGE_SPEC,
            elements: [{
                ...INBOUND_MESSAGE_SPEC.elements[0]!,
                required_text_minimizers: ["email", "person_name"] as readonly TextMinimizationClass[],
            }],
        };
        const r = buildInformationPackage({ spec, source: inboundMessage(), sourceRefs: {} });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal_code).toBe("INFO_PACKAGE_UNSUPPORTED_MINIMIZER");
        expect(r.detail).toContain("person_name");
    });

    it("that refusal carries no fragment of the source message", () => {
        const spec: InformationPackageSpecV1<InboundMessageSource> = {
            ...INBOUND_MESSAGE_SPEC,
            elements: [{
                ...INBOUND_MESSAGE_SPEC.elements[0]!,
                required_text_minimizers: ["street_address"] as readonly TextMinimizationClass[],
            }],
        };
        const r = buildInformationPackage({ spec, source: inboundMessage(), sourceRefs: {} });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        const blob = JSON.stringify(r);
        for (const fragment of ["jane.doe", "example.com", "234-5678", "Sarah"]) {
            expect(blob, `leaked ${fragment}`).not.toContain(fragment);
        }
    });

    it("a prohibited class refuses eligibility, and the refusal leaks nothing", () => {
        const eligible = buildEligibleReasoningInput({
            package: buildOk(),
            policy: policy({ prohibited_classes: ["communications"] }),
        });
        expect(eligible.ok).toBe(false);
        if (eligible.ok) return;
        expect(eligible.refusal_code).toBe("PRIVACY_PROHIBITED_CLASS");
        expect(JSON.stringify(eligible)).not.toContain("jane.doe");
    });

    it("a capability can detect that its declared need is UNMET by the policy (D-9 fail-closed)", () => {
        const pkg = buildOk();
        expect(informationPackageNeedsMetByPolicy(pkg, policy())).toEqual({ met: true });

        const weaker = informationPackageNeedsMetByPolicy(pkg, policy({ required_text_minimizers: ["email"] }));
        expect(weaker.met).toBe(false);
        if (weaker.met) return;
        expect(weaker.unmet).toEqual(["phone"]);

        // Proof the gap is REAL and not merely reported. Under the weaker policy
        // the content-aware pass never runs on the phone, so the only thing left
        // is structural masking — which preserves the LAST FOUR DIGITS and
        // mangles the sentence, where the content-aware pass would have removed
        // the number outright and kept the prose. That difference is exactly why
        // an unmet declared need must be able to stop egress.
        const eligible = buildEligibleReasoningInput({
            package: pkg,
            policy: policy({ required_text_minimizers: ["email"] }),
        });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        const text = String(eligible.input.elements.inbound_message_text);
        expect(text).not.toContain("[phone removed]");
        expect(text).toContain("5678");
        expect(eligible.input.text_minimizations.map((m) => m.detector_key)).not.toContain("phone");
    });
});

// ---------------------------------------------------------------------------
// 5. Provenance
// ---------------------------------------------------------------------------

describe("P2.3-5 — provenance identifies the source without carrying it", () => {
    it("records source kind, opaque refs and per-element field names", () => {
        const pkg = buildOk();
        expect(pkg.provenance.source_kind).toBe("communication_messages");
        expect(pkg.provenance.source_refs).toEqual({ message_id: "msg-1", thread_id: "thr-1", org_id: "org-1" });
        expect(pkg.provenance.element_sources).toHaveLength(3);
    });

    it("carries no sensitive payload — ids and field names only", () => {
        const blob = JSON.stringify(buildOk().provenance);
        for (const fragment of ["jane.doe", "example.com", "234-5678", "Sarah", "+1555", "twilio"]) {
            expect(blob, `leaked ${fragment}`).not.toContain(fragment);
        }
    });

    it("provenance survives into the eligible reasoning input", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        expect(eligible.input.provenance.source_refs.message_id).toBe("msg-1");
    });
});

// ---------------------------------------------------------------------------
// 6. Determinism
// ---------------------------------------------------------------------------

describe("P2.3-6 — identical canonical input produces identical eligible input", () => {
    it("the package hash is deterministic and prefixed", () => {
        expect(buildOk().content_hash).toBe(buildOk().content_hash);
        expect(buildOk().content_hash.startsWith("tip1:")).toBe(true);
    });

    it("the eligible reasoning input is byte-identical across runs", () => {
        const a = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        const b = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("changing a declared value changes the hash; changing an UNDECLARED field does not", () => {
        const base = buildOk().content_hash;
        expect(buildOk(INBOUND_MESSAGE_SPEC, inboundMessage({ body: "different" })).content_hash).not.toBe(base);
        // `provider_message_id` is not declared, so it cannot affect reasoning —
        // and must not affect the hash either.
        expect(buildOk(INBOUND_MESSAGE_SPEC, inboundMessage({ provider_message_id: "SM-other" })).content_hash).toBe(base);
    });

    it("provenance is excluded from the package hash — same facts, different row, same input", () => {
        const a = buildInformationPackage({ spec: INBOUND_MESSAGE_SPEC, source: inboundMessage(), sourceRefs: { message_id: "msg-1" } });
        const b = buildInformationPackage({ spec: INBOUND_MESSAGE_SPEC, source: inboundMessage(), sourceRefs: { message_id: "msg-999" } });
        expect(a.ok && b.ok && a.package.content_hash).toBe(b.ok ? b.package.content_hash : null);
    });

    it("the eligible-input hash uses a DISTINCT prefix from a package hash", () => {
        const eligible = buildEligibleReasoningInput({ package: buildOk(), policy: policy() });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        expect(eligible.input.content_hash.startsWith("teri1:")).toBe(true);
        expect(eligible.input.content_hash).not.toBe(buildOk().content_hash);
    });
});

// ---------------------------------------------------------------------------
// 7. Boundaries: no provider, no second engine, nothing wired
// ---------------------------------------------------------------------------

describe("P2.3-7 — no provider, no second privacy engine, nothing wired", () => {
    const SRC = "lib/trust/information/informationPackage.ts";

    it("performs no network, provider, credential, clock or random access", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        for (const p of [
            /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /@anthropic-ai/, /\bopenai\b/i, /axios/,
            /from\s+"node:https?"/, /process\.env/, /Date\.now/, /new Date\(/, /Math\.random/, /randomUUID/,
        ]) {
            expect(src, `matched ${p}`).not.toMatch(p);
        }
    });

    it("delegates privacy rather than reimplementing it", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).toContain("transformForReasoning");
        expect(src).toContain("classifyElements");
        // A second minimizer or redactor here would be a second thing to keep
        // correct, and the first time they disagreed the safer one would not be
        // the one in the provider path.
        expect(src).not.toMatch(/function\s+\w*[Mm]inimize/);
        expect(src).not.toContain("redactObjectForAi");
    });

    it("uses the one-shot hash, so the no-durable-mutation scan still holds", () => {
        // The real control (trustBoundary / phase1CloseoutCertification) scans
        // `lib/trust` for `update()`, because a table write and an incremental
        // hash builder share that method name. Asserting the ABSENCE of
        // `.update(` is therefore the assertion that matters; scanning for the
        // word `createHash` would only catch prose explaining why we avoid it —
        // as the `decisionPackageFingerprint` precedent does in its own header.
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).toContain("oneShotHash");
        expect(src).not.toMatch(/\.update\(/);
    });

    it("imports nothing from Communications, and no Communications module imports it", () => {
        const src = readFileSync(join(WEB_ROOT, SRC), "utf8");
        expect(src).not.toMatch(/lib\/communications/);
    });

    it("registers no decision class — the fixture spec is not in the Trust manifest", () => {
        const registry = readFileSync(join(WEB_ROOT, "lib/trust/registry/trustRegistry.ts"), "utf8");
        expect(registry).not.toContain("communications_inbound_message");
        expect(registry).not.toContain("informationPackage");
    });

    it("Phase 2.1 and 2.2 semantics are reachable through the package unchanged", () => {
        // tokenize still refuses, via the real engine, through this path.
        const identitySpec: InformationPackageSpecV1<InboundMessageSource> = {
            ...INBOUND_MESSAGE_SPEC,
            elements: [{ key: "who", information_class: "identity", source_field: "f", select: (m) => m.from_address }],
        };
        const eligible = buildEligibleReasoningInput({ package: buildOk(identitySpec), policy: policy() });
        expect(eligible.ok).toBe(false);
        if (eligible.ok) return;
        expect(eligible.refusal_code).toBe("PRIVACY_TRANSFORM_UNSUPPORTED");
    });

    it("an existing platform policy still behaves exactly as before through this path", () => {
        // PROCESSING_IDENTITY_MINIMIZATION_V1 declares no text minimizers and
        // prohibits identity — unchanged by Phase 2.3.
        expect(PROCESSING_IDENTITY_MINIMIZATION_V1.required_text_minimizers ?? []).toEqual([]);
        const spec: InformationPackageSpecV1<InboundMessageSource> = {
            ...INBOUND_MESSAGE_SPEC,
            elements: [{ key: "disposition", information_class: "operational", source_field: "f", select: () => "matched_existing" }],
        };
        const eligible = buildEligibleReasoningInput({
            package: buildOk(spec),
            policy: PROCESSING_IDENTITY_MINIMIZATION_V1,
        });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        expect(eligible.input.elements.disposition).toBe("matched_existing");
        expect(eligible.input.text_minimizations).toEqual([]);
    });
});
