import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingFormCanvas from "@/app/adminV2/pos/ProcessingFormCanvas";
import ProcessingFormQuestionInspector from "@/app/adminV2/pos/ProcessingFormQuestionInspector";
import {
    conditionComparisonOf,
    conditionTriggerOf,
    conditionTriggerOptions,
    conditionValueOf,
    describeCondition,
    parseConditionAnswer,
    setFieldVisibility,
    updateField,
} from "@/lib/forms/formBuilderSchema";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { evaluateFieldVisibility, validateFormPayload } from "@/lib/forms/validateSubmission";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { buildDraftSavePayload, buildDraftSavePayloadFromSchema } from "@/lib/pos/formDraft/buildDraftSavePayload";
import {
    changedFieldEdits,
    resolveImportedFormMappings,
} from "@/lib/pos/formDraft/importedFormMappingView";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * Two authoring correctness gaps, measured on deployed staging and closed here.
 *
 * 1. DESTINATION AUTHORITY. The Studio converted a draft to a schema with
 *    `field_source ?? suggestFieldBinding(label, type)`, so a question with NO destination arrived
 *    carrying a guess; the mapping view called it Mapped; and the next unrelated save (Student Date of
 *    Birth → Required) persisted `customer_member:dob` and `customer_member:allergies` onto questions
 *    nobody had mapped. The same save also rebuilt every field's destination without its
 *    `shared_value_key`, quietly changing valid canonical mappings.
 *
 * 2. CONDITIONS. Only yes/no and dropdown questions could control another, a conditional question could
 *    never be a trigger, and the comparison was always "is". The runtime already compares scalars
 *    exactly with `eq` / `neq` and evaluates chains recursively with cycle protection — the authoring
 *    surface now exposes exactly that, and nothing more.
 */

/* ------------------------------------------------------------------ fixtures */

/** The deployed case-C shape: two questions the importer could not store, beside valid mappings. */
const importedDraft = (): StoredFormDraftPreview =>
    ({
        title: "Form",
        generated_form_name: "Form",
        source_document_id: "doc-1",
        sections: [
            {
                id: "section_1",
                title: "Form",
                field_ids: ["field_1", "field_2", "field_3", "field_4"],
                disposition: "fields",
            },
        ],
        fields: [
            {
                id: "field_1",
                label: "How would you describe your child's gender?",
                type: "text",
                required: false,
                confidence: "high",
                evidence: "hosted_form:child_gender",
                field_source: { entity_type: "child", field_key: "gender" },
            },
            {
                id: "field_2",
                label: "Student Date of Birth",
                type: "date",
                required: false,
                confidence: "medium",
                evidence: "hosted_form:dob",
            },
            {
                id: "field_3",
                label: "Does your child have any allergies?",
                type: "text",
                required: false,
                confidence: "low",
                evidence: "hosted_form:allergies",
            },
            {
                id: "field_4",
                label: "Student first name",
                type: "text",
                required: false,
                confidence: "high",
                evidence: "hosted_form:first",
                field_source: {
                    entity_type: "child",
                    field_key: "child_first_name",
                    shared_value_key: "child_first_name",
                },
            },
        ],
    }) as unknown as StoredFormDraftPreview;

function studioSchema(draft: StoredFormDraftPreview): FormSchemaV1 {
    const parsed = safeParseFormSchema(draftFormToFormSchemaV1(draft));
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    return parsed.data;
}

/** The server's rebuild, exactly as the save route performs it. */
function saveAndReload(draft: StoredFormDraftPreview, payload: ReturnType<typeof buildDraftSavePayload>): StoredFormDraftPreview {
    if (!payload.ok) throw new Error(payload.reason);
    return buildManualFormDraft({
        title: payload.payload.title,
        sourceDocumentId: draft.source_document_id ?? "doc-1",
        fields: payload.payload.fields.map((f) => ({ ...f, bbox: undefined })),
        sectionDispositions: [{ title: "Form", disposition: "fields" }],
    });
}

const byLabel = (draft: StoredFormDraftPreview, label: string) => draft.fields.find((f) => f.label === label)!;

/* ------------------------------------------------------------------ phase 1 */

describe("a question with no destination keeps no destination", () => {
    it("the Studio schema carries no guessed destination (was customer_member:dob / :allergies)", () => {
        const schema = studioSchema(importedDraft());
        expect(schema.fields.find((f) => f.id === "field_2")!.field_source).toBeUndefined();
        expect(schema.fields.find((f) => f.id === "field_3")!.field_source).toBeUndefined();
        // Stored destinations are carried exactly.
        expect(schema.fields.find((f) => f.id === "field_1")!.field_source).toEqual({ entity_type: "child", field_key: "gender" });
    });

    it("a confident proposal with nothing stored is shown as Suggested, never Mapped, and applies nothing", () => {
        const draft = importedDraft();
        const mappings = resolveImportedFormMappings(studioSchema(draft), draft);
        const dob = mappings.get("field_2")!;
        expect(dob.state).not.toBe("mapped");
        expect(dob.apply).toBeNull();
        expect(mappings.get("field_1")!.state).toBe("mapped");
    });

    it("an unrelated edit (DOB → Required) sends only that question, and saves no destination anywhere", () => {
        const draft = importedDraft();
        const before = studioSchema(draft);
        const next = updateField(before, "field_2", { required: true });
        const edits = changedFieldEdits(before, next, draft);
        expect([...edits.keys()]).toEqual(["field_2"]);

        const reloaded = saveAndReload(draft, buildDraftSavePayload(draft, edits));
        expect(byLabel(reloaded, "Student Date of Birth").required).toBe(true);
        expect(byLabel(reloaded, "Student Date of Birth").field_source).toBeUndefined();
        expect(byLabel(reloaded, "Does your child have any allergies?").field_source).toBeUndefined();
    });

    it("an unrelated edit leaves existing canonical mappings exactly as they were, shared key included", () => {
        const draft = importedDraft();
        const before = studioSchema(draft);
        const next = updateField(before, "field_2", { required: true });
        const reloaded = saveAndReload(draft, buildDraftSavePayload(draft, changedFieldEdits(before, next, draft)));
        expect(byLabel(reloaded, "Student first name").field_source).toEqual({
            entity_type: "child",
            field_key: "child_first_name",
            shared_value_key: "child_first_name",
        });
        expect(byLabel(reloaded, "How would you describe your child's gender?").field_source).toEqual({
            entity_type: "child",
            field_key: "gender",
        });
    });

    it("even an edit of the mapped question itself keeps its shared value key", () => {
        const draft = importedDraft();
        const before = studioSchema(draft);
        const next = updateField(before, "field_4", { required: true });
        const reloaded = saveAndReload(draft, buildDraftSavePayload(draft, changedFieldEdits(before, next, draft)));
        expect(byLabel(reloaded, "Student first name").field_source?.shared_value_key).toBe("child_first_name");
    });

    it("explicitly choosing a destination saves, survives reload, and reads as Mapped", () => {
        const draft = importedDraft();
        const before = studioSchema(draft);
        const next = updateField(before, "field_3", { field_source: { entity_type: "child", field_key: "allergies" } });
        const reloaded = saveAndReload(draft, buildDraftSavePayload(draft, changedFieldEdits(before, next, draft)));
        expect(byLabel(reloaded, "Does your child have any allergies?").field_source).toEqual({ entity_type: "child", field_key: "allergies" });
        const again = resolveImportedFormMappings(studioSchema(reloaded), reloaded);
        expect(again.get(byLabel(reloaded, "Does your child have any allergies?").id)!.state).toBe("mapped");
    });

    it("explicitly clearing a destination saves, survives reload, and is not re-guessed", () => {
        const draft = importedDraft();
        const before = studioSchema(draft);
        const next = updateField(before, "field_1", { field_source: undefined });
        const reloaded = saveAndReload(draft, buildDraftSavePayload(draft, changedFieldEdits(before, next, draft)));
        const gender = byLabel(reloaded, "How would you describe your child's gender?");
        expect(gender.field_source).toBeUndefined();
        const schemaAfter = studioSchema(reloaded);
        expect(schemaAfter.fields.find((f) => f.id === gender.id)!.field_source).toBeUndefined();
        expect(resolveImportedFormMappings(schemaAfter, reloaded).get(gender.id)!.state).not.toBe("mapped");
    });

    it("a half-chosen destination (record picked, field not yet) is held back, not saved", () => {
        const draft = importedDraft();
        const before = studioSchema(draft);
        const next = updateField(before, "field_3", { field_source: { entity_type: "child", field_key: "custom" } });
        expect(changedFieldEdits(before, next, draft).size).toBe(0);
    });

    it("the structural save path carries no guessed destination either", () => {
        const draft = importedDraft();
        const built = buildDraftSavePayloadFromSchema(draft, studioSchema(draft));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.payload.fields.find((f) => f.label === "Student Date of Birth")!.field_source).toBeUndefined();
        expect(built.payload.fields.find((f) => f.label === "Student first name")!.field_source?.shared_value_key).toBe("child_first_name");
    });
});

describe("a hand-built form follows the same destination authority", () => {
    const manual: FormSchemaV1 = {
        schema_version: 1,
        title: "Manual",
        sections: [{ id: "s1", title: "Child", field_ids: ["dob", "allergies"] }],
        fields: [
            { id: "dob", type: "date", label: "Student Date of Birth", required: false },
            { id: "allergies", type: "text", label: "Does your child have any allergies?", required: false },
        ],
    } as unknown as FormSchemaV1;

    it("an unrelated edit leaves an unmapped question unmapped through save and reload", () => {
        const next = updateField(manual, "dob", { required: true });
        const reloaded = safeParseFormSchema(JSON.parse(JSON.stringify(next)));
        expect(reloaded.success).toBe(true);
        if (!reloaded.success) return;
        expect(reloaded.data.fields.find((f) => f.id === "allergies")!.field_source).toBeUndefined();
        expect(reloaded.data.fields.find((f) => f.id === "dob")!.field_source).toBeUndefined();
    });

    it("choosing and clearing a destination both persist", () => {
        const chosen = updateField(manual, "allergies", { field_source: { entity_type: "child", field_key: "allergies" } });
        const chosenReload = safeParseFormSchema(JSON.parse(JSON.stringify(chosen)));
        expect(chosenReload.success && chosenReload.data.fields.find((f) => f.id === "allergies")!.field_source).toEqual({
            entity_type: "child",
            field_key: "allergies",
        });
        const cleared = updateField(chosen, "allergies", { field_source: undefined });
        const clearedReload = safeParseFormSchema(JSON.parse(JSON.stringify(cleared)));
        expect(clearedReload.success && clearedReload.data.fields.find((f) => f.id === "allergies")!.field_source).toBeUndefined();
    });
});

/* ------------------------------------------------------------------ phases 2–4 */

const form: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [
        {
            id: "s1",
            title: "Family",
            field_ids: ["siblings", "list", "program", "nickname", "kids", "start", "notes", "days", "sig", "upload", "blank", "info"],
        },
    ],
    fields: [
        { id: "siblings", type: "boolean", label: "Does your child have siblings?", required: true },
        { id: "list", type: "text", label: "Please list your child's siblings.", required: true },
        {
            id: "program",
            type: "select",
            label: "Program",
            required: false,
            static_options: [
                { value: "full_day", label: "Full day" },
                { value: "half_day", label: "Half day" },
            ],
        },
        { id: "nickname", type: "text", label: "Nickname", required: false },
        { id: "kids", type: "number", label: "How many children live at home?", required: false },
        { id: "start", type: "date", label: "Start date", required: false },
        { id: "notes", type: "text", label: "Anything else?", required: false, multiline: true },
        {
            id: "days",
            type: "multiselect",
            label: "Which days?",
            required: false,
            static_options: [
                { value: "mon", label: "Monday" },
                { value: "tue", label: "Tuesday" },
            ],
        },
        { id: "sig", type: "signature", label: "Signature", required: false },
        { id: "upload", type: "file_ref", label: "Immunization record", required: false },
        { id: "blank", type: "select", label: "Room", required: false, option_set_key: "rooms" },
        { id: "info", type: "text_block", label: "Info", required: false, content: "Read me" },
    ],
} as unknown as FormSchemaV1;

describe("which questions can control another", () => {
    const { eligible, unavailable } = conditionTriggerOptions(form, "list");

    it("offers every supported scalar kind", () => {
        expect(eligible.map((t) => [t.id, t.kind])).toEqual([
            ["siblings", "boolean"],
            ["program", "choice"],
            ["nickname", "text"],
            ["kids", "number"],
            ["start", "date"],
        ]);
        expect(eligible.find((t) => t.id === "siblings")!.answers.map((a) => a.label)).toEqual(["Yes", "No"]);
        expect(eligible.find((t) => t.id === "program")!.answers).toEqual([
            { value: "full_day", label: "Full day" },
            { value: "half_day", label: "Half day" },
        ]);
    });

    it("explains every question it does not offer, instead of a silent subset", () => {
        const reasons = new Map(unavailable.map((u) => [u.id, u.reason]));
        expect([...reasons.keys()].sort()).toEqual(["blank", "days", "notes", "sig", "upload"]);
        expect(reasons.get("days")).toMatch(/several answers/i);
        expect(reasons.get("notes")).toMatch(/exact answer/i);
        expect(reasons.get("blank")).toMatch(/no choices/i);
        // Prose is not a question at all.
        expect(eligible.concat(unavailable as never).some((t: { id: string }) => t.id === "info")).toBe(false);
    });

    it("never offers the question itself", () => {
        expect(conditionTriggerOptions(form, "siblings").eligible.map((t) => t.id)).not.toContain("siblings");
    });

    it("offers a question that is itself conditional, and withholds — with a reason — one that would close a loop", () => {
        const chained = setFieldVisibility(form, "nickname", { triggerFieldId: "siblings", value: true });
        expect(conditionTriggerOptions(chained, "list").eligible.map((t) => t.id)).toContain("nickname");
        const back = conditionTriggerOptions(chained, "siblings");
        expect(back.eligible.map((t) => t.id)).not.toContain("nickname");
        expect(back.unavailable.find((u) => u.id === "nickname")!.reason).toMatch(/only asked because of this question/i);
    });
});

describe("Question · Comparison · Answer", () => {
    it("Does your child have siblings? · is · Yes", () => {
        const next = setFieldVisibility(form, "list", { triggerFieldId: "siblings", comparison: "eq", value: true });
        const f = next.fields.find((x) => x.id === "list")!;
        expect([conditionTriggerOf(f), conditionComparisonOf(f), conditionValueOf(f)]).toEqual(["siblings", "eq", true]);
        expect(describeCondition(next, f)).toBe("Only asked when “Does your child have siblings?” is Yes");
    });

    it("is not, on a dropdown, described by the choice's own label", () => {
        const next = setFieldVisibility(form, "list", { triggerFieldId: "program", comparison: "neq", value: "half_day" });
        const f = next.fields.find((x) => x.id === "list")!;
        expect(f.visibility).toEqual({ all: [{ field_id: "program", op: "neq", value: "half_day" }] });
        expect(describeCondition(next, f)).toBe("Only asked when “Program” is not Half day");
    });

    it("typed answers are stored in the type the runtime compares", () => {
        expect(parseConditionAnswer("number", " 3 ")).toBe(3);
        expect(parseConditionAnswer("number", "three")).toBeNull();
        expect(parseConditionAnswer("date", "2026-09-01")).toBe("2026-09-01");
        expect(parseConditionAnswer("date", "2026-02-30")).toBeNull();
        expect(parseConditionAnswer("text", "  Bean ")).toBe("Bean");
        expect(parseConditionAnswer("text", "   ")).toBeNull();

        const num = setFieldVisibility(form, "list", { triggerFieldId: "kids", value: 3 });
        expect(conditionValueOf(num.fields.find((x) => x.id === "list")!)).toBe(3);
        const date = setFieldVisibility(form, "list", { triggerFieldId: "start", comparison: "neq", value: "2026-09-01" });
        expect(describeCondition(date, date.fields.find((x) => x.id === "list")!)).toBe("Only asked when “Start date” is not 2026-09-01");
        const text = setFieldVisibility(form, "list", { triggerFieldId: "nickname", value: " Bean " });
        expect(conditionValueOf(text.fields.find((x) => x.id === "list")!)).toBe("Bean");
        expect(describeCondition(text, text.fields.find((x) => x.id === "list")!)).toBe("Only asked when “Nickname” is “Bean”");
    });

    it("refuses an answer the controlling question cannot give, or in the wrong type", () => {
        for (const bad of [
            { triggerFieldId: "kids", value: "3" },
            { triggerFieldId: "start", value: "next week" },
            { triggerFieldId: "program", value: "evenings" },
            { triggerFieldId: "siblings", value: "Yes" },
            { triggerFieldId: "nickname", value: "  " },
        ]) {
            const next = setFieldVisibility(form, "list", bad);
            expect(conditionTriggerOf(next.fields.find((x) => x.id === "list")!), JSON.stringify(bad)).toBeNull();
        }
    });

    it("refuses unsupported triggers outright", () => {
        for (const id of ["days", "notes", "sig", "upload", "blank"]) {
            const next = setFieldVisibility(form, "list", { triggerFieldId: id, value: "x" });
            expect(conditionTriggerOf(next.fields.find((x) => x.id === "list")!), id).toBeNull();
        }
    });

    it("refuses self-reference and cycles", () => {
        expect(setFieldVisibility(form, "list", { triggerFieldId: "list", value: "x" })).toBe(form);
        const a = setFieldVisibility(form, "nickname", { triggerFieldId: "siblings", value: true });
        const b = setFieldVisibility(a, "kids", { triggerFieldId: "nickname", value: "Bean" });
        // siblings → nickname → kids; making siblings depend on kids would close the loop.
        expect(setFieldVisibility(b, "siblings", { triggerFieldId: "kids", value: 2 })).toBe(b);
    });

    it("the schema validator refuses a cycle that arrives some other way", () => {
        const cyclic = {
            ...form,
            fields: form.fields.map((f) =>
                f.id === "siblings"
                    ? { ...f, visibility: { all: [{ field_id: "nickname", op: "eq", value: "x" }] } }
                    : f.id === "nickname"
                      ? { ...f, visibility: { all: [{ field_id: "siblings", op: "eq", value: true }] } }
                      : f,
            ),
        };
        const parsed = safeParseFormSchema(cyclic);
        expect(parsed.success).toBe(false);
        const self = { ...form, fields: form.fields.map((f) => (f.id === "list" ? { ...f, visibility: { all: [{ field_id: "list", op: "eq", value: "x" }] } } : f)) };
        expect(safeParseFormSchema(self).success).toBe(false);
    });

    it("clearing persists: the question is always asked", () => {
        const set = setFieldVisibility(form, "list", { triggerFieldId: "program", comparison: "neq", value: "half_day" });
        const cleared = setFieldVisibility(set, "list", null);
        expect(conditionTriggerOf(cleared.fields.find((x) => x.id === "list")!)).toBeNull();
        expect(safeParseFormSchema(cleared).success).toBe(true);
    });
});

describe("the participant runtime evaluates what was authored", () => {
    const at = (schema: FormSchemaV1, id: string, values: Record<string, unknown>) =>
        evaluateFieldVisibility(id, schema, (k) => values[k]);

    it("is / is not across every supported kind", () => {
        const cases: Array<[string, string | number | boolean, "eq" | "neq", unknown, boolean]> = [
            ["siblings", true, "eq", true, true],
            ["siblings", true, "eq", false, false],
            ["siblings", true, "neq", false, true],
            ["program", "full_day", "eq", "full_day", true],
            ["program", "full_day", "neq", "full_day", false],
            ["nickname", "Bean", "eq", "Bean", true],
            ["nickname", "Bean", "eq", "bean", false],
            ["kids", 3, "eq", 3, true],
            ["kids", 3, "eq", 4, false],
            ["start", "2026-09-01", "eq", "2026-09-01", true],
            ["start", "2026-09-01", "neq", "2026-09-02", true],
        ];
        for (const [trigger, value, comparison, answer, shown] of cases) {
            const schema = setFieldVisibility(form, "list", { triggerFieldId: trigger, comparison, value });
            expect(at(schema, "list", { [trigger]: answer }), `${trigger} ${comparison} ${String(value)} ← ${String(answer)}`).toBe(shown);
        }
    });

    it("a chain hides everything downstream of a hidden question", () => {
        const a = setFieldVisibility(form, "nickname", { triggerFieldId: "siblings", value: true });
        const b = setFieldVisibility(a, "list", { triggerFieldId: "nickname", value: "Bean" });
        expect(at(b, "list", { siblings: true, nickname: "Bean" })).toBe(true);
        // "Bean" was typed earlier, but siblings is now No: nickname is hidden, so list is too.
        expect(at(b, "list", { siblings: false, nickname: "Bean" })).toBe(false);
    });

    it("a hidden required question is not required — and must be empty — on submit", () => {
        const schema = setFieldVisibility(form, "list", { triggerFieldId: "siblings", value: true });
        const hidden = validateFormPayload({ schemaJson: schema, payload: { values: { siblings: false } }, mode: "submit" });
        expect(hidden.ok).toBe(true);
        const shownMissing = validateFormPayload({ schemaJson: schema, payload: { values: { siblings: true } }, mode: "submit" });
        expect(shownMissing.ok).toBe(false);
        const hiddenFilled = validateFormPayload({ schemaJson: schema, payload: { values: { siblings: false, list: "Ana" } }, mode: "submit" });
        expect(hiddenFilled.ok).toBe(false);
    });
});

describe("an imported form's conditions survive save, renumbering, reload and publish", () => {
    const draft = (): StoredFormDraftPreview =>
        ({
            title: "Packet",
            generated_form_name: "Packet",
            source_document_id: "doc-1",
            sections: [{ id: "section_1", title: "Form", field_ids: ["field_1", "field_2", "field_3", "field_4"], disposition: "fields" }],
            fields: [
                { id: "field_1", label: "subject_line", type: "text", required: false, confidence: "high", evidence: "hosted_form:subject_line" },
                { id: "field_2", label: "How many children live at home?", type: "number", required: false, confidence: "high" },
                { id: "field_3", label: "Does your child have siblings?", type: "boolean", required: true, confidence: "high" },
                { id: "field_4", label: "Please list your child's siblings.", type: "text", required: true, confidence: "high" },
            ],
        }) as unknown as StoredFormDraftPreview;

    it("is not, with a number, round-trips to the published schema", () => {
        const d = draft();
        const before = studioSchema(d);
        const next = setFieldVisibility(before, "field_4", { triggerFieldId: "field_2", comparison: "neq", value: 0 });
        const reloaded = saveAndReload(d, buildDraftSavePayload(d, changedFieldEdits(before, next, d)));
        expect(byLabel(reloaded, "Please list your child's siblings.").visible_when).toEqual({ field_id: "field_2", op: "neq", value: 0 });
        const published = studioSchema(reloaded);
        const list = published.fields.find((f) => f.label === "Please list your child's siblings.")!;
        expect(list.visibility).toEqual({ all: [{ field_id: "field_2", op: "neq", value: 0 }] });
        expect(evaluateFieldVisibility(list.id, published, (k) => (k === "field_2" ? 0 : undefined))).toBe(false);
        expect(evaluateFieldVisibility(list.id, published, (k) => (k === "field_2" ? 2 : undefined))).toBe(true);
    });

    it("removing an earlier question renumbers ids, and the condition still names the same question", () => {
        const d = { ...draft(), fields: draft().fields.map((f) => (f.id === "field_4" ? { ...f, visible_when: { field_id: "field_3", op: "eq" as const, value: true } } : f)) } as StoredFormDraftPreview;
        // The plumbing question is removed: every later id shifts down by one on the rebuild.
        const reloaded = saveAndReload(d, buildDraftSavePayload(d, new Map(), new Set(["field_1"])));
        const siblings = byLabel(reloaded, "Does your child have siblings?");
        const list = byLabel(reloaded, "Please list your child's siblings.");
        expect(siblings.id).toBe("field_2");
        expect(list.visible_when).toEqual({ field_id: siblings.id, op: "eq", value: true });
    });

    it("removing the controlling question drops the condition instead of pointing it elsewhere", () => {
        const d = { ...draft(), fields: draft().fields.map((f) => (f.id === "field_4" ? { ...f, visible_when: { field_id: "field_3", op: "eq" as const, value: true } } : f)) } as StoredFormDraftPreview;
        const reloaded = saveAndReload(d, buildDraftSavePayload(d, new Map(), new Set(["field_3"])));
        expect(byLabel(reloaded, "Please list your child's siblings.").visible_when).toBeUndefined();
    });
});

describe("the shared inspector and canvas speak the operator's language", () => {
    const withRule = setFieldVisibility(form, "list", { triggerFieldId: "program", comparison: "neq", value: "half_day" });
    const field = withRule.fields.find((f) => f.id === "list")!;
    const inspector = renderToStaticMarkup(
        <ProcessingFormQuestionInspector field={field} schema={withRule} editable mutate={() => {}} onRemove={() => {}} />,
    );
    const canvas = renderToStaticMarkup(
        <ProcessingFormCanvas
            schema={withRule}
            selectedFieldId={null}
            selectedSectionId={null}
            editable
            onSelectField={() => {}}
            onSelectSection={() => {}}
            onAddQuestion={() => {}}
            onAddSection={() => {}}
        />,
    );

    it("Question · Comparison · Answer, with a readable sentence", () => {
        expect(inspector).toContain("data-inspector-condition-question");
        expect(inspector).toContain("data-inspector-condition-comparison");
        expect(inspector).toContain("data-inspector-condition-answer");
        expect(inspector).toContain("is not");
        expect(inspector).toContain("Only asked when “Program” is not Half day");
    });

    it("explains the questions it cannot offer", () => {
        expect(inspector).toContain("data-inspector-condition-unavailable");
        expect(inspector).toContain("Which days?");
    });

    it("the canvas states the same rule", () => {
        expect(canvas).toContain("Only asked when “Program” is not Half day");
    });

    it("a typed trigger gets a typed answer box", () => {
        const typed = setFieldVisibility(form, "list", { triggerFieldId: "kids", value: 3 });
        const html = renderToStaticMarkup(
            <ProcessingFormQuestionInspector field={typed.fields.find((f) => f.id === "list")!} schema={typed} editable mutate={() => {}} onRemove={() => {}} />,
        );
        expect(html).toContain('data-testid="form-builder-condition-answer-input"');
        expect(html).toContain('type="number"');
    });

    it("no schema vocabulary leaks", () => {
        for (const leak of ["visibility", "visible_when", '"op"', "neq", "field_id"]) {
            expect(inspector, leak).not.toContain(leak);
            expect(canvas, leak).not.toContain(leak);
        }
    });
});
