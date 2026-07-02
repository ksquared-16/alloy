/**
 * Layout refKey alias convergence (FC-1).
 */

import { describe, expect, it } from "vitest";
import {
    CANONICAL_LAYOUT_REFKEY_NAMESPACES,
    LAYOUT_REFKEY_ALIASES,
    collectDeprecatedRefKeyWarnings,
    isDeprecatedRefKeyNamespace,
    normalizeRefKeyOnRead,
    parseLayoutRefKey,
    validateRefKeyForWrite,
} from "@/lib/layout/layoutRefKeyAliases";
import { CURATED_FIELDS, LAYOUT_ENTITY_GROUPS, makeRefKey, parseRefKey } from "@/lib/layout/fieldCatalog";
import { INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";
import * as ops from "@/lib/layout/builderOps";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";

describe("layoutRefKeyAliases — canonical namespaces", () => {
    it("includes FC-2 reference namespaces (location, customer)", () => {
        expect(CANONICAL_LAYOUT_REFKEY_NAMESPACES).toEqual([
            "child",
            "customer",
            "inquiry_child",
            "location",
            "opportunity",
            "person",
        ]);
    });

    it("does not include child_inquiry as canonical", () => {
        expect(CANONICAL_LAYOUT_REFKEY_NAMESPACES).not.toContain("child_inquiry");
    });
});

describe("layoutRefKeyAliases — alias-on-read", () => {
    it("maps deprecated child_inquiry.* to inquiry_child.*", () => {
        expect(normalizeRefKeyOnRead("child_inquiry.start_date")).toBe("inquiry_child.start_date");
        expect(normalizeRefKeyOnRead("child_inquiry.program")).toBe("inquiry_child.program_category_id");
        expect(normalizeRefKeyOnRead("child_inquiry.status")).toBe("inquiry_child.outcome_status_key");
    });

    it("maps child participation keys to inquiry_child.*", () => {
        expect(normalizeRefKeyOnRead("child.program")).toBe("inquiry_child.program_category_id");
        expect(normalizeRefKeyOnRead("child.start_date")).toBe("inquiry_child.start_date");
        expect(normalizeRefKeyOnRead("child.room")).toBe("inquiry_child.program_room_cohort_key");
    });

    it("maps legacy desired_* participation keys to canonical inquiry_child.* keys (S2 migration aliases)", () => {
        expect(normalizeRefKeyOnRead("inquiry_child.desired_start_date")).toBe("inquiry_child.start_date");
        expect(normalizeRefKeyOnRead("inquiry_child.desired_schedule_type")).toBe("inquiry_child.schedule_type");
        expect(normalizeRefKeyOnRead("inquiry_child.desired_program_category_id")).toBe("inquiry_child.program_category_id");
        expect(normalizeRefKeyOnRead("inquiry_child.desired_program_type")).toBe("inquiry_child.program_category_id");
    });

    it("maps person primary_* curated keys to registry keys", () => {
        expect(normalizeRefKeyOnRead("person.primary_phone")).toBe("person.phone");
        expect(normalizeRefKeyOnRead("person.primary_email")).toBe("person.email");
    });

    it("parseRefKey applies alias-on-read via fieldCatalog", () => {
        expect(parseRefKey("child_inquiry.program")).toEqual({
            entityKey: "inquiry_child",
            fieldKey: "program_category_id",
        });
        expect(parseRefKey("person.primary_phone")).toEqual({ entityKey: "person", fieldKey: "phone" });
    });

    it("parseLayoutRefKey records legacyRefKey when aliased", () => {
        const parsed = parseLayoutRefKey("child_inquiry.status");
        expect(parsed.entityKey).toBe("inquiry_child");
        expect(parsed.fieldKey).toBe("outcome_status_key");
        expect(parsed.legacyRefKey).toBe("child_inquiry.status");
    });

    it("leaves canonical refKeys unchanged", () => {
        expect(normalizeRefKeyOnRead("inquiry_child.notes")).toBe("inquiry_child.notes");
        expect(normalizeRefKeyOnRead("opportunity.status_key")).toBe("opportunity.status_key");
    });
});

describe("layoutRefKeyAliases — deprecate-on-write", () => {
    it("rejects child_inquiry.* on write validation", () => {
        expect(validateRefKeyForWrite("child_inquiry.program").ok).toBe(false);
        expect(validateRefKeyForWrite("inquiry_child.program").ok).toBe(true);
        expect(isDeprecatedRefKeyNamespace("child_inquiry.foo")).toBe(true);
        expect(isDeprecatedRefKeyNamespace("inquiry_child.foo")).toBe(false);
    });

    it("makeFieldItem rejects deprecated refKeys", () => {
        expect(() => ops.makeFieldItem("child_inquiry.program", "Program", "text")).toThrow(/Deprecated refKey/);
        expect(() => ops.makeFieldItem("inquiry_child.program_category_id", "Program", "text")).not.toThrow();
    });

    it("parseLayoutDoc warns on legacy child_inquiry refKeys without failing", () => {
        const doc = {
            formatVersion: 1,
            surface: "drawer",
            entityType: "opportunities",
            sections: [
                {
                    id: "s",
                    key: "k",
                    title: "T",
                    rows: [
                        {
                            id: "r",
                            columns: [
                                {
                                    id: "c",
                                    width: 12,
                                    items: [{ id: "i", kind: "field", refKey: "child_inquiry.program", label: "P" }],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        const res = parseLayoutDoc(doc);
        expect(res.ok).toBe(true);
        expect(res.warnings.some((w) => w.includes("child_inquiry.program"))).toBe(true);
    });

    it("collectDeprecatedRefKeyWarnings lists canonical replacement", () => {
        const warnings = collectDeprecatedRefKeyWarnings(["child_inquiry.status"]);
        expect(warnings[0]).toContain("inquiry_child.outcome_status_key");
    });
});

describe("field catalog — FC-1 canonical groups", () => {
    it("exposes load groups including inquiry_child, customer, location", () => {
        expect(LAYOUT_ENTITY_GROUPS.map((g) => g.entityKey)).toEqual([
            "opportunity",
            "person",
            "child",
            "inquiry_child",
            "customer",
            "location",
        ]);
    });

    it("does not expose child_inquiry as a catalog group", () => {
        expect(LAYOUT_ENTITY_GROUPS.map((g) => g.entityKey)).not.toContain("child_inquiry");
    });

    it("curated inquiry_child covers all native OCM keys with canonical refKeys", () => {
        const keys = CURATED_FIELDS.inquiry_child.map((f) => f.fieldKey);
        for (const native of INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS) {
            expect(keys).toContain(native);
        }
        expect(CURATED_FIELDS.inquiry_child.every((f) => f.refKey.startsWith("inquiry_child."))).toBe(true);
    });

    it("curated child uses durable keys only (no participation fields)", () => {
        const refKeys = CURATED_FIELDS.child.map((f) => f.refKey);
        expect(refKeys).not.toContain("child.program");
        expect(refKeys).not.toContain("child.start_date");
        expect(refKeys.every((k) => k.startsWith("child."))).toBe(true);
    });

    it("makeRefKey emits canonical namespaces only", () => {
        expect(makeRefKey("inquiry_child", "notes")).toBe("inquiry_child.notes");
    });

    it("alias map covers all former child_inquiry curated keys", () => {
        const legacyKeys = [
            "child_inquiry.child_name",
            "child_inquiry.program",
            "child_inquiry.start_date",
            "child_inquiry.status",
        ];
        for (const key of legacyKeys) {
            expect(LAYOUT_REFKEY_ALIASES[key] ?? normalizeRefKeyOnRead(key)).not.toMatch(/^child_inquiry\./);
        }
    });
});
