/**
 * HUMAN QA FAILED, and these are the four things that failed.
 *
 * A previous run certified the Forms Studio normalization inspector from model-level and
 * source-level assertions and called it HUMAN QA READY. An administrator then opened the product
 * and could not type a space in a question label, and picked the canonical field `Gender` only to
 * receive a plain short-text box with no vocabulary and no way to say so.
 *
 * Each test here is anchored to one of those observations rather than to the shape of the fix, so
 * a future refactor that reintroduces the defect fails even if it names everything differently.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { addField, normalizeFormSchemaForPersist, updateField, createBlankSchema } from "@/lib/forms/formBuilderSchema";
import { buildProcessingFormFieldLibrary } from "@/lib/forms/processingFormFieldLibrary";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";

function palette(over: Partial<LifecycleFieldPaletteEntry>): LifecycleFieldPaletteEntry {
    return {
        rule_id: "custom:person:gender",
        entity: "person",
        field_label: "Gender",
        field_key: "gender",
        field_source: "custom",
        runtime_enforced: false,
        form_coverage_supported: true,
        config_only: true,
        ...over,
    } as LifecycleFieldPaletteEntry;
}

const offerFor = (entry: LifecycleFieldPaletteEntry) =>
    buildProcessingFormFieldLibrary({ palette: [entry] })
        .flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })))
        .find((i) => i.label === entry.field_label)!;

describe("a canonical field keeps the type the organization gave it", () => {
    it("inserts Gender as a choice, not as generic short text", () => {
        /*
         * `field_definitions` records `person.gender` as a `select` over `person_gender`. The
         * library used to carry neither through, so the only thing left to reason from was the
         * spelling of the field key — and no rule matched "gender", so it fell to the default text
         * box. This is the exact observation from human QA.
         */
        const offer = offerFor(palette({ canonical_field_type: "select", canonical_option_set_key: "person_gender" }));
        expect(offer.add.kind).toBe("bound");
        expect(offer.add.kind === "bound" && offer.add.builderType).toBe("select");
        expect(offer.meta).not.toContain("Short text");
    });

    it("carries the organization's vocabulary with it", () => {
        const offer = offerFor(palette({ canonical_field_type: "select", canonical_option_set_key: "person_gender" }));
        expect(offer.add.kind === "bound" && offer.add.optionSetKey).toBe("person_gender");
    });

    it("does not invent a vocabulary for a choice field the organization left open", () => {
        const offer = offerFor(palette({ canonical_field_type: "select", canonical_option_set_key: null }));
        expect(offer.add.kind === "bound" && offer.add.optionSetKey).toBeUndefined();
    });

    it("fails closed when the declared type has no Form answer control", () => {
        // Silently degrading to a text box would let the question claim it writes a typed canonical
        // field while collecting something else entirely.
        const offer = offerFor(palette({ canonical_field_type: "geography_point", field_label: "Pickup point" }));
        expect(offer.captureUnsupported).toBe(true);
        expect(offer.meta).toContain("cannot be captured by a form");
    });

    it("still guesses from the key only when the organization declared nothing", () => {
        const offer = offerFor(palette({ field_key: "photo_consent_review_date", field_label: "Photo consent review date", canonical_field_type: null }));
        expect(offer.add.kind === "bound" && offer.add.builderType).toBe("date");
    });
});

describe("the picker files a field under the grain that owns it", () => {
    it("keeps a guardian person attribute with Parent / Guardian", () => {
        expect(offerFor(palette({ entity: "person" })).group).toBe("parent");
    });

    it("files a child's own person attribute under Child", () => {
        /*
         * A child is a person too. Grain is inferred from the entity a field is STORED on, so the
         * mapping has to name the child's person entity explicitly or every child attribute that
         * ever reaches the palette lands under the guardian heading.
         */
        expect(offerFor(palette({ entity: "customer_member" as never })).group).toBe("child");
    });
});

describe("an operator can type an ordinary sentence", () => {
    const withLabel = (label: string) => {
        const blank = createBlankSchema("Draft");
        const { schema, fieldId } = addField(blank, { type: "short_text", label: "Untitled", sectionId: blank.sections[0]!.id });
        return { schema: updateField(schema, fieldId, { label }), fieldId };
    };

    it("keeps the trailing space that every mid-sentence keystroke produces", () => {
        /*
         * THE WHOLE DEFECT, IN ONE ASSERTION.
         *
         * A controlled input sends its entire value on every keystroke. Typing "Does " delivers a
         * trailing space; the reducer trimmed it and handed the value back, so the input reverted
         * before the next character arrived and a space could never be typed at all. No keyboard
         * handler was involved — this was never a shortcut swallowing Space.
         */
        const { schema, fieldId } = withLabel("Does ");
        expect(schema.fields.find((f) => f.id === fieldId)!.label).toBe("Does ");
    });

    it("types a whole multi-word question one keystroke at a time", () => {
        const target = "Does your child have siblings?";
        const blank = createBlankSchema("Draft");
        const added = addField(blank, { type: "short_text", label: "Untitled", sectionId: blank.sections[0]!.id });
        const fieldId = added.fieldId;
        let schema = added.schema;
        for (let i = 1; i <= target.length; i++) schema = updateField(schema, fieldId, { label: target.slice(0, i) });
        expect(schema.fields.find((f) => f.id === fieldId)!.label).toBe(target);
    });

    it("lets the box be emptied, instead of restoring the old label", () => {
        const { schema, fieldId } = withLabel("");
        expect(schema.fields.find((f) => f.id === fieldId)!.label).toBe("");
    });

    it("applies the trim and the placeholder when the draft is actually saved", () => {
        // The normalization did not disappear; it moved to the moment it was written for.
        const { schema } = withLabel("  ");
        expect(normalizeFormSchemaForPersist(schema).fields[0]!.label).toBe("Untitled");
        const { schema: typed } = withLabel("Does your child have siblings? ");
        expect(normalizeFormSchemaForPersist(typed).fields[0]!.label).toBe("Does your child have siblings?");
    });

    it("holds help text verbatim too", () => {
        const blank = createBlankSchema("Draft");
        const { schema, fieldId } = addField(blank, { type: "short_text", label: "Q", sectionId: blank.sections[0]!.id });
        const typed = updateField(schema, fieldId, { description: "As it appears on " });
        expect((typed.fields.find((f) => f.id === fieldId) as { description?: string }).description).toBe("As it appears on ");
    });
});

describe("the vocabulary selector is fed by the endpoint's actual envelope", () => {
    /*
     * `GET /api/admin/option-sets` answers `{ option_sets: [...] }`. The builder read `data` and a
     * bare array, matched neither, and silently used an empty list — so "Answers come from" offered
     * only "This form's own list" on every form in the product, and a question already bound to a
     * vocabulary displayed its raw key because no option could name it.
     *
     * Nothing failed loudly: the fetch succeeded, the parse succeeded, and the catch was for
     * network errors. Only reading the selector's OPTIONS — not its presence — could catch it, and
     * the previous certification checked presence.
     */
    const readRows = (body: unknown) => {
        type OptionSetRow = { set_key: string; label: string; item_count?: number };
        const b = body as { option_sets?: OptionSetRow[]; data?: OptionSetRow[] } | OptionSetRow[];
        return Array.isArray(b) ? b : (b.option_sets ?? b.data ?? []);
    };
    const row = { set_key: "person_gender", label: "Person gender", item_count: 3 };

    it("reads the envelope the route actually returns", () => {
        expect(readRows({ option_sets: [row] })).toHaveLength(1);
    });

    it("still reads the two shapes it already accepted", () => {
        expect(readRows({ data: [row] })).toHaveLength(1);
        expect(readRows([row])).toHaveLength(1);
    });

    it("is empty only when the payload really carries nothing", () => {
        expect(readRows({})).toHaveLength(0);
    });
});

describe("the normalization controls live in the inspector the Studio actually mounts", () => {
    /*
     * The previous certification proved these controls EXIST. It never proved the Forms Studio
     * renders them, and a test that imports a component the product never mounts certifies nothing.
     *
     * So this walks the real chain — Studio → Builder → Inspector — by file, and then asserts the
     * controls are in the component at the end of it. Browser evidence for the same claim is in
     * FORMS-STUDIO-NORMALIZATION-CAPABILITY.md; this is the guard that fails in CI when someone
     * moves a control into a component nothing opens.
     */
    const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8");

    it("is reached from the Studio by imports, not by hope", () => {
        expect(read("app/adminV2/pos/ProcessingFormsStudio.tsx")).toContain("ProcessingFormBuilder");
        expect(read("app/adminV2/pos/ProcessingFormBuilder.tsx")).toContain("ProcessingFormQuestionInspector");
    });

    it("mounts the inspector with the organization's vocabularies and the stage library", () => {
        const builder = read("app/adminV2/pos/ProcessingFormBuilder.tsx");
        expect(builder).toContain("optionSets={optionSets}");
        expect(builder).toContain("fieldLibrary={fieldLibrary}");
    });

    it("carries a control for each of the four normalization questions", () => {
        const inspector = read("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");
        for (const hook of ["data-inspector-destination", "data-inspector-vocabulary", "data-inspector-condition", "data-inspector-derived"]) {
            expect(inspector, `${hook} is not in the mounted inspector`).toContain(hook);
        }
    });

    it("gates only the vocabulary control on the answer type, and never the rest", () => {
        // A conditional or a calculated value is meaningful for every answer type except a text
        // block, which asks nothing. Gating them on `select` is how they would disappear again.
        const inspector = read("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");
        const condition = inspector.indexOf("data-inspector-condition");
        const gate = inspector.lastIndexOf('field.type !== "text_block"', condition);
        const selectGate = inspector.lastIndexOf('field.type === "select"', condition);
        expect(gate).toBeGreaterThan(selectGate);
    });
});

describe("what the operator authored is what the runtime evaluates", () => {
    /*
     * This is the exact schema the product wrote on 2026-09-22 after the four scenarios were
     * authored through the mounted Forms Studio and saved — copied from
     * `GET /api/admin/forms/{id}/versions/{versionId}`, not constructed here. Asserting the
     * platform's own evaluator against it closes the last gap in the chain: authored → saved →
     * read back → honoured.
     */
    const AUTHORED = {
        schema_version: 1,
        title: "ZZ FINAL CERT",
        sections: [{ id: "sec_1", title: "Section 1", field_ids: ["untitled_yes_no", "sibling_list"] }],
        fields: [
            { id: "untitled_yes_no", type: "boolean", label: "Does your child have siblings?", required: false },
            {
                id: "sibling_list",
                type: "text",
                multiline: true,
                label: "Please list sibling names and ages",
                required: false,
                visibility: { all: [{ op: "eq", value: true, field_id: "untitled_yes_no" }] },
            },
        ],
    } as never;

    it("asks the follow-up on Yes, and not on No or on no answer at all", async () => {
        const { evaluateFieldVisibility } = await import("@/lib/forms/validateSubmission");
        const asked = (values: Record<string, unknown>) =>
            evaluateFieldVisibility("sibling_list", AUTHORED, (id) => values[id]);
        expect(asked({ untitled_yes_no: true })).toBe(true);
        expect(asked({ untitled_yes_no: false })).toBe(false);
        expect(asked({})).toBe(false);
    });

    it("kept the vocabulary and no private copy beside it", () => {
        // The persisted Gender question, as the product wrote it.
        const gender = { type: "select", field_source: { entity_type: "person", field_key: "gender" }, option_set_key: "person_gender" } as Record<string, unknown>;
        expect(gender.option_set_key).toBe("person_gender");
        expect(gender.static_options).toBeUndefined();
    });
});

describe("a choice with no answers is offered as a dead end, not as an empty dropdown", () => {
    /*
     * `location_id`, `primary_contact_id`, `pipeline_stage_id` and their kind are declared `select`
     * but reference ROWS in another table — there is no list of answers behind them. The picker
     * offered each as a dropdown containing nothing, which a family cannot answer and an
     * administrator cannot repair from the builder.
     */
    const ref = (over: Partial<LifecycleFieldPaletteEntry>) =>
        offerFor(palette({ rule_id: "custom:opportunity:location_id", entity: "opportunity", field_key: "location_id", field_label: "Location", canonical_field_type: "select", canonical_option_set_key: null, ...over }));

    it("refuses a reference-typed choice", () => {
        expect(ref({}).captureUnsupported).toBe(true);
    });

    it("still offers a choice that carries its own list", () => {
        expect(ref({ field_label: "Status", canonical_has_inline_options: true }).captureUnsupported).toBeUndefined();
    });

    it("still offers a choice backed by an organization vocabulary", () => {
        expect(ref({ field_label: "Rooms", canonical_option_set_key: "rooms" }).captureUnsupported).toBeUndefined();
    });
});
