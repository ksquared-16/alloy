import { describe, it, expect } from "vitest";
import { isPosConnectedMetadata, isPosConnectedSurface } from "@/lib/forms/binding/posConnectedMarker";
import {
    validatePosConnectedFieldBinding,
    fieldDefinitionKey,
} from "@/lib/forms/binding/validatePosConnectedFieldBinding";
import { evaluatePosConnectedBinding } from "@/lib/forms/binding/evaluatePosConnectedBinding";
import type { FormField } from "@/lib/forms/schema";

const availableKeys = new Set<string>([
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

describe("posConnectedMarker", () => {
    it("detects the canonical metadata flag", () => {
        expect(isPosConnectedMetadata({ pos_connected: true })).toBe(true);
    });
    it("detects the namespaced metadata flag", () => {
        expect(isPosConnectedMetadata({ pos: { connected: true } })).toBe(true);
    });
    it("treats legacy / malformed metadata as not POS-connected", () => {
        expect(isPosConnectedMetadata({})).toBe(false);
        expect(isPosConnectedMetadata(null)).toBe(false);
        expect(isPosConnectedMetadata(undefined)).toBe(false);
        expect(isPosConnectedMetadata([])).toBe(false);
        expect(isPosConnectedMetadata({ pos_connected: "true" })).toBe(false);
    });
    it("is POS-connected when any metadata source carries the marker", () => {
        expect(isPosConnectedSurface({ definitionMetadata: { pos_connected: true } })).toBe(true);
        expect(isPosConnectedSurface({ versionMetadata: { pos: { connected: true } } })).toBe(true);
        expect(isPosConnectedSurface({ definitionMetadata: {}, versionMetadata: {} })).toBe(false);
    });
});

describe("validatePosConnectedFieldBinding", () => {
    it("passes when every value field binds to an active registry key", () => {
        const schema = {
            fields: [
                textField("g_email", { entity_type: "guardian", field_key: "guardian_email" }),
                textField("c_first", { entity_type: "child", field_key: "child_first_name" }),
            ],
        };
        expect(validatePosConnectedFieldBinding(schema, availableKeys).ok).toBe(true);
    });

    it("fails with missing_field_source when a value field is unbound", () => {
        const result = validatePosConnectedFieldBinding({ fields: [textField("loose")] }, availableKeys);
        expect(result.ok).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({ field_id: "loose", reason: "missing_field_source" });
    });

    it("fails with unresolved_field_key when the binding has no registry row", () => {
        const result = validatePosConnectedFieldBinding(
            { fields: [textField("x", { entity_type: "guardian", field_key: "not_a_field" })] },
            availableKeys
        );
        expect(result.ok).toBe(false);
        expect(result.violations[0]).toMatchObject({
            field_id: "x",
            reason: "unresolved_field_key",
            field_key: "not_a_field",
        });
    });

    it("validates nested group fields recursively", () => {
        const group: FormField = {
            id: "grp",
            label: "grp",
            required: false,
            type: "group",
            fields: [textField("inner")],
        };
        const result = validatePosConnectedFieldBinding({ fields: [group] }, availableKeys);
        expect(result.ok).toBe(false);
        expect(result.violations.map((v) => v.field_id)).toContain("inner");
    });

    it("does not require binding for signature or file_ref fields", () => {
        const signature: FormField = { id: "sig", label: "sig", required: false, type: "signature" };
        const file: FormField = { id: "f", label: "f", required: false, type: "file_ref" };
        expect(validatePosConnectedFieldBinding({ fields: [signature, file] }, availableKeys).ok).toBe(true);
    });

    it("reports all violations (does not short-circuit)", () => {
        const result = validatePosConnectedFieldBinding(
            { fields: [textField("a"), textField("b")] },
            availableKeys
        );
        expect(result.violations).toHaveLength(2);
    });
});

describe("evaluatePosConnectedBinding — legacy non-interference", () => {
    it("skips enforcement entirely when the surface is not POS-connected", () => {
        const schema = { fields: [textField("loose")] }; // would fail if enforced
        const result = evaluatePosConnectedBinding({
            posConnected: false,
            schema,
            availableFieldKeys: availableKeys,
        });
        expect(result).toEqual({ enforced: false, ok: true, violations: [] });
    });

    it("enforces binding when the surface is POS-connected", () => {
        const result = evaluatePosConnectedBinding({
            posConnected: true,
            schema: { fields: [textField("loose")] },
            availableFieldKeys: availableKeys,
        });
        expect(result.enforced).toBe(true);
        expect(result.ok).toBe(false);
    });
});
