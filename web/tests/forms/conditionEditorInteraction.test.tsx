// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import ProcessingFormQuestionInspector from "@/app/adminV2/pos/ProcessingFormQuestionInspector";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * The condition editor, driven the way an operator drives it: open a picker, choose, type.
 *
 * The static-markup tests prove what is drawn; these prove the transitions — above all that choosing a
 * question which needs a typed answer writes NOTHING until the answer exists (a half-rule would hide
 * the question from every family), and that the comparison and the answer are each saved on their own.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const form: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [{ id: "s1", title: "Family", field_ids: ["siblings", "kids", "list"] }],
    fields: [
        { id: "siblings", type: "boolean", label: "Does your child have siblings?", required: true },
        { id: "kids", type: "number", label: "How many children live at home?", required: false },
        { id: "list", type: "text", label: "Please list your child's siblings.", required: false },
    ],
} as unknown as FormSchemaV1;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let current: FormSchemaV1 = form;
let writes = 0;

function Harness() {
    const [schema, setSchema] = useState(form);
    current = schema;
    return (
        <ProcessingFormQuestionInspector
            field={schema.fields.find((f) => f.id === "list")!}
            schema={schema}
            editable
            mutate={(fn) => {
                const next = fn(schema);
                if (next !== schema) writes += 1;
                setSchema(next);
            }}
            onRemove={() => {}}
        />
    );
}

function mount() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Harness />));
}

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    current = form;
    writes = 0;
});

const rule = () => current.fields.find((f) => f.id === "list")!.visibility ?? null;

function pick(testId: string, label: string) {
    const trigger = host!.querySelector<HTMLButtonElement>(`[data-testid="${testId}"] button`)!;
    act(() => trigger.click());
    const option = [...host!.querySelectorAll<HTMLElement>("[role=option]")].find((o) => o.textContent?.trim() === label);
    if (!option) throw new Error(`no option "${label}" in ${testId}`);
    act(() => {
        option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        option.click();
    });
}

function type(testId: string, value: string) {
    const input = host!.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function clickText(text: string) {
    const button = [...host!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
    if (!button) throw new Error(`no button "${text}"`);
    act(() => button.click());
}

describe("authoring a condition in the shared inspector", () => {
    it("Yes / No: choosing the question writes `is Yes`; the answer and comparison change it", () => {
        mount();
        pick("form-builder-condition-question", "Does your child have siblings?");
        expect(rule()).toEqual({ all: [{ field_id: "siblings", op: "eq", value: true }] });
        pick("form-builder-condition-answer", "No");
        expect(rule()).toEqual({ all: [{ field_id: "siblings", op: "eq", value: false }] });
        clickText("is not");
        expect(rule()).toEqual({ all: [{ field_id: "siblings", op: "neq", value: false }] });
        expect(host!.textContent).toContain("Only asked when “Does your child have siblings?” is not No");
    });

    it("a typed answer: nothing is written until the number is entered, and a non-number is not saved", () => {
        mount();
        pick("form-builder-condition-question", "How many children live at home?");
        expect(rule()).toBeNull();
        expect(writes).toBe(0);
        expect(host!.querySelector('[data-inspector-condition-pending]')).not.toBeNull();
        clickText("is not");
        expect(rule()).toBeNull();
        type("form-builder-condition-answer-input", "3");
        expect(rule()).toEqual({ all: [{ field_id: "kids", op: "neq", value: 3 }] });
        expect(host!.textContent).toContain("Only asked when “How many children live at home?” is not 3");
    });

    it("clearing returns the question to always asked", () => {
        mount();
        pick("form-builder-condition-question", "Does your child have siblings?");
        expect(rule()).not.toBeNull();
        const clear = host!.querySelector<HTMLButtonElement>("[data-inspector-condition-clear]")!;
        act(() => clear.click());
        expect(rule()).toBeNull();
    });
});
