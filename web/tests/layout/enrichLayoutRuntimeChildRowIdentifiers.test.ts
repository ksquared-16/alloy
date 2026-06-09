import { describe, expect, it } from "vitest";
import {
    enrichLayoutRuntimeChildRowIdentifiers,
    enrichLayoutRuntimeChildRowsFromAnchor,
} from "@/lib/layout/runtime/enrichLayoutRuntimeChildRowIdentifiers";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import { normalizeLayoutRuntimeChildRow } from "@/lib/layout/runtime/normalizeLayoutRuntimeChildRow";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

describe("enrichLayoutRuntimeChildRowIdentifiers", () => {
    it("backfills person_id from anchor _inquiry_children by name match", () => {
        const row: ProofRuntimeRecord = {
            id: "child-row-0",
            "child.name": "Jim Pat",
            person_id: "",
            "child.id": "",
        };
        const { row: enriched, mapperSource } = enrichLayoutRuntimeChildRowIdentifiers(row, {
            index: 0,
            inquiryChildren: [
                {
                    person_id: "person-jim",
                    customer_member_id: "cm-1",
                    first_name: "Jim",
                    last_name: "Pat",
                    display_name: "Jim Pat",
                },
            ],
            totalChildCount: 1,
        });
        expect(enriched.person_id).toBe("person-jim");
        expect(enriched["child.id"]).toBe("person-jim");
        expect(mapperSource).toBe("anchor._inquiry_children");
    });

    it("backfills single-child rows from anchor primaryChildPersonId", () => {
        const row: ProofRuntimeRecord = {
            id: "child-row-0",
            "child.name": "Jim Pat",
            person_id: "",
            "child.id": "",
        };
        const { row: enriched, mapperSource } = enrichLayoutRuntimeChildRowIdentifiers(row, {
            index: 0,
            primaryChildPersonId: "child-person-1",
            totalChildCount: 1,
        });
        expect(enriched.person_id).toBe("child-person-1");
        expect(enriched["child.id"]).toBe("child-person-1");
        expect(mapperSource).toBe("anchor.primaryChildPersonId");
    });

    it("marks missing_all_ids when no identifiers can be resolved", () => {
        const row: ProofRuntimeRecord = {
            id: "child-row-0",
            "child.name": "Jim Pat",
            person_id: "",
            "child.id": "",
        };
        const { row: enriched, mapperSource } = enrichLayoutRuntimeChildRowIdentifiers(row, {
            index: 0,
            totalChildCount: 2,
        });
        expect(enriched.person_id).toBe("");
        expect(mapperSource).toBe("missing_all_ids");
        expect(enriched._layout_runtime_child_id_source).toBe("missing_all_ids");
    });

    it("stamps mapper and collection metadata from anchor enrichment", () => {
        const rows = enrichLayoutRuntimeChildRowsFromAnchor(
            [{ id: "child-row-0", "child.name": "Jim Pat", person_id: "", "child.id": "" }],
            {
                _inquiry_children: [
                    {
                        person_id: "person-jim",
                        display_name: "Jim Pat",
                        first_name: "Jim",
                        last_name: "Pat",
                    },
                ],
            },
            { collectionKey: "children" },
        );
        expect(rows[0]?.person_id).toBe("person-jim");
        expect(rows[0]?._layout_runtime_child_mapper_source).toBe("anchor._inquiry_children");
        expect(rows[0]?._layout_runtime_child_collection_key).toBe("children");
    });
});

describe("normalizeLayoutRuntimeChildRow + readLayoutRuntimeRepeaterRows enrichment chain", () => {
    it("does not let name-only normalized rows bypass anchor enrichment", () => {
        const normalized = normalizeLayoutRuntimeChildRow(
            { "child.name": "Jim Pat", id: "child-row-0" },
            0,
        );
        expect(normalized?.["child.name"]).toBe("Jim Pat");
        expect(normalized?._layout_runtime_child_id_source).toBe("name_only_pending_enrichment");

        const item = {
            id: "children-list",
            kind: "related_list" as const,
            refKey: "children",
            source: "children",
        };
        const record = {
            id: "opp-1",
            children: [normalized],
            _inquiry_children: [
                {
                    person_id: "person-jim",
                    customer_member_id: "cm-1",
                    display_name: "Jim Pat",
                    first_name: "Jim",
                    last_name: "Pat",
                },
            ],
        };
        const rows = readLayoutRuntimeRepeaterRows(record, item);
        expect(rows[0]?.person_id).toBe("person-jim");
        expect(rows[0]?._layout_runtime_child_mapper_source).toBe("anchor._inquiry_children");
        expect(rows[0]?._layout_runtime_child_mapper_source).not.toBe("missing_all_ids");
    });
});
