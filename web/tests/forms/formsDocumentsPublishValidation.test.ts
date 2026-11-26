import { describe, expect, it } from "vitest";
import {
    validatePosConnectedFieldBinding,
    validateFormsDocumentsFieldBindingsAtPublish,
    fieldDefinitionKey,
} from "@/lib/forms/binding/validatePosConnectedFieldBinding";
import { evaluatePosConnectedBinding } from "@/lib/forms/binding/evaluatePosConnectedBinding";
import type { FormField } from "@/lib/forms/schema";

const availableKeys = new Set<string>([
    fieldDefinitionKey("person", "email"),
    fieldDefinitionKey("customer_member", "first_name"),
    fieldDefinitionKey("guardian", "guardian_email"),
    fieldDefinitionKey("child", "child_first_name"),
]);

function textField(id: string, source?: { entity_type: string; field_key: string }): FormField {
    return {
        id,
        label: id,
        required: false,
        type: "text",
        ...(source ? { field_source: source } : {}),
    };
}

describe("validatePosConnectedFieldBinding — canonical normalization", () => {
    it("passes when forms vocabulary binding maps to canonical registry key", () => {
        const schema = {
            fields: [
                textField("g_email", { entity_type: "guardian", field_key: "guardian_email" }),
                textField("c_first", { entity_type: "child", field_key: "child_first_name" }),
            ],
        };
        expect(validatePosConnectedFieldBinding(schema, availableKeys).ok).toBe(true);
    });

    it("passes legacy-compatible alias bindings", () => {
        const result = validatePosConnectedFieldBinding(
            {
                fields: [textField("g_email", { entity_type: "guardian", field_key: "guardian_email" })],
            },
            new Set([fieldDefinitionKey("person", "email")]),
        );
        expect(result.ok).toBe(true);
    });

    it("fails unknown bindings", () => {
        const result = validatePosConnectedFieldBinding(
            { fields: [textField("x", { entity_type: "guardian", field_key: "not_a_field" })] },
            availableKeys,
        );
        expect(result.ok).toBe(false);
        expect(result.violations[0]?.reason).toBe("unresolved_field_key");
    });

    it("validateFormsDocumentsFieldBindingsAtPublish delegates to canonical validator", () => {
        const schema = { fields: [textField("g_email", { entity_type: "guardian", field_key: "guardian_email" })] };
        const a = validatePosConnectedFieldBinding(schema, availableKeys);
        const b = validateFormsDocumentsFieldBindingsAtPublish(schema, availableKeys);
        expect(b).toEqual(a);
    });
});

describe("evaluatePosConnectedBinding — legacy non-interference", () => {
    it("skips enforcement entirely when the surface is not POS-connected", () => {
        const schema = { fields: [textField("loose")] };
        const result = evaluatePosConnectedBinding({
            posConnected: false,
            schema,
            availableFieldKeys: availableKeys,
        });
        expect(result).toEqual({ enforced: false, ok: true, violations: [] });
    });
});
