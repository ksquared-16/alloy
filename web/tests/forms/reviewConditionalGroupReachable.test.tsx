/**
 * A CONDITIONALLY SHOWN COLLECTION CAN BE EDITED WHERE THE REVIEW SENDS THE FAMILY.
 *
 * Deployed on staging (87afe161), Family C answered "Do you have other children?" → Yes in the
 * conversation. The review then said "Other children in your household needs 1 complete — use Make a
 * change", and Make a change showed Parents and Emergency contacts but not Other children.
 *
 * Make a change renders each control alone, through the shared engine, in a sub-schema holding only
 * that control. The group kept its visibility condition; the question it names was not in the
 * sub-schema, so the engine evaluated the condition false and rendered nothing. Driven here with the
 * real published Admissions schema and the real engine.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { subSchemaForFieldsGrouped } from "@/lib/forms/guidedIntakePartition";
import { withListedFieldsShown } from "@/lib/forms/submissionSemantics";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";

const SCHEMA: FormSchemaV1 = validateFormSchema(
    JSON.parse(readFileSync(resolve(__dirname, "__fixtures_admissions_v12_published.json"), "utf8")),
);
const OTHER_CHILDREN = "emergency_contacts_2";

const render = (schema: FormSchemaV1) =>
    renderToStaticMarkup(
        <FormEngineRenderer
            schema={schema}
            payload={{ values: { untitled_yes_no_13: true }, groups: {} }}
            onChange={() => undefined}
            mode="edit"
            variant="embed"
        />,
    );

describe("Make a change can reach the Other children collection", () => {
    it("the raw one-control sub-schema hides it — the measured defect", () => {
        const html = render(subSchemaForFieldsGrouped(SCHEMA, [OTHER_CHILDREN], ""));
        expect(html).not.toContain("Add at least 1 entry");
    });

    it("listed as shown, it renders as an editable collection with its minimum", () => {
        const html = render(withListedFieldsShown(subSchemaForFieldsGrouped(SCHEMA, [OTHER_CHILDREN], ""), [OTHER_CHILDREN]));
        expect(html).toContain("Add at least 1 entry");
        expect(html).toContain("Other children in your household");
        expect(html).toContain("Add item");
    });

    it("only the listed fields' own conditions are dropped", () => {
        const sub = withListedFieldsShown(subSchemaForFieldsGrouped(SCHEMA, [OTHER_CHILDREN, "untitled_address_2"], ""), [OTHER_CHILDREN]);
        expect(sub.fields.find((f) => f.id === OTHER_CHILDREN)?.visibility).toBeUndefined();
        expect(sub.fields.find((f) => f.id === "untitled_address_2")?.visibility).toBeDefined();
    });
});
