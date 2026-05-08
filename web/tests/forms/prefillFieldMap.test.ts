import { describe, expect, it } from "vitest";
import {
    mergeDefinitionAndLinkPrefillMaps,
    parsePrefillFieldMapBody,
    parsePrefillFieldMapFromMetadata,
} from "@/lib/forms/prefill/prefillFieldMap";

describe("prefillFieldMap", () => {
    it("parsePrefillFieldMapFromMetadata accepts entity.column paths", () => {
        const m = parsePrefillFieldMapFromMetadata({
            a: "person.email",
            skip: "bad",
            b: "customer_member.first_name",
        });
        expect(m).toEqual({ a: "person.email", b: "customer_member.first_name" });
    });

    it("mergeDefinitionAndLinkPrefillMaps lets link override form defaults", () => {
        const merged = mergeDefinitionAndLinkPrefillMaps(
            { prefill_field_map: { x: "person.email", y: "customer.name" } },
            { prefill_field_map: { y: "customer_member.first_name" } }
        );
        expect(merged).toEqual({
            x: "person.email",
            y: "customer_member.first_name",
        });
    });

    it("parsePrefillFieldMapBody rejects invalid paths", () => {
        const r = parsePrefillFieldMapBody({ bad: "wat" });
        expect(r.ok).toBe(false);
    });

    it("parsePrefillFieldMapBody accepts valid map", () => {
        const r = parsePrefillFieldMapBody({ nm: "contact.email" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.map).toEqual({ nm: "contact.email" });
    });
});
