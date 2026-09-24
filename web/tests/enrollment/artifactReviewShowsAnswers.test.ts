/**
 * WHAT A PARENT READS ON THEIR OWN PAPERWORK, AND WHAT THEY ARE OFFERED TO CHANGE.
 *
 * Three findings from the real review surface at the end of the certification, all one class: a
 * surface showing the platform's bookkeeping, or offering to edit something the family never
 * answered.
 *
 *   `__absence__` was printed where the parent had answered "No known food sensitivities", and
 *   pressing Edit seeded that literal string into the box — so saving would have collapsed "they
 *   told us there are none" into prose that happens to spell the sentinel.
 *
 *   "Age at enrollment" (derived) and "Registration fee" (configuration-supplied) were offered as
 *   editable inputs whose contents the next render discards. `classify` tested only `read_only`,
 *   while `formFieldAsksParticipant` — the one owner of "is this the family's question" — already
 *   knew about both.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileParticipantArtifact } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import { ABSENCE_VALUE } from "@/lib/forms/fieldSemantics";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const field = (o: Record<string, unknown>) => o as unknown as FormField;

const schema = {
    fields: [
        field({
            id: "sensitivities",
            type: "text",
            label: "Food sensitivities",
            required: false,
            absence: { offered: true, label: "No known food sensitivities" },
            field_source: { entity_type: "child", field_key: "food_sensitivities" },
        }),
        field({
            id: "age",
            type: "text",
            label: "Age at enrollment",
            required: false,
            derived: { kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "today" },
            field_source: { entity_type: "child", field_key: "age_at_enrollment" },
        }),
        field({
            id: "fee",
            type: "number",
            label: "Registration fee",
            required: false,
            supplied_by: { source_kind: "charge_template", source_key: "registration_fee", resolve_at: "generation" },
            field_source: { entity_type: "enrollment", field_key: "registration_fee" },
        }),
        field({
            id: "shirt",
            type: "select",
            label: "T-shirt size",
            required: false,
            static_options: [{ value: "option_1", label: "Yes" }],
            field_source: { entity_type: "child", field_key: "tshirt_size" },
        }),
        field({
            id: "notes",
            type: "text",
            label: "Anything else",
            required: false,
            field_source: { entity_type: "child", field_key: "notes" },
        }),
    ],
} as unknown as FormSchemaV1;

const compile = () =>
    compileParticipantArtifact(schema, {
        sensitivities: ABSENCE_VALUE,
        age: "5 yrs 5 mos",
        fee: "$75.00",
        shirt: "option_1",
        notes: "Naps after lunch.",
    } as never);

const control = (id: string) => {
    const a = compile();
    return a.sections.flatMap((s) => s.controls).find((c) => c.field_id === id) ?? null;
};

describe("the absence answer reads as its authored words", () => {
    it("prints the words the family chose, never the sentinel", () => {
        expect(control("sensitivities")?.display_value).toBe("No known food sensitivities");
    });

    it("the canonical value is still the sentinel — three states, not two", () => {
        // Unanswered, explicitly-none and a real detail must stay distinguishable downstream.
        expect(control("sensitivities")?.value).toBe(ABSENCE_VALUE);
    });

    it("no control anywhere on the artifact exposes the sentinel as its words", () => {
        const a = compile();
        for (const c of a.sections.flatMap((s) => s.controls)) {
            expect(c.display_value).not.toContain(ABSENCE_VALUE);
        }
    });

    it("falls back to the platform's word when a Form offered absence without naming it", () => {
        const bare = { fields: [field({ id: "x", type: "text", label: "Allergies", required: false, absence: { offered: true }, field_source: { entity_type: "child", field_key: "allergies" } })] } as unknown as FormSchemaV1;
        const a = compileParticipantArtifact(bare, { x: ABSENCE_VALUE } as never);
        expect(a.sections.flatMap((s) => s.controls)[0]!.display_value).toBe("None");
    });

    it("the edit box is never seeded with the sentinel", () => {
        const src = readFileSync(join(process.cwd(), "app/forms/embed/[token]/CompiledArtifactReview.tsx"), "utf8");
        expect(src).toMatch(/isAbsenceValue\(control\.value\)\s*\n?\s*\?\s*""/);
    });
});

describe("a value the family never supplies is placed, not offered for editing", () => {
    it("a derived value prints but carries no box", () => {
        // It IS on their paperwork, so it must still render.
        expect(control("age")?.display_value).toBe("5 yrs 5 mos");
        expect(control("age")?.participant_editable).toBe(false);
    });

    it("a configuration-supplied value prints but carries no box either", () => {
        expect(control("fee")?.display_value).toBe("$75.00");
        expect(control("fee")?.participant_editable).toBe(false);
    });

    it("an ordinary question IS editable, so the flag is not simply off everywhere", () => {
        expect(control("notes")?.participant_editable).toBe(true);
        expect(control("shirt")?.participant_editable).toBe(true);
        expect(control("sensitivities")?.participant_editable).toBe(true);
    });

    it("the review renders no Edit affordance for a fact the family does not supply", () => {
        const src = readFileSync(join(process.cwd(), "app/forms/embed/[token]/CompiledArtifactReview.tsx"), "utf8");
        expect(src).toContain("onEdit={!control.participant_editable ? null :");
    });

    it("an UNVALUED derived or supplied field is not presented as work at all", () => {
        // How they actually arrive: the value is computed when the document is generated, so the
        // artifact payload holds nothing — and they used to appear as empty boxes to fill in.
        const a = compileParticipantArtifact(schema, { notes: "x" } as never);
        expect(a.outstanding.map((c) => c.field_id)).not.toContain("age");
        expect(a.outstanding.map((c) => c.field_id)).not.toContain("fee");
    });

    it("the classifier asks the one owner rather than testing read_only alone", () => {
        const src = readFileSync(join(process.cwd(), "lib/enrollment/participantRuntime/compileParticipantArtifact.ts"), "utf8");
        expect(src).toContain("if (!formFieldAsksParticipant(field)) {");
    });

    it("an ordinary answered question stays correctable", () => {
        expect(control("notes")?.kind).toBe("resolved_shared_value");
        expect(control("notes")?.display_value).toBe("Naps after lunch.");
    });

    it("a closed answer reads as its label on the review, and stores its value", () => {
        expect(control("shirt")?.display_value).toBe("Yes");
        expect(control("shirt")?.value).toBe("option_1");
    });
});

describe("no surface shows the absence sentinel", () => {
    const ENGINE = join(process.cwd(), "components/forms/engine/FormEngineRenderer.tsx");
    const FACTS = join(process.cwd(), "app/forms/embed/[token]/SemanticFactEditor.tsx");
    const REVIEW = join(process.cwd(), "app/forms/embed/[token]/CompiledArtifactReview.tsx");

    it("the Forms engine renders the authored words, not a box containing the sentinel", () => {
        const src = readFileSync(ENGINE, "utf8");
        expect(src).toContain("const absent = isAbsenceValue(raw);");
        // The read-only row stands in for the editable control when the answer is an absence, so
        // the sentinel can never reach an input's value.
        expect(src).toContain("if (readonly || absent) {");
        expect(src).toMatch(/absent\s*\n?\s*\?\s*absentWords/);
    });

    it("and offers a way back, so an absence is not permanent on the review surface", () => {
        const src = readFileSync(ENGINE, "utf8");
        expect(src).toContain('data-absence-withdraw={field.id}');
        expect(src).toContain('onCellChange(field.id, "")');
    });

    it("both fact surfaces print display_value and never seed the sentinel", () => {
        for (const path of [FACTS, REVIEW]) {
            const src = readFileSync(path, "utf8");
            expect(src).toContain("control.display_value");
            expect(src).toMatch(/isAbsenceValue\(control\.value\)/);
        }
    });
});
