/**
 * WHAT A CLOSED QUESTION OFFERS, AND WHAT IT STORES.
 *
 * Both defects these guard were found by walking the real participant conversation over a Form
 * authored in the real Studio:
 *
 *   an inline choice authored as `{ value: "option_1", label: "Yes" }` reached the family as a
 *   button reading `option_1`, because the need projection collapsed every choice to its value and
 *   typed the result `readonly string[]`;
 *
 *   a field authored with `option_set_key: "person_gender"` reached the family as a FREE TEXT BOX,
 *   because nothing in the Enrollment path read `option_set_key` at all — and every branch that
 *   offers a select is written as "is a select AND has choices".
 *
 * The second is the more serious: it silently converted a vocabulary-constrained fact into prose.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    authoredChoices,
    choiceLabel,
    choiceLabels,
    choiceValueFor,
    choiceValues,
    optionSetKeyOf,
    optionSetKeysInSchema,
    resolveFieldChoices,
} from "@/lib/enrollment/informationNeeds/participantChoices";
import { valueControlForTurn } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { semanticEditorFor } from "@/lib/enrollment/participantRuntime/semanticValueEditor";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";

const YES_NO_FIELD = {
    id: "tshirt",
    type: "select" as const,
    label: "T-shirt size",
    required: false,
    static_options: [
        { value: "option_1", label: "Yes" },
        { value: "option_2", label: "No" },
    ],
};

const VOCAB_FIELD = {
    id: "gender",
    type: "select" as const,
    label: "Child gender",
    required: false,
    option_set_key: "person_gender",
};

const PERSON_GENDER = [
    { value: "female", label: "Female" },
    { value: "male", label: "Male" },
    { value: "nonbinary", label: "Non-binary" },
];

function turn(overrides: Record<string, unknown>) {
    return {
        kind: "collect_missing_value",
        prompt: "",
        proposed_value: null,
        resolves_occurrences: 1,
        input_type: "select",
        label: "A question",
        options: [],
        ...overrides,
    } as never;
}

describe("inline authored choices", () => {
    it("carries the label beside the value across the boundary", () => {
        expect(authoredChoices(YES_NO_FIELD)).toEqual([
            { value: "option_1", label: "Yes" },
            { value: "option_2", label: "No" },
        ]);
    });

    it("presents the participant the LABEL, never the stored value", () => {
        const control = valueControlForTurn(turn({ options: authoredChoices(YES_NO_FIELD) }));
        if (control.kind !== "options") throw new Error("a select with choices is an options control");
        expect(control.options.map((o) => o.label)).toEqual(["Yes", "No"]);
        // The defect, stated: no label a family reads may be the canonical key.
        expect(control.options.map((o) => o.label)).not.toContain("option_1");
    });

    it("keeps the authored canonical value for storage and validation", () => {
        const choices = authoredChoices(YES_NO_FIELD);
        expect(choiceValues(choices)).toEqual(["option_1", "option_2"]);
        expect(choiceValueFor(choices, "Yes")).toBe("option_1");
        // A parent may say the words; the stored value stays canonical.
        expect(choiceValueFor(choices, "no")).toBe("option_2");
        expect(choiceValueFor(choices, "Maybe")).toBeNull();
    });

    it("reads back the words for a stored value — the artifact's presentation", () => {
        const choices = authoredChoices(YES_NO_FIELD);
        expect(choiceLabel(choices, "option_1")).toBe("Yes");
        expect(choiceLabels(choices, ["option_1", "option_2"])).toEqual(["Yes", "No"]);
        // An answer with no matching choice still prints — hiding it is worse than showing a key.
        expect(choiceLabel(choices, "option_9")).toBe("option_9");
    });

    it("a legacy list of plain strings is still a list of choices", () => {
        expect(authoredChoices({ static_options: ["Morning", "Afternoon"] })).toEqual([
            { value: "Morning", label: "Morning" },
            { value: "Afternoon", label: "Afternoon" },
        ]);
    });
});

describe("an organization option set", () => {
    it("is recognised as a reference, not as a list", () => {
        expect(optionSetKeyOf(VOCAB_FIELD)).toBe("person_gender");
        expect(authoredChoices(VOCAB_FIELD)).toEqual([]);
    });

    it("resolves through the vocabulary the caller loaded from the canonical authority", () => {
        const { choices, unresolved } = resolveFieldChoices(VOCAB_FIELD, { person_gender: PERSON_GENDER });
        expect(unresolved).toBe(false);
        expect(choices.map((c) => c.label)).toEqual(["Female", "Male", "Non-binary"]);
        expect(choices.map((c) => c.value)).toEqual(["female", "male", "nonbinary"]);
    });

    it("reaches the participant as real choices, never as free text", () => {
        const { choices } = resolveFieldChoices(VOCAB_FIELD, { person_gender: PERSON_GENDER });
        const control = valueControlForTurn(turn({ options: choices }));
        expect(control.kind).toBe("options");
        if (control.kind !== "options") throw new Error("unreachable");
        expect(control.options.map((o) => o.label)).toContain("Female");
    });

    it("is not copied into the Form — the reference stays authoritative", () => {
        // Nothing the resolver returns is written back onto the field.
        const before = JSON.stringify(VOCAB_FIELD);
        resolveFieldChoices(VOCAB_FIELD, { person_gender: PERSON_GENDER });
        expect(JSON.stringify(VOCAB_FIELD)).toBe(before);
    });

    it("an inline list wins over a reference — a field carrying its own choices defers to nobody", () => {
        const both = { ...YES_NO_FIELD, option_set_key: "person_gender" };
        const { choices } = resolveFieldChoices(both, { person_gender: PERSON_GENDER });
        expect(choices.map((c) => c.label)).toEqual(["Yes", "No"]);
    });

    it("every key a schema references is collected for one round trip", () => {
        const schema = {
            schema_version: 1,
            title: "Cert",
            sections: [{ id: "s1", title: "S", field_ids: ["gender", "tshirt", "grp"] }],
            fields: [
                VOCAB_FIELD,
                YES_NO_FIELD,
                {
                    id: "grp",
                    type: "group",
                    label: "People",
                    required: false,
                    fields: [{ id: "rel", type: "select", label: "Relationship", required: false, option_set_key: "person_child_relationship_type" }],
                },
            ],
        } as unknown as FormSchemaV1;
        expect([...optionSetKeysInSchema(schema)].sort()).toEqual(["person_child_relationship_type", "person_gender"]);
        // A field with its own list references nothing.
        expect(optionSetKeysInSchema(schema)).not.toContain("tshirt");
    });
});

describe("a vocabulary that cannot be resolved fails CLOSED", () => {
    it("is reported as unresolved rather than as having no choices", () => {
        const { choices, unresolved } = resolveFieldChoices(VOCAB_FIELD, {});
        expect(choices).toEqual([]);
        expect(unresolved).toBe(true);
    });

    it("an absent vocabulary map is not a licence for free text", () => {
        expect(resolveFieldChoices(VOCAB_FIELD, undefined).unresolved).toBe(true);
    });

    it("a field that never named a vocabulary is genuinely open, and says so", () => {
        expect(resolveFieldChoices({ id: "x", type: "text", label: "Notes" }, {}).unresolved).toBe(false);
    });

    it("the conversation offers no control at all — not a text box", () => {
        const control = valueControlForTurn(turn({ options: [], vocabulary_unresolved: true }));
        expect(control.kind).toBe("unavailable");
        if (control.kind !== "unavailable") throw new Error("unreachable");
        expect(control.reason).toMatch(/could not be loaded/i);
    });

    it("the free-text fallback is still there for a field that is genuinely free text", () => {
        const control = valueControlForTurn(turn({ input_type: "text", options: [] }));
        expect(control.kind).toBe("value");
    });
});

describe("correcting a closed answer uses the same vocabulary", () => {
    it("the Change editor offers choices with labels", () => {
        const editor = semanticEditorFor({
            canonicalKey: null,
            inputType: "select",
            options: PERSON_GENDER,
            value: "female",
        });
        expect(editor.kind).toBe("options");
        if (editor.kind !== "options") throw new Error("unreachable");
        expect(editor.options.map((o) => o.label)).toContain("Female");
    });

    it("a yes/no question is still corrected with its two answers", () => {
        const editor = semanticEditorFor({ canonicalKey: null, inputType: "boolean", options: [], value: null });
        expect(editor.kind).toBe("options");
        if (editor.kind !== "options") throw new Error("unreachable");
        expect(editor.options).toEqual([
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
        ]);
    });
});

describe("the surfaces read the label and submit the value", () => {
    const CARD = join(process.cwd(), "app/forms/embed/[token]/EnrollmentConversationCard.tsx");
    const REVIEW = join(process.cwd(), "app/forms/embed/[token]/CompiledArtifactReview.tsx");

    it("the conversation button's words are the label and its answer is the value", () => {
        const src = readFileSync(CARD, "utf8");
        expect(src).toContain("label: option.label");
        expect(src).toContain("submit({ value: option.value, settledAs: option.label })");
    });

    it("the option elements render the label and carry the value", () => {
        const src = readFileSync(CARD, "utf8");
        expect(src).toContain("<option key={option.value} value={option.value}>{option.label}</option>");
    });

    it("the filed artifact review prints the human label", () => {
        const src = readFileSync(REVIEW, "utf8");
        expect(src).toContain("control.display_value");
    });

    it("the generated document resolves choices rather than printing the stored key", () => {
        const src = readFileSync(join(process.cwd(), "lib/forms/pdf/generation/generatedDocumentComposer.ts"), "utf8");
        expect(src).toContain("resolveFieldChoices(field, optionSets)");
        expect(src).toContain("choiceLabels(choices, raw)");
    });

    it("the option sets come from the canonical authority, at the async boundary", () => {
        /*
         * THE CALL, NOT THE NAME.
         *
         * An earlier version of this test asserted the file merely CONTAINED
         * `resolveOptionSetsForOrg` — and stayed green when the call and its import were both
         * deleted, because the identifier still appeared in a comment explaining why it is the
         * authority. A planted removal must fail, so this binds on the invocation itself.
         */
        const needs = readFileSync(join(process.cwd(), "lib/enrollment/informationNeeds/resolveEnrollmentInformationNeeds.ts"), "utf8");
        expect(needs).toContain('import { resolveOptionSetsForOrg } from "@/lib/fields/resolveOptionSetOptions";');
        expect(needs).toMatch(/await resolveOptionSetsForOrg\(\s*supabase,\s*input\.orgId,/);
        expect(needs).toMatch(/optionSetKeysInSchema\(f\.schema\)/);
        // Conversation-specific vocabulary registries are exactly what this must not become.
        expect(needs).not.toMatch(/from "@\/lib\/enrollment\/[^"]*optionSet/i);
    });

    it("and the document resolves them the same way, from the same authority", () => {
        const doc = readFileSync(join(process.cwd(), "lib/enrollment/participantRuntime/renderParticipantEnrollmentDocument.ts"), "utf8");
        expect(doc).toContain('import { resolveOptionSetsForOrg } from "@/lib/fields/resolveOptionSetOptions";');
        expect(doc).toMatch(/await resolveOptionSetsForOrg\(\s*supabase,\s*input\.orgId,/);
        expect(doc).toMatch(/optionSets:\s*documentOptionSets/);
    });
});

describe("the need projection carries what a question offers", () => {
    const schema = {
        schema_version: 1,
        title: "Cert",
        sections: [{ id: "s1", title: "S", field_ids: ["tshirt", "gender"] }],
        fields: [YES_NO_FIELD, VOCAB_FIELD],
    } as unknown as FormSchemaV1;

    const project = (optionSets?: Record<string, { value: string; label: string }[]>) =>
        projectEnrollmentInformationNeeds({
            forms: [
                {
                    requirement_id: "req-1",
                    form_definition_id: "form-1",
                    form_definition_version_id: "ver-1",
                    session_item_id: "item-1",
                    schema,
                    pdfMapping: null,
                },
            ],
            subjectId: "child-1",
            sharedValues: {},
            confirmations: {},
            ...(optionSets ? { optionSets } : {}),
        } as never);

    const occurrenceFor = (needs: ReturnType<typeof project>, fieldId: string) =>
        needs.flatMap((n) => n.occurrences).find((o) => o.form_field_id === fieldId) ?? null;

    it("an inline choice reaches the need with its label intact", () => {
        const occ = occurrenceFor(project(), "tshirt");
        expect(occ?.options).toEqual([
            { value: "option_1", label: "Yes" },
            { value: "option_2", label: "No" },
        ]);
        expect(occ?.vocabulary_unresolved).toBeUndefined();
    });

    it("an organization vocabulary reaches the need once the caller resolved it", () => {
        const occ = occurrenceFor(project({ person_gender: PERSON_GENDER }), "gender");
        expect(occ?.options.map((o) => o.label)).toEqual(["Female", "Male", "Non-binary"]);
        expect(occ?.vocabulary_unresolved).toBeUndefined();
    });

    it("an unresolved vocabulary is marked, so nothing downstream reads it as open", () => {
        const occ = occurrenceFor(project(), "gender");
        expect(occ?.options).toEqual([]);
        expect(occ?.vocabulary_unresolved).toBe(true);
    });
});

describe("the readers are total", () => {
    /*
     * A persisted payload or an older caller can still hand over the flat list of strings this
     * model replaced. `c.value.toLowerCase()` on one of those THREW, inside validation — turning a
     * shape mismatch into a crash on a question a parent was trying to answer.
     */
    const legacy = ["Morning", "Afternoon"] as unknown as { value: string; label: string }[];

    it("a flat string list is read as choices rather than crashing", () => {
        expect(choiceValues(legacy)).toEqual(["Morning", "Afternoon"]);
        expect(choiceValueFor(legacy, "morning")).toBe("Morning");
        expect(choiceLabel(legacy, "Afternoon")).toBe("Afternoon");
        expect(choiceLabels(legacy, ["Morning"])).toEqual(["Morning"]);
    });

    it("a malformed entry is skipped, not turned into an empty answer", () => {
        const junk = [{ value: "a", label: "A" }, {}, null] as unknown as { value: string; label: string }[];
        expect(choiceValues(junk)).toEqual(["a"]);
        expect(choiceValueFor(junk, "A")).toBe("a");
    });
});
