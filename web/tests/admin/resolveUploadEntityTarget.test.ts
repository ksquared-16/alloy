/**
 * Upload entity-target resolution — proves the upload blocker fix:
 *  - normal uploads still REQUIRE a valid entity (unchanged behavior),
 *  - POS intake (open_processing_case=true) may upload WITHOUT an entity (entity-less),
 *  - invalid entity types are still rejected.
 */

import { describe, it, expect } from "vitest";
import { resolveUploadEntityTarget } from "@/lib/admin/resolveUploadEntityTarget";

const MAP: Record<string, string> = {
    customers: "customer",
    customer: "customer",
    opportunities: "opportunity",
    opportunity: "opportunity",
    customer_members: "customer_member",
    customer_member: "customer_member",
};

describe("resolveUploadEntityTarget", () => {
    it("entity provided → entity mode with canonical type (unchanged behavior)", () => {
        expect(resolveUploadEntityTarget({ openProcessingCase: false, entityTypeRaw: "customers", entityId: "c1" }, MAP)).toEqual({
            ok: true,
            mode: "entity",
            canonicalType: "customer",
            entityId: "c1",
        });
    });

    it("entity provided + open_processing_case → still entity mode (attach AND open case)", () => {
        const t = resolveUploadEntityTarget({ openProcessingCase: true, entityTypeRaw: "opportunity", entityId: "o1" }, MAP);
        expect(t).toMatchObject({ ok: true, mode: "entity", canonicalType: "opportunity", entityId: "o1" });
    });

    it("no entity + NOT POS → MISSING_ENTITY 400 (unchanged behavior)", () => {
        expect(resolveUploadEntityTarget({ openProcessingCase: false, entityTypeRaw: "", entityId: "" }, MAP)).toEqual({
            ok: false,
            code: "MISSING_ENTITY",
            message: "entity_type and entity_id are required",
        });
    });

    it("no entity + POS intake → pos_intake (entity-less upload allowed) — THE FIX", () => {
        expect(resolveUploadEntityTarget({ openProcessingCase: true, entityTypeRaw: "", entityId: "" }, MAP)).toEqual({
            ok: true,
            mode: "pos_intake",
        });
    });

    it("partial entity (type only) + POS → pos_intake (no half-entity)", () => {
        expect(resolveUploadEntityTarget({ openProcessingCase: true, entityTypeRaw: "customers", entityId: "" }, MAP).ok).toBe(true);
        expect(resolveUploadEntityTarget({ openProcessingCase: true, entityTypeRaw: "customers", entityId: "" }, MAP)).toMatchObject({ mode: "pos_intake" });
    });

    it("invalid entity type (with both fields) → UNSUPPORTED_ENTITY", () => {
        expect(resolveUploadEntityTarget({ openProcessingCase: true, entityTypeRaw: "dragons", entityId: "d1" }, MAP)).toEqual({
            ok: false,
            code: "UNSUPPORTED_ENTITY",
            message: "Unsupported entity_type",
        });
    });

    it("canonical value passed directly is accepted", () => {
        expect(resolveUploadEntityTarget({ openProcessingCase: false, entityTypeRaw: "customer_member", entityId: "m1" }, MAP)).toMatchObject({
            mode: "entity",
            canonicalType: "customer_member",
        });
    });
});
