import { describe, expect, it } from "vitest";
import {
    ensureGroupRows,
    newRespondentAddedCollectionRow,
    setTopLevelValue,
} from "@/components/forms/engine/formEnginePayload";
import type { FormPayload } from "@/lib/forms/validateSubmission";

const childrenBinding = {
    collection_provider_ref: "children",
    iteration_entity_type: "customer_member",
} as const;

describe("collection payload interaction (engine state)", () => {
    it("adds respondent-added row with stable metadata and persists nested values", () => {
        const existing: FormPayload = {
            values: {},
            groups: {
                kids: [
                    {
                        instance_key: "col:children:cm-1",
                        values: { child_first_name: "Sam" },
                        collection: {
                            provider_ref: "children",
                            item_id: "cm-1",
                            origin: "existing",
                            iteration_entity_type: "customer_member",
                        },
                    },
                ],
            },
        };

        const added = newRespondentAddedCollectionRow(childrenBinding);
        expect(added.collection?.origin).toBe("respondent_added");
        expect(added.collection?.item_id).toBeUndefined();
        expect(added.instance_key).toBeTruthy();

        const withAdded = ensureGroupRows(existing, "kids", [...(existing.groups?.kids ?? []), added]);
        const rowIndex = withAdded.groups!.kids!.length - 1;
        const edited = ensureGroupRows(withAdded, "kids", withAdded.groups!.kids!.map((row, i) =>
            i === rowIndex ? { ...row, values: { ...row.values, child_first_name: "New child" } } : row,
        ));

        expect(edited.groups?.kids).toHaveLength(2);
        expect(edited.groups?.kids?.[1]?.values.child_first_name).toBe("New child");
        expect(edited.groups?.kids?.[1]?.collection?.origin).toBe("respondent_added");

        const rerendered = ensureGroupRows({ values: {} }, "kids", edited.groups!.kids!);
        expect(rerendered.groups?.kids?.[1]?.values.child_first_name).toBe("New child");
    });

    it("does not expose collection metadata through scalar value paths", () => {
        const payload = setTopLevelValue({ values: {}, groups: {} }, "note", "hello");
        expect(payload.values.note).toBe("hello");
        expect(JSON.stringify(payload)).not.toContain("provider_ref");
    });
});
