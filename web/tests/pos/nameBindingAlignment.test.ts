/**
 * The two layers that describe a person's NAME must agree.
 *
 * QA found them diverging: Configuration Discovery told the operator "Child's Name → matched to
 * customer_member.display_name", while form generation built "Child first name" + "Child last name".
 * Both could not be right, and the registry settles it — `OPERATIONAL_FORM_SYSTEM_FIELDS` registers
 * child_first_name / child_last_name / guardian_first_name / guardian_last_name and registers NO
 * person-level display_name or full_name at all (the only display_name belongs to the household).
 * So the concept review was promising a binding to a field the system does not have.
 *
 * These tests pin the agreement in both directions so the layers cannot drift apart again.
 */

import { describe, it, expect } from "vitest";

import { suggestFieldBinding } from "@/lib/forms/canonicalBindingSuggestions";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { expandQuestionsForDraftSave } from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { canonicalPrefillPathForField } from "@/lib/forms/prefill/canonicalPrefillMap";

const registered = new Set(OPERATIONAL_FORM_SYSTEM_FIELDS.map((f) => `${f.entity_type}.${f.field_key}`));

describe("name bindings resolve to REGISTERED system fields", () => {
    it("1. the split name fields are registered; a person display_name/full_name is not", () => {
        expect(registered.has("child.child_first_name")).toBe(true);
        expect(registered.has("child.child_last_name")).toBe(true);
        expect(registered.has("guardian.guardian_first_name")).toBe(true);
        expect(registered.has("guardian.guardian_last_name")).toBe(true);

        // The premise of the whole alignment: there is no person-level single-name system field.
        expect(registered.has("customer_member.display_name")).toBe(false);
        expect(registered.has("person.full_name")).toBe(false);
    });

    it("2. every name suggestion points at a REGISTERED field", () => {
        const labels = ["Child's Name", "Name of Student", "Child First Name", "Student Last Name", "Parent/Guardian Name", "Emergency Contact Name"];
        for (const label of labels) {
            const src = suggestFieldBinding(label, "text")?.field_source;
            expect(src, `${label} produced no binding`).toBeTruthy();
            expect(registered.has(`${src!.entity_type}.${src!.field_key}`), `${label} → ${src!.entity_type}.${src!.field_key} is not a registered system field`).toBe(true);
        }
    });

    it("3. a name suggestion anchors on the FIRST-name field and says the name is split", () => {
        const child = suggestFieldBinding("Child's Name", "text");
        expect(child?.field_source).toMatchObject({ entity_type: "child", field_key: "child_first_name" });
        expect(child?.note ?? "").toMatch(/first and last/i);

        const guardian = suggestFieldBinding("Parent/Guardian Name", "text");
        expect(guardian?.field_source).toMatchObject({ entity_type: "guardian", field_key: "guardian_first_name" });
        expect(guardian?.note ?? "").toMatch(/first and last/i);
    });
});

describe("what the concept review promises is what generation builds", () => {
    it("4. child — the suggested anchor is the first of the pair generation produces", () => {
        const suggested = suggestFieldBinding("Child's Name", "text")!.field_source!;
        const built = expandQuestionsForDraftSave([
            { id: "q", evidenceLabel: "Child's Name", displayLabel: "Child's Name", type: "text", section: "Contact Information", required: false },
        ] as never);

        expect(built.map((f) => f.label)).toEqual(["Child first name", "Child last name"]);
        const builtKeys = built.map((f) => `${f.field_source?.entity_type}.${f.field_source?.field_key}`);
        expect(builtKeys).toEqual(["child.child_first_name", "child.child_last_name"]);
        // The promise is the anchor of what gets built — not a different field entirely.
        expect(builtKeys[0]).toBe(`${suggested.entity_type}.${suggested.field_key}`);
    });

    it("5. guardian — same agreement, via the section rather than the label", () => {
        const suggested = suggestFieldBinding("Parent/Guardian Name", "text")!.field_source!;
        const built = expandQuestionsForDraftSave([
            { id: "q", evidenceLabel: "Name", displayLabel: "Name", type: "text", section: "Parent or Guardian #1", required: false },
        ] as never);

        expect(built.map((f) => f.label)).toEqual(["Guardian first name", "Guardian last name"]);
        const builtKeys = built.map((f) => `${f.field_source?.entity_type}.${f.field_source?.field_key}`);
        expect(builtKeys).toEqual(["guardian.guardian_first_name", "guardian.guardian_last_name"]);
        expect(builtKeys[0]).toBe(`${suggested.entity_type}.${suggested.field_key}`);
    });

    it("6. every field generation builds is itself registered", () => {
        const built = expandQuestionsForDraftSave([
            { id: "a", evidenceLabel: "Child's Name", displayLabel: "Child's Name", type: "text", section: "Contact Information", required: false },
            { id: "b", evidenceLabel: "Name", displayLabel: "Name", type: "text", section: "Parent or Guardian #1", required: false },
        ] as never);
        for (const f of built) {
            const key = `${f.field_source?.entity_type}.${f.field_source?.field_key}`;
            expect(registered.has(key), `${f.label} → ${key} is not registered`).toBe(true);
        }
    });
});

describe("the registered split fields actually prefill", () => {
    it("7. each split field resolves to a REAL storage column, not a phantom one", () => {
        // Without a column alias these fall through to a `child_first_name` column that does not
        // exist, and prefill silently skips them — bound in name only.
        const cases: Array<[string, string, string]> = [
            ["child", "child_first_name", "customer_member.first_name"],
            ["child", "child_last_name", "customer_member.last_name"],
            ["guardian", "guardian_first_name", "person.first_name"],
            ["guardian", "guardian_last_name", "person.last_name"],
        ];
        for (const [entity_type, field_key, expected] of cases) {
            const path = canonicalPrefillPathForField({
                id: "f",
                type: "text",
                label: field_key,
                field_source: { entity_type, field_key },
            } as never);
            expect(path, `${entity_type}.${field_key} did not resolve to a storage column`).toBe(expected);
        }
    });
});
