import { describe, expect, it } from "vitest";
import {
    collectSchemaFieldIds,
    evaluateFieldVisibility,
    normalizeValidationErrors,
    validateFormPayload,
} from "@/lib/forms/validateSubmission";
import { validateFormSchema } from "@/lib/forms/schema";
import { ZodError } from "zod";

const DOC_ID = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";

function baseSchema(overrides: { fields: Array<{ id: string } & Record<string, unknown>>; sections?: unknown[] }) {
    return {
        schema_version: 1 as const,
        title: "T",
        sections: overrides.sections ?? [{ id: "s1", field_ids: overrides.fields.map((f) => f.id) }],
        fields: overrides.fields,
    };
}

describe("Forms Engine V1 — schema JSON", () => {
    it("accepts a valid schema", () => {
        const schema = baseSchema({
            fields: [
                { id: "a", type: "text", label: "A" },
                {
                    id: "b",
                    type: "select",
                    label: "B",
                    option_set_key: "opts",
                },
            ],
        });
        expect(validateFormSchema(schema).title).toBe("T");
        expect(collectSchemaFieldIds(validateFormSchema(schema)).sort()).toEqual(["a", "b"]);
    });

    it("rejects duplicate field ids in the tree", () => {
        expect(() =>
            validateFormSchema(
                baseSchema({
                    fields: [
                        { id: "x", type: "text", label: "X" },
                        { id: "x", type: "text", label: "Dup" },
                    ],
                })
            )
        ).toThrow(ZodError);
    });

    it("rejects invalid section field refs (nested id is not top-level)", () => {
        expect(() =>
            validateFormSchema(
                baseSchema({
                    fields: [
                        {
                            id: "g",
                            type: "group",
                            label: "G",
                            fields: [{ id: "inner", type: "text", label: "Inner" }],
                        },
                    ],
                    sections: [{ id: "s1", field_ids: ["g", "inner"] }],
                })
            )
        ).toThrow(/unknown top-level field id: inner/);
    });

    it("rejects invalid visibility refs inside a group", () => {
        expect(() =>
            validateFormSchema(
                baseSchema({
                    fields: [
                        {
                            id: "g",
                            type: "group",
                            label: "G",
                            fields: [
                                {
                                    id: "c",
                                    type: "text",
                                    label: "C",
                                    visibility: { all: [{ field_id: "nope", op: "eq" as const, value: "v" }] },
                                },
                            ],
                        },
                    ],
                    sections: [{ id: "s1", field_ids: ["g"] }],
                })
            )
        ).toThrow(/visibility references unknown field_id: nope/);
    });

    it("rejects duplicate child ids inside a group", () => {
        expect(() =>
            validateFormSchema(
                baseSchema({
                    fields: [
                        {
                            id: "g",
                            type: "group",
                            label: "G",
                            fields: [
                                { id: "c", type: "text", label: "C" },
                                { id: "c", type: "text", label: "C2" },
                            ],
                        },
                    ],
                })
            )
        ).toThrow(/Duplicate field id inside group/);
    });
});

describe("Forms Engine V1 — payload validation", () => {
    const schema = validateFormSchema(
        baseSchema({
            fields: [
                { id: "req", type: "text", label: "R", required: true },
                {
                    id: "toggle",
                    type: "boolean",
                    label: "T",
                },
                {
                    id: "dep",
                    type: "text",
                    label: "D",
                    required: true,
                    visibility: { all: [{ field_id: "toggle", op: "eq", value: true }] },
                },
                {
                    id: "pick",
                    type: "select",
                    label: "P",
                    option_set_key: "colors",
                },
                {
                    id: "multi",
                    type: "multiselect",
                    label: "M",
                    option_set_key: "tags",
                },
                {
                    id: "sig",
                    type: "signature",
                    label: "Sign",
                    required: true,
                },
                {
                    id: "kids",
                    type: "group",
                    label: "Kids",
                    repeat: { min: 1, max: 2 },
                    required: true,
                    fields: [{ id: "child_name", type: "text", label: "Name", required: true }],
                },
            ],
            sections: [{ id: "main", field_ids: ["req", "toggle", "dep", "pick", "multi", "sig", "kids"] }],
        })
    );

    it("draft allows missing required fields", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: { values: {} },
            mode: "draft",
        });
        expect(r.ok).toBe(true);
    });

    it("submit rejects missing required top-level fields", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: { toggle: false },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: {
                    kids: [{ instance_key: "1", values: { child_name: "Sam" } }],
                },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.errors.some((e) => e.path.join(".") === "values.req")).toBe(true);
        }
    });

    it("conditional visibility hides required dep field when toggle is false", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "r",
                    multi: [],
                },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: {
                    kids: [{ instance_key: "1", values: { child_name: "Sam" } }],
                },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(true);
    });

    it("submit requires dep when visible", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: true,
                    pick: "r",
                    multi: [],
                },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: {
                    kids: [{ instance_key: "1", values: { child_name: "Sam" } }],
                },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.errors.some((e) => e.path.includes("dep"))).toBe(true);
        }
    });

    it("enforces group min/max on submit", () => {
        const bad = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "r",
                    multi: [],
                },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: { kids: [] },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(bad.ok).toBe(false);

        const tooMany = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "r",
                    multi: [],
                },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: {
                    kids: [
                        { instance_key: "1", values: { child_name: "A" } },
                        { instance_key: "2", values: { child_name: "B" } },
                        { instance_key: "3", values: { child_name: "C" } },
                    ],
                },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(tooMany.ok).toBe(false);
    });

    it("rejects unknown field ids in values", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: { req: "x", ghost: "nope", toggle: false, pick: "r", multi: [] },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: { kids: [{ instance_key: "1", values: { child_name: "Sam" } }] },
            },
            mode: "draft",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors.some((e) => e.path.join(".") === "values.ghost")).toBe(true);
    });

    it("rejects select option not in caller-provided list", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "not_allowed",
                    multi: [],
                },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: { kids: [{ instance_key: "1", values: { child_name: "Sam" } }] },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(false);
    });

    it("rejects multiselect option not in caller-provided list", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "r",
                    multi: ["bad"],
                },
                signatures: { sig: { kind: "typed", typed_full_name: "Pat" } },
                groups: { kids: [{ instance_key: "1", values: { child_name: "Sam" } }] },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: ["x"] },
        });
        expect(r.ok).toBe(false);
    });

    it("accepts typed signature on submit", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "r",
                    multi: [],
                },
                signatures: { sig: { kind: "typed", typed_full_name: "Alex Example" } },
                groups: { kids: [{ instance_key: "1", values: { child_name: "Sam" } }] },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(true);
    });

    it("accepts drawn signature on submit", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "r",
                    multi: [],
                },
                signatures: {
                    sig: { kind: "drawn", drawn_document_id: DOC_ID },
                },
                groups: { kids: [{ instance_key: "1", values: { child_name: "Sam" } }] },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(true);
    });

    it("rejects missing signature on submit", () => {
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    req: "ok",
                    toggle: false,
                    pick: "r",
                    multi: [],
                },
                groups: { kids: [{ instance_key: "1", values: { child_name: "Sam" } }] },
            },
            mode: "submit",
            optionValuesByFieldId: { pick: ["r"], multi: [] },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.errors.some((e) => e.path[0] === "signatures" && e.path[1] === "sig")).toBe(true);
        }
    });

    it("submit trims text values before pattern check and returns trimmed payload", () => {
        const emailSchema = validateFormSchema(
            baseSchema({
                fields: [
                    {
                        id: "em",
                        type: "text",
                        label: "Email",
                        required: true,
                        validate: { pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" },
                    },
                    { id: "sig", type: "signature", label: "S", required: true },
                ],
                sections: [{ id: "main", field_ids: ["em", "sig"] }],
            })
        );
        const r = validateFormPayload({
            schemaJson: emailSchema,
            payload: {
                values: { em: "  kelly.kurzman@gmail.com  " },
                signatures: { sig: { kind: "typed", typed_full_name: "Kelly" } },
            },
            mode: "submit",
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.payload.values.em).toBe("kelly.kurzman@gmail.com");
        }
    });

    it("submit rejects whitespace-only required text", () => {
        const s = validateFormSchema(
            baseSchema({
                fields: [
                    { id: "req", type: "text", label: "R", required: true },
                    { id: "sig", type: "signature", label: "S", required: true },
                ],
                sections: [{ id: "main", field_ids: ["req", "sig"] }],
            })
        );
        const r = validateFormPayload({
            schemaJson: s,
            payload: {
                values: { req: "   " },
                signatures: { sig: { kind: "typed", typed_full_name: "K" } },
            },
            mode: "submit",
        });
        expect(r.ok).toBe(false);
    });

    it("accepts layout_width half on text fields and submit still validates", () => {
        const s = validateFormSchema(
            baseSchema({
                fields: [
                    { id: "fn", type: "text", label: "First", layout_width: "half" },
                    { id: "ln", type: "text", label: "Last", layout_width: "half" },
                ],
                sections: [{ id: "main", field_ids: ["fn", "ln"] }],
            })
        );
        expect(s.fields[0].layout_width).toBe("half");
        const r = validateFormPayload({
            schemaJson: s,
            payload: { values: { fn: "A", ln: "B" }, signatures: {} },
            mode: "submit",
        });
        expect(r.ok).toBe(true);
    });

    it("rejects invalid layout_width", () => {
        expect(() =>
            validateFormSchema(
                baseSchema({
                    fields: [{ id: "a", type: "text", label: "A", layout_width: "wide" }],
                })
            )
        ).toThrow(ZodError);
    });
});

describe("evaluateFieldVisibility", () => {
    it("matches AND visibility with boolean toggle", () => {
        const schema = validateFormSchema(
            baseSchema({
                fields: [
                    { id: "t", type: "boolean", label: "T" },
                    {
                        id: "x",
                        type: "text",
                        label: "X",
                        visibility: { all: [{ field_id: "t", op: "eq", value: true }] },
                    },
                ],
            })
        );
        const get = (id: string) => (id === "t" ? true : undefined);
        expect(evaluateFieldVisibility("x", schema, get)).toBe(true);
        expect(evaluateFieldVisibility("x", schema, (id) => (id === "t" ? false : undefined))).toBe(false);
    });
});

describe("normalizeValidationErrors", () => {
    it("maps Zod issues to path + message", () => {
        try {
            validateFormSchema({ bad: true } as unknown as Parameters<typeof validateFormSchema>[0]);
        } catch (e) {
            expect(e).toBeInstanceOf(ZodError);
            const list = normalizeValidationErrors(e as ZodError);
            expect(list.length).toBeGreaterThan(0);
            expect(list[0]).toHaveProperty("path");
            expect(list[0]).toHaveProperty("message");
        }
    });
});
