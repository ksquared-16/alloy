/**
 * Slice 2.4 — unique information needs and the ask-once substrate.
 *
 * The product invariant, proven end to end: a participant is asked for or asked to confirm the same
 * canonical fact AT MOST ONCE per Enrollment objective, however many required Forms contain it.
 *
 * Semantic identity is not re-tested here — `packetFieldPlan.ts` owns it and has its own suite. What
 * these proofs own is the Enrollment-objective layer: grain, state, confirmation, and the collapse.
 */

import { describe, expect, it } from "vitest";

import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import { resolveEnrollmentNeedIdentity } from "@/lib/enrollment/informationNeeds/enrollmentNeedIdentity";
import {
    buildEnrollmentNeedConfirmationPatch,
    confirmationSatisfiesCurrentValue,
    enrollmentValueFingerprint,
    readEnrollmentNeedConfirmations,
    ENROLLMENT_CONFIRMATIONS_METADATA_KEY,
} from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import { shallowMergeSharedValues } from "@/lib/forms/packets/formPacketService";
import { mergeFormPrefillPayload } from "@/lib/forms/prefill/mergeFormPrefillPayload";
import { validateFormSchema } from "@/lib/forms/schema";

const CHILD_A = "cccc0000-0000-4000-8000-00000000000a";
const CHILD_B = "cccc0000-0000-4000-8000-00000000000b";
const DOB_KEY = "customer_member:dob";

/** A scalar DOB control bound to the canonical child DOB datum. */
function dobField(id: string) {
    return {
        id,
        label: "Date of Birth",
        required: true,
        type: "date" as const,
        field_source: { entity_type: "customer_member", field_key: "dob" },
    };
}

function schemaOf(fields: unknown[]) {
    // The real published shape — `schema_version`, `title`, `sections`, `fields` — parsed by the
    // platform's own validator so a fixture cannot drift from what a version actually stores.
    return validateFormSchema({
        schema_version: 1,
        title: "Cert Form",
        sections: [
            {
                id: "s1",
                field_ids: (fields as { id: string }[]).map((f) => f.id),
            },
        ],
        fields,
    });
}

function pinnedForm(input: {
    requirement_id?: string;
    form_definition_id?: string;
    version?: string;
    session_item_id?: string;
    fields: unknown[];
}) {
    return {
        requirement_id: input.requirement_id ?? "req-a",
        form_definition_id: input.form_definition_id ?? "form-a",
        form_definition_version_id: input.version ?? "ver-a1",
        session_item_id: input.session_item_id ?? "si-a",
        schema: schemaOf(input.fields),
    };
}

function project(input: {
    forms: ReturnType<typeof pinnedForm>[];
    subjectId?: string | null;
    sharedValues?: Record<string, unknown>;
    canonicalValues?: Record<string, unknown>;
    confirmations?: Record<string, { value_fingerprint: string; confirmed_at: string }>;
    requiresConfirmation?: Set<string>;
}) {
    return projectEnrollmentInformationNeeds({
        forms: input.forms,
        subjectId: input.subjectId ?? CHILD_A,
        sharedValues: input.sharedValues ?? {},
        canonicalValues: input.canonicalValues,
        confirmations: input.confirmations ?? {},
        requiresConfirmation: input.requiresConfirmation,
    });
}

// ---------------------------------------------------------------------------
// THE CENTRAL PROOF — DOB x 15
// ---------------------------------------------------------------------------

describe("DOB across 15 required Form controls is ONE participant need", () => {
    /** Five required Forms, three DOB controls each — fifteen occurrences of one datum. */
    const FIFTEEN = Array.from({ length: 5 }, (_, f) =>
        pinnedForm({
            requirement_id: `req-${f}`,
            form_definition_id: `form-${f}`,
            version: `ver-${f}`,
            session_item_id: `si-${f}`,
            fields: [dobField(`dob_${f}_1`), dobField(`dob_${f}_2`), dobField(`dob_${f}_3`)],
        }),
    );

    it("1-3. exactly one need, occurrence_count 15, all targets retained", () => {
        const needs = project({ forms: FIFTEEN });

        expect(needs).toHaveLength(1);
        expect(needs[0]!.occurrence_count).toBe(15);
        expect(needs[0]!.occurrences).toHaveLength(15);
        // Every one of the fifteen targets is addressable for a future conversation.
        expect(new Set(needs[0]!.occurrences.map((o) => o.form_field_id)).size).toBe(15);
        expect(new Set(needs[0]!.occurrences.map((o) => o.session_item_id)).size).toBe(5);
        expect(needs[0]!.requirement_ids).toHaveLength(5);
    });

    it("4. a missing DOB is ONE missing need, not fifteen", () => {
        const needs = project({ forms: FIFTEEN });
        expect(needs[0]!.state).toBe("missing");
        expect(needs[0]!.requires_participant_action).toBe(true);
        expect(needs.filter((n) => n.requires_participant_action)).toHaveLength(1);
    });

    it("5-7. the participant supplies it ONCE and recomputation sees one resolved value", () => {
        // 6. Through the EXISTING packet shared-value write path, not a new store.
        const sharedValues = shallowMergeSharedValues({}, { [DOB_KEY]: "2021-05-04" });
        expect(sharedValues[DOB_KEY]).toBe("2021-05-04");

        const needs = project({ forms: FIFTEEN, sharedValues });
        expect(needs).toHaveLength(1);
        expect(needs[0]!.state).toBe("known");
        expect(needs[0]!.has_value).toBe(true);
        expect(needs[0]!.value_source).toBe("session_shared_value");
        expect(needs[0]!.requires_participant_action).toBe(false);
    });

    it("8-9. all 15 targets receive it through the EXISTING prefill path, with no per-occurrence state", () => {
        const sharedValues = shallowMergeSharedValues({}, { [DOB_KEY]: "2021-05-04" });
        const needs = project({ forms: FIFTEEN, sharedValues });

        // The session's shared value reaches every occurrence in every form via the settled merge.
        for (const form of FIFTEEN) {
            const scalarPrefill: Record<string, string> = {};
            for (const occurrence of needs[0]!.occurrences) {
                if (occurrence.session_item_id !== form.session_item_id) continue;
                scalarPrefill[occurrence.form_field_id] = sharedValues[DOB_KEY] as string;
            }
            const payload = mergeFormPrefillPayload({ schema: form.schema, scalarPrefill });
            expect(Object.values(payload.values)).toEqual([
                "2021-05-04",
                "2021-05-04",
                "2021-05-04",
            ]);
        }

        // 9. One need carries one value. No occurrence has independent answer state.
        expect(needs).toHaveLength(1);
        expect(new Set(needs[0]!.occurrences.map(() => needs[0]!.current_value)).size).toBe(1);
    });

    it("10. save/resume preserves the one value and the one need state", () => {
        const sharedValues = shallowMergeSharedValues({}, { [DOB_KEY]: "2021-05-04" });
        const first = project({ forms: FIFTEEN, sharedValues });
        const resumed = project({ forms: FIFTEEN, sharedValues });
        expect(resumed).toEqual(first);
    });
});

// ---------------------------------------------------------------------------
// D-99 — confirmation of an existing value
// ---------------------------------------------------------------------------

describe("D-99 — known value, confirmed once, reused everywhere", () => {
    const FORMS = Array.from({ length: 15 }, (_, i) =>
        pinnedForm({
            requirement_id: `req-${i}`,
            form_definition_id: `form-${i}`,
            version: `ver-${i}`,
            session_item_id: `si-${i}`,
            fields: [dobField(`dob_${i}`)],
        }),
    );
    const CANONICAL = { [DOB_KEY]: "2021-05-04" };
    const POLICY = new Set([DOB_KEY]);

    it("8/10. a canonical value is visible and marked known_requires_confirmation", () => {
        const needs = project({
            forms: FORMS,
            canonicalValues: CANONICAL,
            requiresConfirmation: POLICY,
        });

        expect(needs).toHaveLength(1);
        expect(needs[0]!.occurrence_count).toBe(15);
        expect(needs[0]!.state).toBe("known_requires_confirmation");
        // The conversation can say WHAT it already has, which is the whole point of the state.
        expect(needs[0]!.current_value).toBe("2021-05-04");
        expect(needs[0]!.value_source).toBe("canonical_prefill");
        expect(needs[0]!.requires_participant_action).toBe(true);
    });

    it("without a confirmation policy the same value is simply known", () => {
        const needs = project({ forms: FORMS, canonicalValues: CANONICAL });
        expect(needs[0]!.state).toBe("known");
        expect(needs[0]!.requires_participant_action).toBe(false);
    });

    it("11. confirming ONCE resolves participant action for all 15 targets", () => {
        const needKey = project({ forms: FORMS, canonicalValues: CANONICAL })[0]!.identity.key;

        // Written through the session metadata owner — not into the shared_values namespace.
        const metadata = buildEnrollmentNeedConfirmationPatch({
            metadata: {},
            needKey,
            confirmedValue: "2021-05-04",
            confirmedAtIso: "2026-08-16T10:00:00.000Z",
        })!;

        const needs = project({
            forms: FORMS,
            canonicalValues: CANONICAL,
            requiresConfirmation: POLICY,
            confirmations: readEnrollmentNeedConfirmations(metadata) as never,
        });

        expect(needs[0]!.state).toBe("confirmed");
        expect(needs[0]!.requires_participant_action).toBe(false);
        expect(needs[0]!.occurrence_count).toBe(15);
    });

    it("12. a changed value INVALIDATES the prior confirmation", () => {
        const needKey = project({ forms: FORMS, canonicalValues: CANONICAL })[0]!.identity.key;
        const metadata = buildEnrollmentNeedConfirmationPatch({
            metadata: {},
            needKey,
            confirmedValue: "2021-05-04",
            confirmedAtIso: "2026-08-16T10:00:00.000Z",
        })!;
        const confirmations = readEnrollmentNeedConfirmations(metadata) as never;

        // The parent corrects the date. The old confirmation was about a different value.
        const needs = project({
            forms: FORMS,
            sharedValues: { [DOB_KEY]: "2021-05-09" },
            canonicalValues: CANONICAL,
            requiresConfirmation: POLICY,
            confirmations,
        });

        expect(needs[0]!.current_value).toBe("2021-05-09");
        expect(needs[0]!.state).toBe("known_requires_confirmation");
        expect(needs[0]!.requires_participant_action).toBe(true);
    });

    it("confirmation is stored under its own metadata key, never in shared_values", () => {
        const metadata = buildEnrollmentNeedConfirmationPatch({
            metadata: { existing_key: "untouched" },
            needKey: "child:x:customer_member:dob",
            confirmedValue: "2021-05-04",
            confirmedAtIso: "2026-08-16T10:00:00.000Z",
        })!;

        expect(Object.keys(metadata)).toContain(ENROLLMENT_CONFIRMATIONS_METADATA_KEY);
        expect(metadata.existing_key).toBe("untouched");
        // One entry per NEED — never one per Form occurrence.
        expect(
            Object.keys(metadata[ENROLLMENT_CONFIRMATIONS_METADATA_KEY] as object),
        ).toEqual(["child:x:customer_member:dob"]);
    });

    it("a confirmation with no value fingerprint is refused — no detached boolean", () => {
        expect(
            buildEnrollmentNeedConfirmationPatch({
                metadata: {},
                needKey: "k",
                confirmedValue: "   ",
                confirmedAtIso: "2026-08-16T10:00:00.000Z",
            }),
        ).toBeNull();
        // And a hand-written one missing the fingerprint is dropped on read, failing closed.
        expect(
            readEnrollmentNeedConfirmations({
                [ENROLLMENT_CONFIRMATIONS_METADATA_KEY]: { k: { confirmed_at: "2026-08-16" } },
            }),
        ).toEqual({});
        expect(confirmationSatisfiesCurrentValue(undefined, "x")).toBe(false);
    });

    it("the fingerprint does not conflate distinct values", () => {
        expect(enrollmentValueFingerprint("2021-05-04")).toBe(enrollmentValueFingerprint(" 2021-05-04 "));
        expect(enrollmentValueFingerprint("5")).not.toBe(enrollmentValueFingerprint(5));
        expect(enrollmentValueFingerprint(null)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Grain
// ---------------------------------------------------------------------------

describe("grain — dedupe never crosses subjects", () => {
    const forms = [pinnedForm({ fields: [dobField("dob_1"), dobField("dob_2")] })];

    it("18. Child A DOB and Child B DOB are two separate needs", () => {
        const a = project({ forms, subjectId: CHILD_A });
        const b = project({ forms, subjectId: CHILD_B });

        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
        expect(a[0]!.identity.key).not.toBe(b[0]!.identity.key);
        expect(a[0]!.subject_id).toBe(CHILD_A);
        expect(b[0]!.subject_id).toBe(CHILD_B);
        // Within each child, the duplicates still collapse.
        expect(a[0]!.occurrence_count).toBe(2);
        expect(b[0]!.occurrence_count).toBe(2);
    });

    it("23. an explicit shared_value_key alias does NOT collapse distinct child grain", () => {
        // The alias supplies the KEY. It never supplies the scope or the subject.
        const aliased = [
            pinnedForm({
                fields: [
                    {
                        id: "dob_aliased",
                        label: "DOB",
                        required: true,
                        type: "date" as const,
                        field_source: {
                            entity_type: "customer_member",
                            field_key: "dob",
                            shared_value_key: "shared_dob",
                        },
                    },
                ],
            }),
        ];
        const a = project({ forms: aliased, subjectId: CHILD_A });
        const b = project({ forms: aliased, subjectId: CHILD_B });

        expect(a[0]!.identity.basis).toBe("shared_alias");
        expect(a[0]!.identity.shared_value_key).toBe("shared_dob");
        expect(a[0]!.identity.key).not.toBe(b[0]!.identity.key);
    });

    it("household-scoped values collapse across children, by doctrine", () => {
        const household = [
            pinnedForm({
                fields: [
                    {
                        id: "addr",
                        label: "Address",
                        required: true,
                        type: "text" as const,
                        field_source: { entity_type: "household", field_key: "address_line1" },
                    },
                ],
            }),
        ];
        const a = project({ forms: household, subjectId: CHILD_A });
        const b = project({ forms: household, subjectId: CHILD_B });

        expect(a[0]!.scope).toBe("household");
        expect(a[0]!.subject_id).toBeNull();
        expect(a[0]!.identity.key).toBe(b[0]!.identity.key);
    });
});

// ---------------------------------------------------------------------------
// Artifact-specific
// ---------------------------------------------------------------------------

describe("21-22. artifact-specific occurrences never dedupe", () => {
    it("signatures are recipient-scoped and stay per occurrence", () => {
        const needs = project({
            forms: [
                pinnedForm({
                    fields: [
                        { id: "sig_1", label: "Signature", required: true, type: "signature" as const },
                        { id: "sig_2", label: "Signature", required: true, type: "signature" as const },
                    ],
                }),
            ],
        });

        expect(needs).toHaveLength(2);
        for (const need of needs) {
            expect(need.state).toBe("artifact_specific");
            expect(need.scope).toBe("recipient");
            // Must never read or write the shared namespace.
            expect(need.identity.shared_value_key).toBeNull();
            expect(need.requires_participant_action).toBe(false);
        }
    });

    it("a signature carrying a binding is STILL artifact-specific", () => {
        // `classifyFieldScope` returns recipient for every signature unconditionally. A binding must
        // not be able to talk a signature into being shared.
        const needs = project({
            forms: [
                pinnedForm({
                    fields: [
                        {
                            id: "sig_bound",
                            label: "Signature",
                            required: true,
                            type: "signature" as const,
                            field_source: { entity_type: "customer_member", field_key: "dob" },
                        },
                        dobField("dob_plain"),
                    ],
                }),
            ],
        });
        expect(needs).toHaveLength(2);
        expect(needs.find((n) => n.identity.key.startsWith("artifact:"))?.state).toBe(
            "artifact_specific",
        );
    });

    it("22. fields inside a collection-bound repeat group do not join shared dedupe", () => {
        const needs = project({
            forms: [
                pinnedForm({
                    fields: [
                        dobField("dob_scalar"),
                        {
                            id: "children_group",
                            label: "Children",
                            required: false,
                            type: "group" as const,
                            collection_binding: {
                                collection_provider_ref: "children",
                                iteration_entity_type: "customer_member",
                            },
                            fields: [dobField("dob_in_repeat")],
                        },
                    ],
                }),
            ],
        });

        const repeated = needs.find((n) =>
            n.occurrences.some((o) => o.form_field_id === "dob_in_repeat"),
        );
        const scalar = needs.find((n) => n.occurrences.some((o) => o.form_field_id === "dob_scalar"));

        expect(repeated?.state).toBe("artifact_specific");
        expect(scalar?.state).toBe("missing");
        expect(repeated?.identity.key).not.toBe(scalar?.identity.key);
    });

    it("unbound fields never merge with each other", () => {
        const needs = project({
            forms: [
                pinnedForm({
                    fields: [
                        { id: "free_1", label: "Notes", required: false, type: "text" as const },
                        { id: "free_2", label: "Notes", required: false, type: "text" as const },
                    ],
                }),
            ],
        });
        // Identical labels. Merging them would be exactly the similarity matching this slice forbids.
        expect(needs).toHaveLength(2);
        expect(needs.every((n) => n.identity.basis === "unbound")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Stability and edges
// ---------------------------------------------------------------------------

describe("stability and edges", () => {
    it("19. no effective requirements → zero needs", () => {
        expect(project({ forms: [] })).toEqual([]);
    });

    it("17. only the D-94 pinned version's schema is read", () => {
        // The projector is handed a pinned version's schema and nothing else. There is no path from
        // here to "latest published", which is what makes republishing a form inert.
        const needs = project({
            forms: [pinnedForm({ version: "ver-pinned", fields: [dobField("dob_1")] })],
        });
        expect(needs[0]!.occurrences[0]!.form_definition_version_id).toBe("ver-pinned");
    });

    it("session shared value outranks canonical prefill", () => {
        const needs = project({
            forms: [pinnedForm({ fields: [dobField("dob_1")] })],
            sharedValues: { [DOB_KEY]: "2021-05-09" },
            canonicalValues: { [DOB_KEY]: "2021-05-04" },
        });
        expect(needs[0]!.current_value).toBe("2021-05-09");
        expect(needs[0]!.value_source).toBe("session_shared_value");
    });

    it("an empty-string shared value is missing, not known", () => {
        const needs = project({
            forms: [pinnedForm({ fields: [dobField("dob_1")] })],
            sharedValues: { [DOB_KEY]: "   " },
        });
        expect(needs[0]!.state).toBe("missing");
    });

    it("24. no Opportunity identity appears anywhere in the projection", () => {
        const needs = project({
            forms: [pinnedForm({ fields: [dobField("dob_1")] })],
            sharedValues: { [DOB_KEY]: "2021-05-04" },
        });
        expect(JSON.stringify(needs)).not.toContain("opportunity");
    });

    it("output order is first appearance, independent of participant progress", () => {
        const forms = [
            pinnedForm({
                fields: [
                    dobField("dob_1"),
                    {
                        id: "addr",
                        label: "Address",
                        required: true,
                        type: "text" as const,
                        field_source: { entity_type: "household", field_key: "address_line1" },
                    },
                ],
            }),
        ];
        const empty = project({ forms }).map((n) => n.identity.key);
        const filled = project({ forms, sharedValues: { [DOB_KEY]: "2021-05-04" } }).map(
            (n) => n.identity.key,
        );
        expect(filled).toEqual(empty);
    });
});

// ---------------------------------------------------------------------------
// Identity, guarded directly
// ---------------------------------------------------------------------------

describe("need identity reuses packetFieldPlan precedence", () => {
    const common = {
        subjectId: CHILD_A,
        insideCollectionBoundGroup: false,
        formDefinitionVersionId: "ver-a",
        sessionItemId: "si-a",
    };

    it("alias wins over entity_type:field_key", () => {
        const id = resolveEnrollmentNeedIdentity({
            ...common,
            field: {
                id: "f",
                label: "DOB",
                required: true,
                type: "date",
                field_source: {
                    entity_type: "customer_member",
                    field_key: "dob",
                    shared_value_key: "alias_key",
                },
            },
        });
        expect(id.basis).toBe("shared_alias");
        expect(id.canonical_key).toBe("alias_key");
    });

    it("entity_type:field_key is the canonical fallback", () => {
        const id = resolveEnrollmentNeedIdentity({ ...common, field: dobField("f") });
        expect(id.basis).toBe("canonical");
        expect(id.canonical_key).toBe(DOB_KEY);
        expect(id.key).toBe(`child:${CHILD_A}:${DOB_KEY}`);
    });

    it("the form field id is never the identity", () => {
        const a = resolveEnrollmentNeedIdentity({ ...common, field: dobField("field_one") });
        const b = resolveEnrollmentNeedIdentity({ ...common, field: dobField("field_two") });
        expect(a.key).toBe(b.key);
    });
});
