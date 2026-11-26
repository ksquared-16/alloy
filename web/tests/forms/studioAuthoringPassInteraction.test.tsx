// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProcessingImportedFormStudio from "@/app/adminV2/pos/ProcessingImportedFormStudio";
import { findFieldDeep } from "@/lib/forms/formBuilderSchema";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * THE FINAL AUTHORING PASS, DRIVEN THROUGH FORMS STUDIO'S OWN CONTROLS.
 *
 * The canvas and inspector are the shared Forms Studio components; a hand-built form renders the very
 * same ones. Each case clicks what the Director clicks and asserts the whole form that is saved.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draft = {
    title: "Admissions",
    generated_form_name: "Admissions",
    source_document_id: "doc-1",
    sections: [
        { id: "section_1", title: "Family", field_ids: ["field_1", "field_2", "field_3", "field_4"], disposition: "fields" },
        { id: "section_2", title: "Home", field_ids: ["field_5", "field_6", "field_7", "field_8", "field_9"], disposition: "fields" },
    ],
    fields: [
        { id: "field_1", label: "Parent name", type: "text", required: true, confidence: "high", evidence: "hosted_form:parent", field_source: { entity_type: "guardian", field_key: "guardian_first_name" } },
        { id: "field_2", label: "Child date of birth", type: "date", required: true, confidence: "high", evidence: "hosted_form:dob" },
        { id: "field_3", label: "Enrollment start date", type: "date", required: true, confidence: "high", evidence: "hosted_form:start" },
        { id: "field_4", label: "Student Age Upon Enrolling", type: "text", required: false, confidence: "high", evidence: "hosted_form:age" },
        { id: "field_5", label: "Home address line 1", type: "text", required: true, confidence: "high", evidence: "hosted_form:l1", field_source: { entity_type: "person", field_key: "address_line1" } },
        { id: "field_6", label: "Home address line 2", type: "text", required: false, confidence: "high", evidence: "hosted_form:l2", field_source: { entity_type: "person", field_key: "address_line2" } },
        { id: "field_7", label: "City", type: "text", required: true, confidence: "high", evidence: "hosted_form:city", field_source: { entity_type: "person", field_key: "city" } },
        { id: "field_8", label: "State", type: "text", required: true, confidence: "high", evidence: "hosted_form:state", field_source: { entity_type: "person", field_key: "state" } },
        { id: "field_9", label: "ZIP", type: "text", required: true, confidence: "high", evidence: "hosted_form:zip", field_source: { entity_type: "person", field_key: "postal_code" } },
    ],
    warnings: [],
    generated_at: "2026-10-14T12:00:00.000Z",
    generator_version: "test",
} as unknown as StoredFormDraftPreview;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const saves: FormSchemaV1[] = [];

beforeEach(() => {
    saves.length = 0;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { field_library: [] } }), { status: 200 })));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
        root!.render(
            <ProcessingImportedFormStudio
                draft={draft}
                onSaveStudioSchema={async (schema) => {
                    saves.push(schema);
                }}
            />,
        ),
    );
});

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

const lastSaved = () => saves.at(-1)!;
const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};
function click(el: Element | null) {
    if (!el) throw new Error("element not found");
    act(() => (el as HTMLElement).click());
}
function pickOption(testId: string, label: string) {
    click(document.querySelector(`[data-testid="${testId}"] button`));
    const option = [...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === label);
    if (!option) throw new Error(`no option "${label}" — have ${[...document.querySelectorAll("[role=option]")].map((o) => o.textContent).join(" | ")}`);
    act(() => {
        option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        option.click();
    });
}

describe("Duplicate question", () => {
    it("adds a copy below with a new id and no destination, selected for editing", async () => {
        click(document.querySelector('[data-testid="form-canvas-question-field_1"]'));
        click(document.querySelector('[data-testid="form-builder-duplicate-field"]'));
        await flush();
        const saved = lastSaved();
        const ids = saved.sections[0]!.field_ids;
        const copyId = ids[ids.indexOf("field_1") + 1]!;
        expect(copyId).not.toBe("field_1");
        const copy = saved.fields.find((f) => f.id === copyId)!;
        expect(copy.label).toBe("Parent name (copy)");
        expect(copy.field_source).toBeUndefined();
        expect(saved.fields.find((f) => f.id === "field_1")!.field_source?.field_key).toBe("guardian_first_name");
        // The copy is what the inspector now edits.
        expect((document.querySelector('[data-testid="form-builder-field-label"]') as HTMLInputElement).value).toBe("Parent name (copy)");
    });
});

describe("Calculated answer", () => {
    it("makes Student Age a calculation of Date of birth as of the enrollment start date", async () => {
        click(document.querySelector('[data-testid="form-canvas-question-field_4"]'));
        pickOption("form-builder-calculation-kind", "Calculated — age from a date of birth");
        pickOption("form-builder-calculation-source", "Child date of birth");
        pickOption("form-builder-calculation-as-of", "Enrollment start date");
        await flush();
        const age = lastSaved().fields.find((f) => f.id === "field_4")!;
        expect(age.derived).toEqual({ kind: "age_from_date_of_birth", source_key: "field_2", as_of_key: "field_3" });
        expect(age.read_only).toBeFalsy();
        expect(document.querySelector('[data-testid="form-builder-calculation-summary"]')?.textContent).toContain("Families are not asked for it");
        // No formula or field id is shown to the operator.
        expect(document.querySelector("[data-inspector-calculation]")?.textContent).not.toMatch(/field_\d|derived|as_of_key/);
    });
});

describe("A group's lines", () => {
    const addressGroup = (s: FormSchemaV1) => s.fields.find((f) => (f as { address_binding?: unknown }).address_binding) as
        | (FormField & { type: "group"; fields: FormField[] })
        | undefined;

    it("an address line is selected on its own, keeps its own destination, and its width is saved", async () => {
        // The importer groups the address run on its own.
        const group = document.querySelector('[data-canvas-group-kind="address"]');
        expect(group).not.toBeNull();
        const cityLine = [...document.querySelectorAll<HTMLElement>("[data-canvas-group-child]")].find((el) => el.textContent?.includes("City"))!;
        click(cityLine);
        expect(document.querySelector("[data-inspector-parent-group]")).not.toBeNull();
        expect(document.querySelector("[data-inspector-destination]")).not.toBeNull();
        const third = [...document.querySelectorAll<HTMLElement>('[data-testid="form-builder-layout-width"] button')].find((b) => b.textContent?.trim() === "Third")!;
        click(third);
        await flush();
        const saved = addressGroup(lastSaved())!;
        const city = saved.fields.find((f) => f.label === "City")!;
        expect(city.layout_width).toBe("third");
        expect(city.field_source).toMatchObject({ entity_type: "person", field_key: "city" });
        expect(findFieldDeep(lastSaved(), city.id)!.parent!.id).toBe(saved.id);
    });

    it("a people group's line says where it is stored instead of offering a destination", async () => {
        click(document.querySelector('[data-canvas-add-field="section_1"]'));
        click(document.querySelector('[data-library-tab="question-types"]'));
        click(document.querySelector('[data-library-item="people-emergency_contacts"]'));
        await flush();
        const people = lastSaved().fields.find((f) => (f as { collection_binding?: unknown }).collection_binding) as FormField & { fields: FormField[] };
        const phone = people.fields.find((f) => /phone/i.test(f.label))!;
        click(document.querySelector(`[data-testid="form-canvas-group-child-${phone.id}"]`));
        expect(document.querySelector("[data-inspector-destination-owned-by-relationship]")?.textContent).toContain("Emergency Contacts");
        expect(document.querySelector("[data-inspector-destination]")).toBeNull();
        expect(document.querySelector('[data-testid="form-builder-answer-type"]')).toBeNull();
    });
});
