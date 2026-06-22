import { describe, it, expect } from "vitest";
import {
    buildPosPacketReadModel,
    isPosCreatedPacket,
    type PosPacketReadModelInput,
} from "@/lib/pos/packet/posPacketReadModel";

function def(id: string, over: Partial<PosPacketReadModelInput["definitions"][number]> = {}) {
    return {
        id,
        key: over.key ?? `${id}_key`,
        name: over.name ?? `Packet ${id}`,
        is_active: over.is_active ?? true,
        metadata: over.metadata ?? { created_via: "pos_packet_from_template", source_form_definition_id: "form-1" },
        created_at: over.created_at ?? "2026-06-20T00:00:00Z",
    };
}

const baseForms = [{ id: "form-1", name: "MO500" }];

describe("isPosCreatedPacket", () => {
    it("detects the POS created_via marker", () => {
        expect(isPosCreatedPacket({ created_via: "pos_packet_from_template" })).toBe(true);
        expect(isPosCreatedPacket({ created_via: "other" })).toBe(false);
        expect(isPosCreatedPacket(null)).toBe(false);
    });
});

describe("buildPosPacketReadModel", () => {
    it("resolves source form name and step count, defaults status to ready", () => {
        const out = buildPosPacketReadModel({
            definitions: [def("p1")],
            items: [{ packet_definition_id: "p1", sequence_index: 0, form_definition_id: "form-1" }],
            forms: baseForms,
            links: [],
            sessions: [],
        });
        expect(out).toHaveLength(1);
        expect(out[0].source_form).toEqual({ id: "form-1", name: "MO500" });
        expect(out[0].step_count).toBe(1);
        expect(out[0].status).toBe("ready");
        expect(out[0].share_links.count).toBe(0);
    });

    it("falls back to first step form when metadata has no source_form_definition_id", () => {
        const out = buildPosPacketReadModel({
            definitions: [def("p1", { metadata: { created_via: "pos_packet_from_template" } })],
            items: [{ packet_definition_id: "p1", sequence_index: 0, form_definition_id: "form-1" }],
            forms: baseForms,
            links: [],
            sessions: [],
        });
        expect(out[0].source_form).toEqual({ id: "form-1", name: "MO500" });
    });

    it("matches links by metadata.packet_definition_id and picks the latest", () => {
        const out = buildPosPacketReadModel({
            definitions: [def("p1")],
            items: [],
            forms: baseForms,
            links: [
                { id: "l1", token_prefix: "aaa", is_active: false, expires_at: null, created_at: "2026-06-01T00:00:00Z", last_used_at: null, metadata: { packet_definition_id: "p1" } },
                { id: "l2", token_prefix: "bbb", is_active: true, expires_at: null, created_at: "2026-06-10T00:00:00Z", last_used_at: null, metadata: { packet_definition_id: "p1" } },
                { id: "l3", token_prefix: "ccc", is_active: true, expires_at: null, created_at: "2026-06-05T00:00:00Z", last_used_at: null, metadata: { packet_definition_id: "OTHER" } },
            ],
            sessions: [],
        });
        expect(out[0].share_links.count).toBe(2); // l3 excluded (different packet)
        expect(out[0].share_links.active_count).toBe(1);
        expect(out[0].share_links.latest?.id).toBe("l2");
        expect(out[0].status).toBe("shared"); // active link, no session
    });

    it("derives status from the latest session and operator review", () => {
        const mk = (sessions: PosPacketReadModelInput["sessions"]) =>
            buildPosPacketReadModel({ definitions: [def("p1")], items: [], forms: baseForms, links: [], sessions })[0].status;

        expect(mk([{ id: "s1", packet_definition_id: "p1", status: "in_progress", operator_review_status: null, created_at: "2026-06-10T00:00:00Z", completed_at: null }])).toBe("in_progress");
        expect(mk([{ id: "s1", packet_definition_id: "p1", status: "completed", operator_review_status: "needs_review", created_at: "2026-06-10T00:00:00Z", completed_at: "2026-06-10T01:00:00Z" }])).toBe("submitted");
        expect(mk([{ id: "s1", packet_definition_id: "p1", status: "completed", operator_review_status: "approved", created_at: "2026-06-10T00:00:00Z", completed_at: "2026-06-10T01:00:00Z" }])).toBe("approved");
        expect(mk([{ id: "s1", packet_definition_id: "p1", status: "completed", operator_review_status: "needs_correction", created_at: "2026-06-10T00:00:00Z", completed_at: "2026-06-10T01:00:00Z" }])).toBe("needs_changes");
    });

    it("marks inactive definitions archived regardless of sessions", () => {
        const out = buildPosPacketReadModel({
            definitions: [def("p1", { is_active: false })],
            items: [],
            forms: baseForms,
            links: [{ id: "l1", token_prefix: "aaa", is_active: true, expires_at: null, created_at: "2026-06-01T00:00:00Z", last_used_at: null, metadata: { packet_definition_id: "p1" } }],
            sessions: [],
        });
        expect(out[0].status).toBe("archived");
    });

    it("returns definitions newest-first", () => {
        const out = buildPosPacketReadModel({
            definitions: [
                def("old", { created_at: "2026-06-01T00:00:00Z" }),
                def("new", { created_at: "2026-06-20T00:00:00Z" }),
            ],
            items: [],
            forms: baseForms,
            links: [],
            sessions: [],
        });
        expect(out.map((p) => p.packet_definition_id)).toEqual(["new", "old"]);
    });

    it("uses the latest session by created_at when several exist", () => {
        const out = buildPosPacketReadModel({
            definitions: [def("p1")],
            items: [],
            forms: baseForms,
            links: [],
            sessions: [
                { id: "s-old", packet_definition_id: "p1", status: "cancelled", operator_review_status: null, created_at: "2026-06-01T00:00:00Z", completed_at: null },
                { id: "s-new", packet_definition_id: "p1", status: "in_progress", operator_review_status: null, created_at: "2026-06-15T00:00:00Z", completed_at: null },
            ],
        });
        expect(out[0].sessions.count).toBe(2);
        expect(out[0].sessions.latest?.id).toBe("s-new");
        expect(out[0].status).toBe("in_progress");
    });
});
