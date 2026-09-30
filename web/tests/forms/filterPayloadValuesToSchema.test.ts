import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { validateFormSchema } from "@/lib/forms/schema";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";

const published = validateFormSchema(
    JSON.parse(readFileSync(join(__dirname, "__fixtures_admissions_v12_published.json"), "utf8")),
);

describe("which values a packet step is allowed to carry", () => {
    it("keeps a scalar child of a plain group", () => {
        /*
         * The regression that mattered. Admissions v12's Home and Mailing addresses are plain groups
         * whose children are ordinary text fields addressed by their own id in `values`. The filter
         * allowed top-level fields only, so a parent's typed address was silently discarded on every
         * draft save — invisible until an address group had anything to put in it.
         */
        const out = filterPayloadValuesToSchemaFields(published, {
            untitled_address_address_line1: "12 Typed Street",
            untitled_address_2_city: "Sisters",
        });
        expect(out).toEqual({
            untitled_address_address_line1: "12 Typed Street",
            untitled_address_2_city: "Sisters",
        });
    });

    it("keeps an ordinary top-level answer", () => {
        expect(filterPayloadValuesToSchemaFields(published, { untitled_short_text: "Dax" })).toEqual({
            untitled_short_text: "Dax",
        });
    });

    it("still drops a key from another step, which is why the filter exists", () => {
        expect(filterPayloadValuesToSchemaFields(published, { a_field_from_another_step: "x" })).toEqual({});
    });

    it("still drops a repeating group's child, which has no row to belong to in values", () => {
        // Collection answers live under `payload.groups`, one row at a time. A bare `values` entry
        // keyed by a repeating child is unanchored and must not be admitted.
        const collectionChild = (() => {
            for (const f of published.fields) {
                if (f.type === "group" && f.collection_binding) return (f.fields ?? [])[0]?.id;
            }
            return undefined;
        })();
        expect(collectionChild).toBeTruthy();
        expect(filterPayloadValuesToSchemaFields(published, { [collectionChild!]: "x" })).toEqual({});
    });

    it("drops the group container's own id", () => {
        expect(filterPayloadValuesToSchemaFields(published, { untitled_address: "x" })).toEqual({});
    });

    it("keeps nothing when the schema declares nothing", () => {
        const empty = { schema_version: 1, title: "t", fields: [], sections: [] } as unknown as FormSchemaV1;
        expect(filterPayloadValuesToSchemaFields(empty, { anything: 1 })).toEqual({});
    });
});
