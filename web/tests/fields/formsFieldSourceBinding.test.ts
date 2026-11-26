import { describe, expect, it } from "vitest";
import {
    canonicalProviderToFormFieldSource,
    formFieldSourceToCanonicalProvider,
} from "@/lib/fields/formsFieldSourceBinding";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";

describe("formsFieldSourceBinding", () => {
    it("converts canonical provider to legacy-compatible field_source shape", () => {
        const source = canonicalProviderToFormFieldSource({
            refKey: "person.first_name",
            label: "First name",
            kind: "platform_field",
            outputShape: "scalar",
            entityNamespace: "guardian",
            isSystem: true,
            availability: { pipeline: true, waitlist: true },
        });
        expect(source).toMatchObject({
            entity_type: "guardian",
            field_key: "guardian_first_name",
        });
        expect(source.shared_value_key).toBe("guardian_first_name");
    });

    it("hydrates existing field_source without mutation", () => {
        const legacy = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_first_name")!;
        const resolution = formFieldSourceToCanonicalProvider({
            entity_type: legacy.entity_type,
            field_key: legacy.field_key,
            shared_value_key: legacy.shared_value_key,
        });
        expect(resolution.status).toBe("legacy_alias");
        expect(resolution.canonicalRef).toMatchObject({
            entity_type: "customer_member",
            field_key: "first_name",
        });
        expect(resolution.persistedSource.field_key).toBe("child_first_name");
    });

    it("returns unknown for unrecognized bindings", () => {
        const resolution = formFieldSourceToCanonicalProvider({
            entity_type: "custom_entity",
            field_key: "unknown_field",
        });
        expect(resolution.status).toBe("unknown");
    });

    it("preserves custom unmapped fields", () => {
        const resolution = formFieldSourceToCanonicalProvider({
            entity_type: "custom",
            field_key: "unmapped",
        });
        expect(resolution.status).toBe("custom");
    });
});
