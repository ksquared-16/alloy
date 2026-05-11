import { describe, expect, it } from "vitest";
import {
    mergeFormListWithPacketItems,
    normalizeJoinedFormDefinition,
    type PacketStepFormOption,
} from "@/lib/admin/forms/packetDefinitionStepForms";

describe("normalizeJoinedFormDefinition", () => {
    it("returns object as-is", () => {
        const o = { id: "a", name: "N", key: "k" };
        expect(normalizeJoinedFormDefinition(o)).toBe(o);
    });

    it("unwraps single-element array", () => {
        const o = { id: "a", name: "N", key: "k" };
        expect(normalizeJoinedFormDefinition([o])).toBe(o);
    });

    it("returns null for empty array", () => {
        expect(normalizeJoinedFormDefinition([])).toBeNull();
    });
});

describe("mergeFormListWithPacketItems", () => {
    it("adds forms referenced only on packet items so selects stay hydrated", () => {
        const forms: PacketStepFormOption[] = [];
        const items = [
            {
                form_definition_id: "11111111-1111-4111-8111-111111111111",
                form_definitions: { id: "11111111-1111-4111-8111-111111111111", name: "Intake", key: "intake" },
            },
        ];
        const merged = mergeFormListWithPacketItems(forms, items);
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({
            id: "11111111-1111-4111-8111-111111111111",
            name: "Intake",
            key: "intake",
            has_published_version: true,
        });
    });

    it("marks packet-linked forms published even when list had false", () => {
        const forms: PacketStepFormOption[] = [
            { id: "11111111-1111-4111-8111-111111111111", name: "Intake", key: "intake", has_published_version: false },
        ];
        const items = [
            {
                form_definition_id: "11111111-1111-4111-8111-111111111111",
                form_definitions: [{ id: "11111111-1111-4111-8111-111111111111", name: "Intake", key: "intake" }],
            },
        ];
        const merged = mergeFormListWithPacketItems(forms, items);
        expect(merged[0]!.has_published_version).toBe(true);
    });

    it("merges without duplicates", () => {
        const forms: PacketStepFormOption[] = [
            { id: "a", name: "A", key: "a", has_published_version: true },
            { id: "b", name: "B", key: "b", has_published_version: true },
        ];
        const items = [
            {
                form_definition_id: "a",
                form_definitions: { id: "a", name: "A updated", key: "a" },
            },
        ];
        const merged = mergeFormListWithPacketItems(forms, items);
        expect(merged).toHaveLength(2);
        const a = merged.find((x) => x.id === "a");
        expect(a?.name).toBe("A updated");
        expect(a?.has_published_version).toBe(true);
    });
});
