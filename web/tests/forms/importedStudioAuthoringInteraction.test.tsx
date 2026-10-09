// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProcessingImportedFormStudio from "@/app/adminV2/pos/ProcessingImportedFormStudio";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * A DOCUMENT-ORIGINATED FORM, DRIVEN THE WAY THE DIRECTOR DRIVES IT.
 *
 * Select a question, change its answer type with the Studio's own control, add a repeatable people group
 * from the Studio's own library, set its minimum — and every change reaches the save as the whole form
 * exactly as Forms Studio has it. Before this, "+ Question" drew a button wired to nothing, the answer
 * type was a label, and the save could not carry a group at all.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESTRAINING = "Is there anyone who has a legal restraining order prohibiting or limiting contact with your child?";

const draft = {
    title: "Enrollment packet",
    generated_form_name: "Enrollment packet",
    source_document_id: "doc-1",
    sections: [{ id: "section_1", title: "Family", field_ids: ["field_1", "field_2"], disposition: "fields" }],
    fields: [
        { id: "field_1", label: RESTRAINING, type: "text", required: false, confidence: "high", evidence: "hosted_form:restraining" },
        { id: "field_2", label: "Please describe the order.", type: "text", required: false, confidence: "high", evidence: "hosted_form:order" },
    ],
    warnings: [],
    generated_at: "2026-10-09T12:00:00.000Z",
    generator_version: "test",
} as unknown as StoredFormDraftPreview;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const saves: FormSchemaV1[] = [];

beforeEach(() => {
    saves.length = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ data: { field_library: [] } }), { status: 200 })),
    );
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
    if (!option) throw new Error(`no option "${label}"`);
    act(() => {
        option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        option.click();
    });
}

function typeInto(testId: string, value: string) {
    const input = document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
    if (!input) throw new Error(`no input ${testId}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("the document-originated form is edited with the Studio's own controls", () => {
    it("Answer type: Short answer → Yes / No, saved as the whole form", async () => {
        click(document.querySelector('[data-testid="form-canvas-question-field_1"]'));
        pickOption("form-builder-answer-type", "Yes / No");
        await flush();
        const restraining = lastSaved().fields.find((f) => f.id === "field_1")!;
        expect(restraining.type).toBe("boolean");
        expect(restraining.label).toBe(RESTRAINING);
        // The whole form, not a field patch: the other question is in the same save.
        expect(lastSaved().fields.map((f) => f.id)).toEqual(expect.arrayContaining(["field_1", "field_2"]));
    });

    it("+ Question opens the Studio library; a people group is added and its minimum set", async () => {
        click(document.querySelector('[data-canvas-add-field="section_1"]'));
        expect(document.querySelector('[data-testid="processing-form-builder-library"]')).not.toBeNull();
        click(document.querySelector('[data-library-tab="question-types"]'));
        click(document.querySelector('[data-library-item="people-emergency_contacts"]'));
        await flush();
        const group = lastSaved().fields.find((f) => f.type === "group") as FormField & { repeat?: { min: number }; fields: FormField[] };
        expect(group.label).toBe("Emergency Contacts");
        expect(lastSaved().sections[0]!.field_ids).toContain(group.id);

        // The new group is selected; its inspector offers the minimum.
        typeInto("form-builder-group-min", "2");
        await flush();
        const saved = lastSaved().fields.find((f) => f.id === group.id) as FormField & { repeat?: { min: number } };
        expect(saved.repeat?.min).toBe(2);
        expect(document.body.textContent).toContain("Families must add at least 2.");
    });

    it("Remove question really removes it (it only deselected before)", async () => {
        click(document.querySelector('[data-testid="form-canvas-question-field_2"]'));
        click(document.querySelector("[data-inspector-remove]"));
        await flush();
        expect(lastSaved().fields.some((f) => f.id === "field_2")).toBe(false);
    });

    it("Create field is offered for a question with no destination", () => {
        click(document.querySelector('[data-testid="form-canvas-question-field_1"]'));
        expect(document.querySelector('[data-qa-create-field="open"]')).not.toBeNull();
    });
});
