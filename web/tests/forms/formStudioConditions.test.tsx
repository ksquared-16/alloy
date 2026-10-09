import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingFormCanvas from "@/app/adminV2/pos/ProcessingFormCanvas";
import ProcessingFormQuestionInspector from "@/app/adminV2/pos/ProcessingFormQuestionInspector";
import {
    conditionTriggerOf,
    conditionValueOf,
    eligibleConditionTriggers,
    removeField,
    setFieldVisibility,
} from "@/lib/forms/formBuilderSchema";
import { evaluateFieldVisibility, type FormPayload } from "@/lib/forms/validateSubmission";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { buildDraftSavePayload } from "@/lib/pos/formDraft/buildDraftSavePayload";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { editFromSchemaField } from "@/lib/pos/formDraft/importedFormMappingView";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

/**
 * The conditional capability was built from the bottom up and never reached the top.
 *
 * Persistence worked, the published schema carried it, and the participant renderer really did hide the
 * field. What never existed was any way to SEE or SET it while authoring: the canonical canvas referenced
 * `visibility` zero times, and so did the canonical inspector. These tests cover the authoring half, on
 * BOTH paths, because both use the same canvas, inspector and schema authority.
 */

const manual: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [{ id: "s1", title: "Family", field_ids: ["siblings", "list", "name"] }],
    fields: [
        { id: "siblings", type: "boolean", label: "Does your child have siblings?", required: true },
        { id: "list", type: "text", label: "If yes, please list siblings", required: false },
        { id: "name", type: "text", label: "Child name", required: true },
    ],
} as unknown as FormSchemaV1;

describe("the shared schema authority can author a condition", () => {
    it("offers a yes/no question as a trigger, with its two answers", () => {
        const triggers = eligibleConditionTriggers(manual, "list");
        expect(triggers.map((t) => t.id)).toContain("siblings");
        expect(triggers.find((t) => t.id === "siblings")!.answers.map((a) => a.label)).toEqual(["Yes", "No"]);
    });

    it("never offers a question as its own trigger", () => {
        expect(eligibleConditionTriggers(manual, "siblings").map((t) => t.id)).not.toContain("siblings");
    });

    it("sets and reads back the condition", () => {
        const next = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
        const field = next.fields.find((f) => f.id === "list")!;
        expect(conditionTriggerOf(field)).toBe("siblings");
        expect(conditionValueOf(field)).toBe(true);
    });

    it("clears it, which means the question is always asked", () => {
        const set = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
        const cleared = setFieldVisibility(set, "list", null);
        expect(conditionTriggerOf(cleared.fields.find((f) => f.id === "list")!)).toBeNull();
    });

    it("refuses a trigger that is not on the form, rather than writing an unsaveable schema", () => {
        const next = setFieldVisibility(manual, "list", { triggerFieldId: "ghost", value: true });
        expect(conditionTriggerOf(next.fields.find((f) => f.id === "list")!)).toBeNull();
    });

    it("offers a conditional question as somebody else's trigger — the runtime evaluates chains", () => {
        const withCondition = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
        expect(eligibleConditionTriggers(withCondition, "name").map((t) => t.id)).toContain("list");
    });

    it("never offers a question that depends on this one — that would be a cycle", () => {
        const withCondition = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
        expect(eligibleConditionTriggers(withCondition, "siblings").map((t) => t.id)).not.toContain("list");
    });

    it("leaves no dangling condition when the trigger question is removed", () => {
        const withCondition = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
        const pruned = removeField(withCondition, "siblings");
        // A rule naming a deleted field evaluates as "never show", which would silently lose the
        // follow-up. Clearing it means the question is simply always asked.
        expect(conditionTriggerOf(pruned.fields.find((f) => f.id === "list")!)).toBeNull();
        expect(safeParseFormSchema(pruned).success).toBe(true);
    });

    it("produces a schema the validator accepts", () => {
        const next = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
        expect(safeParseFormSchema(next).success).toBe(true);
    });
});

describe("the condition is visible on the shared canvas", () => {
    const withCondition = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
    const html = renderToStaticMarkup(
        <ProcessingFormCanvas
            schema={withCondition}
            selectedFieldId={null}
            selectedSectionId={null}
            editable
            onSelectField={() => {}}
            onSelectSection={() => {}}
            onAddQuestion={() => {}}
            onAddSection={() => {}}
        />,
    );

    it("names the controlling question and the triggering answer", () => {
        expect(html).toContain('data-canvas-field-condition="list"');
        expect(html).toContain("Only asked when");
        expect(html).toContain("Does your child have siblings?");
        expect(html).toContain("Yes");
    });

    it("shows the conditional question as a dependent of its trigger", () => {
        const at = html.indexOf('data-canvas-field-condition="list"');
        expect(at).toBeGreaterThan(html.indexOf('form-canvas-question-siblings'));
        expect(html).toContain("border-l-alloy-bend-pine/30");
    });

    it("says nothing about a question that has no condition", () => {
        expect(html).not.toContain('data-canvas-field-condition="name"');
    });

    it("exposes no schema vocabulary", () => {
        for (const leak of ["visibility", "field_id", '"op"', "visible_when"]) {
            expect(html, `leaked ${leak}`).not.toContain(leak);
        }
    });
});

describe("the condition is editable in the shared inspector", () => {
    const withCondition = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
    const html = renderToStaticMarkup(
        <ProcessingFormQuestionInspector
            field={withCondition.fields.find((f) => f.id === "list")!}
            schema={withCondition}
            editable
            mutate={() => {}}
            onRemove={() => {}}
        />,
    );

    it("asks the question in business language", () => {
        expect(html).toContain("Show this question when");
        expect(html).toContain('data-inspector-condition-question');
        expect(html).toContain('data-inspector-condition-answer');
    });

    it("offers the controlling question and the answer that reveals it", () => {
        expect(html).toContain("Does your child have siblings?");
        expect(html).toContain("Yes");
    });

    it("offers a way back to always asking it", () => {
        expect(html).toContain("data-inspector-condition-clear");
        expect(html).toContain("Always ask this question");
    });

    it("exposes no internal schema terms", () => {
        for (const leak of ["visibility", "visible_when", '"op"', "entity_type", "field_key"]) {
            expect(html, `leaked ${leak}`).not.toContain(leak);
        }
    });

    it("is the same inspector a hand-built form uses", () => {
        const builder = web("app/adminV2/pos/ProcessingFormBuilder.tsx");
        const imported = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(builder).toContain('from "./ProcessingFormQuestionInspector"');
        expect(imported).toContain('from "./ProcessingFormQuestionInspector"');
    });
});

describe("the participant runtime honours it", () => {
    const withCondition = setFieldVisibility(manual, "list", { triggerFieldId: "siblings", value: true });
    const payload = (values: Record<string, unknown>): FormPayload => ({ values, meta: {} }) as FormPayload;

    it("hides the follow-up until the trigger answer matches", () => {
        expect(evaluateFieldVisibility("list", withCondition, (id) => payload({ siblings: false }).values[id])).toBe(false);
        expect(evaluateFieldVisibility("list", withCondition, (id) => payload({ siblings: true }).values[id])).toBe(true);
    });

    it("always shows a question with no condition", () => {
        expect(evaluateFieldVisibility("name", withCondition, () => undefined)).toBe(true);
    });

    it("is wired into the renderer families actually use", () => {
        expect(web("components/forms/engine/FormEngineRenderer.tsx")).toContain("evaluateFieldVisibility");
    });
});

describe("an imported condition survives the whole round trip", () => {
    const draft = {
        title: "Packet",
        generated_form_name: "Packet",
        source_document_id: "doc-1",
        sections: [{ id: "section_1", title: "Family", field_ids: ["field_1", "field_2"], disposition: "fields" }],
        fields: [
            { id: "field_1", label: "Does your child have siblings?", type: "boolean", required: true, confidence: "high" },
            { id: "field_2", label: "If yes, please list siblings", type: "text", required: false, confidence: "high" },
        ],
    } as unknown as StoredFormDraftPreview;

    it("an unaccepted suggestion does not hide anything", () => {
        const schema = safeParseFormSchema(draftFormToFormSchemaV1(draft));
        expect(schema.success).toBe(true);
        if (!schema.success) return;
        // Detection alone is a suggestion: the follow-up is still asked of every family.
        expect(conditionTriggerOf(schema.data.fields.find((f) => f.id === "field_2")!)).toBeNull();
        expect(evaluateFieldVisibility("field_2", schema.data, () => undefined)).toBe(true);
    });

    it("an accepted condition reaches the draft, the rebuild, the schema and the runtime", () => {
        // Authored in the inspector → carried by the edit → posted → rebuilt by the server.
        const authored = setFieldVisibility(
            safeParseFormSchema(draftFormToFormSchemaV1(draft)).success
                ? (safeParseFormSchema(draftFormToFormSchemaV1(draft)) as { data: FormSchemaV1 }).data
                : manual,
            "field_2",
            { triggerFieldId: "field_1", value: true },
        );
        const edit = editFromSchemaField(authored.fields.find((f) => f.id === "field_2")!);
        expect(edit.visible_when).toEqual({ field_id: "field_1", op: "eq", value: true });

        const built = buildDraftSavePayload(draft, new Map([["field_2", { visible_when: edit.visible_when }]]));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const rebuilt = buildManualFormDraft({
            title: built.payload.title,
            sourceDocumentId: "doc-1",
            fields: built.payload.fields.map((f) => ({ ...f, bbox: undefined })),
            sectionDispositions: [{ title: "Family", disposition: "fields" }],
        });
        expect(rebuilt.fields.find((f) => f.id === "field_2")!.visible_when).toEqual({ field_id: "field_1", op: "eq", value: true });

        const published = safeParseFormSchema(draftFormToFormSchemaV1(rebuilt));
        expect(published.success).toBe(true);
        if (!published.success) return;
        expect(conditionTriggerOf(published.data.fields.find((f) => f.id === "field_2")!)).toBe("field_1");
        expect(evaluateFieldVisibility("field_2", published.data, (id) => (id === "field_1" ? false : undefined))).toBe(false);
    });

    it("clearing a condition is saved rather than silently restored", () => {
        const withCondition = { ...draft, fields: draft.fields.map((f) => (f.id === "field_2" ? { ...f, visible_when: { field_id: "field_1", op: "eq" as const, value: true } } : f)) } as StoredFormDraftPreview;
        const built = buildDraftSavePayload(withCondition, new Map([["field_2", { visible_when: null }]]));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields[1]).not.toHaveProperty("visible_when");
    });

    it("survives an unrelated mapping change", () => {
        const withCondition = { ...draft, fields: draft.fields.map((f) => (f.id === "field_2" ? { ...f, visible_when: { field_id: "field_1", op: "eq" as const, value: true } } : f)) } as StoredFormDraftPreview;
        const built = buildDraftSavePayload(withCondition, new Map([["field_1", { field_source: { entity_type: "child", field_key: "has_siblings" } }]]));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields[1]!.visible_when).toEqual({ field_id: "field_1", op: "eq", value: true });
    });
});
