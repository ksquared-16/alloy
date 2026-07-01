import { describe, expect, it } from "vitest";
import {
    getOrderedOverviewFieldKeys,
    orderAndFilterOverviewFields,
    parseOverviewLayoutConfig,
} from "@/lib/rrs/overview/overviewLayoutV0";
import type { ResolvedFieldDescriptor } from "@/lib/rrs/types";

describe("parseOverviewLayoutConfig", () => {
    it("accepts kind field and service_property band", () => {
        const c = parseOverviewLayoutConfig({
            header_keys: ["title"],
            bands: [
                {
                    band_key: "service_property",
                    enabled: true,
                    items: [{ kind: "field", "key": "_service_bedrooms" }],
                },
            ],
            relationship_group_keys: ["primary_customer_person"],
        });
        expect(c.header_keys).toEqual(["title"]);
        expect(c.bands[0].band_key).toBe("service_property");
        expect(c.bands[0].items[0].kind).toBe("system_field");
        expect(c.bands[0].items[0].key).toBe("_service_bedrooms");
        expect(c.relationship_group_keys).toEqual(["primary_customer_person"]);
    });
});

describe("orderAndFilterOverviewFields", () => {
    it("orders by header then bands; dedupes", () => {
        const layout = parseOverviewLayoutConfig({
            header_keys: ["title", "_status_display"],
            bands: [
                {
                    band_key: "summary",
                    enabled: true,
                    items: [
                        { kind: "field", "key": "_customer_name" },
                        { kind: "field", "key": "title" },
                    ],
                },
            ],
        });
        const fields: ResolvedFieldDescriptor[] = [
            { key: "_customer_name", label: "C", value: "x", source: "computed", editable: false, editable_entity: null, editable_key: null },
            { key: "title", label: "T", value: "y", source: "system", editable: true, editable_entity: "jobs", editable_key: "title" },
            { key: "_status_display", label: "S", value: "z", source: "computed", editable: false, editable_entity: null, editable_key: null },
        ];
        const ordered = orderAndFilterOverviewFields(fields, layout);
        expect(ordered.map((f) => f.key)).toEqual(["title", "_status_display", "_customer_name"]);
    });
});

describe("getOrderedOverviewFieldKeys", () => {
    it("matches header then band order", () => {
        const layout = parseOverviewLayoutConfig({
            header_keys: ["a"],
            bands: [{ band_key: "summary", enabled: true, items: [{ kind: "field", "key": "b" }] }],
        });
        expect(getOrderedOverviewFieldKeys(layout)).toEqual(["a", "b"]);
    });
});
