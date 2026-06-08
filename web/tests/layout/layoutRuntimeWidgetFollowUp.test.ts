import { describe, expect, it } from "vitest";
import { countPersonContactEditableFields, enrichLayoutDocPersonContactEditable } from "@/lib/layout/runtime/enrichLayoutDocPersonContactEditable";
import { mergeOpportunityLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeOpportunityLayoutRuntimeWidgetRecord";
import { resolveLayoutRuntimeWidgetKey } from "@/lib/layout/runtime/resolveLayoutRuntimeWidgetKey";
import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";

function widgetItem(refKey: string): LayoutItem {
    return { kind: "widget", refKey, widget: { widgetKey: refKey } };
}

describe("resolveLayoutRuntimeWidgetKey", () => {
    it("normalizes namespaced widget refKeys", () => {
        expect(resolveLayoutRuntimeWidgetKey(widgetItem("opportunities.tasks"))).toBe("tasks");
        expect(resolveLayoutRuntimeWidgetKey(widgetItem("opportunities.attention"))).toBe("attention");
    });

    it("falls back to widget.widgetKey tail", () => {
        expect(
            resolveLayoutRuntimeWidgetKey({
                kind: "widget",
                widget: { widgetKey: "drawer.attention" },
            }),
        ).toBe("attention");
    });
});

describe("mergeOpportunityLayoutRuntimeWidgetRecord", () => {
    it("overlays VM task and attention payloads onto layout record", () => {
        const layoutRecord = { id: "opp-1", _overview_data: { id: "opp-1" } };
        const vmRecord = {
            _inquiry_summary_tasks: { state: "loaded", open_tasks: [{ id: "t1", title: "Call", due_at: "", status: "open", source: "" }], open_count: 1 },
            _operational_attention: { needs_attention: true, reasons: [] },
        };
        const merged = mergeOpportunityLayoutRuntimeWidgetRecord(layoutRecord, vmRecord);
        expect(merged._inquiry_summary_tasks).toEqual(vmRecord._inquiry_summary_tasks);
        expect((merged._overview_data as Record<string, unknown>)._operational_attention).toEqual(vmRecord._operational_attention);
    });
});

describe("enrichLayoutDocPersonContactEditable", () => {
    it("marks person-contact fields editable when omitted from published doc", () => {
        const doc: LayoutDoc = {
            metadata: {},
            sections: [
                {
                    key: "main",
                    label: "Main",
                    rows: [
                        {
                            columns: [
                                {
                                    items: [
                                        { kind: "field", refKey: "person.first_name", label: "First" },
                                        { kind: "field", refKey: "opportunity.source", label: "Source" },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        const enriched = enrichLayoutDocPersonContactEditable(doc);
        expect(countPersonContactEditableFields(enriched)).toBe(1);
    });
});
