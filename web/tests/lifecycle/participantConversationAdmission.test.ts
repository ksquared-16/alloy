/**
 * D-101 — narrow admission of participant-authored text, and the controls that keep it narrow.
 *
 * The eight required negative controls plus the admission proofs. Every one is written so that it
 * fails if the admission ever widens: if arbitrary prose starts building, if an ineligible turn
 * reaches a package, or if evidence starts claiming a redaction that did not run.
 */

import { describe, expect, it } from "vitest";

import { buildInformationPackage } from "@/lib/trust/information/informationPackage";
import { transformForReasoning } from "@/lib/trust/privacy/privacyEngine";
import { PARTICIPANT_CONVERSATION_ADMISSION_V1 } from "@/lib/trust/platform/platformPrivacyPolicies";
import {
    participantInterpretationInformationSpec,
    PARTICIPANT_INTERPRETATION_DECLARED_ELEMENT_KEYS,
    type ParticipantInterpretationSource,
} from "@/lib/trust/capabilities/participantConversationInterpretation/informationSpec";
import {
    turnIsEligibleForProviderInterpretation,
    D101_ELIGIBLE_FIELD_KEYS,
} from "@/lib/enrollment/participantRuntime/turnInterpretationEligibility";
import { parseStructuredCandidate } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import { disposeParticipantCandidate } from "@/lib/enrollment/participantRuntime/validateParticipantCandidate";
import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import type { ParticipantTurn } from "@/lib/enrollment/participantRuntime/participantTurnTypes";

function need(overrides: Record<string, unknown> = {}) {
    return {
        identity: {
            key: "child:c1:customer_member:dob",
            canonical_key: "customer_member:dob",
            shared_value_key: "customer_member:dob",
            field_key: "dob",
            entity_type: "customer_member",
            basis: "canonical",
            scope: "child",
            subject_id: "c1",
            artifact_specific: false,
        },
        scope: "child",
        subject_id: "c1",
        state: "known_requires_confirmation",
        occurrence_count: 5,
        occurrences: [{ label: "Date of Birth", form_field_id: "dob_1" }],
        requirement_ids: ["req-a"],
        has_value: true,
        current_value: "2021-05-04",
        value_source: "session_shared_value",
        requires_participant_action: true,
        ...overrides,
    } as never;
}

function turn(overrides: Partial<ParticipantTurn> = {}): ParticipantTurn {
    return {
        kind: "confirm_known_value",
        need: need(),
        prompt: "We have Date of Birth as 2021-05-04. Is that correct?",
        proposed_value: "2021-05-04",
        resolves_occurrences: 5,
        ...overrides,
    } as ParticipantTurn;
}

function source(overrides: Partial<ParticipantInterpretationSource> = {}): ParticipantInterpretationSource {
    return {
        turn_kind: "confirm_known_value",
        need_field_key: "customer_member:dob",
        value_type: "date",
        allowed_values: null,
        proposed_value: "2021-05-04",
        participant_response_text: "Yep, that's right.",
        allowed_candidate_kinds: [],
        value_constraint: "ISO calendar date (YYYY-MM-DD)",
        ...overrides,
    };
}

function buildPackage(src: ParticipantInterpretationSource) {
    return buildInformationPackage({
        spec: participantInterpretationInformationSpec,
        source: src,
        sourceRefs: { turn: "turn-1" },
    });
}

// ---------------------------------------------------------------------------
// 1. Arbitrary application prose still refuses under the OLD policy
// ---------------------------------------------------------------------------

describe("1. the generic Trust privacy contract is unchanged", () => {
    it("a policy demanding an unsupported minimizer still refuses the whole transform", () => {
        const result = transformForReasoning({
            classification: {
                elements: [
                    { key: "prose", information_class: "operational", transformation: "pass_through", value: "x" },
                ],
                classes_present: ["operational"],
            } as never,
            policy: {
                key: "arbitrary_application_prose_v1",
                pii_mode: "strict",
                prohibited_classes: [],
                // What any honest general policy must declare for prose about a family.
                required_text_minimizers: ["person_name"],
            },
            knowledge: [],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal_code).toBe("TEXT_MINIMIZATION_UNSUPPORTED_CLASS");
    });

    it("a policy may not both claim and disclaim a transformation", () => {
        const result = transformForReasoning({
            classification: { elements: [], classes_present: [] } as never,
            policy: {
                key: "contradictory_v1",
                pii_mode: "strict",
                prohibited_classes: [],
                required_text_minimizers: ["email"],
                acknowledged_unminimized_classes: ["email"],
            },
            knowledge: [],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.refusal_code).toBe("PRIVACY_CONTRADICTORY_MINIMIZATION_DECLARATION");
        }
    });

    it("D-101 is opt-in: no existing policy acquires the admission", () => {
        const result = transformForReasoning({
            classification: { elements: [], classes_present: [] } as never,
            policy: { key: "legacy_v1", pii_mode: "strict", prohibited_classes: [] },
            knowledge: [],
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.context.acknowledged_unminimized_classes).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 2-3. Eligibility gates the admission
// ---------------------------------------------------------------------------

describe("2. participant text without a deterministic turn is refused", () => {
    it("no current need means nothing to interpret against", () => {
        const result = turnIsEligibleForProviderInterpretation(turn({ need: null }));
        expect(result.eligible).toBe(false);
        if (!result.eligible) expect(result.reason).toContain("no current information need");
    });

    it("a non-fact turn is refused", () => {
        for (const kind of ["complete_artifact", "complete"] as const) {
            expect(turnIsEligibleForProviderInterpretation(turn({ kind })).eligible).toBe(false);
        }
    });
});

describe("3. high-sensitivity and non-admitted turns never become eligible", () => {
    it("artifact-specific occurrences — every signature — are refused structurally", () => {
        const result = turnIsEligibleForProviderInterpretation(
            turn({
                need: need({
                    identity: {
                        key: "artifact:si-a:ver-a:sig_1",
                        canonical_key: null,
                        shared_value_key: null,
                        artifact_specific: true,
                        scope: "recipient",
                        subject_id: null,
                        basis: "unbound",
                        entity_type: null,
                        field_key: null,
                    },
                }),
            }),
        );
        expect(result.eligible).toBe(false);
        if (!result.eligible) expect(result.reason).toContain("Artifact-specific");
    });

    it("government id, health narrative and consent are NOT on the admitted list", () => {
        for (const key of [
            "person:ssn",
            "customer_member:government_id",
            "customer_member:allergies",
            "customer_member:medical_notes",
            "person:consent_text",
            "person:acknowledgment",
        ]) {
            expect(D101_ELIGIBLE_FIELD_KEYS.has(key)).toBe(false);
            const result = turnIsEligibleForProviderInterpretation(
                turn({
                    need: need({
                        identity: {
                            key: `child:c1:${key}`,
                            canonical_key: key,
                            shared_value_key: key,
                            field_key: key.split(":")[1],
                            entity_type: key.split(":")[0],
                            basis: "canonical",
                            scope: "child",
                            subject_id: "c1",
                            artifact_specific: false,
                        },
                    }),
                }),
            );
            expect(result.eligible).toBe(false);
        }
    });

    it("the default is refusal — an unknown domain is not eligible", () => {
        const result = turnIsEligibleForProviderInterpretation(
            turn({
                need: need({
                    identity: {
                        key: "child:c1:tenant:custom_free_text",
                        canonical_key: "tenant:custom_free_text",
                        shared_value_key: "tenant:custom_free_text",
                        field_key: "custom_free_text",
                        entity_type: "tenant",
                        basis: "canonical",
                        scope: "child",
                        subject_id: "c1",
                        artifact_specific: false,
                    },
                }),
            }),
        );
        expect(result.eligible).toBe(false);
        if (!result.eligible) expect(result.reason).toContain("not on the D-101 admitted list");
    });

    it("an admitted ordinary domain IS eligible", () => {
        const result = turnIsEligibleForProviderInterpretation(turn());
        expect(result.eligible).toBe(true);
        if (result.eligible) expect(result.field_key).toBe("customer_member:dob");
    });
});

// ---------------------------------------------------------------------------
// 5. Only the current turn reaches the provider
// ---------------------------------------------------------------------------

describe("5. unrelated participant, CRM and Form data cannot reach provider input", () => {
    it("the package contains exactly the eight declared elements", () => {
        const built = buildPackage(source());
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(Object.keys(built.package.elements).sort()).toEqual(
            [...PARTICIPANT_INTERPRETATION_DECLARED_ELEMENT_KEYS].sort(),
        );
    });

    it("adversarial extra properties on the source have no path in", () => {
        const built = buildPackage({
            ...source(),
            // Everything an over-eager caller might attach.
            crm_snapshot: { household_income: "120000", sibling_names: ["Rue"] },
            process_instance_id: "pi-secret",
            requirement_id: "req-secret",
            session_id: "session-secret",
            form_schema: { fields: ["everything"] },
        } as never);

        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const serialized = JSON.stringify(built.package.elements);
        for (const leak of ["pi-secret", "req-secret", "session-secret", "120000", "Rue", "everything"]) {
            expect(serialized).not.toContain(leak);
        }
    });
});

// ---------------------------------------------------------------------------
// 7. Evidence is truthful about what was NOT minimized
// ---------------------------------------------------------------------------

describe("7. unsupported classes are reported truthfully, never as redacted", () => {
    it("the D-101 policy declares what it cannot remove", () => {
        expect(PARTICIPANT_CONVERSATION_ADMISSION_V1.required_text_minimizers).toEqual(["email", "phone"]);
        expect(PARTICIPANT_CONVERSATION_ADMISSION_V1.acknowledged_unminimized_classes).toEqual([
            "person_name",
            "street_address",
            "health_information",
        ]);
        // Never admitted at all — refused before a package exists, so nothing to acknowledge.
        expect(PARTICIPANT_CONVERSATION_ADMISSION_V1.acknowledged_unminimized_classes).not.toContain(
            "government_id",
        );
    });

    it("identity is refused wherever D-102 has NOT been declared", () => {
        // `identity` maps to `tokenize`, whose dispatch rule is refused/unsupported —
        // "Tokenization requires a token vault that does not exist."
        //
        // D-102 lets the PARTICIPANT CONVERSATION policy admit it anyway, declared. This control
        // pins the other side of that line: a policy that has not declared the exception still
        // refuses, so the admission cannot leak into generic Trust by being merely available.
        const result = transformForReasoning({
            classification: {
                elements: [
                    {
                        key: "participant_response_text",
                        information_class: "identity",
                        transformation: "tokenize",
                        value: "no, it's May 6",
                    },
                ],
                classes_present: ["identity"],
            } as never,
            policy: { key: "undeclared_v1", pii_mode: "strict", prohibited_classes: [] },
            knowledge: [],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal_code).toBe("PRIVACY_TRANSFORM_UNSUPPORTED");
    });

    it("the acknowledgement reaches evidence on an admissible element", () => {
        const result = transformForReasoning({
            classification: {
                elements: [
                    { key: "turn_kind", information_class: "operational", transformation: "pass_through", value: "confirm_known_value" },
                ],
                classes_present: ["operational"],
            } as never,
            policy: PARTICIPANT_CONVERSATION_ADMISSION_V1,
            knowledge: [],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.context.acknowledged_unminimized_classes).toEqual([
            "health_information",
            "person_name",
            "street_address",
        ]);
        // And it does NOT claim to have minimized them.
        const minimizedClasses = result.context.text_minimizations.map((r) => r.detector_key);
        expect(minimizedClasses).not.toContain("person_name");
        expect(minimizedClasses).not.toContain("street_address");
    });
});

// ---------------------------------------------------------------------------
// 6-8. Authority and fallback — the PR #445 controls, still holding
// ---------------------------------------------------------------------------

describe("6. model output attempting to change field, requirement or command has no authority", () => {
    it("everything but kind and value is structurally dropped", () => {
        const parsed = parseStructuredCandidate({
            kind: "corrected_value",
            value: "2021-05-06",
            field_key: "customer_member:ssn",
            requirement_id: "req-anything",
            command: "complete_enrollment",
            stage: "enrolled",
            complete_enrollment: true,
        });
        expect(parsed).toEqual({ kind: "corrected_value", value: "2021-05-06" });
        expect(Object.keys(parsed)).toEqual(["kind", "value"]);
    });

    it("a participant instruction to skip work cannot become authority", () => {
        // "My DOB is May 5, and also skip the signature." The provider may only answer ABOUT the
        // current need; there is no channel through which the second clause could act.
        const parsed = parseStructuredCandidate({ kind: "corrected_value", value: "2021-05-05" });
        const disposition = disposeParticipantCandidate({
            turn: turn({ kind: "collect_missing_value", proposed_value: null }),
            candidate: parsed,
            field: { id: "dob_1", label: "DOB", required: true, type: "date" },
        });
        expect(disposition).toEqual({ action: "write_shared_value", value: "2021-05-05" });
    });
});

describe("7b. a malformed or unsafe candidate causes no mutation", () => {
    it("Trust may parse the envelope and Participant Runtime still refuses the value", () => {
        // The stated example: provider says corrected_value = "banana" for DOB.
        const parsed = parseStructuredCandidate({ kind: "corrected_value", value: "banana" });
        expect(parsed.kind).toBe("corrected_value");

        const disposition = disposeParticipantCandidate({
            turn: turn({ kind: "collect_missing_value", proposed_value: null }),
            candidate: parsed,
            field: { id: "dob_1", label: "DOB", required: true, type: "date" },
        });
        expect(disposition.action).toBe("refused");
    });

    it("an unreadable candidate fails closed to unresolved", () => {
        expect(parseStructuredCandidate({ kind: "definitely_yes" }).kind).toBe("unresolved");
        expect(parseStructuredCandidate(undefined).kind).toBe("unresolved");
    });
});

describe("8. the deterministic fallback still completes the interaction", () => {
    it("an unambiguous confirmation needs no provider", () => {
        expect(
            interpretParticipantResponseDeterministically({ turn: turn(), text: "Yep, that's right." }).kind,
        ).toBe("confirmed");
    });

    it("a directly entered value needs no provider", () => {
        expect(
            interpretParticipantResponseDeterministically({
                turn: turn({ kind: "collect_missing_value" }),
                directValue: "2021-05-06",
            }),
        ).toEqual({ kind: "corrected_value", value: "2021-05-06" });
    });

    it("an INELIGIBLE turn is still answerable deterministically", () => {
        // The point of refusing provider interpretation: the path stays usable, not blocked.
        const signature = turn({
            need: need({
                identity: {
                    key: "artifact:si-a:ver-a:sig_1",
                    canonical_key: null,
                    shared_value_key: null,
                    artifact_specific: true,
                    scope: "recipient",
                    subject_id: null,
                    basis: "unbound",
                    entity_type: null,
                    field_key: null,
                },
            }),
        });
        expect(turnIsEligibleForProviderInterpretation(signature).eligible).toBe(false);
        expect(
            interpretParticipantResponseDeterministically({ turn: signature, directValue: "signed" }).kind,
        ).toBe("corrected_value");
    });
});

// ---------------------------------------------------------------------------
// D-102 — scoped untransformed identity admission
// ---------------------------------------------------------------------------

describe("D-102 — identity admitted without tokenization, scoped and declared", () => {
    const identityElement = {
        key: "participant_response_text",
        information_class: "identity",
        transformation: "tokenize",
        value: "Actually she was born May 6, 2021",
    };

    function transformIdentityUnder(policy: Record<string, unknown>) {
        return transformForReasoning({
            classification: { elements: [identityElement], classes_present: ["identity"] } as never,
            policy: policy as never,
            knowledge: [],
        });
    }

    it("1. identity under an ORDINARY policy still refuses — tokenization is unsupported", () => {
        const result = transformIdentityUnder({
            key: "ordinary_v1",
            pii_mode: "strict",
            prohibited_classes: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal_code).toBe("PRIVACY_TRANSFORM_UNSUPPORTED");
    });

    it("4. eligible current-turn identity IS admitted under the participant policy", () => {
        const result = transformIdentityUnder(PARTICIPANT_CONVERSATION_ADMISSION_V1 as never);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.context.transformed).toHaveProperty("participant_response_text");
    });

    it("5-6. evidence states admitted-untransformed and NEVER claims tokenization", () => {
        const result = transformIdentityUnder(PARTICIPANT_CONVERSATION_ADMISSION_V1 as never);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.context.acknowledged_untransformed_classes).toEqual(["identity"]);

        const record = result.context.transformations.find((t) => t.key === "participant_response_text")!;
        expect(record.disposition).toBe("admitted");
        // The distinguishing level: not `implemented`, not `compatibility_preserved`, not `unsupported`.
        expect(record.support).toBe("acknowledged_untransformed");
        expect(record.rationale).toContain("No transformation");
        // The claim that must never appear.
        expect(record.support).not.toBe("implemented");
        expect(JSON.stringify(record)).not.toMatch(/tokenized/i);
    });

    it("7. a policy claiming BOTH transformed and acknowledged-untransformed refuses", () => {
        // `operational` maps to `pass_through`, which IS implemented. Declaring an exception to a
        // rule that is being followed is a false statement in the other direction.
        const result = transformForReasoning({
            classification: { elements: [], classes_present: [] } as never,
            policy: {
                key: "false_exception_v1",
                pii_mode: "strict",
                prohibited_classes: [],
                acknowledged_untransformed_classes: ["operational"],
            } as never,
            knowledge: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.refusal_code).toBe("PRIVACY_CONTRADICTORY_TRANSFORMATION_DECLARATION");
        }
    });

    it("D-102 is opt-in: no existing policy acquires untransformed identity", () => {
        const result = transformForReasoning({
            classification: { elements: [], classes_present: [] } as never,
            policy: { key: "legacy_v1", pii_mode: "strict", prohibited_classes: [] },
            knowledge: [],
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.context.acknowledged_untransformed_classes).toEqual([]);
    });

    it("financial is still refused outright under the participant policy", () => {
        const result = transformForReasoning({
            classification: {
                elements: [
                    { key: "x", information_class: "financial", transformation: "aggregate", value: "1" },
                ],
                classes_present: ["financial"],
            } as never,
            policy: PARTICIPANT_CONVERSATION_ADMISSION_V1,
            knowledge: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal_code).toBe("PRIVACY_PROHIBITED_CLASS");
    });
});

describe("D-102 — the acknowledgment is NOT sufficient on its own", () => {
    // 2, 3, 8. The policy says identity may be admitted. Eligibility still decides WHICH identity,
    // and it is enforced above the privacy engine — which cannot see a conversation turn.
    it("2. identity with no active deterministic turn is refused by eligibility", () => {
        expect(turnIsEligibleForProviderInterpretation(turn({ need: null })).eligible).toBe(false);
    });

    it("3. identity on an INELIGIBLE need is refused by eligibility", () => {
        const result = turnIsEligibleForProviderInterpretation(
            turn({
                need: need({
                    identity: {
                        key: "child:c1:person:passport_number",
                        canonical_key: "person:passport_number",
                        shared_value_key: "person:passport_number",
                        field_key: "passport_number",
                        entity_type: "person",
                        basis: "canonical",
                        scope: "child",
                        subject_id: "c1",
                        artifact_specific: false,
                    },
                }),
            }),
        );
        expect(result.eligible).toBe(false);
    });

    it("8. government id remains refused under the participant conversation policy", () => {
        // Neither minimized nor acknowledged — it is not admitted at all.
        expect(PARTICIPANT_CONVERSATION_ADMISSION_V1.acknowledged_unminimized_classes).not.toContain(
            "government_id",
        );
        expect(PARTICIPANT_CONVERSATION_ADMISSION_V1.required_text_minimizers).not.toContain("government_id");
        for (const key of ["person:ssn", "customer_member:government_id", "person:passport_number"]) {
            expect(D101_ELIGIBLE_FIELD_KEYS.has(key)).toBe(false);
        }
    });

    it("DOB is the eligible ordinary fact the vertical requires", () => {
        expect(D101_ELIGIBLE_FIELD_KEYS.has("customer_member:dob")).toBe(true);
        expect(turnIsEligibleForProviderInterpretation(turn()).eligible).toBe(true);
    });
});
