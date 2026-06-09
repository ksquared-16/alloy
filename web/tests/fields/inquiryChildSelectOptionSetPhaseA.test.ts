import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    fallbackOptionSetKeyForInquiryChildField,
    INQUIRY_CHILD_NATIVE_OPTION_SET_KEYS,
} from "@/lib/fields/inquiryChildFieldRegistry";
import { resolveSelectFieldBinding } from "@/lib/fields/resolveSelectFieldBinding";
import { mergeInquiryChildCreateFormFields } from "@/lib/admin/actions/entityCreateFormFieldLoader";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { SYSTEM_FIELD_BY_ID } from "@/lib/forms/systemFieldRegistry";
import { inferActionIntakeValueKind } from "@/lib/lifecycle/createLeadIntakeFieldMap";

const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20260610120000_inquiry_child_select_option_set_keys.sql",
);

function readComponent(rel: string): string {
    return readFileSync(resolve(__dirname, "../..", rel), "utf8");
}

describe("inquiry_child select option_set_key migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("wires desired_program_type to childcare_program_type", () => {
        expect(sql).toContain("desired_program_type");
        expect(sql).toContain('"option_set_key":"childcare_program_type"');
    });

    it("wires desired_schedule_type to childcare_schedule_type", () => {
        expect(sql).toContain("desired_schedule_type");
        expect(sql).toContain('"option_set_key":"childcare_schedule_type"');
    });
});

describe("INQUIRY_CHILD_NATIVE_OPTION_SET_KEYS", () => {
    it("maps schedule to option set; program uses placement cascade not org-wide set", () => {
        expect(INQUIRY_CHILD_NATIVE_OPTION_SET_KEYS.desired_program_type).toBeUndefined();
        expect(INQUIRY_CHILD_NATIVE_OPTION_SET_KEYS.desired_schedule_type).toBe("childcare_schedule_type");
        expect(fallbackOptionSetKeyForInquiryChildField("desired_program_type")).toBeNull();
        expect(fallbackOptionSetKeyForInquiryChildField("desired_schedule_type")).toBe("childcare_schedule_type");
        expect(fallbackOptionSetKeyForInquiryChildField("notes")).toBeNull();
    });
});

describe("resolveSelectFieldBinding", () => {
    it("treats select + option_set_key as select binding", () => {
        const r = resolveSelectFieldBinding({
            field_type: "select",
            config: { option_set_key: "childcare_program_type" },
        });
        expect(r.isSelect).toBe(true);
        expect(r.option_set_key).toBe("childcare_program_type");
    });

    it("does not treat select without option_set_key as select", () => {
        const r = resolveSelectFieldBinding({ field_type: "select", config: {} });
        expect(r.isSelect).toBe(false);
    });

    it("uses fallback option set when config absent", () => {
        const r = resolveSelectFieldBinding({
            field_type: "select",
            config: null,
            fallbackOptionSetKey: "childcare_schedule_type",
        });
        expect(r.isSelect).toBe(true);
        expect(r.option_set_key).toBe("childcare_schedule_type");
    });

    it("keeps text fields as non-select", () => {
        const r = resolveSelectFieldBinding({
            field_type: "text",
            config: { option_set_key: "childcare_program_type" },
        });
        expect(r.isSelect).toBe(false);
    });
});

describe("mergeInquiryChildCreateFormFields fallback", () => {
    it("includes option_set_key for schedule only when API is sparse; program uses placement cascade", () => {
        const fields = mergeInquiryChildCreateFormFields([]);
        expect(fields.find((f) => f.field_key === "desired_program_type")?.option_set_key).toBeNull();
        expect(fields.find((f) => f.field_key === "desired_schedule_type")?.option_set_key).toBe(
            "childcare_schedule_type",
        );
        expect(fields.find((f) => f.field_key === "notes")?.option_set_key).toBeNull();
    });
});

describe("formFieldFromRegistryEntry enrollment selects", () => {
    it("uses default_option_set_key for desired_program_type — not placeholder static options", () => {
        const entry = SYSTEM_FIELD_BY_ID.get("desired_program_type")!;
        const field = formFieldFromRegistryEntry(entry);
        expect(field.type).toBe("select");
        if (field.type !== "select") throw new Error("expected select");
        expect(field.option_set_key).toBe("childcare_program_type");
        expect(field.static_options).toBeUndefined();
    });

    it("uses default_option_set_key for desired_schedule_type", () => {
        const entry = SYSTEM_FIELD_BY_ID.get("desired_schedule_type")!;
        const field = formFieldFromRegistryEntry(entry);
        expect(field.type).toBe("select");
        if (field.type !== "select") throw new Error("expected select");
        expect(field.option_set_key).toBe("childcare_schedule_type");
    });

    it("still renders text registry fields as text", () => {
        const entry = SYSTEM_FIELD_BY_ID.get("child_first_name")!;
        const field = formFieldFromRegistryEntry(entry);
        expect(field.type).toBe("text");
    });
});

describe("inferActionIntakeValueKind", () => {
    it("returns select when option_set_key is present", () => {
        expect(inferActionIntakeValueKind("child:program_interest", "desired_program_type", "childcare_program_type")).toBe(
            "select",
        );
    });

    it("returns text for generic child fields without option set", () => {
        expect(inferActionIntakeValueKind("child:first_name", "first_name")).toBe("text");
    });
});

describe("create/intake select renderers", () => {
    it("Create Lead intake field groups render selects generically by value_kind", () => {
        const src = readComponent("components/admin/opportunity/actions/ActionIntakeFieldGroups.tsx");
        expect(src).toContain('field.value_kind === "select"');
        expect(src).toContain("SelectFieldControl");
        expect(src).toContain("useOptionSetSelectOptions");
    });

    it("Add Child configured create form renders selects from option_set_key", () => {
        const src = readComponent("components/admin/opportunity/actions/ConfiguredCreateFormFields.tsx");
        expect(src).toContain("SelectFieldControl");
        expect(src).toContain("option_set_key");
        expect(src).not.toMatch(/type=\{inputTypeForField\(field\)\}[\s\S]*desired_program_type/);
    });

    it("resolveActionIntakeSpec wires child program interest as site-scoped placement select", () => {
        const src = readFileSync(resolve(__dirname, "../../lib/lifecycle/resolveActionIntakeSpec.ts"), "utf8");
        expect(src).toContain("resolveSelectFieldBinding");
        expect(src).toContain("placement_select: placementSelect");
        expect(src).toContain('fieldKey === "desired_program_type"');
        expect(src).toContain("fallbackOptionSetKeyForInquiryChildField");
    });
});
