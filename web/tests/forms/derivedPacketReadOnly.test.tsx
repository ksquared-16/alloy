/**
 * V0.5 FI-12 (OPWORK_2CEA84351D90_SPRINT_2A03D808C37E) — a requirement-derived packet is read-only
 * outside its derivation. The direct mutation routes refuse it from the STORED row; the composer
 * shows guidance to the owning Business Process stage; authored packets, the Forms permission gate,
 * the session lock and the canonical derivation/launch paths are unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";
const DERIVED = "33333333-3333-4333-8333-333333333333";
const AUTHORED = "44444444-4444-4444-8444-444444444444";
const FORM = "55555555-5555-4555-8555-555555555555";

const h = vi.hoisted(() => ({
    ctx: { ok: true, orgId: "11111111-1111-4111-8111-111111111111", userId: "u-1", role: "admin", permissionKeys: ["forms.author"] } as Record<string, unknown>,
    tables: {} as Record<string, Array<Record<string, unknown>>>,
    writes: [] as string[],
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: vi.fn(async () => h.ctx) };
});

/** PostgREST-shaped fake: eq filters, head counts, and a write log. */
vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => ({
        from(table: string) {
            const filters: Array<(r: Record<string, unknown>) => boolean> = [];
            let op: "select" | "update" | "delete" | "insert" = "select";
            let payload: unknown = null;
            let head = false;
            const rows = () => (h.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const result = () => {
                if (op === "update") {
                    const hit = rows().map((r) => Object.assign(r, payload as object));
                    return { data: hit[0] ?? null, error: hit[0] ? null : { code: "PGRST116", message: "no rows" } };
                }
                if (op === "insert") return { data: payload, error: null };
                if (op === "delete") return { data: null, error: null };
                return head ? { count: rows().length, data: null, error: null } : { data: rows(), error: null };
            };
            const api: Record<string, unknown> = {
                select: (_c?: string, o?: { head?: boolean }) => { if (o?.head) head = true; return api; },
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                order: () => api,
                limit: () => api,
                update: (p: unknown) => { op = "update"; payload = p; h.writes.push(`update:${table}`); return api; },
                delete: () => { op = "delete"; h.writes.push(`delete:${table}`); return api; },
                insert: (p: unknown) => { op = "insert"; payload = p; h.writes.push(`insert:${table}`); return api; },
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                single: async () => result(),
                then: (res: (v: unknown) => void) => res(result()),
            };
            return api;
        },
    }),
}));

import { PATCH } from "@/app/api/admin/forms/packet-definitions/[packetDefId]/route";
import { PUT } from "@/app/api/admin/forms/packet-definitions/[packetDefId]/items/route";
import { PacketBuilderWorkspaceLayout } from "@/components/forms/workspace/PacketBuilderWorkspaceLayout";
import { REQUIREMENT_DERIVED_PACKET_SOURCE } from "@/lib/enrollment/participantLaunch/requirementDerivedPacket";
import {
    DERIVED_PACKET_OWNER_HREF,
    DERIVED_PACKET_READ_ONLY_CODE,
    DERIVED_PACKET_SOURCE_MARKER,
    derivedPacketEditGuidance,
    derivedPacketMutationRefusal,
    derivedPacketOwner,
} from "@/lib/forms/packets/derivedPacketReadOnly";

const derivedMeta = {
    derived_from: "business_process_requirements",
    business_process_revision_id: "a32816b4-41c4-4848-9e6f-9e554fb73d58",
    process_key: "enrollment",
    stage_key: "enrolling",
    requirement_ids: ["req-1"],
    pos_connected: true,
};

function seed() {
    h.writes.length = 0;
    h.ctx = { ok: true, orgId: ORG, userId: "u-1", role: "admin", permissionKeys: ["forms.author"] };
    h.tables = {
        form_packet_definitions: [
            { id: DERIVED, org_id: ORG, key: "bp_rev_a32816b4_enrolling", name: "Enrollment", is_active: true, metadata: { ...derivedMeta } },
            { id: AUTHORED, org_id: ORG, key: "parent_packet", name: "Parent Packet", is_active: true, metadata: { created_via: "pos_packet_compose" } },
        ],
        form_packet_items: [],
        form_packet_sessions: [],
        form_definitions: [{ id: FORM, org_id: ORG }],
        form_definition_versions: [{ id: "v-1", org_id: ORG, form_definition_id: FORM, status: "published" }],
    };
}

const req = (method: string, body: unknown) =>
    new NextRequest("http://x/api", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const params = (id: string) => ({ params: Promise.resolve({ packetDefId: id }) });

describe("derived packet helper", () => {
    it("uses the canonical derivation marker", () => {
        expect(DERIVED_PACKET_SOURCE_MARKER).toBe(REQUIREMENT_DERIVED_PACKET_SOURCE);
    });

    it("names the owning stage; authored packets have no owner", () => {
        expect(derivedPacketOwner(derivedMeta)).toEqual({
            businessProcessRevisionId: derivedMeta.business_process_revision_id,
            processKey: "enrollment",
            stageKey: "enrolling",
        });
        expect(derivedPacketOwner({ created_via: "pos_packet_compose" })).toBeNull();
        expect(derivedPacketOwner(null)).toBeNull();
        expect(derivedPacketMutationRefusal({})).toBeNull();
        const g = derivedPacketEditGuidance(derivedPacketOwner(derivedMeta)!);
        expect(g).toContain("“enrolling” stage");
        expect(g).toContain("Organization › Processes");
        expect(g).toContain("Families already in progress keep the packet they started");
    });
});

describe("PATCH /api/admin/forms/packet-definitions/[id]", () => {
    beforeEach(seed);

    it("refuses a derived packet from the stored row — rename, deactivate or marker strip — and writes nothing", async () => {
        for (const body of [{ name: "Renamed" }, { is_active: false }, { metadata: {} }]) {
            const res = await PATCH(req("PATCH", body), params(DERIVED));
            expect(res.status).toBe(409);
            const j = await res.json();
            expect(j.code).toBe(DERIVED_PACKET_READ_ONLY_CODE);
            expect(j.edit_href).toBe(DERIVED_PACKET_OWNER_HREF);
            expect(j.owner.stageKey).toBe("enrolling");
        }
        expect(h.writes).toEqual([]);
        expect(h.tables.form_packet_definitions![0]!.metadata).toEqual(derivedMeta);
    });

    it("still updates an authored packet", async () => {
        const res = await PATCH(req("PATCH", { name: "Parent Packet v2" }), params(AUTHORED));
        expect(res.status).toBe(200);
        expect(h.writes).toEqual(["update:form_packet_definitions"]);
        expect(h.tables.form_packet_definitions![1]!.name).toBe("Parent Packet v2");
    });

    it("keeps the Forms permission gate first", async () => {
        h.ctx = { ...h.ctx, permissionKeys: [] };
        const res = await PATCH(req("PATCH", { name: "x" }), params(DERIVED));
        expect(res.status).toBe(403);
        expect(h.writes).toEqual([]);
    });

    it("404s an unknown packet", async () => {
        const res = await PATCH(req("PATCH", { name: "x" }), params("66666666-6666-4666-8666-666666666666"));
        expect(res.status).toBe(404);
    });
});

describe("PUT /api/admin/forms/packet-definitions/[id]/items", () => {
    beforeEach(seed);
    const body = { items: [{ form_definition_id: FORM }] };

    it("refuses replacing a derived packet's steps and touches no rows", async () => {
        const res = await PUT(req("PUT", body), params(DERIVED));
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe(DERIVED_PACKET_READ_ONLY_CODE);
        expect(h.writes).toEqual([]);
    });

    it("still replaces an authored packet's steps", async () => {
        const res = await PUT(req("PUT", body), params(AUTHORED));
        expect(res.status).toBe(200);
        expect(h.writes).toEqual(["delete:form_packet_items", "insert:form_packet_items"]);
    });

    it("keeps the existing session lock for authored packets", async () => {
        h.tables.form_packet_sessions = [{ id: "s-1", org_id: ORG, packet_definition_id: AUTHORED }];
        const res = await PUT(req("PUT", body), params(AUTHORED));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toContain("step list is locked");
        expect(h.writes).toEqual([]);
    });

    it("keeps the Forms permission gate first", async () => {
        h.ctx = { ...h.ctx, permissionKeys: [] };
        expect((await PUT(req("PUT", body), params(AUTHORED))).status).toBe(403);
    });
});

describe("Packet Composer layout", () => {
    const base = {
        packetDefId: DERIVED,
        defName: "Enrollment",
        defDesc: "",
        defActive: true,
        defKey: "bp_rev_a32816b4_enrolling",
        stepCount: 1,
        sessionCount: 2,
        allStepsPublished: true,
        savedItems: [{ id: "i-1", sequence_index: 0, form_definition_id: FORM, step_has_published_version: true, form_definitions: { name: "Enrollment Application" } }],
        steps: [{ form_definition_id: FORM, step_label: "" }],
        forms: [],
        recentPublishedForms: [],
        links: [],
        createdLink: null,
        busy: false,
        viewerTz: "America/Los_Angeles",
        onDefNameChange: () => {},
        onDefDescChange: () => {},
        onDefActiveChange: () => {},
        onSaveMeta: () => {},
        onStepsChange: () => {},
        onAddStep: () => {},
        onSaveSteps: () => {},
        onMoveStep: () => {},
        onRemoveStep: () => {},
        onMintLink: () => {},
        onToggleLink: () => {},
    };

    it("derived: guidance to the owning stage, the read-only form list, and no editors", () => {
        const html = renderToStaticMarkup(<PacketBuilderWorkspaceLayout {...base} derivedOwner={derivedPacketOwner(derivedMeta)} />);
        expect(html).toContain('data-testid="packet-derived-readonly"');
        expect(html).toContain(`href="${DERIVED_PACKET_OWNER_HREF}"`);
        expect(html).toContain("“enrolling” stage");
        expect(html).toContain('data-testid="packet-region-included-forms"');
        expect(html).not.toContain("Save overview");
        expect(html).not.toContain('data-testid="packet-region-steps"');
    });

    it("authored: overview and step editors as before", () => {
        const html = renderToStaticMarkup(<PacketBuilderWorkspaceLayout {...base} packetDefId={AUTHORED} />);
        expect(html).not.toContain('data-testid="packet-derived-readonly"');
        expect(html).toContain("Save overview");
        expect(html).toContain('data-testid="packet-region-steps"');
    });
});

describe("canonical derivation and launch are not routed through the refusal", () => {
    const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");
    it("derivation writes its own rows; launches mint through their own path", () => {
        for (const f of [
            "lib/enrollment/participantLaunch/requirementDerivedPacket.ts",
            "lib/enrollment/participantLaunch/launchParticipantEnrollment.ts",
            "lib/forms/packets/mintPacketPublicLinkForAdmin.ts",
        ]) {
            const src = read(f);
            expect(src, f).not.toContain("derivedPacketReadOnly");
            expect(src, f).not.toContain("/api/admin/forms/packet-definitions");
        }
    });

    it("the builder no longer saves a derived packet", () => {
        const src = read("app/adminV2/pos/ProcessingPacketBuilder.tsx");
        expect(src).toMatch(/const saveMeta = async \(\) => \{\s*if \(derivedOwner\)/);
        expect(src).toMatch(/const saveSteps = async \(\) => \{\s*if \(derivedOwner\)/);
    });
});
