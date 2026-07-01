import { describe, expect, it } from "vitest";
import { mergePrefillIntoDraftValues } from "@/lib/forms/prefill/mergePrefillDraftValues";
import { validateFormSchema } from "@/lib/forms/schema";

describe("mergePrefillIntoDraftValues", () => {
    it("lets client override editable prefilled fields", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["a"] }],
            fields: [{ id: "a", type: "text", label: "A", required: false }],
        });
        const out = mergePrefillIntoDraftValues(schema, { a: "from-client" }, { a: "from-server" });
        expect(out.a).toBe("from-client");
    });

    it("keeps server values for read_only fields when prefilled", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["a"] }],
            fields: [{ id: "a", type: "text", label: "A", required: false, read_only: true }],
        });
        const out = mergePrefillIntoDraftValues(schema, { a: "from-client" }, { a: "from-server" });
        expect(out.a).toBe("from-server");
    });
});
