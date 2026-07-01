import { describe, it, expect } from "vitest";
import {
    parseLaunchFromEntityInput,
    parseLaunchFromEntityBody,
    isLaunchEntityType,
} from "@/lib/pos/packet/launchFromEntity";

const UUID = "11111111-2222-4333-8444-555555555555";

describe("isLaunchEntityType", () => {
    it("accepts the four allowed types only", () => {
        expect(isLaunchEntityType("opportunity")).toBe(true);
        expect(isLaunchEntityType("customer_member")).toBe(true);
        expect(isLaunchEntityType("lead")).toBe(false);
        expect(isLaunchEntityType(null)).toBe(false);
    });
});

describe("parseLaunchFromEntityInput", () => {
    it("returns null value when both fields empty (no launch context)", () => {
        expect(parseLaunchFromEntityInput({})).toEqual({ ok: true, value: null });
        expect(parseLaunchFromEntityInput({ entityType: "  ", entityId: "" })).toEqual({ ok: true, value: null });
    });

    it("validates a complete selection", () => {
        expect(parseLaunchFromEntityInput({ entityType: "opportunity", entityId: UUID })).toEqual({
            ok: true,
            value: { entity_type: "opportunity", entity_id: UUID },
        });
    });

    it("carries prefill_enabled only when explicitly false", () => {
        expect(parseLaunchFromEntityInput({ entityType: "person", entityId: UUID, prefillEnabled: false })).toEqual({
            ok: true,
            value: { entity_type: "person", entity_id: UUID, prefill_enabled: false },
        });
        const on = parseLaunchFromEntityInput({ entityType: "person", entityId: UUID, prefillEnabled: true });
        expect(on.ok && on.value && "prefill_enabled" in on.value).toBe(false);
    });

    it("requires a type when an id is given", () => {
        expect(parseLaunchFromEntityInput({ entityId: UUID })).toMatchObject({ ok: false });
    });

    it("rejects an unknown type", () => {
        expect(parseLaunchFromEntityInput({ entityType: "lead", entityId: UUID })).toMatchObject({ ok: false });
    });

    it("requires an id when a type is given", () => {
        expect(parseLaunchFromEntityInput({ entityType: "customer" })).toMatchObject({ ok: false });
    });

    it("rejects a non-uuid id", () => {
        expect(parseLaunchFromEntityInput({ entityType: "customer", entityId: "not-a-uuid" })).toMatchObject({ ok: false });
    });
});

describe("parseLaunchFromEntityBody", () => {
    it("treats absent body as no launch", () => {
        expect(parseLaunchFromEntityBody(undefined)).toEqual({ ok: true, value: null });
        expect(parseLaunchFromEntityBody(null)).toEqual({ ok: true, value: null });
    });

    it("rejects non-object bodies", () => {
        expect(parseLaunchFromEntityBody("x")).toMatchObject({ ok: false });
        expect(parseLaunchFromEntityBody([])).toMatchObject({ ok: false });
    });

    it("parses a valid body", () => {
        expect(parseLaunchFromEntityBody({ entity_type: "customer_member", entity_id: UUID })).toEqual({
            ok: true,
            value: { entity_type: "customer_member", entity_id: UUID },
        });
    });
});
