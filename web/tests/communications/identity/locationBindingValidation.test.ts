import { describe, expect, it } from "vitest";

import { validateLocationBindingRemoval } from "@/lib/communications/identity/admin/identityAdminService";

describe("validateLocationBindingRemoval", () => {
    const binding = { id: "b1", channel: "sms", is_default: true, status: "active" };

    it("allows removing non-default binding", () => {
        expect(
            validateLocationBindingRemoval(
                { id: "b2", channel: "sms", is_default: false, status: "active" },
                [binding, { id: "b2", channel: "sms", is_default: false, status: "active" }]
            ).ok
        ).toBe(true);
    });

    it("blocks removing only active binding for channel", () => {
        const result = validateLocationBindingRemoval(binding, [binding]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/only active binding/i);
    });

    it("blocks removing default when no other default exists", () => {
        const result = validateLocationBindingRemoval(binding, [
            binding,
            { id: "b2", channel: "sms", is_default: false, status: "active" },
        ]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/another default/i);
    });

    it("allows removing default when another default exists", () => {
        const result = validateLocationBindingRemoval(binding, [
            binding,
            { id: "b2", channel: "sms", is_default: true, status: "active" },
        ]);
        expect(result.ok).toBe(true);
    });
});
