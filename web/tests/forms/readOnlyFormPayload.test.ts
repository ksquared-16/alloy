import { describe, expect, it } from "vitest";
import { applyReadOnlyBaselineToPayload } from "@/lib/forms/readOnlyFormPayload";
import { validateFormSchema } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

describe("applyReadOnlyBaselineToPayload", () => {
    it("restores read_only answers from baseline draft", () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["locked", "open"] }],
            fields: [
                { id: "locked", type: "text", label: "L", required: false, read_only: true },
                { id: "open", type: "text", label: "O", required: false },
            ],
        });
        const incoming: FormPayload = {
            values: { locked: "tampered", open: "ok" },
            meta: {},
        };
        const baseline: FormPayload = {
            values: { locked: "official", open: "old" },
            meta: {},
        };
        const out = applyReadOnlyBaselineToPayload(schema, incoming, baseline);
        expect(out.values.locked).toBe("official");
        expect(out.values.open).toBe("ok");
    });
});
